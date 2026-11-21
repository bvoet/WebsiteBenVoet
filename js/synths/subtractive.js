// SL-1: a two-oscillator subtractive synth.
//
// Per voice:  osc1 ┐
//             osc2 ┼→ mixer → filter (12/24 dB) → VCA → out
//             noise┘            ↑ env + LFO        ↑ amp env
//
// Shared:     LFO → pitch / filter / amp depth gains, pitch bend, tremolo.

import { Envelope } from '../engine/envelope.js';
import { fmt } from '../ui/format.js';
import { FX_PARAMS, VOICE_PARAMS } from './params.js';
import { VoiceSynth, BaseVoice } from './voice-synth.js';

const FILTER_ENV_CENTS = 6000; // full env amount = ±5 octaves
const LFO_FILTER_CENTS = 4800;

export const PARAMS = {
  // Oscillators
  osc1Wave: { label: 'Wave', type: 'select', options: ['sawtooth', 'square', 'triangle', 'sine'], def: 'sawtooth' },
  osc1Oct: { label: 'Octave', min: -2, max: 2, step: 1, def: 0, format: fmt.signed },
  osc2Wave: { label: 'Wave', type: 'select', options: ['sawtooth', 'square', 'triangle', 'sine'], def: 'sawtooth' },
  osc2Oct: { label: 'Octave', min: -2, max: 2, step: 1, def: 0, format: fmt.signed },
  osc2Semi: { label: 'Semi', min: -12, max: 12, step: 1, def: 0, bipolar: true, format: fmt.semis },
  osc2Fine: { label: 'Fine', min: -50, max: 50, def: 7, bipolar: true, format: fmt.cents },

  // Mixer
  osc1Level: { label: 'Osc 1', min: 0, max: 1, def: 0.8, format: fmt.pct },
  osc2Level: { label: 'Osc 2', min: 0, max: 1, def: 0.6, format: fmt.pct },
  noiseLevel: { label: 'Noise', min: 0, max: 1, def: 0, format: fmt.pct },

  // Filter
  filterType: { label: 'Type', type: 'select', options: ['lowpass', 'highpass', 'bandpass'], def: 'lowpass' },
  filterSlope: { label: 'Slope', type: 'select', options: ['12', '24'], def: '24' },
  cutoff: { label: 'Cutoff', min: 30, max: 18000, curve: 'log', def: 2200, format: fmt.hz, size: 'lg' },
  resonance: { label: 'Reso', min: 0, max: 1, def: 0.2, format: fmt.pct },
  envAmount: { label: 'Env Amt', min: -1, max: 1, def: 0.35, bipolar: true, format: fmt.signedPct },
  keyTrack: { label: 'Key Trk', min: 0, max: 1, def: 0.5, format: fmt.pct },

  // Filter envelope
  fAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.005, format: fmt.time, kind: 'fader' },
  fDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 0.4, format: fmt.time, kind: 'fader' },
  fSustain: { label: 'S', min: 0, max: 1, def: 0.3, format: fmt.pct, kind: 'fader' },
  fRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.4, format: fmt.time, kind: 'fader' },

  // Amp envelope
  aAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.004, format: fmt.time, kind: 'fader' },
  aDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 0.3, format: fmt.time, kind: 'fader' },
  aSustain: { label: 'S', min: 0, max: 1, def: 0.8, format: fmt.pct, kind: 'fader' },
  aRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.35, format: fmt.time, kind: 'fader' },

  // LFO
  lfoWave: { label: 'Wave', type: 'select', options: ['sine', 'triangle', 'sawtooth', 'square'], def: 'sine' },
  lfoRate: { label: 'Rate', min: 0.05, max: 25, curve: 'log', def: 5, format: fmt.hz },
  lfoPitch: { label: '→ Pitch', min: 0, max: 1, def: 0, curve: 'pow', exp: 2, format: (v) => fmt.cents(v * 1200) },
  lfoFilter: { label: '→ Filter', min: 0, max: 1, def: 0, format: fmt.pct },
  lfoAmp: { label: '→ Amp', min: 0, max: 1, def: 0, format: fmt.pct },

  ...VOICE_PARAMS,
  ...FX_PARAMS,
};

