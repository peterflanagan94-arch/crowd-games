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

  // Emoji guess: options come from the same category, the note shows only on reveal.
  const puzzles = [{ e: '💜🌧️', a: 'Purple Rain', note: 'Prince', cat: '📼 80s Songs' }, { e: '🦁👑', a: 'The Lion King', cat: '🏰 Disney & Pixar' }];
  assert.ok((await call(host, 'host:startEmoji', { puzzles, seconds: 10 })).ok);
  assert.equal(room.game.variant, 'emoji');
  for (const q of room.game.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4, 'no duplicate options');
    assert.equal(q.options[q.answer], puzzles.find((p) => p.e === q.q).a);
  }
  await call(host, 'host:next');
  await wait(100);
  assert.equal(latest.get('Ana').game.note, null, 'note hidden during the question');
  const eq = room.game.questions[room.game.index];
  players[0].emit('player:answer', { choice: eq.answer });
  players[1].emit('player:answer', { choice: (eq.answer + 1) % 4 });
  await wait(150);
  assert.equal(room.game.phase, 'reveal');
  assert.equal(latest.get('Ana').game.note, eq.note);
  assert.ok(latest.get('Ana').game.lastPoints > 0 && latest.get('Ben').game.lastPoints === 0);
  assert.ok((await call(host, 'host:startEmoji', { puzzles: [] })).error, 'empty emoji round rejected');

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

  // Higher or lower with a deck of cards
  const R = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (const aces of ['both', 'high', 'low']) {
    r = await call(host, 'host:startHigherLower', { mode: 'cards', aces, rounds: 51 });
    assert.ok(r.ok, r.error);
    const qs = room.game.questions;
    assert.equal(qs.length, 51);
    const seen = new Set(qs.map((q) => q.hl.a.label).concat(qs.at(-1).hl.b.label));
    assert.equal(seen.size, 52, 'whole deck, no repeats');
    for (const q of qs) {
      const v = (c) => (c.r === 'A' ? (aces === 'high' ? 14 : 1) : R.indexOf(c.r) + 1);
      const { a, b } = q.hl;
      if (aces === 'both' && (a.card.r === 'A' || b.card.r === 'A')) assert.equal(q.outcome, 'any');
      else if (v(a.card) === v(b.card)) assert.equal(q.outcome, 'none');
      else assert.equal(q.answer, v(b.card) > v(a.card) ? 0 : 1);
    }
  }
  await call(host, 'host:next');
  await wait(100);
  assert.equal(latest.get('Ana').game.hl.b, null, 'next card hidden from phones');

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

  // Mr & Mrs
  assert.ok((await call(host, 'host:startCouple', { questions: ['Who cooks?', 'Who snores?'] })).ok);
  const rm = rooms.get(code);
  const coupleA = await mk();
  let coupleState = null;
  coupleA.on('state', (st) => (coupleState = st));
  assert.ok((await call(coupleA, 'couple:join', { code, who: 'a', key: 'wrong' })).error, 'bad couple key rejected');
  assert.ok((await call(coupleA, 'couple:join', { code, who: 'a', key: rm.coupleKey })).ok);
  await call(host, 'host:coupleNext'); // -> question 1
  coupleA.emit('couple:answer', { choice: 1 });
  await call(host, 'host:coupleAnswer', { who: 'b', choice: 1 }); // DJ enters partner B's shoe
  players[0].emit('player:vote', { choice: 1 }); // Ana matches
  players[1].emit('player:vote', { choice: 0 }); // Ben doesn't
  await wait(150);
  assert.equal(coupleState.game.myAnswer, 1);
  assert.equal(latest.get('Ana').game.answers, null, 'couple answers hidden before reveal');
  const anaBefore = [...rm.players.values()].find((p) => p.name === 'Ana').score;
  await call(host, 'host:coupleNext'); // reveal couple
  players[1].emit('player:vote', { choice: 1 }); // too late, ignored
  await wait(150);
  assert.deepEqual(latest.get('Ana').game.answers, { a: 1, b: 1 });
  assert.equal(latest.get('Ana').game.lastPoints, 100);
  assert.equal(latest.get('Ben').game.lastPoints, 0);
  assert.equal(latest.get('Ana').game.counts, null, 'crowd hidden until second reveal');
  assert.equal([...rm.players.values()].find((p) => p.name === 'Ana').score, anaBefore + 100);
  await call(host, 'host:coupleNext'); // reveal crowd
  await wait(100);
  assert.deepEqual(latest.get('Ana').game.counts, [1, 1]);
  await call(host, 'host:coupleNext'); // question 2: couple disagree
  await call(host, 'host:coupleAnswer', { who: 'a', choice: 0 });
  await call(host, 'host:coupleAnswer', { who: 'b', choice: 1 });
  players[0].emit('player:vote', { choice: 0 });
  await wait(100);
  await call(host, 'host:coupleNext');
  await wait(100);
  assert.equal(latest.get('Ana').game.lastPoints, 0, 'no points when the couple disagree');
  await call(host, 'host:coupleNext'); await call(host, 'host:coupleNext');
  assert.equal(rm.game.phase, 'final');
  assert.equal(rm.game.agreed, 1);
  coupleA.close();

  // Volunteer draw
  assert.ok((await call(host, 'host:startChallenge', { title: 'Hula hoop-off', count: 1 })).ok);
  assert.ok((await call(host, 'host:draw')).error, 'no volunteers yet');
  players[0].emit('player:volunteer', { in: true });
  players[1].emit('player:volunteer', { in: true });
  await wait(100);
  assert.equal(latest.get('Ana').game.volunteerCount, 2);
  assert.ok((await call(host, 'host:draw')).ok);
  await wait(100);
  assert.equal(rooms.get(code).game.phase, 'drawing');
  assert.equal(latest.get('Ana').game.picked, null, 'picks secret during drumroll');
  await wait(3600);
  const first = rooms.get(code).game.picked[0];
  const firstName = rooms.get(code).players.get(first).name;
  assert.equal(latest.get(firstName).game.pickedMe, true);
  assert.equal(latest.get(firstName === 'Ana' ? 'Ben' : 'Ana').game.pickedMe, false);
  // Next challenge: the person picked tonight is skipped while someone else is available.
  await call(host, 'host:startChallenge', { title: 'Karaoke', count: 1 });
  players[0].emit('player:volunteer', { in: true });
  players[1].emit('player:volunteer', { in: true });
  await wait(100);
  await call(host, 'host:draw');
  assert.notEqual(rooms.get(code).game.picked[0], first, 'gives everyone a turn');
  await wait(3600);
  assert.ok((await call(host, 'host:draw', { n: 1 })).ok, 'pick one more');
  await wait(3600);
  assert.equal(rooms.get(code).game.picked.length, 2);
  assert.ok((await call(host, 'host:draw', { n: 1 })).error, 'nobody left');
  assert.ok((await call(host, 'host:challengeVote')).ok);
  assert.equal(rooms.get(code).game.type, 'poll');

  // Quiz categories
  const pack = await (await fetch(`${url}/api/quiz-pack?cats=disney,music&n=8`)).json();
  assert.equal(pack.length, 8);
  assert.ok(pack.every((q) => /Disney|Music/.test(q.cat) && q.options[q.answer]), 'only chosen categories, valid answers');
  const mixed = await (await fetch(`${url}/api/quiz-pack?n=30`)).json();
  assert.ok(new Set(mixed.map((q) => q.cat)).size >= 8, 'mixed quiz spans categories');
  assert.ok((await call(host, 'host:startQuiz', { questions: pack, seconds: 10 })).ok);
  await call(host, 'host:next');
  await wait(100);
  assert.ok(latest.get('Ana').game.cat, 'category shown on phones');

  // Song requests: dedupe merges into an upvote, ranking by votes, per-guest limit, DJ statuses.
  const rq = () => latest.get('Ana').requests;
  assert.ok((await call(players[0], 'player:request', { title: 'Mr Brightside', artist: 'The Killers' })).ok);
  const dup = await call(players[1], 'player:request', { title: 'mr. brightside', artist: 'Killers' });
  assert.ok(dup.ok && dup.merged, 'duplicate request becomes a vote');
  assert.ok((await call(players[1], 'player:request', { title: 'Dancing Queen' })).ok);
  assert.ok((await call(players[1], 'player:request', { title: 'Another One' })).error, 'cooldown between requests');
  await wait(100);
  assert.deepEqual(rq().queue.map((r) => [r.title, r.votes]), [['Mr Brightside', 2], ['Dancing Queen', 1]]);
  const dq = rq().queue[1];
  players[0].emit('player:requestVote', { id: dq.id, on: true });
  await wait(100);
  assert.equal(rq().queue[1].voted, true);
  await call(host, 'host:requestSettings', { limit: 1 });
  rooms.get(code).players.get([...rooms.get(code).players.keys()][0]).lastRequest = 0;
  assert.match((await call(players[0], 'player:request', { title: 'Song 2' })).error, /waiting/, 'per-guest limit');
  const mb = rq().queue[0];
  assert.ok((await call(host, 'host:requestStatus', { id: mb.id, status: 'playing' })).ok);
  await wait(100);
  assert.equal(rq().playing.title, 'Mr Brightside');
  assert.equal(latest.get('Ben').requests.myPlayingId, mb.id, 'voter gets told it is playing');
  await call(host, 'host:requestStatus', { id: dq.id, status: 'playing' });
  assert.equal(rooms.get(code).requests.list.find((r) => r.id === mb.id).status, 'played', 'previous song marked played');
  assert.match((await call(players[1], 'player:request', { title: 'Mr Brightside' })).error, /played/);
  await call(host, 'host:requestSettings', { open: false });
  assert.ok((await call(players[1], 'player:request', { title: 'Wonderwall' })).error, 'closed');
  assert.ok((await call(host, 'host:showRequests')).ok);
  await wait(100);
  assert.equal(latest.get('Ana').game.type, 'requests');

  console.log('All smoke tests passed');
  [host, ...players].forEach((s) => s.close());
  server.close(); process.exit(0);
});
