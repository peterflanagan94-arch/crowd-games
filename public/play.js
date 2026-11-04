/* Phone player view. */
const socket = io();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHAPES = ['▲', '◆', '●', '■'];
const params = new URLSearchParams(location.search);
const code = (params.get('room') || '').toUpperCase().trim();

const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const sessKey = `cg-player-${code}`;
let session = store.get(sessKey); // { playerId, name }
let state = null;
let tick = null;
let clockOffset = 0;
let cardKey = '';
let marks = new Set();

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function showJoin(err = '') {
  $('#main').innerHTML = `<form id="joinForm" style="display:grid;gap:12px">
    <div class="center"><div class="muted">Room</div><div class="huge">${esc(code || '?')}</div></div>
    ${code ? '' : '<input name="room" placeholder="Room code" maxlength="4" required />'}
    <input name="name" placeholder="Your nickname" maxlength="20" autocomplete="nickname" required autofocus />
    <button class="primary big">Let's go!</button>
    <div class="err center">${esc(err)}</div>
  </form>`;
  $('#joinForm').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!code) { location.search = `?room=${encodeURIComponent(String(f.get('room')).toUpperCase())}`; return; }
    join(String(f.get('name')));
  };
}

function join(name) {
  socket.emit('player:join', { code, name, playerId: session?.playerId }, (r) => {
    if (r.error) {
      if (session) { session = null; store.set(sessKey, null); }
      return showJoin(r.error);
    }
    session = { playerId: r.playerId, name: r.name };
    store.set(sessKey, session);
  });
}

// The couple's private phones in Mr & Mrs join with ?couple=a|b&key=…
const coupleWho = params.get('couple');
const coupleKey = params.get('key');
socket.on('connect', () => {
  if (coupleWho) {
    return socket.emit('couple:join', { code, who: coupleWho, key: coupleKey }, (r) => {
      if (r.error) $('#main').innerHTML = `<div class="center big">${esc(r.error)}</div>`;
    });
  }
  session && code ? join(session.name) : showJoin();
});
socket.on('kicked', () => {
  store.set(sessKey, null); session = null; state = null;
  $('#main').innerHTML = '<div class="center big">You were removed from the game.</div>';
});
socket.on('disconnect', () => toast('Reconnecting…'));
socket.on('state', (s) => {
  state = s;
  if (s.game?.now) clockOffset = s.game.now - Date.now();
  render();
});

function render() {
  clearInterval(tick);
  if (!state) return;
  const me = state.me;
  const ev = state.event || {};
  document.body.dataset.theme = ev.type === 'wedding' ? 'elegant' : 'club';
  const title = ev.title || (ev.type === 'wedding' && ev.a && ev.b ? `${ev.a} & ${ev.b}` : '');
  $('.ptop .brand').innerHTML = title ? `<span class="evtitle">${esc(title)}</span>` : 'Crowd <span>QR</span> Games';
  if (state.role === 'couple') return renderCouplePhone(state);
  $('#who').innerHTML = `<b>${esc(me.name)}</b> · ${['quiz', 'couple'].includes(state.game?.type) ? `${me.score} pts` : `room ${state.code}`}`;
  const g = state.game;
  if (!g) {
    $('#main').innerHTML = `<div class="center"><div class="huge">${ev.type === 'wedding' ? '💍' : '🎧'}</div><div class="big">You're in!</div>
      <p class="muted">Watch the big screen. The DJ will start the next game soon.</p>
      <p class="muted">${state.playerCount} players in the room</p></div>`;
    return;
  }
  if (g.type === 'challenge') return renderChallenge(g);
  if (g.type === 'couple') return renderCoupleGuest(g, me);
  if (g.type === 'poll') return renderPoll(g);
  if (g.type === 'quiz') return renderQuiz(g, me);
  return renderBingo(g);
}

let lastBuzz = '';
function renderChallenge(g) {
  const m = $('#main');
  if (g.phase === 'signup') {
    m.innerHTML = `<div class="center muted">🎲 Volunteers wanted</div>
      <div class="center big">${esc(g.title)}</div>
      <button class="${g.imIn ? 'secondary' : 'primary'} claim" id="imin" style="min-height:140px;font-size:30px">${g.imIn ? "✓ You're in!" : "🙋 I'm in!"}</button>
      <div class="center muted">${g.imIn ? 'Tap again to back out. ' : ''}${g.volunteerCount} ${g.volunteerCount === 1 ? 'volunteer' : 'volunteers'} so far</div>`;
    $('#imin').onclick = () => { navigator.vibrate?.(20); socket.emit('player:volunteer', { in: !g.imIn }); };
    return;
  }
  if (g.phase === 'drawing') {
    m.innerHTML = `<div class="center"><div class="huge">🥁</div><div class="big">Drawing names…</div><p class="muted">${g.imIn ? 'Fingers crossed!' : 'Watch the big screen!'}</p></div>`;
    return;
  }
  if (g.pickedMe) {
    const key = `${g.title}|${g.picked.join(',')}`;
    if (key !== lastBuzz) { lastBuzz = key; navigator.vibrate?.([200, 100, 200, 100, 400]); }
    m.innerHTML = `<div class="result good"><div class="huge">🎉</div><div class="big">You've been picked!</div><p>${esc(g.title)}<br><b>Head up to the DJ now!</b></p></div>`;
    return;
  }
  m.innerHTML = `<div class="center"><div class="big">${g.imIn ? 'Not this time!' : 'And the volunteers are…'}</div>
    <p class="big" style="color:var(--accent2)">${g.picked.map(esc).join(', ')}</p><p class="muted">Give them a cheer! 👏</p></div>`;
}

