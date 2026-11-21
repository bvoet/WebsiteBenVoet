import { transposeSongText, transposeChord, isChordLine, isChord, splitChordToken } from './transpose.js';
import { libraryFingering, parseChordDefs, diagramSVG, tuningStrings, STANDARD } from './chords.js';

let appData = null;
let albumMeta = null; // data/albums.json: cover ids + official track order
let currentSong = null;
let currentAlbum = null;
let currentTab = 'album'; // 'album' | 'az'
let currentFilter = 'all'; // 'all' | 'studio' | 'unreleased' | 'cover' | 'latest'
let currentTuning = 'all'; // 'all' | tuning string | 'none'
let transposeDelta = 0;
let fontSizeLevel = 0; // -2 to +4
let autoScrollTimer = null;
let autoScrollSpeed = 1;

// Elements
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear');
const countBadge = document.getElementById('count-badge');
const tabButtons = document.querySelectorAll('.tab-btn');
const alphaBar = document.getElementById('alpha-bar');
const albumView = document.getElementById('album-view');
const azView = document.getElementById('az-view');
const searchView = document.getElementById('search-view');
const songViewContainer = document.getElementById('song-view-container');
const mainBrowseArea = document.getElementById('main-browse-area');
const themeToggleBtn = document.getElementById('theme-toggle');
const toastEl = document.getElementById('toast');

// Song View elements
const songTitleEl = document.getElementById('song-title');
const songAlbumBadgeEl = document.getElementById('song-album-badge');
const songMetaGridEl = document.getElementById('song-meta-grid');
const songNotesBoxEl = document.getElementById('song-notes-box');
const songChordsBoxEl = document.getElementById('song-chords-box');
const songChordDefsEl = document.getElementById('song-chord-defs');
const chordsDisplayEl = document.getElementById('chords-display');
const transposeValEl = document.getElementById('transpose-val');
const btnAutoScroll = document.getElementById('btn-autoscroll');
const albumDetailView = document.getElementById('album-detail');
const tuningSelect = document.getElementById('tuning-filter');
const chordPop = document.getElementById('chord-pop');

// Init Theme
function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem('songx_theme'); } catch { /* storage blocked */ }
  const savedTheme = stored ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('songx_theme', theme); } catch { /* storage blocked */ }
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Load Data
async function loadData() {
  try {
    const res = await fetch('data/songs.json');
    if (!res.ok) throw new Error('Failed to load songs.json');
    appData = await res.json();
    try {
      const metaRes = await fetch('data/albums.json');
      if (metaRes.ok) albumMeta = await metaRes.json();
    } catch { /* covers and track order are optional */ }
    buildTuningFilter();
    renderAlbumView();
    renderAZView();
    updateCountBadge();
    handleInitialRoute();
  } catch (err) {
    console.error('Error loading songs:', err);
    if (mainBrowseArea) {
      mainBrowseArea.innerHTML = `<div class="no-results">Error loading song database: ${err.message}</div>`;
    }
  }
}

// Route Handling
function handleInitialRoute() {
  const params = new URLSearchParams(window.location.search);
  const songParam = params.get('song');
  const hash = window.location.hash.replace('#', '');
  const targetId = songParam || hash;

  if (targetId && !isNaN(targetId)) {
    const s = appData.songs.find(x => x.id === parseInt(targetId, 10));
    if (s) {
      openSong(s, false);
      return;
    }
  }
  closeSong(false);

  const albumParam = params.get('album');
  const album = albumParam && getAllAlbums().find(a => albumSlug(a.name) === albumParam);
  if (album) openAlbum(album, false);
  else closeAlbum(false);
}

window.addEventListener('popstate', () => {
  handleInitialRoute();
});

// ─── Albums ──────────────────────────────────────────────────────────────

const COVER_URL = (mbid, size = 250) => `https://coverartarchive.org/release-group/${mbid}/front-${size}`;

