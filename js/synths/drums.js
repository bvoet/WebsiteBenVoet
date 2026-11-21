// DR-5: analog-style drum synth. Every sound is synthesized from oscillators
// and noise (no samples), in the spirit of classic analog drum machines.
//
// Sounds are mapped by pitch class, so every octave of the keyboard plays the
// same kit, laid out roughly like General MIDI:
//   C Kick · C# Rim · D Snare · D# Clap · E Shaker · F Low Tom · F# Closed Hat
//   G Mid Tom · G# Cowbell · A High Tom · A# Open Hat · B Cymbal

import { fmt } from '../ui/format.js';
import { FX_PARAMS, defaultParams, sanitizePatch } from './params.js';

export const KIT = [
  { pc: 0, id: 'kick', name: 'Kick', short: 'BD' },
  { pc: 1, id: 'rim', name: 'Rim', short: 'RS' },
  { pc: 2, id: 'snare', name: 'Snare', short: 'SD' },
  { pc: 3, id: 'clap', name: 'Clap', short: 'CP' },
  { pc: 4, id: 'shaker', name: 'Shaker', short: 'SH' },
  { pc: 5, id: 'tomLo', name: 'Low Tom', short: 'LT' },
  { pc: 6, id: 'hatC', name: 'Closed Hat', short: 'CH' },
  { pc: 7, id: 'tomMid', name: 'Mid Tom', short: 'MT' },
  { pc: 8, id: 'cowbell', name: 'Cowbell', short: 'CB' },
  { pc: 9, id: 'tomHi', name: 'High Tom', short: 'HT' },
  { pc: 10, id: 'hatO', name: 'Open Hat', short: 'OH' },
  { pc: 11, id: 'cymbal', name: 'Cymbal', short: 'CY' },
];

const TOM_RATIO = { tomLo: 1, tomMid: 1.33, tomHi: 1.78 };
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800]; // classic "metallic" square cluster

export const PARAMS = {
  kickTune: { label: 'Tune', min: 30, max: 110, curve: 'log', def: 50, format: fmt.hz },
  kickPunch: { label: 'Punch', min: 0, max: 1, def: 0.55, format: fmt.pct },
  kickDecay: { label: 'Decay', min: 0.08, max: 2, curve: 'log', def: 0.5, format: fmt.time },
  kickLevel: { label: 'Level', min: 0, max: 1, def: 0.9, format: fmt.pct },

  snareTune: { label: 'Tune', min: 120, max: 400, curve: 'log', def: 185, format: fmt.hz },
  snareSnappy: { label: 'Snappy', min: 0, max: 1, def: 0.6, format: fmt.pct },
  snareDecay: { label: 'Decay', min: 0.05, max: 0.8, curve: 'log', def: 0.2, format: fmt.time },
  snareLevel: { label: 'Level', min: 0, max: 1, def: 0.75, format: fmt.pct },

  clapTone: { label: 'Tone', min: 600, max: 3000, curve: 'log', def: 1200, format: fmt.hz },
  clapDecay: { label: 'Decay', min: 0.05, max: 1, curve: 'log', def: 0.25, format: fmt.time },
  clapLevel: { label: 'Level', min: 0, max: 1, def: 0.7, format: fmt.pct },

  tomTune: { label: 'Tune', min: 60, max: 250, curve: 'log', def: 100, format: fmt.hz },
  tomDecay: { label: 'Decay', min: 0.08, max: 1.5, curve: 'log', def: 0.4, format: fmt.time },
  tomLevel: { label: 'Level', min: 0, max: 1, def: 0.75, format: fmt.pct },

  hatTone: { label: 'Tone', min: 4000, max: 14000, curve: 'log', def: 8000, format: fmt.hz },
  hatDecayC: { label: 'Closed', min: 0.02, max: 0.25, curve: 'log', def: 0.05, format: fmt.time },
  hatDecayO: { label: 'Open', min: 0.1, max: 1.5, curve: 'log', def: 0.4, format: fmt.time },
  hatLevel: { label: 'Level', min: 0, max: 1, def: 0.55, format: fmt.pct },

  cymDecay: { label: 'Cym Dec', min: 0.4, max: 4, curve: 'log', def: 1.6, format: fmt.time },
  cymLevel: { label: 'Cym Lvl', min: 0, max: 1, def: 0.45, format: fmt.pct },

  percTune: { label: 'Tune', min: 0.6, max: 1.6, curve: 'log', def: 1, format: (v) => `×${v.toFixed(2)}` },
  rimLevel: { label: 'Rim', min: 0, max: 1, def: 0.6, format: fmt.pct },
  cowLevel: { label: 'Cowbell', min: 0, max: 1, def: 0.5, format: fmt.pct },
  shakerLevel: { label: 'Shaker', min: 0, max: 1, def: 0.45, format: fmt.pct },

  ...FX_PARAMS,
};
PARAMS.reverbMix = { ...PARAMS.reverbMix, def: 0.08 };

