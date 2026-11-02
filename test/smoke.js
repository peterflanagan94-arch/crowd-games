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

  console.log('All smoke tests passed');
  [host, ...players].forEach((s) => s.close());
  server.close(); process.exit(0);
});