function albumSlug(name) {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Albums from songs.json, enriched with MusicBrainz data when available.
function getAllAlbums() {
  if (!appData) return [];
  const meta = new Map((albumMeta?.albums || []).map(a => [a.name, a]));
  return appData.albums.map(a => ({ ...a, meta: meta.get(a.name) || null }));
}

function songById(id) {
  return appData.songs.find(s => s.id === id);
}

// Songs of an album in tracklist order: [{ n, title, song }] with song = null
// for tracks that aren't transcribed. Songs that aren't on the official
// tracklist come last.
function albumTracks(album) {
  const rows = [];
  const used = new Set();
  for (const t of album.meta?.tracks || []) {
    const song = t.song_id != null ? songById(t.song_id) : null;
    if (song) used.add(song.id);
    rows.push({ n: t.n, disc: t.disc || null, title: t.title, song });
  }
  const rest = album.song_ids
    .filter(id => !used.has(id))
    .map(songById)
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
  for (const song of rest) rows.push({ n: null, title: song.title, song, extra: true });
  return rows;
}

function albumCover(album, size, cls) {
  const wrap = document.createElement('div');
  wrap.className = `album-cover ${cls || ''}`;
  const fallback = document.createElement('span');
  fallback.className = 'album-cover-fallback';
  fallback.textContent = album.name;
  wrap.appendChild(fallback);
  if (album.meta?.mbid) {
    const img = document.createElement('img');
    img.src = COVER_URL(album.meta.mbid, size);
    img.alt = `${album.name} cover`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => wrap.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    wrap.appendChild(img);
  }
  return wrap;
}

function renderAlbumView() {
  if (!albumView || !appData) return;
  const filteredAlbums = getFilteredAlbums();

  albumView.innerHTML = '';
  if (filteredAlbums.length === 0) {
    albumView.innerHTML = '<div class="no-results">No albums match this filter.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cover-grid';

  filteredAlbums.forEach(album => {
    const songs = album.song_ids.map(songById).filter(Boolean);
    const count = songs.filter(matchesTuning).length;

    const card = document.createElement('a');
    card.className = 'cover-card';
    card.href = `?album=${albumSlug(album.name)}`;
    card.appendChild(albumCover(album, 250));

    const info = document.createElement('span');
    info.className = 'cover-info';
    const name = document.createElement('span');
    name.className = 'cover-name';
    name.textContent = album.name;
    const meta = document.createElement('span');
    meta.className = 'cover-meta';
    meta.textContent = [album.year, `${count} song${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    info.append(name, meta);
    card.appendChild(info);

    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // allow open in new tab
      e.preventDefault();
      openAlbum(album, true);
    });
    grid.appendChild(card);
  });

  albumView.appendChild(grid);
}

function openAlbum(album, pushState = true) {
  currentAlbum = album;
  if (pushState) history.pushState({ album: album.name }, '', `?album=${albumSlug(album.name)}`);
  renderAlbumDetail();
  albumView.style.display = 'none';
  albumDetailView.style.display = 'block';
  document.title = `${album.name} - SongX Neil Young Songbook`;
  // Land just below the sticky toolbar so the cover isn't hidden behind it.
  const bar = document.querySelector('.toolbar');
  const barH = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
  const top = albumDetailView.getBoundingClientRect().top + window.scrollY - barH - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: pushState ? 'smooth' : 'auto' });
}

function closeAlbum(pushState = true) {
  currentAlbum = null;
  if (albumDetailView) {
    albumDetailView.style.display = 'none';
    albumDetailView.innerHTML = '';
  }
  if (pushState) history.pushState(null, '', window.location.pathname);
  if (!searchInput.value.trim() && currentTab === 'album') albumView.style.display = 'block';
}

function renderAlbumDetail() {
  const album = currentAlbum;
  if (!album || !albumDetailView) return;
  albumDetailView.innerHTML = '';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn-back album-back';
  back.textContent = '← All albums';
  back.addEventListener('click', () => {
    closeAlbum(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const head = document.createElement('header');
  head.className = 'album-detail-head';
  head.appendChild(albumCover(album, 500, 'album-cover--large'));
  const text = document.createElement('div');
  const h = document.createElement('h2');
  h.className = 'album-detail-title';
  h.textContent = album.name;
  const sub = document.createElement('p');
  sub.className = 'album-detail-sub';
  const rows = albumTracks(album);
  const have = rows.filter(r => r.song && !r.extra).length;
  const total = album.meta?.tracks?.length || 0;
  sub.textContent = [album.year, total ? `${have} of ${total} tracks transcribed` : `${rows.length} songs`].filter(Boolean).join(' · ');
  text.append(h, sub);
  head.appendChild(text);

  const list = document.createElement('ol');
  list.className = 'tracklist';
  let lastDisc = null;
  let extrasHeading = false;
  for (const r of rows) {
    if (r.disc && r.disc !== lastDisc) {
      const d = document.createElement('li');
      d.className = 'tracklist-disc';
      d.textContent = `Disc ${r.disc}`;
      list.appendChild(d);
      lastDisc = r.disc;
    }
    if (r.extra && !extrasHeading && total) {
      const d = document.createElement('li');
      d.className = 'tracklist-disc';
      d.textContent = 'Also filed under this album';
      list.appendChild(d);
      extrasHeading = true;
    }
    const li = document.createElement('li');
    li.className = 'track';
    const num = document.createElement('span');
    num.className = 'track-num';
    num.textContent = r.n || '';
    li.appendChild(num);
    if (r.song) {
      if (!matchesTuning(r.song)) li.classList.add('is-dim');
      li.appendChild(createSongLink(r.song));
    } else {
      li.classList.add('is-missing');
      const t = document.createElement('span');
      t.className = 'track-title';
      t.textContent = r.title;
      li.appendChild(t);
    }
    list.appendChild(li);
  }

  albumDetailView.append(back, head, list);
}

// ─── Tuning filter ───────────────────────────────────────────────────────

const TUNING_NAMES = {
  EADGBE: 'Standard',
  DADGBE: 'Drop D',
  DADGBD: 'Double drop D',
  DGCFAD: 'D standard',
  CGCFAD: 'Drop C',
  EbAbDbGbBb: 'E♭ standard',
};

function songTuning(song) {
  return song.tuning || 'none';
}

function matchesTuning(song) {
  return currentTuning === 'all' || songTuning(song) === currentTuning;
}

function buildTuningFilter() {
  if (!tuningSelect || !appData) return;
  const counts = new Map();
  for (const s of appData.songs) counts.set(songTuning(s), (counts.get(songTuning(s)) || 0) + 1);
  const order = [...counts.keys()].sort((a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return counts.get(b) - counts.get(a);
  });
  tuningSelect.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'All tunings';
  tuningSelect.appendChild(all);
  for (const t of order) {
    const o = document.createElement('option');
    o.value = t;
    const label = t === 'none' ? 'Not specified' : (TUNING_NAMES[t] ? `${TUNING_NAMES[t]} (${t})` : t);
    o.textContent = `${label} · ${counts.get(t)}`;
    tuningSelect.appendChild(o);
  }
  tuningSelect.value = currentTuning;
}

// Render A-Z View
function renderAZView() {
  if (!azView || !appData) return;
  const filteredSongs = getFilteredSongs();

  azView.innerHTML = '';
  if (filteredSongs.length === 0) {
    azView.innerHTML = '<div class="no-results">No songs match this filter.</div>';
    return;
  }

  // Group by first letter
  const groups = {};
  filteredSongs.forEach(s => {
    let first = s.title.charAt(0).toUpperCase();
    if (!/[A-Z]/.test(first)) first = '#';
    if (!groups[first]) groups[first] = [];
    groups[first].push(s);
  });

  const sortedLetters = Object.keys(groups).sort((a, b) => {
    if (a === '#') return -1;
    if (b === '#') return 1;
    return a.localeCompare(b);
  });

  // Render Alphabet jump bar
  if (alphaBar) {
    alphaBar.innerHTML = '';
    sortedLetters.forEach(l => {
      const btn = document.createElement('a');
      btn.className = 'alpha-btn';
      btn.href = `#letter-${l}`;
      btn.textContent = l;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = document.getElementById(`letter-${l}`);
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      });
      alphaBar.appendChild(btn);
    });
  }

  sortedLetters.forEach(l => {
    const sec = document.createElement('div');
    sec.className = 'letter-section';
    sec.id = `letter-${l}`;

    const heading = document.createElement('h2');
    heading.className = 'letter-heading';
    heading.textContent = l;
    sec.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'song-grid';

    groups[l].forEach(song => {
      grid.appendChild(createSongLink(song));
    });

    sec.appendChild(grid);
    azView.appendChild(sec);
  });
}

