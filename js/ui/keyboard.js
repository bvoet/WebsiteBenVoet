// On-screen piano keyboard (mouse / touch, multi-touch, glissando)
// and computer-keyboard note input.

const BLACK = new Set([1, 3, 6, 8, 10]);

export class PianoKeyboard {
  /**
   * @param {HTMLElement} el container
   * @param {{lo:number, hi:number, onNoteOn:(n:number,v:number)=>void, onNoteOff:(n:number)=>void}} opts
   */
  constructor(el, { lo = 48, hi = 84, onNoteOn, onNoteOff }) {
    this.el = el;
    this.lo = lo;
    this.hi = hi;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.keys = new Map();
    this.pointers = new Map(); // pointerId → note
    this.lit = new Map(); // note → number of sources holding it
    this._render();
    this._bind();
  }

  _render() {
    this.el.innerHTML = '';
    this.el.classList.add('piano');
    const whites = [];
    for (let n = this.lo; n <= this.hi; n++) if (!BLACK.has(n % 12)) whites.push(n);
    const w = 100 / whites.length;
    let wi = 0;
    for (let n = this.lo; n <= this.hi; n++) {
      const k = document.createElement('div');
      k.dataset.note = n;
      const black = BLACK.has(n % 12);
      k.className = black ? 'key key--black' : 'key key--white';
      if (black) {
        k.style.left = `calc(${wi * w}% - var(--black-w) / 2)`;
      } else {
        k.style.left = `${wi * w}%`;
        k.style.width = `${w}%`;
        if (n % 12 === 0) {
          const lab = document.createElement('span');
          lab.className = 'key__label';
          lab.textContent = `C${Math.floor(n / 12) - 1}`;
          k.append(lab);
        }
        wi++;
      }
      this.keys.set(n, k);
      this.el.append(k);
    }
  }

  _noteAt(x, y) {
    const t = document.elementFromPoint(x, y);
    const k = t && t.closest && t.closest('.key');
    return k && this.el.contains(k) ? Number(k.dataset.note) : null;
  }

  _velocity(note, y) {
    // Lower on the key = harder hit, like striking further from the pivot.
    const r = this.keys.get(note).getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (y - r.top) / r.height));
    return 0.35 + rel * 0.65;
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const note = this._noteAt(e.clientX, e.clientY);
      if (note == null) return;
      e.preventDefault();
      // Release implicit touch capture so we can slide across keys.
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, note);
      this._press(note, this._velocity(note, e.clientY));
    });

    const move = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId);
      const note = this._noteAt(e.clientX, e.clientY);
      if (note === prev) return;
      if (prev != null) this._unpress(prev);
      this.pointers.set(e.pointerId, note);
      if (note != null) this._press(note, this._velocity(note, e.clientY));
    };
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const note = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (note != null) this._unpress(note);
    };
    // Listen on window so releasing outside the keyboard never sticks a note.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _press(note, vel) {
    this.onNoteOn(note, vel);
  }

  _unpress(note) {
    this.onNoteOff(note);
  }

  /** Light a key from any source (mouse, computer keys, MIDI). */
  light(note, on) {
    const c = (this.lit.get(note) || 0) + (on ? 1 : -1);
    if (c <= 0) this.lit.delete(note);
    else this.lit.set(note, c);
    this.keys.get(note)?.classList.toggle('is-down', c > 0);
  }

  releaseAll() {
    for (const note of this.pointers.values()) if (note != null) this.onNoteOff(note);
    this.pointers.clear();
    this.lit.clear();
    for (const k of this.keys.values()) k.classList.remove('is-down');
  }

  /** Per-key labels (e.g. drum names). Pass null to remove. */
  setLabels(fn) {
    for (const [n, k] of this.keys) {
      k.querySelector('.key__sound')?.remove();
      const text = fn?.(n);
      if (!text) continue;
      const s = document.createElement('span');
      s.className = 'key__sound';
      s.textContent = text;
      k.append(s);
    }
    this.el.classList.toggle('piano--labelled', !!fn);
  }

  /** Mark the keys reachable from the computer keyboard. */
  markRange(lo, hi) {
    for (const [n, k] of this.keys) k.classList.toggle('in-range', n >= lo && n <= hi);
  }
}

// Physical key positions (KeyboardEvent.code), so AZERTY/QWERTZ work too.
const CODE_MAP = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15,
  Semicolon: 16, Quote: 17,
};

export class ComputerKeys {
  constructor({ onNoteOn, onNoteOff, onOctave, onSustain }) {
    this.octave = 4; // base note = C4 (MIDI 60)
    this.held = new Map(); // code → note
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onOctave = onOctave;
    this.onSustain = onSustain;
    this.velocity = 0.8;

    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this._up(e));
  }

  get base() {
    return 12 * (this.octave + 1);
  }

  get range() {
    return [this.base, this.base + 17];
  }

  _ignore(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    const t = e.target;
    // Text fields keep their keys. A focused <select> does NOT: otherwise its
    // type-ahead would swap the preset when you try to play a note.
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName));
  }

  _down(e) {
    if (this._ignore(e)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.onSustain(true);
      return;
    }
    if (e.repeat) {
      if (e.code in CODE_MAP) e.preventDefault();
      return;
    }
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      this.shiftOctave(e.code === 'KeyZ' ? -1 : 1);
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyC' || e.code === 'KeyV') {
      this.velocity = Math.min(1, Math.max(0.1, this.velocity + (e.code === 'KeyV' ? 0.1 : -0.1)));
      this.onOctave(this.octave, this.velocity);
      return;
    }
    const off = CODE_MAP[e.code];
    if (off === undefined || this.held.has(e.code)) return;
    // Don't trigger buttons/links focused via Tab when using the keys to play.
    e.preventDefault();
    const note = this.base + off;
    this.held.set(e.code, note);
    this.onNoteOn(note, this.velocity);
  }

  _up(e) {
    if (e.code === 'Space') {
      if (this._ignore(e)) return;
      // Buttons activate on Space *keyup*: stop sustain from clicking the
      // last-pressed button (Power, Panic, ...).
      e.preventDefault();
      this.onSustain(false);
      return;
    }
    const note = this.held.get(e.code);
    if (note === undefined) return;
    this.held.delete(e.code);
    this.onNoteOff(note);
  }

  shiftOctave(d) {
    const next = Math.min(7, Math.max(0, this.octave + d));
    if (next === this.octave) return;
    // Held notes keep their original pitch until released (no stuck notes).
    this.octave = next;
    this.onOctave(this.octave, this.velocity);
  }

  releaseAll() {
    for (const note of this.held.values()) this.onNoteOff(note);
    this.held.clear();
  }
}
