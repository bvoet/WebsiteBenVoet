// WT-4: draw-your-own wavetable synth.
//
// Two hand-drawn single-cycle waves (A and B, 64 points each) are converted
// to band-limited PeriodicWaves via a DFT (32 harmonics, so no aliasing).
// Each voice runs oscillator A and B in phase and crossfades between them:
// because they share frequency and phase, a crossfade *is* a linear
// interpolation between the two waveforms — i.e. wavetable morphing.
//
//   morph = knob + morph-env × amount + LFO × depth
//   oscA ─► gA (1 − morph) ┐
//   oscB ─► gB (morph)     ┴─► lowpass ─► VCA ─► out

import { Envelope } from '../engine/envelope.js';
import { fmt } from '../ui/format.js';
import { FX_PARAMS, VOICE_PARAMS } from './params.js';
import { VoiceSynth, BaseVoice } from './voice-synth.js';

export const WAVE_POINTS = 64;

const shape = (fn) => Array.from({ length: WAVE_POINTS }, (_, i) => Math.round(fn(i / WAVE_POINTS) * 1000) / 1000);
export const SHAPES = {
  sine: shape((x) => Math.sin(2 * Math.PI * x)),
  triangle: shape((x) => (x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4)),
  saw: shape((x) => (x < 0.5 ? 2 * x : 2 * x - 2)),
  square: shape((x) => (x < 0.5 ? 0.8 : -0.8)),
  pulse: shape((x) => (x < 0.15 ? 0.8 : -0.3)),
  organ: shape((x) => 0.6 * Math.sin(2 * Math.PI * x) + 0.3 * Math.sin(6 * Math.PI * x) + 0.2 * Math.sin(10 * Math.PI * x)),
  formant: shape((x) => Math.sin(2 * Math.PI * x) * Math.sin(2 * Math.PI * 5 * x) * (1 - x)),
};

export const PARAMS = {
  waveA: { label: 'Wave A', type: 'wave', def: SHAPES.sine },
  waveB: { label: 'Wave B', type: 'wave', def: SHAPES.saw },
  octave: { label: 'Octave', min: -2, max: 2, step: 1, def: 0, format: fmt.signed },
  detune: { label: 'Fine', min: -50, max: 50, def: 0, bipolar: true, format: fmt.cents },

  morph: { label: 'Morph', min: 0, max: 1, def: 0, format: (v) => `A${Math.round((1 - v) * 100)}/B${Math.round(v * 100)}`, size: 'lg' },
  morphEnv: { label: 'Env Amt', min: -1, max: 1, def: 0.6, bipolar: true, format: fmt.signedPct },
  morphLfoRate: { label: 'LFO Rate', min: 0.05, max: 15, curve: 'log', def: 0.5, format: fmt.hz },
  morphLfoDepth: { label: 'LFO Dpth', min: 0, max: 0.5, def: 0, format: fmt.pct },

  mAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.6, format: fmt.time, kind: 'fader' },
  mDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 1.5, format: fmt.time, kind: 'fader' },
  mSustain: { label: 'S', min: 0, max: 1, def: 0.5, format: fmt.pct, kind: 'fader' },
  mRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.6, format: fmt.time, kind: 'fader' },

  cutoff: { label: 'Cutoff', min: 60, max: 18000, curve: 'log', def: 9000, format: fmt.hz },
  resonance: { label: 'Reso', min: 0, max: 1, def: 0.1, format: fmt.pct },

  aAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.01, format: fmt.time, kind: 'fader' },
  aDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 0.5, format: fmt.time, kind: 'fader' },
  aSustain: { label: 'S', min: 0, max: 1, def: 0.8, format: fmt.pct, kind: 'fader' },
  aRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.5, format: fmt.time, kind: 'fader' },

  ...VOICE_PARAMS,
  ...FX_PARAMS,
};

export const LAYOUT = [
  { title: 'Wave A', keys: ['waveA'] },
  { title: 'Wave B', keys: ['waveB'] },
  { title: 'Morph', keys: ['morph', 'morphEnv', 'morphLfoRate', 'morphLfoDepth'] },
  { title: 'Morph Env', keys: ['mAttack', 'mDecay', 'mSustain', 'mRelease'] },
  { title: 'Pitch & Filter', keys: ['octave', 'detune', 'cutoff', 'resonance'] },
  { title: 'Amp Env', keys: ['aAttack', 'aDecay', 'aSustain', 'aRelease'] },
  { title: 'Voice', keys: ['voiceMode', 'glide', 'velocity'] },
];