export const LAYOUT = [
  { title: 'Oscillator 1', keys: ['osc1Wave', 'osc1Oct'] },
  { title: 'Oscillator 2', keys: ['osc2Wave', 'osc2Oct', 'osc2Semi', 'osc2Fine'] },
  { title: 'Mixer', keys: ['osc1Level', 'osc2Level', 'noiseLevel'] },
  { title: 'Filter', keys: ['filterType', 'filterSlope', 'cutoff', 'resonance', 'envAmount', 'keyTrack'], wide: true },
  { title: 'Filter Env', keys: ['fAttack', 'fDecay', 'fSustain', 'fRelease'] },
  { title: 'Amp Env', keys: ['aAttack', 'aDecay', 'aSustain', 'aRelease'] },
  { title: 'LFO', keys: ['lfoWave', 'lfoRate', 'lfoPitch', 'lfoFilter', 'lfoAmp'] },
  { title: 'Voice', keys: ['voiceMode', 'glide', 'velocity'] },
];

// ─── Voice ────────────────────────────────────────────────────────────────

class Voice extends BaseVoice {
  constructor(synth, note, velocity, t) {
    super(synth, note, velocity, t);
    const ctx = this.ctx;

    this.osc1 = this.source(ctx.createOscillator());
    this.osc2 = this.source(ctx.createOscillator());
    this.noise = ctx.createBufferSource();
    this.noise.buffer = synth.engine.noiseBuffer;
    this.noise.loop = true;
    this.noiseOffset = Math.random() * 1.5;

    this.g1 = ctx.createGain();
    this.g2 = ctx.createGain();
    this.gn = ctx.createGain();
    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();

    // Filter envelope drives a constant source summed into both filters' detune.
    this.fEnvSrc = this.source(ctx.createConstantSource());
    this.fEnvSrc.offset.value = 0;

    this.vca = this.node(ctx.createGain());
    this.vca.gain.value = 0;

    this.osc1.connect(this.g1).connect(this.f1);
    this.osc2.connect(this.g2).connect(this.f1);
    this.noise.connect(this.gn).connect(this.f1);
    this.f1.connect(this.f2).connect(this.vca).connect(synth.voiceBus);

    this.link(synth.pitchMod, this.osc1.detune);
    this.link(synth.pitchMod, this.osc2.detune);
    this.link(synth.filterMod, this.f1.detune);
    this.link(synth.filterMod, this.f2.detune);
    this.fEnvSrc.connect(this.f1.detune);
    this.fEnvSrc.connect(this.f2.detune);

    this.ampEnv = new Envelope(this.vca.gain, 0);
    this.filterEnv = new Envelope(this.fEnvSrc.offset, 0);

    this.applyAll(t);
  }

  startSources(t) {
    super.startSources(t);
    this.noise.start(t, this.noiseOffset);
  }

  dispose() {
    try { this.noise.stop(); } catch { /* not started */ }
    this.noise.disconnect();
    super.dispose();
  }

  trigger(t) {
    const p = this.synth.params;
    const vel = 1 - p.velocity + p.velocity * this.velocity;
    this.ampEnv.trigger(t, { a: p.aAttack, d: p.aDecay, s: p.aSustain, r: p.aRelease }, 0.32 * vel);
    this.filterEnv.trigger(
      t,
      { a: p.fAttack, d: p.fDecay, s: p.fSustain, r: p.fRelease },
      p.envAmount * FILTER_ENV_CENTS * (0.5 + 0.5 * vel),
    );
  }

  releaseEnvelopes(t) {
    const end = this.ampEnv.release(t);
    this.filterEnv.release(t);
    return end;
  }

