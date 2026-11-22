// Kana tables for the KN-46 trainer (kana/).
//
// Only hiragana is written out. Katakana is derived by shifting each code
// point by 0x60 (ぁ–ゖ → ァ–ヶ), so the two scripts can never drift apart.
//
// Row format: [id, group, kana, romaji]. Kana and romaji are space-separated
// and line up cell by cell; '・' / '-' mark an empty slot in the chart grid.
// Romaji alternates are joined with '/'; the first one is the canonical
// (Hepburn) reading that gets displayed.

const ROW_DEFS = [
  // Gojūon (46)
  ['a', 'basic', 'あ い う え お', 'a i u e o'],
  ['ka', 'basic', 'か き く け こ', 'ka ki ku ke ko'],
  ['sa', 'basic', 'さ し す せ そ', 'sa shi/si su se so'],
  ['ta', 'basic', 'た ち つ て と', 'ta chi/ti tsu/tu te to'],
  ['na', 'basic', 'な に ぬ ね の', 'na ni nu ne no'],
  ['ha', 'basic', 'は ひ ふ へ ほ', 'ha hi fu/hu he ho'],
  ['ma', 'basic', 'ま み む め も', 'ma mi mu me mo'],
  ['ya', 'basic', 'や ・ ゆ ・ よ', 'ya - yu - yo'],
  ['ra', 'basic', 'ら り る れ ろ', 'ra ri ru re ro'],
  ['wa', 'basic', 'わ ・ ・ ・ を', 'wa - - - wo/o'],
  ['n', 'basic', 'ん', 'n/nn'],
  // Dakuten and handakuten (25)
  ['ga', 'dakuten', 'が ぎ ぐ げ ご', 'ga gi gu ge go'],
  ['za', 'dakuten', 'ざ じ ず ぜ ぞ', 'za ji/zi zu ze zo'],
  ['da', 'dakuten', 'だ ぢ づ で ど', 'da ji/di zu/du de do'],
  ['ba', 'dakuten', 'ば び ぶ べ ぼ', 'ba bi bu be bo'],
  ['pa', 'dakuten', 'ぱ ぴ ぷ ぺ ぽ', 'pa pi pu pe po'],
  // Yōon (33)
  ['kya', 'yoon', 'きゃ きゅ きょ', 'kya kyu kyo'],
  ['sha', 'yoon', 'しゃ しゅ しょ', 'sha/sya shu/syu sho/syo'],
  ['cha', 'yoon', 'ちゃ ちゅ ちょ', 'cha/tya/cya chu/tyu/cyu cho/tyo/cyo'],
  ['nya', 'yoon', 'にゃ にゅ にょ', 'nya nyu nyo'],
  ['hya', 'yoon', 'ひゃ ひゅ ひょ', 'hya hyu hyo'],
  ['mya', 'yoon', 'みゃ みゅ みょ', 'mya myu myo'],
  ['rya', 'yoon', 'りゃ りゅ りょ', 'rya ryu ryo'],
  ['gya', 'yoon', 'ぎゃ ぎゅ ぎょ', 'gya gyu gyo'],
  ['ja', 'yoon', 'じゃ じゅ じょ', 'ja/jya/zya ju/jyu/zyu jo/jyo/zyo'],
  ['bya', 'yoon', 'びゃ びゅ びょ', 'bya byu byo'],
  ['pya', 'yoon', 'ぴゃ ぴゅ ぴょ', 'pya pyu pyo'],
];

export const GROUPS = [
  { id: 'basic', name: 'Gojūon', cols: ['a', 'i', 'u', 'e', 'o'] },
  { id: 'dakuten', name: 'Dakuten', cols: ['a', 'i', 'u', 'e', 'o'] },
  { id: 'yoon', name: 'Yōon', cols: ['ya', 'yu', 'yo'] },
];