// One of the couple answering in secret.
function renderCouplePhone(st) {
  const g = st.game;
  const m = $('#main');
  $('#who').innerHTML = `<b>${esc(st.myName)}</b> · 💍 couple phone`;
  if (!g || g.phase === 'intro' || g.phase === 'final') {
    m.innerHTML = `<div class="center"><div class="huge">💍</div><div class="big">Hi ${esc(st.myName)}!</div>
      <p class="muted">Keep this screen to yourself. Each question will appear here, so answer honestly!</p></div>`;
    return;
  }
  if (g.phase !== 'answering') {
    m.innerHTML = `<div class="center"><div class="big">Answers revealed!</div><p class="muted">Look at the big screen. The next question will appear here.</p></div>`;
    return;
  }
  m.innerHTML = `<div class="center muted">Question ${g.index + 1} of ${g.total} · answer in secret</div>
    <div class="center big">${esc(g.question)}</div>
    <div class="pans" style="grid-template-columns:1fr">${g.options.map((o, i) => `<button class="c${i} ${g.myAnswer === i ? 'picked' : g.myAnswer != null ? 'faded' : ''}" data-i="${i}"><span class="big">${esc(o)}</span></button>`).join('')}</div>
    ${g.myAnswer != null ? '<div class="center muted">Locked in. You can change it until the DJ reveals.</div>' : ''}`;
  m.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => { navigator.vibrate?.(20); socket.emit('couple:answer', { choice: +b.dataset.i }); }));
}

// A guest in Mr & Mrs: guess what the couple said.
function renderCoupleGuest(g, me) {
  const m = $('#main');
  const [A, B] = g.options;
  if (g.phase === 'intro') {
    m.innerHTML = `<div class="center"><div class="huge">💍</div><div class="big">Mr &amp; Mrs</div><p class="muted">How well do you know ${esc(A)} &amp; ${esc(B)}? Guess what they'll answer. Match them to score!</p></div>`;
    return;
  }
  if (g.phase === 'final') {
    const medal = ['🥇', '🥈', '🥉'][me.rank - 1] || '💕';
    m.innerHTML = `<div class="center"><div class="huge">${medal}</div><div class="big">You finished #${me.rank}</div><p class="muted">${me.score} points</p>
      ${(g.top || []).map((p, i) => `<div>${i + 1}. ${esc(p.name)} (${p.score})</div>`).join('')}</div>`;
    return;
  }
  if (g.phase === 'answering') {
    m.innerHTML = `<div class="center muted">Question ${g.index + 1} of ${g.total} · what will the couple say?</div>
      <div class="center big">${esc(g.question)}</div>
      <div class="pans" style="grid-template-columns:1fr">${g.options.map((o, i) => `<button class="c${i} ${g.myVote === i ? 'picked' : g.myVote != null ? 'faded' : ''}" data-i="${i}"><span class="big">${esc(o)}</span></button>`).join('')}</div>
      ${g.myVote != null ? '<div class="center muted">Vote in! You can change it until the reveal.</div>' : ''}`;
    m.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => { navigator.vibrate?.(20); socket.emit('player:vote', { choice: +b.dataset.i }); }));
    return;
  }
  const { a, b } = g.answers;
  const said = (n, v) => `${esc(n)} said <b>${v == null ? 'nothing' : esc(g.options[v])}</b>`;
  const agree = a != null && a === b;
  let cls = 'meh', msg = 'You didn’t vote';
  if (g.myVote != null) [cls, msg] = !agree ? ['meh', 'They disagree! 😱'] : g.lastPoints ? ['good', `You got it! +${g.lastPoints}`] : ['bad', 'Not this time'];
  let crowd = '';
  if (g.counts) {
    const t = g.counts[0] + g.counts[1] || 1;
    crowd = `<div class="center muted">The guests said: ${esc(A)} ${Math.round((g.counts[0] / t) * 100)}% · ${esc(B)} ${Math.round((g.counts[1] / t) * 100)}%</div>`;
  }
  m.innerHTML = `<div class="center big">${esc(g.question)}</div>
    <div class="result ${cls}"><div class="big">${msg}</div><p>${said(A, a)}<br>${said(B, b)}</p></div>${crowd}
    <div class="center muted">You're #${me.rank} with ${me.score} points</div>`;
}

