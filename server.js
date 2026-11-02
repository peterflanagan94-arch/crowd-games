// Crowd Games: DJ host screen + phone players, synced over Socket.IO.
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { SAMPLE_QUIZ, SAMPLE_HL, WEDDING } = require('./quiz-sample');

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

app.get('/api/qr', async (req, res) => {
  const data = String(req.query.data || '').slice(0, 500);
  if (!/^https?:\/\//.test(data)) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(data, { type: 'svg', margin: 1 }));
});

app.get('/api/sample-quiz', (_req, res) => res.json(SAMPLE_QUIZ));
app.get('/api/sample-hl', (_req, res) => res.json(SAMPLE_HL));
app.get('/api/wedding', (_req, res) => res.json(WEDDING));

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
    hostSockets: new Set(),
    players: new Map(), // playerId -> { id, name, score, sockets:Set, card?, answer? }
    game: null,
    // type: wedding | party | pub. Names personalise the wedding games and screens.
    event: { type: 'party', title: '', a: '', b: '' },
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
    }))
    .filter((q) => q.q && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
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
    if (a.choice === q.answer) {
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

// ---------- higher or lower ----------
// A chain of items with numbers. Each round shows the previous item's number
// and asks whether the next item's number is higher or lower.
function startHigherLower(room, { items, unit, seconds }) {
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

// ---------- bingo (numbers + music) ----------
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];

function startBingo(room, { mode, songs, pattern, hideTitles }) {
  let items;
  let size;
  if (mode === 'music') {
    const list = [...new Set((songs || []).map((s) => clean(s, 100)).filter(Boolean))];
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
    hideTitles: mode === 'music' && !!hideTitles, // crowd must recognise songs by ear
    called: [], // item ids, in order
    winners: [], // { id, name, at }
    claimFlash: null,
  };
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
function hostView(room) {
  const g = room.game;
  const base = { role: 'host', code: room.code, event: room.event, players: leaderboard(room) };
  if (!g) return { ...base, game: null };
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
        question: q ? { q: q.q, options: q.options } : null,
        hl: q?.hl ? hlView(q.hl, g.phase === 'reveal') : null,
        answer: g.phase === 'reveal' ? q.answer : null,
        answeredCount: g.answers.size, counts: g.phase === 'reveal' ? counts : null,
      },
    };
  }
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i.label]));
  return {
    ...base,
    game: {
      type: 'bingo', mode: g.mode, pattern: g.pattern, size: g.size, hideTitles: g.hideTitles,
      items: g.items, called: g.called, lastCalled: g.called.length ? byId[g.called.at(-1)] : null,
      winners: g.winners, claimFlash: g.claimFlash,
    },
  };
}

// The second item's number stays hidden until the reveal.
const hlView = (hl, reveal) => ({ a: hl.a, b: { label: hl.b.label, value: reveal ? hl.b.value : null }, unit: hl.unit });

function playerView(room, p) {
  const g = room.game;
  const rank = leaderboard(room).findIndex((x) => x.id === p.id) + 1;
  const base = { role: 'player', code: room.code, event: room.event, me: { id: p.id, name: p.name, score: p.score, rank }, playerCount: room.players.size };
  if (!g) return { ...base, game: null };
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
        hl: q?.hl ? hlView(q.hl, g.phase === 'reveal') : null,
        options: q ? q.options : null, question: q ? q.q : null,
        myChoice: mine ? mine.choice : null,
        answer: g.phase === 'reveal' ? q.answer : null,
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
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  let room = null;
  let player = null;
  let isHost = false;

  const ack = (cb, v) => typeof cb === 'function' && cb(v);
  const host = (fn) => (data, cb) => {
    if (!isHost || !room) return ack(cb, { error: 'Not host' });
    const err = fn(data || {});
    ack(cb, err ? { error: err } : { ok: true });
    broadcast(room);
  };

  socket.on('host:create', (_d, cb) => {
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
  socket.on('host:startHigherLower', host((d) => startHigherLower(room, d)));
  socket.on('host:startPoll', host((d) => startPoll(room, d)));
  socket.on('host:pollNext', host(() => {
    if (room.game?.type !== 'poll') return 'No vote running';
    return pollNext(room);
  }));
  socket.on('host:event', host((d) => {
    const type = ['wedding', 'party', 'pub'].includes(d.type) ? d.type : 'party';
    room.event = { type, title: clean(d.title, 60), a: clean(d.a, 30), b: clean(d.b, 30) };
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
      p = { id: pid, name: nm, score: 0, sockets: new Set() };
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

  socket.on('player:vote', ({ choice } = {}) => {
    const g = room?.game;
    if (!player || g?.type !== 'poll' || !g.open) return;
    const c = Number(choice);
    if (!(c >= 0 && c < g.options.length)) return;
    g.votes.set(player.id, c); // players can change their mind while the vote is open
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
    if (player) player.sockets.delete(socket.id);
    broadcast(room);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Crowd Games running: http://localhost:${PORT}  (LAN: http://${lanIp()}:${PORT})`);
  });
}

module.exports = { server, rooms };
