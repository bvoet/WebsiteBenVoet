// Chord fingerings and fretboard diagrams for SongX.
//
// Fingerings are 6 characters, low E to high e: 'x' = muted, 0–9 = fret,
// A/B/C… = fret 10/11/12… (the format the song database already uses).

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const STANDARD = 'EADGBE';

// Hand-picked open voicings (standard tuning). Keys use sharps.
const OPEN = {
  C: 'x32010', C7: 'x32310', Cmaj7: 'x32000', Cadd9: 'x32030', Csus4: 'x33011', Csus2: 'x30013', C6: 'x32210',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', Dmaj7: 'xx0222', Dsus2: 'xx0230', Dsus4: 'xx0233', D6: 'xx0202', D7sus4: 'xx0213', D5: 'xx023x',
  E: '022100', Em: '022000', E7: '020100', Em7: '020000', Emaj7: '021100', Esus4: '022200', E6: '022120', Eadd9: '024100', E9: '020102', E7sus4: '020200', E5: '022xxx', 'E7#9': '076780', Em9: '022002',
  F: '133211', Fm: '133111', F7: '131211', Fmaj7: 'xx3210', Fm7: '131111',
  G: '320003', G7: '320001', Gmaj7: '320002', Gsus4: '330013', G6: '320000', Gadd9: '300203', G5: '355xxx',
  A: 'x02220', Am: 'x02210', A7: 'x02020', Am7: 'x02010', Amaj7: 'x02120', Asus2: 'x02200', Asus4: 'x02230', A6: 'x02222', Aadd9: 'x02420', A7sus4: 'x02030', Am6: 'x02212', A5: 'x022xx', A9: 'x02423',
  B7: 'x21202', Bm7: 'x20202', Bsus2: 'x24422',
  Gsus2: '300033', Esus2: '024400', Fsus2: 'xx3011',
};

// Common slash voicings; other slash chords fall back to the plain chord.
const SLASH = {
  'D/F#': '200232', 'G/B': 'x20003', 'C/G': '332010', 'C/B': 'x22010', 'C/E': '032010', 'Am/G': '302210',
  'Am/F#': '202210', 'Am/E': '002210', 'A/E': '002220', 'D/A': 'x00232', 'F/C': 'x33211', 'G/D': 'xx0003',
  'E/G#': '422100', 'D/C': 'x30232', 'Em/D': 'xx0000', 'G/F#': '220003', 'Fmaj7/C': 'x33210', 'A/C#': 'x42220',
};

// Movable barre shapes. Offsets are relative to the root fret; null = muted.
const E_SHAPE = {
  '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, null, 1, 1, 0, null], sus4: [0, 2, 2, 2, 0, 0], 9: [0, null, 0, 1, 0, 2], 5: [0, 2, 2, null, null, null],
  '7sus4': [0, 2, 0, 2, 0, 0], m6: [0, 2, 2, 0, 2, 0],
};
const A_SHAPE = {
  '': [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], 7: [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0], sus4: [null, 0, 2, 2, 3, 0], sus2: [null, 0, 2, 2, 0, 0], 6: [null, 0, 2, 2, 2, 2],
  m6: [null, 0, 2, 2, 1, 2], dim7: [null, 0, 1, 2, 1, 2], m7b5: [null, 0, 1, 0, 1, null], aug: [null, 0, 3, 2, 2, 1],
  9: [null, 0, -1, 0, 0, 0], '7#9': [null, 0, -1, 0, 1, null], 5: [null, 0, 2, 2, null, null], '7sus4': [null, 0, 2, 0, 3, 0],
};

const QUALITY_ALIASES = {
  '': '', M: '', maj: '', m: 'm', min: 'm', '-': 'm', 7: '7', dom7: '7', m7: 'm7', min7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7', sus: 'sus4', sus4: 'sus4', sus2: 'sus2', 6: '6', m6: 'm6', 9: '9', add9: 'add9', 2: 'add9',
  dim: 'dim7', dim7: 'dim7', '°': 'dim7', '°7': 'dim7', m7b5: 'm7b5', ø: 'm7b5', aug: 'aug', '+': 'aug', 5: '5',
  '7sus4': '7sus4', '7sus': '7sus4', '7#9': '7#9', '7+9': '7#9', m9: 'm9', maj9: 'maj9',
};

export function parseChord(name) {
  const m = name.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!m || !(m[1] in NOTE)) return null;
  return { root: NOTE[m[1]], quality: m[2] || '', bass: m[3] && m[3] in NOTE ? NOTE[m[3]] : null, bassName: m[3] || null };
}

function fromShape(shape, rootFret) {
  if (shape.some((o) => o != null && rootFret + o < 0)) return null;
  return shape.map((o) => (o == null ? 'x' : fretChar(rootFret + o))).join('');
}

