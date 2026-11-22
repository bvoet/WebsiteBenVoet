// Landing page "On Air" unit: what Ben is listening to on Spotify.
// Primary source: a small Cloudflare Worker (workers/now-playing/) that talks to the
// Spotify API in near real time. Fallback: Last.fm scrobbles, which lag behind.
// Neither source needs a secret in this file: the Worker keeps Spotify's, and the
// Last.fm key is public and read-only.

// Set after deploying the Worker, e.g. 'https://benvoet-now-playing.<name>.workers.dev'.
// Empty means: Last.fm only.
const WORKER_URL = 'https://benvoet-now-playing.voetben.workers.dev/';

const LASTFM_USER = 'manassas777';
const LASTFM_KEY = '29bc27c17bfcf66a64f5c02cedb17038';
const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
const PROFILE = `https://www.last.fm/user/${LASTFM_USER}`;
// Last.fm's grey star placeholder, served when a track has no artwork.
const NO_ART = '2a96cbd8b46e442fc41c2b86b821562f';

const POLL_SPOTIFY_MS = 10000;
const POLL_LASTFM_MS = 30000;
const TIMEOUT_MS = 8000;

const root = document.getElementById('np');
if (root) init(root);

function init(root) {
  const led = document.getElementById('np-led');
  const img = document.getElementById('np-img');
  const statusEl = document.getElementById('np-status');
  const trackEl = document.getElementById('np-track');
  const trackText = trackEl.firstElementChild;
  const artistEl = document.getElementById('np-artist');
  const albumEl = document.getElementById('np-album');
  const progEl = document.getElementById('np-prog');
  const timeEl = document.getElementById('np-time');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = null; // last good result, kept through network hiccups
  let source = WORKER_URL ? 'spotify' : 'lastfm';
  let timer = 0;
  let clock = 0;
  let busy = false;
  let endKick = false; // refetch once when a track runs out

  img.addEventListener('error', () => {
    img.hidden = true;
  });

  async function fetchTrack() {
    if (WORKER_URL) {
      try {
        const np = parseWorker(await getJson(WORKER_URL));
        source = 'spotify';
        return np;
      } catch {
        // Worker down or Spotify unhappy: fall back to Last.fm below.
      }
    }
    const params = new URLSearchParams({
      method: 'user.getrecenttracks',
      user: LASTFM_USER,
      api_key: LASTFM_KEY,
      format: 'json',
      limit: '1',
    });
    const np = parseLastfm(await getJson(`${LASTFM_API}?${params}`));
    source = 'lastfm';
    return np;
  }

  function render(np, failed) {
    const playing = !!np && np.playing;
    root.classList.toggle('is-playing', playing);
    root.classList.toggle('has-progress', !!np && np.duration > 0 && (np.playing || np.paused));
    if (led) led.classList.toggle('unit__led--on', playing);

    if (!np) {
      statusEl.textContent = failed ? 'NO SIGNAL' : 'OFF AIR';
      trackText.textContent = '—';
      artistEl.textContent = failed ? 'Spotify is not answering' : 'Nothing played yet';
      albumEl.textContent = '';
      setArt('');
      root.href = PROFILE;
      root.removeAttribute('title');
      fitTrack();
      updateProgress();
      return;
    }

    const when = ago(np.when);
    if (playing) statusEl.textContent = 'ON AIR';
    else if (np.paused) statusEl.textContent = 'PAUSED';
    else statusEl.textContent = when ? `LAST PLAYED · ${when}` : 'LAST PLAYED';

    trackText.textContent = np.name || 'Unknown track';
    artistEl.textContent = np.artist;
    albumEl.textContent = np.album;
    setArt(np.art);
    root.href = np.link;
    root.title = np.artist ? `${np.name} by ${np.artist}` : np.name;
    fitTrack();
    updateProgress();
  }

  function setArt(src) {
    if (img.dataset.src === src) return;
    img.dataset.src = src;
    if (src) {
      img.hidden = false;
      img.src = src;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
    }
  }

  // Long titles scroll back and forth instead of being cut off.
  function fitTrack() {
    trackEl.classList.remove('is-long');
    const overflow = trackEl.scrollWidth - trackEl.clientWidth;
    if (overflow <= 1 || reduceMotion) return;
    trackEl.style.setProperty('--np-shift', `${-overflow}px`);
    trackEl.style.setProperty('--np-dur', `${Math.max(5, overflow / 22).toFixed(1)}s`);
    trackEl.classList.add('is-long');
  }

  // Progress runs on the local clock between polls.
  function position() {
    if (!current || !current.duration) return 0;
    const run = current.playing ? performance.now() - current.received : 0;
    return Math.min(current.duration, current.progress + run);
  }

  function updateProgress() {
    if (!current || !current.duration || !(current.playing || current.paused)) {
      timeEl.textContent = '';
      progEl.style.width = '0%';
      return;
    }
    const pos = position();
    progEl.style.width = `${((pos / current.duration) * 100).toFixed(2)}%`;
    timeEl.textContent = `${mmss(pos)} / ${mmss(current.duration)}`;
    // The track just ended: ask again soon instead of waiting for the next poll.
    if (current.playing && pos >= current.duration && !endKick) {
      endKick = true;
      clearTimeout(timer);
      timer = setTimeout(tick, 1500);
    }
  }

  function startClock() {
    clearInterval(clock);
    if (current && current.playing && current.duration && !document.hidden) {
      clock = setInterval(updateProgress, 1000);
    }
  }

  async function tick() {
    clearTimeout(timer);
    if (busy) return;
    busy = true;
    try {
      const np = await fetchTrack();
      if (np) np.received = performance.now();
      current = np;
      endKick = false;
      render(current, false);
    } catch {
      render(current, true);
    }
    busy = false;
    startClock();
    // Only poll while the tab is visible.
    if (!document.hidden) timer = setTimeout(tick, source === 'spotify' ? POLL_SPOTIFY_MS : POLL_LASTFM_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      clearInterval(clock);
    } else {
      tick();
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitTrack, 150);
  });
  // The LCD font changes text width once it loads.
  if (document.fonts) document.fonts.ready.then(fitTrack).catch(() => {});

  tick();
}

