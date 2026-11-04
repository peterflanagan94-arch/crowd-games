// Crowd QR Games: DJ host screen + phone players, synced over Socket.IO.
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { SAMPLE_QUIZ, SAMPLE_HL, WEDDING, CHALLENGES } = require('./quiz-sample');
const { CATEGORIES, buildQuiz } = require('./quiz-packs');
const karaoke = require('./karaoke');
const { importPlaylist } = require('./playlist');
const { PLAYLISTS, YT } = require('./music-library');
const { EMOJI_CATEGORIES, buildEmojiRound, emojiQuestions } = require('./emoji-packs');

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- private mode ----------
// Set HOST_PASSWORD to lock the host screen (and the question packs behind it)
// so only you can start games. Guests joining with a room code are unaffected.
const HOST_PASSWORD = process.env.HOST_PASSWORD || '';
const HOST_TOKEN = HOST_PASSWORD ? crypto.createHmac('sha256', HOST_PASSWORD).update('crowd-qr-host').digest('hex') : '';
const COOKIE = 'cg_host';

const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
};
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const isHostAuthed = (cookieHeader) => !HOST_PASSWORD || safeEqual(readCookie(cookieHeader, COOKIE), HOST_TOKEN);
const setHostCookie = (req, res) => {
  const secure = (req.headers['x-forwarded-proto'] || req.protocol) === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${HOST_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
};

// Keep it out of search engines until launch.
app.use((_req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

const failedLogins = new Map(); // ip -> { n, until }
app.post('/login', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const f = failedLogins.get(ip);
  if (f && f.until > Date.now()) return res.redirect('/login?err=wait');
  const next = /^\/(?!\/)/.test(req.body?.next || '') ? req.body.next : '/host';
  if (HOST_PASSWORD && safeEqual(req.body?.password || '', HOST_PASSWORD)) {
    failedLogins.delete(ip);
    setHostCookie(req, res);
    return res.redirect(next);
  }
  const n = (f?.n || 0) + 1;
  failedLogins.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
  res.redirect('/login?err=1&next=' + encodeURIComponent(next));
});
app.get('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.redirect('/');
});

app.use((req, res, next) => {
  if (!HOST_PASSWORD) return next();
  const gated = req.path === '/host' || req.path === '/host.html' || req.path.startsWith('/api/');
  if (!gated || isHostAuthed(req.headers.cookie)) return next();
  // The DJ phone remote link carries the room's host key: treat it as a login for that phone.
  const r = req.path.startsWith('/host') && rooms.get(String(req.query.room || '').toUpperCase());
  if (r && req.query.key && safeEqual(req.query.key, r.hostKey)) { setHostCookie(req, res); return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login required' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- helpers ----------
function lanIp() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  let host = req.headers['x-forwarded-host'] || req.headers.host;
  // Phones can't reach "localhost", so swap in the machine's LAN address.
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) host = host.replace(/^(localhost|127\.0\.0\.1)/, lanIp());
  return `${proto}://${host}`;
}

app.get('/api/join-url/:code', async (req, res) => {
  const url = `${baseUrl(req)}/play?room=${encodeURIComponent(req.params.code.toUpperCase())}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } });
  res.json({ url, svg });
});

// The DJ's event logo, shown on the big screen, the wheel and the phones.
app.get('/logo/:code', (req, res) => {
  const r = rooms.get(String(req.params.code).toUpperCase());
  if (!r?.logo) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(r.logo.type).send(r.logo.buf);
});

// Popular karaoke songs for guests' phones (outside /api, which is for hosts only).
app.get('/karaoke-songs.json', (_req, res) => res.json(karaoke.KARAOKE_LISTS));

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

app.get('/api/qr', async (req, res) => {
  const data = String(req.query.data || '').slice(0, 500);
  if (!/^https?:\/\//.test(data)) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(data, { type: 'svg', margin: 1 }));
});

app.get('/api/sample-quiz', (_req, res) => res.json(SAMPLE_QUIZ));
app.get('/api/sample-hl', (_req, res) => res.json(SAMPLE_HL));
app.get('/api/wedding', (_req, res) => res.json(WEDDING));
app.get('/api/quiz-categories', (_req, res) =>
  res.json(CATEGORIES.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, count: c.questions.length }))));
app.get('/api/quiz-pack', (req, res) => {
  const cats = String(req.query.cats || '').split(',').filter(Boolean);
  const n = Math.min(100, Math.max(1, Number(req.query.n) || 10));
  res.json(buildQuiz(cats.length ? cats : CATEGORIES.map((c) => c.id), n, shuffle));
});
app.get('/api/emoji-categories', (_req, res) =>
  res.json(EMOJI_CATEGORIES.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, count: c.items.length }))));
app.get('/api/emoji-pack', (req, res) => {
  const cats = String(req.query.cats || '').split(',').filter(Boolean);
  const n = Math.min(100, Math.max(1, Number(req.query.n) || 10));
  res.json(buildEmojiRound(cats.length ? cats : EMOJI_CATEGORIES.map((c) => c.id), n, shuffle));
});
app.get('/api/challenges', (_req, res) => res.json(CHALLENGES));
app.get('/api/music-library', (_req, res) => res.json({ playlists: PLAYLISTS, yt: YT }));
app.get('/api/playlist', async (req, res) => {
  try {
    const out = await importPlaylist(req.query.url);
    console.log(`playlist import: ${new URL(req.query.url).hostname} -> ${out.songs.length} songs`);
    if (!out.songs.length) throw new Error('no songs found');
    res.json(out);
  } catch (e) {
    if (e.user) return res.status(400).json({ error: e.message });
    console.warn('playlist import failed:', e.message);
    res.status(502).json({ error: "Couldn't read that playlist. Check it's set to public. You can also export it as a CSV (for example with Exportify for Spotify) and use Import a playlist file." });
  }
});

const shuffle = (a) => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const clean = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

// ---------- rooms ----------
const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion

function newCode() {
  let code;
  do code = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
  while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: newCode(),
    hostKey: crypto.randomBytes(16).toString('hex'),
    coupleKey: crypto.randomBytes(12).toString('hex'), // for the couple's own phones in Mr & Mrs
    coupleSockets: { a: new Set(), b: new Set() },
    pickedTonight: new Set(), // volunteer draw: people already picked, so others get a turn
    hostSockets: new Set(),
    players: new Map(), // playerId -> { id, name, score, sockets:Set, card?, answer? }
    game: null,
    // type: wedding | party | pub. Names personalise the wedding games and screens.
    event: { type: 'party', title: '', a: '', b: '', accent: '' },
    logo: null, // { buf, type, v }: the DJ's logo, served at /logo/CODE
    ticketSeq: 0, // raffle ticket numbers, handed out as guests join
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

// Remove rooms idle for 12 hours.
setInterval(() => {
  const cutoff = Date.now() - 12 * 3600e3;
  for (const [code, r] of rooms) if (r.touched < cutoff) rooms.delete(code);
}, 600e3).unref();

const leaderboard = (room) =>
  [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, online: p.sockets.size > 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

// ---------- quiz ----------
function startQuiz(room, { questions, seconds }, variant = 'quiz') {
  const qs = (Array.isArray(questions) ? questions : [])
    .map((q) => ({
      q: clean(q.q, 300),
      options: (q.options || []).map((o) => clean(o, 120)).filter(Boolean).slice(0, 4),
      answer: Number(q.answer),
      hl: q.hl,
      cat: q.cat ? clean(q.cat, 40) : null,
      note: q.note ? clean(q.note, 120) : null, // shown after the reveal, e.g. the artist
      // Card rounds: "any" = every guess counts (an Ace with aces high-or-low), "none" = a pair, nobody scores.
      outcome: q.outcome === 'any' || q.outcome === 'none' ? q.outcome : null,
    }))
    .filter((q) => q.q && q.options.length >= 2 && (q.outcome || (q.answer >= 0 && q.answer < q.options.length)));
  if (!qs.length) return 'No valid questions.';
  for (const p of room.players.values()) p.score = 0;
  room.game = {
    type: 'quiz',
    variant,
    questions: qs,
    seconds: Math.min(120, Math.max(5, Number(seconds) || 20)),
    index: -1,
    phase: 'intro', // intro -> question -> reveal -> (next question | final)
    deadline: 0,
    answers: new Map(), // playerId -> { choice, at }
    timer: null,
  };
  return null;
}

function quizAdvance(room) {
  const g = room.game;
  if (g.phase === 'question') return quizReveal(room);
  if (g.index + 1 >= g.questions.length) {
    g.phase = 'final';
    return;
  }
  g.index++;
  g.phase = 'question';
  g.answers = new Map();
  g.startedAt = Date.now();
  g.deadline = g.startedAt + g.seconds * 1000;
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (room.game === g && g.phase === 'question') {
      quizReveal(room);
      broadcast(room);
    }
  }, g.seconds * 1000 + 300);
}

function quizReveal(room) {
  const g = room.game;
  clearTimeout(g.timer);
  g.phase = 'reveal';
  const q = g.questions[g.index];
  const total = g.seconds * 1000;
  g.lastPoints = {};
  for (const [pid, a] of g.answers) {
    const p = room.players.get(pid);
    if (!p) continue;
    let pts = 0;
    if (q.outcome === 'any' || (!q.outcome && a.choice === q.answer)) {
      // 500 for being right, up to 500 more for speed.
      const left = Math.max(0, g.deadline - a.at);
      pts = 500 + Math.round(500 * (left / total));
    }
    p.score += pts;
    g.lastPoints[pid] = pts;
  }
}

function quizAnswer(room, player, choice) {
  const g = room.game;
  if (!g || g.type !== 'quiz' || g.phase !== 'question') return;
  if (g.answers.has(player.id) || Date.now() > g.deadline) return;
  const c = Number(choice);
  if (!(c >= 0 && c < g.questions[g.index].options.length)) return;
  g.answers.set(player.id, { choice: c, at: Date.now() });
  // Everyone online has answered: reveal early.
  const online = [...room.players.values()].filter((p) => p.sockets.size);
  if (online.length && online.every((p) => g.answers.has(p.id))) quizReveal(room);
}

// ---------- emoji guess ----------
// Guests see a string of emojis and pick the film, song or phrase it spells out.
function startEmoji(room, { puzzles, seconds }) {
  const list = (Array.isArray(puzzles) ? puzzles : [])
    .map((p) => ({ e: clean(p.e, 60), a: clean(p.a, 120), note: clean(p.note, 120), cat: clean(p.cat, 40) }))
    .filter((p) => p.e && p.a)
    .slice(0, 100);
  if (!list.length) return 'Add at least one emoji puzzle.';
  return startQuiz(room, { questions: emojiQuestions(list, shuffle), seconds: seconds || 20 }, 'emoji');
}

// ---------- higher or lower ----------
// A chain of items with numbers. Each round shows the previous item's number
// and asks whether the next item's number is higher or lower.
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Playing-card higher or lower. aces: 'both' (an Ace counts high or low, whichever
// helps you, so any guess involving an Ace scores), 'high' (Ace = 14) or 'low' (Ace = 1).
// A pair (same rank) means nobody scores that round.
function startCardHigherLower(room, { rounds, aces, seconds }) {
  const mode = ['both', 'high', 'low'].includes(aces) ? aces : 'both';
  const n = Math.min(51, Math.max(3, Number(rounds) || 10));
  const deck = shuffle(SUITS.flatMap((s) => RANKS.map((r) => ({ r, s }))));
  const val = (c) => (c.r === 'A' ? (mode === 'high' ? 14 : 1) : RANKS.indexOf(c.r) + 1);
  const questions = [];
  for (let i = 1; i <= n; i++) {
    const a = deck[i - 1];
    const b = deck[i];
    let outcome = null;
    let answer = -1;
    if (mode === 'both' && (a.r === 'A' || b.r === 'A')) outcome = 'any';
    else if (val(a) === val(b)) outcome = 'none';
    else answer = val(b) > val(a) ? 0 : 1;
    questions.push({
      q: `Next card: higher or lower than ${a.r}${a.s}?`,
      options: ['Higher', 'Lower'],
      answer,
      outcome,
      hl: { cards: true, aces: mode, a: { label: `${a.r}${a.s}`, card: a }, b: { label: `${b.r}${b.s}`, card: b }, unit: '' },
    });
  }
  return startQuiz(room, { questions, seconds: seconds || 10 }, 'hl');
}

function startHigherLower(room, { items, unit, seconds, mode, rounds, aces }) {
  if (mode === 'cards') return startCardHigherLower(room, { rounds, aces, seconds });
  const list = (Array.isArray(items) ? items : [])
    .map((i) => ({ label: clean(i.label, 120), value: Number(i.value) }))
    .filter((i) => i.label && Number.isFinite(i.value));
  if (list.length < 2) return 'Higher or lower needs at least 2 items.';
  const u = clean(unit, 30);
  const questions = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    if (a.value === b.value) return `"${a.label}" and "${b.label}" have the same number. Reorder them so neighbours differ.`;
    questions.push({
      q: `${b.label}: higher or lower than ${a.label}?`,
      options: ['Higher', 'Lower'],
      answer: b.value > a.value ? 0 : 1,
      hl: { a, b, unit: u },
    });
  }
  return startQuiz(room, { questions, seconds: seconds || 15 }, 'hl');
}

// ---------- crowd vote ----------
// A vote can be a single question or a series sharing the same options
// (e.g. "Who's most likely to…" with the couple's names as the two options).
function startPoll(room, { question, options, series }) {
  const opts = (options || []).map((o) => clean(o, 80)).filter(Boolean).slice(0, 6);
  if (opts.length < 2) return 'A vote needs at least 2 options.';
  const qs = (Array.isArray(series) && series.length ? series : [question]).map((q) => clean(q, 200)).filter(Boolean);
  if (!qs.length) qs.push('Crowd vote');
  room.game = { type: 'poll', series: qs, index: 0, question: qs[0], options: opts, votes: new Map(), open: true };
  return null;
}

function pollNext(room) {
  const g = room.game;
  if (g.index + 1 >= g.series.length) return 'That was the last question.';
  g.index++;
  g.question = g.series[g.index];
  g.votes = new Map();
  g.open = true;
  return null;
}

function pollCounts(g) {
  const c = g.options.map(() => 0);
  for (const v of g.votes.values()) c[v]++;
  return c;
}

// ---------- volunteer draw ----------
// The DJ announces a challenge (hula hoop-off, fancy-dress karaoke…). Guests who
// want to take part tap "I'm in!", then the DJ draws people at random.
const DRAW_MS = 3500; // drumroll before the names land

function startChallenge(room, { title, count, exclude }) {
  const t = clean(title, 120);
  if (!t) return 'Give the challenge a name.';
  room.game = {
    type: 'challenge', title: t, count: Math.min(20, Math.max(1, Number(count) || 1)), exclude: exclude !== false,
    phase: 'signup', volunteers: new Set(), picked: [], timer: null,
  };
  return null;
}

function drawVolunteers(room, n) {
  const g = room.game;
  const vols = [...g.volunteers].filter((id) => room.players.has(id) && !g.picked.includes(id));
  if (!vols.length) return g.picked.length ? 'Everyone who volunteered has been picked.' : 'Nobody has volunteered yet.';
  // Prefer people who haven't been up tonight; top up with repeats only if needed.
  const fresh = shuffle(vols.filter((id) => !g.exclude || !room.pickedTonight.has(id)));
  const repeats = shuffle(vols.filter((id) => g.exclude && room.pickedTonight.has(id)));
  const chosen = [...fresh, ...repeats].slice(0, n);
  g.picked.push(...chosen);
  for (const id of chosen) room.pickedTonight.add(id);
  g.phase = 'drawing';
  g.justPicked = chosen;
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (room.game !== g) return;
    g.phase = 'picked';
    broadcast(room);
  }, DRAW_MS);
  return null;
}

// ---------- raffle & prize wheel ----------
// Raffle: every guest (or only those who tap "Enter") has a ticket number, and the
// wheel picks a winner for each prize. Wheel: the DJ's own list (forfeits, prizes,
// dares…), spun as often as they like. The server picks; the screen just animates.
const SPIN_MS = Number(process.env.CG_SPIN_MS) || 7000; // tests shorten it
const WHEEL_MAX = 24; // segments drawn on the wheel; bigger raffles show a random sample

function startRaffle(room, { mode, title, prizes, segments, entry, repeat }) {
  const lines = (a, n) => (Array.isArray(a) ? a : String(a || '').split('\n')).map((x) => clean(x, 60)).filter(Boolean).slice(0, n);
  const wheel = mode === 'wheel';
  const segs = lines(segments, 40);
  if (wheel && segs.length < 2) return 'Add at least 2 things to put on the wheel.';
  room.game = {
    type: 'raffle', mode: wheel ? 'wheel' : 'raffle',
    title: clean(title, 80) || (wheel ? 'Spin the wheel!' : 'Prize raffle'),
    prizes: lines(prizes, 50), segments: segs, entry: entry === 'optin' ? 'optin' : 'all',
    repeat: !!repeat, entrants: new Set(), skipped: new Set(), winners: [], phase: 'ready', spin: null, timer: null,
  };
  return null;
}

const ticketLabel = (p) => `#${String(p.ticket).padStart(3, '0')}`;

// Guests who can still win.
function rafflePool(room) {
  const g = room.game;
  const won = new Set(g.winners.map((w) => w.id));
  return [...room.players.values()].filter((p) =>
    (g.entry === 'all' || g.entrants.has(p.id)) && !g.skipped.has(p.id) && (g.repeat || !won.has(p.id)));
}

const segOf = (p) => ({ id: p.id, label: p.name, ticket: ticketLabel(p) });

// What the idle wheel shows before a spin: a stable sample, so it doesn't jump around.
function wheelPreview(room) {
  const g = room.game;
  if (g.mode === 'wheel') return g.segments.map((label) => ({ label }));
  return rafflePool(room).sort((a, b) => a.ticket - b.ticket).slice(0, WHEEL_MAX).map(segOf);
}

function spinWheel(room) {
  const g = room.game;
  if (g.phase === 'spinning') return 'The wheel is already spinning.';
  let segs, index, winner = null;
  if (g.mode === 'wheel') {
    segs = g.segments.map((label) => ({ label }));
    index = crypto.randomInt(segs.length);
  } else {
    const pool = rafflePool(room);
    if (!pool.length) return g.entry === 'optin' && !g.entrants.size ? 'Nobody has entered yet.' : 'Everyone in the draw has already won.';
    winner = pool[crypto.randomInt(pool.length)];
    if (pool.length <= WHEEL_MAX) {
      segs = wheelPreview(room);
    } else {
      // Show a random sample of entrants with the winner somewhere among them.
      segs = shuffle([winner, ...shuffle(pool.filter((p) => p !== winner)).slice(0, WHEEL_MAX - 1)]).map(segOf);
    }
    index = segs.findIndex((s) => s.id === winner.id);
  }
  const prize = g.mode === 'raffle' ? g.prizes[g.winners.length] || '' : '';
  g.phase = 'spinning';
  g.spin = { segs, index, at: Date.now(), ms: SPIN_MS, jitter: (crypto.randomInt(1000) / 1000 - 0.5) * 0.7, turns: 6 + crypto.randomInt(3) };
  g.pending = { id: winner?.id || null, label: winner ? winner.name : segs[index].label, ticket: winner ? ticketLabel(winner) : '', prize };
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (room.game !== g) return;
    g.phase = 'won';
    g.winners.push({ ...g.pending, at: Date.now() });
    if (winner) winner.score += 1;
    broadcast(room);
  }, SPIN_MS);
  return null;
}

function raffleView(room, g, forPlayer) {
  const spinning = g.phase === 'spinning';
  const last = g.phase === 'won' ? g.winners.at(-1) : null;
  return {
    type: 'raffle', mode: g.mode, title: g.title, phase: g.phase, entry: g.entry, repeat: g.repeat,
    segs: g.spin && g.phase !== 'ready' ? g.spin.segs.map(({ label, ticket }) => ({ label, ticket })) : wheelPreview(room).map(({ label, ticket }) => ({ label, ticket })),
    spin: g.spin && g.phase !== 'ready' ? { index: g.spin.index, at: g.spin.at, ms: g.spin.ms, jitter: g.spin.jitter, turns: g.spin.turns } : null,
    now: Date.now(),
    nextPrize: g.mode === 'raffle' ? (spinning ? g.pending.prize : g.prizes[g.winners.length] || '') : '',
    prizesLeft: Math.max(0, g.prizes.length - g.winners.length), prizeCount: g.prizes.length,
    last: last && { label: last.label, ticket: last.ticket, prize: last.prize, me: forPlayer ? last.id === forPlayer.id : undefined },
    // The winners list on screen; for a spin in progress, the result stays hidden.
    winners: g.winners.map(({ label, ticket, prize }) => ({ label, ticket, prize })),
    entrants: g.entry === 'all' ? room.players.size : [...g.entrants].filter((id) => room.players.has(id)).length,
    poolSize: g.mode === 'raffle' ? rafflePool(room).length : g.segments.length,
  };
}

// ---------- Mr & Mrs (couple game) ----------
// Each question has the couple's two names as options. The couple answer secretly
// (on their own phones, or the DJ taps their answers in) while guests vote on who
// they think the couple will pick. The DJ reveals the couple's answers, then the crowd's.
// Guests score 100 when they match the couple, but only if the couple agree.
const COUPLE_POINTS = 100;

function startCouple(room, { questions }) {
  const qs = (Array.isArray(questions) ? questions : []).map((q) => clean(q, 200)).filter(Boolean).slice(0, 50);
  if (!qs.length) return 'Add at least one question.';
  for (const p of room.players.values()) p.score = 0;
  room.game = { type: 'couple', questions: qs, index: -1, phase: 'intro', votes: new Map(), answers: { a: null, b: null }, agreed: 0, lastPoints: {} };
  return null;
}

function coupleNames(room) {
  return [room.event.a || 'Partner 1', room.event.b || 'Partner 2'];
}

// intro -> answering -> couple (couple revealed, voting locked) -> crowd (crowd revealed) -> next question … -> final
function coupleAdvance(room) {
  const g = room.game;
  if (g.phase === 'answering') {
    g.phase = 'couple';
    g.lastPoints = {};
    const { a, b } = g.answers;
    if (a != null && a === b) {
      g.agreed++;
      for (const [pid, v] of g.votes) {
        const p = room.players.get(pid);
        if (p && v === a) { p.score += COUPLE_POINTS; g.lastPoints[pid] = COUPLE_POINTS; }
      }
    }
    return;
  }
  if (g.phase === 'couple') { g.phase = 'crowd'; return; }
  if (g.index + 1 >= g.questions.length) { g.phase = 'final'; return; }
  g.index++;
  g.phase = 'answering';
  g.votes = new Map();
  g.answers = { a: null, b: null };
}

// Returns an error string, or null on success.
function setCoupleAnswer(room, who, choice) {
  const g = room.game;
  if (g?.type !== 'couple') return 'No Mr & Mrs game running';
  if (g.phase !== 'answering') return 'Answers are locked for this question';
  if (!['a', 'b'].includes(who)) return 'Bad partner';
  const c = choice == null ? null : Number(choice);
  if (c != null && c !== 0 && c !== 1) return 'Bad answer';
  g.answers[who] = c;
  return null;
}

function coupleCounts(g) {
  const c = [0, 0];
  for (const v of g.votes.values()) c[v]++;
  return c;
}

function coupleView(room, who) {
  const g = room.game;
  const names = coupleNames(room);
  const base = { role: 'couple', code: room.code, event: eventView(room), who, myName: who === 'a' ? names[0] : names[1] };
  if (g?.type !== 'couple') return { ...base, game: null };
  return { ...base, game: { type: 'couple', phase: g.phase, index: g.index, total: g.questions.length, question: g.questions[g.index] || null, options: names, myAnswer: g.answers[who] } };
}

// ---------- bingo (numbers + music) ----------
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];

const AUDIENCE = ['hidden', 'titles', 'video', 'both']; // what the crowd's screen shows in music bingo
function startBingo(room, { mode, songs, pattern, hideTitles, audience }) {
  let items;
  let size;
  if (mode === 'music') {
    const list = [...new Set((songs || []).map((s) => clean(s, 100)).filter(Boolean))].slice(0, 500);
    if (list.length < 16) return 'Music bingo needs at least 16 songs (24+ for a 5x5 card).';
    items = list.map((label, i) => ({ id: String(i), label }));
    size = list.length >= 24 ? 5 : 4;
  } else {
    items = Array.from({ length: 75 }, (_, i) => ({ id: String(i + 1), label: `${BINGO_COLS[Math.floor(i / 15)]} ${i + 1}` }));
    size = 5;
  }
  room.game = {
    type: 'bingo',
    mode: mode === 'music' ? 'music' : 'numbers',
    pattern: ['line', 'two', 'full'].includes(pattern) ? pattern : 'line',
    items,
    size,
    audience: AUDIENCE.includes(audience) ? audience : hideTitles ? 'hidden' : 'titles',
    hideTitles: false, // set below from audience: crowd must recognise songs by ear
    called: [], // item ids, in order
    winners: [], // { id, name, at }
    claimFlash: null,
  };
  room.game.hideTitles = room.game.mode === 'music' && ['hidden', 'video'].includes(room.game.audience);
  for (const p of room.players.values()) dealCard(room, p);
  return null;
}

function dealCard(room, p) {
  const g = room.game;
  const n = g.size * g.size;
  const free = g.size === 5 ? 12 : -1;
  let ids;
  if (g.mode === 'numbers') {
    // Classic layout: column c holds numbers 15c+1..15c+15.
    const cols = BINGO_COLS.map((_, c) => shuffle(Array.from({ length: 15 }, (_, i) => String(c * 15 + i + 1))).slice(0, 5));
    ids = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) ids.push(cols[c][r]);
  } else {
    ids = shuffle(g.items.map((i) => i.id)).slice(0, n);
  }
  if (free >= 0) ids[free] = 'FREE';
  p.card = ids;
}

