// Song request board: guests request songs from their phones and upvote each other's.
// It runs all night alongside the games. The DJ sees a ranked list and marks songs
// as playing / played, or removes them. The big screen can show the board too.

const clean = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const norm = (s) => clean(s).toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, '');

const MAX_QUEUE = 300;
const COOLDOWN_MS = 10e3;
const LIMITS = [1, 2, 3, 5, 0]; // per-guest songs waiting in the queue; 0 = no limit

function newRequests() {
  return { open: true, limit: 3, list: [], nextId: 1, nowPlaying: null };
}

const score = (r) => r.votes.size;
const queued = (rq) =>
  rq.list.filter((r) => r.status === 'queued').sort((a, b) => score(b) - score(a) || a.at - b.at);
const played = (rq) => rq.list.filter((r) => r.status === 'played').sort((a, b) => b.doneAt - a.doneAt);

// Returns { error } or { ok, merged } where merged means it was already on the board and we upvoted it.
function addRequest(rq, player, { title, artist }) {
  if (!rq.open) return { error: 'Requests are closed right now.' };
  const t = clean(title, 80);
  const a = clean(artist, 60);
  if (!t) return { error: 'Type a song title.' };
  const key = norm(t) + '|' + norm(a);
  const keyNoArtist = norm(t);
  const same = rq.list.find((r) => r.status !== 'removed' && (r.key === key || (!a && r.keyT === keyNoArtist) || (!r.artist && r.keyT === keyNoArtist)));
  if (same?.status === 'queued') {
    same.votes.add(player.id);
    return { ok: true, merged: true };
  }
  if (same?.status === 'playing') return { error: "That one's playing right now!" };
  if (same?.status === 'played') return { error: 'That one has already been played tonight.' };
  const mine = rq.list.filter((r) => r.by === player.id && r.status === 'queued').length;
  if (rq.limit && mine >= rq.limit)
    return { error: `You've got ${mine} ${mine === 1 ? 'song' : 'songs'} waiting. Upvote others until one gets played.` };
  if (Date.now() - (player.lastRequest || 0) < COOLDOWN_MS) return { error: 'Hang on a few seconds before the next one.' };
  if (queued(rq).length >= MAX_QUEUE) return { error: 'The request list is full.' };
  player.lastRequest = Date.now();
  rq.list.push({
    id: String(rq.nextId++), title: t, artist: a, key, keyT: keyNoArtist,
    by: player.id, byName: player.name, votes: new Set([player.id]), at: Date.now(), status: 'queued',
  });
  return { ok: true, merged: false };
}

function vote(rq, player, id, on) {
  const r = rq.list.find((x) => x.id === String(id));
  if (!r || r.status !== 'queued' || r.by === player.id) return;
  on ? r.votes.add(player.id) : r.votes.delete(player.id);
}

// DJ actions: playing | played | removed | queued (undo)
function setStatus(rq, id, status) {
  const r = rq.list.find((x) => x.id === String(id));
  if (!r) return 'No such request';
  if (!['playing', 'played', 'removed', 'queued'].includes(status)) return 'Bad status';
  if (status === 'playing') {
    const cur = rq.list.find((x) => x.status === 'playing');
    if (cur && cur !== r) { cur.status = 'played'; cur.doneAt = Date.now(); }
  }
  r.status = status;
  if (status === 'played' || status === 'removed') r.doneAt = Date.now();
  if (status === 'playing') r.startedAt = Date.now();
  return null;
}

function settings(rq, { open, limit, clear }) {
  if (typeof open === 'boolean') rq.open = open;
  if (limit !== undefined && LIMITS.includes(Number(limit))) rq.limit = Number(limit);
  if (clear) { rq.list = []; }
}

const pub = (r, me) => ({
  id: r.id, title: r.title, artist: r.artist, byName: r.byName, votes: r.votes.size,
  ...(me ? { mine: r.by === me, voted: r.votes.has(me) } : {}),
});

function hostRequests(rq) {
  const playing = rq.list.find((r) => r.status === 'playing');
  return {
    open: rq.open, limit: rq.limit,
    queue: queued(rq).map((r) => pub(r)),
    playing: playing ? pub(playing) : null,
    played: played(rq).slice(0, 50).map((r) => pub(r)),
    removed: rq.list.filter((r) => r.status === 'removed').slice(-20).reverse().map((r) => pub(r)),
  };
}

function playerRequests(rq, playerId) {
  const playing = rq.list.find((r) => r.status === 'playing');
  const mine = rq.list.filter((r) => r.by === playerId);
  return {
    open: rq.open, limit: rq.limit,
    queue: queued(rq).slice(0, 100).map((r) => pub(r, playerId)),
    playing: playing ? pub(playing, playerId) : null,
    myWaiting: mine.filter((r) => r.status === 'queued').length,
    // So a guest's phone can tell them when their song comes on.
    myPlayingId: playing && playing.votes.has(playerId) ? playing.id : null,
    myPlayed: mine.filter((r) => r.status === 'played').length,
  };
}

module.exports = { newRequests, addRequest, vote, setStatus, settings, hostRequests, playerRequests, LIMITS };