export const LAYOUT = [
  { title: 'Kick', keys: ['kickTune', 'kickPunch', 'kickDecay', 'kickLevel'] },
  { title: 'Snare', keys: ['snareTune', 'snareSnappy', 'snareDecay', 'snareLevel'] },
  { title: 'Clap', keys: ['clapTone', 'clapDecay', 'clapLevel'] },
  { title: 'Toms', keys: ['tomTune', 'tomDecay', 'tomLevel'] },
  { title: 'Hats & Cymbal', keys: ['hatTone', 'hatDecayC', 'hatDecayO', 'hatLevel', 'cymDecay', 'cymLevel'], wide: true },
  { title: 'Percussion', keys: ['percTune', 'rimLevel', 'cowLevel', 'shakerLevel'] },
];

export class DrumSynth {
  constructor() {
    this.PARAMS = PARAMS;
    this.params = defaultParams(PARAMS);
    this.ctx = null;
    this.hits = new Set();
    this.openHat = null;
    this.onVoiceCount = null;
    this.isDrums = true;
  }

  get activeVoices() {
    return this.hits.size;
  }

  attach(engine) {
    if (this.ctx) return;
    this.engine = engine;
    this.ctx = engine.ctx;
    this.rack = engine.createRack();
    this.out = this.ctx.createGain();
    this.out.connect(this.rack.input);
    for (const [k, d] of Object.entries(PARAMS)) if (d.fx) this.rack.setFx(k, this.params[k], true);
  }

  set(name, value) {
    if (!(name in PARAMS)) return;
    this.params[name] = value;
    if (this.ctx && PARAMS[name].fx) this.rack.setFx(name, value);
  }

  load(patch) {
    const p = sanitizePatch(PARAMS, patch);
    for (const [k, v] of Object.entries(p)) this.set(k, v);
  }

  // Melodic-performance controls have no meaning for drums.
  noteOff() {}
  allNotesOff() {}
  setPitchBend() {}
  setModWheel() {}
  setSustain() {}

