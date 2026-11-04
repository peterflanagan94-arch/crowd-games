// Import song titles (not audio) from a public Spotify or Apple Music playlist link.
// Both services render the track list into the page as JSON, so no API keys are needed.
const ALLOWED = /^(open\.spotify\.com|music\.apple\.com|embed\.music\.apple\.com)$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-GB,en;q=0.9' }, signal: AbortSignal.timeout(10000) });
  if (!ALLOWED.test(new URL(res.url).hostname)) throw new Error('redirected off-site');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (text.length > 15e6) throw new Error('page too large');
  return text;
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function scripts(html, attrRe) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (attrRe.test(m[1])) { try { out.push(JSON.parse(m[2])); } catch { try { out.push(JSON.parse(decode(m[2]))); } catch {} } }
  return out;
}
// Depth-first walk that yields every object in a JSON tree.
function* walk(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 60) return;
  if (!Array.isArray(v)) yield v;
  for (const k in v) yield* walk(v[k], depth + 1);
}
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const label = (artist, title) => (artist ? `${artist} - ${title}` : title).replace(/\s+/g, ' ').slice(0, 100);
const uniq = (list) => [...new Set(list.filter(Boolean))];

async function spotify(u) {
  const m = u.pathname.match(/(playlist|album)\/([A-Za-z0-9]{10,40})/);
  if (!m) throw new Error('not a playlist link');
  const html = await fetchText(`https://open.spotify.com/embed/${m[1]}/${m[2]}`);
  let name = '', songs = [];
  for (const data of scripts(html, /__NEXT_DATA__|application\/json/)) {
    for (const o of walk(data)) {
      if (Array.isArray(o.trackList) && o.trackList.length > songs.length) {
        songs = o.trackList.map((t) => str(t.title) && label(str(t.subtitle).split(',')[0].trim(), str(t.title)));
        name = str(o.name) || str(o.title) || name;
      }
    }
  }
  songs = uniq(songs);
  return { name, songs, note: songs.length >= 100 ? 'Spotify only shares the first 100 songs of a playlist this way.' : '' };
}

async function apple(u) {
  const html = await fetchText(u.href);
  let name = '', songs = [];
  // 1) The page's own data: track rows carry title + artistName.
  for (const data of scripts(html, /serialized-server-data|application\/json/)) {
    const rows = [];
    for (const o of walk(data)) {
      if (str(o.title) && str(o.artistName) && (o.contentDescriptor || o.trackNumber != null || o.duration != null || o.id)) rows.push(label(str(o.artistName), str(o.title)));
    }
    if (rows.length > songs.length) songs = rows;
  }
  // 2) schema.org data as a fallback.
  for (const data of scripts(html, /ld\+json/)) {
    for (const o of walk(data)) {
      if (/Music(Playlist|Album)/.test(o['@type'] || '') && Array.isArray(o.track)) {
        name = str(o.name) || name;
        if (!songs.length) songs = o.track.map((t) => str(t.name) && label(str(t.byArtist?.name || t.byArtist?.[0]?.name), str(t.name)));
      }
    }
  }
  if (!name) name = decode((html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '').replace(/ (on|-) Apple Music.*$/, '');
  return { name, songs: uniq(songs), note: '' };
}

async function importPlaylist(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw Object.assign(new Error('Paste a Spotify or Apple Music playlist link.'), { user: true }); }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) throw Object.assign(new Error('Only Spotify and Apple Music playlist links work here. For anything else, export a CSV and use Import a playlist file.'), { user: true });
  return u.hostname.endsWith('spotify.com') ? spotify(u) : apple(u);
}

module.exports = { importPlaylist };
