// FB-8: scales and chords on a guitar neck, in any tuning.
// Notes play through Synth Lab instruments (no DOM inside the synths).

import { TUNINGS, STANDARD, ROOTS, parseTuning, tuningLabel, pitchClass, spell, intervalSemis, bestRoot, octaveOf } from './music.js';
import { libraryFingering, diagramSVG, parseFret } from '../songx/js/chords.js';
import { AudioEngine } from './engine/audio-engine.js';
import subtractive from './synths/subtractive.js';
import fm from './synths/fm.js';

const $ = (id) => document.getElementById(id);
const els = {
  root: $('root'), type: $('type'), typeLabel: $('type-label'), tuning: $('tuning'),
  name: $('name'), rowNotes: $('row-notes'), rowIvs: $('row-ivs'),
  neck: $('neck'), sound: $('sound'), play: $('play'), playText: $('play-text'),
  diatonic: $('diatonic'), diatonicChips: $('diatonic-chips'),
  shape: $('shape'), shapeSvg: $('shape-svg'), shapeNote: $('shape-note'),
};

const FRETS = 15;
const INLAYS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1, 19: 1, 21: 1 };

// id → [name, intervals]
const SCALES = {
  'major': ['major', ['1', '2', '3', '4', '5', '6', '7']],
  'minor': ['natural minor', ['1', '2', 'b3', '4', '5', 'b6', 'b7']],
  'major-pentatonic': ['major pentatonic', ['1', '2', '3', '5', '6']],
  'minor-pentatonic': ['minor pentatonic', ['1', 'b3', '4', '5', 'b7']],
  'blues': ['blues', ['1', 'b3', '4', 'b5', '5', 'b7']],
  'dorian': ['dorian', ['1', '2', 'b3', '4', '5', '6', 'b7']],
  'mixolydian': ['mixolydian', ['1', '2', '3', '4', '5', '6', 'b7']],
  'lydian': ['lydian', ['1', '2', '3', '#4', '5', '6', '7']],
  'phrygian': ['phrygian', ['1', 'b2', 'b3', '4', '5', 'b6', 'b7']],
  'locrian': ['locrian', ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7']],
  'harmonic-minor': ['harmonic minor', ['1', '2', 'b3', '4', '5', 'b6', '7']],
  'melodic-minor': ['melodic minor', ['1', '2', 'b3', '4', '5', '6', '7']],
};

// id → [symbol, name, intervals]
const CHORDS = {
  'maj': ['', 'major', ['1', '3', '5']],
  'm': ['m', 'minor', ['1', 'b3', '5']],
  '7': ['7', 'dominant 7', ['1', '3', '5', 'b7']],
  'maj7': ['maj7', 'major 7', ['1', '3', '5', '7']],
  'm7': ['m7', 'minor 7', ['1', 'b3', '5', 'b7']],
  'sus2': ['sus2', 'sus2', ['1', '2', '5']],
  'sus4': ['sus4', 'sus4', ['1', '4', '5']],
  '7sus4': ['7sus4', '7sus4', ['1', '4', '5', 'b7']],
  '6': ['6', 'major 6', ['1', '3', '5', '6']],
  'm6': ['m6', 'minor 6', ['1', 'b3', '5', '6']],
  'add9': ['add9', 'add9', ['1', '3', '5', '9']],
  '9': ['9', 'dominant 9', ['1', '3', '5', 'b7', '9']],
  '5': ['5', 'power chord', ['1', '5']],
  'dim': ['dim', 'diminished', ['1', 'b3', 'b5']],
  'dim7': ['dim7', 'diminished 7', ['1', 'b3', 'b5', 'bb7']],
  'm7b5': ['m7b5', 'half-diminished', ['1', 'b3', 'b5', 'b7']],
  'aug': ['aug', 'augmented', ['1', '3', '#5']],
};

const SOUNDS = [
  { id: 'pluck', name: 'Pluck · SL-1', def: subtractive, patch: {
    osc1Wave: 'sawtooth', osc2Wave: 'square', osc2Oct: 0, osc2Fine: 6, osc1Level: 0.8, osc2Level: 0.3,
    cutoff: 1300, resonance: 0.12, envAmount: 0.5, keyTrack: 0.6,
    fAttack: 0.001, fDecay: 0.35, fSustain: 0.05, fRelease: 0.3,
    aAttack: 0.002, aDecay: 1.4, aSustain: 0, aRelease: 0.6, reverbMix: 0.18, volume: 0.7,
  } },
  { id: 'epiano', name: 'E.Piano · FM-2', def: fm, preset: 'Tine E.Piano' },
  { id: 'marimba', name: 'Marimba · FM-2', def: fm, preset: 'Exotica Marimba' },
];

// ─── State ───────────────────────────────────────────────────────────────

const state = {
  mode: 'scale',
  pc: 9, // A
  spelling: null, // preferred root spelling (e.g. from a diatonic chip)
  scale: 'minor-pentatonic',
  chord: 'm',
  tuningId: 'EADGBE',
  tuning: STANDARD,
  labels: 'notes',
  sound: 'pluck',
};

const STORE_KEY = 'benvoet.fretboard';
let prefTuning = 'EADGBE'; // saved tuning, used when a link has none

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const root = p.get('root');
  const pc = pitchClass(root);
  if (pc != null && ROOTS[pc].includes(root)) {
    state.pc = pc;
    state.spelling = root;
  }
  if (p.get('scale') in SCALES) {
    state.mode = 'scale';
    state.scale = p.get('scale');
  } else if (p.get('chord') in CHORDS) {
    state.mode = 'chord';
    state.chord = p.get('chord');
  }
  // In a link, a missing tuning means standard (writeHash leaves it out), so links
  // are reproducible. The saved tuning only applies when there is no hash at all.
  const fallback = location.hash.length > 1 ? 'EADGBE' : prefTuning;
  state.tuningId = parseTuning(p.get('tuning')) ? p.get('tuning') : fallback;
  state.labels = p.get('labels') === 'intervals' ? 'intervals' : 'notes';
}

