// TU-6: a chromatic guitar tuner. Microphone → analyser → autocorrelation.
// The microphone is never connected to the speakers.

import { SHARP, TUNINGS, STANDARD, parseTuning, tuningLabel, pitchClass, mtof, ftom, octaveOf } from './music.js';

const $ = (id) => document.getElementById(id);
const els = {
  screen: $('screen'), ticks: $('ticks'), zone: $('zone'), needle: $('needle'),
  note: $('note'), oct: $('oct'), cents: $('cents'), freq: $('freq'), hint: $('hint'),
  flat: $('flag-flat'), ok: $('flag-ok'), sharp: $('flag-sharp'),
  strings: $('strings'), power: $('power'), powerText: $('power-text'), powerLed: $('power-led'),
  tuning: $('tuning'), a4: $('a4'), a4Down: $('a4-down'), a4Up: $('a4-up'), auto: $('auto'), status: $('status'),
};

const STORE_KEY = 'benvoet.tuner';
const A4_MIN = 430;
const A4_MAX = 450;
const IN_TUNE = 3; // cents
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── State ───────────────────────────────────────────────────────────────

const state = {
  tuningId: 'EADGBE', // or 'chromatic'
  tuning: STANDARD,
  a4: 440,
  lock: null, // locked string index, or null for auto
  reading: null, // { freq, midi, cents, string, at }
  tuned: new Set(), // strings that have been held in tune
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Number.isInteger(s.a4) && s.a4 >= A4_MIN && s.a4 <= A4_MAX) state.a4 = s.a4;
    if (s.tuning === 'chromatic' || parseTuning(s.tuning)) state.tuningId = s.tuning;
  } catch { /* storage blocked or corrupt */ }
  // A ?tuning= link (e.g. from SongX) wins over the saved one.
  const fromUrl = new URLSearchParams(location.search).get('tuning');
  if (fromUrl && parseTuning(fromUrl)) state.tuningId = fromUrl;
  state.tuning = state.tuningId === 'chromatic' ? null : parseTuning(state.tuningId);
}

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ tuning: state.tuningId, a4: state.a4 }));
  } catch { /* storage blocked */ }
}

// ─── Meter drawing ───────────────────────────────────────────────────────

const CX = 150;
const CY = 158;
const SWEEP = 62; // degrees either side for ±50 cents

const angleFor = (cents) => (Math.max(-50, Math.min(50, cents)) / 50) * SWEEP;
function polar(deg, r) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function drawScale() {
  let s = '';
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    const [x1, y1] = polar(angleFor(c), major ? 112 : 120);
    const [x2, y2] = polar(angleFor(c), 130);
    s += `<line class="meter__tick${major ? ' is-major' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    if (major) {
      const [tx, ty] = polar(angleFor(c), 99);
      const label = c === 0 ? '0' : c > 0 ? `+${c}` : `−${-c}`;
      s += `<text class="meter__num" x="${tx.toFixed(1)}" y="${(ty + 5).toFixed(1)}" text-anchor="middle">${label}</text>`;
    }
  }
  els.ticks.innerHTML = s;
  const [ax, ay] = polar(angleFor(-IN_TUNE * 1.6), 136);
  const [bx, by] = polar(angleFor(IN_TUNE * 1.6), 136);
  els.zone.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} A136 136 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`);
}

let needleCents = 0;
let needleTarget = 0;

function animateNeedle() {
  const k = reduceMotion ? 1 : 0.25;
  needleCents += (needleTarget - needleCents) * k;
  if (Math.abs(needleTarget - needleCents) < 0.05) needleCents = needleTarget;
  els.needle.setAttribute('transform', `rotate(${angleFor(needleCents).toFixed(2)} ${CX} ${CY})`);
}

// ─── UI ──────────────────────────────────────────────────────────────────

