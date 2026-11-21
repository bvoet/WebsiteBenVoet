// Top lane matchup cheat sheet: pick Olaf or Illaoi per enemy champion.

import { DDRAGON, SPELLS, ITEMS, OLAF_BUILDS, OLAF_TIERS, MATCHUPS } from './lol-data.js';

const $ = (sel) => document.querySelector(sel);
const grid = $('#grid');
const detail = $('#detail');
const search = $('#search');
const empty = $('#empty');

const MINE = {
  olaf: { id: 'Olaf', name: 'Olaf' },
  illaoi: { id: 'Illaoi', name: 'Illaoi' },
};

const champImg = (id) => `${DDRAGON}/img/champion/${id}.png`;
const spellImg = (key) => `${DDRAGON}/img/spell/${SPELLS[key].id}.png`;
const itemImg = (name) => `${DDRAGON}/img/item/${ITEMS[name]}.png`;

// Small DOM helper: el('div.a.b', {attr}, ...children)
function el(tag, attrs = {}, ...kids) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function img(src, alt, cls, size) {
  const i = el(`img${cls ? '.' + cls : ''}`, { src, alt, width: size, height: size, loading: 'lazy', decoding: 'async' });
  // A missing portrait (e.g. a brand-new champion) shouldn't leave a broken icon.
  i.addEventListener('error', () => i.classList.add('is-missing'), { once: true });
  return i;
}

// ─── Verdict ──────────────────────────────────────────────────────────────

function scores(m) {
  return {
    olaf: m.olaf ? OLAF_TIERS[m.olaf.tier].score : null,
    illaoi: m.illaoi ? m.illaoi.score : null,
  };
}

// Returns { pick: 'olaf' | 'illaoi', close: bool, only: bool }
function verdict(m) {
  const s = scores(m);
  if (s.olaf == null) return { pick: 'illaoi', close: false, only: true };
  if (s.illaoi == null) return { pick: 'olaf', close: false, only: true };
  const diff = s.olaf - s.illaoi;
  return { pick: diff > 0 ? 'illaoi' : 'olaf', close: Math.abs(diff) <= 1, only: false };
}

for (const m of MATCHUPS) m.verdict = verdict(m);

// ─── Grid ─────────────────────────────────────────────────────────────────

const tiles = new Map();

for (const m of MATCHUPS) {
  const v = m.verdict;
  const btn = el('button.tile', { type: 'button', 'data-id': m.id, 'aria-label': `${m.name}: pick ${MINE[v.pick].name}` },
    img(champImg(m.id), '', 'tile__img', 64),
    el('span.tile__name', { text: m.name }),
    el(`span.tile__pick.tile__pick--${v.pick}${v.close ? '.is-close' : ''}`, {},
      img(champImg(MINE[v.pick].id), '', 'tile__pickimg', 22),
      el('span', { text: v.close ? `${MINE[v.pick].name}?` : MINE[v.pick].name }),
    ),
  );
  btn.addEventListener('click', () => select(m.id, { scroll: true }));
  const li = el('li', {}, btn);
  tiles.set(m.id, { li, btn, m });
  grid.append(li);
}

// ─── Filtering ────────────────────────────────────────────────────────────

let filter = 'all';
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function visibleMatchups() {
  const q = norm(search.value);
  return MATCHUPS.filter((m) =>
    (filter === 'all' || m.verdict.pick === filter) &&
    (!q || norm(m.name).includes(q) || norm(m.id).includes(q)));
}

function applyFilter() {
  const shown = new Set(visibleMatchups().map((m) => m.id));
  for (const [id, t] of tiles) t.li.hidden = !shown.has(id);
  empty.hidden = shown.size > 0;
}

search.addEventListener('input', () => {
  applyFilter();
  // An exact or single match opens straight away: handy during champ select.
  const vis = visibleMatchups();
  const q = norm(search.value);
  const exact = vis.find((m) => norm(m.name) === q);
  if (exact) select(exact.id);
  else if (q && vis.length === 1) select(vis[0].id);
});

search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = visibleMatchups()[0];
    if (first) select(first.id, { scroll: true });
  } else if (e.key === 'Escape') {
    search.value = '';
    applyFilter();
    select(null);
  }
});

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    for (const c of document.querySelectorAll('.chip')) c.classList.toggle('is-on', c === chip);
    applyFilter();
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────

function row(label, ...value) {
  return el('div.row', {}, el('dt', { text: label }), el('dd', {}, ...value));
}

