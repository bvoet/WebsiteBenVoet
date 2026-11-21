// Shared audio engine: one AudioContext and the master bus.
// Every instrument gets its own FxRack (drive → delay / reverb → volume),
// so several instruments can play at once, each with its own effects.
//
//   instrument → rack.input → drive ┬─ dry ─────────────┬→ rack.out ─┐
//                                   ├─ delay (fb loop) ─┤            │
//                                   └─ reverb ──────────┘            │
//   (all racks) ─────────────────────────────────────────────────────┴→ bus → limiter → destination
//                                                                                   └→ analyser

export class AudioEngine {
  constructor() {
    this.ctx = null;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Create the graph (once, synchronously) and resume the context.
   * Must be called from a user gesture. Nodes can be scheduled immediately;
   * they start sounding as soon as the returned promise resolves.
   */
  start() {
    if (!this.ctx) this._build();
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  async stop() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));

    this.bus = ctx.createGain();

    // Limiter keeps resonant peaks and stacked voices/instruments in check.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;

    this.bus.connect(this.limiter).connect(ctx.destination);
    this.limiter.connect(this.analyser);

    // One shared white-noise buffer for every instrument.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  createRack() {
    return new FxRack(this);
  }
}

export class FxRack {
  constructor(engine) {
    const ctx = (this.ctx = engine.ctx);
    this.fx = { drive: 0, delayTime: 0.35, delayFeedback: 0.35, delayMix: 0, reverbSize: 2.5, reverbMix: 0, volume: 0.7 };
    this._reverbTimer = 0;
    this._builtSize = 0;

    this.input = ctx.createGain();

    // Drive (soft clip). The curve's small-signal gain is ~k; post-gain compensates.
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.drivePost = ctx.createGain();
    this.input.connect(this.shaper).connect(this.drivePost);
    const bus = this.drivePost;

    this.out = ctx.createGain();
    bus.connect(this.out);

    // Tape-ish delay: lowpass inside the feedback loop darkens each repeat.
    this.delay = ctx.createDelay(2.0);
    this.delayFb = ctx.createGain();
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 3500;
    this.delayWet = ctx.createGain();
    bus.connect(this.delay);
    this.delay.connect(this.delayTone).connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.out);

    // Reverb (convolver is created lazily: it costs CPU even when silent).
    this.reverb = null;
    this.reverbWet = ctx.createGain();
    this.reverbWet.connect(this.out);
    this._bus = bus;

    this.out.connect(engine.bus);
    for (const [k, v] of Object.entries(this.fx)) this.setFx(k, v, true);
  }

  setFx(name, value, immediate = false) {
    this.fx[name] = value;
    const t = this.ctx.currentTime;
    const ramp = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.02));

    switch (name) {
      case 'drive':
        if (value <= 0.001) {
          this.shaper.curve = null;
          ramp(this.drivePost.gain, 1);
        } else {
          this.shaper.curve = makeDriveCurve(value);
          ramp(this.drivePost.gain, 1 / (1 + value * 3));
        }
        break;
      case 'delayTime':
        this.delay.delayTime.setTargetAtTime(value, t, immediate ? 0.001 : 0.08);
        break;
      case 'delayFeedback':
        ramp(this.delayFb.gain, value);
        break;
      case 'delayMix':
        ramp(this.delayWet.gain, value);
        break;
      case 'reverbMix':
        ramp(this.reverbWet.gain, value * 1.2);
        this._ensureReverb();
        break;
      case 'reverbSize':
        // Regenerating an impulse is relatively expensive: debounce knob drags.
        clearTimeout(this._reverbTimer);
        this._reverbTimer = setTimeout(() => this._ensureReverb(true), immediate ? 0 : 150);
        break;
      case 'volume':
        ramp(this.out.gain, value * value);
        break;
    }
  }

  _ensureReverb(rebuild = false) {
    if (this.fx.reverbMix <= 0.001 && !this.reverb) return;
    if (!this.reverb) {
      this.reverb = this.ctx.createConvolver();
      this._bus.connect(this.reverb).connect(this.reverbWet);
      rebuild = true;
    }
    if (rebuild && this._builtSize !== this.fx.reverbSize) this._buildImpulse();
  }

  _buildImpulse() {
    const ctx = this.ctx;
    const seconds = this.fx.reverbSize;
    this._builtSize = seconds;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const fadeIn = Math.floor(ctx.sampleRate * 0.004);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 3.2);
        const fi = i < fadeIn ? i / fadeIn : 1;
        d[i] = (Math.random() * 2 - 1) * env * fi;
      }
    }
    this.reverb.buffer = buf;
  }
}

function makeDriveCurve(amount) {
  const n = 2048;
  const k = 1 + amount * 8;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
