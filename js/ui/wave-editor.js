// Draw-a-waveform widget: a phosphor-style canvas you paint a single cycle on,
// plus quick shape buttons. Same interface as Control/Selector:
// { el, value, text, set(value, notify) }.

import { SHAPES } from '../synths/wavetable.js';

const SHAPE_BUTTONS = [
  ['sine', 'SIN'],
  ['triangle', 'TRI'],
  ['saw', 'SAW'],
  ['square', 'SQR'],
  ['pulse', 'PLS'],
  ['organ', 'ORG'],
  ['formant', 'FMT'],
  ['random', 'RND'],
  ['smooth', 'SMTH'],
];

export class WaveEditor {
  constructor(def, value, onChange, onTouch) {
    this.def = def;
    this.value = [...value];
    this.onChange = onChange;
    this.onTouch = onTouch;
    this.el = this._render();
    this._draw();
  }

  get text() {
    return 'DRAWN';
  }

  set(v, notify = true) {
    this.value = [...v];
    this._draw();
    if (notify) this.onChange([...this.value]);
  }

  _render() {
    const root = document.createElement('div');
    root.className = 'ctl ctl--wave';

    const canvas = document.createElement('canvas');
    canvas.className = 'wave-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${this.def.label}: drawn waveform. Drag to draw.`);
    this.canvas = canvas;

    const btns = document.createElement('div');
    btns.className = 'wave-shapes';
    for (const [id, label] of SHAPE_BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hw-btn hw-btn--tiny';
      b.textContent = label;
      b.title = `Set ${this.def.label} to ${id}`;
      b.addEventListener('click', () => {
        this.set(this._shape(id));
        this.onTouch?.(this);
      });
      btns.append(b);
    }

    root.append(canvas, btns);
    this._bind(canvas);
    new ResizeObserver(() => this._draw()).observe(canvas);
    return root;
  }

  _shape(id) {
    if (SHAPES[id]) return [...SHAPES[id]];
    const n = this.value.length;
    if (id === 'random') {
      // Random but band-limited-ish: a few random harmonics
      const amps = Array.from({ length: 6 }, (_, i) => (Math.random() * 2 - 1) / (i + 1));
      const out = Array.from({ length: n }, (_, i) => amps.reduce((s, a, k) => s + a * Math.sin((2 * Math.PI * (k + 1) * i) / n), 0));
      const peak = Math.max(...out.map(Math.abs)) || 1;
      return out.map((v) => Math.round((v / peak) * 1000) / 1000);
    }
    // smooth: circular 5-tap blur of the current drawing
    return this.value.map((_, i) => {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += this.value[(i + k + n) % n];
      return Math.round((s / 5) * 1000) / 1000;
    });
  }

  _bind(canvas) {
    let last = null;
    let drawing = false;
    const pointAt = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(-1, 1 - (2 * (e.clientY - r.top)) / r.height));
      return { i: Math.floor(x * this.value.length), y };
    };
    const paint = (pt) => {
      // Interpolate between pointer samples so fast strokes leave no gaps.
      if (last && last.i !== pt.i) {
        const step = pt.i > last.i ? 1 : -1;
        for (let i = last.i; i !== pt.i; i += step) {
          const f = (i - last.i) / (pt.i - last.i);
          this.value[i] = round(last.y + (pt.y - last.y) * f);
        }
      }
      this.value[pt.i] = round(pt.y);
      last = pt;
      this._draw();
      this.onChange([...this.value]);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = null;
      paint(pointAt(e));
      this.onTouch?.(this);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drawing) paint(pointAt(e));
    });
    const end = () => {
      drawing = false;
      last = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  _draw() {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const w = (c.width = Math.round(r.width * dpr));
    const h = (c.height = Math.round(r.height * dpr));
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);

    g.strokeStyle = 'rgba(140,255,110,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = Math.round((i * w) / 4) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    g.moveTo(0, Math.round(h / 2) + 0.5);
    g.lineTo(w, Math.round(h / 2) + 0.5);
    g.stroke();

    const n = this.value.length;
    const pts = this.value.map((v, i) => [((i + 0.5) / n) * w, h / 2 - v * (h / 2) * 0.9]);
    g.fillStyle = 'rgba(164,255,124,0.12)';
    g.beginPath();
    g.moveTo(0, h / 2);
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(w, h / 2);
    g.closePath();
    g.fill();

    g.strokeStyle = '#a4ff7c';
    g.lineWidth = 1.8 * dpr;
    g.shadowColor = '#a4ff7c';
    g.shadowBlur = 5 * dpr;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.shadowBlur = 0;
  }
}

const round = (v) => Math.round(v * 1000) / 1000;
