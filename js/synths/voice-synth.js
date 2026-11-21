// Base classes for melodic instruments.
//
// VoiceSynth handles everything that isn't sound design: poly voice
// allocation + stealing, mono note stack with legato/glide, sustain pedal,
// pitch bend, per-instrument FX rack, and time-scheduled notes (so the
// sequencer/arpeggiator can play sample-accurately ahead of time).
//
// Subclasses implement:
//   build()                         create shared nodes (LFOs etc.), connect to this.out
//   createVoice(note, vel, t)       return a BaseVoice subclass instance
//   applyParam(name, immediate, prev)  react to a parameter change
//   applyModWheel()                 (optional) react to the mod wheel

import { defaultParams, sanitizePatch } from './params.js';

const BEND_CENTS = 200;

export const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class BaseVoice {
  constructor(synth, note, velocity, t) {
    this.synth = synth;
    this.ctx = synth.ctx;
    this.note = note;
    this.freq = mtof(note);
    this.velocity = velocity;
    this.startedAt = t;
    this.released = false;
    this.disposed = false;
    this.timer = 0;
    this._modLinks = []; // [sourceNode, destParam] pairs to undo on dispose
    this._sources = [];
    this._nodes = [];
  }

  /** Connect a shared modulator to a voice param, remembering it for cleanup. */
  link(src, param) {
    src.connect(param);
    this._modLinks.push([src, param]);
  }

  /** Register a source node (started/stopped with the voice). */
  source(node) {
    this._sources.push(node);
    return node;
  }

  /** Register any other node (disconnected on dispose). */
  node(n) {
    this._nodes.push(n);
    return n;
  }

  startSources(t) {
    for (const s of this._sources) s.start(t);
  }

  // Subclass hooks
  trigger(_t) {}
  releaseEnvelopes(t) {
    return t;
  }
  killEnvelopes(t) {
    return t + 0.04;
  }
  setNote(note, glide, t) {
    this.note = note;
    this.freq = mtof(note);
    this.applyPitch?.(t, glide);
  }

  retrigger(t) {
    this.released = false;
    clearTimeout(this.timer);
    this.trigger(t);
  }

  release(t) {
    if (this.released) return;
    this.released = true;
    this.scheduleDispose(this.releaseEnvelopes(t));
  }

  kill(t) {
    this.released = true;
    this.scheduleDispose(this.killEnvelopes(t));
  }

  scheduleDispose(atTime) {
    clearTimeout(this.timer);
    const ms = Math.max(0, (atTime - this.ctx.currentTime) * 1000) + 30;
    this.timer = setTimeout(() => {
      if (this.released) this.dispose();
    }, ms);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    for (const s of this._sources) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    // Detach shared modulators so they don't keep dead voices alive.
    for (const [src, param] of this._modLinks) {
      try { src.disconnect(param); } catch { /* not connected */ }
    }
    for (const n of this._nodes) n.disconnect();
    this.synth._removeVoice(this);
  }
}