// Helper: create a song link element
function createSongLink(song) {
  const a = document.createElement('a');
  a.className = 'song-link';
  a.href = `?song=${song.id}`;

  const titleSpan = document.createElement('span');
  titleSpan.textContent = song.title;
  a.appendChild(titleSpan);

  if (song.tag) {
    const tagSpan = document.createElement('span');
    tagSpan.className = `song-tag ${song.tag.toLowerCase()}`;
    tagSpan.textContent = song.tag;
    a.appendChild(tagSpan);
  }

  a.addEventListener('click', (e) => {
    e.preventDefault();
    openSong(song, true);
  });

  return a;
}

// Filter helpers
function getFilteredSongs() {
  if (!appData) return [];
  let list = appData.songs;

  if (currentFilter === 'studio') {
    list = list.filter(s => s.year && s.album !== 'Unreleased & Rarities' && s.album !== 'Covers & Traditional');
  } else if (currentFilter === 'unreleased') {
    list = list.filter(s => s.album === 'Unreleased & Rarities');
  } else if (currentFilter === 'cover') {
    list = list.filter(s => s.tag === 'cover' || s.album === 'Covers & Traditional');
  } else if (currentFilter === 'latest') {
    const latestIds = new Set(appData.latest_ids || []);
    list = list.filter(s => latestIds.has(s.id));
  }

  return list.filter(matchesTuning);
}

