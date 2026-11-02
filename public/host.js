/* Host screen: big-screen display + DJ control drawer. */
const socket = io();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHAPES = ['▲', '◆', '●', '■'];

let state = null;
let joinInfo = null;
let tab = 'quiz';
let weddingPack = null;
const getPack = async () => (weddingPack ||= await fetch('/api/wedding').then((r) => r.json()));
let tick = null;
let clockOffset = 0;

// ---------- connect / resume ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function saved() {
  try { return JSON.parse(localStorage.getItem('cg-host') || 'null'); } catch { return null; }
}
function save(v) { try { localStorage.setItem('cg-host', JSON.stringify(v)); } catch {} }

const qs = new URLSearchParams(location.search);
const isRemote = qs.get('remote') === '1';
if (isRemote) document.body.classList.add('remote');

socket.on('connect', () => {
  if (isRemote) {
    return socket.emit('host:resume', { code: qs.get('room'), hostKey: qs.get('key') }, (r) => {
      if (r.error) document.body.innerHTML = '<div class="landing"><h2>This remote link has expired.</h2></div>';
      else onRoom(r);
    });
  }
  const s = saved();
  const fresh = qs.has('new');
  if (s && !fresh) {
    socket.emit('host:resume', s, (r) => (r.error ? create() : onRoom(r)));
  } else create();
});
function create() { socket.emit('host:create', {}, onRoom); }
let remoteUrl = '';
async function onRoom({ code, hostKey }) {
  if (!isRemote) {
    save({ code, hostKey });
    if (location.search) history.replaceState(null, '', '/host');
  }
  joinInfo = await fetch(`/api/join-url/${code}`).then((r) => r.json());
  $('#sideQr').innerHTML = joinInfo.svg;
  $('#sideCode').textContent = code;
  $('#sideUrl').textContent = joinInfo.url.replace(/^https?:\/\//, '');
  remoteUrl = `${joinInfo.url.split('/play')[0]}/host?remote=1&room=${code}&key=${hostKey}`;

  render();
}

socket.on('state', (s) => {
  state = s;
  if (s.game?.now) clockOffset = s.game.now - Date.now();
  render();
});

function send(ev, data = {}) {
  $('#err').textContent = '';
  socket.emit(ev, data, (r) => { if (r?.error) $('#err').textContent = r.error; });
}

// ---------- controls ----------
$('#toggle').onclick = () => {
  const c = $('#controls');
  c.classList.toggle('collapsed');
  $('#toggle').textContent = c.classList.contains('collapsed') ? 'Show ▴' : 'Hide ▾';
};
$('#remoteBtn').onclick = () => {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div><h3>DJ phone remote</h3><div class="muted">Scan with your own phone to run the game from the decks. Keep it private: anyone with this code can control the game.</div>
    <div class="qr"><img src="/api/qr?data=${encodeURIComponent(remoteUrl)}" style="width:100%" alt="Remote QR"></div><button>Close</button></div>`;
  m.onclick = (e) => { if (e.target === m || e.target.tagName === 'BUTTON') m.remove(); };
  document.body.appendChild(m);
};
if (isRemote) $('#remoteBtn').remove();

$('#tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  tab = b.dataset.tab;
  render();
};

function parseQuiz(text) {
  return text.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) return null;
    const [q, ...opts] = lines;
    const answer = opts.findIndex((o) => o.startsWith('*'));
    return { q, options: opts.slice(0, 4).map((o) => o.replace(/^\*\s*/, '')), answer };
  }).filter((q) => q && q.answer >= 0 && q.answer < 4);
}
function quizToText(qs) {
  return qs.map((q) => [q.q, ...q.options.map((o, i) => (i === q.answer ? '*' : '') + o)].join('\n')).join('\n\n');
}

$('#loadSample').onclick = async () => {
  $('#quizText').value = quizToText(await fetch('/api/sample-quiz').then((r) => r.json()));
};
$('#startQuiz').onclick = async () => {
  if (!$('#quizText').value.trim()) await $('#loadSample').onclick();
  const questions = parseQuiz($('#quizText').value);
  if (!questions.length) return ($('#err').textContent = 'No valid questions found. Mark each correct answer with a *.');
  try { localStorage.setItem('cg-quiz', $('#quizText').value); } catch {}
  send('host:startQuiz', { questions, seconds: +$('#quizSecs').value });
};
// ---------- event + wedding packs ----------
const names = () => ({ A: state?.event.a || 'Partner 1', B: state?.event.b || 'Partner 2' });
const fill = (t) => t.replace(/\{(A|B)\}/g, (_, k) => names()[k]);
function readEvent() {
  return { type: $('#evType').value, title: $('#evTitle').value.trim(), a: $('#evA').value.trim(), b: $('#evB').value.trim() };
}
$('#evType').onchange = () => applyTheme(readEvent());
$('#saveEvent').onclick = () => {
  const ev = readEvent();
  store.set('cg-event', ev);
  send('host:event', ev);
  tab = 'quiz';
};
let eventFormFilled = false;
function eventTitle(ev) {
  if (ev.title) return ev.title;
  if (ev.type === 'wedding' && ev.a && ev.b) return `${ev.a} & ${ev.b}`;
  return '';
}
function applyTheme(ev) {
  document.body.dataset.theme = ev.type === 'wedding' ? 'elegant' : 'club';
  document.body.classList.toggle('is-wedding', ev.type === 'wedding');
}

// ---------- volunteer draw ----------
fetch('/api/challenges').then((r) => r.json()).then((list) => {
  $('#chPresets').innerHTML = list.map((c) => `<option value="${esc(c)}">`).join('');
  $('#chChips').innerHTML = '<span class="muted">Ideas:</span>' + list.slice(0, 8).map((c) => `<button data-ch="${esc(c)}">${esc(c.split(':')[0])}</button>`).join('');
  $('#chChips').querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { $('#chTitle').value = b.dataset.ch; }));
});
$('#startChallenge').onclick = () => send('host:startChallenge', { title: $('#chTitle').value, count: +$('#chCount').value, exclude: $('#chExclude').checked });
$('#chReset').onclick = () => confirm('Forget who has been picked tonight?') && send('host:resetPicked');
let drawAnim = null;

// ---------- Mr & Mrs ----------
$('#loadCouple').onclick = async () => { $('#coupleText').value = (await getPack()).mrAndMrs.join('\n'); };
$('#startCouple').onclick = async () => {
  if (!$('#coupleText').value.trim()) await $('#loadCouple').onclick();
  if (!state.event.a || !state.event.b) return ($('#err').textContent = "Add the couple's names in the Event tab first.");
  send('host:startCouple', { questions: $('#coupleText').value.split('\n').map((l) => l.trim()).filter(Boolean) });
};
function coupleLinks() {
  const base = joinInfo.url.split('/play')[0];
  const key = state.game?.coupleKey;
  return ['a', 'b'].map((who) => `${base}/play?room=${state.code}&couple=${who}&key=${key}`);
}
$('#couplePhones').onclick = () => {
  if (state.game?.type !== 'couple') return ($('#err').textContent = 'Start Mr & Mrs first, then hand the couple their codes.');
  showCouplePhones();
};
function showCouplePhones() {
  const { A, B } = names();
  const [la, lb] = coupleLinks();
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div style="max-width:620px"><h3>The couple's phones</h3>
    <div class="muted">Each partner scans their own code to answer in secret. Don't show these on the big screen.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div><b>${esc(A)}</b><div class="qr"><img src="/api/qr?data=${encodeURIComponent(la)}" style="width:100%" alt=""></div></div>
      <div><b>${esc(B)}</b><div class="qr"><img src="/api/qr?data=${encodeURIComponent(lb)}" style="width:100%" alt=""></div></div>
    </div><button>Close</button></div>`;
  m.onclick = (e) => { if (e.target === m || e.target.tagName === 'BUTTON') m.remove(); };
  document.body.appendChild(m);
}

$('#loadCoupleQuiz').onclick = async () => {
  const p = await getPack();
  $('#quizText').value = p.coupleQuiz.map((q) => [fill(q.q), ...q.options.map(fill)].join('\n')).join('\n\n');
  $('#err').textContent = '';
  alert('Template loaded. Edit the answers with the couple before the night. The * marks the correct answer, so move it to the right line.');
};
$('#loadWeddingTrivia').onclick = async () => { $('#quizText').value = quizToText((await getPack()).trivia); };
$('#loadFloorFillers').onclick = async () => { $('#songText').value = (await getPack()).floorFillers.join('\n'); };
$('#loadCoupleHl').onclick = async () => {
  $('#hlMode').value = 'list'; $('#hlMode').onchange();
  $('#hlText').value = (await getPack()).coupleHigherLower.map((i) => `${fill(i.label)} | ${i.value}`).join('\n');
  $('#hlUnit').value = '';
  alert('Template loaded. Replace each 0 with the real number before the night.');
};
$('#startMostLikely').onclick = async () => {
  const { A, B } = names();
  send('host:startPoll', { series: (await getPack()).mostLikely, options: [A, B] });
};

$('#loadHl').onclick = async () => {
  const d = await fetch('/api/sample-hl').then((r) => r.json());
  $('#hlText').value = d.items.map((i) => `${i.label} | ${i.value}`).join('\n');
  $('#hlUnit').value = d.unit;
};
$('#hlMode').onchange = () => {
  const cards = $('#hlMode').value === 'cards';
  $('#hlCardsOpts').classList.toggle('hidden', !cards);
  $('#hlListOpts').classList.toggle('hidden', cards);
};
$('#startHl').onclick = async () => {
  if ($('#hlMode').value === 'cards') {
    return send('host:startHigherLower', { mode: 'cards', aces: $('#hlAces').value, rounds: +$('#hlRounds').value, seconds: +$('#hlSecs').value });
  }
  if (!$('#hlText').value.trim()) await $('#loadHl').onclick();
  const items = $('#hlText').value.split('\n').map((l) => {
    const m = l.match(/^(.*)\|\s*(-?[\d.,]+)\s*$/);
    return m && { label: m[1].trim(), value: Number(m[2].replace(/,/g, '')) };
  }).filter(Boolean);
  if (items.length < 2) return ($('#err').textContent = 'Add at least 2 lines like "Label | 123".');
  try { localStorage.setItem('cg-hl', JSON.stringify({ t: $('#hlText').value, u: $('#hlUnit').value })); } catch {}
  send('host:startHigherLower', { items, unit: $('#hlUnit').value, seconds: +$('#hlSecs').value });
};
const PRESETS = {
  genre: ['What should I play next?', 'House\nHip hop\nRock anthems\nThrowback pop'],
  decade: ['Which decade next?', '80s\n90s\n2000s\nRight now'],
  tempo: ['Speed it up or slow it down?', 'Faster!\nKeep it here\nSlow it down'],
};
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
  const [q, o] = PRESETS[b.dataset.preset];
  $('#pollQ').value = q; $('#pollOpts').value = o;
}));
$('#startPoll').onclick = () => {
  const options = $('#pollOpts').value.split('\n').map((s) => s.trim()).filter(Boolean);
  send('host:startPoll', { question: $('#pollQ').value, options });
};

