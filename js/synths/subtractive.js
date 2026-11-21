// SL-1: a two-oscillator subtractive synth.
//
// Per voice:  osc1 ┐
//             osc2 ┼→ mixer → filter (12/24 dB) → VCA → voice bus
//             noise┘            ↑ env + LFO        ↑ amp env
//
// Shared:     LFO → pitch / filter / amp depth gains, pitch bend, tremolo.

import { Envelope } from '../engine/envelope.js';
import { fmt } from '../ui/format.js';

const MAX_VOICES = 10;
const FILTER_ENV_CENTS = 6000; // full env amount = ±5 octaves
const LFO_FILTER_CENTS = 4800;
const BEND_CENTS = 200;

export const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Parameter definitions. UI metadata lives here so the panel can be generated. */
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

  // Voicing
  voiceMode: { label: 'Mode', type: 'select', options: ['poly', 'mono'], def: 'poly' },
  glide: { label: 'Glide', min: 0, max: 2, curve: 'pow', exp: 3, def: 0, format: fmt.time },
  velocity: { label: 'Vel Sens', min: 0, max: 1, def: 0.6, format: fmt.pct },

  // Effects (handled by the shared engine)
  drive: { label: 'Drive', min: 0, max: 1, def: 0, format: fmt.pct, fx: true },
  delayTime: { label: 'Time', min: 0.02, max: 1.5, curve: 'log', def: 0.32, format: fmt.time, fx: true },
  delayFeedback: { label: 'Fdbk', min: 0, max: 0.92, def: 0.35, format: fmt.pct, fx: true },
  delayMix: { label: 'Mix', min: 0, max: 1, def: 0, format: fmt.pct, fx: true },
  reverbSize: { label: 'Size', min: 0.3, max: 8, curve: 'log', def: 2.5, format: fmt.time, fx: true },
  reverbMix: { label: 'Mix', min: 0, max: 1, def: 0.15, format: fmt.pct, fx: true },
  volume: { label: 'Volume', min: 0, max: 1, def: 0.75, format: fmt.pct, fx: true, size: 'lg' },
};

export function defaultParams() {
  const p = {};
  for (const [k, d] of Object.entries(PARAMS)) p[k] = d.def;
  return p;
}

/** Validate & clamp a (possibly untrusted, e.g. from a share link) patch. */
export function sanitizePatch(raw) {
  const out = defaultParams();
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, d] of Object.entries(PARAMS)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (d.type === 'select') {
      if (d.options.includes(String(v))) out[k] = String(v);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return out;
}

// ─── Voice ────────────────────────────────────────────────────────────────

class Voice {
  constructor(synth, note, velocity, t) {
    const ctx = synth.ctx;
    const p = synth.params;
    this.synth = synth;
    this.note = note;
    this.freq = mtof(note);
    this.velocity = velocity;
    this.startedAt = t;
    this.released = false;
    this.disposed = false;
    this.timer = 0;

    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.noise = ctx.createBufferSource();
    this.noise.buffer = synth.noiseBuffer;
    this.noise.loop = true;

    this.g1 = ctx.createGain();
    this.g2 = ctx.createGain();
    this.gn = ctx.createGain();

    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();

    // Filter envelope drives a constant source summed into both filters' detune.
    this.fEnvSrc = ctx.createConstantSource();
    this.fEnvSrc.offset.value = 0;

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;

    this.osc1.connect(this.g1).connect(this.f1);
    this.osc2.connect(this.g2).connect(this.f1);
    this.noise.connect(this.gn).connect(this.f1);
    this.f1.connect(this.f2).connect(this.vca).connect(synth.voiceBus);

    synth.pitchMod.connect(this.osc1.detune);
    synth.pitchMod.connect(this.osc2.detune);
    synth.filterMod.connect(this.f1.detune);
    synth.filterMod.connect(this.f2.detune);
    this.fEnvSrc.connect(this.f1.detune);
    this.fEnvSrc.connect(this.f2.detune);

    this.ampEnv = new Envelope(this.vca.gain, 0);
    this.filterEnv = new Envelope(this.fEnvSrc.offset, 0);

    this.applyAll(true);

    const offset = Math.random() * 1.5;
    this.osc1.start(t);
    this.osc2.start(t);
    this.noise.start(t, offset);
    this.fEnvSrc.start(t);

    this.trigger(t);
  }

  trigger(t) {
    const p = this.synth.params;
    this.released = false;
    clearTimeout(this.timer);
    const vel = 1 - p.velocity + p.velocity * this.velocity;
    this.ampEnv.trigger(t, { a: p.aAttack, d: p.aDecay, s: p.aSustain, r: p.aRelease }, 0.32 * vel);
    this.filterEnv.trigger(
      t,
      { a: p.fAttack, d: p.fDecay, s: p.fSustain, r: p.fRelease },
      p.envAmount * FILTER_ENV_CENTS * (0.5 + 0.5 * vel),
    );
  }