/** 64 time-domain points → PeriodicWave (32 harmonics) via DFT. */
export function waveToPeriodic(ctx, points) {
  const N = points.length;
  const H = N / 2;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  let energy = 0;
  for (let k = 1; k <= H; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const a = (2 * Math.PI * k * n) / N;
      re += points[n] * Math.cos(a);
      im += points[n] * Math.sin(a);
    }
    // Gentle roll-off of the top harmonics smooths the drawn "staircase".
    const smooth = k > H * 0.75 ? 1 - (k - H * 0.75) / (H * 0.25 + 1) : 1;
    real[k] = ((2 * re) / N) * smooth;
    imag[k] = ((2 * im) / N) * smooth;
    energy += real[k] * real[k] + imag[k] * imag[k];
  }
  if (energy < 1e-8) imag[1] = 1e-4; // flat line → near-silent, still valid
  return ctx.createPeriodicWave(real, imag);
}

class WtVoice extends BaseVoice {
  constructor(synth, note, velocity, t) {
    super(synth, note, velocity, t);
    const ctx = this.ctx;
    this.oscA = this.source(ctx.createOscillator());
    this.oscB = this.source(ctx.createOscillator());
    this.envSrc = this.source(ctx.createConstantSource());
    this.envSrc.offset.value = 0;

    this.gA = ctx.createGain();
    this.gB = ctx.createGain();
    this.gA.gain.value = 1;
    this.gB.gain.value = 0;
    this.inv = ctx.createGain();
    this.inv.gain.value = -1;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.vca = this.node(ctx.createGain());
    this.vca.gain.value = 0;

    this.oscA.connect(this.gA).connect(this.filter);
    this.oscB.connect(this.gB).connect(this.filter);
    this.filter.connect(this.vca).connect(synth.out);

    // morph control → gB directly, and through the inverter → gA
    this.inv.connect(this.gA.gain);
    this.envSrc.connect(this.gB.gain);
    this.envSrc.connect(this.inv);
    this.link(synth.morphMod, this.gB.gain);
    this.link(synth.morphMod, this.inv);

    this.link(synth.pitchMod, this.oscA.detune);
    this.link(synth.pitchMod, this.oscB.detune);

    this.ampEnv = new Envelope(this.vca.gain, 0);
    this.morphEnv = new Envelope(this.envSrc.offset, 0);

    this.applyWaves();
    this.applyPitch(t, 0, true);
    this.applyFilter(t, true);
  }

  applyWaves() {
    this.oscA.setPeriodicWave(this.synth.waveA);
    this.oscB.setPeriodicWave(this.synth.waveB);
  }

  applyPitch(t, glide = 0, immediate = false) {
    const p = this.synth.params;
    const f = this.freq * Math.pow(2, p.octave);
    for (const o of [this.oscA, this.oscB]) {
      if (immediate) o.frequency.setValueAtTime(f, t);
      else o.frequency.setTargetAtTime(f, t, glide > 0 ? glide / 3 : 0.003);
      o.detune.setValueAtTime(p.detune, t);
    }
  }

  applyFilter(t, immediate = false) {
    const p = this.synth.params;
    const cutoff = Math.min(20000, p.cutoff * Math.pow(this.freq / 261.63, 0.5));
    if (immediate) this.filter.frequency.setValueAtTime(cutoff, t);
    else this.filter.frequency.setTargetAtTime(cutoff, t, 0.01);
    this.filter.Q.setValueAtTime(-3 + p.resonance * 24, t);
  }

  setNote(note, glide, t) {
    super.setNote(note, glide, t);
    this.applyFilter(t);
  }

  trigger(t) {
    const p = this.synth.params;
    const vel = 1 - p.velocity + p.velocity * this.velocity;
    this.ampEnv.trigger(t, { a: p.aAttack, d: p.aDecay, s: p.aSustain, r: p.aRelease }, 0.3 * vel);
    this.morphEnv.trigger(t, { a: p.mAttack, d: p.mDecay, s: p.mSustain, r: p.mRelease }, p.morphEnv);
  }

  releaseEnvelopes(t) {
    this.morphEnv.release(t);
    return this.ampEnv.release(t);
  }

  killEnvelopes(t) {
    return this.ampEnv.kill(t);
  }
}

export class WavetableSynth extends VoiceSynth {
  constructor() {
    super(PARAMS);
    this._queued = new Set();
  }

