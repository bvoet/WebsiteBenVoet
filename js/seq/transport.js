// Transport: tempo clock, step sequencer playback and arpeggiator.
//
// Uses the classic "lookahead" pattern: a coarse JS timer (25 ms) schedules
// every event that falls within the next ~120 ms at an exact AudioContext
// time. Instruments accept a time argument on noteOn/noteOff, so timing is
// sample-accurate even when the main thread is busy.
//
// Every instrument has its own pattern ("track"). All enabled tracks play
// together, so a DR-5 beat keeps running while you play SL-1 on top.

export const STEPS = 16;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
export const DRUM_BASE = 36; // MIDI note for drum row 0 (C2)

export const ARP_RATES = { '1/4': 1, '1/8': 2, '1/8T': 3, '1/16': 4, '1/16T': 6, '1/32': 8 };

export function emptyMelodic() {
  return {
    enabled: true,
    length: STEPS,
    steps: Array.from({ length: STEPS }, () => ({ on: false, note: 48, accent: false, slide: false })),
  };
}

export function emptyDrums() {
  return { enabled: true, length: STEPS, rows: Array.from({ length: 12 }, () => Array(STEPS).fill(0)) };
}

/** Validate an untrusted pattern (share link / storage). */
export function sanitizePattern(raw, drums) {
  const out = drums ? emptyDrums() : emptyMelodic();
  if (!raw || typeof raw !== 'object') return out;
  out.enabled = raw.enabled !== false;
  if (Number.isInteger(raw.length)) out.length = Math.min(STEPS, Math.max(1, raw.length));
  if (drums && Array.isArray(raw.rows)) {
    raw.rows.slice(0, 12).forEach((row, r) => {
      if (!Array.isArray(row)) return;
      row.slice(0, STEPS).forEach((v, i) => {
        out.rows[r][i] = v === 2 ? 2 : v ? 1 : 0;
      });
    });
  }
  if (!drums && Array.isArray(raw.steps)) {
    raw.steps.slice(0, STEPS).forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const note = Number.isInteger(s.note) ? Math.min(108, Math.max(12, s.note)) : 48;
      out.steps[i] = { on: !!s.on, note, accent: !!s.accent, slide: !!s.slide };
    });
  }
  return out;
}

export function patternIsEmpty(p, drums) {
  return drums ? p.rows.every((r) => r.every((v) => !v)) : p.steps.every((s) => !s.on);
}

// ─── Arpeggiator ──────────────────────────────────────────────────────────

export class Arp {
  constructor() {
    this.enabled = false;
    this.mode = 'up'; // up | down | updown | random | order
    this.octaves = 1;
    this.rate = '1/16';
    this.latch = false;
    this.gate = 0.6;
    this.down = new Set(); // keys physically held
    this.notes = []; // notes being arpeggiated, in press order
    this.vel = new Map();
    this.idx = 0;
    this.lastNote = null;
  }

  get active() {
    return this.enabled && this.notes.length > 0;
  }

  press(note, vel) {
    // Latch: a fresh chord (after all keys were released) replaces the old one.
    if (this.latch && this.down.size === 0) this.notes = [];
    this.down.add(note);
    this.vel.set(note, vel);
    if (!this.notes.includes(note)) this.notes.push(note);
  }

  release(note) {
    this.down.delete(note);
    if (!this.latch) this.notes = this.notes.filter((n) => n !== note);
  }

  clear() {
    this.down.clear();
    this.notes = [];
    this.idx = 0;
  }

  _sequence() {
    const base = this.mode === 'order' ? [...this.notes] : [...this.notes].sort((a, b) => a - b);
    const seq = [];
    for (let o = 0; o < this.octaves; o++) {
      for (const n of base) seq.push({ note: n + 12 * o, vel: this.vel.get(n) ?? 0.8 });
    }
    if (this.mode === 'down') seq.reverse();
    if (this.mode === 'updown' && seq.length > 2) return seq.concat(seq.slice(1, -1).reverse());
    return seq;
  }

  next() {
    const seq = this._sequence();
    if (!seq.length) return null;
    if (this.mode === 'random') return seq[Math.floor(Math.random() * seq.length)];
    return seq[this.idx++ % seq.length];
  }
}

// ─── Transport ────────────────────────────────────────────────────────────

export class Transport {
  /**
   * @param {object} opts
   * @param {() => AudioContext|null} opts.getCtx
   * @param {() => Array<{id, drums, pattern}>} opts.getTracks  all instrument tracks
   * @param {(id) => object|null} opts.resolve   attached instrument for a track id
   * @param {() => object|null} opts.getCurrent  instrument the arp plays
   * @param {(step:number, time:number) => void} opts.onStep
   */
  constructor({ getCtx, getTracks, resolve, getCurrent, onStep }) {
    this.getCtx = getCtx;
    this.getTracks = getTracks;
    this.resolve = resolve;
    this.getCurrent = getCurrent;
    this.onStep = onStep;
    this.bpm = 112;
    this.swing = 0;
    this.gate = 0.55;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.startTime = 0;
    this.pending = new Map(); // track id → note held by a slide
    this.recent = []; // recent {s, t} for live recording
    this.arp = new Arp();
    this.arpNext = 0;
    this.arpHeld = new Set();
    this._timer = 0;
  }

