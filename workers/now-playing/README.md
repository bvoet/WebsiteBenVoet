# On Air Worker

A Cloudflare Worker that tells the landing page what Ben is playing on Spotify. The
browser can't call Spotify directly without exposing the client secret, so this Worker
holds the secrets and returns a small JSON record. The page polls it every 10 s and
falls back to Last.fm if it fails.

The Spotify app runs in Development Mode, so the owner's account needs an active
**Spotify Premium** subscription. If Premium lapses, the Worker stops answering and the
page shows Last.fm data instead.

## One-time setup

1. **Spotify app.** In the [Spotify developer dashboard](https://developer.spotify.com/dashboard),
   create an app:
   - Redirect URI: `http://127.0.0.1:8888/callback` (exactly; `localhost` is not allowed)
   - API: Web API
   - Copy the Client ID and Client secret from the app's settings.
2. **Refresh token.** From the repo root run `python tools/spotify_token.py`, enter the
   Client ID and secret, and approve the scopes in the browser. It prints a refresh token.
3. **Worker.** In the [Cloudflare dashboard](https://dash.cloudflare.com): Workers & Pages →
   Create → Worker → name it e.g. `benvoet-now-playing` → Deploy. Then Edit code, replace
   everything with [`worker.js`](worker.js) and Deploy.
4. **Secrets.** Worker → Settings → Variables and Secrets → add three of type *Secret*:
   `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`.
5. **Check.** Open the Worker URL (`https://benvoet-now-playing.<name>.workers.dev`). It should
   return JSON with your current or last track.
6. **Hook it up.** Put that URL in `WORKER_URL` at the top of `js/now-playing.js`.

Never commit the client secret or refresh token. `worker.js` itself contains no secrets.

## Response

```json
{
  "name": "...", "artist": "...", "album": "...",
  "art": "https://i.scdn.co/...", "link": "https://open.spotify.com/...",
  "playing": true, "paused": false,
  "progress": 81234, "duration": 215000,
  "when": 0, "at": 1795400000000
}
```

`when` is the `played_at` time (ms) when nothing is playing. `{ "empty": true }` means
Spotify has no recent history. Errors return `{ "error": ... }` with status 502.

Responses are cached for 5 s at the edge, so every visitor shares one Spotify lookup.
CORS only allows benvoet.be, bvoet.github.io and the local dev server on port 8000.