function renderPoll(g) {
  const m = $('#main');
  const total = g.counts ? g.counts.reduce((a, b) => a + b, 0) : 0;
  m.innerHTML = `<div class="center muted">${g.open ? 'Crowd vote · tap to vote, you can change your mind' : 'Voting closed'}</div>
    <div class="center big">${esc(g.question)}</div>
    <div style="display:grid;gap:10px">${g.options.map((o, i) => `<button class="c${i % 4} ${g.myVote === i ? 'picked' : ''} ${g.myVote != null && g.myVote !== i ? 'faded' : ''}" data-i="${i}" ${g.open ? '' : 'disabled'} style="padding:20px;font-size:20px;border-radius:16px;text-align:left">
      ${SHAPES[i % 4]} ${esc(o)}${g.counts ? ` <span style="float:right">${total ? Math.round((g.counts[i] / total) * 100) : 0}%</span>` : ''}</button>`).join('')}</div>
    ${g.myVote != null && g.open ? '<div class="center muted">Vote counted! Watch the big screen.</div>' : ''}`;
  m.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => {
    navigator.vibrate?.(20);
    socket.emit('player:vote', { choice: +b.dataset.i });
  }));
}

const HL_SHAPES = ['▲', '▼'];
// Playing card face (or back when c is null).
function cardHtml(c, size = '') {
  if (!c) return `<div class="pcard back ${size}"><div class="pback"></div></div>`;
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="pcard ${red ? 'red' : ''} ${size}"><span class="pc tl">${c.r}<br>${c.s}</span><span class="pcs">${c.s}</span><span class="pc br">${c.r}<br>${c.s}</span></div>`;
}
const ACE_NOTE = { both: 'Aces count high or low, whichever helps you', high: 'Aces are high', low: 'Aces are low' };

const fmtNum = (n) => (Math.abs(n) >= 1e4 ? n.toLocaleString() : String(n));

function renderQuiz(g, me) {
  const m = $('#main');
  const isHl = g.variant === 'hl';
  const isEmoji = g.variant === 'emoji';
  const shapes = isHl ? HL_SHAPES : SHAPES;
  const unit = isHl && g.hl?.unit ? ` (${esc(g.hl.unit)})` : '';
  if (g.phase === 'intro') {
    m.innerHTML = `<div class="center"><div class="huge">${isEmoji ? '😀' : '🧠'}</div><div class="big">${isHl ? 'Higher or lower is starting' : isEmoji ? 'Emoji guess is starting' : 'Quiz is starting'}</div><p class="muted">Answer fast for extra points.</p></div>`;
    return;
  }
  if (g.phase === 'final') {
    const medal = ['🥇', '🥈', '🥉'][me.rank - 1] || '🎉';
    m.innerHTML = `<div class="center"><div class="huge">${medal}</div><div class="big">You finished #${me.rank}</div><p class="muted">${me.score} points</p>
      ${(g.top || []).map((p, i) => `<div>${i + 1}. ${esc(p.name)} (${p.score})</div>`).join('')}</div>`;
    return;
  }
  if (g.phase === 'reveal') {
    let cls = 'meh', msg = "Time's up!";
    if (g.myChoice != null) [cls, msg] = g.lastPoints > 0 ? ['good', `Correct! +${g.lastPoints}`] : ['bad', 'Not this time'];
    let detail;
    if (isHl && g.hl.cards) {
      const note = { any: 'An Ace! Every guess scores.', none: 'A pair! Nobody scores this round.' }[g.hl.outcome] || `It was <b>${shapes[g.answer]} ${esc(g.options[g.answer])}</b>`;
      detail = `<div class="pcards">${cardHtml(g.hl.a.card, 'sm')}${cardHtml(g.hl.b.card, 'sm')}</div><p>${note}</p>`;
    } else {
      detail = `${isEmoji ? `<div class="pemoji">${esc(g.question)}</div>` : ''}<p>The answer was <b>${shapes[g.answer]} ${esc(g.options[g.answer])}</b>${g.note ? `<br><span class="muted">${esc(g.note)}</span>` : ''}${isHl ? `<br>${esc(g.hl.b.label)}: <b>${fmtNum(g.hl.b.value)}</b>${unit}` : ''}</p>`;
    }
    m.innerHTML = `<div class="result ${cls}"><div class="big">${msg}</div>${detail}</div>
      <div class="center muted">You're #${me.rank} with ${me.score} points</div>`;
    return;
  }
  // question
  const answered = g.myChoice != null;
  const qHtml = isHl && g.hl.cards
    ? `<div class="pcards">${cardHtml(g.hl.a.card, 'sm')}${cardHtml(null, 'sm')}</div>
       <div class="center" style="font-weight:800;font-size:20px">Is the next card higher or lower?</div>
       <div class="center muted" style="font-size:13px">${ACE_NOTE[g.hl.aces]}. A pair scores nothing.</div>`
    : isHl
    ? `<div class="center muted">${esc(g.hl.a.label)}: <b style="color:var(--text)">${fmtNum(g.hl.a.value)}</b>${unit}</div>
       <div class="center" style="font-weight:800;font-size:20px">Higher or lower?<br><span style="color:var(--accent2)">${esc(g.hl.b.label)}</span></div>`
    : `${g.cat ? `<div class="center"><span class="qcat">${esc(g.cat)}</span></div>` : ''}${isEmoji ? `<div class="pemoji">${esc(g.question)}</div>` : `<div class="center" style="font-weight:700;font-size:18px">${esc(g.question)}</div>`}`;
  m.innerHTML = `<div class="center muted">${isHl || isEmoji ? 'Round' : 'Question'} ${g.index + 1} of ${g.total}</div>
    ${qHtml}
    <div class="ptimer"><div id="bar"></div></div>
    <div class="pans" style="${isHl ? 'grid-template-columns:1fr' : ''}">${g.options.map((o, i) => `<button class="c${isHl ? 3 - i * 3 : i} ${answered ? (g.myChoice === i ? 'picked' : 'faded') : ''}" data-i="${i}" ${answered ? 'disabled' : ''}>
      <span class="shape">${shapes[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
    ${answered ? '<div class="center muted">Answer locked in! Waiting for everyone…</div>' : ''}`;
  m.querySelectorAll('.pans button').forEach((b) => (b.onclick = () => {
    navigator.vibrate?.(30);
    socket.emit('player:answer', { choice: +b.dataset.i });
  }));
  const total = g.seconds * 1000;
  const upd = () => {
    const left = Math.max(0, g.deadline - (Date.now() + clockOffset));
    const bar = $('#bar'); if (bar) bar.style.width = `${(left / total) * 100}%`;
  };
  upd();
  tick = setInterval(upd, 250);
}

function renderBingo(g) {
  const key = `cg-marks-${code}-${g.card.map((c) => c.id).join(',')}`;
  if (key !== cardKey) { cardKey = key; marks = new Set(store.get(key, [])); }
  const patternName = { line: 'one line', two: 'two lines', full: 'a full house' }[g.pattern];
  const heads = g.mode === 'numbers' ? `<div class="heads">${'BINGO'.split('').map((l) => `<div>${l}</div>`).join('')}</div>` : '';
  const cells = g.card.map((c, i) => {
    if (c.id === 'FREE') return `<div class="cell free">★<br>FREE</div>`;
    const label = g.mode === 'numbers' ? c.id : esc(c.label);
    return `<div class="cell ${marks.has(c.id) ? 'marked' : ''}" data-id="${esc(c.id)}">${label}</div>`;
  }).join('');
  let last;
  if (g.mode === 'music' && g.hideTitles) last = g.calledCount ? `<b>♪ Song ${g.calledCount} is playing</b>Listen and tap it if it's on your card` : 'Get ready for the first song';
  else last = g.lastCalled ? `Last called<b>${esc(g.lastCalled)}</b>` : 'Waiting for the first call…';
  $('#main').innerHTML = `
    <div class="lastcall">${last}</div>
    <div class="card ${g.mode}" style="grid-template-columns:repeat(${g.size},1fr)">${heads}${cells}</div>
    <div class="center muted">Playing for ${patternName}${g.winners.length ? ` · Winners: ${g.winners.map(esc).join(', ')}` : ''}</div>
    ${g.won ? '<div class="result good"><div class="big">🎉 You won!</div></div>' : '<button class="primary claim" id="claim">BINGO!</button>'}`;
  $('#main').querySelectorAll('.cell[data-id]').forEach((el) => (el.onclick = () => {
    const id = el.dataset.id;
    marks.has(id) ? marks.delete(id) : marks.add(id);
    el.classList.toggle('marked');
    store.set(cardKey, [...marks]);
    navigator.vibrate?.(15);
  }));
  const claim = $('#claim');
  if (claim) claim.onclick = () => {
    claim.disabled = true;
    socket.emit('player:claim', {}, (r) => {
      if (!r?.valid) {
        toast('Not yet! Your card doesn’t have a winning pattern from the calls so far.');
        setTimeout(() => (claim.disabled = false), 3000);
      }
    });
  };
}
