// Phosphor: retro CRT audio visualizer.
// Sources: microphone, a built-in demo synth, or a local audio file.
// Views: oscilloscope, spectrum, spectrogram (waterfall) and phase (XY).

const $ = (sel) => document.querySelector(sel);

const room = $('#room');
const canvas = $('#canvas');
const g = canvas.getContext('2d');
const startEl = $('#start');
const startError = $('#start-error');
const roMode = $('#ro-mode');
const roNote = $('#ro-note');
const roSrc = $('#ro-src');
const playBtn = $('#play');
const volWrap = $('#vol-wrap');
const fileInput = $('#file');

const MODES = { scope: 'SCOPE', spectrum: 'SPECTRUM', spectrogram: 'WATERFALL', phase: 'PHASE' };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const state = {
  mode: 'scope',
  gain: 1,
  glow: 0.75,
  frozen: false,
  source: null, // 'mic' | 'demo' | 'file'
  label: 'NO SIGNAL',
};

// ─── Audio graph ──────────────────────────────────────────────────────────
// source → input → analyser            (what we draw)
// source → output → destination        (only demo and file are audible)

let ctx = null;
let input = null;
let output = null;
let analyser = null;
let timeBuf = null;
let freqBuf = null;
let stopSource = () => {};

function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    input = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -15;
    input.connect(analyser);
    output = ctx.createGain();
    output.gain.value = Number($('#volume').value);
    output.connect(ctx.destination);
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

function setSourceUI(name, label) {
  state.source = name;
  state.label = label;
  roSrc.textContent = label;
  for (const b of document.querySelectorAll('.panel [data-source]')) b.classList.toggle('is-on', b.dataset.source === name);
  playBtn.hidden = name !== 'file';
  volWrap.hidden = name === 'mic' || !name;
  startEl.hidden = Boolean(name);
}

async function useSource(name) {
  startError.hidden = true;
  if (name === 'file') {
    fileInput.click();
    return;
  }
  ensureAudio(); // synchronous, inside the click: unlocks audio on iOS too
  stopSource();
  if (name === 'mic') await startMic();
  else if (name === 'demo') startDemo();
}

// ── Microphone ──

async function startMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return showStartError('Your browser can\'t access the microphone here (it needs HTTPS).');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = ctx.createMediaStreamSource(stream);
    src.connect(input); // never to the speakers: that would feed back
    stopSource = () => {
      src.disconnect();
      for (const t of stream.getTracks()) t.stop();
    };
    setSourceUI('mic', 'MIC');
  } catch (err) {
    const msg = err && err.name === 'NotAllowedError'
      ? 'Microphone access was blocked. Allow it in your browser\'s site settings and try again.'
      : 'No microphone found, or it is in use by another app.';
    showStartError(msg);
  }
}

function showStartError(msg) {
  setSourceUI(null, 'NO SIGNAL');
  startEl.hidden = false;
  startError.textContent = msg;
  startError.hidden = false;
}

// ── Audio file ──

function startFile(file) {
  if (!file || !file.type.startsWith('audio')) {
    showStartError('That doesn\'t look like an audio file.');
    return;
  }
  ensureAudio();
  stopSource();
  const url = URL.createObjectURL(file);
  const el = new Audio();
  el.src = url;
  el.loop = true;
  const src = ctx.createMediaElementSource(el);
  src.connect(input);
  src.connect(output);
  el.play().catch(() => {});
  playBtn.textContent = 'Pause';
  playBtn.onclick = () => {
    if (el.paused) { el.play(); playBtn.textContent = 'Pause'; } else { el.pause(); playBtn.textContent = 'Play'; }
  };
  stopSource = () => {
    el.pause();
    src.disconnect();
    URL.revokeObjectURL(url);
  };
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 28).toUpperCase();
  setSourceUI('file', name || 'FILE');
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (f) startFile(f);
});

// Drag & drop anywhere on the page.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; room.classList.add('is-drop'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; room.classList.remove('is-drop'); } });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  room.classList.remove('is-drop');
  const f = e.dataTransfer?.files?.[0];
  if (f) startFile(f);
});

// ── Demo synth: a looping Am–F–C–G groove ──

