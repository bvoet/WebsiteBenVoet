// FM-2: three-operator FM synth (two modulators → one carrier).
//
//   Stack:     M2 → M1 → Carrier → VCA          (deep, evolving timbres)
//   Parallel:  M1 ┐
//              M2 ┴→ Carrier → VCA              (two independent tone colours)
//
// Modulation depth is expressed as the classic FM index I: the modulator's
// peak frequency deviation is I × f_mod. A shared "mod envelope" shapes both
// indices over time — that's what makes FM bells ring and e-pianos bark.

import { Envelope } from '../engine/envelope.js';
import { fmt } from '../ui/format.js';
import { FX_PARAMS, VOICE_PARAMS } from './params.js';
import { VoiceSynth, BaseVoice } from './voice-synth.js';

const ratioFmt = (v) => `×${v.toFixed(2).replace(/\.?0+$/, '')}`;

export const PARAMS = {
  algorithm: { label: 'Algo', type: 'select', options: ['stack', 'parallel'], def: 'stack' },
  carWave: { label: 'Wave', type: 'select', options: ['sine', 'triangle'], def: 'sine' },
  carOct: { label: 'Octave', min: -2, max: 2, step: 1, def: 0, format: fmt.signed },

  m1Ratio: { label: 'Ratio', min: 0.5, max: 16, step: 0.5, def: 1, format: ratioFmt },
  m1Fine: { label: 'Fine', min: -100, max: 100, def: 0, bipolar: true, format: fmt.cents },
  m1Index: { label: 'Index', min: 0, max: 12, curve: 'pow', exp: 2, def: 2.5, format: (v) => v.toFixed(2) },

  m2Ratio: { label: 'Ratio', min: 0.5, max: 16, step: 0.5, def: 3, format: ratioFmt },
  m2Fine: { label: 'Fine', min: -100, max: 100, def: 0, bipolar: true, format: fmt.cents },
  m2Index: { label: 'Index', min: 0, max: 12, curve: 'pow', exp: 2, def: 0, format: (v) => v.toFixed(2) },

  mAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.002, format: fmt.time, kind: 'fader' },
  mDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 0.8, format: fmt.time, kind: 'fader' },
  mSustain: { label: 'S', min: 0, max: 1, def: 0.3, format: fmt.pct, kind: 'fader' },
  mRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.5, format: fmt.time, kind: 'fader' },

  aAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.003, format: fmt.time, kind: 'fader' },
  aDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 1.2, format: fmt.time, kind: 'fader' },
  aSustain: { label: 'S', min: 0, max: 1, def: 0.6, format: fmt.pct, kind: 'fader' },
  aRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.5, format: fmt.time, kind: 'fader' },

  velIndex: { label: 'Vel→Idx', min: 0, max: 1, def: 0.6, format: fmt.pct },
  vibRate: { label: 'Rate', min: 0.1, max: 12, curve: 'log', def: 5, format: fmt.hz },
  vibDepth: { label: 'Depth', min: 0, max: 1, curve: 'pow', exp: 2, def: 0, format: (v) => fmt.cents(v * 100) },

  ...VOICE_PARAMS,
  ...FX_PARAMS,
};

export const LAYOUT = [
  { title: 'Algorithm', keys: ['algorithm'] },
  { title: 'Carrier', keys: ['carWave', 'carOct'] },
  { title: 'Modulator 1', keys: ['m1Ratio', 'm1Fine', 'm1Index'] },
  { title: 'Modulator 2', keys: ['m2Ratio', 'm2Fine', 'm2Index'] },
  { title: 'Mod Env', keys: ['mAttack', 'mDecay', 'mSustain', 'mRelease'] },
  { title: 'Amp Env', keys: ['aAttack', 'aDecay', 'aSustain', 'aRelease'] },
  { title: 'Vibrato', keys: ['vibRate', 'vibDepth'] },
  { title: 'Voice', keys: ['voiceMode', 'glide', 'velocity', 'velIndex'] },
];

