# Build songx/data/albums.json: MusicBrainz release-group id + official tracklist per album,
# with each track matched to a song id from songs.json. Only metadata is written.
#
# Usage (from the repo root):
#   python tools/songx_albums.py
# Re-run after adding albums or songs. Responses are cached in your temp folder,
# and MusicBrainz is queried at most about once per second.
import json, sys, time, re, unicodedata, difflib, urllib.request, urllib.parse, os, tempfile

SONGS = sys.argv[1] if len(sys.argv) > 1 else 'songx/data/songs.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'songx/data/albums.json'
CACHE = os.path.join(tempfile.gettempdir(), 'songx-musicbrainz-cache')
os.makedirs(CACHE, exist_ok=True)
UA = 'songbook-metadata-script/1.0'

def get(path, params):
    url = 'https://musicbrainz.org/ws/2/' + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    key = os.path.join(CACHE, re.sub(r'[^a-zA-Z0-9]+', '_', url)[-180:] + '.json')
    if os.path.exists(key):
        return json.load(open(key, encoding='utf-8'))
    for attempt in range(4):
        time.sleep(1.2)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            data = json.load(urllib.request.urlopen(req, timeout=30))
            json.dump(data, open(key, 'w', encoding='utf-8'))
            return data
        except Exception as e:
            print('  retry', attempt, e, file=sys.stderr)
            time.sleep(3)
    raise RuntimeError('failed ' + url)

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    s = s.replace('&', ' and ').replace("'", '').replace('’', '').replace('.', '')
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())

ARTIST = {
    'Buffalo Springfield': 'Buffalo Springfield',
    'Buffalo Springfield Again': 'Buffalo Springfield',
    'Last Time Around': 'Buffalo Springfield',
    'Déjà Vu (CSNY)': 'Crosby, Stills, Nash & Young',
    'American Dream (CSNY)': 'Crosby, Stills, Nash & Young',
    'Long May You Run': 'The Stills-Young Band',
    "Everybody's Rockin'": 'Neil & the Shocking Pinks',
}
TITLE = {"Fuckin' Up": "F##in' Up"}
SKIP = {'Unreleased & Rarities', 'Covers & Traditional'}

data = json.load(open(SONGS, encoding='utf-8'))
by_id = {s['id']: s for s in data['songs']}
out = []

for album in data['albums']:
    name, year = album['name'], album['year']
    entry = {'name': name, 'year': year, 'mbid': None, 'tracks': [], 'extras': []}
    if name in SKIP:
        entry['extras'] = album['song_ids']
        out.append(entry)
        continue
    title = TITLE.get(name) or re.sub(r'\s*\((CSNY)\)$', '', name)
    artist = ARTIST.get(name, 'Neil Young')
    q = f'releasegroup:"{title}" AND artist:"{artist}"'
    res = get('release-group', {'query': q, 'limit': 15})
    cands = [rg for rg in res.get('release-groups', []) if rg.get('primary-type') == 'Album']
    def rank(rg):
        y = (rg.get('first-release-date') or '')[:4]
        return (norm(rg['title']) == norm(title), y == year, rg.get('score', 0))
    cands.sort(key=rank, reverse=True)
    if not cands:
        print('NO RG', name); out.append(entry); continue
    rg = cands[0]
    entry['mbid'] = rg['id']
    rels = get('release', {'release-group': rg['id'], 'inc': 'recordings media', 'limit': 100, 'status': 'official'})
    releases = rels.get('releases', [])
    def rel_rank(r):
        fmts = [m.get('format') or '' for m in r.get('media', [])]
        tracks = sum(m.get('track-count', 0) for m in r.get('media', []))
        orig = any(f in ('12" Vinyl', 'Vinyl', 'CD', 'Digital Media') for f in fmts)
        video = any(f in ('DVD', 'DVD-Video', 'Blu-ray') for f in fmts)
        # Earliest date first; then the plain edition (no video disc, fewest tracks).
        return ((r.get('date') or '9999')[:4], video, not orig, tracks)
    releases.sort(key=rel_rank)
    if not releases:
        print('NO RELEASE', name); out.append(entry); continue
    rel = releases[0]
    tracks = []
    multi = len(rel.get('media', [])) > 1
    for mi, m in enumerate(rel.get('media', []), 1):
        for t in m.get('tracks', []):
            tracks.append({'n': t.get('number') or str(t.get('position')), 'disc': mi if multi else None, 'title': t['title'], 'song_id': None})
    # Match album songs onto tracks.
    remaining = list(album['song_ids'])
    for t in tracks:
        nt = norm(t['title'])
        best, best_score = None, 0
        for sid in remaining:
            ns = norm(by_id[sid]['title'])
            sc = 1.0 if ns == nt else difflib.SequenceMatcher(None, ns, nt).ratio()
            if (ns and nt and (ns.startswith(nt) or nt.startswith(ns)) and min(len(ns), len(nt)) >= 4):
                sc = max(sc, 0.9)
            if sc > best_score:
                best, best_score = sid, sc
        if best is not None and best_score >= 0.82:
            t['song_id'] = best
            remaining.remove(best)
    entry['tracks'] = [{k: v for k, v in t.items() if v is not None} for t in tracks]
    entry['extras'] = remaining
    out.append(entry)
    print(f"{name:34} {rg['title'][:30]:30} {(rg.get('first-release-date') or '')[:4]} rel={rel.get('date')} tracks={len(tracks)} matched={len(album['song_ids'])-len(remaining)}/{len(album['song_ids'])}" + (f" UNMATCHED={[by_id[i]['title'] for i in remaining]}" if remaining else ''))

json.dump({'source': 'MusicBrainz (CC0)', 'albums': out}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
