// Value formatters for the panel readouts and the LCD.

const round = (v, d) => Number(v.toFixed(d));

export const fmt = {
  pct: (v) => `${Math.round(v * 100)}%`,
  signedPct: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  signed: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`,
  semis: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`,
  cents: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`,
  hz: (v) => (v >= 1000 ? `${round(v / 1000, v >= 10000 ? 1 : 2)} kHz` : v >= 10 ? `${Math.round(v)} Hz` : `${round(v, 2)} Hz`),
  time: (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${round(v, 2)} s`),
};

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

export const WAVE_LABELS = {
  sawtooth: 'SAW',
  square: 'SQR',
  triangle: 'TRI',
  sine: 'SIN',
  lowpass: 'LP',
  highpass: 'HP',
  bandpass: 'BP',
  12: '12dB',
  24: '24dB',
  poly: 'POLY',
  mono: 'MONO',
  stack: 'STACK',
  parallel: 'PARA',
  up: 'UP',
  down: 'DN',
  updown: 'U/D',
  random: 'RND',
  order: 'ORD',
};

// Small SVG glyphs for waveform buttons.
export const WAVE_ICONS = {
  sawtooth: 'M1 13 L11 3 L11 13 L21 3 L21 13',
  square: 'M1 13 L1 3 L8 3 L8 13 L15 13 L15 3 L21 3',
  triangle: 'M1 13 L6 3 L11 13 L16 3 L21 13',
  sine: 'M1 8 C4 -1, 7 -1, 11 8 S18 17, 21 8',
};
