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
$('#startBingo').onclick = () => send('host:startBingo', { mode: 'numbers', pattern: $('#bingoPattern').value });
$('#startMusic').onclick = () => {
  const songs = $('#songText').value.split('\n').map((s) => s.trim()).filter(Boolean);
  try { localStorage.setItem('cg-songs', $('#songText').value); } catch {}
  send('host:startBingo', { mode: 'music', songs, pattern: $('#musicPattern').value, hideTitles: $('#hideTitles').checked });
};
try {
  $('#quizText').value = localStorage.getItem('cg-quiz') || '';
  $('#songText').value = localStorage.getItem('cg-songs') || '';
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
  if (g.type === 'quiz') {
    const label = { intro: 'Start first question', question: 'Reveal answer', reveal: g.index + 1 >= g.total ? 'Final results' : 'Next question' }[g.phase];
    if (label) html += `<button class="primary" data-act="next">${label} <span class="muted">(space)</span></button>`;
    html += `<span class="muted">Question ${Math.max(0, g.index + 1)} of ${g.total}</span>`;
  } else {
    if (g.mode === 'numbers') html += `<button class="primary" data-act="call">Call next number <span class="muted">(space)</span></button>`;
    html += `<select data-act="pattern">${['line', 'two', 'full'].map((p) => `<option value="${p}" ${p === g.pattern ? 'selected' : ''}>${{ line: 'One line', two: 'Two lines', full: 'Full house' }[p]}</option>`).join('')}</select>`;
    if (g.mode === 'music') html += `<label><input type="checkbox" data-act="hide" style="width:auto" ${g.hideTitles ? 'checked' : ''}/> Hide titles</label>`;
    html += `<span class="muted">${g.called.length} called</span>`;
  }
  html += `<button data-act="end">End game</button>`;
  live.innerHTML = html;
  live.querySelector('[data-act=next]')?.addEventListener('click', () => send('host:next'));
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
  if (g.type === 'quiz') return renderQuiz(st, g);
  return renderBingo(st, g);
}

function renderQuiz(st, g) {
  if (g.phase === 'intro') {
    st.innerHTML = `<div class="center"><div class="qhead">Get your phones ready</div><div class="qtext">Quiz time!</div><div class="qhead" style="margin-top:2vh">${g.total} questions · ${state.players.length} players</div></div>`;
    return;
  }
  if (g.phase === 'final') { st.innerHTML = leaderboardHtml('🏆 Final scores', 10); return; }
  const q = g.question;
  const opts = q.options.map((o, i) => {
    const cls = g.phase === 'reveal' ? (i === g.answer ? 'right' : 'dim') : '';
    const count = g.counts ? `<span class="count">${g.counts[i]}</span>` : '';
    return `<div class="opt c${i} ${cls}"><span class="shape">${SHAPES[i]}</span>${esc(o)}${count}</div>`;
  }).join('');
  const lb = g.phase === 'reveal' ? `<div style="margin-top:3vh;width:min(70vw,900px)">${leaderboardHtml('Leaderboard', 5)}</div>` : '';
  st.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
    <div class="qhead">Question ${g.index + 1} of ${g.total}</div>
    <div class="qtext">${esc(q.q)}</div>
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