$('#startBingo').onclick = () => send('host:startBingo', { mode: 'numbers', pattern: $('#bingoPattern').value });
$('#startMusic').onclick = () => {
  const songs = $('#songText').value.split('\n').map((s) => s.trim()).filter(Boolean);
  try { localStorage.setItem('cg-songs', $('#songText').value); } catch {}
  send('host:startBingo', { mode: 'music', songs, pattern: $('#musicPattern').value, hideTitles: $('#hideTitles').checked });
};
try {
  $('#quizText').value = localStorage.getItem('cg-quiz') || '';
  $('#songText').value = localStorage.getItem('cg-songs') || '';
  const hl = JSON.parse(localStorage.getItem('cg-hl') || 'null');
  if (hl) { $('#hlText').value = hl.t; $('#hlUnit').value = hl.u; }
} catch {}

$('#songFilter').oninput = () => renderSongPick();
$('#songPick').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.classList.contains('on')) {
    if (confirm(`Un-mark "${b.textContent}" as played?`)) send('host:uncall', { id: b.dataset.id });
  } else send('host:call', { id: b.dataset.id });
};

$('#plist').onclick = (e) => {
  const b = e.target.closest('.kick');
  if (b && confirm(`Remove ${b.dataset.name} from the game?`)) send('host:kick', { id: b.dataset.id });
};

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.code === 'Space' || e.code === 'ArrowRight') {
    e.preventDefault();
    primaryAction()?.();
  }
  if (e.key === 'f') document.documentElement.requestFullscreen?.();
  if (e.key === 'c') $('#toggle').click();
});