async function getJson(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

// The Worker's record, validated (or null if nothing was ever played).
function parseWorker(d) {
  if (!d || typeof d !== 'object' || d.error) throw new Error('Bad response');
  if (d.empty) return null;
  return {
    name: text(d.name),
    artist: text(d.artist),
    album: text(d.album),
    art: safeArt(d.art),
    link: safeLink(d.link),
    playing: d.playing === true,
    paused: d.paused === true,
    progress: num(d.progress),
    duration: num(d.duration),
    when: num(d.when),
  };
}

// Last.fm's recent-tracks response, validated (or null if empty).
function parseLastfm(data) {
  if (!data || typeof data !== 'object' || data.error) throw new Error('Bad response');
  const t = [].concat((data.recenttracks && data.recenttracks.track) || [])[0];
  if (!t || typeof t !== 'object') return null;
  const images = Array.isArray(t.image) ? t.image : [];
  const big = images.find((i) => i && i.size === 'extralarge') || images[images.length - 1];
  const uts = Number(t.date && t.date.uts);
  return {
    name: text(t.name),
    artist: text(t.artist),
    album: text(t.album),
    art: safeArt(text(big)),
    link: safeLink(t.url),
    playing: !!(t['@attr'] && t['@attr'].nowplaying === 'true'),
    paused: false,
    progress: 0,
    duration: 0,
    when: Number.isFinite(uts) && uts > 0 ? uts * 1000 : 0,
  };
}

function text(v) {
  let s = '';
  if (typeof v === 'string') s = v;
  else if (v && typeof v['#text'] === 'string') s = v['#text'];
  return s.trim().slice(0, 200);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function safeArt(url) {
  if (typeof url !== 'string' || url.includes(NO_ART)) return '';
  return /^https:\/\/([\w-]+\.scdn\.co|[\w.-]+\.fastly\.net|[\w.-]+\.last\.fm)\//.test(url) ? url : '';
}

function safeLink(url) {
  if (typeof url !== 'string') return PROFILE;
  return /^https:\/\/(open\.spotify\.com|www\.last\.fm)\//.test(url) ? url : PROFILE;
}

function mmss(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'JUST NOW';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} H AGO`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? '1 DAY AGO' : `${d} DAYS AGO`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}
