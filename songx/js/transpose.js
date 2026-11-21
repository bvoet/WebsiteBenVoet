// Transpose utilities for SongX chord charts

const NOTE_TO_SEMI = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SCALE  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Chord token regex: root note (A-G with optional # or b) followed by quality, optional bass note
const CHORD_TOKEN_REGEX = /^([A-G][#b]?)(m|maj|min|dim|aug|sus[24]?|add[0-9]+|[0-9]+|M[0-9]+|\+|°)?(?:\/([A-G][#b]?))?$/;

export function isChord(token) {
  return CHORD_TOKEN_REGEX.test(token.trim());
}

export function transposeChord(chordStr, delta, preferFlat = false) {
  if (delta === 0) return chordStr;
  const m = chordStr.match(CHORD_TOKEN_REGEX);
  if (!m) return chordStr;

  const [, root, quality = '', bass] = m;
  if (!(root in NOTE_TO_SEMI)) return chordStr;

  const scale = preferFlat ? FLAT_SCALE : SHARP_SCALE;
  const rootSemi = (NOTE_TO_SEMI[root] + delta + 120) % 12;
  const newRoot = scale[rootSemi];

  let newBass = '';
  if (bass && bass in NOTE_TO_SEMI) {
    const bassSemi = (NOTE_TO_SEMI[bass] + delta + 120) % 12;
    newBass = '/' + scale[bassSemi];
  }

  return `${newRoot}${quality}${newBass}`;
}

/**
 * Checks if a line is predominantly chords (or tab, or intro chords).
 */
export function isChordLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(TUNING|CAPO|SUBMITTED|NOTES|CHORDS):/i.test(trimmed)) return false;
  if (/^[eBGDAE]\|/i.test(trimmed)) return false; // Guitar tab string line

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let chordCount = 0;
  for (const t of tokens) {
    const clean = t.replace(/[(),]/g, '');
    if (isChord(clean) || /^(INTRO|VERSE|CHORUS|BRIDGE|OUTRO|SOLO|RIFF):?$/i.test(clean) || /^(x[0-9]+|\(x[0-9]+\))$/i.test(clean)) {
      chordCount++;
    }
  }

  return (chordCount / tokens.length) >= 0.5;
}

/**
 * Transpose a chord line while maintaining column alignment.
 */
export function transposeChordLine(line, delta, preferFlat = false) {
  if (delta === 0) return line;

  // We find matches of words and replace chord words
  return line.replace(/\b([A-G][#b]?(?:m|maj|min|dim|aug|sus[24]?|add[0-9]+|[0-9]+|M[0-9]+|\+)??(?:\/[A-G][#b]?)?)\b/g, (match) => {
    if (isChord(match)) {
      return transposeChord(match, delta, preferFlat);
    }
    return match;
  });
}

/**
 * Transpose the entire song content text.
 */
export function transposeSongText(text, delta, preferFlat = false) {
  if (delta === 0) return text;
  const lines = text.split('\n');
  const transposed = lines.map((line) => {
    if (isChordLine(line)) {
      return transposeChordLine(line, delta, preferFlat);
    }
    // Check if line is chord definition e.g. "D:xx0232" or "F#m: 244222"
    const defMatch = line.match(/^([A-G][#b]?[a-zA-Z0-9/]*)\s*(:|\s+)([x0-9]{4,6}.*)$/);
    if (defMatch && isChord(defMatch[1])) {
      const newChord = transposeChord(defMatch[1], delta, preferFlat);
      return `${newChord}${defMatch[2]}${defMatch[3]}`;
    }
    return line;
  });
  return transposed.join('\n');
}