function completedLines(card, size, calledSet) {
  const ok = (i) => card[i] === 'FREE' || calledSet.has(card[i]);
  const lines = [];
  for (let r = 0; r < size; r++) lines.push([...Array(size)].map((_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push([...Array(size)].map((_, r) => r * size + c));
  lines.push([...Array(size)].map((_, i) => i * size + i));
  lines.push([...Array(size)].map((_, i) => i * size + (size - 1 - i)));
  return lines.filter((l) => l.every(ok)).length;
}

function checkClaim(room, p) {
  const g = room.game;
  const called = new Set(g.called);
  if (g.pattern === 'full') return p.card.every((id) => id === 'FREE' || called.has(id));
  const need = g.pattern === 'two' ? 2 : 1;
  return completedLines(p.card, g.size, called) >= need;
}

// ---------- state views ----------
const eventView = (room) => ({ ...room.event, logo: room.logo ? `/logo/${room.code}?v=${room.logo.v}` : null });

function hostView(room) {
  const g = room.game;
  const base = { role: 'host', code: room.code, event: eventView(room), players: leaderboard(room), pickedTonight: room.pickedTonight.size };
  if (!g) return { ...base, game: null };
  if (g.type === 'challenge') {
    const nameOf = (id) => room.players.get(id)?.name || '?';
    return {
      ...base,
      game: {
        type: 'challenge', title: g.title, count: g.count, exclude: g.exclude, phase: g.phase,
        volunteers: [...g.volunteers].filter((id) => room.players.has(id)).map(nameOf),
        picked: g.picked.map(nameOf), justPicked: (g.justPicked || []).map(nameOf), drawMs: DRAW_MS,
        pickedTonight: room.pickedTonight.size,
      },
    };
  }
  if (g.type === 'raffle') return { ...base, game: raffleView(room, g) };
  if (g.type === 'karaoke') return { ...base, game: karaoke.hostView(g) };
  if (g.type === 'couple') {
    const revealed = g.phase === 'couple' || g.phase === 'crowd';
    return {
      ...base,
      game: {
        type: 'couple', phase: g.phase, index: g.index, total: g.questions.length, question: g.questions[g.index] || null,
        options: coupleNames(room), coupleKey: room.coupleKey, agreed: g.agreed,
        answered: { a: g.answers.a != null, b: g.answers.b != null },
        answers: revealed ? g.answers : null,
        counts: g.phase === 'crowd' ? coupleCounts(g) : null, votes: g.votes.size,
        coupleOnline: { a: room.coupleSockets.a.size > 0, b: room.coupleSockets.b.size > 0 },
      },
    };
  }
  if (g.type === 'poll') {
    return { ...base, game: { type: 'poll', question: g.question, options: g.options, counts: pollCounts(g), total: g.votes.size, open: g.open, index: g.index, of: g.series.length } };
  }
  if (g.type === 'quiz') {
    const q = g.questions[g.index];
    const counts = q ? q.options.map((_, i) => [...g.answers.values()].filter((a) => a.choice === i).length) : [];
    return {
      ...base,
      game: {
        type: 'quiz', variant: g.variant, phase: g.phase, index: g.index, total: g.questions.length,
        seconds: g.seconds, deadline: g.deadline, now: Date.now(),
        question: q ? { q: q.q, options: q.options, cat: q.cat } : null,
        hl: q?.hl ? hlView(q.hl, g.phase === 'reveal', q.outcome) : null,
        answer: g.phase === 'reveal' ? q.answer : null,
        note: g.phase === 'reveal' ? q.note : null,
        answeredCount: g.answers.size, counts: g.phase === 'reveal' ? counts : null,
      },
    };
  }
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i.label]));
  return {
    ...base,
    game: {
      type: 'bingo', mode: g.mode, pattern: g.pattern, size: g.size, hideTitles: g.hideTitles, audience: g.audience,
      items: g.items, called: g.called, lastCalled: g.called.length ? byId[g.called.at(-1)] : null,
      winners: g.winners, claimFlash: g.claimFlash,
    },
  };
}