function startDemo() {
  const bus = ctx.createGain();
  bus.gain.value = 0.55;
  bus.connect(input);
  bus.connect(output);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const ARP = [0, 1, 2, 3, 4, 2, 3, 1];
  const bpm = 104;
  const step = 60 / bpm / 4; // 16ths
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  let n = 0;
  let next = ctx.currentTime + 0.08;

  const env = (gain, t, peak, decay) => {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  };
  const done = (...nodes) => () => nodes.forEach((x) => x.disconnect());

  function lead(t, midi) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const v = ctx.createGain();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o1.frequency.value = mtof(midi);
    o2.frequency.value = mtof(midi) * 1.004;
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900 + 1600 * (0.5 + 0.5 * Math.sin(n / 24)), t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    o1.connect(f);
    o2.connect(f);
    f.connect(v);
    v.connect(bus);
    env(v, t, 0.16, 0.26);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.3);
    o2.stop(t + 0.3);
    o2.onended = done(o1, o2, f, v);
  }

  function bass(t, midi) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    o.connect(v);
    v.connect(bus);
    env(v, t, 0.5, step * 3.6);
    o.start(t);
    o.stop(t + step * 4);
    o.onended = done(o, v);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(v);
    v.connect(bus);
    env(v, t, 0.9, 0.32);
    o.start(t);
    o.stop(t + 0.35);
    o.onended = done(o, v);
  }

  function hat(t, open) {
    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const v = ctx.createGain();
    s.buffer = noise;
    f.type = 'highpass';
    f.frequency.value = 7000;
    s.connect(f);
    f.connect(v);
    v.connect(bus);
    env(v, t, open ? 0.12 : 0.07, open ? 0.18 : 0.05);
    s.start(t);
    s.stop(t + 0.2);
    s.onended = done(s, f, v);
  }

  function schedule() {
    while (next < ctx.currentTime + 0.12) {
      const bar = Math.floor(n / 16) % CHORDS.length;
      const s16 = n % 16;
      const chord = CHORDS[bar];
      const k = ARP[s16 % ARP.length];
      lead(next, chord[k % 3] + 12 * Math.floor(k / 3));
      if (s16 % 4 === 0) bass(next, chord[0] - 24);
      if (s16 === 0 || s16 === 8 || s16 === 10) kick(next);
      if (s16 % 2 === 0) hat(next, s16 === 14);
      next += step;
      n++;
    }
  }

  schedule();
  const timer = setInterval(schedule, 25);
  stopSource = () => {
    clearInterval(timer);
    // Fade out instead of cutting scheduled notes off with a click.
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => bus.disconnect(), 300);
  };
  setSourceUI('demo', 'DEMO');
}

// ─── Pitch detection (normalised autocorrelation) ─────────────────────────

const pitchHistory = [];

function detectPitch(buf, sr) {
  const N = 2048;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.008) return null;

  const minLag = Math.floor(sr / 1200);
  const maxLag = Math.min(Math.floor(sr / 55), N - 1);
  const W = N - maxLag;
  const r = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let ac = 0;
    let m = 0;
    for (let i = 0; i < W; i++) {
      const a = buf[i];
      const b = buf[i + lag];
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
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (lag + (Number.isFinite(shift) ? shift : 0));
    }
  }
  return null;
}

function noteLabel(f) {
  const midi = 69 + 12 * Math.log2(f / 440);
  const n = Math.round(midi);
  const cents = Math.round((midi - n) * 100);
  const name = NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  const c = cents === 0 ? '±0' : (cents > 0 ? `+${cents}` : `${cents}`);
  return `${name}  ${f.toFixed(1)} Hz  ${c}¢`;
}

// ─── Drawing ──────────────────────────────────────────────────────────────

let W = 0;
let H = 0;
let dpr = 1;
let phosphor = '140, 255, 110';
let crtBg = '#040804';
const waterfall = document.createElement('canvas');
const wg = waterfall.getContext('2d');
const peaks = new Float32Array(128);
let lastPeriod = 0;
let envelope = 0.05; // recent peak level, for automatic scaling

// Scope and phase scale to the recent peak, so quiet sources (a guitar a metre
// from the mic) still fill the screen. The gain slider multiplies on top.
function autoScale() {
  let peak = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const v = Math.abs(timeBuf[i]);
    if (v > peak) peak = v;
  }
  envelope = Math.max(peak, envelope * 0.985);
  return state.gain * 0.85 / Math.max(envelope, 0.02);
}

function readTheme() {
  const cs = getComputedStyle(document.body);
  phosphor = cs.getPropertyValue('--phosphor').trim() || phosphor;
  crtBg = cs.getPropertyValue('--crt-bg').trim() || crtBg;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  waterfall.width = canvas.width;
  waterfall.height = canvas.height;
  wg.fillStyle = crtBg;
  wg.fillRect(0, 0, waterfall.width, waterfall.height);
  clearScreen();
}

function clearScreen() {
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = crtBg;
  g.fillRect(0, 0, W, H);
}

function fade() {
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1 - state.glow;
  g.fillStyle = crtBg;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
}