  release(t) {
    if (this.released) return;
    this.released = true;
    const endAmp = this.ampEnv.release(t);
    this.filterEnv.release(t);
    this.scheduleDispose(endAmp);
  }

  kill(t) {
    this.released = true;
    this.scheduleDispose(this.ampEnv.kill(t));
  }

  scheduleDispose(atTime) {
    clearTimeout(this.timer);
    const ms = Math.max(0, (atTime - this.synth.ctx.currentTime) * 1000) + 30;
    this.timer = setTimeout(() => {
      if (this.released) this.dispose();
    }, ms);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    const s = this.synth;
    for (const src of [this.osc1, this.osc2, this.noise, this.fEnvSrc]) {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
    // Detach shared modulators so they don't keep dead voices alive.
    safeDisconnect(s.pitchMod, this.osc1.detune);
    safeDisconnect(s.pitchMod, this.osc2.detune);
    safeDisconnect(s.filterMod, this.f1.detune);
    safeDisconnect(s.filterMod, this.f2.detune);
    this.vca.disconnect();
    s._removeVoice(this);
  }

  setNote(note, glide, t) {
    this.note = note;
    this.freq = mtof(note);
    this.applyPitch(t, glide);
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

  applyAll(immediate = false) {
    const t = this.synth.ctx.currentTime;
    this.applyWaves();
    this.applyPitch(t, 0, immediate);
    this.applyFilter(t, immediate);
    this.applyMix(t, immediate);
  }
}

function safeDisconnect(node, dest) {
  try { node.disconnect(dest); } catch { /* not connected */ }
}

// ─── Synth ────────────────────────────────────────────────────────────────

export class SubtractiveSynth {
  constructor() {
    this.params = defaultParams();
    this.voices = [];
    this.ctx = null;
    this.engine = null;
    this.monoStack = [];
    this.sustain = false;
    this.sustained = new Set();
    this.modWheel = 0;
    this.onVoiceCount = null;
  }

  get activeVoices() {
    return this.voices.length;
  }

  /** Build shared nodes once the AudioContext exists. */
  attach(engine) {
    if (this.ctx) return;
    this.engine = engine;
    const ctx = (this.ctx = engine.ctx);

    this.voiceBus = ctx.createGain();
    this.tremolo = ctx.createGain();
    this.voiceBus.connect(this.tremolo).connect(engine.input);

    this.lfo = ctx.createOscillator();
    this.lfoPitchDepth = ctx.createGain();
    this.lfoFilterDepth = ctx.createGain();
    this.lfoAmpDepth = ctx.createGain();
    this.lfo.connect(this.lfoPitchDepth);
    this.lfo.connect(this.lfoFilterDepth);
    this.lfo.connect(this.lfoAmpDepth).connect(this.tremolo.gain);
    this.lfo.start();

    this.bend = ctx.createConstantSource();
    this.bend.offset.value = 0;
    this.bend.start();

    this.pitchMod = ctx.createGain();
    this.filterMod = ctx.createGain();
    this.lfoPitchDepth.connect(this.pitchMod);
    this.bend.connect(this.pitchMod);
    this.lfoFilterDepth.connect(this.filterMod);

    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    for (const k of Object.keys(this.params)) this._apply(k, true);
  }

  set(name, value) {
    if (!(name in PARAMS)) return;
    const prev = this.params[name];
    this.params[name] = value;
    if (this.ctx) this._apply(name, false, prev);
  }

  /** Load a whole patch. */
  load(patch) {
    const p = sanitizePatch(patch);
    const modeChanged = p.voiceMode !== this.params.voiceMode;
    if (modeChanged) this.allNotesOff();
    for (const [k, v] of Object.entries(p)) this.set(k, v);
  }

  _apply(name, immediate = false, prev) {
    const p = this.params;
    const def = PARAMS[name];
    const t = this.ctx.currentTime;
    if (def.fx) {
      this.engine.setFx(name, p[name], immediate);
      return;
    }
    const each = (fn) => this.voices.forEach((v) => fn(v));
    switch (name) {
      case 'osc1Wave':
      case 'osc2Wave':
        each((v) => v.applyWaves());
        break;
      case 'osc1Oct':
      case 'osc2Oct':
      case 'osc2Semi':
      case 'osc2Fine':
        each((v) => v.applyPitch(t));
        break;
      case 'osc1Level':
      case 'osc2Level':
      case 'noiseLevel':
        each((v) => v.applyMix(t));
        break;
      case 'filterType':
      case 'filterSlope':
      case 'cutoff':
      case 'resonance':
      case 'keyTrack':
        each((v) => v.applyFilter(t));
        break;
      case 'lfoWave':
        this.lfo.type = p.lfoWave;
        break;
      case 'lfoRate':
        this.lfo.frequency.setTargetAtTime(p.lfoRate, t, immediate ? 0.001 : 0.02);
        break;
      case 'lfoPitch':
        this._applyPitchDepth(immediate);
        break;
      case 'lfoFilter':
        this.lfoFilterDepth.gain.setTargetAtTime(p.lfoFilter * LFO_FILTER_CENTS, t, immediate ? 0.001 : 0.02);
        break;
      case 'lfoAmp': {
        const d = p.lfoAmp / 2;
        this.lfoAmpDepth.gain.setTargetAtTime(d, t, immediate ? 0.001 : 0.02);
        this.tremolo.gain.setTargetAtTime(1 - d, t, immediate ? 0.001 : 0.02);
        break;
      }
      case 'voiceMode':
        if (prev !== undefined && prev !== p.voiceMode) this.allNotesOff();
        break;
      // Envelopes, glide, velocity and env amount apply from the next note.
    }
  }

  _applyPitchDepth(immediate = false) {
    const cents = this.params.lfoPitch * 1200 + this.modWheel * 60;
    this.lfoPitchDepth.gain.setTargetAtTime(cents, this.ctx.currentTime, immediate ? 0.001 : 0.02);
  }

  // ── Performance controls ──

  setPitchBend(amount /* -1..1 */) {
    if (!this.ctx) return;
    this.bend.offset.setTargetAtTime(amount * BEND_CENTS, this.ctx.currentTime, 0.005);
  }

  setModWheel(amount /* 0..1 */) {
    this.modWheel = amount;
    if (this.ctx) this._applyPitchDepth();
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      const notes = [...this.sustained];
      this.sustained.clear();
      for (const n of notes) this._release(n);
    }
  }

  // ── Notes ──

  noteOn(note, velocity = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sustained.delete(note);

    if (this.params.voiceMode === 'mono') {
      const wasHeld = this.monoStack.length > 0;
      this.monoStack = this.monoStack.filter((n) => n !== note);
      this.monoStack.push(note);
      const v = this.voices[this.voices.length - 1];
      if (v && !v.disposed) {
        v.velocity = velocity;
        v.setNote(note, this.params.glide, t);
        // Legato: only retrigger envelopes when no other key was held.
        if (!wasHeld || v.released) v.trigger(t);
        return;
      }
      this._spawn(note, velocity, t);
      return;
    }

    // Poly: re-striking a held note releases the old voice first.
    for (const v of this.voices) if (v.note === note && !v.released) v.release(t);
    if (this.voices.length >= MAX_VOICES) this._steal(t);
    this._spawn(note, velocity, t);
  }

  noteOff(note) {
    if (!this.ctx) return;
    if (this.sustain) {
      this.sustained.add(note);
      if (this.params.voiceMode === 'mono') this._monoRemove(note, true);
      return;
    }
    this._release(note);
  }

  _release(note) {
    const t = this.ctx.currentTime;
    if (this.params.voiceMode === 'mono') {
      this._monoRemove(note, false);
      return;
    }
    for (const v of this.voices) if (v.note === note && !v.released) v.release(t);
  }

  _monoRemove(note, sustained) {
    const t = this.ctx.currentTime;
    const wasTop = this.monoStack[this.monoStack.length - 1] === note;
    this.monoStack = this.monoStack.filter((n) => n !== note);
    const v = this.voices[this.voices.length - 1];
    if (!v) return;
    if (this.monoStack.length && wasTop) {
      v.setNote(this.monoStack[this.monoStack.length - 1], this.params.glide, t);
    } else if (!this.monoStack.length && !sustained) {
      v.release(t);
    }
  }

  _spawn(note, velocity, t) {
    const v = new Voice(this, note, velocity, t);
    this.voices.push(v);
    this.onVoiceCount?.(this.voices.length);
    return v;
  }

  _steal(t) {
    // Prefer the oldest releasing voice, otherwise the oldest voice.
    const victim = this.voices.find((v) => v.released && !v.disposed) || this.voices[0];
    if (!victim) return;
    victim.kill(t);
    // Remove immediately from accounting so the cap holds.
    this.voices = this.voices.filter((v) => v !== victim);
    this.onVoiceCount?.(this.voices.length);
  }

  _removeVoice(v) {
    const before = this.voices.length;
    this.voices = this.voices.filter((x) => x !== v);
    if (this.voices.length !== before) this.onVoiceCount?.(this.voices.length);
  }

  /** Release every note (soft) — used on blur, mode change, etc. */
  allNotesOff() {
    this.monoStack = [];
    this.sustained.clear();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.release(t);
  }

  /** Hard stop: kill everything immediately. */
  panic() {
    this.monoStack = [];
    this.sustained.clear();
    this.sustain = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of [...this.voices]) v.kill(t);
    this.setPitchBend(0);
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
