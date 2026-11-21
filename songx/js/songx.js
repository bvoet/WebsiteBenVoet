import { transposeSongText, isChordLine, isChord } from './transpose.js';

let appData = null;
let currentSong = null;
let currentTab = 'album'; // 'album' | 'az'
let currentFilter = 'all'; // 'all' | 'studio' | 'unreleased' | 'cover' | 'latest'
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

// Init Theme
function initTheme() {
  const savedTheme = localStorage.getItem('songx_theme') || 
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
  localStorage.setItem('songx_theme', theme);
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
    renderAlbumView();
    renderAZView();
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
}

window.addEventListener('popstate', () => {
  handleInitialRoute();
});

// Render Albums
function renderAlbumView() {
  if (!albumView || !appData) return;
  const filteredAlbums = getFilteredAlbums();

  albumView.innerHTML = '';
  if (filteredAlbums.length === 0) {
    albumView.innerHTML = '<div class="no-results">No albums match this filter.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'album-grid';

  filteredAlbums.forEach(album => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.id = `album-${album.name.replace(/\s+/g, '-').toLowerCase()}`;

    const header = document.createElement('div');
    header.className = 'album-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'album-title-wrap';

    if (album.year) {
      const yearSpan = document.createElement('span');
      yearSpan.className = 'album-year';
      yearSpan.textContent = album.year;
      titleWrap.appendChild(yearSpan);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'album-name';
    nameSpan.textContent = album.name;
    titleWrap.appendChild(nameSpan);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'album-meta-right';

    const trackCount = document.createElement('span');
    trackCount.className = 'album-track-count';
    trackCount.textContent = `${album.song_ids.length} song${album.song_ids.length === 1 ? '' : 's'}`;

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'album-toggle-icon';
    toggleIcon.textContent = '▼';

    rightWrap.appendChild(trackCount);
    rightWrap.appendChild(toggleIcon);

    header.appendChild(titleWrap);
    header.appendChild(rightWrap);

    // Track list container
    const tracksContainer = document.createElement('div');
    tracksContainer.className = 'album-tracks';

    // Get song objects
    const albumSongs = album.song_ids
      .map(id => appData.songs.find(s => s.id === id))
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title));

    albumSongs.forEach(song => {
      const link = createSongLink(song);
      tracksContainer.appendChild(link);
    });

    header.addEventListener('click', () => {
      card.classList.toggle('collapsed');
    });

    card.appendChild(header);
    card.appendChild(tracksContainer);
    grid.appendChild(card);
  });

  albumView.appendChild(grid);
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

  return list;
}

function getFilteredAlbums() {
  if (!appData) return [];
  let list = appData.albums;

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
      albumView.classList.add('active');
      albumView.style.display = 'block';
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
  if (alphaBar) alphaBar.style.display = 'none';

  searchView.classList.add('active');
  searchView.style.display = 'block';

  // Search in title, album, body, chords, notes
  const results = appData.songs.filter(s => {
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
    albumView.style.display = 'block';
    azView.classList.remove('active');
    azView.style.display = 'none';
    if (alphaBar) alphaBar.style.display = 'none';
  } else {
    albumView.classList.remove('active');
    albumView.style.display = 'none';
    azView.classList.add('active');
    azView.style.display = 'block';
    if (alphaBar) alphaBar.style.display = 'flex';
  }
}

// Filter Switching
function switchFilter(filter) {
  currentFilter = filter;
  renderAlbumView();
  renderAZView();
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
  item.innerHTML = `<span class="meta-label">${label}:</span> <span class="meta-value ${isMono ? 'mono' : ''}">${val}</span>`;
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
      pill.innerHTML = `<b>${parts[0].trim()}</b>: ${parts[1].trim()}`;
    } else {
      pill.textContent = d;
    }
    songChordDefsEl.appendChild(pill);
  });
}

function renderTransposedBody() {
  if (!currentSong) return;
  const rawBody = currentSong.body || '';
  const transposed = transposeSongText(rawBody, transposeDelta);

  // Format chords in chordsDisplayEl
  const lines = transposed.split('\n');
  const formattedHtml = lines.map(line => {
    if (isChordLine(line)) {
      // Highlight individual chords
      return line.replace(/\b([A-G][#b]?(?:m|maj|min|dim|aug|sus[24]?|add[0-9]+|[0-9]+|M[0-9]+|\+)??(?:\/[A-G][#b]?)?)\b/g, (match) => {
        if (isChord(match)) {
          return `<span class="chord">${match}</span>`;
        }
        return match;
      });
    }
    if (/^(INTRO|VERSE|CHORUS|BRIDGE|OUTRO|SOLO|RIFF):?/i.test(line.trim())) {
      return `<span class="section-header">${line}</span>`;
    }
    return escapeHtml(line);
  }).join('\n');

  chordsDisplayEl.innerHTML = formattedHtml;
  if (transposeValEl) {
    transposeValEl.textContent = transposeDelta === 0 ? '0' : (transposeDelta > 0 ? `+${transposeDelta}` : `${transposeDelta}`);
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Close Song View
function closeSong(pushState = true) {
  currentSong = null;
  stopAutoScroll();
  document.title = 'SongX.se - The Neil Young Songbook';

  songViewContainer.classList.remove('active');
  songViewContainer.style.display = 'none';
  mainBrowseArea.style.display = 'block';

  if (pushState) {
    history.pushState(null, '', window.location.pathname);
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

// Event Listeners
function setupEvents() {
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