function primaryAction() {
  const g = state?.game;
  if (!g) return null;
  if (g.type === 'quiz' && g.phase !== 'final') return () => send('host:next');
  if (g.type === 'bingo' && g.mode === 'numbers') return () => send('host:call');
  if (g.type === 'couple' && g.phase !== 'final') return () => send('host:coupleNext');
  if (g.type === 'challenge' && g.phase === 'signup') return () => send('host:draw');
  if (g.type === 'poll') return () => (g.open || g.index + 1 >= g.of ? send('host:pollOpen', { open: !g.open }) : send('host:pollNext'));
  return null;
}

function renderControls() {
  const g = state?.game;
  const live = $('#liveBar');
  $('#tabs').classList.toggle('hidden', !!g);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('[data-pane]').forEach((p) => {
    const name = p.dataset.pane;
    const show = g
      ? (name === 'liveMusic' && g.type === 'bingo' && g.mode === 'music') || (name === 'liveCouple' && g.type === 'couple' && g.phase === 'answering')
      : name === tab;
    p.classList.toggle('hidden', !show);
  });
  if (!g) { live.innerHTML = ''; return; }
  let html = '';
  if (g.type === 'challenge') {
    if (g.phase === 'signup') html += `<button class="primary" data-act="draw">🥁 Draw ${g.count} <span class="muted">(space)</span></button>`;
    if (g.phase === 'picked') {
      html += `<button data-act="drawOne">Pick one more</button>`;
      if (g.picked.length >= 2) html += `<button class="secondary" data-act="chVote">🗳️ Crowd votes for the winner</button>`;
    }
    html += `<span class="muted">${g.volunteers.length} volunteers</span>`;
  } else if (g.type === 'couple') {
    const label = { intro: 'First question', answering: "Reveal the couple's answers", couple: "Reveal the crowd's votes", crowd: g.index + 1 >= g.total ? 'Final scores' : 'Next question' }[g.phase];
    if (label) html += `<button class="primary" data-act="coupleNext">${label} <span class="muted">(space)</span></button>`;
    html += `<button data-act="couplePhones">📱 Couple's phones</button><span class="muted">${g.index >= 0 ? `Question ${g.index + 1} of ${g.total} · ` : ''}${g.votes} votes</span>`;
  } else if (g.type === 'poll') {
    html += `<button class="primary" data-act="poll">${g.open ? 'Close voting' : 'Reopen voting'} <span class="muted">(space)</span></button>`;
    if (g.of > 1) html += `<button class="secondary" data-act="pollNext" ${g.index + 1 >= g.of ? 'disabled' : ''}>Next question (${g.index + 1}/${g.of})</button>`;
    html += `<span class="muted">${g.total} votes</span>`;
  } else if (g.type === 'quiz') {
    const label = { intro: g.variant === 'hl' ? 'Start first round' : 'Start first question', question: 'Reveal answer', reveal: g.index + 1 >= g.total ? 'Final results' : g.variant === 'hl' ? 'Next round' : 'Next question' }[g.phase];
    if (label) html += `<button class="primary" data-act="next">${label} <span class="muted">(space)</span></button>`;
    html += `<span class="muted">${g.variant === 'hl' ? 'Round' : 'Question'} ${Math.max(0, g.index + 1)} of ${g.total}</span>`;
  } else {
    if (g.mode === 'numbers') html += `<button class="primary" data-act="call">Call next number <span class="muted">(space)</span></button>`;
    html += `<select data-act="pattern">${['line', 'two', 'full'].map((p) => `<option value="${p}" ${p === g.pattern ? 'selected' : ''}>${{ line: 'One line', two: 'Two lines', full: 'Full house' }[p]}</option>`).join('')}</select>`;
    if (g.mode === 'music') html += `<label><input type="checkbox" data-act="hide" style="width:auto" ${g.hideTitles ? 'checked' : ''}/> Hide titles</label>`;
    html += `<span class="muted">${g.called.length} called</span>`;
  }
  html += `<button data-act="end">End game</button>`;
  live.innerHTML = html;
  live.querySelector('[data-act=next]')?.addEventListener('click', () => send('host:next'));
  live.querySelector('[data-act=draw]')?.addEventListener('click', () => send('host:draw'));
  live.querySelector('[data-act=drawOne]')?.addEventListener('click', () => send('host:draw', { n: 1 }));
  live.querySelector('[data-act=chVote]')?.addEventListener('click', () => send('host:challengeVote'));
  live.querySelector('[data-act=coupleNext]')?.addEventListener('click', () => send('host:coupleNext'));
  live.querySelector('[data-act=couplePhones]')?.addEventListener('click', showCouplePhones);
  live.querySelector('[data-act=pollNext]')?.addEventListener('click', () => send('host:pollNext'));
  live.querySelector('[data-act=poll]')?.addEventListener('click', () => send('host:pollOpen', { open: !g.open }));
  live.querySelector('[data-act=call]')?.addEventListener('click', () => send('host:call'));
  live.querySelector('[data-act=pattern]')?.addEventListener('change', (e) => send('host:pattern', { pattern: e.target.value }));
  live.querySelector('[data-act=hide]')?.addEventListener('change', (e) => send('host:hideTitles', { on: e.target.checked }));
  live.querySelector('[data-act=end]').addEventListener('click', () => confirm('End this game and go back to the lobby?') && send('host:end'));
  if (g.type === 'bingo' && g.mode === 'music') renderSongPick();
  if (g.type === 'couple') renderCoupleEntry(g);
}