class FmVoice extends BaseVoice {
  constructor(synth, note, velocity, t) {
    super(synth, note, velocity, t);
    const ctx = this.ctx;
    this.car = this.source(ctx.createOscillator());
    this.m1 = this.source(ctx.createOscillator());
    this.m2 = this.source(ctx.createOscillator());
    this.m1Gain = ctx.createGain();
    this.m2Gain = ctx.createGain();
    this.m1Gain.gain.value = 0;
    this.m2Gain.gain.value = 0;
    this.vca = this.node(ctx.createGain());
    this.vca.gain.value = 0;

    this.m1.connect(this.m1Gain).connect(this.car.frequency);
    this.m2.connect(this.m2Gain);
    this.routeM2(synth.params.algorithm);
    this.car.connect(this.vca).connect(synth.out);

    for (const o of [this.car, this.m1, this.m2]) this.link(synth.pitchMod, o.detune);

    this.ampEnv = new Envelope(this.vca.gain, 0);
    this.m1Env = new Envelope(this.m1Gain.gain, 0);
    this.m2Env = new Envelope(this.m2Gain.gain, 0);

    this.applyWave();
    this.applyPitch(t, 0, true);
  }

  routeM2(algo) {
    try { this.m2Gain.disconnect(); } catch { /* first time */ }
    this.m2Gain.connect(algo === 'stack' ? this.m1.frequency : this.car.frequency);
  }

  get fc() {
    return this.freq * Math.pow(2, this.synth.params.carOct);
  }

  applyWave() {
    this.car.type = this.synth.params.carWave;
  }

  applyPitch(t, glide = 0, immediate = false) {
    const p = this.synth.params;
    const fc = this.fc;
    const set = (param, v) => {
      if (immediate) param.setValueAtTime(v, t);
      else param.setTargetAtTime(v, t, glide > 0 ? glide / 3 : 0.003);
    };
    set(this.car.frequency, fc);
    set(this.m1.frequency, fc * p.m1Ratio);
    set(this.m2.frequency, fc * p.m2Ratio);
    this.m1.detune.setValueAtTime(p.m1Fine, t);
    this.m2.detune.setValueAtTime(p.m2Fine, t);
  }

  trigger(t) {
    const p = this.synth.params;
    const vAmp = 1 - p.velocity + p.velocity * this.velocity;
    const vIdx = 1 - p.velIndex + p.velIndex * this.velocity;
    const modAdsr = { a: p.mAttack, d: p.mDecay, s: p.mSustain, r: p.mRelease };
    const fc = this.fc;
    // Peak deviation (Hz) = index × modulator frequency
    this.m1Env.trigger(t, modAdsr, p.m1Index * fc * p.m1Ratio * vIdx);
    this.m2Env.trigger(t, modAdsr, p.m2Index * fc * p.m2Ratio * vIdx);
    this.ampEnv.trigger(t, { a: p.aAttack, d: p.aDecay, s: p.aSustain, r: p.aRelease }, 0.3 * vAmp);
  }

  releaseEnvelopes(t) {
    this.m1Env.release(t);
    this.m2Env.release(t);
    return this.ampEnv.release(t);
  }

  killEnvelopes(t) {
    return this.ampEnv.kill(t);
  }
}

export class FmSynth extends VoiceSynth {
  constructor() {
    super(PARAMS);
  }

  build() {
    const ctx = this.ctx;
    this.vib = ctx.createOscillator();
    this.vibDepth = ctx.createGain();
    this.vib.connect(this.vibDepth).connect(this.pitchMod);
    this.vib.start();
  }

  createVoice(note, velocity, t) {
    return new FmVoice(this, note, velocity, t);
  }

  applyParam(name, immediate) {
    const t = this.ctx.currentTime;
    switch (name) {
      case 'algorithm':
        this.forEachVoice((v) => v.routeM2(this.params.algorithm));
        break;
      case 'carWave':
        this.forEachVoice((v) => v.applyWave());
        break;
      case 'carOct':
      case 'm1Ratio':
      case 'm1Fine':
      case 'm2Ratio':
      case 'm2Fine':
        this.forEachVoice((v) => v.applyPitch(t));
        break;
      case 'vibRate':
        this.vib.frequency.setTargetAtTime(this.params.vibRate, t, immediate ? 0.001 : 0.02);
        break;
      case 'vibDepth':
        this.applyModWheel(immediate);
        break;
      // Indices and envelopes apply from the next note.
    }
  }