  build() {
    const ctx = this.ctx;
    this.morphBase = ctx.createConstantSource();
    this.morphLfo = ctx.createOscillator();
    this.morphLfo.type = 'triangle';
    this.morphLfoDepth = ctx.createGain();
    this.morphMod = ctx.createGain();
    this.morphBase.connect(this.morphMod);
    this.morphLfo.connect(this.morphLfoDepth).connect(this.morphMod);
    this.morphBase.start();
    this.morphLfo.start();

    this.vib = ctx.createGain(); // mod wheel vibrato
    this.vibLfo = ctx.createOscillator();
    this.vibLfo.frequency.value = 5.5;
    this.vibLfo.connect(this.vib).connect(this.pitchMod);
    this.vib.gain.value = 0;
    this.vibLfo.start();

    this.waveA = waveToPeriodic(ctx, this.params.waveA);
    this.waveB = waveToPeriodic(ctx, this.params.waveB);
  }

  createVoice(note, velocity, t) {
    return new WtVoice(this, note, velocity, t);
  }

  _queueWave(key) {
    if (this._queued.has(key)) return;
    this._queued.add(key);
    requestAnimationFrame(() => {
      this._queued.delete(key);
      this[key] = waveToPeriodic(this.ctx, this.params[key]);
      this.forEachVoice((v) => v.applyWaves());
    });
  }

  applyParam(name, immediate) {
    const p = this.params;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.001 : 0.02;
    switch (name) {
      case 'waveA':
      case 'waveB':
        if (immediate) this[name] = waveToPeriodic(this.ctx, p[name]);
        else this._queueWave(name);
        break;
      case 'octave':
      case 'detune':
        this.forEachVoice((v) => v.applyPitch(t));
        break;
      case 'cutoff':
      case 'resonance':
        this.forEachVoice((v) => v.applyFilter(t));
        break;
      case 'morph':
        this.morphBase.offset.setTargetAtTime(p.morph, t, tc);
        break;
      case 'morphLfoRate':
        this.morphLfo.frequency.setTargetAtTime(p.morphLfoRate, t, tc);
        break;
      case 'morphLfoDepth':
        this.morphLfoDepth.gain.setTargetAtTime(p.morphLfoDepth, t, tc);
        break;
    }
  }

  applyModWheel() {
    this.vib.gain.setTargetAtTime(this.modWheel * 60, this.ctx.currentTime, 0.02);
  }
}

export const PRESETS = [
  { name: 'Init', patch: {} },
  { name: 'Sine → Saw Swell', patch: { morph: 0, morphEnv: 1, mAttack: 1.5, mDecay: 2, mSustain: 0.7, aAttack: 0.3, aRelease: 1.2, reverbMix: 0.35 } },
  { name: 'Formant Talk', patch: { waveA: SHAPES.organ, waveB: SHAPES.formant, morph: 0.3, morphEnv: 0, morphLfoRate: 2.2, morphLfoDepth: 0.35, voiceMode: 'mono', glide: 0.08, delayMix: 0.2 } },
  { name: 'Pulse Pluck', patch: { waveA: SHAPES.pulse, waveB: SHAPES.sine, morph: 0, morphEnv: 1, mAttack: 0.001, mDecay: 0.25, mSustain: 0, aAttack: 0.001, aDecay: 0.6, aSustain: 0, aRelease: 0.4, delayMix: 0.3, delayTime: 0.25, reverbMix: 0.25 } },
  { name: 'Square Organ Sweep', patch: { waveA: SHAPES.square, waveB: SHAPES.organ, morph: 0.5, morphEnv: 0, morphLfoRate: 0.25, morphLfoDepth: 0.5, aAttack: 0.02, aSustain: 1, aRelease: 0.3, reverbMix: 0.3 } },
  { name: 'Tri Bass', patch: { waveA: SHAPES.triangle, waveB: SHAPES.saw, octave: -1, morph: 0, morphEnv: 0.5, mAttack: 0.001, mDecay: 0.2, mSustain: 0.1, cutoff: 2500, aAttack: 0.002, aSustain: 0.9, aRelease: 0.1, voiceMode: 'mono', glide: 0.03, reverbMix: 0 } },
];

export default {
  id: 'wt4',
  model: 'WT-4',
  name: 'Wavetable',
  subtitle: 'Wavetable Synthesizer · Draw Your Own',
  PARAMS,
  LAYOUT,
  PRESETS,
  create: () => new WavetableSynth(),
};
