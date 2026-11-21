// A row of latching buttons with LEDs (radio group).

import { WAVE_LABELS, WAVE_ICONS } from './format.js';

export class Selector {
  constructor(def, value, onChange, onTouch) {
    this.def = def;
    this.value = value;
    this.onChange = onChange;
    this.onTouch = onTouch;
    this.buttons = new Map();
    this.el = this._render();
    this.set(value, false);
  }

  get text() {
    return WAVE_LABELS[this.value] || String(this.value).toUpperCase();
  }

  set(v, notify = true) {
    const changed = v !== this.value;
    this.value = v;
    for (const [opt, btn] of this.buttons) {
      const on = opt === v;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on);
      btn.tabIndex = on ? 0 : -1;
    }
    if (notify && changed) this.onChange(v);
  }

  _render() {
    const root = document.createElement('div');
    root.className = 'ctl ctl--select';

    const label = document.createElement('div');
    label.className = 'ctl__label';
    label.textContent = this.def.label;

    const group = document.createElement('div');
    group.className = 'select';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', this.def.ariaLabel || this.def.label);

    for (const opt of this.def.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'select__btn';
      btn.setAttribute('role', 'radio');
      const icon = WAVE_ICONS[opt];
      const name = WAVE_LABELS[opt] || opt.toUpperCase();
      btn.innerHTML =
        `<span class="led" aria-hidden="true"></span>` +
        (icon
          ? `<svg class="select__icon" viewBox="0 0 22 16" aria-hidden="true"><path d="${icon}"/></svg><span class="sr-only">${name}</span>`
          : `<span class="select__txt">${name}</span>`);
      btn.title = name;
      btn.addEventListener('click', () => {
        this.set(opt);
        this.onTouch?.(this);
      });
      btn.addEventListener('keydown', (e) => {
        const opts = this.def.options;
        const i = opts.indexOf(this.value);
        let j = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % opts.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + opts.length) % opts.length;
        if (j < 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.set(opts[j]);
        this.onTouch?.(this);
        this.buttons.get(opts[j]).focus();
      });
      this.buttons.set(opt, btn);
      group.append(btn);
    }

    root.append(label, group);
    return root;
  }
}
