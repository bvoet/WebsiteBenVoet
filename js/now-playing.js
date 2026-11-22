// Landing page "On Air" unit: what Ben is listening to on Spotify, read from his
// Last.fm scrobbles. The API key is a public, read-only key; the shared secret is
// never needed here and must not be committed.

const USER = 'manassas777';
const API_KEY = '29bc27c17bfcf66a64f5c02cedb17038';
const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';
const PROFILE = `https://www.last.fm/user/${USER}`;
const POLL_MS = 30000;
const TIMEOUT_MS = 10000;
// Last.fm's grey star placeholder, served when a track has no artwork.
const NO_ART = '2a96cbd8b46e442fc41c2b86b821562f';

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
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let last = null; // last good result, kept through network hiccups
  let timer = 0;
  let busy = false;

  img.addEventListener('error', () => {
    img.hidden = true;
  });

  async function fetchTrack() {
    const params = new URLSearchParams({
      method: 'user.getrecenttracks',
      user: USER,
      api_key: API_KEY,
      format: 'json',
      limit: '1',
    });
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}?${params}`, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(await res.json());
    } finally {
      clearTimeout(to);
    }
  }

  function render(np, failed) {
    const playing = !!np && np.playing;
    root.classList.toggle('is-playing', playing);
    if (led) led.classList.toggle('unit__led--on', playing);

    if (!np) {
      statusEl.textContent = failed ? 'NO SIGNAL' : 'OFF AIR';
      trackText.textContent = '—';
      artistEl.textContent = failed ? 'Last.fm is not answering' : 'Nothing played yet';
      albumEl.textContent = '';
      setArt('');
      root.href = PROFILE;
      root.removeAttribute('title');
      fitTrack();
      return;
    }

    const when = ago(np.when);
    statusEl.textContent = playing ? 'ON AIR' : when ? `LAST PLAYED · ${when}` : 'LAST PLAYED';
    trackText.textContent = np.name || 'Unknown track';
    artistEl.textContent = np.artist;
    albumEl.textContent = np.album;
    setArt(np.art);
    root.href = np.link;
    root.title = np.artist ? `${np.name} by ${np.artist}` : np.name;
    fitTrack();
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

  async function tick() {
    clearTimeout(timer);
    if (busy) return;
    busy = true;
    try {
      last = await fetchTrack();
      render(last, false);
    } catch {
      render(last, true);
    }
    busy = false;
    // Only poll while the tab is visible.
    if (!document.hidden) timer = setTimeout(tick, POLL_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else tick();
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

// Turn a Last.fm response into a small, validated record (or null if empty).
function parse(data) {
  if (!data || typeof data !== 'object' || data.error) {
    throw new Error((data && data.message) || 'Bad response');
  }
  const t = [].concat((data.recenttracks && data.recenttracks.track) || [])[0];
  if (!t || typeof t !== 'object') return null;

  const images = Array.isArray(t.image) ? t.image : [];
  const big = images.find((i) => i && i.size === 'extralarge') || images[images.length - 1];
  let art = text(big);
  if (!/^https:\/\/[\w.-]+\.(fastly\.net|last\.fm)\//.test(art) || art.includes(NO_ART)) art = '';

  const link = typeof t.url === 'string' && t.url.startsWith('https://www.last.fm/') ? t.url : PROFILE;
  const uts = Number(t.date && t.date.uts);

  return {
    name: text(t.name),
    artist: text(t.artist),
    album: text(t.album),
    art,
    link,
    playing: !!(t['@attr'] && t['@attr'].nowplaying === 'true'),
    when: Number.isFinite(uts) && uts > 0 ? uts * 1000 : 0,
  };
}

function text(v) {
  let s = '';
  if (typeof v === 'string') s = v;
  else if (v && typeof v['#text'] === 'string') s = v['#text'];
  return s.trim().slice(0, 200);
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