function getFilteredAlbums() {
  if (!appData) return [];
  let list = getAllAlbums();
  if (currentTuning !== 'all') {
    list = list.filter(a => a.song_ids.some(id => {
      const song = songById(id);
      return song && matchesTuning(song);
    }));
  }

  if (currentFilter === 'studio') {
    list = list.filter(a => a.year && a.name !== 'Unreleased & Rarities' && a.name !== 'Covers & Traditional');
  } else if (currentFilter === 'unreleased') {
    list = list.filter(a => a.name === 'Unreleased & Rarities');
  } else if (currentFilter === 'cover') {
    list = list.filter(a => a.name === 'Covers & Traditional');
  }

  return list;
}

// Search handling
function handleSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) {
    searchClearBtn.style.display = 'none';
    searchView.classList.remove('active');
    searchView.style.display = 'none';
    if (currentTab === 'album') {
      if (currentAlbum) {
        albumDetailView.style.display = 'block';
      } else {
        albumView.classList.add('active');
        albumView.style.display = 'block';
      }
      if (alphaBar) alphaBar.style.display = 'none';
    } else {
      azView.classList.add('active');
      azView.style.display = 'block';
      if (alphaBar) alphaBar.style.display = 'flex';
    }
    updateCountBadge();
    return;
  }

  searchClearBtn.style.display = 'block';
  albumView.classList.remove('active');
  albumView.style.display = 'none';
  azView.classList.remove('active');
  azView.style.display = 'none';
  if (albumDetailView) albumDetailView.style.display = 'none';
  if (alphaBar) alphaBar.style.display = 'none';

  searchView.classList.add('active');
  searchView.style.display = 'block';

  // Search in title, album, body, chords, notes
  const results = appData.songs.filter(matchesTuning).filter(s => {
    return s.title.toLowerCase().includes(q) ||
      (s.album && s.album.toLowerCase().includes(q)) ||
      (s.body && s.body.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q)) ||
      (s.submitted_by && s.submitted_by.toLowerCase().includes(q));
  });

  searchView.innerHTML = '';
  const info = document.createElement('div');
  info.className = 'search-results-info';
  info.textContent = `Found ${results.length} song${results.length === 1 ? '' : 's'} matching "${q}":`;
  searchView.appendChild(info);

  if (results.length === 0) {
    const noRes = document.createElement('div');
    noRes.className = 'no-results';
    noRes.textContent = 'No matching songs found. Try a different title, lyric, or chord.';
    searchView.appendChild(noRes);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'song-grid';

  results.forEach(s => {
    const item = createSongLink(s);
    grid.appendChild(item);
  });

  searchView.appendChild(grid);
  if (countBadge) countBadge.textContent = `${results.length} found`;
}

function updateCountBadge() {
  if (!countBadge || !appData) return;
  const count = getFilteredSongs().length;
  countBadge.textContent = `${count} songs`;
}