function graticule(divX = 10, divY = 8) {
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = `rgba(${phosphor}, 0.07)`;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < divX; i++) { const x = Math.round((W * i) / divX) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
  for (let i = 1; i < divY; i++) { const y = Math.round((H * i) / divY) + 0.5; g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
}

// A glowing beam: a wide faint stroke under a thin bright one.
function beam(path) {
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${phosphor}, 0.16)`;
  g.lineWidth = 7;
  g.stroke(path);
  g.strokeStyle = `rgba(${phosphor}, 0.95)`;
  g.lineWidth = 1.6;
  g.stroke(path);
  g.globalCompositeOperation = 'source-over';
}

function drawScope() {
  fade();
  graticule();
  const n = 1024;
  // Trigger on a rising zero crossing so the wave stands still.
  let start = 0;
  for (let i = 1; i < timeBuf.length - n; i++) {
    if (timeBuf[i - 1] < 0 && timeBuf[i] >= 0) { start = i; break; }
  }
  const p = new Path2D();
  const mid = H / 2;
  const amp = (H / 2) * autoScale();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = mid - Math.max(-1.1, Math.min(1.1, timeBuf[start + i])) * amp;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  beam(p);
}

// Log-spaced frequency → FFT bin.
function binFor(freq) {
  return Math.min(freqBuf.length - 1, Math.max(1, Math.round((freq / (ctx.sampleRate / 2)) * freqBuf.length)));
}

function drawSpectrum() {
  fade();
  graticule(10, 6);
  const bars = W < 600 ? 48 : 96;
  const fLo = 30;
  const fHi = 16000;
  const gap = W < 600 ? 2 : 3;
  const bw = W / bars;
  g.globalCompositeOperation = 'source-over';
  for (let b = 0; b < bars; b++) {
    const f0 = fLo * (fHi / fLo) ** (b / bars);
    const f1 = fLo * (fHi / fLo) ** ((b + 1) / bars);
    let v = 0;
    for (let k = binFor(f0); k <= binFor(f1); k++) v = Math.max(v, freqBuf[k]);
    const level = Math.min(1, (v / 255) * (0.6 + 0.4 * state.gain));
    const h = level * H * 0.9;
    const x = b * bw + gap / 2;
    g.fillStyle = `rgba(${phosphor}, 0.7)`;
    g.fillRect(x, H - h, bw - gap, h);
    // Brighter cap on the bar, and a slowly falling peak marker.
    g.fillStyle = `rgba(${phosphor}, 1)`;
    g.fillRect(x, H - h, bw - gap, Math.min(h, 3));
    peaks[b] = Math.max(h, peaks[b] - H * 0.006);
    g.fillRect(x, H - peaks[b] - 3, bw - gap, 2);
  }
}

function drawSpectrogram() {
  // Scroll the waterfall one step left and paint a new column on the right.
  const step = Math.max(1, Math.round(2 * dpr));
  const ww = waterfall.width;
  const wh = waterfall.height;
  wg.globalCompositeOperation = 'copy';
  wg.drawImage(waterfall, -step, 0);
  wg.globalCompositeOperation = 'source-over';
  wg.fillStyle = crtBg;
  wg.fillRect(ww - step, 0, step, wh);
  const fLo = 40;
  const fHi = 12000;
  const rows = Math.min(wh, 256);
  const rh = wh / rows;
  for (let r = 0; r < rows; r++) {
    const f = fLo * (fHi / fLo) ** (r / rows);
    const v = freqBuf[binFor(f)] / 255;
    const a = Math.min(1, Math.max(0, (v - 0.2) * 1.4 * state.gain));
    if (a <= 0.02) continue;
    wg.fillStyle = `rgba(${phosphor}, ${a.toFixed(3)})`;
    wg.fillRect(ww - step, wh - (r + 1) * rh, step, Math.ceil(rh));
  }
  g.globalCompositeOperation = 'source-over';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(waterfall, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Frequency guides.
  g.fillStyle = `rgba(${phosphor}, 0.45)`;
  g.font = '16px VT323, monospace';
  for (const f of [100, 1000, 10000]) {
    const y = H - (Math.log(f / fLo) / Math.log(fHi / fLo)) * H;
    g.fillRect(0, y, 10, 1);
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 14, y + 5);
  }
}

function drawPhase() {
  fade();
  graticule(8, 8);
  // Plot the signal against a delayed copy of itself: periodic sounds draw
  // closed loops, harmonics fold them into knots.
  const d = lastPeriod ? Math.max(2, Math.round(lastPeriod / 4)) : 24;
  const n = 2048;
  const cx = W / 2;
  const cy = H / 2;
  const s = Math.min(W, H) * 0.5 * autoScale();
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const x = cx + Math.max(-1.2, Math.min(1.2, timeBuf[i])) * s;
    const y = cy - Math.max(-1.2, Math.min(1.2, timeBuf[i + d])) * s;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  beam(p);
}

function drawIdle(t) {
  // No source yet: a slow sine so the screen feels alive.
  fade();
  graticule();
  const p = new Path2D();
  for (let x = 0; x <= W; x += 3) {
    const y = H / 2 + Math.sin(x / 60 + t / 700) * H * 0.12 * Math.sin(t / 2300);
    if (x === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  beam(p);
}

let frame = 0;
function loop(t) {
  requestAnimationFrame(loop);
  if (state.frozen) return;
  if (!state.source || !analyser) {
    drawIdle(t);
    return;
  }
  analyser.getFloatTimeDomainData(timeBuf);
  analyser.getByteFrequencyData(freqBuf);

  if (frame++ % 3 === 0) {
    const f = detectPitch(timeBuf, ctx.sampleRate);
    if (f) {
      pitchHistory.push(f);
      if (pitchHistory.length > 5) pitchHistory.shift();
      const sorted = [...pitchHistory].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      lastPeriod = ctx.sampleRate / median;
      roNote.textContent = noteLabel(median);
    } else {
      pitchHistory.length = 0;
      roNote.textContent = '--';
    }
  }

  if (state.mode === 'scope') drawScope();
  else if (state.mode === 'spectrum') drawSpectrum();
  else if (state.mode === 'spectrogram') drawSpectrogram();
  else drawPhase();
}

// ─── Controls ─────────────────────────────────────────────────────────────

function setMode(mode) {
  if (!MODES[mode]) return;
  state.mode = mode;
  roMode.textContent = MODES[mode];
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('is-on', b.dataset.mode === mode);
  clearScreen();
  peaks.fill(0);
  try { localStorage.setItem('phosphor.mode', mode); } catch { /* storage blocked */ }
}

function setTheme(theme) {
  if (!['green', 'amber', 'blue'].includes(theme)) return;
  document.body.dataset.theme = theme;
  for (const b of document.querySelectorAll('.swatch')) b.classList.toggle('is-on', b.dataset.theme === theme);
  readTheme();
  wg.fillStyle = crtBg;
  wg.fillRect(0, 0, waterfall.width, waterfall.height);
  clearScreen();
  try { localStorage.setItem('phosphor.theme', theme); } catch { /* storage blocked */ }
}

function setFrozen(on) {
  state.frozen = on;
  roSrc.textContent = on ? 'FROZEN' : (state.label || 'NO SIGNAL');
}

for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => useSource(b.dataset.source));
for (const b of document.querySelectorAll('.swatch')) b.addEventListener('click', () => setTheme(b.dataset.theme));

$('#gain').addEventListener('input', (e) => { state.gain = Number(e.target.value); });
$('#glow').addEventListener('input', (e) => { state.glow = Number(e.target.value); });
$('#volume').addEventListener('input', (e) => {
  if (output) output.gain.setTargetAtTime(Number(e.target.value), ctx.currentTime, 0.02);
});

// Fullscreen, with the panel fading out while the mouse is still.
const fsBtn = $('#fullscreen');
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else room.requestFullscreen?.().catch(() => {});
}
fsBtn.addEventListener('click', toggleFullscreen);
if (!room.requestFullscreen) fsBtn.hidden = true;
let idleTimer = 0;
function wake() {
  room.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (document.fullscreenElement) idleTimer = setTimeout(() => room.classList.add('is-idle'), 2500);
}
document.addEventListener('pointermove', wake);
document.addEventListener('fullscreenchange', () => {
  fsBtn.textContent = document.fullscreenElement ? 'Exit full' : 'Fullscreen';
  wake();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' && e.target.type !== 'range') return;
  if (e.key >= '1' && e.key <= '4') setMode(Object.keys(MODES)[Number(e.key) - 1]);
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.code === 'Space') {
    e.preventDefault();
    setFrozen(!state.frozen);
  }
});

// Stop the microphone when the page is hidden for good.
window.addEventListener('pagehide', () => stopSource());

// ─── Boot ─────────────────────────────────────────────────────────────────

let savedTheme = 'green';
let savedMode = 'scope';
try {
  savedTheme = localStorage.getItem('phosphor.theme') || savedTheme;
  savedMode = localStorage.getItem('phosphor.mode') || savedMode;
} catch { /* storage blocked */ }

readTheme();
new ResizeObserver(resize).observe(canvas);
resize();
setTheme(savedTheme);
setMode(savedMode);
requestAnimationFrame(loop);