  killEnvelopes(t) {
    return this.ampEnv.kill(t);
  }

  setNote(note, glide, t) {
    super.setNote(note, glide, t);
    this.applyFilter(t);
  }

  applyPitch(t, glide = 0, immediate = false) {
    const p = this.synth.params;
    const f1 = this.freq * Math.pow(2, p.osc1Oct);
    const f2 = this.freq * Math.pow(2, p.osc2Oct + p.osc2Semi / 12);
    for (const [osc, f] of [[this.osc1, f1], [this.osc2, f2]]) {
      if (immediate) osc.frequency.setValueAtTime(f, t);
      else if (glide > 0) osc.frequency.setTargetAtTime(f, t, glide / 3);
      else osc.frequency.setTargetAtTime(f, t, 0.003);
    }
    if (immediate) this.osc2.detune.setValueAtTime(p.osc2Fine, t);
    else this.osc2.detune.setTargetAtTime(p.osc2Fine, t, 0.01);
  }

  applyFilter(t, immediate = false) {
    const p = this.synth.params;
    const track = Math.pow(this.freq / 261.63, p.keyTrack);
    const cutoff = Math.min(20000, Math.max(20, p.cutoff * track));
    const lpHp = p.filterType !== 'bandpass';
    // Biquad Q is in dB for lowpass/highpass, linear for bandpass.
    const q1 = lpHp ? -3 + p.resonance * 27 : 0.6 + p.resonance * p.resonance * 30;
    const q2 = lpHp ? -3 : 0.7;
    const is24 = p.filterSlope === '24';

    this.f1.type = p.filterType;
    this.f2.type = is24 ? p.filterType : 'allpass';
    for (const f of [this.f1, this.f2]) {
      if (immediate) f.frequency.setValueAtTime(cutoff, t);
      else f.frequency.setTargetAtTime(cutoff, t, 0.01);
    }
    this.f1.Q.setValueAtTime(q1, t);
    this.f2.Q.setValueAtTime(is24 ? q2 : 0.7, t);
  }

  applyMix(t, immediate = false) {
    const p = this.synth.params;
    const set = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.01));
    set(this.g1.gain, p.osc1Level);
    set(this.g2.gain, p.osc2Level);
    set(this.gn.gain, p.noiseLevel * 0.7);
  }

  applyWaves() {
    const p = this.synth.params;
    this.osc1.type = p.osc1Wave;
    this.osc2.type = p.osc2Wave;
  }

  applyAll(t) {
    this.applyWaves();
    this.applyPitch(t, 0, true);
    this.applyFilter(t, true);
    this.applyMix(t, true);
  }
}

// ─── Synth ────────────────────────────────────────────────────────────────

export class SubtractiveSynth extends VoiceSynth {
  constructor() {
    super(PARAMS);
  }

  build() {
    const ctx = this.ctx;
    this.voiceBus = ctx.createGain();
    this.tremolo = ctx.createGain();
    this.voiceBus.connect(this.tremolo).connect(this.out);

    this.lfo = ctx.createOscillator();
    this.lfoPitchDepth = ctx.createGain();
    this.lfoFilterDepth = ctx.createGain();
    this.lfoAmpDepth = ctx.createGain();
    this.lfo.connect(this.lfoPitchDepth);
    this.lfo.connect(this.lfoFilterDepth);
    this.lfo.connect(this.lfoAmpDepth).connect(this.tremolo.gain);
    this.lfo.start();

    this.filterMod = ctx.createGain();
    this.lfoPitchDepth.connect(this.pitchMod);
    this.lfoFilterDepth.connect(this.filterMod);
  }

  createVoice(note, velocity, t) {
    return new Voice(this, note, velocity, t);
  }

