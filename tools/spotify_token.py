# Get a Spotify refresh token for the "On Air" Cloudflare Worker (workers/now-playing/).
# Run once on your own computer. Nothing is written to disk or sent anywhere except Spotify.
#
# Usage (from the repo root):
#   python tools/spotify_token.py
# It asks for the app's Client ID and Client secret (the secret is not echoed), opens
# Spotify's consent page in your browser, catches the redirect on
# http://127.0.0.1:8888/callback and prints the refresh token.
# Paste that token into the Worker as the secret SPOTIFY_REFRESH_TOKEN. Don't commit it.
import base64, getpass, http.server, json, os, secrets, sys, urllib.error, urllib.parse, urllib.request, webbrowser

PORT = 8888
REDIRECT = f'http://127.0.0.1:{PORT}/callback'
SCOPES = 'user-read-currently-playing user-read-recently-played'

client_id = os.environ.get('SPOTIFY_CLIENT_ID') or input('Client ID: ').strip()
client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET') or getpass.getpass('Client secret (hidden): ').strip()
if not client_id or not client_secret:
    sys.exit('Client ID and secret are both needed.')

state = secrets.token_urlsafe(16)
result = {}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != '/callback':
            self.send_response(404)
            self.end_headers()
            return
        q = urllib.parse.parse_qs(url.query)
        if q.get('state', [''])[0] != state:
            result['error'] = 'state mismatch'
        elif 'error' in q:
            result['error'] = q['error'][0]
        else:
            result['code'] = q.get('code', [''])[0]
        ok = 'code' in result
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        msg = 'Done. You can close this tab and go back to the terminal.' if ok else 'Something went wrong; see the terminal.'
        self.wfile.write(f'<p style="font:18px sans-serif">{msg}</p>'.encode())

    def log_message(self, *args):
        pass


auth_url = 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode({
    'client_id': client_id,
    'response_type': 'code',
    'redirect_uri': REDIRECT,
    'scope': SCOPES,
    'state': state,
})

server = http.server.HTTPServer(('127.0.0.1', PORT), Handler)
print('Opening Spotify in your browser. If nothing opens, visit:\n' + auth_url + '\n')
webbrowser.open(auth_url)
while not result:
    server.handle_request()
server.server_close()

if 'error' in result:
    sys.exit('Spotify said: ' + result['error'])

basic = base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()
req = urllib.request.Request(
    'https://accounts.spotify.com/api/token',
    data=urllib.parse.urlencode({
        'grant_type': 'authorization_code',
        'code': result['code'],
        'redirect_uri': REDIRECT,
    }).encode(),
    headers={'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'},
)
try:
    body = json.load(urllib.request.urlopen(req, timeout=30))
except urllib.error.HTTPError as e:
    sys.exit(f'Token exchange failed ({e.code}): {e.read().decode(errors="replace")}')

print('Refresh token (paste into the Worker as SPOTIFY_REFRESH_TOKEN, keep it private):\n')
print(body['refresh_token'])