// DJ entry of the couple's answers. Picks aren't shown here (the big screen may be visible), only ✓.
function renderCoupleEntry(g) {
  const [A, B] = g.options;
  const row = (who, name) => `<span class="muted">${esc(name)} says ${g.answered[who] ? '✓' : '…'}</span>
    <button data-who="${who}" data-c="0">${esc(A)}</button><button data-who="${who}" data-c="1">${esc(B)}</button>`;
  const el = $('#coupleEntry');
  el.innerHTML = `${row('a', A)}<span style="width:24px"></span>${row('b', B)}
    <span class="muted">${g.coupleOnline.a || g.coupleOnline.b ? '📱 Couple phones connected' : ''}</span>`;
  el.querySelectorAll('button').forEach((b) => (b.onclick = () => send('host:coupleAnswer', { who: b.dataset.who, choice: +b.dataset.c })));
}

function renderSongPick() {
  const g = state?.game;
  if (!g || g.mode !== 'music') return;
  const f = $('#songFilter').value.toLowerCase();
  const called = new Set(g.called);
  $('#songPick').innerHTML = g.items
    .filter((i) => !f || i.label.toLowerCase().includes(f))
    .map((i) => `<button data-id="${i.id}" class="${called.has(i.id) ? 'on' : ''}">${esc(i.label)}</button>`)
    .join('');
}

