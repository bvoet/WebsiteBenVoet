// Shared parameter helpers used by every instrument.

import { fmt } from '../ui/format.js';

/** Effects-rack parameters. Every instrument has its own rack. */
export const FX_PARAMS = {
  drive: { label: 'Drive', min: 0, max: 1, def: 0, format: fmt.pct, fx: true },
  delayTime: { label: 'Time', min: 0.02, max: 1.5, curve: 'log', def: 0.32, format: fmt.time, fx: true },
  delayFeedback: { label: 'Fdbk', min: 0, max: 0.92, def: 0.35, format: fmt.pct, fx: true },
  delayMix: { label: 'Mix', min: 0, max: 1, def: 0, format: fmt.pct, fx: true },
  reverbSize: { label: 'Size', min: 0.3, max: 8, curve: 'log', def: 2.5, format: fmt.time, fx: true },
  reverbMix: { label: 'Mix', min: 0, max: 1, def: 0.15, format: fmt.pct, fx: true },
  volume: { label: 'Volume', min: 0, max: 1, def: 0.75, format: fmt.pct, fx: true, size: 'lg' },
};

export const FX_LAYOUT = [
  { title: 'Drive', keys: ['drive'] },
  { title: 'Delay', keys: ['delayTime', 'delayFeedback', 'delayMix'] },
  { title: 'Reverb', keys: ['reverbSize', 'reverbMix'] },
  { title: 'Output', keys: ['volume'] },
];

/** Poly/mono, glide and velocity — shared by the melodic instruments. */
export const VOICE_PARAMS = {
  voiceMode: { label: 'Mode', type: 'select', options: ['poly', 'mono'], def: 'poly' },
  glide: { label: 'Glide', min: 0, max: 2, curve: 'pow', exp: 3, def: 0, format: fmt.time },
  velocity: { label: 'Vel Sens', min: 0, max: 1, def: 0.6, format: fmt.pct },
};

export function defaultParams(PARAMS) {
  const p = {};
  for (const [k, d] of Object.entries(PARAMS)) p[k] = Array.isArray(d.def) ? [...d.def] : d.def;
  return p;
}

/** Validate & clamp a (possibly untrusted, e.g. from a share link) patch. */
export function sanitizePatch(PARAMS, raw) {
  const out = defaultParams(PARAMS);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, d] of Object.entries(PARAMS)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (d.type === 'select') {
      if (d.options.includes(String(v))) out[k] = String(v);
    } else if (d.type === 'wave') {
      if (Array.isArray(v) && v.length === d.def.length) {
        out[k] = v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0));
      }
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return out;
}

/** Only keep values that differ from defaults → short share links. */
export function diffPatch(params, defaults) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    const d = defaults[k];
    if (Array.isArray(v)) {
      if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v.map((x) => Math.round(x * 100) / 100);
    } else if (v !== d) {
      out[k] = typeof v === 'number' ? Number(v.toPrecision(5)) : v;
    }
  }
  return out;
}