  applyParam(name, immediate) {
    const p = this.params;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.001 : 0.02;
    switch (name) {
      case 'osc1Wave':
      case 'osc2Wave':
        this.forEachVoice((v) => v.applyWaves());
        break;
      case 'osc1Oct':
      case 'osc2Oct':
      case 'osc2Semi':
      case 'osc2Fine':
        this.forEachVoice((v) => v.applyPitch(t));
        break;
      case 'osc1Level':
      case 'osc2Level':
      case 'noiseLevel':
        this.forEachVoice((v) => v.applyMix(t));
        break;
      case 'filterType':
      case 'filterSlope':
      case 'cutoff':
      case 'resonance':
      case 'keyTrack':
        this.forEachVoice((v) => v.applyFilter(t));
        break;
      case 'lfoWave':
        this.lfo.type = p.lfoWave;
        break;
      case 'lfoRate':
        this.lfo.frequency.setTargetAtTime(p.lfoRate, t, tc);
        break;
      case 'lfoPitch':
        this.applyModWheel(immediate);
        break;
      case 'lfoFilter':
        this.lfoFilterDepth.gain.setTargetAtTime(p.lfoFilter * LFO_FILTER_CENTS, t, tc);
        break;
      case 'lfoAmp': {
        const d = p.lfoAmp / 2;
        this.lfoAmpDepth.gain.setTargetAtTime(d, t, tc);
        this.tremolo.gain.setTargetAtTime(1 - d, t, tc);
        break;
      }
      // Envelopes, glide, velocity and env amount apply from the next note.
    }
  }

  applyModWheel(immediate = false) {
    const cents = this.params.lfoPitch * 1200 + this.modWheel * 60;
    this.lfoPitchDepth.gain.setTargetAtTime(cents, this.ctx.currentTime, immediate ? 0.001 : 0.02);
  }
}

// ─── Factory presets ──────────────────────────────────────────────────────