function olafCard(m, picked) {
  const o = m.olaf;
  if (!o) return missingCard('olaf');
  const tier = OLAF_TIERS[o.tier];
  const rows = [];

  if (o.spells) {
    rows.push(row('Summoners',
      el('span.icons', {}, o.spells.map((k) => el('span.icon', {},
        img(spellImg(k), '', 'icon__img', 32), el('span', { text: SPELLS[k].name })))),
      o.alt ? el('span.sub', { text: o.alt }) : null,
    ));
  }

  const build = o.build === 'custom'
    ? { name: 'Build', items: o.items, note: '' }
    : OLAF_BUILDS[o.build];
  if (build) {
    rows.push(row(build.name,
      el('span.items', {}, build.items.map((name) => img(itemImg(name), name, 'item', 32))),
      el('span.sub', { text: [o.buildNote, build.note].filter(Boolean).join(' · ') }),
    ));
    for (const i of rows.at(-1).querySelectorAll('.item')) i.title = i.alt;
  }

  if (o.max) rows.push(row('Skill max', o.max));
  if (o.spikes) rows.push(row('Spikes', o.spikes));

  return card('olaf', picked, el(`span.badge.badge--${o.tier}`, { text: tier.label }), rows, o.tips);
}

function illaoiCard(m, picked) {
  const i = m.illaoi;
  if (!i) return missingCard('illaoi');
  const meter = el('span.meter', { 'aria-label': `Difficulty ${i.score} of 10` },
    Array.from({ length: 10 }, (_, k) => el(`i${k < i.score ? '.on' : ''}`)));
  const rows = [
    row('Runes', i.runes),
    row('Manamune', i.manamune),
  ];
  return card('illaoi', picked, el('span.score', {}, meter, el('b', { text: `${i.score}/10` })), rows, i.tips);
}

function card(who, picked, rating, rows, tips) {
  return el(`article.card${picked ? '.is-pick' : ''}`, {},
    el('header.card__head', {},
      img(champImg(MINE[who].id), '', 'card__img', 48),
      el('h3', { text: MINE[who].name }),
      picked ? el('span.stamp', { text: 'Pick' }) : null,
      rating,
    ),
    el('dl.card__rows', {}, rows),
    tips?.length ? el('ul.tips', {}, tips.map((t) => el('li', { text: t }))) : null,
  );
}

function missingCard(who) {
  return el('article.card.is-missing', {},
    el('header.card__head', {},
      img(champImg(MINE[who].id), '', 'card__img', 48),
      el('h3', { text: MINE[who].name }),
    ),
    el('p.card__none', { text: 'Not covered in the guide.' }),
  );
}

let current = null;

function select(id, { scroll = false } = {}) {
  const m = MATCHUPS.find((x) => x.id === id);
  for (const t of tiles.values()) t.btn.classList.toggle('is-active', t.m === m);
  current = m || null;

  try {
    history.replaceState(null, '', m ? `#${m.id}` : location.pathname + location.search);
  } catch { /* file:// or sandboxed */ }

  if (!m) {
    detail.hidden = true;
    detail.replaceChildren();
    return;
  }

  const v = m.verdict;
  const pickName = MINE[v.pick].name;
  const line = v.only
    ? `Only ${pickName} has notes for this lane.`
    : v.close ? 'Close call: both are fine, slight edge shown.' : `${pickName} has the easier lane.`;

  detail.replaceChildren(
    el('div.detail__head', {},
      img(champImg(m.id), m.name, 'detail__img', 96),
      el('div', {},
        el('p.detail__vs', { text: 'vs' }),
        el('h2.detail__name', { text: m.name }),
      ),
      el(`div.verdict.verdict--${v.pick}`, {},
        img(champImg(MINE[v.pick].id), '', 'verdict__img', 56),
        el('div', {},
          el('p.verdict__label', { text: v.close ? 'Lean' : 'Pick' }),
          el('p.verdict__name', { text: pickName }),
          el('p.verdict__line', { text: line }),
        ),
      ),
      el('button.detail__close', { type: 'button', 'aria-label': 'Close' , text: '×' }),
    ),
    el('div.cards', {},
      olafCard(m, v.pick === 'olaf'),
      illaoiCard(m, v.pick === 'illaoi'),
    ),
  );
  detail.querySelector('.detail__close').addEventListener('click', () => select(null));
  detail.hidden = false;
  if (scroll) detail.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ─── Boot ─────────────────────────────────────────────────────────────────

applyFilter();
const fromHash = decodeURIComponent(location.hash.slice(1));
if (fromHash && MATCHUPS.some((m) => m.id === fromHash)) select(fromHash);
window.addEventListener('hashchange', () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id !== current?.id) select(MATCHUPS.some((m) => m.id === id) ? id : null);
});