  panic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const h of [...this.hits]) {
      h.gain.gain.cancelScheduledValues(t);
      h.gain.gain.setTargetAtTime(0, t, 0.005);
      h.end(t + 0.05);
    }
  }

  /** Cancel hits scheduled in the future (sequencer stop); ringing ones keep ringing. */
  cancelScheduled(now) {
    for (const h of [...this.hits]) if (h.t > now) h.end(now);
  }

  noteOn(note, velocity = 0.8, t) {
    if (!this.ctx) return;
    t = t ?? this.ctx.currentTime;
    const drum = KIT[((note % 12) + 12) % 12];
    const v = 0.25 + 0.75 * velocity;
    switch (drum.id) {
      case 'kick': return this._kick(t, v);
      case 'snare': return this._snare(t, v);
      case 'clap': return this._clap(t, v);
      case 'rim': return this._rim(t, v);
      case 'shaker': return this._shaker(t, v);
      case 'cowbell': return this._cowbell(t, v);
      case 'hatC': return this._hat(t, v, false);
      case 'hatO': return this._hat(t, v, true);
      case 'cymbal': return this._cymbal(t, v);
      default: return this._tom(t, v, TOM_RATIO[drum.id]);
    }
  }

  // ── Hit bookkeeping ──

  _hit(t, level) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, 0);
    gain.connect(this.out);
    const sources = [];
    const hit = {
      t,
      gain,
      level,
      src: (node) => {
        sources.push(node);
        return node;
      },
      end: (at) => {
        for (const s of sources) {
          try { s.stop(at); } catch { /* already stopped */ }
        }
      },
    };
    let pending = 0;
    hit.finish = (at) => {
      pending = sources.length;
      for (const s of sources) {
        s.onended = () => {
          if (--pending === 0) {
            gain.disconnect();
            this.hits.delete(hit);
            this.onVoiceCount?.(this.hits.size);
          }
        };
        s.start(t);
      }
      hit.end(at);
      this.hits.add(hit);
      this.onVoiceCount?.(this.hits.size);
    };
    return hit;
  }

  _noise() {
    const n = this.ctx.createBufferSource();
    n.buffer = this.engine.noiseBuffer;
    n.loop = true;
    return n;
  }

  /** Exponential-ish decay envelope on a gain param. */
  _env(param, t, peak, decay, attack = 0.001) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setTargetAtTime(0, t + attack, decay / 4);
    return t + attack + decay * 1.6;
  }

  // ── Voices ──

  _kick(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const osc = h.src(ctx.createOscillator());
    osc.type = 'sine';
    const startF = p.kickTune * (1 + p.kickPunch * 7);
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(p.kickTune, t + 0.03 + p.kickPunch * 0.05);
    const g = ctx.createGain();
    osc.connect(g).connect(h.gain);
    const end = this._env(g.gain, t, 1, p.kickDecay);

    // Beater click
    const click = h.src(this._noise());
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const cg = ctx.createGain();
    click.connect(hp).connect(cg).connect(h.gain);
    this._env(cg.gain, t, 0.25 * p.kickPunch, 0.008);

    h.gain.gain.setValueAtTime(p.kickLevel * v * 0.9, t);
    h.finish(end);
  }

  _snare(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    // Two detuned tone oscillators for the shell
    for (const [ratio, lvl] of [[1, 0.6], [1.62, 0.35]]) {
      const o = h.src(ctx.createOscillator());
      o.type = 'triangle';
      o.frequency.setValueAtTime(p.snareTune * ratio * 1.2, t);
      o.frequency.exponentialRampToValueAtTime(p.snareTune * ratio, t + 0.02);
      const g = ctx.createGain();
      o.connect(g).connect(h.gain);
      this._env(g.gain, t, lvl * (1 - p.snareSnappy * 0.5), Math.min(0.15, p.snareDecay));
    }
    // Snares (noise)
    const n = h.src(this._noise());
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    n.connect(hp).connect(ng).connect(h.gain);
    const end = this._env(ng.gain, t, 0.2 + p.snareSnappy * 0.8, p.snareDecay);
    h.gain.gain.setValueAtTime(p.snareLevel * v * 0.7, t);
    h.finish(end);
  }

  _clap(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const n = h.src(this._noise());
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = p.clapTone;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    n.connect(bp).connect(g).connect(h.gain);
    // Three fast "hands" then the room tail
    const gp = g.gain;
    gp.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.011;
      gp.setValueAtTime(1, ti);
      gp.setTargetAtTime(0.1, ti + 0.001, 0.003);
    }
    const tail = t + 0.034;
    gp.setValueAtTime(0.9, tail);
    gp.setTargetAtTime(0, tail, p.clapDecay / 4);
    h.gain.gain.setValueAtTime(p.clapLevel * v * 1.2, t);
    h.finish(tail + p.clapDecay * 1.6);
  }

  _tom(t, v, ratio) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const f = p.tomTune * ratio;
    const o = h.src(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ctx.createGain();
    o.connect(g).connect(h.gain);
    const end = this._env(g.gain, t, 1, p.tomDecay * (1.15 - ratio * 0.15));
    h.gain.gain.setValueAtTime(p.tomLevel * v * 0.8, t);
    h.finish(end);
  }

  _metal(h, t, tune) {
    // Six square oscillators at inharmonic ratios → the classic metallic hat source
    const ctx = this.ctx;
    const sum = ctx.createGain();
    sum.gain.value = 0.25;
    for (const f of HAT_FREQS) {
      const o = h.src(ctx.createOscillator());
      o.type = 'square';
      o.frequency.value = f * tune;
      o.connect(sum);
    }
    return sum;
  }

  _hat(t, v, open) {
    const p = this.params;
    const ctx = this.ctx;
    // A closed hat chokes a ringing open hat (like a real hi-hat).
    if (this.openHat) {
      const g = this.openHat.gain.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, 0.008);
      this.openHat.end(t + 0.06);
      this.openHat = null;
    }
    const h = this._hit(t);
    const metal = this._metal(h, t, 1);
    const n = h.src(this._noise());
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(ng);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = p.hatTone;
    const g = ctx.createGain();
    metal.connect(bp);
    ng.connect(bp);
    bp.connect(hp).connect(g).connect(h.gain);
    const end = this._env(g.gain, t, 1, open ? p.hatDecayO : p.hatDecayC);
    h.gain.gain.setValueAtTime(p.hatLevel * v * 1.4, t);
    h.finish(end);
    if (open) this.openHat = h;
  }

  _cymbal(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const metal = this._metal(h, t, 1.45);
    const n = h.src(this._noise());
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(ng);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = p.hatTone * 0.6;
    const g = ctx.createGain();
    metal.connect(hp);
    ng.connect(hp);
    hp.connect(g).connect(h.gain);
    const end = this._env(g.gain, t, 1, p.cymDecay, 0.002);
    h.gain.gain.setValueAtTime(p.cymLevel * v * 1.1, t);
    h.finish(end);
  }

  _cowbell(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const sum = ctx.createGain();
    for (const f of [540, 800]) {
      const o = h.src(ctx.createOscillator());
      o.type = 'square';
      o.frequency.value = f * p.percTune;
      o.connect(sum);
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000 * p.percTune;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    sum.connect(bp).connect(g).connect(h.gain);
    // Fast initial drop, then a longer ring
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.001);
    g.gain.setTargetAtTime(0.35, t + 0.001, 0.012);
    g.gain.setTargetAtTime(0, t + 0.04, 0.09);
    h.gain.gain.setValueAtTime(p.cowLevel * v * 0.6, t);
    h.finish(t + 0.5);
  }

  _rim(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    for (const [f, lvl] of [[480, 0.6], [1720, 1]]) {
      const o = h.src(ctx.createOscillator());
      o.type = 'triangle';
      o.frequency.value = f * p.percTune;
      const g = ctx.createGain();
      o.connect(g).connect(h.gain);
      this._env(g.gain, t, lvl, 0.035);
    }
    h.gain.gain.setValueAtTime(p.rimLevel * v * 0.6, t);
    h.finish(t + 0.12);
  }

  _shaker(t, v) {
    const p = this.params;
    const ctx = this.ctx;
    const h = this._hit(t);
    const n = h.src(this._noise());
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5500 * p.percTune;
    const g = ctx.createGain();
    n.connect(hp).connect(g).connect(h.gain);
    const end = this._env(g.gain, t, 1, 0.07, 0.012);
    h.gain.gain.setValueAtTime(p.shakerLevel * v * 0.8, t);
    h.finish(end);
  }
}