// The second item's number stays hidden until the reveal.
const hlView = (hl, reveal, outcome) =>
  hl.cards
    ? { cards: true, aces: hl.aces, a: hl.a, b: reveal ? hl.b : null, outcome: reveal ? outcome : null, unit: '' }
    : { a: hl.a, b: { label: hl.b.label, value: reveal ? hl.b.value : null }, unit: hl.unit };

function playerView(room, p) {
  const g = room.game;
  const rank = leaderboard(room).findIndex((x) => x.id === p.id) + 1;
  const base = { role: 'player', code: room.code, event: eventView(room), me: { id: p.id, name: p.name, score: p.score, rank, ticket: ticketLabel(p) }, playerCount: room.players.size };
  if (!g) return { ...base, game: null };
  if (g.type === 'karaoke') return { ...base, game: karaoke.playerView(g, p) };
  if (g.type === 'raffle') {
    const v = raffleView(room, g, p);
    const won = g.winners.filter((w) => w.id === p.id).map((w) => w.prize || 'a win');
    return { ...base, game: { ...v, segs: undefined, spin: v.spin && { at: v.spin.at, ms: v.spin.ms }, entered: g.entry === 'all' || g.entrants.has(p.id), won } };
  }
  if (g.type === 'challenge') {
    const shown = g.phase === 'picked';
    return {
      ...base,
      game: {
        type: 'challenge', title: g.title, phase: g.phase, imIn: g.volunteers.has(p.id), volunteerCount: g.volunteers.size,
        // Who was picked stays secret during the drumroll.
        pickedMe: shown && g.picked.includes(p.id),
        picked: shown ? g.picked.map((id) => room.players.get(id)?.name || '?') : null,
      },
    };
  }
  if (g.type === 'couple') {
    const revealed = g.phase === 'couple' || g.phase === 'crowd';
    return {
      ...base,
      game: {
        type: 'couple', phase: g.phase, index: g.index, total: g.questions.length, question: g.questions[g.index] || null,
        options: coupleNames(room), myVote: g.votes.get(p.id) ?? null,
        answers: revealed ? g.answers : null, counts: g.phase === 'crowd' ? coupleCounts(g) : null,
        lastPoints: revealed ? g.lastPoints[p.id] || 0 : null,
        top: g.phase === 'final' ? leaderboard(room).slice(0, 3) : null,
      },
    };
  }
  if (g.type === 'poll') {
    const mine = g.votes.get(p.id);
    return { ...base, game: { type: 'poll', question: g.question, options: g.options, open: g.open, myVote: mine ?? null, counts: g.open ? null : pollCounts(g) } };
  }
  if (g.type === 'quiz') {
    const q = g.questions[g.index];
    const mine = g.answers.get(p.id);
    return {
      ...base,
      game: {
        type: 'quiz', variant: g.variant, phase: g.phase, index: g.index, total: g.questions.length,
        deadline: g.deadline, now: Date.now(), seconds: g.seconds,
        hl: q?.hl ? hlView(q.hl, g.phase === 'reveal', q.outcome) : null,
        options: q ? q.options : null, question: q ? q.q : null, cat: q?.cat || null,
        myChoice: mine ? mine.choice : null,
        answer: g.phase === 'reveal' ? q.answer : null,
        note: g.phase === 'reveal' ? q.note : null,
        lastPoints: g.phase === 'reveal' ? g.lastPoints[p.id] || 0 : null,
        top: g.phase === 'final' ? leaderboard(room).slice(0, 3) : null,
      },
    };
  }
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i.label]));
  return {
    ...base,
    game: {
      type: 'bingo', mode: g.mode, pattern: g.pattern, size: g.size,
      card: (p.card || []).map((id) => ({ id, label: id === 'FREE' ? 'FREE' : byId[id] })),
      lastCalled: g.called.length && !g.hideTitles ? byId[g.called.at(-1)] : null,
      hideTitles: g.hideTitles,
      calledCount: g.called.length,
      won: g.winners.some((w) => w.id === p.id),
      winners: g.winners.map((w) => w.name),
    },
  };
}