function writeHash() {
  const p = new URLSearchParams();
  p.set('root', rootName());
  if (state.mode === 'scale') p.set('scale', state.scale);
  else p.set('chord', state.chord);
  if (state.tuningId !== 'EADGBE') p.set('tuning', state.tuningId);
  if (state.labels === 'intervals') p.set('labels', 'intervals');
  history.replaceState(null, '', '#' + p.toString());
}

function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (SOUNDS.some((x) => x.id === s.sound)) state.sound = s.sound;
    if (parseTuning(s.tuning)) prefTuning = s.tuning;
  } catch { /* storage blocked or corrupt */ }
}

function savePrefs() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ sound: state.sound, tuning: state.tuningId }));
  } catch { /* storage blocked */ }
}

// ─── Theory ──────────────────────────────────────────────────────────────

const intervals = () => (state.mode === 'scale' ? SCALES[state.scale][1] : CHORDS[state.chord][2]);

function rootName() {
  if (state.spelling && ROOTS[state.pc].includes(state.spelling)) return state.spelling;
  return bestRoot(state.pc, intervals());
}

/** pc → { name, iv } for every note in the current scale or chord. */
function currentNotes() {
  const root = rootName();
  const map = new Map();
  for (const iv of intervals()) {
    map.set((state.pc + intervalSemis(iv)) % 12, { name: spell(root, iv), iv });
  }
  return map;
}

const ivLabel = (iv) => (iv === '1' ? 'R' : iv);

function chordSymbol(root = rootName(), id = state.chord) {
  return root + CHORDS[id][0];
}

