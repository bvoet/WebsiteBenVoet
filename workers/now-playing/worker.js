// Cloudflare Worker for the landing page's "On Air" unit.
// Keeps the Spotify client secret and refresh token server-side and returns a
// small JSON record of what Ben is playing (or last played).
//
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
// Get the refresh token once with tools/spotify_token.py. See README.md here.
//
// No secrets live in this file; it is safe to keep in the public repo.

const ALLOWED_ORIGINS = [
  'https://benvoet.be',
  'https://www.benvoet.be',
  'https://bvoet.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const CACHE_SECONDS = 5; // all visitors share one Spotify lookup per 5 s
const CACHE_KEY = 'https://now-playing.internal/v1';

let token = null; // { value, exp } — lives as long as the isolate does

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method' }, 405, cors);

    const cache = caches.default;
    const key = new Request(CACHE_KEY);
    let data = null;

    const hit = await cache.match(key);
    if (hit) {
      data = await hit.json();
    } else {
      try {
        data = await lookup(env);
      } catch (err) {
        return json({ error: 'upstream', detail: String(err.message || err).slice(0, 120) }, 502, cors);
      }
      const stored = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
      });
      ctx.waitUntil(cache.put(key, stored));
    }

    // Advance the progress of a playing track by the time it sat in the cache,
    // so the client can use its own clock from here on.
    const now = Date.now();
    if (data.playing && data.duration) {
      data.progress = Math.min(data.duration, data.progress + Math.max(0, now - data.at));
    }
    data.at = now;
    return json(data, 200, cors);
  },
};

async function lookup(env) {
  const cur = await spotify(env, '/me/player/currently-playing?additional_types=episode');
  if (cur && cur.item) {
    return {
      ...describe(cur.item),
      playing: !!cur.is_playing,
      paused: !cur.is_playing,
      progress: Number(cur.progress_ms) || 0,
      when: 0,
      at: Date.now(),
    };
  }

  const recent = await spotify(env, '/me/player/recently-played?limit=1');
  const last = recent && Array.isArray(recent.items) ? recent.items[0] : null;
  if (last && last.track) {
    return {
      ...describe(last.track),
      playing: false,
      paused: false,
      progress: 0,
      when: Date.parse(last.played_at) || 0,
      at: Date.now(),
    };
  }

  return { empty: true, playing: false, paused: false, at: Date.now() };
}

// Reduce a Spotify track or episode to the fields the page needs.
function describe(item) {
  const isEpisode = item.type === 'episode';
  const images = (isEpisode ? item.images || (item.show && item.show.images) : item.album && item.album.images) || [];
  // Spotify lists images largest first; pick the smallest one that is at least 240 px.
  const fit = images.filter((i) => i && i.width >= 240).pop() || images[0];
  return {
    name: item.name || '',
    artist: isEpisode
      ? (item.show && item.show.name) || ''
      : (item.artists || []).map((a) => a.name).join(', '),
    album: isEpisode ? 'Podcast' : (item.album && item.album.name) || '',
    art: (fit && fit.url) || '',
    link: (item.external_urls && item.external_urls.spotify) || '',
    duration: Number(item.duration_ms) || 0,
  };
}

async function spotify(env, path, retried = false) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${await accessToken(env)}` },
  });
  if (res.status === 204) return null;
  if (res.status === 401 && !retried) {
    token = null;
    return spotify(env, path, true);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return res.json();
}

async function accessToken(env) {
  if (token && Date.now() < token.exp) return token.value;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`Token ${res.status}`);
  const body = await res.json();
  token = { value: body.access_token, exp: Date.now() + (Number(body.expires_in) - 60) * 1000 };
  return token.value;
}

function corsHeaders(origin) {
  const headers = { Vary: 'Origin' };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  }
  return headers;
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}