function buildTuningSelect() {
  els.tuning.innerHTML = '';
  const add = (parent, value, text) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    parent.appendChild(o);
  };
  add(els.tuning, 'chromatic', 'Chromatic · any note');
  const group = document.createElement('optgroup');
  group.label = 'Guitar';
  for (const t of TUNINGS) add(group, t.id, `${t.songx ? '★ ' : ''}${tuningLabel(t)}`);
  if (state.tuning && !TUNINGS.some((t) => t.id === state.tuningId)) {
    add(group, state.tuningId, `From link · ${state.tuning.names.join(' ')}`);
  }
  els.tuning.appendChild(group);
  els.tuning.value = state.tuningId;
}

function buildStrings() {
  els.strings.innerHTML = '';
  els.strings.hidden = !state.tuning;
  els.auto.hidden = !state.tuning;
  if (!state.tuning) return;
  state.tuning.names.forEach((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'string';
    b.dataset.i = String(i);
    const oct = octaveOf(state.tuning.midi[i]);
    b.innerHTML = `<span class="string__no">${6 - i}</span><span class="string__note">${name}<sub>${oct}</sub></span><span class="string__check" aria-hidden="true"></span>`;
    b.setAttribute('aria-label', `String ${6 - i}, ${name}${oct}: play reference tone`);
    els.strings.appendChild(b);
  });
  renderStrings();
}

function renderStrings() {
  const active = state.lock ?? state.reading?.string ?? null;
  for (const b of els.strings.children) {
    const i = Number(b.dataset.i);
    b.classList.toggle('is-target', i === active);
    b.classList.toggle('is-locked', i === state.lock);
    b.classList.toggle('is-tuned', state.tuned.has(i));
  }
  els.auto.setAttribute('aria-pressed', String(state.lock == null));
}

function renderA4() {
  els.a4.textContent = `A4 ${state.a4} Hz`;
  els.a4Down.disabled = state.a4 <= A4_MIN;
  els.a4Up.disabled = state.a4 >= A4_MAX;
}

function noteName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  // Use the tuning's own spelling (Eb, not D#) when the note is one of its strings.
  const own = state.tuning?.names.find((n) => pitchClass(n) === pc);
  return own || SHARP[pc];
}

let inTuneSince = 0;

function render() {
  const r = state.reading;
  const live = r && performance.now() - r.at < 900;
  els.screen.classList.toggle('is-live', !!live);
  els.screen.classList.toggle('is-hold', !!r && !live && running());

  if (!r || !running()) {
    needleTarget = 0;
    els.note.textContent = '--';
    els.oct.textContent = '';
    els.cents.innerHTML = '&nbsp;';
    els.freq.innerHTML = '&nbsp;';
    els.hint.textContent = running() ? 'Play a string' : 'Power on and play a string';
    setFlags(null);
    renderStrings();
    return;
  }

  const nearest = Math.round(r.midi);
  els.note.textContent = noteName(nearest);
  els.oct.textContent = String(octaveOf(nearest));
  els.freq.textContent = `${r.freq.toFixed(1)} Hz`;
  const c = Math.round(r.cents);
  els.cents.textContent = `${c > 0 ? '+' : c < 0 ? '−' : '±'}${Math.abs(c)}¢`;
  needleTarget = live ? r.cents : needleTarget;

  const ok = Math.abs(r.cents) <= IN_TUNE;
  let hint;
  if (state.tuning) {
    const s = r.string;
    const target = `${state.tuning.names[s]}${octaveOf(state.tuning.midi[s])}`;
    if (ok) hint = `String ${6 - s} · ${target} · in tune`;
    else if (Math.abs(r.cents) >= 50) hint = `String ${6 - s} · ${target} · tune ${r.cents < 0 ? 'up' : 'down'} ${Math.abs(r.cents / 100).toFixed(1)} semitones`;
    else hint = `String ${6 - s} · ${target} · tune ${r.cents < 0 ? 'up ↑' : 'down ↓'}`;
  } else {
    hint = ok ? 'In tune' : r.cents < 0 ? 'Flat · tune up ↑' : 'Sharp · tune down ↓';
  }
  els.hint.textContent = live ? hint : 'Play a string';

  // A string counts as tuned once it has stayed in tune for half a second.
  if (live && ok) {
    if (!inTuneSince) inTuneSince = performance.now();
    if (state.tuning && performance.now() - inTuneSince > 500) state.tuned.add(r.string);
  } else {
    inTuneSince = 0;
  }
  setFlags(live ? r.cents : null);
  renderStrings();
}

