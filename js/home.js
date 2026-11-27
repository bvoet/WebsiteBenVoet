// Synth Lab plate: morphs through one waveform per Synth Lab instrument.
// Purely visual; no audio is created here.

const canvas = document.getElementById('wave');
const modelEl = document.getElementById('lcd-model');
const typeEl = document.getElementById('lcd-type');

const TAU = Math.PI * 2;

// Scope stroke colour comes from the CSS (--lcd-fg).
let lcdColor = '#a4ff7c';
function readLcdColor() {
  lcdColor = getComputedStyle(document.documentElement).getPropertyValue('--lcd-fg').trim() || '#a4ff7c';
}
readLcdColor();

// One shape per instrument; each takes phase 0..1 and returns -1..1.
const SHAPES = [
  { model: 'SL-1', type: 'SUBTRACTIVE', fn: (p) => 1 - 2 * p },
  { model: 'FM-2', type: 'FM', fn: (p) => Math.sin(TAU * p + 2.2 * Math.sin(TAU * 3 * p)) },
  {
    model: 'AD-3',
    type: 'ADDITIVE',
    fn: (p) => (Math.sin(TAU * p) + 0.6 * Math.sin(TAU * 2 * p) + 0.45 * Math.sin(TAU * 3 * p)) / 1.6,
  },
  { model: 'WT-4', type: 'WAVETABLE', fn: (p) => (p < 0.5 ? 0.85 : -0.85) },
  {
    model: 'DR-5',
    type: 'DRUMS',
    fn: (p) => Math.exp(-p * 5) * Math.sin(TAU * (3.5 * p - 1.6 * p * p)),
  },
];

const HOLD = 2.2; // seconds per shape
const MORPH = 0.8; // seconds of crossfade into the next one
const CYCLES = 2; // periods shown (the drum hit is shown once)

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ctx = canvas.getContext('2d');
let w = 0;
let h = 0;
let shown = -1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function sample(shape, x) {
  // The drum shape is a one-shot, so it spans the whole screen once.
  const p = shape.model === 'DR-5' ? x : (x * CYCLES) % 1;
  return shape.fn(p);
}

function draw(time) {
  const t = time / 1000;
  const slot = HOLD + MORPH;
  const i = Math.floor(t / slot) % SHAPES.length;
  const local = t % slot;
  const a = SHAPES[i];
  const b = SHAPES[(i + 1) % SHAPES.length];
  // Smoothstep crossfade during the last MORPH seconds of the slot.
  const m = local < HOLD ? 0 : (local - HOLD) / MORPH;
  const k = m * m * (3 - 2 * m);

  const label = k < 0.5 ? a : b;
  if (shown !== SHAPES.indexOf(label)) {
    shown = SHAPES.indexOf(label);
    modelEl.textContent = label.model;
    typeEl.textContent = label.type;
  }

  ctx.clearRect(0, 0, w, h);
  const mid = h * 0.42;
  const amp = h * 0.3;
  ctx.beginPath();
  for (let px = 0; px <= w; px += 2) {
    const x = px / w;
    const y = (1 - k) * sample(a, x) + k * sample(b, x);
    if (px === 0) ctx.moveTo(px, mid - y * amp);
    else ctx.lineTo(px, mid - y * amp);
  }
  ctx.strokeStyle = lcdColor;
  ctx.lineWidth = Math.max(3, w / 80); // a printed mark, not a hairline
  ctx.lineJoin = 'round';
  ctx.stroke();

  if (!reduceMotion) requestAnimationFrame(draw);
}

resize();
window.addEventListener('resize', () => {
  resize();
  if (reduceMotion) draw(0);
});
if (reduceMotion) draw(0);
else requestAnimationFrame(draw);

// Footer year.
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// ─── Catalogue: hovering or focusing an entry shows its plate ────────────

const entries = [...document.querySelectorAll('.entry')];
function activate(entry) {
  for (const e of entries) e.classList.toggle('is-active', e === entry);
}
// Hover intent: a pointer cutting across the list towards the plate
// shouldn't swap plates on the way.
let hoverTimer = 0;
for (const entry of entries) {
  const link = entry.querySelector('.entry__link');
  link.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => activate(entry), 110);
  });
  link.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
  entry.addEventListener('focusin', () => activate(entry));
}