export const PRESETS = [
  { name: 'Init Kit', patch: {} },
  { name: 'Boom Bap', patch: { kickTune: 55, kickPunch: 0.35, kickDecay: 0.45, snareTune: 210, snareSnappy: 0.45, snareDecay: 0.18, hatTone: 6500, hatDecayC: 0.04, drive: 0.25, reverbMix: 0.12 } },
  { name: '808 Deep', patch: { kickTune: 42, kickPunch: 0.3, kickDecay: 1.4, kickLevel: 1, snareSnappy: 0.75, clapDecay: 0.35, hatDecayO: 0.6, reverbMix: 0.1 } },
  { name: 'Tight Electro', patch: { kickTune: 62, kickPunch: 0.8, kickDecay: 0.25, snareTune: 240, snareDecay: 0.12, clapTone: 1500, clapDecay: 0.15, hatTone: 10000, hatDecayC: 0.03, drive: 0.4, reverbMix: 0.04 } },
  { name: 'Exotica Percussion', patch: { tomTune: 140, tomDecay: 0.6, percTune: 1.2, cowLevel: 0.6, shakerLevel: 0.6, rimLevel: 0.7, delayMix: 0.18, delayTime: 0.33, reverbMix: 0.3, reverbSize: 3 } },
];

export default {
  id: 'dr5',
  model: 'DR-5',
  name: 'Drums',
  subtitle: 'Analog Drum Synthesizer',
  PARAMS,
  LAYOUT,
  PRESETS,
  KIT,
  drums: true,
  create: () => new DrumSynth(),
};
