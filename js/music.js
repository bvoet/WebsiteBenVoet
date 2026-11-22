// Shared music helpers for the tuner and the fretboard explorer:
// note names, guitar tunings and theory-correct spelling.

export const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const NATURAL = [0, 2, 4, 5, 7, 9, 11]; // semitones of degrees 1..7 in a major scale

/** Pitch class (0–11) of a name like 'Eb', 'F#', 'Cbb', or null. */
export function pitchClass(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name || '');
  if (!m) return null;
  const acc = m[2] || '';
  const shift = acc.startsWith('#') ? acc.length : -acc.length;
  return (LETTER_PC[LETTERS.indexOf(m[1])] + shift + 12) % 12;
}

export const mtof = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);
export const ftom = (freq, a4 = 440) => 69 + 12 * Math.log2(freq / a4);
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

// ─── Tunings ─────────────────────────────────────────────────────────────

const STANDARD_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

/**
 * Parse a tuning like 'DADGBD' or 'EbAbDbGbBbEb' (low string first).
 * Each string sits within 7 semitones below to 4 above its standard pitch:
 * strings get tuned down far more often than up (and tuning up snaps them).
 * Returns { id, names, midi } or null unless it is exactly six notes.
 */
export function parseTuning(str) {
  if (typeof str !== 'string' || !/^(?:[A-G][#b]?){6}$/.test(str)) return null;
  const names = str.match(/[A-G][#b]?/g);
  const midi = names.map((n, i) => {
    const std = STANDARD_MIDI[i];
    let d = (((pitchClass(n) - std) % 12) + 12) % 12;
    if (d > 4) d -= 12;
    return std + d;
  });
  return { id: str, names, midi };
}

// Presets. `songx` marks tunings that appear in the SongX songbook.
export const TUNINGS = [
  { id: 'EADGBE', name: 'Standard', songx: true },
  { id: 'DADGBE', name: 'Drop D', songx: true },
  { id: 'DADGBD', name: 'Double drop D', songx: true },
  { id: 'EbAbDbGbBbEb', name: 'Half step down' },
  { id: 'DGCFAD', name: 'Whole step down', songx: true },
  { id: 'DGDGBD', name: 'Open G' },
  { id: 'DADF#AD', name: 'Open D' },
  { id: 'EBEG#BE', name: 'Open E' },
  { id: 'DADGAD', name: 'DADGAD' },
  { id: 'CGCFAC', name: 'CGCFAC', songx: true },
  { id: 'CGCFAD', name: 'CGCFAD', songx: true },
  { id: 'DGCFAA', name: 'DGCFAA', songx: true },
  { id: 'BbFBbEbGBb', name: 'BbFBbEbGBb', songx: true },
];

export const STANDARD = parseTuning('EADGBE');

/** Tuning label for menus: "Drop D · D A D G B E". */
export function tuningLabel(t) {
  const notes = parseTuning(t.id).names.join(' ');
  return t.name === t.id ? notes : `${t.name} · ${notes}`;
}

// ─── Spelling ────────────────────────────────────────────────────────────

/** Semitones above the root for an interval token: '1', 'b3', '#4', 'bb7', '9'. */
export function intervalSemis(iv) {
  const m = /^(#{1,2}|b{1,2})?(\d{1,2})$/.exec(iv);
  const deg = Number(m[2]) - 1;
  const acc = m[1] || '';
  const shift = acc.startsWith('#') ? acc.length : -acc.length;
  return NATURAL[deg % 7] + 12 * Math.floor(deg / 7) + shift;
}

/** Spell the note an interval above a root, e.g. spell('Eb', 'b3') → 'Gb'. */
export function spell(root, iv) {
  const deg = Number(/\d+/.exec(iv)[0]) - 1;
  const letterIdx = (LETTERS.indexOf(root[0]) + deg) % 7;
  const pc = (pitchClass(root) + intervalSemis(iv)) % 12;
  let acc = (pc - LETTER_PC[letterIdx] + 12) % 12;
  if (acc > 6) acc -= 12;
  return LETTERS[letterIdx] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
}

// Each pitch class with its possible root spellings.
export const ROOTS = [['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B']];

/**
 * Pick the root spelling that gives the fewest accidentals for these intervals
 * (Db major rather than C#, but C# minor rather than Db).
 */
export function bestRoot(pc, intervals) {
  let best = null;
  let bestScore = Infinity;
  for (const root of ROOTS[pc]) {
    const score = intervals.reduce((n, iv) => n + spell(root, iv).length - 1, 0);
    if (score < bestScore) {
      best = root;
      bestScore = score;
    }
  }
  return best;
}