// Tab Switching
function switchTab(tab) {
  currentTab = tab;
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (searchInput.value.trim()) {
    handleSearch(searchInput.value);
    return;
  }

  if (tab === 'album') {
    albumView.classList.add('active');
    albumView.style.display = currentAlbum ? 'none' : 'block';
    if (currentAlbum) albumDetailView.style.display = 'block';
    azView.classList.remove('active');
    azView.style.display = 'none';
    if (alphaBar) alphaBar.style.display = 'none';
  } else {
    albumView.classList.remove('active');
    albumView.style.display = 'none';
    if (albumDetailView) albumDetailView.style.display = 'none';
    azView.classList.add('active');
    azView.style.display = 'block';
    if (alphaBar) alphaBar.style.display = 'flex';
  }
}

// Filter Switching
function switchFilter(filter) {
  currentFilter = filter;
  rerenderLists();
}

function rerenderLists() {
  renderAlbumView();
  renderAZView();
  if (currentAlbum) renderAlbumDetail();
  updateCountBadge();
  if (searchInput.value.trim()) {
    handleSearch(searchInput.value);
  }
}

// Open Song View
function openSong(song, pushState = true) {
  currentSong = song;
  transposeDelta = 0;
  stopAutoScroll();

  if (pushState) {
    history.pushState({ songId: song.id }, '', `?song=${song.id}`);
  }

  document.title = `${song.title} - SongX Neil Young Songbook`;

  // Render song details
  songTitleEl.textContent = song.title;

  let albumText = song.album;
  if (song.year) albumText += ` (${song.year})`;
  songAlbumBadgeEl.textContent = albumText;

  // Metadata items
  songMetaGridEl.innerHTML = '';
  if (song.tuning) {
    addMetaItem('Tuning', song.tuning, true);
  }
  if (song.capo) {
    addMetaItem('Capo', song.capo, false);
  }
  if (song.submitted_by) {
    addMetaItem('Submitted By', song.submitted_by, false);
  }

  // Notes
  if (song.notes) {
    songNotesBoxEl.textContent = song.notes;
    songNotesBoxEl.style.display = 'block';
  } else {
    songNotesBoxEl.style.display = 'none';
  }

  // Chord definitions
  renderChordDefs(song.chord_defs);

  // Render Body Chords
  renderTransposedBody();

  // Show song view, hide browse area
  mainBrowseArea.style.display = 'none';
  songViewContainer.classList.add('active');
  songViewContainer.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addMetaItem(label, val, isMono) {
  const item = document.createElement('div');
  item.className = 'meta-item';
  const l = document.createElement('span');
  l.className = 'meta-label';
  l.textContent = `${label}:`;
  const v = document.createElement('span');
  v.className = `meta-value ${isMono ? 'mono' : ''}`;
  v.textContent = val;
  item.append(l, ' ', v);
  songMetaGridEl.appendChild(item);
}

function renderChordDefs(defs) {
  if (!defs || defs.length === 0) {
    songChordsBoxEl.style.display = 'none';
    return;
  }
  songChordsBoxEl.style.display = 'block';
  songChordDefsEl.innerHTML = '';

  defs.forEach(d => {
    const pill = document.createElement('span');
    pill.className = 'chord-def-pill';
    const parts = d.split(':');
    if (parts.length === 2) {
      const b = document.createElement('b');
      b.textContent = parts[0].trim();
      pill.append(b, `: ${parts[1].trim()}`);
      pill.classList.add('chord');
      pill.dataset.chord = parts[0].trim();
      pill.dataset.orig = parts[0].trim();
    } else {
      pill.textContent = d;
    }
    songChordDefsEl.appendChild(pill);
  });
}

function renderTransposedBody() {
  if (!currentSong) return;
  hideChordPop(true);
  const rawBody = currentSong.body || '';
  const transposed = transposeSongText(rawBody, transposeDelta);

  // Chords become hover targets; the original name is kept for the song's own fingerings.
  const origLines = rawBody.split('\n');
  const lines = transposed.split('\n');
  const formattedHtml = lines.map((line, li) => {
    if (isChordLine(line)) {
      const origTokens = (origLines[li] || '').split(/\s+/).filter(Boolean);
      let k = 0;
      return line.split(/(\s+)/).map(tok => {
        if (!tok || /^\s+$/.test(tok)) return tok;
        const orig = splitChordToken(origTokens[k++] || '')[1];
        const [pre, core, post] = splitChordToken(tok);
        if (core && isChord(core)) {
          return `${escapeHtml(pre)}<span class="chord" data-chord="${escapeHtml(core)}" data-orig="${escapeHtml(orig)}">${escapeHtml(core)}</span>${escapeHtml(post)}`;
        }
        return escapeHtml(tok);
      }).join('');
    }
    if (/^(INTRO|VERSE|CHORUS|BRIDGE|OUTRO|SOLO|RIFF):?/i.test(line.trim())) {
      return `<span class="section-header">${escapeHtml(line)}</span>`;
    }
    return escapeHtml(line);
  }).join('\n');

  chordsDisplayEl.innerHTML = formattedHtml;
  if (transposeValEl) {
    transposeValEl.textContent = transposeDelta === 0 ? '0' : (transposeDelta > 0 ? `+${transposeDelta}` : `${transposeDelta}`);
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close Song View
function closeSong(pushState = true) {
  currentSong = null;
  stopAutoScroll();
  document.title = 'SongX.se - The Neil Young Songbook';

  songViewContainer.classList.remove('active');
  songViewContainer.style.display = 'none';
  mainBrowseArea.style.display = 'block';

  hideChordPop(true);
  if (pushState) {
    const q = currentAlbum ? `?album=${albumSlug(currentAlbum.name)}` : window.location.pathname;
    history.pushState(null, '', q);
  }
}

// Transpose Buttons
function changeTranspose(delta) {
  transposeDelta += delta;
  if (transposeDelta > 11) transposeDelta = -11;
  if (transposeDelta < -11) transposeDelta = 11;
  renderTransposedBody();
}

function resetTranspose() {
  transposeDelta = 0;
  renderTransposedBody();
}

// Font Size
function changeFontSize(delta) {
  fontSizeLevel = Math.max(-2, Math.min(4, fontSizeLevel + delta));
  const baseSize = 1.05 + fontSizeLevel * 0.12;
  chordsDisplayEl.style.fontSize = `${baseSize}rem`;
}

// Auto Scroll
function toggleAutoScroll() {
  if (autoScrollTimer) {
    stopAutoScroll();
  } else {
    startAutoScroll();
  }
}

function startAutoScroll() {
  if (autoScrollTimer) clearInterval(autoScrollTimer);
  btnAutoScroll.classList.add('active');
  btnAutoScroll.innerHTML = '⏸ Pause';

  autoScrollTimer = setInterval(() => {
    window.scrollBy(0, autoScrollSpeed);
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 5) {
      stopAutoScroll();
    }
  }, 45);
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
  if (btnAutoScroll) {
    btnAutoScroll.classList.remove('active');
    btnAutoScroll.innerHTML = '▶ Auto Scroll';
  }
}

// Copy chords
function copyChords() {
  if (!currentSong) return;
  const transposed = transposeSongText(currentSong.body, transposeDelta);
  const textToCopy = `${currentSong.title}\nAlbum: ${currentSong.album} ${currentSong.year ? '(' + currentSong.year + ')' : ''}\n\n${transposed}`;
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('Chords copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard.');
  });
}

