// KN-46 kana trainer: chart, adaptive drill and scored quiz for hiragana and
// katakana. No audio; everything runs from the tables in kana-data.js.

import { GROUPS, KANA, ROWS, lookalikes, toKatakana } from './kana-data.js';

const STORE_KEY = 'benvoet.kana';
const MAX_BOX = 4;
const BOX_WEIGHT = [6, 4, 2.5, 1.5, 1]; // drill pick weight per Leitner box
const FONTS = ['textbook', 'gothic', 'pixel'];
const ROW_IDS = ROWS.map((r) => r.id);
const HIRA_SET = new Set(KANA.map((k) => k.hira));

const DEFAULTS = {
  mode: 'drill',
  script: 'h',
  rows: ROWS.filter((r) => r.group === 'basic').map((r) => r.id),
  dir: 'k2r',
  answer: 'type',
  length: 20,
  font: 'textbook',
  romaji: true,
};

const CHOICES = {
  mode: ['chart', 'drill', 'quiz'],
  script: ['h', 'k', 'hk'],
  dir: ['k2r', 'r2k', 'mix'],
  answer: ['type', 'choice'],
  length: [10, 20, 0],
  font: [...FONTS, 'mix'],
};

// ─── Storage ──────────────────────────────────────────────────────────────

function sanitizeSettings(raw) {
  const s = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return s;
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (allowed.includes(raw[key])) s[key] = raw[key];
  }
  if (Array.isArray(raw.rows)) s.rows = ROW_IDS.filter((id) => raw.rows.includes(id));
  if (typeof raw.romaji === 'boolean') s.romaji = raw.romaji;
  return s;
}

function sanitizeStats(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, val] of Object.entries(raw)) {
    const m = /^([hk]):(.+)$/.exec(key);
    if (!m || !HIRA_SET.has(m[2]) || !Array.isArray(val) || val.length !== 3) continue;
    const [box, right, wrong] = val.map((n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0));
    out[key] = [Math.min(box, MAX_BOX), right, wrong];
  }
  return out;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw) return { settings: sanitizeSettings(raw.settings), stats: sanitizeStats(raw.stats), fresh: false };
  } catch { /* storage blocked or corrupt */ }
  return { settings: sanitizeSettings(null), stats: {}, fresh: true };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ settings, stats }));
  } catch { /* storage blocked */ }
}

const stored = load();
const settings = stored.settings;
let stats = stored.stats;
// Phones: the on-screen keyboard covers the card, so start with buttons.
if (stored.fresh && matchMedia('(max-width: 600px)').matches) settings.answer = 'choice';

// ─── Pool ─────────────────────────────────────────────────────────────────

function scripts() {
  return settings.script === 'hk' ? ['h', 'k'] : [settings.script];
}

function makeItem(cell, script) {
  return {
    id: `${script}:${cell.hira}`,
    script,
    char: script === 'h' ? cell.hira : toKatakana(cell.hira),
    hira: cell.hira,
    romaji: cell.romaji,
    accept: cell.accept,
    row: cell.row,
  };
}

let pool = [];
function buildPool() {
  const rows = new Set(settings.rows);
  pool = [];
  for (const k of KANA) {
    if (!rows.has(k.row)) continue;
    for (const s of scripts()) pool.push(makeItem(k, s));
  }
}

const statOf = (id) => stats[id] || [0, 0, 0];

