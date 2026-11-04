// One-off check of karaoke video ids (Sing King) via YouTube's public oEmbed endpoint.
// "link:xxxx" entries are Sing King short links (singking.link), followed to their YouTube video.
// Runs on boot when KARAOKE_VERIFY=1 and logs "kres ok {...}" / "kres bad [...]".
const list = require('./karaoke-candidates.json');
const key = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const idFrom = (u) => (/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(u || '') || [])[1];
async function resolve(v) {
  if (!v.startsWith('link:')) return v;
  let url = 'https://singking.link/' + v.slice(5);
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const loc = r.headers.get('location');
    const id = idFrom(loc) || idFrom(url);
    if (id) return id;
    if (!loc) { const body = await r.text(); return idFrom(body) || null; }
    url = new URL(loc, url).href;
  }
  return null;
}
module.exports = async function verify() {
  const ok = {}, bad = [];
  for (const [label, v] of list) {
    const title = label.split(' - ').slice(1).join(' - ').replace(/\(.*?\)/g, '');
    try {
      const id = await resolve(v);
      if (!id) { bad.push([label, 'no id']); continue; }
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { bad.push([label, id, r.status]); continue; }
      const j = await r.json();
      const okT = key(j.title).includes(key(title).slice(0, 10)) && /karaoke/i.test(j.title + j.author_name);
      if (okT) ok[label] = id; else bad.push([label, id, j.title, j.author_name]);
    } catch (e) { bad.push([label, 'ERR ' + e.message]); }
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log('kres ok ' + JSON.stringify(ok));
  console.log('kres bad ' + JSON.stringify(bad));
  console.log(`kres done ok=${Object.keys(ok).length} bad=${bad.length}`);
};