/** Standard-tuning shape from the SongX library, only if every note fits the chord. */
function chordShape() {
  if (state.mode !== 'chord' || state.tuningId !== 'EADGBE') return null;
  const f = libraryFingering(chordSymbol());
  if (!f) return null;
  const pcs = new Set(intervals().map((iv) => (state.pc + intervalSemis(iv)) % 12));
  const frets = [...f.frets].map(parseFret);
  const fits = frets.every((fr, s) => fr == null || pcs.has((STANDARD.midi[s] + fr) % 12));
  return fits && frets.some((fr) => fr != null) ? { str: f.frets, frets } : null;
}

/** Triads built on each degree of a seven-note scale. */
function diatonicChords() {
  const ivs = SCALES[state.scale][1];
  if (state.mode !== 'scale' || ivs.length !== 7) return [];
  const root = rootName();
  const semis = ivs.map(intervalSemis);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  return semis.map((s, i) => {
    const third = (semis[(i + 2) % 7] - s + 12) % 12;
    const fifth = (semis[(i + 4) % 7] - s + 12) % 12;
    const q = third === 4 && fifth === 7 ? 'maj' : third === 3 && fifth === 7 ? 'm' : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : null;
    if (!q) return null;
    const name = spell(root, ivs[i]);
    const upper = q === 'maj' || q === 'aug';
    const roman = (upper ? ROMAN[i] : ROMAN[i].toLowerCase()) + (q === 'dim' ? '°' : q === 'aug' ? '+' : '');
    return { roman, name, pc: (state.pc + s) % 12, chord: q };
  }).filter(Boolean);
}

// ─── Rendering ───────────────────────────────────────────────────────────

function buildSelects() {
  els.root.innerHTML = ROOTS.map((names, pc) => `<option value="${pc}">${names.join(' / ')}</option>`).join('');

  const tun = TUNINGS.map((t) => `<option value="${t.id}">${t.songx ? '★ ' : ''}${tuningLabel(t)}</option>`);
  if (!TUNINGS.some((t) => t.id === state.tuningId)) tun.push(`<option value="${state.tuningId}">${state.tuning.names.join(' ')}</option>`);
  els.tuning.innerHTML = tun.join('');

  els.sound.innerHTML = SOUNDS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
}

function buildTypeSelect() {
  if (state.mode === 'scale') {
    els.typeLabel.textContent = 'Scale';
    els.type.innerHTML = Object.entries(SCALES).map(([id, [name]]) => `<option value="${id}">${name}</option>`).join('');
    els.type.value = state.scale;
  } else {
    els.typeLabel.textContent = 'Chord';
    els.type.innerHTML = Object.entries(CHORDS).map(([id, [sym, name]]) => `<option value="${id}">${name}${sym ? ` (${sym})` : ''}</option>`).join('');
    els.type.value = state.chord;
  }
}

function buildNeck() {
  const t = state.tuning;
  // Frets get narrower up the neck, like the real thing.
  const cols = ['30px', '46px'];
  for (let f = 1; f <= FRETS; f++) cols.push(`${(Math.pow(2, -f / 12) * 10).toFixed(3)}fr`);
  els.neck.style.gridTemplateColumns = cols.join(' ');

  let html = '<div class="neck__board" aria-hidden="true"></div><div class="neck__nut" aria-hidden="true"></div>';
  for (let f = 1; f <= FRETS; f++) {
    html += `<div class="neck__fret" style="grid-column:${f + 2}" aria-hidden="true">${'<i></i>'.repeat(INLAYS[f] || 0)}</div>`;
    html += `<div class="neck__num${INLAYS[f] ? ' is-marked' : ''}" style="grid-column:${f + 2}" aria-hidden="true">${f}</div>`;
  }
  for (let row = 0; row < 6; row++) {
    const s = 5 - row; // high e on top, like tab
    html += `<div class="neck__open" style="grid-row:${row + 1}">${t.names[s]}</div>`;
    html += `<div class="neck__string" style="grid-row:${row + 1};--gauge:${(0.8 + s * 0.28).toFixed(2)}px" aria-hidden="true"></div>`;
    for (let f = 0; f <= FRETS; f++) {
      const midi = t.midi[s] + f;
      html += `<button type="button" class="spot${f === 0 ? ' spot--open' : ''}" style="grid-row:${row + 1};grid-column:${f + 2}" data-s="${s}" data-f="${f}" data-midi="${midi}"><span class="spot__dot"></span></button>`;
    }
  }
  els.neck.innerHTML = html;
}