/** Hiragana → katakana by code point (U+3041–U+3096 shift by 0x60). */
export function toKatakana(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

/**
 * ROWS: [{ id, group, cells: [{ hira, romaji, accept } | null] }]
 * KANA: flat list of every kana (hiragana key), in chart order.
 */
export const ROWS = ROW_DEFS.map(([id, group, kana, romaji]) => {
  const ks = kana.split(' ');
  const rs = romaji.split(' ');
  return {
    id,
    group,
    cells: ks.map((k, i) => {
      if (k === '・') return null;
      const accept = rs[i].split('/');
      return { hira: k, romaji: accept[0], accept, row: id };
    }),
  };
});

export const KANA = ROWS.flatMap((r) => r.cells.filter(Boolean));

/** Look-alike sets, used to pick tricky multiple-choice distractors. */
const LOOKALIKES = [
  'ぬめ', 'ねれわ', 'るろ', 'きさち', 'はほけ', 'いり', 'こに', 'うらつ', 'あおめ',
  'まも', 'しつ', 'くへ', 'そて', 'たな', 'みよ',
  'シツ', 'ソンノ', 'クケタ', 'ウワフ', 'コユロ', 'スヌ', 'チテ', 'ナメ', 'アマ',
  'セサ', 'ヲラ', 'ルレ', 'ホキ', 'ミシ', 'ヨユ',
];

const LOOK = new Map();
for (const set of LOOKALIKES) {
  for (const ch of set) {
    const others = [...set].filter((c) => c !== ch);
    LOOK.set(ch, [...(LOOK.get(ch) || []), ...others]);
  }
}

/** Characters that look like `ch` (same script), including through its base kana. */
export function lookalikes(ch) {
  const first = [...ch][0];
  return LOOK.get(first) || [];
}

// ─── Words: kana string → romaji tokens ──────────────────────────────────

const READING = new Map(); // hiragana and katakana → { accept, row }
for (const k of KANA) {
  const accept = k.accept.includes('nn') ? [...k.accept, "n'"] : k.accept;
  READING.set(k.hira, { accept, row: k.row });
  READING.set(toKatakana(k.hira), { accept, row: k.row });
}

/**
 * Split a word into reading tokens. Each token is a list of accepted romaji
 * spellings (canonical first). っ/ッ doubles the next consonant, ー repeats the
 * previous vowel. Returns null if the word uses a kana we don't teach.
 */
export function tokenize(word) {
  const chars = [...word];
  const tokens = [];
  const rows = new Set();
  let double = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === 'っ' || ch === 'ッ') {
      double = true;
      continue;
    }
    if (ch === 'ー') {
      const prev = tokens.length ? tokens[tokens.length - 1][0] : '';
      const v = prev.slice(-1);
      tokens.push('aiueo'.includes(v) && v ? [v, '-'] : ['-']);
      continue;
    }
    const pair = READING.get(ch + (chars[i + 1] || ''));
    const hit = pair || READING.get(ch);
    if (!hit) return null;
    if (pair) i++;
    rows.add(hit.row);
    let alts = hit.accept;
    if (double) {
      alts = alts.flatMap((a) => (a.startsWith('ch') ? [`t${a}`, `c${a}`] : [a[0] + a]));
      double = false;
    }
    tokens.push(alts);
  }
  if (double) return null;
  return { tokens, rows: [...rows], romaji: tokens.map((t) => (t[0] === '-' ? '-' : t[0])).join('') };
}

/** Does the typed romaji spell these tokens? Every token may use any of its spellings. */
export function matchTokens(tokens, typed) {
  let at = new Set([0]);
  for (const alts of tokens) {
    const nextAt = new Set();
    for (const p of at) for (const a of alts) if (typed.startsWith(a, p)) nextAt.add(p + a.length);
    if (!nextAt.size) return false;
    at = nextAt;
  }
  return at.has(typed.length);
}

// Self-check, cheap enough to run on every load.
(() => {
  const count = (g) => KANA.filter((k) => ROWS.find((r) => r.id === k.row).group === g).length;
  const n = { basic: count('basic'), dakuten: count('dakuten'), yoon: count('yoon') };
  const unique = new Set(KANA.map((k) => k.hira)).size === KANA.length;
  const kataOk = toKatakana('あんゃを') === 'アンャヲ';
  if (n.basic !== 46 || n.dakuten !== 25 || n.yoon !== 33 || !unique || !kataOk) {
    console.error('[kana] table check failed', n, { unique, kataOk });
  }
})();
