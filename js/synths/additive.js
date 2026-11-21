// AD-3: additive synth / drawbar organ.
//
// 16 harmonic faders are summed into one PeriodicWave (no per-partial
// oscillators, so it's cheap and alias-free). With Octave at −1 the faders
// line up with Hammond drawbars: 1=16', 2=8', 3=5⅓', 4=4', 6=2⅔', 8=2',
// 10=1⅗', 12=1⅓', 16=1'.
//
// Extras: chorus (detuned twin oscillator), Hammond-style percussion
// (2nd/3rd harmonic blip), and a rotary-speaker LFO that spins up/down.

import { Envelope } from '../engine/envelope.js';
import { fmt } from '../ui/format.js';
import { FX_PARAMS, VOICE_PARAMS } from './params.js';
import { VoiceSynth, BaseVoice } from './voice-synth.js';

const N_HARM = 16;
const ROTARY_RATE = { off: 0.8, slow: 0.8, fast: 6.6 };

const harmParams = {};
for (let i = 1; i <= N_HARM; i++) {
  harmParams[`h${i}`] = { label: String(i), min: 0, max: 1, def: i === 1 ? 1 : 0, format: fmt.pct, kind: 'fader', ariaLabel: `Harmonic ${i}` };
}

export const PARAMS = {
  ...harmParams,
  octave: { label: 'Octave', min: -2, max: 2, step: 1, def: 0, format: fmt.signed },
  tone: { label: 'Tone', min: 300, max: 18000, curve: 'log', def: 12000, format: fmt.hz },
  chorus: { label: 'Chorus', min: 0, max: 1, def: 0, format: fmt.pct },

  percHarm: { label: 'Harm', type: 'select', options: ['off', '2nd', '3rd'], def: 'off' },
  percDecay: { label: 'Decay', min: 0.05, max: 1.5, curve: 'log', def: 0.25, format: fmt.time },
  percLevel: { label: 'Level', min: 0, max: 1, def: 0.6, format: fmt.pct },

  rotary: { label: 'Speed', type: 'select', options: ['off', 'slow', 'fast'], def: 'off' },
  rotaryDepth: { label: 'Depth', min: 0, max: 1, def: 0.5, format: fmt.pct },

  aAttack: { label: 'A', min: 0.001, max: 8, curve: 'log', def: 0.005, format: fmt.time, kind: 'fader' },
  aDecay: { label: 'D', min: 0.005, max: 8, curve: 'log', def: 0.3, format: fmt.time, kind: 'fader' },
  aSustain: { label: 'S', min: 0, max: 1, def: 1, format: fmt.pct, kind: 'fader' },
  aRelease: { label: 'R', min: 0.005, max: 10, curve: 'log', def: 0.08, format: fmt.time, kind: 'fader' },

  ...VOICE_PARAMS,
  ...FX_PARAMS,
};
PARAMS.velocity = { ...PARAMS.velocity, def: 0.2 };

export const LAYOUT = [
  { title: 'Harmonics', keys: Object.keys(harmParams), wide: true },
  { title: 'Tone', keys: ['octave', 'tone', 'chorus'] },
  { title: 'Percussion', keys: ['percHarm', 'percDecay', 'percLevel'] },
  { title: 'Rotary', keys: ['rotary', 'rotaryDepth'] },
  { title: 'Amp Env', keys: ['aAttack', 'aDecay', 'aSustain', 'aRelease'] },
  { title: 'Voice', keys: ['voiceMode', 'glide', 'velocity'] },
];

class AdditiveVoice extends BaseVoice {
  constructor(synth, note, velocity, t) {
    super(synth, note, velocity, t);
    const ctx = this.ctx;
    this.osc = this.source(ctx.createOscillator());
    this.osc2 = this.source(ctx.createOscillator());
    this.perc = this.source(ctx.createOscillator());
    this.g2 = ctx.createGain();
    this.percGain = ctx.createGain();
    this.percGain.gain.value = 0;
    this.vca = this.node(ctx.createGain());
    this.vca.gain.value = 0;

    this.osc.connect(this.vca);
    this.osc2.connect(this.g2).connect(this.vca);
    this.perc.connect(this.percGain).connect(synth.voiceBus);
    this.vca.connect(synth.voiceBus);
    this.node(this.percGain);

    for (const o of [this.osc, this.osc2, this.perc]) this.link(synth.pitchMod, o.detune);

    this.ampEnv = new Envelope(this.vca.gain, 0);
    this.percEnv = new Envelope(this.percGain.gain, 0);
    this.applyWave();
    this.applyChorus(t, true);
    this.applyPitch(t, 0, true);
  }

