// Rotary knob and vertical fader controls.
//
// Interaction: drag vertically (Shift = fine), mouse wheel, arrow keys
// (Shift = coarse), Home/End, double-click to reset to default.

const SWEEP = 270; // degrees of knob travel

export class Control {
  /**
   * @param {object} def   parameter definition (min, max, curve, step, def, label, format, kind, bipolar, size)
   * @param {number} value initial value
   * @param {(value:number)=>void} onChange
   * @param {(ctl:Control)=>void} [onTouch] called when the user interacts (for the LCD)
   */
  constructor(def, value, onChange, onTouch) {
    this.def = def;
    this.kind = def.kind || 'knob';
    this.onChange = onChange;
    this.onTouch = onTouch;
    this.value = value;
    this.el = this._render();
    this.set(value, false);
  }

  // ── value ↔ normalized position ──

  toNorm(v) {
    const { min, max, curve, exp = 2 } = this.def;
    if (curve === 'log') return Math.log(v / min) / Math.log(max / min);
    if (curve === 'pow') return Math.pow((v - min) / (max - min), 1 / exp);
    return (v - min) / (max - min);
  }

  fromNorm(n) {
    const { min, max, curve, exp = 2, step } = this.def;
    n = Math.min(1, Math.max(0, n));
    let v;
    if (curve === 'log') v = min * Math.pow(max / min, n);
    else if (curve === 'pow') v = min + (max - min) * Math.pow(n, exp);
    else v = min + (max - min) * n;
    if (step) v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, v));
  }

  get text() {
    return this.def.format ? this.def.format(this.value) : String(this.value);
  }

  /** Set value (from code or interaction). */
  set(v, notify = true) {
    const { min, max } = this.def;
    v = Math.min(max, Math.max(min, v));
    const changed = v !== this.value;
    this.value = v;
    this.norm = this.toNorm(v);
    this._draw();
    if (notify && changed) this.onChange(v);
  }

  _setNorm(n) {
    this.set(this.fromNorm(n));
    this.onTouch?.(this);
  }

  // ── DOM ──

  _render() {
    const d = this.def;
    const root = document.createElement('div');
    root.className = `ctl ctl--${this.kind}${d.size ? ` ctl--${d.size}` : ''}`;

    const handle = document.createElement('div');
    handle.className = this.kind === 'knob' ? 'knob' : 'fader';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', d.ariaLabel || d.label);
    handle.setAttribute('aria-valuemin', d.min);
    handle.setAttribute('aria-valuemax', d.max);

    if (this.kind === 'knob') {
      handle.innerHTML = `${tickSvg(d.bipolar)}<div class="knob__body"><div class="knob__cap"></div></div>`;
      this.rotor = handle.querySelector('.knob__body');
    } else {
      handle.innerHTML = '<div class="fader__slot"></div><div class="fader__scale"></div><div class="fader__thumb"></div>';
      this.thumb = handle.querySelector('.fader__thumb');
    }

    const label = document.createElement('div');
    label.className = 'ctl__label';
    label.textContent = d.label;

    const readout = document.createElement('div');
    readout.className = 'ctl__readout';

    if (this.kind === 'knob') root.append(label, handle, readout);
    else root.append(handle, label, readout);

    this.handle = handle;
    this.readout = readout;
    this._bind(handle);
    return root;
  }

  _draw() {
    if (!this.handle) return;
    if (this.rotor) this.rotor.style.transform = `rotate(${-SWEEP / 2 + this.norm * SWEEP}deg)`;
    if (this.thumb) this.thumb.style.setProperty('--pos', this.norm);
    this.readout.textContent = this.text;
    this.handle.setAttribute('aria-valuenow', this.value);
    this.handle.setAttribute('aria-valuetext', this.text);
  }

  _bind(h) {
    let startY = 0;
    let startNorm = 0;
    let dragging = false;

    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      h.focus({ preventScroll: true });
      h.setPointerCapture(e.pointerId);
      dragging = true;
      startY = e.clientY;
      startNorm = this.norm;
      this.el.classList.add('is-active');
      this.onTouch?.(this);
    });
    h.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const range = this.kind === 'knob' ? 180 : h.clientHeight - 18;
      const fine = e.shiftKey ? 0.15 : 1;
      this._setNorm(startNorm + ((startY - e.clientY) / range) * fine);
    });
    const end = () => {
      if (dragging && this.def.spring) this.set(this.def.def); // pitch wheel springs back
      dragging = false;
      this.el.classList.remove('is-active');
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    h.addEventListener('lostpointercapture', end);

    h.addEventListener('dblclick', () => {
      this.set(this.def.def);
      this.onTouch?.(this);
    });

    h.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        this._nudge(dir, e.shiftKey ? 0.2 : 1);
      },
      { passive: false },
    );

    h.addEventListener('keydown', (e) => {
      const coarse = e.shiftKey ? 5 : 1;
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          this._nudge(1, coarse);
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          this._nudge(-1, coarse);
          break;
        case 'Home':
          this._setNorm(0);
          break;
        case 'End':
          this._setNorm(1);
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation(); // don't let the computer keyboard play notes
    });
  }

  _nudge(dir, mult) {
    const { step } = this.def;
    if (step) {
      this.set(this.value + dir * step * (mult >= 5 ? 2 : 1));
      this.onTouch?.(this);
      return;
    }
    this._setNorm(this.toNorm(this.value) + dir * 0.02 * mult);
  }
}

function tickSvg(bipolar) {
  const ticks = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = ((-SWEEP / 2 + (i * SWEEP) / (n - 1)) * Math.PI) / 180;
    const major = i === 0 || i === n - 1 || (bipolar && i === (n - 1) / 2);
    const r1 = major ? 40 : 42;
    const r2 = 47;
    const x1 = 50 + r1 * Math.sin(a);
    const y1 = 50 - r1 * Math.cos(a);
    const x2 = 50 + r2 * Math.sin(a);
    const y2 = 50 - r2 * Math.cos(a);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${major ? ' class="major"' : ''}/>`);
  }
  return `<svg class="knob__ticks" viewBox="0 0 100 100" aria-hidden="true">${ticks.join('')}</svg>`;
}