export const PRESETS = [
  { name: 'Init', patch: {} },
  {
    name: 'Fat Bass',
    patch: {
      osc1Wave: 'sawtooth', osc1Oct: -1, osc2Wave: 'square', osc2Oct: -2, osc2Fine: 4,
      osc1Level: 0.9, osc2Level: 0.7, cutoff: 380, resonance: 0.35, envAmount: 0.45, keyTrack: 0.3,
      fAttack: 0.002, fDecay: 0.28, fSustain: 0.15, fRelease: 0.15,
      aAttack: 0.002, aDecay: 0.4, aSustain: 0.85, aRelease: 0.12,
      voiceMode: 'mono', glide: 0.04, drive: 0.25, reverbMix: 0,
    },
  },
  {
    name: 'Acid Line',
    patch: {
      osc1Wave: 'sawtooth', osc1Oct: -1, osc1Level: 1, osc2Level: 0, cutoff: 260, resonance: 0.82,
      envAmount: 0.7, keyTrack: 0.4, filterSlope: '24',
      fAttack: 0.001, fDecay: 0.22, fSustain: 0, fRelease: 0.1,
      aAttack: 0.002, aDecay: 0.3, aSustain: 0.7, aRelease: 0.06,
      voiceMode: 'mono', glide: 0.07, drive: 0.45, delayMix: 0.22, delayTime: 0.375, delayFeedback: 0.4, reverbMix: 0.05,
    },
  },
  {
    name: 'Warm Pad',
    patch: {
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Fine: 12, osc1Level: 0.7, osc2Level: 0.7,
      cutoff: 1100, resonance: 0.1, envAmount: 0.2, keyTrack: 0.3,
      fAttack: 1.2, fDecay: 2.5, fSustain: 0.5, fRelease: 2,
      aAttack: 0.9, aDecay: 1.5, aSustain: 0.85, aRelease: 2.4,
      lfoWave: 'triangle', lfoRate: 0.3, lfoFilter: 0.12, reverbMix: 0.45, reverbSize: 5, delayMix: 0.12, delayTime: 0.5,
    },
  },
  {
    name: 'Brass Stab',
    patch: {
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Fine: 9, osc1Level: 0.85, osc2Level: 0.75,
      cutoff: 650, resonance: 0.15, envAmount: 0.55, keyTrack: 0.5,
      fAttack: 0.06, fDecay: 0.5, fSustain: 0.35, fRelease: 0.3,
      aAttack: 0.03, aDecay: 0.3, aSustain: 0.8, aRelease: 0.25, reverbMix: 0.2,
    },
  },
  {
    name: 'Glass Pluck',
    patch: {
      osc1Wave: 'triangle', osc2Wave: 'square', osc2Oct: 1, osc2Fine: 3, osc1Level: 0.8, osc2Level: 0.25,
      cutoff: 900, resonance: 0.3, envAmount: 0.6, keyTrack: 0.8,
      fAttack: 0.001, fDecay: 0.35, fSustain: 0, fRelease: 0.4,
      aAttack: 0.001, aDecay: 0.9, aSustain: 0, aRelease: 0.6,
      delayMix: 0.3, delayTime: 0.28, delayFeedback: 0.45, reverbMix: 0.3,
    },
  },
  {
    name: 'Paradise Lead',
    patch: {
      osc1Wave: 'square', osc2Wave: 'triangle', osc2Oct: 1, osc2Fine: 4, osc1Level: 0.6, osc2Level: 0.45,
      cutoff: 1600, resonance: 0.15, envAmount: 0.2, keyTrack: 0.6,
      aAttack: 0.02, aDecay: 0.6, aSustain: 0.7, aRelease: 0.45,
      lfoWave: 'sine', lfoRate: 5.2, lfoPitch: 0.1,
      voiceMode: 'mono', glide: 0.06, delayMix: 0.28, delayTime: 0.42, delayFeedback: 0.35, reverbMix: 0.35, reverbSize: 3.5,
    },
  },
  {
    name: 'Wobble',
    patch: {
      osc1Wave: 'sawtooth', osc1Oct: -1, osc2Wave: 'square', osc2Oct: -1, osc2Fine: -8,
      cutoff: 300, resonance: 0.55, envAmount: 0.1, lfoWave: 'sine', lfoRate: 3, lfoFilter: 0.55,
      aAttack: 0.005, aSustain: 1, aRelease: 0.15, voiceMode: 'mono', glide: 0.05, drive: 0.5, reverbMix: 0.08,
    },
  },
  {
    name: 'Sync-ish Lead',
    patch: {
      osc1Wave: 'square', osc2Wave: 'sawtooth', osc2Semi: 7, osc2Fine: 5, osc1Level: 0.7, osc2Level: 0.6,
      cutoff: 2600, resonance: 0.4, envAmount: 0.25, keyTrack: 0.6,
      aAttack: 0.01, aSustain: 0.9, aRelease: 0.3, lfoRate: 5.5, lfoPitch: 0.12,
      voiceMode: 'mono', glide: 0.09, delayMix: 0.25, delayTime: 0.33, reverbMix: 0.2,
    },
  },
  {
    name: 'Wind & Surf',
    patch: {
      osc1Level: 0, osc2Level: 0, noiseLevel: 1, filterType: 'bandpass', cutoff: 900, resonance: 0.7,
      envAmount: 0.3, keyTrack: 1, fAttack: 1.5, fDecay: 3, fSustain: 0.4, fRelease: 3,
      aAttack: 1.2, aDecay: 2, aSustain: 0.8, aRelease: 3, lfoWave: 'triangle', lfoRate: 0.15, lfoFilter: 0.35,
      reverbMix: 0.5, reverbSize: 6,
    },
  },
];

export default {
  id: 'sl1',
  model: 'SL-1',
  name: 'Subtractive',
  subtitle: 'Subtractive Synthesizer',
  PARAMS,
  LAYOUT,
  PRESETS,
  create: () => new SubtractiveSynth(),
};
