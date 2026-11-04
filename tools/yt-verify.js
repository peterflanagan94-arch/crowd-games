// One-off check of candidate YouTube video ids via YouTube's public oEmbed endpoint.
// Runs on boot when YT_VERIFY=1 and logs one line per id: ytv|label|id|status|title|channel
const list = require('./yt-candidates.json');
module.exports = async function verify() {
  for (const [label, id] of list) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(8000) });
      const j = r.ok ? await r.json() : {};
      console.log(`ytv|${label}|${id}|${r.status}|${j.title || ''}|${j.author_name || ''}`);
    } catch (e) { console.log(`ytv|${label}|${id}|ERR|${e.message}|`); }
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log('ytv|done');
};
