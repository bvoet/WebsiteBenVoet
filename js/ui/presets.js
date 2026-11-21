// User preset storage (localStorage) and shareable patch links (URL hash).

const KEY = 'synthlab.sl1.userPresets';

export function loadUserPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === 'string' && p.patch) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Only store values that differ from defaults → short links. */
export function diffPatch(params, defaults) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== defaults[k]) out[k] = typeof v === 'number' ? Number(v.toPrecision(5)) : v;
  }
  return out;
}

const toB64Url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeShare(name, patch) {
  return toB64Url(JSON.stringify({ n: name, p: patch }));
}

export function decodeShare(hash) {
  const m = /(?:^#|&)sl1=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const obj = JSON.parse(fromB64Url(m[1]));
    if (!obj || typeof obj !== 'object') return null;
    return { name: typeof obj.n === 'string' ? obj.n.slice(0, 40) : 'Shared patch', patch: obj.p };
  } catch {
    return null;
  }
}