  applyModWheel(immediate = false) {
    const cents = this.params.vibDepth * 100 + this.modWheel * 60;
    this.vibDepth.gain.setTargetAtTime(cents, this.ctx.currentTime, immediate ? 0.001 : 0.02);
  }
}

export const PRESETS = [
  { name: 'Init', patch: {} },
  {
    name: 'Tine E.Piano',
    patch: {
      algorithm: 'parallel', m1Ratio: 1, m1Index: 1.8, m2Ratio: 14, m2Index: 0.6,
      mAttack: 0.001, mDecay: 0.9, mSustain: 0.1, mRelease: 0.4,
      aAttack: 0.002, aDecay: 2.5, aSustain: 0.25, aRelease: 0.5,
      velIndex: 0.85, vibRate: 4.5, delayMix: 0.12, reverbMix: 0.22,
    },
  },
  {
    name: 'Crystal Bell',
    patch: {
      algorithm: 'parallel', m1Ratio: 3.5, m1Fine: 8, m1Index: 3.2, m2Ratio: 7, m2Index: 1.2,
      mAttack: 0.001, mDecay: 2.2, mSustain: 0.05, mRelease: 2,
      aAttack: 0.001, aDecay: 4, aSustain: 0, aRelease: 3, reverbMix: 0.45, reverbSize: 4.5,
    },
  },
  {
    name: 'Exotica Marimba',
    patch: {
      algorithm: 'parallel', carOct: 0, m1Ratio: 4, m1Index: 2.4, m2Ratio: 10, m2Index: 0.5,
      mAttack: 0.001, mDecay: 0.08, mSustain: 0, mRelease: 0.05,
      aAttack: 0.001, aDecay: 0.55, aSustain: 0, aRelease: 0.35,
      velIndex: 0.7, delayMix: 0.18, delayTime: 0.33, reverbMix: 0.3,
    },
  },
  {
    name: 'FM Bass',
    patch: {
      algorithm: 'stack', carOct: -1, m1Ratio: 1, m1Index: 4.5, m2Ratio: 1, m2Index: 0.8,
      mAttack: 0.001, mDecay: 0.25, mSustain: 0.2, mRelease: 0.1,
      aAttack: 0.001, aDecay: 0.6, aSustain: 0.7, aRelease: 0.1,
      voiceMode: 'mono', glide: 0.03, reverbMix: 0, drive: 0.15,
    },
  },
  {
    name: 'Brass Section',
    patch: {
      algorithm: 'stack', m1Ratio: 1, m1Index: 3.6, m2Ratio: 1, m2Index: 0.4,
      mAttack: 0.08, mDecay: 0.6, mSustain: 0.6, mRelease: 0.3,
      aAttack: 0.05, aDecay: 0.4, aSustain: 0.85, aRelease: 0.3, vibRate: 5.5, vibDepth: 0.25, reverbMix: 0.2,
    },
  },
  {
    name: 'Metal Gong',
    patch: {
      algorithm: 'stack', carOct: -1, m1Ratio: 1.5, m1Fine: 37, m1Index: 6, m2Ratio: 4.5, m2Index: 2.5,
      mAttack: 0.003, mDecay: 3.5, mSustain: 0.2, mRelease: 4,
      aAttack: 0.002, aDecay: 6, aSustain: 0, aRelease: 5, reverbMix: 0.5, reverbSize: 7,
    },
  },
  {
    name: 'Wood Flute',
    patch: {
      algorithm: 'parallel', carWave: 'triangle', m1Ratio: 1, m1Index: 0.4, m2Ratio: 2, m2Index: 0.25,
      mAttack: 0.1, mDecay: 0.5, mSustain: 0.7, aAttack: 0.08, aDecay: 0.3, aSustain: 0.9, aRelease: 0.3,
      vibRate: 4.8, vibDepth: 0.3, voiceMode: 'mono', glide: 0.05, reverbMix: 0.35,
    },
  },
];

export default {
  id: 'fm2',
  model: 'FM-2',
  name: 'FM',
  subtitle: 'Frequency Modulation Synthesizer',
  PARAMS,
  LAYOUT,
  PRESETS,
  create: () => new FmSynth(),
};