// ─── Chord diagrams on hover / tap ──────────────────────────────────────

let popTarget = null;
let popPinned = false;

function songIsStandard(song) {
  return !song.tuning || song.tuning === STANDARD;
}

// Which fingering to show for a chord element, and why.
function fingeringFor(el) {
  if (!currentSong) return null;
  const name = el.dataset.chord;
  const orig = el.dataset.orig || name;
  const defs = parseChordDefs(currentSong.chord_defs);
  const isPill = el.classList.contains('chord-def-pill');
  const delta = isPill ? 0 : transposeDelta;

  if (delta === 0 && defs.has(orig)) return { frets: defs.get(orig), note: 'From this song' };
  if (songIsStandard(currentSong)) {
    const lib = libraryFingering(name);
    if (lib) return { frets: lib.frets, note: lib.bassNote ? `Bass note ${lib.bassNote}` : '' };
  }
  if (defs.has(orig)) {
    const capo = ((delta % 12) + 12) % 12;
    return { frets: defs.get(orig), note: capo ? `Same shape, capo ${capo}` : 'From this song' };
  }
  return null;
}

function showChordPop(el, pinned = false) {
  if (!chordPop) return;
  const f = fingeringFor(el);
  const name = el.dataset.chord;
  const standard = songIsStandard(currentSong);
  const strings = standard ? null : tuningStrings(currentSong.tuning);

  chordPop.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'chord-pop-name';
  title.textContent = name;
  chordPop.appendChild(title);

  if (f) {
    const box = document.createElement('div');
    box.innerHTML = diagramSVG(f.frets, { strings });
    chordPop.appendChild(box.firstElementChild);
    const code = document.createElement('div');
    code.className = 'chord-pop-code';
    code.textContent = f.frets;
    chordPop.appendChild(code);
  }
  const notes = [];
  if (f?.note) notes.push(f.note);
  if (!standard) notes.push(`Tuning ${currentSong.tuning}`);
  if (!f) notes.push(standard ? 'No diagram for this chord' : 'No fingering for this tuning');
  if (notes.length) {
    const n = document.createElement('div');
    n.className = 'chord-pop-note';
    n.textContent = notes.join(' · ');
    chordPop.appendChild(n);
  }

  popTarget = el;
  popPinned = pinned;
  chordPop.hidden = false;
  positionChordPop();
}

