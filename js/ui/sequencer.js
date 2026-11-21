// Sequencer + arpeggiator panel.
//
// Melodic tracks: 16 steps, each with gate, note (drag / wheel / step-record),
// accent and slide. Drum tracks: a 12-row grid (click cycles off → on → accent).

import { Control } from './control.js';
import { Selector } from './selector.js';
import { noteName, fmt } from './format.js';
import { STEPS, DRUM_BASE, ARP_RATES, emptyDrums, emptyMelodic } from '../seq/transport.js';

export class SequencerPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} o
   * @param {import('../seq/transport.js').Transport} o.transport
   * @param {Array} o.instruments          instrument definitions (for track chips)
   * @param {(id) => {pattern, drums}} o.getTrack
   * @param {() => void} o.onPatternChange  persist
   * @param {(note, vel) => void} o.preview audition a drum row
   * @param {() => boolean} o.ensureAudio
   * @param {(msg) => void} o.flash
   * @param {() => void} o.onArpChange
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.t = o.transport;
    this.current = null; // instrument def
    this.cursor = 0;
    this.rec = false;
    this.playhead = -1;
    this._timers = new Set();
    this._build();
  }

  get track() {
    return this.o.getTrack(this.current.id);
  }

  // ── Build static chrome ──

  _build() {
    const r = this.root;
    r.innerHTML = '';
    r.classList.add('seq');

    // Transport row
    const bar = el('div', 'seq__bar');
    this.playBtn = button('hw-btn hw-btn--led seq__play', '<span class="led"></span>Play');
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.recBtn = button('hw-btn hw-btn--led seq__rec', '<span class="led led--red"></span>Rec');
    this.recBtn.title = 'Step-record: play notes to write them into the pattern';
    this.recBtn.addEventListener('click', () => this.setRec(!this.rec));
    this.clearBtn = button('hw-btn', 'Clear');
    this.clearBtn.addEventListener('click', () => this.clear());
    this.trackBtn = button('hw-btn hw-btn--led', '<span class="led"></span>Track');
    this.trackBtn.title = 'Include this instrument when the sequencer plays';
    this.trackBtn.addEventListener('click', () => {
      this.track.pattern.enabled = !this.track.pattern.enabled;
      this._changed();
      this._renderChips();
    });

    const t = this.t;
    this.bpm = new Control({ label: 'BPM', min: 40, max: 220, step: 1, def: 112, format: (v) => `${Math.round(v)}` }, t.bpm, (v) => (t.bpm = v));
    this.swing = new Control({ label: 'Swing', min: 0, max: 0.75, def: 0, format: fmt.pct }, t.swing, (v) => (t.swing = v));
    this.gate = new Control({ label: 'Gate', min: 0.1, max: 1, def: 0.55, format: fmt.pct }, t.gate, (v) => (t.gate = v));
    this.len = new Control({ label: 'Length', min: 1, max: STEPS, step: 1, def: STEPS, format: (v) => `${v} st` }, STEPS, (v) => {
      this.track.pattern.length = v;
      this._changed();
      this._renderGrid();
    });
    for (const c of [this.bpm, this.swing, this.gate, this.len]) c.el.classList.add('ctl--sm');

    const transport = el('div', 'seq__group');
    transport.append(this.playBtn, this.recBtn, this.clearBtn, this.trackBtn);
    const knobs = el('div', 'seq__group seq__knobs');
    knobs.append(this.bpm.el, this.swing.el, this.gate.el, this.len.el);
    this.chips = el('div', 'seq__chips');
    this.chips.setAttribute('aria-label', 'Tracks');

    bar.append(heading('Sequencer'), transport, knobs, this.chips);

    // Arp row
    const arpBar = el('div', 'seq__bar seq__bar--arp');
    const arp = t.arp;
    this.arpBtn = button('hw-btn hw-btn--led', '<span class="led"></span>Arp');
    this.arpBtn.title = 'Arpeggiate held notes at the sequencer tempo';
    this.arpBtn.addEventListener('click', () => {
      arp.enabled = !arp.enabled;
      if (!arp.enabled) arp.clear();
      this.arpBtn.classList.toggle('is-on', arp.enabled);
      this.o.onArpChange?.();
    });
    this.latchBtn = button('hw-btn hw-btn--led', '<span class="led"></span>Latch');
    this.latchBtn.title = 'Keep arpeggiating after you let go of the keys';
    this.latchBtn.addEventListener('click', () => {
      arp.latch = !arp.latch;
      if (!arp.latch) arp.notes = arp.notes.filter((n) => arp.down.has(n));
      this.latchBtn.classList.toggle('is-on', arp.latch);
    });
    const mode = new Selector(
      { label: 'Mode', options: ['up', 'down', 'updown', 'random', 'order'], def: 'up' },
      arp.mode,
      (v) => (arp.mode = v),
    );
    const oct = new Selector({ label: 'Octaves', options: ['1', '2', '3'], def: '1' }, String(arp.octaves), (v) => (arp.octaves = Number(v)));
    const rate = new Selector({ label: 'Rate', options: Object.keys(ARP_RATES), def: '1/16' }, arp.rate, (v) => (arp.rate = v));
    const arpBtns = el('div', 'seq__group');
    arpBtns.append(this.arpBtn, this.latchBtn);
    arpBar.append(heading('Arpeggiator'), arpBtns, mode.el, oct.el, rate.el);

    // Grid
    this.gridWrap = el('div', 'seq__scroll');
    this.grid = el('div', 'seq__grid');
    this.gridWrap.append(this.grid);

    r.append(bar, arpBar, this.gridWrap);
  }

  // ── Instrument switching ──

  setInstrument(def) {
    this.current = def;
    this.cursor = 0;
    this.len.set(this.track.pattern.length, false);
    this.root.classList.toggle('seq--drums', !!def.drums);
    this._renderGrid();
    this._renderChips();
  }

  _renderChips() {
    this.chips.innerHTML = '';
    for (const def of this.o.instruments) {
      const tr = this.o.getTrack(def.id);
      const chip = button(`seq__chip${def.id === this.current?.id ? ' is-current' : ''}${tr.pattern.enabled ? ' is-on' : ''}`, `<span class="led"></span>${def.model}`);
      chip.title = `${def.model} track ${tr.pattern.enabled ? 'on' : 'off'} — click to toggle`;
      chip.setAttribute('aria-pressed', String(tr.pattern.enabled));
      chip.addEventListener('click', () => {
        tr.pattern.enabled = !tr.pattern.enabled;
        this._changed();
        this._renderChips();
      });
      this.chips.append(chip);
    }
    this.trackBtn.classList.toggle('is-on', this.track.pattern.enabled);
  }

  // ── Grid ──

  _renderGrid() {
    const g = this.grid;
    g.innerHTML = '';
    const { pattern, drums } = this.track;
    this.cells = [];
    if (drums) this._renderDrumGrid(g, pattern);
    else this._renderMelodicGrid(g, pattern);
    this._markPlayhead(this.playhead);
  }

  _renderDrumGrid(g, p) {
    g.className = 'seq__grid seq__grid--drums';
    const kit = this.current.KIT;
    // Render top-down: hats/cymbals on top, kick at the bottom (like most drum machines)
    const order = [11, 10, 6, 4, 8, 1, 9, 7, 5, 3, 2, 0];
    this.cells = Array.from({ length: STEPS }, () => []);
    for (const r of order) {
      const row = el('div', 'drow');
      const lab = button('drow__label', kit[r].short);
      lab.title = `${kit[r].name} — click to preview`;
      lab.addEventListener('pointerdown', () => {
        if (this.o.ensureAudio()) this.o.preview(DRUM_BASE + r, 0.85);
      });
      row.append(lab);
      for (let i = 0; i < STEPS; i++) {
        const c = button('dcell', '');
        c.dataset.v = p.rows[r][i];
        c.classList.toggle('is-beat', i % 4 === 0);
        c.classList.toggle('is-off-len', i >= p.length);
        c.setAttribute('aria-label', `${kit[r].name} step ${i + 1}`);
        c.addEventListener('click', () => {
          p.rows[r][i] = (p.rows[r][i] + 1) % 3;
          c.dataset.v = p.rows[r][i];
          if (p.rows[r][i] && !this.t.playing && this.o.ensureAudio()) this.o.preview(DRUM_BASE + r, p.rows[r][i] === 2 ? 1 : 0.7);
          this._changed();
        });
        this.cells[i].push(c);
        row.append(c);
      }
      g.append(row);
    }
  }

  _renderMelodicGrid(g, p) {
    g.className = 'seq__grid seq__grid--mel';
    for (let i = 0; i < STEPS; i++) {
      const s = p.steps[i];
      const col = el('div', 'mstep');
      col.classList.toggle('is-beat', i % 4 === 0);
      col.classList.toggle('is-off-len', i >= p.length);
      col.classList.toggle('is-cursor', this.rec && i === this.cursor);

      const num = el('div', 'mstep__num');
      num.textContent = String(i + 1);

      const gate = button(`mstep__gate${s.on ? ' is-on' : ''}`, '<span class="led"></span>');
      gate.setAttribute('aria-label', `Step ${i + 1} ${s.on ? 'on' : 'off'}`);
      gate.addEventListener('click', () => {
        s.on = !s.on;
        gate.classList.toggle('is-on', s.on);
        gate.setAttribute('aria-label', `Step ${i + 1} ${s.on ? 'on' : 'off'}`);
        this._changed();
      });

      const note = el('div', 'mstep__note');
      note.tabIndex = 0;
      note.setAttribute('role', 'spinbutton');
      note.setAttribute('aria-label', `Step ${i + 1} note`);
      const show = () => {
        note.textContent = noteName(s.note);
        note.setAttribute('aria-valuenow', s.note);
        note.setAttribute('aria-valuetext', noteName(s.note));
      };
      show();
      this._bindNote(note, s, i, show);

      const acc = button(`mstep__flag${s.accent ? ' is-on' : ''}`, 'Acc');
      acc.title = 'Accent (louder)';
      acc.addEventListener('click', () => {
        s.accent = !s.accent;
        acc.classList.toggle('is-on', s.accent);
        this._changed();
      });
      const sld = button(`mstep__flag${s.slide ? ' is-on' : ''}`, 'Sld');
      sld.title = 'Slide / tie into the next step (glides in mono mode)';
      sld.addEventListener('click', () => {
        s.slide = !s.slide;
        sld.classList.toggle('is-on', s.slide);
        this._changed();
      });

      col.append(num, gate, note, acc, sld);
      col.addEventListener('pointerdown', () => {
        if (this.rec) this._setCursor(i);
      });
      this.cells.push([col]);
      g.append(col);
    }
  }

  _bindNote(elm, s, i, show) {
    let startY = 0;
    let startNote = 0;
    let drag = false;
    const change = (n) => {
      n = Math.min(108, Math.max(12, n));
      if (n === s.note) return;
      s.note = n;
      show();
      this._changed();
    };
    elm.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      elm.setPointerCapture(e.pointerId);
      drag = true;
      startY = e.clientY;
      startNote = s.note;
      elm.focus({ preventScroll: true });
    });
    elm.addEventListener('pointermove', (e) => {
      if (drag) change(startNote + Math.round((startY - e.clientY) / 7));
    });
    const end = () => {
      if (drag && !this.t.playing && this.o.ensureAudio()) this.o.preview(s.note, 0.75);
      drag = false;
    };
    elm.addEventListener('pointerup', end);
    elm.addEventListener('pointercancel', () => (drag = false));
    elm.addEventListener('wheel', (e) => {
      e.preventDefault();
      change(s.note + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 12 : 1));
    }, { passive: false });
    elm.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 1, ArrowDown: -1, PageUp: 12, PageDown: -12 }[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      change(s.note + d);
    });
  }

  // ── Playhead ──

  /** Called by the transport for every scheduled step (absolute index). */
  onStep(s, time, now) {
    if (s < 0) {
      for (const id of this._timers) clearTimeout(id);
      this._timers.clear();
      this._markPlayhead(-1);
      return;
    }
    const len = this.track.pattern.length;
    const i = s % len;
    const id = setTimeout(() => {
      this._timers.delete(id);
      this._markPlayhead(i);
    }, Math.max(0, (time - now) * 1000));
    this._timers.add(id);
  }

  _markPlayhead(i) {
    if (this.playhead >= 0 && this.cells[this.playhead]) for (const c of this.cells[this.playhead]) c.classList.remove('is-playing');
    this.playhead = i;
    if (i >= 0 && this.cells[i]) for (const c of this.cells[i]) c.classList.add('is-playing');
  }

  // ── Actions ──

  togglePlay() {
    if (this.t.playing) {
      this.t.stop();
      this.o.flash('STOP');
    } else {
      if (!this.o.ensureAudio()) return;
      this.t.start();
      this.o.flash(this.t.playing ? `PLAY ${Math.round(this.t.bpm)} BPM` : 'AUDIO NOT READY');
    }
    // The LED reflects the real transport state, never the intent.
    this.playBtn.classList.toggle('is-on', this.t.playing);
  }

  setRec(on) {
    this.rec = on;
    this.recBtn.classList.toggle('is-on', on);
    this._renderGrid();
    this.o.flash(on ? (this.t.playing ? 'REC: PLAY ALONG' : `REC: STEP ${this.cursor + 1}`) : 'REC OFF');
  }

  _setCursor(i) {
    this.cursor = i;
    if (!this.track.drums) {
      this.cells.forEach(([c], k) => c.classList.toggle('is-cursor', k === i));
    }
  }

  /** Main routes played notes here while REC is armed. */
  record(note, vel) {
    if (!this.rec) return;
    const { pattern: p, drums } = this.track;
    const i = this.t.playing ? this.t.nearestStep() % p.length : this.cursor;
    if (drums) {
      const r = ((note % 12) + 12) % 12;
      p.rows[r][i] = vel > 0.9 ? 2 : 1;
      if (!this.t.playing) this._setCursor((i + 1) % p.length);
      this._renderGrid();
    } else {
      p.steps[i] = { on: true, note, accent: vel > 0.9, slide: false };
      if (!this.t.playing) this.cursor = (i + 1) % p.length;
      this._renderGrid();
    }
    this.o.flash(`REC ${drums ? this.current.KIT[note % 12].short : noteName(note)} → ${i + 1}`);
    this._changed();
  }

  clear() {
    const tr = this.track;
    const keepEnabled = tr.pattern.enabled;
    const fresh = tr.drums ? emptyDrums() : emptyMelodic();
    fresh.enabled = keepEnabled;
    fresh.length = tr.pattern.length;
    Object.assign(tr.pattern, fresh);
    this.cursor = 0;
    this._renderGrid();
    this._changed();
    this.o.flash('PATTERN CLEARED');
  }

  refresh() {
    this.len.set(this.track.pattern.length, false);
    this._renderGrid();
    this._renderChips();
  }

  _changed() {
    this.o.onPatternChange();
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(cls, html) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = html;
  return b;
}

function heading(text) {
  const h = el('h2', 'seq__title');
  h.textContent = text;
  return h;
}
