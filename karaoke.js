// Karaoke night: guests sign up from their phones with a song, the DJ runs the queue,
// and the big screen shows who's singing and who's next. A lyrics video from YouTube
// can play on the big screen for each singer (the DJ's own karaoke software works too).
const crypto = require('crypto');
const { KARAOKE_LISTS, KARAOKE_YT } = require('./karaoke-songs');

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const key = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and')
  .replace(/\s(ft|feat|featuring)\.?\s.*?(?=\s-\s|$)/g, '').replace(/[^a-z0-9]+/g, '');
const YT_BY_KEY = new Map(Object.entries(KARAOKE_YT).map(([label, id]) => [key(label), id]));
const ytId = (s) => {
  const t = String(s || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  return (/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(t) || [])[1] || null;
};
const MAX_QUEUE = 200;

function startKaraoke(room, { title, perGuest, open } = {}) {
  room.game = {
    type: 'karaoke', title: clean(title, 80) || 'Karaoke',
    perGuest: Math.min(5, Math.max(1, Number(perGuest) || 1)), open: open !== false,
    queue: [], current: null, played: [], video: false,
  };
  return null;
}

function entry(singer, song, pid) {
  const s = clean(song, 100);
  return { id: crypto.randomBytes(5).toString('hex'), pid, singer: clean(singer, 60), song: s, yt: YT_BY_KEY.get(key(s)) || null, added: Date.now() };
}

function signUp(room, player, { song, with: partner } = {}) {
  const g = room.game;
  if (g?.type !== 'karaoke') return 'Karaoke isn\'t running right now.';
  if (!g.open) return 'Sign-ups are closed for now.';
  if (!clean(song, 100)) return 'Pick a song first.';
  const mine = g.queue.filter((e) => e.pid === player.id).length;
  if (mine >= g.perGuest) return g.perGuest === 1 ? "You're already in the queue. Sing that one first!" : `You can have ${g.perGuest} songs in the queue at once.`;
  if (g.queue.length >= MAX_QUEUE) return 'The queue is full.';
  const p2 = clean(partner, 30);
  g.queue.push(entry(p2 ? `${player.name} & ${p2}` : player.name, song, player.id));
  return null;
}

function cancel(room, player, id) {
  const g = room.game;
  if (g?.type !== 'karaoke') return;
  g.queue = g.queue.filter((e) => !(e.id === id && e.pid === player.id));
}

function next(room) {
  const g = room.game;
  if (g.current) g.played.push({ ...g.current, ended: Date.now() });
  g.current = g.queue.shift() || null;
  if (g.current) g.current.started = Date.now();
  g.video = !!g.current?.yt && g.autoVideo !== false;
  if (!g.current && !g.played.length) return 'Nobody has signed up yet.';
  return null;
}

function hostAction(room, act, d = {}) {
  const g = room.game;
  if (g?.type !== 'karaoke') return 'Karaoke isn\'t running';
  const find = () => (g.current?.id === d.id ? g.current : g.queue.find((e) => e.id === d.id));
  switch (act) {
    case 'next': return next(room);
    case 'add': {
      if (!clean(d.singer, 60) || !clean(d.song, 100)) return 'Add a singer and a song.';
      const e = entry(d.singer, d.song, null);
      if (ytId(d.link)) e.yt = ytId(d.link);
      g.queue.push(e);
      return null;
    }
    case 'remove': g.queue = g.queue.filter((e) => e.id !== d.id); return null;
    case 'move': {
      const i = g.queue.findIndex((e) => e.id === d.id), j = i + (d.dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= g.queue.length) return null;
      [g.queue[i], g.queue[j]] = [g.queue[j], g.queue[i]];
      return null;
    }
    case 'top': {
      const i = g.queue.findIndex((e) => e.id === d.id);
      if (i > 0) g.queue.unshift(...g.queue.splice(i, 1));
      return null;
    }
    case 'link': {
      const e = find(); if (!e) return 'That singer has gone.';
      if (d.link && !ytId(d.link)) return "That doesn't look like a YouTube link.";
      e.yt = ytId(d.link);
      e.ytStatus = null;
      return null;
    }
    case 'video': g.video = !!d.on && !!g.current?.yt; return null;
    case 'open': g.open = !!d.open; return null;
    case 'autoVideo': g.autoVideo = !!d.on; return null;
    default: return 'Unknown action';
  }
}

// Ask YouTube (oEmbed) whether each newly linked video can play inside another site.
// Many karaoke channels switch embedding off; better to know before the singer is up.
const linkCache = new Map(); // yt id -> 'ok' | 'blocked' | 'missing'
async function checkLinks(room, done) {
  const g = room.game;
  if (g?.type !== 'karaoke') return;
  const todo = [g.current, ...g.queue].filter((e) => e?.yt && !e.ytStatus);
  if (!todo.length) return;
  for (const e of todo) {
    let st = linkCache.get(e.yt);
    if (!st) {
      try {
        const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + e.yt)}`, { signal: AbortSignal.timeout(6000) });
        st = r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'blocked' : r.status === 404 || r.status === 400 ? 'missing' : null;
      } catch { st = null; }
      if (st) linkCache.set(e.yt, st);
    }
    e.ytStatus = st || 'unknown';
  }
  done();
}

const pub = (e) => e && { id: e.id, singer: e.singer, song: e.song };

function hostView(g) {
  return {
    type: 'karaoke', title: g.title, open: g.open, perGuest: g.perGuest, video: g.video, autoVideo: g.autoVideo !== false,
    current: g.current && { ...pub(g.current), yt: g.current.yt, ytStatus: g.current.ytStatus, started: g.current.started },
    queue: g.queue.map((e) => ({ ...pub(e), yt: e.yt, ytStatus: e.ytStatus, guest: !!e.pid })),
    played: g.played.length, now: Date.now(),
  };
}

function playerView(g, p) {
  const pos = g.queue.findIndex((e) => e.pid === p.id);
  return {
    type: 'karaoke', title: g.title, open: g.open, perGuest: g.perGuest,
    current: pub(g.current), onNow: g.current?.pid === p.id,
    next: g.queue.slice(0, 5).map(pub),
    mine: g.queue.map((e, i) => (e.pid === p.id ? { ...pub(e), pos: i + 1 } : null)).filter(Boolean),
    upNext: pos === 0, queueLength: g.queue.length,
  };
}

module.exports = { checkLinks, startKaraoke, signUp, cancel, hostAction, hostView, playerView, KARAOKE_LISTS, ytId };