function fretChar(n) {
  return n < 10 ? String(n) : String.fromCharCode(55 + n); // 10 → 'A'
}

// Standard-tuning fingering for a chord name, or null.
export function libraryFingering(name) {
  if (SLASH[name]) return { frets: SLASH[name] };
  const c = parseChord(name);
  if (!c) return null;
  const q = QUALITY_ALIASES[c.quality];
  if (q == null) return null;

  const key = SHARP[c.root] + q;
  let frets = OPEN[key];
  if (!frets) {
    // Pick whichever barre shape sits lowest on the neck.
    const options = [];
    const eFret = (c.root - 4 + 12) % 12;
    const aFret = (c.root - 9 + 12) % 12;
    if (E_SHAPE[q]) options.push(fromShape(E_SHAPE[q], eFret || 12), fromShape(E_SHAPE[q], eFret));
    if (A_SHAPE[q]) options.push(fromShape(A_SHAPE[q], aFret || 12), fromShape(A_SHAPE[q], aFret));
    frets = options.filter(Boolean).sort((a, b) => lowest(a) - lowest(b))[0] || null;
  }
  if (!frets) return null;
  const slashSlug = c.bassName && c.bass !== c.root ? c.bassName : null;
  return { frets, bassNote: slashSlug };
}

function lowest(frets) {
  const nums = [...frets].filter((ch) => ch !== 'x').map(parseFret);
  return Math.max(...nums); // smaller max = lower on the neck
}

export function parseFret(ch) {
  if (ch === 'x' || ch === 'X') return null;
  if (/[0-9]/.test(ch)) return Number(ch);
  return ch.toUpperCase().charCodeAt(0) - 55;
}

// Song chord_defs ("Am:x02210") → Map(name → frets).
export function parseChordDefs(defs) {
  const map = new Map();
  for (const d of defs || []) {
    const m = /^\s*([^:\s]+)\s*:\s*([xX0-9A-Fa-f]{6})\s*$/.exec(d);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

// Six string names for a tuning string like "DADGBE" or "EbAbDbGbBbEb".
export function tuningStrings(tuning) {
  const notes = (tuning || '').match(/[A-G][#b]?/g) || [];
  return notes.length === 6 ? notes : null;
}

/** Fretboard diagram as an SVG string. */
export function diagramSVG(frets, { strings = null } = {}) {
  const vals = [...frets].map(parseFret);
  const fretted = vals.filter((v) => v != null && v > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const base = maxF > 5 ? minF : 1; // first fret shown
  const rows = 5;
  const W = 112;
  const H = 132;
  const x0 = 22;
  const y0 = 26;
  const gap = 14;
  const fretGap = 18;
  const xs = (i) => x0 + i * gap;
  let s = `<svg class="chord-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;

  // Nut or position label.
  if (base === 1) s += `<rect x="${x0 - 1}" y="${y0 - 4}" width="${gap * 5 + 2}" height="4" class="nut"/>`;
  else s += `<text x="${x0 - 6}" y="${y0 + fretGap * 0.72}" class="pos" text-anchor="end">${base}fr</text>`;

  for (let r = 0; r <= rows; r++) s += `<line x1="${x0}" y1="${y0 + r * fretGap}" x2="${x0 + gap * 5}" y2="${y0 + r * fretGap}" class="fret"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${xs(i)}" y1="${y0}" x2="${xs(i)}" y2="${y0 + rows * fretGap}" class="string"/>`;

  // Barre: the lowest fret, when it's played on several strings including the outer one.
  const barreStrings = vals.map((v, i) => (v === minF && minF > 0 ? i : -1)).filter((i) => i >= 0);
  if (barreStrings.length >= 3) {
    const first = barreStrings[0];
    const last = barreStrings.at(-1);
    const between = vals.slice(first, last + 1).every((v) => v == null || v >= minF);
    if (between) {
      const y = y0 + (minF - base + 0.5) * fretGap;
      s += `<rect x="${xs(first) - 5}" y="${y - 5}" width="${xs(last) - xs(first) + 10}" height="10" rx="5" class="dot"/>`;
    }
  }

  vals.forEach((v, i) => {
    const x = xs(i);
    if (v == null) s += `<text x="${x}" y="${y0 - 9}" class="mark" text-anchor="middle">×</text>`;
    else if (v === 0) s += `<circle cx="${x}" cy="${y0 - 13}" r="3.6" class="open"/>`;
    else {
      const row = v - base;
      if (row >= 0 && row < rows) s += `<circle cx="${x}" cy="${y0 + (row + 0.5) * fretGap}" r="5.4" class="dot"/>`;
    }
  });

  if (strings) {
    strings.forEach((n, i) => {
      s += `<text x="${xs(i)}" y="${y0 + rows * fretGap + 14}" class="tuning" text-anchor="middle">${n}</text>`;
    });
  }
  return s + '</svg>';
}