  applyWave() {
    this.osc.setPeriodicWave(this.synth.wave);
    this.osc2.setPeriodicWave(this.synth.wave);
  }

  applyChorus(t, immediate = false) {
    const c = this.synth.params.chorus;
    const set = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.02));
    set(this.g2.gain, Math.min(1, c * 3) * 0.8);
    // Fixed detune offset on top of the shared pitch-mod input.
    this.osc2.detune.setValueAtTime(4 + c * 14, t);
  }

  applyPitch(t, glide = 0, immediate = false) {
    const p = this.synth.params;
    const f = this.freq * Math.pow(2, p.octave);
    const pm = p.percHarm === '3rd' ? 3 : 2;
    for (const [o, fr] of [[this.osc, f], [this.osc2, f], [this.perc, f * pm]]) {
      if (immediate) o.frequency.setValueAtTime(fr, t);
      else o.frequency.setTargetAtTime(fr, t, glide > 0 ? glide / 3 : 0.003);
    }
  }

  trigger(t) {
    const p = this.synth.params;
    const vel = 1 - p.velocity + p.velocity * this.velocity;
    this.ampEnv.trigger(t, { a: p.aAttack, d: p.aDecay, s: p.aSustain, r: p.aRelease }, 0.28 * vel);
    if (p.percHarm !== 'off') {
      this.percEnv.trigger(t, { a: 0.001, d: p.percDecay, s: 0, r: 0.05 }, 0.25 * p.percLevel * vel);
    }
  }

  releaseEnvelopes(t) {
    this.percEnv.release(t);
    return this.ampEnv.release(t);
  }

  killEnvelopes(t) {
    this.percEnv.kill(t);
    return this.ampEnv.kill(t);
  }
}

export class AdditiveSynth extends VoiceSynth {
  constructor() {
    super(PARAMS);
    this._waveQueued = false;
  }

  build() {
    const ctx = this.ctx;
    this.voiceBus = ctx.createGain();
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.Q.value = -3;
    this.tremolo = ctx.createGain();
    this.voiceBus.connect(this.toneFilter).connect(this.tremolo).connect(this.out);

    // Rotary speaker: one LFO doing both pitch wobble (doppler) and tremolo.
    this.rot = ctx.createOscillator();
    this.rot.frequency.value = ROTARY_RATE.slow;
    this.rotPitch = ctx.createGain();
    this.rotAmp = ctx.createGain();
    this.rot.connect(this.rotPitch).connect(this.pitchMod);
    this.rot.connect(this.rotAmp).connect(this.tremolo.gain);
    this.rot.start();

    this.wave = this._buildWave();
  }

  _buildWave() {
    const real = new Float32Array(N_HARM + 1);
    const imag = new Float32Array(N_HARM + 1);
    let any = false;
    for (let i = 1; i <= N_HARM; i++) {
      const v = this.params[`h${i}`];
      imag[i] = v * v; // squared: fader travel feels like drawbar steps (dB-ish)
      if (imag[i] > 0) any = true;
    }
    if (!any) imag[1] = 1e-4; // keep a valid (near-silent) wave
    return this.ctx.createPeriodicWave(real, imag);
  }

  _queueWave() {
    if (this._waveQueued) return;
    this._waveQueued = true;
    queueMicrotask(() => {
      this._waveQueued = false;
      this.wave = this._buildWave();
      this.forEachVoice((v) => v.applyWave());
    });
  }

  createVoice(note, velocity, t) {
    return new AdditiveVoice(this, note, velocity, t);
  }