function positionChordPop() {
  if (!popTarget || chordPop.hidden) return;
  const r = popTarget.getBoundingClientRect();
  const w = chordPop.offsetWidth;
  const h = chordPop.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = r.top - h - 8;
  chordPop.style.left = `${Math.round(left)}px`;
  chordPop.style.top = `${Math.round(Math.max(8, top))}px`;
}

function hideChordPop(force = false) {
  if (!chordPop || (popPinned && !force)) return;
  chordPop.hidden = true;
  popTarget = null;
  popPinned = false;
}

function setupChordPop() {
  for (const host of [chordsDisplayEl, songChordDefsEl]) {
    if (!host) continue;
    host.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('.chord');
      if (el && el !== popTarget && !popPinned) showChordPop(el);
    });
    host.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('.chord');
      if (el && !el.contains(e.relatedTarget)) hideChordPop();
    });
    // Tap (touch) or click pins the diagram until you tap elsewhere.
    host.addEventListener('click', (e) => {
      const el = e.target.closest('.chord');
      if (!el) return;
      e.stopPropagation();
      if (popPinned && popTarget === el) hideChordPop(true);
      else showChordPop(el, true);
    });
  }
  document.addEventListener('click', (e) => {
    if (!chordPop.contains(e.target)) hideChordPop(true);
  });
  // Follow the chord while the page scrolls (also during auto-scroll).
  window.addEventListener('scroll', () => {
    if (popTarget && !popTarget.isConnected) hideChordPop(true);
    else positionChordPop();
  }, { passive: true });
  window.addEventListener('resize', () => hideChordPop(true));
}

// Event Listeners
function setupEvents() {
  setupChordPop();

  if (tuningSelect) {
    tuningSelect.addEventListener('change', () => {
      currentTuning = tuningSelect.value;
      rerenderLists();
      tuningSelect.blur();
    });
  }

  // Search
  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    handleSearch('');
    searchInput.focus();
  });

  // Shortcut key '/' to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      if (currentSong) {
        closeSong(true);
      } else if (searchInput.value) {
        searchInput.value = '';
        handleSearch('');
      }
    }
  });

  // Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) {
        switchTab(btn.dataset.tab);
      } else if (btn.dataset.filter) {
        tabButtons.forEach(b => {
          if (b.dataset.filter) b.classList.remove('active');
        });
        btn.classList.add('active');
        switchFilter(btn.dataset.filter);
      }
    });
  });

  // Song view buttons
  document.getElementById('btn-back-to-browse').addEventListener('click', () => closeSong(true));
  document.getElementById('btn-transpose-down').addEventListener('click', () => changeTranspose(-1));
  document.getElementById('btn-transpose-up').addEventListener('click', () => changeTranspose(1));
  document.getElementById('btn-transpose-reset').addEventListener('click', () => resetTranspose());
  document.getElementById('btn-font-down').addEventListener('click', () => changeFontSize(-1));
  document.getElementById('btn-font-up').addEventListener('click', () => changeFontSize(1));
  btnAutoScroll.addEventListener('click', toggleAutoScroll);
  document.getElementById('btn-copy').addEventListener('click', copyChords);
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // Stop autoscroll on user scroll gesture
  window.addEventListener('wheel', () => stopAutoScroll(), { passive: true });
  window.addEventListener('touchmove', () => stopAutoScroll(), { passive: true });
}

// Startup
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEvents();
  loadData();
});