// ---------- stage ----------
function renderSide() {
  const ps = state?.players || [];
  $('#pcount').textContent = ps.length;
  $('#plist').innerHTML = ps
    .map((p) => `<div class="p ${p.online ? '' : 'off'}"><span>${esc(p.name)}</span><span>${state.game?.type === 'quiz' ? p.score : ''} <button class="kick" title="Remove" data-id="${esc(p.id)}" data-name="${esc(p.name)}">✕</button></span></div>`)
    .join('');
}

function leaderboardHtml(title, n = 8) {
  const rows = (state.players || []).slice(0, n)
    .map((p, i) => `<div class="row"><span>${i + 1}. ${esc(p.name)}</span><span>${p.score}</span></div>`).join('');
  return `<div class="board"><h2>${title}</h2><div class="lb">${rows || '<div class="muted center">No players yet</div>'}</div></div>`;
}

function renderStage() {
  const st = $('#stage');
  clearInterval(tick);
  const g = state?.game;
  if (!state) return;
  if (!g) {
    st.innerHTML = `<div class="lobby">
      <div class="bigqr">${joinInfo?.svg || ''}</div>
      <div>
        ${eventTitle(state.event) ? `<div class="lobbyevent">${state.event.type === 'wedding' ? 'Welcome to the wedding of' : 'Welcome to'}</div><div class="lobbyname">${esc(eventTitle(state.event))}</div>` : ''}
        <h1 class="lobbytitle">Scan to play!</h1>
        <div class="muted lobbyurl">or go to <b>${esc(joinInfo?.url.replace(/^https?:\/\//, '').replace(/\/play.*/, '') || '')}</b> and enter</div>
        <div class="bigcode">${state.code}</div>
        <div class="names">${(state.players || []).map((p) => `<span>${esc(p.name)}</span>`).join('') || '<span class="muted">Waiting for players…</span>'}</div>
      </div>
    </div>`;
    return;
  }
  if (g.type === 'challenge') return renderChallenge(st, g);
  if (g.type === 'couple') return renderCouple(st, g);
  if (g.type === 'poll') return renderPoll(st, g);
  if (g.type === 'quiz') return renderQuiz(st, g);
  return renderBingo(st, g);
}