function render() {
  const notes = currentNotes();
  const root = rootName();
  const shape = chordShape();

  // Name and note table.
  els.name.textContent = state.mode === 'scale'
    ? `${root} ${SCALES[state.scale][0]}`
    : `${chordSymbol()} · ${root} ${CHORDS[state.chord][1]}`;
  const list = [...notes.values()];
  els.rowNotes.innerHTML = list.map((n) => `<td${n.iv === '1' ? ' class="is-root"' : ''}>${n.name}</td>`).join('');
  els.rowIvs.innerHTML = list.map((n) => `<td>${ivLabel(n.iv)}</td>`).join('');

  // Neck.
  for (const b of els.neck.querySelectorAll('.spot')) {
    const s = Number(b.dataset.s);
    const f = Number(b.dataset.f);
    const midi = Number(b.dataset.midi);
    const n = notes.get(midi % 12);
    const label = n ? (state.labels === 'notes' ? n.name : ivLabel(n.iv)) : '';
    b.classList.toggle('is-in', !!n);
    b.classList.toggle('is-root', !!n && n.iv === '1');
    b.classList.toggle('is-shape', !!shape && shape.frets[s] === f);
    b.querySelector('.spot__dot').textContent = label;
    const pitch = n ? n.name : spellAny(midi);
    b.setAttribute('aria-label', `String ${6 - s}, ${f === 0 ? 'open' : `fret ${f}`}: ${pitch}${octaveOf(midi)}${n ? ` (${ivLabel(n.iv)})` : ''}`);
  }

  // Diatonic chords.
  const dia = diatonicChords();
  els.diatonic.hidden = !dia.length;
  els.diatonicChips.innerHTML = dia.map((c) =>
    `<button type="button" class="chip dia" data-pc="${c.pc}" data-name="${c.name}" data-chord="${c.chord}"><span class="dia__roman">${c.roman}</span>${c.name}${CHORDS[c.chord][0]}</button>`).join('');

  // Chord shape diagram.
  els.shape.hidden = state.mode !== 'chord';
  if (state.mode === 'chord') {
    els.shapeSvg.innerHTML = shape ? diagramSVG(shape.str) : '';
    els.shapeNote.textContent = shape
      ? `${chordSymbol()}: ${shape.str.replace(/x/g, '×').split('').join(' ')}`
      : state.tuningId !== 'EADGBE'
        ? 'Shapes are for standard tuning. The neck shows every chord tone in this tuning.'
        : 'No common shape for this one. The neck shows every chord tone.';
  }

  // Controls.
  els.root.value = String(state.pc);
  els.tuning.value = state.tuningId;
  els.sound.value = state.sound;
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  for (const b of document.querySelectorAll('[data-labels]')) b.setAttribute('aria-pressed', String(b.dataset.labels === state.labels));
  els.playText.textContent = state.mode === 'scale' ? 'Play scale' : 'Strum';
  writeHash();
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const spellAny = (midi) => SHARP_NAMES[midi % 12];

// ─── Sound ───────────────────────────────────────────────────────────────

const engine = new AudioEngine();
const synths = new Map();

function currentSynth() {
  let s = synths.get(state.sound);
  if (!s) {
    const def = SOUNDS.find((x) => x.id === state.sound);
    s = def.def.create();
    s.load(def.patch || def.def.PRESETS.find((p) => p.name === def.preset)?.patch || {});
    synths.set(state.sound, s);
  }
  if (!s.ctx && engine.ctx) s.attach(engine);
  return s;
}

/** Synchronous, so a note on the very first click is never lost. */
function ensureAudio() {
  try {
    engine.start().catch(() => {});
    return currentSynth();
  } catch {
    return null;
  }
}

/** Schedule note-on and note-off together, so nothing can stick. */
function playNotes(list) {
  const synth = ensureAudio();
  if (!synth) return;
  const now = engine.ctx.currentTime + 0.03;
  for (const { midi, at, dur, vel = 0.8 } of list) {
    synth.noteOn(midi, vel, now + at);
    synth.noteOff(midi, now + at + dur);
    setTimeout(() => flash(midi), at * 1000 + 30);
  }
}

function flash(midi) {
  for (const b of els.neck.querySelectorAll(`.spot[data-midi="${midi}"]`)) {
    b.classList.remove('is-playing');
    void b.offsetWidth; // restart the animation
    b.classList.add('is-playing');
  }
}

function playCurrent() {
  if (state.mode === 'scale') {
    // One octave up from the lowest root on the neck, plus the top root.
    const low = state.tuning.midi[0];
    const root = low + ((state.pc - (low % 12) + 12) % 12);
    const semis = [...SCALES[state.scale][1].map(intervalSemis), 12];
    playNotes(semis.map((s, i) => ({ midi: root + s, at: i * 0.24, dur: 0.3 })));
    return;
  }
  const shape = chordShape();
  let notes;
  if (shape) {
    notes = shape.frets.map((f, s) => (f == null ? null : STANDARD.midi[s] + f)).filter((m) => m != null);
  } else {
    const root = 48 + state.pc; // around C3
    notes = intervals().map((iv) => root + intervalSemis(iv));
  }
  playNotes(notes.map((midi, i) => ({ midi, at: i * 0.035, dur: 1.8, vel: 0.7 })));
}

// ─── Events ──────────────────────────────────────────────────────────────

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  if (state.mode === b.dataset.mode) return;
  state.mode = b.dataset.mode;
  buildTypeSelect();
  render();
}));