export class VoiceSynth {
  constructor(PARAMS, { maxVoices = 10 } = {}) {
    this.PARAMS = PARAMS;
    this.params = defaultParams(PARAMS);
    this.maxVoices = maxVoices;
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

  get isMono() {
    return this.params.voiceMode === 'mono';
  }

  /** Build shared nodes once the AudioContext exists. */
  attach(engine) {
    if (this.ctx) return;
    this.engine = engine;
    const ctx = (this.ctx = engine.ctx);
    this.rack = engine.createRack();
    this.out = ctx.createGain();
    this.out.connect(this.rack.input);

    // Pitch modulation bus (cents): bend + whatever LFO the subclass adds.
    this.bend = ctx.createConstantSource();
    this.bend.offset.value = 0;
    this.bend.start();
    this.pitchMod = ctx.createGain();
    this.bend.connect(this.pitchMod);

    this.build();
    for (const k of Object.keys(this.params)) this._apply(k, true);
  }

  build() {}
  createVoice() {
    throw new Error('createVoice not implemented');
  }
  applyParam() {}
  applyModWheel() {}

  set(name, value) {
    if (!(name in this.PARAMS)) return;
    const prev = this.params[name];
    this.params[name] = value;
    if (this.ctx) this._apply(name, false, prev);
  }

  /** Load a whole patch. */
  load(patch) {
    const p = sanitizePatch(this.PARAMS, patch);
    if (p.voiceMode !== this.params.voiceMode) this.allNotesOff();
    for (const [k, v] of Object.entries(p)) this.set(k, v);
  }

  _apply(name, immediate = false, prev) {
    const def = this.PARAMS[name];
    if (def.fx) {
      this.rack.setFx(name, this.params[name], immediate);
      return;
    }
    if (name === 'voiceMode' && prev !== undefined && prev !== this.params.voiceMode) this.allNotesOff();
    this.applyParam(name, immediate, prev);
  }

  forEachVoice(fn) {
    for (const v of this.voices) fn(v);
  }

  // ── Performance controls ──

  setPitchBend(amount /* -1..1 */) {
    if (!this.ctx) return;
    this.bend.offset.setTargetAtTime(amount * BEND_CENTS, this.ctx.currentTime, 0.005);
  }

  setModWheel(amount /* 0..1 */) {
    this.modWheel = amount;
    if (this.ctx) this.applyModWheel();
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      const notes = [...this.sustained];
      this.sustained.clear();
      for (const n of notes) this._release(n, this.ctx ? this.ctx.currentTime : 0);
    }
  }

  // ── Notes (t = context time; defaults to now) ──

  noteOn(note, velocity = 0.8, t) {
    if (!this.ctx) return;
    t = t ?? this.ctx.currentTime;
    this.sustained.delete(note);

    if (this.isMono) {
      const wasHeld = this.monoStack.length > 0;
      this.monoStack = this.monoStack.filter((n) => n !== note);
      this.monoStack.push(note);
      const v = this.voices[this.voices.length - 1];
      if (v && !v.disposed) {
        v.velocity = velocity;
        v.setNote(note, this.params.glide || 0, t);
        // Legato: only retrigger envelopes when no other key was held.
        if (!wasHeld || v.released) v.retrigger(t);
        return;
      }
      this._spawn(note, velocity, t);
      return;
    }

    // Poly: re-striking a held note releases the old voice first.
    for (const v of this.voices) if (v.note === note && !v.released) v.release(t);
    if (this.voices.length >= this.maxVoices) this._steal(t);
    this._spawn(note, velocity, t);
  }

  noteOff(note, t) {
    if (!this.ctx) return;
    t = t ?? this.ctx.currentTime;
    if (this.sustain) {
      this.sustained.add(note);
      if (this.isMono) this._monoRemove(note, true, t);
      return;
    }
    this._release(note, t);
  }

  _release(note, t) {
    if (this.isMono) {
      this._monoRemove(note, false, t);
      return;
    }
    for (const v of this.voices) if (v.note === note && !v.released) v.release(t);
  }

  _monoRemove(note, sustained, t) {
    const wasTop = this.monoStack[this.monoStack.length - 1] === note;
    this.monoStack = this.monoStack.filter((n) => n !== note);
    const v = this.voices[this.voices.length - 1];
    if (!v) return;
    if (this.monoStack.length && wasTop) {
      v.setNote(this.monoStack[this.monoStack.length - 1], this.params.glide || 0, t);
    } else if (!this.monoStack.length && !sustained) {
      v.release(t);
    }
  }

  _spawn(note, velocity, t) {
    const v = this.createVoice(note, velocity, t);
    v.startSources(t);
    v.trigger(t);
    this.voices.push(v);
    this.onVoiceCount?.(this.voices.length);
    return v;
  }

  _steal(t) {
    // Prefer the oldest releasing voice, otherwise the oldest voice.
    const victim = this.voices.find((v) => v.released && !v.disposed) || this.voices[0];
    if (!victim) return;
    victim.kill(t);
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
    for (const v of this.voices) {
      // Cancel releases that were scheduled in the future by the sequencer.
      v.released = false;
      v.release(t);
    }
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