function renderQuiz(st, g) {
  const isHl = g.variant === 'hl';
  if (g.phase === 'intro') {
    st.innerHTML = `<div class="center"><div class="qhead">Get your phones ready</div><div class="qtext">${isHl ? 'Higher or lower?' : 'Quiz time!'}</div><div class="qhead" style="margin-top:2vh">${g.total} ${isHl ? 'rounds' : 'questions'} · ${state.players.length} players</div></div>`;
    return;
  }
  if (g.phase === 'final') { st.innerHTML = leaderboardHtml('🏆 Final scores', 10); return; }
  const q = g.question;
  const opts = q.options.map((o, i) => {
    const outcome = g.hl?.outcome;
    const right = outcome === 'any' || (!outcome && i === g.answer);
    const cls = g.phase === 'reveal' ? (right ? 'right' : 'dim') : '';
    const count = g.counts ? `<span class="count">${g.counts[i]}</span>` : '';
    return `<div class="opt c${isHl ? 3 - i * 3 : i} ${cls}"><span class="shape">${isHl ? ['▲', '▼'][i] : SHAPES[i]}</span>${esc(o)}${count}</div>`;
  }).join('');
  const lb = g.phase === 'reveal' ? `<div style="margin-top:3vh;width:min(70vw,900px)">${leaderboardHtml('Leaderboard', 5)}</div>` : '';
  const top = isHl ? hlCards(g.hl) : `<div class="qtext">${esc(q.q)}</div>`;
  st.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
    <div class="qhead">${isHl ? 'Round' : 'Question'} ${g.index + 1} of ${g.total}</div>
    ${top}
    ${g.phase === 'question' ? `<div class="timer" id="timer"></div><div class="qhead">${g.answeredCount} answered</div>` : ''}
    <div class="opts">${opts}</div>${lb}</div>`;
  if (g.phase === 'question') {
    const upd = () => {
      const left = Math.max(0, Math.ceil((g.deadline - (Date.now() + clockOffset)) / 1000));
      const t = $('#timer'); if (t) t.textContent = left;
    };
    upd();
    tick = setInterval(upd, 250);
  }
}

const fmtNum = (n) => (Math.abs(n) >= 1e4 ? n.toLocaleString() : String(n));
// Playing card face (or back when c is null).
function cardHtml(c, size = '') {
  if (!c) return `<div class="pcard back ${size}"><div class="pback"></div></div>`;
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="pcard ${red ? 'red' : ''} ${size}"><span class="pc tl">${c.r}<br>${c.s}</span><span class="pcs">${c.s}</span><span class="pc br">${c.r}<br>${c.s}</span></div>`;
}
const ACE_NOTE = { both: 'Aces count high or low, whichever helps you', high: 'Aces are high', low: 'Aces are low' };

function hlCards(hl) {
  if (hl.cards) {
    const note = hl.outcome === 'any' ? '<div class="hlnote good">An Ace! Every guess scores.</div>'
      : hl.outcome === 'none' ? '<div class="hlnote bad">A pair! Nobody scores this round.</div>'
      : `<div class="hlnote">${ACE_NOTE[hl.aces]}</div>`;
    return `<div class="hl">${cardHtml(hl.a.card)}<div class="hlvs">vs</div>${cardHtml(hl.b?.card || null, hl.b ? 'flip' : '')}</div>${note}`;
  }
  const unit = hl.unit ? `<div class="hlunit">${esc(hl.unit)}</div>` : '';
  const bVal = hl.b.value == null ? '<div class="hlval hidden-val">?</div>' : `<div class="hlval pop">${fmtNum(hl.b.value)}</div>`;
  return `<div class="hl">
    <div class="hlcard"><div class="hllabel">${esc(hl.a.label)}</div><div class="hlval">${fmtNum(hl.a.value)}</div>${unit}</div>
    <div class="hlvs">vs</div>
    <div class="hlcard b"><div class="hllabel">${esc(hl.b.label)}</div>${bVal}${unit}</div>
  </div>`;
}