function record(item, ok) {
  const [box, right, wrong] = statOf(item.id);
  stats[item.id] = ok ? [Math.min(box + 1, MAX_BOX), right + 1, wrong] : [0, right, wrong + 1];
  save();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const overlaps = (a, b) => a.accept.some((r) => b.accept.includes(r));
const baseOf = (ch) => ch.normalize('NFD')[0];
const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

function fontClass(font) {
  return `jp jp--${font === 'mix' ? pick(FONTS) : font}`;
}

/** Up to 3 distractors from the pool: look-alikes first, never a homophone. */
function distractors(item) {
  const looks = lookalikes(item.char);
  const scored = pool
    .filter((c) => c.script === item.script && c.id !== item.id && !overlaps(c, item))
    .map((c) => {
      let score = Math.random() * 2;
      if (looks.includes([...c.char][0])) score += 4;
      if (baseOf(c.char) === baseOf(item.char)) score += 2; // か / が / きゃ
      if (c.char.length === item.char.length) score += 1.5; // yōon with yōon
      if (c.row === item.row) score += 0.5;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  // Avoid two options that read the same (e.g. じ and ぢ both "ji").
  const out = [];
  for (const { c } of scored) {
    if (out.some((o) => overlaps(o, c))) continue;
    out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

function makeQuestion(item) {
  let dir = settings.dir === 'mix' ? pick(['k2r', 'r2k']) : settings.dir;
  let answer = dir === 'r2k' ? 'choice' : settings.answer;
  let options = null;
  if (answer === 'choice') {
    const d = distractors(item);
    if (d.length) options = shuffle([item, ...d]);
    else {
      // Nothing to choose between: fall back to typing the reading.
      dir = 'k2r';
      answer = 'type';
    }
  }
  return { item, dir, answer, options, font: fontClass(settings.font) };
}

// ─── Trainer state ────────────────────────────────────────────────────────

const state = {
  phase: 'idle', // idle | ask | ok | reveal | done
  q: null,
  recent: [],
  timer: 0,
  drill: { right: 0, total: 0, streak: 0, best: 0 },
  quiz: null,
};

function pickDrillItem() {
  const avoid = pool.length > 3 ? state.recent : state.recent.slice(-1);
  const cands = pool.filter((it) => !avoid.includes(it.id));
  const list = cands.length ? cands : pool;
  const weights = list.map((it) => BOX_WEIGHT[statOf(it.id)[0]]);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

function quizItems(source, n) {
  const want = n || source.length;
  let out = [];
  while (out.length < want) {
    let batch = shuffle(source);
    // No back-to-back repeat across batches.
    if (out.length && batch[0].id === out[out.length - 1].id && batch.length > 1) {
      batch = [...batch.slice(1), batch[0]];
    }
    out = out.concat(batch);
  }
  return out.slice(0, want);
}

function startQuiz(items) {
  state.quiz = { items, i: 0, right: 0, missed: [], start: performance.now() };
}

function restart() {
  clearTimeout(state.timer);
  buildPool();
  state.recent = [];
  state.drill = { right: 0, total: 0, streak: 0, best: 0 };
  state.quiz = null;
  if (settings.mode === 'quiz' && pool.length) startQuiz(quizItems(pool, settings.length));
  next();
}

function next() {
  clearTimeout(state.timer);
  if (settings.mode === 'chart') {
    state.phase = 'idle';
    renderStage();
    return;
  }
  if (!pool.length) {
    state.phase = 'idle';
    state.q = null;
    renderStage();
    return;
  }
  let item;
  if (settings.mode === 'quiz') {
    if (state.quiz.i >= state.quiz.items.length) {
      state.phase = 'done';
      state.quiz.time = performance.now() - state.quiz.start;
      renderStage();
      return;
    }
    item = state.quiz.items[state.quiz.i];
  } else {
    item = pickDrillItem();
    state.recent = [...state.recent, item.id].slice(-2);
  }
  state.q = makeQuestion(item);
  state.phase = 'ask';
  renderStage();
}

function answer(ok, given) {
  if (state.phase !== 'ask') return;
  const { item } = state.q;
  record(item, ok);
  if (settings.mode === 'quiz') {
    state.quiz.i++;
    if (ok) state.quiz.right++;
    else if (!state.quiz.missed.includes(item)) state.quiz.missed.push(item);
  } else {
    const d = state.drill;
    d.total++;
    if (ok) {
      d.right++;
      d.streak++;
      d.best = Math.max(d.best, d.streak);
    } else d.streak = 0;
  }
  state.given = given;
  state.phase = ok ? 'ok' : 'reveal';
  renderStage();
  if (ok) state.timer = setTimeout(next, 380);
}

// ─── DOM ──────────────────────────────────────────────────────────────────

const els = {
  stage: $('stage'),
  chart: $('chart'),
  barL: $('bar-left'),
  barR: $('bar-right'),
  card: $('card'),
  prompt: $('prompt'),
  msg: $('msg'),
  results: $('results'),
  answerBox: $('answer'),
  typeForm: $('type-form'),
  typeIn: $('type-in'),
  choices: $('choices'),
  nextBtn: $('next'),
  rows: $('rows'),
  poolCount: $('pool-count'),
  reset: $('reset'),
};

function setPressed(group, value) {
  for (const b of document.querySelectorAll(`[data-set="${group}"]`)) {
    b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
  }
}

function syncControls() {
  for (const key of ['mode', 'script', 'dir', 'answer', 'length', 'romaji']) setPressed(key, settings[key]);
  $('font').value = settings.font;
  document.body.dataset.mode = settings.mode;
  // Romaji → kana is always multiple choice.
  for (const b of document.querySelectorAll('[data-set="answer"][data-value="type"]')) {
    b.disabled = settings.dir === 'r2k';
  }
  if (settings.dir === 'r2k') setPressed('answer', 'choice');
}

function scriptChar(hira) {
  return settings.script === 'k' ? toKatakana(hira) : hira;
}

function renderRows() {
  const sel = new Set(settings.rows);
  els.rows.textContent = '';
  for (const g of GROUPS) {
    const rows = ROWS.filter((r) => r.group === g.id);
    const count = rows.reduce((n, r) => n + r.cells.filter(Boolean).length, 0);
    const on = rows.filter((r) => sel.has(r.id)).length;
    const wrap = document.createElement('div');
    wrap.className = 'rowgroup';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'rowgroup__head';
    head.dataset.group = g.id;
    head.setAttribute('aria-pressed', String(on === rows.length));
    head.innerHTML = `<span class="led${on ? ' is-on' : ''}${on && on < rows.length ? ' is-part' : ''}" aria-hidden="true"></span>${g.name} <small>${count}</small>`;
    wrap.append(head);
    const list = document.createElement('div');
    list.className = 'rowgroup__rows';
    for (const r of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rowchip';
      b.dataset.row = r.id;
      b.setAttribute('aria-pressed', String(sel.has(r.id)));
      b.setAttribute('aria-label', `${r.id} row`);
      const first = r.cells.find(Boolean).hira;
      b.innerHTML = `<span class="rowchip__k jp jp--textbook" lang="ja">${scriptChar(first)}</span><span class="rowchip__r">${r.id}</span>`;
      list.append(b);
    }
    wrap.append(list);
    els.rows.append(wrap);
  }
  const n = pool.length;
  els.poolCount.textContent = n ? `${n} kana in the pool` : 'Pick at least one row';
}

function renderChart() {
  if (settings.mode !== 'chart') {
    els.chart.hidden = true;
    return;
  }
  els.chart.hidden = false;
  els.chart.textContent = '';
  els.chart.classList.toggle('is-hide-romaji', !settings.romaji);
  els.chart.classList.toggle('is-both', settings.script === 'hk');
  const sel = new Set(settings.rows);
  const font = settings.font === 'mix' ? 'textbook' : settings.font;
  for (const g of GROUPS) {
    const sec = document.createElement('section');
    sec.className = `chart__group chart__group--${g.cols.length}`;
    sec.innerHTML = `<h3 class="chart__title">${g.name}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'chart__grid';
    grid.append(document.createElement('span'));
    for (const c of g.cols) {
      const h = document.createElement('span');
      h.className = 'chart__col';
      h.textContent = c;
      grid.append(h);
    }
    for (const r of ROWS.filter((row) => row.group === g.id)) {
      const lab = document.createElement('span');
      lab.className = 'chart__row';
      lab.textContent = r.id;
      grid.append(lab);
      const cells = r.id === 'n' ? [r.cells[0], null, null, null, null] : r.cells;
      for (const cell of cells) {
        if (!cell) {
          grid.append(document.createElement('span'));
          continue;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kcell';
        if (!sel.has(r.id)) b.classList.add('is-off');
        const ids = scripts().map((s) => `${s}:${cell.hira}`);
        const box = Math.min(...ids.map((id) => statOf(id)[0]));
        const seen = ids.some((id) => stats[id]);
        const weak = ids.some((id) => stats[id] && stats[id][0] === 0 && stats[id][2] > 0);
        const chars = scripts().map((s) => (s === 'h' ? cell.hira : toKatakana(cell.hira)));
        b.setAttribute('aria-label', `${chars.join(' ')} ${cell.romaji}`);
        b.innerHTML =
          `<span class="kcell__k jp jp--${font}" lang="ja">${chars.map((c, i) => `<span${i ? ' class="kcell__alt"' : ''}>${c}</span>`).join('')}</span>` +
          `<span class="kcell__r">${cell.romaji}</span>` +
          `<span class="kcell__pips${weak ? ' is-weak' : ''}" aria-hidden="true">${'<i></i>'.repeat(MAX_BOX)}</span>`;
        const pips = b.querySelectorAll('.kcell__pips i');
        pips.forEach((p, i) => p.classList.toggle('is-on', seen && i < box));
        grid.append(b);
      }
    }
    sec.append(grid);
    els.chart.append(sec);
  }
}

function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function renderStage() {
  const { phase, q } = state;
  els.stage.hidden = settings.mode === 'chart';
  if (settings.mode === 'chart') return;

  els.results.hidden = phase !== 'done';
  els.card.hidden = phase === 'done';
  els.card.dataset.state = phase;

  // Top bar.
  if (settings.mode === 'quiz' && state.quiz) {
    const qz = state.quiz;
    els.barL.textContent = phase === 'done' ? 'QUIZ · RESULT' : `QUIZ ${Math.min(qz.i + (phase === 'ask' ? 1 : 0), qz.items.length)}/${qz.items.length}`;
    els.barR.textContent = `✓ ${qz.right}  ✗ ${qz.missed.length}`;
  } else {
    const d = state.drill;
    els.barL.textContent = `DRILL · ${pool.length} KANA`;
    els.barR.textContent = d.total ? `STREAK ${d.streak}  ${d.right}/${d.total}` : 'STREAK 0';
  }

  if (phase === 'idle' || !q) {
    els.prompt.textContent = '- -';
    els.prompt.className = 'card__prompt';
    els.prompt.removeAttribute('lang');
    els.msg.textContent = pool.length ? '' : 'PICK SOME ROWS BELOW';
    els.answerBox.hidden = true;
    return;
  }

  if (phase === 'done') {
    els.msg.textContent = '';
    renderResults();
    els.answerBox.hidden = true;
    return;
  }

  const { item } = q;
  els.answerBox.hidden = false;
  if (q.dir === 'k2r') {
    els.prompt.textContent = item.char;
    els.prompt.className = `card__prompt ${q.font}`;
    els.prompt.lang = 'ja';
  } else {
    els.prompt.textContent = item.romaji;
    els.prompt.className = 'card__prompt card__prompt--romaji';
    els.prompt.removeAttribute('lang');
  }

  // Message line.
  if (phase === 'ask') {
    els.msg.textContent = q.dir === 'k2r' ? (q.answer === 'type' ? 'TYPE THE ROMAJI' : 'PICK THE READING') : `PICK THE ${item.script === 'h' ? 'HIRAGANA' : 'KATAKANA'}`;
  } else if (phase === 'ok') {
    els.msg.textContent = `✓ ${item.char} = ${item.romaji}`;
  } else if (phase === 'reveal') {
    let extra = '';
    if (q.answer === 'type' && state.given) {
      const other = pool.find((it) => it.script === item.script && it.accept.includes(state.given));
      extra = other ? `  (${state.given} is ${other.char})` : `  (not ${state.given})`;
    }
    els.msg.textContent = `✗ ${item.char} = ${item.romaji}${extra}`;
  }

  // Answer area.
  const typing = q.answer === 'type';
  els.typeForm.hidden = !typing;
  els.choices.hidden = typing;
  els.nextBtn.hidden = phase !== 'reveal';

  if (typing) {
    els.typeIn.readOnly = phase !== 'ask';
    if (phase === 'ask') {
      els.typeIn.value = '';
      els.typeIn.classList.remove('is-bad');
      els.typeIn.focus({ preventScroll: true });
    }
    if (phase === 'reveal') els.typeIn.classList.add('is-bad');
  } else {
    if (phase === 'ask') {
      // Mix mode: a typed question may have left focus in the now-hidden input,
      // which would swallow the 1–4 keys.
      if (document.activeElement === els.typeIn) els.typeIn.blur();
      els.choices.textContent = '';
      q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.dataset.id = opt.id;
        const label = q.dir === 'k2r' ? `<span class="choice__r">${opt.romaji}</span>` : `<span class="choice__k ${q.font}" lang="ja">${opt.char}</span>`;
        b.innerHTML = `<span class="choice__key" aria-hidden="true">${i + 1}</span>${label}`;
        els.choices.append(b);
      });
    } else {
      for (const b of els.choices.children) {
        b.disabled = true;
        if (b.dataset.id === item.id) b.classList.add('is-right');
        if (b.dataset.id === state.given && phase === 'reveal') b.classList.add('is-wrong');
      }
    }
  }
  if (phase === 'reveal' && !typing) els.nextBtn.focus({ preventScroll: true });
}

function renderResults() {
  const qz = state.quiz;
  const total = qz.items.length;
  const pct = Math.round((qz.right / total) * 100);
  const missed = qz.missed;
  els.results.innerHTML = `
    <p class="results__score"><span>${qz.right}</span>/${total}</p>
    <p class="results__sub">${pct}% · ${fmtTime(qz.time)}${missed.length ? '' : ' · CLEAN RUN'}</p>
    ${missed.length ? `<p class="results__label">MISSED</p><ul class="results__missed">${missed
      .map((it) => `<li><span class="jp jp--textbook" lang="ja">${it.char}</span>${it.romaji}</li>`)
      .join('')}</ul>` : ''}
    <div class="results__actions">
      ${missed.length ? `<button type="button" class="power-btn power-btn--small" data-act="retry">Retry misses (${missed.length})</button>` : ''}
      <button type="button" class="chip" data-act="again">New quiz</button>
    </div>`;
  const first = els.results.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

function renderAll() {
  syncControls();
  renderRows();
  renderChart();
  renderStage();
}

// ─── Events ───────────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const set = e.target.closest('[data-set]');
  if (set && !set.disabled) {
    const key = set.dataset.set;
    let val = set.dataset.value;
    if (key === 'length') val = Number(val);
    if (key === 'romaji') val = val === 'true';
    if (settings[key] === val) return;
    settings[key] = val;
    save();
    syncControls();
    if (key === 'romaji') renderChart();
    else {
      restart();
      renderRows();
      renderChart();
    }
    return;
  }

  const groupBtn = e.target.closest('.rowgroup__head');
  const rowBtn = e.target.closest('.rowchip');
  if (groupBtn || rowBtn) {
    const sel = new Set(settings.rows);
    if (rowBtn) {
      const id = rowBtn.dataset.row;
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
    } else {
      const ids = ROWS.filter((r) => r.group === groupBtn.dataset.group).map((r) => r.id);
      const all = ids.every((id) => sel.has(id));
      for (const id of ids) {
        if (all) sel.delete(id);
        else sel.add(id);
      }
    }
    settings.rows = ROW_IDS.filter((id) => sel.has(id));
    save();
    restart();
    renderRows();
    renderChart();
    return;
  }

  const choice = e.target.closest('.choice');
  if (choice && state.phase === 'ask') {
    answer(choice.dataset.id === state.q.item.id, choice.dataset.id);
    return;
  }

  const cell = e.target.closest('.kcell');
  if (cell) {
    cell.classList.toggle('is-shown');
    return;
  }

  const act = e.target.closest('[data-act]');
  if (act && state.quiz) {
    clearTimeout(state.timer);
    if (act.dataset.act === 'retry') startQuiz(quizItems(state.quiz.missed, state.quiz.missed.length));
    else startQuiz(quizItems(pool, settings.length));
    next();
  }
});

$('font').addEventListener('change', (e) => {
  settings.font = CHOICES.font.includes(e.target.value) ? e.target.value : 'textbook';
  save();
  renderChart();
  if (state.q && state.phase === 'ask') {
    state.q.font = fontClass(settings.font);
    renderStage();
  }
});

els.nextBtn.addEventListener('click', () => {
  if (state.phase === 'reveal') next();
});

els.typeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.phase === 'reveal') {
    next();
    return;
  }
  if (state.phase !== 'ask') return;
  const val = normalize(els.typeIn.value);
  if (!val) return;
  answer(state.q.item.accept.includes(val), val);
});

// Correct answers go through as soon as they're typed; wrong ones need Enter.
els.typeIn.addEventListener('input', () => {
  if (state.phase !== 'ask' || state.q.answer !== 'type') return;
  const val = normalize(els.typeIn.value);
  if (state.q.item.accept.includes(val)) answer(true, val);
});

// "Show": give up on this one (counts as a miss) and see the answer.
$('skip').addEventListener('click', () => {
  if (state.phase === 'ask') answer(false, '');
  els.typeIn.focus({ preventScroll: true });
});

els.typeIn.addEventListener('keydown', (e) => {
  // An IME confirm-Enter or a held key must not submit.
  if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229 || e.repeat)) e.preventDefault();
});

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, select, textarea')) return;
  if (state.phase === 'ask' && state.q?.answer === 'choice' && /^[1-4]$/.test(e.key)) {
    const b = els.choices.children[Number(e.key) - 1];
    if (b) {
      e.preventDefault();
      b.click();
    }
    return;
  }
  if (state.phase === 'reveal' && e.key === 'Enter' && !e.target.closest('button')) {
    e.preventDefault();
    next();
  }
});

// Reset progress, with an inline "are you sure" instead of a dialog.
let resetArmed = 0;
els.reset.addEventListener('click', () => {
  if (!resetArmed) {
    els.reset.textContent = 'Sure? Tap again';
    els.reset.classList.add('is-armed');
    resetArmed = setTimeout(() => {
      resetArmed = 0;
      els.reset.textContent = 'Reset progress';
      els.reset.classList.remove('is-armed');
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = 0;
  stats = {};
  save();
  els.reset.textContent = 'Progress cleared';
  els.reset.classList.remove('is-armed');
  setTimeout(() => { els.reset.textContent = 'Reset progress'; }, 1500);
  renderChart();
});

buildPool();
restart();
renderAll();

// Console hook for checking things by hand.
window.kanaLab = { settings, get stats() { return stats; }, get pool() { return pool; }, state, next, KANA, ROWS };