function setFlags(cents) {
  const on = cents != null;
  els.ok.classList.toggle('is-on', on && Math.abs(cents) <= IN_TUNE);
  els.flat.classList.toggle('is-on', on && cents < -IN_TUNE);
  els.sharp.classList.toggle('is-on', on && cents > IN_TUNE);
}

function showStatus(text) {
  els.status.hidden = !text;
  els.status.textContent = text || '';
}

// ─── Audio ───────────────────────────────────────────────────────────────

let ctx = null;
let analyser = null;
let buf = null;
let input = null; // MediaStreamSource or test-tone node feeding the analyser
let stream = null;
let testNodes = [];

/** Create the context inside the user gesture (synchronous). */
function ensureCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx({ latencyHint: 'interactive' });
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    buf = new Float32Array(analyser.fftSize);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

const running = () => !!input;

function setPower(on) {
  els.power.setAttribute('aria-pressed', String(on));
  els.powerText.textContent = on ? 'Power off' : 'Power on';
  els.powerLed.classList.toggle('is-on', on);
}

async function startMic() {
  showStatus('');
  try {
    ensureCtx();
  } catch {
    showStatus('Audio is not available in this browser.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showStatus('This browser does not allow microphone access here. Open the page over https in a current browser.');
    return;
  }
  els.hint.textContent = 'Waiting for the microphone…';
  let mic;
  try {
    // Voice processing would eat sustained notes, so switch it all off.
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    showStatus(denied
      ? 'Microphone access was blocked. Allow it in the address bar, then press Power on again.'
      : 'No microphone found. Plug one in (or use the built-in mic) and try again.');
    render();
    return;
  }
  stopInput();
  stream = mic;
  input = ctx.createMediaStreamSource(stream);
  input.connect(analyser); // analyser only: never to the speakers
  setPower(true);
  startLoop();
}

function stopInput() {
  if (input) input.disconnect();
  input = null;
  for (const n of testNodes) {
    try { n.stop?.(); } catch { /* already stopped */ }
    n.disconnect();
  }
  testNodes = [];
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
}

function stop() {
  stopInput();
  state.reading = null;
  recent.length = 0;
  setPower(false);
  render();
}

/** Reference tone for a string: a soft plucked triangle at the target pitch. */
function playReference(i) {
  try {
    ensureCtx();
  } catch {
    return;
  }
  const f = mtof(state.tuning.midi[i], state.a4);
  const t = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.22, t + 0.01);
  out.gain.setTargetAtTime(0.0001, t + 0.05, 0.7);
  out.connect(ctx.destination);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(4000, f * 6);
  tone.connect(out);
  for (const [type, mult, level] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + 3);
    o.onended = () => g.disconnect();
  }
  setTimeout(() => {
    tone.disconnect();
    out.disconnect();
  }, 3200);
}

// ─── Pitch detection (normalised autocorrelation) ───────────────────────

function detectPitch(data, sr) {
  const N = data.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += data[i] * data[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.005) return null;

  const minLag = Math.floor(sr / 1400);
  const maxLag = Math.min(Math.floor(sr / 50), (N >> 1) - 1); // down to ~50 Hz (Bb1 is 58 Hz)
  const W = N - maxLag;
  const r = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let ac = 0;
    let m = 0;
    for (let i = 0; i < W; i++) {
      const a = data[i];
      const b = data[i + lag];
      ac += a * b;
      m += a * a + b * b;
    }
    r[lag] = m > 0 ? (2 * ac) / m : 0;
  }
  // Highest peak, then the first peak that comes close to it (avoids octave errors).
  let best = 0;
  for (let lag = minLag + 1; lag <= maxLag; lag++) if (r[lag] > best) best = r[lag];
  if (best < 0.6) return null;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1];
      const b = r[lag];
      const c = r[lag + 1];
      const den = a - 2 * b + c;
      const shift = den ? (a - c) / (2 * den) : 0;
      return sr / (lag + shift);
    }
  }
  return null;
}

