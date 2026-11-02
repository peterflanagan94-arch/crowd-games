// End-to-end smoke test over real sockets: quiz + number bingo + music bingo.
const assert = require('assert');
const { io } = require('socket.io-client');
const { server, rooms } = require('../server');

const call = (s, ev, d = {}) => new Promise((r) => s.emit(ev, d, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const mk = () => new Promise((r) => { const s = io(url, { forceNew: true }); s.on('connect', () => r(s)); });
  const host = await mk();
  const latest = new Map();
  const { code } = await call(host, 'host:create');
  assert.match(code, /^[A-Z]{4}$/);

  const players = [];
  for (const name of ['Ana', 'Ben']) {
    const s = await mk();
    s.on('state', (st) => latest.set(name, st));
    const r = await call(s, 'player:join', { code, name });
    assert.ok(r.ok, r.error);
    players.push(s);
  }
  assert.ok((await call(players[0], 'player:join', { code, name: 'ana', playerId: 'x' })).error, 'dup name rejected');

  // Quiz
  const qs = [{ q: '1+1?', options: ['1', '2'], answer: 1 }, { q: 'Sky?', options: ['Blue', 'Green'], answer: 0 }];
  assert.ok((await call(host, 'host:startQuiz', { questions: qs, seconds: 10 })).ok);
  await call(host, 'host:next');
  players[0].emit('player:answer', { choice: 1 });
  players[1].emit('player:answer', { choice: 0 });
  await wait(150);
  const room = rooms.get(code);
  assert.equal(room.game.phase, 'reveal', 'auto reveal when all answered');
  const ana = [...room.players.values()].find((p) => p.name === 'Ana');
  assert.ok(ana.score > 900, 'fast correct answer scores ~1000');
  for (const want of ['question', 'reveal', 'final']) { await call(host, 'host:next'); assert.equal(room.game.phase, want); }
  await wait(100);
  assert.equal(latest.get('Ana').game.phase, 'final');

  // Number bingo
  await call(host, 'host:startBingo', { mode: 'numbers', pattern: 'line' });
  const card = ana.card;
  assert.equal(card.length, 25); assert.equal(card[12], 'FREE');
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    const v = card[r * 5 + c]; if (v !== 'FREE') assert.ok(+v >= c * 15 + 1 && +v <= c * 15 + 15, 'column ranges');
  }
  let r = await call(players[0], 'player:claim');
  assert.equal(r.valid, false, 'early claim rejected');
  for (const id of [card[0], card[1], card[2], card[3], card[4]]) await call(host, 'host:call', { id });
  await wait(3100); // claim cooldown
  r = await call(players[0], 'player:claim');
  assert.equal(r.valid, true, 'top row wins');
  assert.deepEqual(room.game.winners.map((w) => w.name), ['Ana']);
  for (let i = 0; i < 80; i++) await call(host, 'host:call');
  assert.equal(room.game.called.length, 75);

  // Music bingo
  const songs = Array.from({ length: 20 }, (_, i) => `Artist ${i} - Song ${i}`);
  assert.ok((await call(host, 'host:startBingo', { mode: 'music', songs: songs.slice(0, 10) })).error, 'needs 16 songs');
  assert.ok((await call(host, 'host:startBingo', { mode: 'music', songs, hideTitles: true })).ok);
  await wait(100);
  const pv = latest.get('Ben').game;
  assert.equal(pv.size, 4); assert.equal(pv.card.length, 16);
  await call(host, 'host:call', { id: '3' });
  await wait(100);
  assert.equal(latest.get('Ben').game.lastCalled, null, 'hidden titles not leaked to phones');

  // Higher or lower
  assert.ok((await call(host, 'host:startHigherLower', { items: [{ label: 'A', value: 5 }, { label: 'B', value: 5 }] })).error, 'equal neighbours rejected');
  r = await call(host, 'host:startHigherLower', { items: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }, { label: 'C', value: 3 }], unit: 'pts' });
  assert.ok(r.ok, r.error);
  assert.deepEqual(room.game.questions.map((q) => q.answer), [0, 1], 'B higher, C lower');
  await call(host, 'host:next');
  await wait(100);
  assert.equal(latest.get('Ana').game.hl.b.value, null, 'hidden value not leaked');
  players[0].emit('player:answer', { choice: 0 });
  players[1].emit('player:answer', { choice: 1 });
  await wait(150);
  assert.equal(room.game.phase, 'reveal');
  assert.equal(latest.get('Ana').game.hl.b.value, 20);
  assert.ok(latest.get('Ana').game.lastPoints > 0 && latest.get('Ben').game.lastPoints === 0);

  // Crowd vote
  assert.ok((await call(host, 'host:startPoll', { question: 'Next?', options: ['Only one'] })).error);
  assert.ok((await call(host, 'host:startPoll', { question: 'Next?', options: ['House', 'Rock', 'Pop'] })).ok);
  players[0].emit('player:vote', { choice: 1 });
  players[1].emit('player:vote', { choice: 1 });
  players[1].emit('player:vote', { choice: 2 }); // changed mind
  await wait(150);
  assert.deepEqual(rooms.get(code).game && [...rooms.get(code).game.votes.values()].sort(), [1, 2]);
  assert.equal(latest.get('Ana').game.counts, null, 'results hidden on phones while open');
  await call(host, 'host:pollOpen', { open: false });
  players[0].emit('player:vote', { choice: 0 }); // ignored once closed
  await wait(150);
  assert.deepEqual(latest.get('Ana').game.counts, [0, 1, 1]);

  // Wedding event + "who's most likely to" series
  await call(host, 'host:event', { type: 'wedding', a: 'Sarah', b: 'Tom' });
  await wait(100);
  assert.equal(latest.get('Ana').event.type, 'wedding');
  await call(host, 'host:startPoll', { series: ['Q1', 'Q2'], options: ['Sarah', 'Tom'] });
  players[0].emit('player:vote', { choice: 0 });
  await wait(100);
  assert.ok((await call(host, 'host:pollNext')).ok);
  await wait(100);
  assert.equal(latest.get('Ana').game.question, 'Q2');
  assert.equal(latest.get('Ana').game.myVote, null, 'votes reset for next question');
  assert.ok((await call(host, 'host:pollNext')).error, 'end of series');

  console.log('All smoke tests passed');
  [host, ...players].forEach((s) => s.close());
  server.close(); process.exit(0);
});
