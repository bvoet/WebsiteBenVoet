// Shared audio engine: one AudioContext, an FX rack and the master bus.
// Instruments connect to `engine.input`.
//
//   input → drive → ┬─ dry ───────────────┬→ limiter → master → destination
//                   ├─ delay (fb loop) ───┤                    └→ analyser
//                   └─ reverb (convolver) ┘

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.fx = { drive: 0, delayTime: 0.35, delayFeedback: 0.35, delayMix: 0, reverbSize: 2.5, reverbMix: 0, volume: 0.7 };
    this._reverbTimer = 0;
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

    this.input = ctx.createGain();

    // Drive (soft clip). Pre-gain pushes into the curve, post-gain compensates.
    this.drivePre = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.drivePost = ctx.createGain();
    this.input.connect(this.drivePre).connect(this.shaper).connect(this.drivePost);

    const bus = this.drivePost;

    // Sum of dry + wet signals
    this.sum = ctx.createGain();
    bus.connect(this.sum);

    // Tape-ish delay: lowpass inside the feedback loop darkens each repeat.
    this.delay = ctx.createDelay(2.0);
    this.delayFb = ctx.createGain();
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 3500;
    this.delayWet = ctx.createGain();
    bus.connect(this.delay);
    this.delay.connect(this.delayTone).connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.sum);

    // Reverb
    this.reverb = ctx.createConvolver();
    this.reverbWet = ctx.createGain();
    bus.connect(this.reverb).connect(this.reverbWet).connect(this.sum);

    // Limiter keeps resonant peaks and stacked voices in check.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;

    this.sum.connect(this.limiter).connect(this.master).connect(ctx.destination);
    this.master.connect(this.analyser);

    for (const [k, v] of Object.entries(this.fx)) this.setFx(k, v, true);
    this._buildImpulse();
  }

  setFx(name, value, immediate = false) {
    this.fx[name] = value;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ramp = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.02));

    switch (name) {
      case 'drive': {
        if (value <= 0.001) {
          this.shaper.curve = null;
          ramp(this.drivePre.gain, 1);
          ramp(this.drivePost.gain, 1);
        } else {
          // Curve gain at small signals is ~k, so the post-gain roughly
          // compensates and leaves a modest loudness bump, like a real drive.
          this.shaper.curve = makeDriveCurve(value);
          ramp(this.drivePre.gain, 1);
          ramp(this.drivePost.gain, 1 / (1 + value * 3));
        }
        break;
      }
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
        break;
      case 'reverbSize':
        // Regenerating an impulse is relatively expensive: debounce knob drags.
        clearTimeout(this._reverbTimer);
        this._reverbTimer = setTimeout(() => this._buildImpulse(), immediate ? 0 : 150);
        break;
      case 'volume':
        ramp(this.master.gain, value * value);
        break;
    }
  }

  _buildImpulse() {
    const ctx = this.ctx;
    const seconds = this.fx.reverbSize;
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
