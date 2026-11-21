// Per-instrument storage (user presets, sequencer patterns) in localStorage,
// and shareable patch links in the URL hash: #<instrumentId>=<base64url JSON>.
// Every storage access is wrapped: storage can be unavailable (private mode).

const presetKey = (id) => `synthlab.${id}.userPresets`;
const patternKey = (id) => `synthlab.${id}.pattern`;
const LAST_KEY = 'synthlab.lastInstrument';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadUserPresets(id) {
  const raw = read(presetKey(id), []);
  return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === 'string' && p.patch && typeof p.patch === 'object') : [];
}

export const saveUserPresets = (id, list) => write(presetKey(id), list);
export const loadPattern = (id) => read(patternKey(id), null);
export const savePattern = (id, p) => write(patternKey(id), p);
export const loadLastInstrument = () => read(LAST_KEY, null);
export const saveLastInstrument = (id) => write(LAST_KEY, id);

const toB64Url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeShare(id, name, patch, pattern) {
  const obj = { n: name, p: patch };
  if (pattern) obj.s = pattern;
  return `#${id}=${toB64Url(JSON.stringify(obj))}`;
}

/** @returns {{id, name, patch, pattern}|null} — values are untrusted; sanitize before use. */
export function decodeShare(hash, validIds) {
  const m = /^#([a-z0-9]+)=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m || !validIds.includes(m[1])) return null;
  try {
    const obj = JSON.parse(fromB64Url(m[2]));
    if (!obj || typeof obj !== 'object') return null;
    return { id: m[1], name: typeof obj.n === 'string' ? obj.n.slice(0, 40) : 'Shared patch', patch: obj.p, pattern: obj.s };
  } catch {
    return null;
  }
}