// Median of the last few readings keeps the needle calm.
const recent = [];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

function analyse() {
  analyser.getFloatTimeDomainData(buf);
  const f = detectPitch(buf, ctx.sampleRate);
  if (!f) return;
  // A new note (more than a semitone away) starts a fresh history.
  if (recent.length && Math.abs(12 * Math.log2(f / median(recent))) > 0.8) recent.length = 0;
  recent.push(f);
  if (recent.length > 5) recent.shift();
  const freq = median(recent);
  const midi = ftom(freq, state.a4);

  let string = null;
  let cents;
  if (state.tuning) {
    string = state.lock;
    if (string == null) {
      let bestD = Infinity;
      state.tuning.midi.forEach((m, i) => {
        const d = Math.abs(midi - m);
        if (d < bestD) {
          bestD = d;
          string = i;
        }
      });
    }
    cents = 100 * (midi - state.tuning.midi[string]);
  } else {
    cents = 100 * (midi - Math.round(midi));
  }
  state.reading = { freq, midi, cents, string, at: performance.now() };
}

let loopOn = false;
let lastAnalyse = 0;

function startLoop() {
  if (loopOn) return;
  loopOn = true;
  const frame = (now) => {
    if (!running()) {
      loopOn = false;
      animateNeedle();
      return;
    }
    if (now - lastAnalyse > 45) {
      lastAnalyse = now;
      analyse();
      render();
    }
    animateNeedle();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ─── Events ──────────────────────────────────────────────────────────────

els.power.addEventListener('click', () => {
  if (running()) stop();
  else startMic();
});

els.tuning.addEventListener('change', () => {
  const v = els.tuning.value;
  state.tuningId = v === 'chromatic' || parseTuning(v) ? v : 'EADGBE';
  state.tuning = state.tuningId === 'chromatic' ? null : parseTuning(state.tuningId);
  state.lock = null;
  state.reading = null;
  state.tuned.clear();
  recent.length = 0;
  saveSettings();
  const url = new URL(location.href);
  if (state.tuning) url.searchParams.set('tuning', state.tuningId);
  else url.searchParams.delete('tuning');
  window.history.replaceState(null, '', url.pathname + url.search);
  buildStrings();
  render();
});

function stepA4(d) {
  state.a4 = Math.max(A4_MIN, Math.min(A4_MAX, state.a4 + d));
  recent.length = 0;
  saveSettings();
  renderA4();
}
els.a4Down.addEventListener('click', () => stepA4(-1));
els.a4Up.addEventListener('click', () => stepA4(1));

els.auto.addEventListener('click', () => {
  state.lock = null;
  renderStrings();
});

els.strings.addEventListener('click', (e) => {
  const b = e.target.closest('.string');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (state.lock === i) {
    state.lock = null; // second tap: back to auto
  } else {
    state.lock = i;
    playReference(i);
  }
  recent.length = 0;
  renderStrings();
});

// Release the microphone when the tab is hidden or closed.
function pause() {
  if (!running()) return;
  stop();
  showStatus('Paused while the page was in the background. Press Power on to continue.');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('pagehide', pause);

// ─── Start ───────────────────────────────────────────────────────────────

loadSettings();
drawScale();
buildTuningSelect();
buildStrings();
renderA4();
render();
animateNeedle();

// Test hook: feed a known tone through the same analyser path.
window.tunerLab = {
  testTone(freq, { type = 'sawtooth', second = 0 } = {}) {
    ensureCtx();
    stopInput();
    const mix = ctx.createGain();
    mix.gain.value = 0.3;
    const parts = [[type, 1, 1]];
    if (second) parts.push(['sine', 2, second]);
    for (const [t, mult, level] of parts) {
      const o = ctx.createOscillator();
      o.type = t;
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(mix);
      o.start();
      testNodes.push(o, g);
    }
    testNodes.push(mix);
    mix.connect(analyser);
    input = mix;
    recent.length = 0;
    setPower(true);
    startLoop();
  },
  stop,
  get state() {
    return state;
  },
};
