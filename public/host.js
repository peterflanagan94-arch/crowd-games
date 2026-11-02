/* Host screen: big-screen display + DJ control drawer. */
const socket = io();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHAPES = ['▲', '◆', '●', '■'];

let state = null;
let joinInfo = null;
let tab = 'quiz';
let tick = null;
let clockOffset = 0;

// ---------- connect / resume ----------
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
$('#loadHl').onclick = async () => {
  const d = await fetch('/api/sample-hl').then((r) => r.json());
  $('#hlText').value = d.items.map((i) => `${i.label} | ${i.value}`).join('\n');
  $('#hlUnit').value = d.unit;
};
$('#startHl').onclick = async () => {
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
  if (g.type === 'poll') return () => send('host:pollOpen', { open: !g.open });
  return null;
}

function renderControls() {
  const g = state?.game;
  const live = $('#liveBar');
  $('#tabs').classList.toggle('hidden', !!g);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('[data-pane]').forEach((p) => {
    const name = p.dataset.pane;
    const show = g ? name === 'liveMusic' && g.type === 'bingo' && g.mode === 'music' : name === tab;
    p.classList.toggle('hidden', !show);
  });
  if (!g) { live.innerHTML = ''; return; }
  let html = '';
  if (g.type === 'poll') {
    html += `<button class="primary" data-act="poll">${g.open ? 'Close voting' : 'Reopen voting'} <span class="muted">(space)</span></button><span class="muted">${g.total} votes</span>`;
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
  live.querySelector('[data-act=poll]')?.addEventListener('click', () => send('host:pollOpen', { open: !g.open }));
  live.querySelector('[data-act=call]')?.addEventListener('click', () => send('host:call'));
  live.querySelector('[data-act=pattern]')?.addEventListener('change', (e) => send('host:pattern', { pattern: e.target.value }));
  live.querySelector('[data-act=hide]')?.addEventListener('change', (e) => send('host:hideTitles', { on: e.target.checked }));
  live.querySelector('[data-act=end]').addEventListener('click', () => confirm('End this game and go back to the lobby?') && send('host:end'));
  if (g.type === 'bingo' && g.mode === 'music') renderSongPick();
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
        <h1 class="lobbytitle">Scan to play!</h1>
        <div class="muted lobbyurl">or go to <b>${esc(joinInfo?.url.replace(/^https?:\/\//, '').replace(/\/play.*/, '') || '')}</b> and enter</div>
        <div class="bigcode">${state.code}</div>
        <div class="names">${(state.players || []).map((p) => `<span>${esc(p.name)}</span>`).join('') || '<span class="muted">Waiting for players…</span>'}</div>
      </div>
    </div>`;
    return;
  }
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
    const cls = g.phase === 'reveal' ? (i === g.answer ? 'right' : 'dim') : '';
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
function hlCards(hl) {
  const unit = hl.unit ? `<div class="hlunit">${esc(hl.unit)}</div>` : '';
  const bVal = hl.b.value == null ? '<div class="hlval hidden-val">?</div>' : `<div class="hlval pop">${fmtNum(hl.b.value)}</div>`;
  return `<div class="hl">
    <div class="hlcard"><div class="hllabel">${esc(hl.a.label)}</div><div class="hlval">${fmtNum(hl.a.value)}</div>${unit}</div>
    <div class="hlvs">vs</div>
    <div class="hlcard b"><div class="hllabel">${esc(hl.b.label)}</div>${bVal}${unit}</div>
  </div>`;
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
    <div class="qhead">${g.open ? 'Vote now on your phone!' : 'Voting closed'} · ${g.total} votes</div>
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
  renderSide();
  renderStage();
  renderControls();
}