function renderChallenge(st, g) {
  clearInterval(drawAnim);
  if (g.phase === 'signup') {
    st.innerHTML = `<div class="chal">
      <div class="qhead">🎲 Volunteers wanted!</div>
      <div class="qtext">${esc(g.title)}</div>
      <div class="qhead" style="margin-top:2cqh">Fancy it? Tap <b>I'M IN</b> on your phone. We'll pick ${g.count} at random!</div>
      <div class="chcount">${g.volunteers.length}</div><div class="qhead">${g.volunteers.length === 1 ? 'volunteer' : 'volunteers'}</div>
      <div class="names chnames">${g.volunteers.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
    </div>`;
    return;
  }
  const already = g.picked.filter((n) => !g.justPicked.includes(n));
  if (g.phase === 'drawing') {
    st.innerHTML = `<div class="chal"><div class="qhead">${esc(g.title)}</div><div class="qtext">🥁 Drumroll…</div>
      <div class="slots">${g.justPicked.map((_, i) => `<div class="slot" id="slot${i}">?</div>`).join('')}</div></div>`;
    // Spin random volunteer names through each slot, slowing down, then land on the picks.
    const pool = g.volunteers.length ? g.volunteers : g.justPicked;
    const start = Date.now();
    const total = g.drawMs - 300;
    let last = 0;
    drawAnim = setInterval(() => {
      const t = Date.now() - start;
      const gap = 60 + (t / total) ** 2 * 400;
      if (t - last < gap) return;
      last = t;
      g.justPicked.forEach((name, i) => {
        const el = document.getElementById(`slot${i}`);
        if (!el) return;
        const landAt = total * (0.55 + (0.45 * (i + 1)) / g.justPicked.length);
        if (t >= landAt) { el.textContent = name; el.classList.add('landed'); }
        else el.textContent = pool[Math.floor(Math.random() * pool.length)];
      });
      if (t > total) clearInterval(drawAnim);
    }, 30);
    return;
  }
  st.innerHTML = `<div class="chal"><div class="qhead">${esc(g.title)}</div><div class="qtext">🎉 Come on up!</div>
    <div class="slots">${g.justPicked.map((n) => `<div class="slot landed pop">${esc(n)}</div>`).join('')}</div>
    ${already.length ? `<div class="qhead" style="margin-top:2cqh">Also up: ${already.map(esc).join(', ')}</div>` : ''}</div>`;
}