  applyParam(name, immediate) {
    const p = this.params;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.001 : 0.02;
    if (/^h\d+$/.test(name)) {
      if (immediate) {
        this.wave = this._buildWave();
      } else {
        this._queueWave();
      }
      return;
    }
    switch (name) {
      case 'octave':
      case 'percHarm':
        this.forEachVoice((v) => v.applyPitch(t));
        break;
      case 'tone':
        this.toneFilter.frequency.setTargetAtTime(p.tone, t, tc);
        break;
      case 'chorus':
        this.forEachVoice((v) => v.applyChorus(t));
        break;
      case 'rotary':
      case 'rotaryDepth': {
        // Real rotary speakers take a moment to spin up/down.
        this.rot.frequency.setTargetAtTime(ROTARY_RATE[p.rotary], t, immediate ? 0.001 : p.rotary === 'fast' ? 0.6 : 1.2);
        this.applyModWheel(immediate);
        break;
      }
    }
  }

  applyModWheel(immediate = false) {
    const p = this.params;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.001 : 0.05;
    const on = p.rotary !== 'off';
    const d = on ? p.rotaryDepth : 0;
    this.rotPitch.gain.setTargetAtTime(d * 9 + this.modWheel * 40, t, tc);
    this.rotAmp.gain.setTargetAtTime(d * 0.18, t, tc);
    this.tremolo.gain.setTargetAtTime(1 - d * 0.18, t, tc);
  }
}

const drawbars = (s, extra = {}) => {
  // s = Hammond registration string like "888000000" (16' 5⅓' 8' 4' 2⅔' 2' 1⅗' 1⅓' 1')
  const map = [1, 3, 2, 4, 6, 8, 10, 12, 16];
  const patch = { octave: -1, h1: 0 };
  [...s].forEach((c, i) => {
    patch[`h${map[i]}`] = Math.sqrt(Number(c) / 8);
  });
  return { ...patch, ...extra };
};

const series = (fn, extra = {}) => {
  const patch = {};
  for (let i = 1; i <= N_HARM; i++) patch[`h${i}`] = Math.sqrt(Math.max(0, Math.min(1, fn(i))));
  return { ...patch, ...extra };
};

export const PRESETS = [
  { name: 'Init', patch: {} },
  { name: 'Jazz Organ 888', patch: drawbars('888000000', { percHarm: '3rd', percDecay: 0.2, percLevel: 0.7, rotary: 'slow', reverbMix: 0.15 }) },
  { name: 'Gospel Full', patch: drawbars('888888888', { rotary: 'fast', rotaryDepth: 0.6, drive: 0.3, reverbMix: 0.2 }) },
  { name: 'Soft Flutes', patch: drawbars('008400000', { rotary: 'slow', rotaryDepth: 0.4, aAttack: 0.03, aRelease: 0.2, reverbMix: 0.3 }) },
  { name: 'Clarinet', patch: series((i) => (i % 2 ? 1 / i : 0.02), { aAttack: 0.04, aRelease: 0.15, tone: 5000, voiceMode: 'mono', glide: 0.04, reverbMix: 0.25 }) },
  { name: 'Bright Strings', patch: series((i) => 1 / i, { chorus: 0.6, aAttack: 0.35, aDecay: 1, aSustain: 0.85, aRelease: 1.2, tone: 7000, reverbMix: 0.4 }) },
  { name: 'Hollow Square', patch: series((i) => (i % 2 ? 1 / i : 0), { tone: 4000, chorus: 0.3, aRelease: 0.3, delayMix: 0.15 }) },
  { name: 'Glass Choir', patch: series((i) => ([1, 2, 4, 5, 8].includes(i) ? 0.9 / Math.sqrt(i) : 0), { chorus: 0.8, aAttack: 0.6, aRelease: 1.5, reverbMix: 0.5, reverbSize: 5 }) },
];

export default {
  id: 'ad3',
  model: 'AD-3',
  name: 'Additive',
  subtitle: 'Additive Synthesizer · Drawbar Organ',
  PARAMS,
  LAYOUT,
  PRESETS,
  create: () => new AdditiveSynth(),
};