function broadcast(room) {
  room.touched = Date.now();
  const hv = hostView(room);
  for (const sid of room.hostSockets) io.to(sid).emit('state', hv);
  for (const p of room.players.values()) {
    const pv = playerView(room, p);
    for (const sid of p.sockets) io.to(sid).emit('state', pv);
  }
  for (const who of ['a', 'b']) {
    if (!room.coupleSockets[who].size) continue;
    const cv = coupleView(room, who);
    for (const sid of room.coupleSockets[who]) io.to(sid).emit('state', cv);
  }
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  let room = null;
  let player = null;
  let isHost = false;
  let coupleWho = null;

  const ack = (cb, v) => typeof cb === 'function' && cb(v);
  const host = (fn) => (data, cb) => {
    if (!isHost || !room) return ack(cb, { error: 'Not host' });
    const err = fn(data || {});
    ack(cb, err ? { error: err } : { ok: true });
    broadcast(room);
  };

  socket.on('host:create', (_d, cb) => {
    if (!isHostAuthed(socket.handshake.headers.cookie)) return ack(cb, { error: 'Login required' });
    room = createRoom();
    isHost = true;
    room.hostSockets.add(socket.id);
    ack(cb, { code: room.code, hostKey: room.hostKey });
    broadcast(room);
  });

  socket.on('host:resume', ({ code, hostKey } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.hostKey !== hostKey) return ack(cb, { error: 'Room not found' });
    room = r;
    isHost = true;
    room.hostSockets.add(socket.id);
    ack(cb, { code: room.code, hostKey: room.hostKey });
    broadcast(room);
  });

  socket.on('host:startQuiz', host((d) => startQuiz(room, d)));
  socket.on('host:next', host(() => {
    if (room.game?.type !== 'quiz') return 'No quiz running';
    quizAdvance(room);
  }));
  socket.on('host:startEmoji', host((d) => startEmoji(room, d)));
  socket.on('host:startHigherLower', host((d) => startHigherLower(room, d)));
  socket.on('host:startPoll', host((d) => startPoll(room, d)));
  socket.on('host:pollNext', host(() => {
    if (room.game?.type !== 'poll') return 'No vote running';
    return pollNext(room);
  }));
  socket.on('host:event', host((d) => {
    const type = ['wedding', 'party', 'pub'].includes(d.type) ? d.type : 'party';
    const accent = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '';
    room.event = { type, title: clean(d.title, 60), a: clean(d.a, 30), b: clean(d.b, 30), accent };
  }));
  socket.on('host:pollOpen', host(({ open }) => {
    if (room.game?.type !== 'poll') return 'No vote running';
    room.game.open = !!open;
  }));
  socket.on('host:startBingo', host((d) => startBingo(room, d)));
  socket.on('host:call', host(({ id }) => {
    const g = room.game;
    if (g?.type !== 'bingo') return 'No bingo running';
    const remaining = g.items.filter((i) => !g.called.includes(i.id));
    if (!remaining.length) return 'Everything has been called';
    let pick;
    if (id != null) pick = remaining.find((i) => i.id === String(id));
    else pick = remaining[crypto.randomInt(remaining.length)];
    if (!pick) return 'Already called';
    g.called.push(pick.id);
    g.claimFlash = null;
  }));
  socket.on('host:uncall', host(({ id }) => {
    const g = room.game;
    if (g?.type !== 'bingo') return 'No bingo running';
    g.called = g.called.filter((c) => c !== String(id));
  }));
  socket.on('host:pattern', host(({ pattern }) => {
    const g = room.game;
    if (g?.type !== 'bingo') return 'No bingo running';
    if (!['line', 'two', 'full'].includes(pattern)) return 'Bad pattern';
    g.pattern = pattern;
  }));
  socket.on('host:hideTitles', host(({ on }) => {
    if (room.game?.type !== 'bingo') return 'No bingo running';
    room.game.hideTitles = room.game.mode === 'music' && !!on;
    room.game.audience = on ? (room.game.audience === 'both' ? 'video' : 'hidden') : (room.game.audience === 'video' ? 'both' : 'titles');
  }));
  socket.on('host:audience', host(({ view }) => {
    const g = room.game;
    if (g?.type !== 'bingo' || g.mode !== 'music') return 'No music bingo running';
    if (!AUDIENCE.includes(view)) return 'Bad view';
    g.audience = view;
    g.hideTitles = ['hidden', 'video'].includes(view);
  }));
  socket.on('host:end', host(() => {
    if (room.game?.timer) clearTimeout(room.game.timer);
    room.game = null;
  }));
  socket.on('host:kick', host(({ id }) => {
    const p = room.players.get(id);
    if (!p) return 'No such player';
    for (const sid of p.sockets) io.to(sid).emit('kicked');
    room.players.delete(id);
  }));

  socket.on('player:join', ({ code, name, playerId } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return ack(cb, { error: "That room code doesn't exist." });
    const nm = clean(name, 20);
    const pid = clean(playerId, 64) || crypto.randomUUID();
    let p = r.players.get(pid);
    if (!p) {
      if (!nm) return ack(cb, { error: 'Pick a nickname.' });
      if ([...r.players.values()].some((x) => x.name.toLowerCase() === nm.toLowerCase()))
        return ack(cb, { error: 'That name is taken, try another.' });
      if (r.players.size >= 500) return ack(cb, { error: 'Room is full.' });
      p = { id: pid, name: nm, score: 0, sockets: new Set(), ticket: ++r.ticketSeq };
      r.players.set(pid, p);
      if (r.game?.type === 'bingo') dealCard(r, p);
    }
    p.sockets.add(socket.id);
    room = r;
    player = p;
    ack(cb, { ok: true, playerId: pid, name: p.name });
    broadcast(r);
  });

  socket.on('player:answer', ({ choice } = {}) => {
    if (!room || !player) return;
    quizAnswer(room, player, choice);
    broadcast(room);
  });

  socket.on('host:startKaraoke', host((d) => karaoke.startKaraoke(room, d)));
  socket.on('host:karaoke', host(({ act, ...d }) => {
    const err = karaoke.hostAction(room, act, d);
    if (!err && (act === 'add' || act === 'link')) { const r = room; karaoke.checkLinks(r, () => broadcast(r)); }
    return err;
  }));
  socket.on('player:karaokeSignUp', (d, cb) => {
    if (!room || !player) return;
    const err = karaoke.signUp(room, player, d || {});
    ack(cb, err ? { error: err } : { ok: true });
    if (!err) broadcast(room);
  });
  socket.on('player:karaokeCancel', ({ id } = {}) => {
    if (!room || !player) return;
    karaoke.cancel(room, player, String(id || ''));
    broadcast(room);
  });
  socket.on('host:startRaffle', host((d) => startRaffle(room, d)));
  socket.on('host:spin', host(() => (room.game?.type === 'raffle' ? spinWheel(room) : 'No raffle or wheel running')));
  // The winner isn't here: forget that win, keep the prize, and spin again.
  socket.on('host:redraw', host(() => {
    const g = room.game;
    if (g?.type !== 'raffle' || g.phase !== 'won') return 'Nothing to redraw';
    const w = g.winners.pop();
    if (w.id) { g.skipped.add(w.id); const p = room.players.get(w.id); if (p) p.score = Math.max(0, p.score - 1); }
    g.phase = 'ready';
    return spinWheel(room);
  }));
  socket.on('host:logo', host(({ data } = {}) => {
    if (!data) { room.logo = null; return null; }
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(data));
    if (!m) return 'Logo must be a PNG, JPG, WebP or GIF image.';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 400e3) return 'That logo is too big. Try a smaller image.';
    room.logo = { buf, type: m[1], v: (room.logo?.v || 0) + 1 };
    return null;
  }));
  socket.on('host:startChallenge', host((d) => startChallenge(room, d)));
  socket.on('host:draw', host(({ n }) => {
    const g = room.game;
    if (g?.type !== 'challenge') return 'No volunteer draw running';
    if (g.phase === 'drawing') return 'Drawing already';
    return drawVolunteers(room, Number(n) || g.count);
  }));
  socket.on('host:challengeVote', host(() => {
    const g = room.game;
    if (g?.type !== 'challenge') return 'No volunteer draw running';
    const names = g.picked.map((id) => room.players.get(id)?.name).filter(Boolean);
    if (names.length < 2) return 'Pick at least 2 people to vote on a winner.';
    return startPoll(room, { question: `Who won: ${g.title}?`, options: names });
  }));
  socket.on('host:resetPicked', host(() => { room.pickedTonight.clear(); }));
  socket.on('host:startCouple', host((d) => startCouple(room, d)));
  socket.on('host:coupleNext', host(() => {
    if (room.game?.type !== 'couple') return 'No Mr & Mrs game running';
    coupleAdvance(room);
  }));
  // The DJ can enter the couple's answers by hand (e.g. when they hold up shoes).
  socket.on('host:coupleAnswer', host(({ who, choice }) => setCoupleAnswer(room, who, choice)));

  socket.on('couple:join', ({ code, who, key } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.coupleKey !== key || !['a', 'b'].includes(who)) return ack(cb, { error: 'This couple link is not valid for this room.' });
    room = r;
    coupleWho = who;
    r.coupleSockets[who].add(socket.id);
    ack(cb, { ok: true });
    broadcast(r);
  });
  socket.on('couple:answer', ({ choice } = {}) => {
    if (!room || !coupleWho) return;
    if (!setCoupleAnswer(room, coupleWho, choice)) broadcast(room);
  });

  socket.on('player:vote', ({ choice } = {}) => {
    const g = room?.game;
    if (player && g?.type === 'couple') {
      const c = Number(choice);
      if (g.phase !== 'answering' || !(c === 0 || c === 1)) return;
      g.votes.set(player.id, c);
      return broadcast(room);
    }
    if (!player || g?.type !== 'poll' || !g.open) return;
    const c = Number(choice);
    if (!(c >= 0 && c < g.options.length)) return;
    g.votes.set(player.id, c); // players can change their mind while the vote is open
    broadcast(room);
  });

  socket.on('player:raffleEnter', ({ in: wantIn } = {}) => {
    const g = room?.game;
    if (!player || g?.type !== 'raffle' || g.entry !== 'optin') return;
    if (wantIn) g.entrants.add(player.id);
    else if (g.phase !== 'spinning') g.entrants.delete(player.id);
    broadcast(room);
  });

  socket.on('player:volunteer', ({ in: wantIn } = {}) => {
    const g = room?.game;
    if (!player || g?.type !== 'challenge' || g.phase !== 'signup') return;
    if (wantIn) g.volunteers.add(player.id);
    else g.volunteers.delete(player.id);
    broadcast(room);
  });

  socket.on('player:claim', (_d, cb) => {
    if (!room || !player) return;
    const g = room.game;
    if (g?.type !== 'bingo') return;
    if (g.winners.some((w) => w.id === player.id)) return ack(cb, { ok: true, valid: true });
    if (Date.now() - (player.lastClaim || 0) < 3000) return ack(cb, { ok: true, valid: false });
    player.lastClaim = Date.now();
    const valid = checkClaim(room, player);
    if (valid) {
      g.winners.push({ id: player.id, name: player.name, at: Date.now(), afterCalls: g.called.length });
      player.score += 1;
    }
    g.claimFlash = { name: player.name, valid, at: Date.now() };
    ack(cb, { ok: true, valid });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    room.hostSockets.delete(socket.id);
    if (coupleWho) room.coupleSockets[coupleWho].delete(socket.id);
    if (player) player.sockets.delete(socket.id);
    broadcast(room);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Crowd QR Games running: http://localhost:${PORT}  (LAN: http://${lanIp()}:${PORT})`);
    if (process.env.KARAOKE_VERIFY === '1') require('./tools/karaoke-verify')().catch((e) => console.log('kres failed', e.message));
    if (process.env.YT_VERIFY === '1') require('./tools/yt-verify')().catch((e) => console.log('ytv failed', e.message));
    // Optional check that playlist import still works against the live services.
    for (const url of (process.env.PLAYLIST_SELFTEST || '').split(/\s+/).filter(Boolean)) {
      importPlaylist(url)
        .then((r) => console.log(`playlist selftest OK ${url}: "${r.name}" ${r.songs.length} songs, e.g. ${r.songs.slice(0, 3).join(' | ')}`))
        .catch((e) => console.log(`playlist selftest FAILED ${url}: ${e.message}`));
    }
  });
}

module.exports = { server, rooms };