document.querySelectorAll('[data-labels]').forEach((b) => b.addEventListener('click', () => {
  state.labels = b.dataset.labels;
  render();
}));

els.root.addEventListener('change', () => {
  state.pc = Number(els.root.value);
  state.spelling = null;
  render();
});

els.type.addEventListener('change', () => {
  if (state.mode === 'scale') state.scale = els.type.value;
  else state.chord = els.type.value;
  state.spelling = null;
  render();
});

els.tuning.addEventListener('change', () => {
  const t = parseTuning(els.tuning.value);
  if (!t) return;
  state.tuningId = t.id;
  state.tuning = t;
  prefTuning = t.id;
  savePrefs();
  buildNeck();
  render();
});

els.sound.addEventListener('change', () => {
  state.sound = els.sound.value;
  savePrefs();
});

els.play.addEventListener('click', playCurrent);

els.neck.addEventListener('click', (e) => {
  const b = e.target.closest('.spot');
  if (b) playNotes([{ midi: Number(b.dataset.midi), at: 0, dur: 0.9 }]);
});

els.diatonicChips.addEventListener('click', (e) => {
  const b = e.target.closest('.dia');
  if (!b) return;
  state.mode = 'chord';
  state.pc = Number(b.dataset.pc);
  state.spelling = b.dataset.name;
  state.chord = b.dataset.chord;
  buildTypeSelect();
  render();
  playCurrent();
});

// Stop anything still ringing when the page is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) for (const s of synths.values()) s.allNotesOff?.();
});

// ─── Start ───────────────────────────────────────────────────────────────

function applyHash() {
  readHash();
  state.tuning = parseTuning(state.tuningId) || STANDARD;
  buildSelects();
  buildTypeSelect();
  buildNeck();
  render();
}

loadPrefs();
applyHash();
// Links and back/forward change the hash without a reload.
window.addEventListener('hashchange', applyHash);

window.fretboardLab = { state, engine, synths, playCurrent };