function renderCouple(st, g) {
  const [A, B] = g.options;
  if (g.phase === 'intro') {
    st.innerHTML = `<div class="center"><div class="qhead">How well do you know them?</div><div class="qtext">Mr &amp; Mrs</div>
      <div class="lobbyname" style="margin-top:2cqh">${esc(A)} &amp; ${esc(B)}</div>
      <div class="qhead">The couple answer in secret. You vote for who you think they'll pick.<br>Match the couple to score!</div></div>`;
    return;
  }
  if (g.phase === 'final') {
    st.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:2cqh">
      <div class="qhead">${esc(A)} &amp; ${esc(B)} agreed on ${g.agreed} of ${g.total} questions</div>
      ${leaderboardHtml('💍 Who knows the couple best?', 8)}</div>`;
    return;
  }
  const rev = g.answers;
  const agree = rev && rev.a != null && rev.a === rev.b;
  const card = (who, name) => {
    const ans = rev ? (rev[who] == null ? '<div class="cpick muted">No answer</div>' : `<div class="cpick pop">${esc(g.options[rev[who]])}</div>`)
      : `<div class="cpick ${g.answered[who] ? 'ok' : 'muted'}">${g.answered[who] ? '✓ Answered' : 'Thinking…'}</div>`;
    return `<div class="ccard"><div class="cname">${esc(name)} says</div>${ans}</div>`;
  };
  let banner = '';
  if (rev) banner = agree ? `<div class="hlnote good">They agree! 💕</div>` : `<div class="hlnote bad">They disagree! 😱</div>`;
  let crowd = '';
  if (g.counts) {
    const total = g.counts[0] + g.counts[1];
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    crowd = `<div class="poll" style="margin-top:2cqh"><div class="qhead">The guests said…</div><div class="pollrows">
      ${[A, B].map((n, i) => `<div class="pollrow ${agree && rev.a === i ? 'win' : ''}"><div class="pollbar c${i}" style="width:${pct(g.counts[i])}%"></div>
        <span class="polllabel">${esc(n)}</span><span class="pollpct">${pct(g.counts[i])}% · ${g.counts[i]}</span></div>`).join('')}
    </div>${agree ? `<div class="winners">${g.counts[rev.a]} guest${g.counts[rev.a] === 1 ? '' : 's'} got it right!</div>` : ''}</div>`;
  } else {
    crowd = `<div class="qhead" style="margin-top:2cqh">${g.phase === 'answering' ? 'Guests: vote on your phone!' : 'Voting closed'} · ${g.votes} votes</div>`;
  }
  st.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
    <div class="qhead">Question ${g.index + 1} of ${g.total}</div>
    <div class="qtext">${esc(g.question)}</div>
    <div class="ccards">${card('a', A)}${card('b', B)}</div>${banner}${crowd}</div>`;
}

function renderPoll(st, g) {
  const max = Math.max(1, ...g.counts);
  const win = g.open ? -1 : g.counts.indexOf(Math.max(...g.counts));
  const rows = g.options.map((o, i) => {
    const pct = g.total ? Math.round((g.counts[i] / g.total) * 100) : 0;
    return `<div class="pollrow ${i === win && g.total ? 'win' : ''}">
      <div class="pollbar c${i % 4}" style="width:${(g.counts[i] / max) * 100}%"></div>
      <span class="polllabel"><span class="shape">${SHAPES[i % 4]}</span> ${esc(o)}</span><span class="pollpct">${pct}% · ${g.counts[i]}</span>
    </div>`;
  }).join('');
  st.innerHTML = `<div class="poll">
    <div class="qhead">${g.of > 1 ? `${g.index + 1} of ${g.of} · ` : ''}${g.open ? 'Vote now on your phone!' : 'Voting closed'} · ${g.total} votes</div>
    <div class="qtext">${esc(g.question)}</div>
    <div class="pollrows">${rows}</div>
    ${!g.open && g.total ? `<div class="winners">The crowd has spoken: ${esc(g.options[win])}!</div>` : ''}
  </div>`;
}

function renderBingo(st, g) {
  const called = new Set(g.called);
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i.label]));
  const patternName = { line: 'One line', two: 'Two lines', full: 'Full house' }[g.pattern];
  let ball;
  if (!g.called.length) ball = `<div class="qtext">${g.mode === 'music' ? 'Music bingo' : 'Bingo'}</div><div class="qhead">Playing for: ${patternName}. Eyes down!</div>`;
  else if (g.mode === 'music') {
    ball = g.hideTitles
      ? `<div class="ball song" style="font-size:7vh">♪ Song ${g.called.length}</div><div class="qhead" style="margin-top:2vh">Know it? Find it on your card!</div>`
      : `<div class="ball song">${esc(g.lastCalled)}</div>`;
  } else {
    ball = `<div class="ball">${esc(g.lastCalled)}</div>`;
  }
  let history = '';
  if (g.mode === 'numbers') {
    history = `<div class="called-grid">${Array.from({ length: 75 }, (_, i) => `<div class="${called.has(String(i + 1)) ? 'on' : ''}">${i + 1}</div>`).join('')}</div>`;
  } else if (!g.hideTitles) {
    history = `<div class="called-list">${g.called.slice(0, -1).reverse().slice(0, 30).map((id) => `<span>${esc(byId[id])}</span>`).join('')}</div>`;
  }
  const winners = g.winners.length ? `<div class="winners">🏆 ${g.winners.map((w) => esc(w.name)).join(', ')}</div>` : '';
  let flash = '';
  if (g.claimFlash && Date.now() + clockOffset - g.claimFlash.at < 8000) {
    flash = g.claimFlash.valid
      ? `<div class="flash good">BINGO! ${esc(g.claimFlash.name)} wins!</div>`
      : `<div class="flash bad">${esc(g.claimFlash.name)}: false call!</div>`;
    setTimeout(render, 8100);
  }
  st.innerHTML = `${flash}<div style="display:flex;flex-direction:column;align-items:center">
    <div class="qhead">${patternName} · ${g.called.length} called</div>${ball}${history}${winners}</div>`;
}

function render() {
  if (state) {
    applyTheme(state.event);
    const t = eventTitle(state.event);
    $('#brand').innerHTML = t ? `<span class="evtitle">${esc(t)}</span>` : 'Crowd <span>QR</span> Games';
    if (!eventFormFilled) {
      eventFormFilled = true;
      const fresh = !state.event.title && !state.event.a && state.event.type === 'party';
      const ev = fresh && !isRemote ? store.get('cg-event') || state.event : state.event;
      // Carry the DJ's last event settings into a fresh room.
      if (fresh && !isRemote && store.get('cg-event')) send('host:event', ev);
      $('#evType').value = ev.type; $('#evTitle').value = ev.title; $('#evA').value = ev.a; $('#evB').value = ev.b;
      applyTheme(ev);
    }
  }
  if (state) $('#chTonight').textContent = state.pickedTonight ? `(${state.pickedTonight} picked so far tonight)` : '';
  renderSide();
  renderStage();
  renderControls();
}