  get stepDur() {
    return 60 / this.bpm / 4;
  }

  get arpDur() {
    return 60 / this.bpm / ARP_RATES[this.arp.rate];
  }

  start() {
    const ctx = this.getCtx();
    if (!ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.startTime = this.nextTime = ctx.currentTime + 0.06;
    this.arpNext = this.nextTime;
    this._ensureTimer();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    const ctx = this.getCtx();
    const t = ctx ? ctx.currentTime : 0;
    for (const tr of this.getTracks()) {
      const inst = this.resolve(tr.id, false);
      if (!inst) continue;
      this.pending.delete(tr.id);
      if (tr.drums) inst.cancelScheduled?.(t);
      else inst.allNotesOff();
    }
    this.recent = [];
    this.onStep?.(-1, t);
  }

  /** Called whenever the arp gains its first note or is toggled. */
  wakeArp() {
    const ctx = this.getCtx();
    if (!ctx || !this.arp.active) return;
    if (!this._timer) {
      // Free-running: align to the transport grid if playing, else start now.
      if (this.playing) {
        const k = Math.ceil((ctx.currentTime - this.startTime) / this.arpDur);
        this.arpNext = this.startTime + k * this.arpDur;
      } else {
        this.arpNext = ctx.currentTime + 0.02;
      }
    } else if (this.arpNext < ctx.currentTime) {
      this.arpNext = ctx.currentTime + 0.01;
    }
    this._ensureTimer();
  }

  _ensureTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
  }

  _tick() {
    const ctx = this.getCtx();
    if (!ctx || (!this.playing && !this.arp.active)) {
      clearInterval(this._timer);
      this._timer = 0;
      return;
    }
    const horizon = ctx.currentTime + LOOKAHEAD;
    if (this.playing) {
      // If the tab was throttled, skip ahead instead of firing a burst.
      if (this.nextTime < ctx.currentTime - 0.25) {
        const missed = Math.ceil((ctx.currentTime - this.nextTime) / this.stepDur);
        this.step += missed;
        this.nextTime += missed * this.stepDur;
      }
      while (this.nextTime < horizon) {
        const swing = this.step % 2 ? this.swing * this.stepDur * 0.66 : 0;
        this._scheduleStep(this.step, this.nextTime + swing);
        this.step++;
        this.nextTime += this.stepDur;
      }
    }
    if (this.arp.active) {
      if (this.arpNext < ctx.currentTime - 0.25) this.arpNext = ctx.currentTime + 0.01;
      while (this.arpNext < horizon) {
        this._scheduleArp(this.arpNext);
        this.arpNext += this.arpDur;
      }
    }
  }

  _scheduleStep(s, t) {
    this.recent.push({ s, t });
    if (this.recent.length > 8) this.recent.shift();
    const dur = this.stepDur;
    for (const tr of this.getTracks()) {
      const p = tr.pattern;
      if (!p.enabled || patternIsEmpty(p, tr.drums)) {
        // A slide could be left hanging if the track was just muted.
        if (this.pending.has(tr.id)) {
          this.resolve(tr.id, false)?.noteOff(this.pending.get(tr.id), t);
          this.pending.delete(tr.id);
        }
        continue;
      }
      const inst = this.resolve(tr.id, true);
      if (!inst) continue;
      const i = s % p.length;
      if (tr.drums) {
        p.rows.forEach((row, r) => {
          if (row[i]) inst.noteOn(DRUM_BASE + r, row[i] === 2 ? 1 : 0.7, t);
        });
        continue;
      }
      const step = p.steps[i];
      const held = this.pending.get(tr.id);
      if (step.on) {
        if (held === step.note) {
          // Slide into the same note = tie: keep holding.
          if (!step.slide) {
            inst.noteOff(step.note, t + dur * this.gate);
            this.pending.delete(tr.id);
          }
          continue;
        }
        inst.noteOn(step.note, step.accent ? 1 : 0.72, t);
        if (held != null) {
          inst.noteOff(held, t + 0.004); // after the new note → legato glide in mono
          this.pending.delete(tr.id);
        }
        if (step.slide) this.pending.set(tr.id, step.note);
        else inst.noteOff(step.note, t + dur * this.gate);
      } else if (held != null) {
        inst.noteOff(held, t);
        this.pending.delete(tr.id);
      }
    }
    this.onStep?.(s, t);
  }

  _scheduleArp(t) {
    const inst = this.getCurrent();
    if (!inst || inst.isDrums) return;
    const ev = this.arp.next();
    if (!ev) return;
    inst.noteOn(ev.note, ev.vel, t);
    inst.noteOff(ev.note, t + this.arpDur * this.arp.gate);
  }

  /** Step index (absolute) closest to now — for live recording. */
  nearestStep() {
    const ctx = this.getCtx();
    if (!ctx || !this.recent.length) return 0;
    const now = ctx.currentTime;
    let best = this.recent[0];
    for (const r of this.recent) if (Math.abs(r.t - now) < Math.abs(best.t - now)) best = r;
    return best.s;
  }
}
