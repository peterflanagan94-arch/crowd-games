// One-off check of candidate YouTube video ids via YouTube's public oEmbed endpoint.
// Runs on boot when YT_VERIFY=1. Logs compact chunks: "ytres <n> <json>" with ok ids and rejects.
const list = require('./yt-candidates.json');
const key = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
module.exports = async function verify() {
  const ok = {}, bad = [];
  for (const [label, id] of list) {
    const [artist, ...rest] = label.split(' - ');
    const title = rest.join(' - ').replace(/\(.*?\)/g, '').replace(/^\.\.\./, '');
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { bad.push([label, r.status]); continue; }
      const j = await r.json();
      const a = key(j.author_name), firstArtist = key(artist.split(/ ft\.| & |, /)[0]);
      const official = /vevo|official/i.test(j.author_name) || a.includes(firstArtist.slice(0, 6)) || firstArtist.includes(a.slice(0, 6));
      const titleOk = key(j.title).includes(key(title).slice(0, 12));
      if (titleOk && official) ok[label] = id; else bad.push([label, titleOk ? 'unofficial' : 'title', j.title, j.author_name]);
    } catch (e) { bad.push([label, 'ERR ' + e.message]); }
    await new Promise((res) => setTimeout(res, 120));
  }
  const okE = Object.entries(ok);
  for (let i = 0; i < okE.length; i += 60) console.log('ytres ok ' + JSON.stringify(Object.fromEntries(okE.slice(i, i + 60).map(([l, id]) => [l, id]))));
  for (let i = 0; i < bad.length; i += 30) console.log('ytres bad ' + JSON.stringify(bad.slice(i, i + 30)));
  console.log(`ytres done ok=${okE.length} bad=${bad.length}`);
};
