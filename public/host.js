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
async function onRoom({ code, hostKey, error }) {
  if (error === 'Login required') return location.replace('/login?next=/host');
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
    let lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let cat = null;
    if (lines[0]?.startsWith('#')) { cat = lines[0].replace(/^#\s*/, ''); lines = lines.slice(1); }
    if (lines.length < 3) return null;
    const [q, ...opts] = lines;
    const answer = opts.findIndex((o) => o.startsWith('*'));
    return { q, options: opts.slice(0, 4).map((o) => o.replace(/^\*\s*/, '')), answer, cat };
  }).filter((q) => q && q.answer >= 0 && q.answer < 4);
}
function quizToText(qs) {
  return qs.map((q) => [...(q.cat ? [`# ${q.cat}`] : []), q.q, ...q.options.map((o, i) => (i === q.answer ? '*' : '') + o)].join('\n')).join('\n\n');
}

// ---------- quiz categories ----------
const selectedCats = new Set(store.get('cg-cats') || []);
let allCats = [];
fetch('/api/quiz-categories').then((r) => r.json()).then((cats) => { allCats = cats; renderCats(); });
function renderCats() {
  const all = !selectedCats.size;
  $('#catGrid').innerHTML = `<button class="cat ${all ? 'on' : ''}" data-cat="">🌍 All categories<small>mixed</small></button>` +
    allCats.map((c) => `<button class="cat ${selectedCats.has(c.id) ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}<small>${c.count} questions</small></button>`).join('');
  $('#catGrid').querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.cat;
    if (!id) selectedCats.clear();
    else selectedCats.has(id) ? selectedCats.delete(id) : selectedCats.add(id);
    store.set('cg-cats', [...selectedCats]);
    renderCats();
  }));
  const names = all ? 'all categories' : allCats.filter((c) => selectedCats.has(c.id)).map((c) => c.name).join(', ');
  $('#catNote').textContent = `Mixing ${names}`;
}
async function loadCats() {
  const qs = await fetch(`/api/quiz-pack?cats=${[...selectedCats].join(',')}&n=${$('#quizN').value}`).then((r) => r.json());
  $('#quizText').value = quizToText(qs);
  $('#catNote').textContent = `Loaded ${qs.length} questions. Press Start quiz, or open the editor below to tweak them.`;
}
$('#loadCats').onclick = loadCats;
$('#startQuiz').onclick = async () => {
  if (!$('#quizText').value.trim()) await loadCats();
  const questions = parseQuiz($('#quizText').value);
  if (!questions.length) return ($('#err').textContent = 'No valid questions found. Mark each correct answer with a *.');
  try { localStorage.setItem('cg-quiz', $('#quizText').value); } catch {}
  send('host:startQuiz', { questions, seconds: +$('#quizSecs').value });
};
// ---------- emoji guess ----------
const emojiCats = new Set(store.get('cg-emoji-cats') || []);
let allEmojiCats = [];
fetch('/api/emoji-categories').then((r) => r.json()).then((cats) => { allEmojiCats = cats; renderEmojiCats(); });
function renderEmojiCats() {
  const all = !emojiCats.size;
  $('#emojiGrid').innerHTML = `<button class="cat ${all ? 'on' : ''}" data-cat="">🌍 All categories<small>mixed</small></button>` +
    allEmojiCats.map((c) => `<button class="cat ${emojiCats.has(c.id) ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}<small>${c.count} puzzles</small></button>`).join('');
  $('#emojiGrid').querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.cat;
    if (!id) emojiCats.clear();
    else emojiCats.has(id) ? emojiCats.delete(id) : emojiCats.add(id);
    store.set('cg-emoji-cats', [...emojiCats]);
    $('#emojiText').value = ''; // a new pick means a fresh set of puzzles
    renderEmojiCats();
  }));
  const picked = all ? 'all categories' : allEmojiCats.filter((c) => emojiCats.has(c.id)).map((c) => c.name).join(', ');
  $('#emojiNote').textContent = `Mixing ${picked}`;
}
function parseEmoji(text) {
  let cat = '';
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { cat = line.replace(/^#\s*/, ''); continue; }
    const [e, a, note] = line.split('|').map((x) => x.trim());
    if (e && a) out.push({ e, a, note: note || '', cat });
  }
  return out;
}
function emojiToText(list) {
  let cat = null;
  return list.map((p) => {
    const head = p.cat !== cat ? `${(cat = p.cat) ? `# ${p.cat}\n` : ''}` : '';
    return `${head}${p.e} | ${p.a}${p.note ? ` | ${p.note}` : ''}`;
  }).join('\n');
}
async function loadEmoji() {
  const list = await fetch(`/api/emoji-pack?cats=${[...emojiCats].join(',')}&n=${$('#emojiN').value}`).then((r) => r.json());
  // Group by category in the editor so it's easy to scan; the game still plays them shuffled.
  const sorted = [...list].sort((x, y) => x.cat.localeCompare(y.cat));
  $('#emojiText').value = emojiToText(sorted);
  $('#emojiNote').textContent = `Loaded ${list.length} puzzles. Press Start, or open the editor below to tweak them.`;
}
$('#loadEmoji').onclick = loadEmoji;
$('#startEmoji').onclick = async () => {
  if (!$('#emojiText').value.trim()) await loadEmoji();
  const puzzles = parseEmoji($('#emojiText').value);
  if (!puzzles.length) return ($('#err').textContent = 'No puzzles found. Use one line per puzzle: emojis | answer.');
  // Shuffle so grouped categories in the editor still come out mixed.
  for (let i = puzzles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [puzzles[i], puzzles[j]] = [puzzles[j], puzzles[i]]; }
  send('host:startEmoji', { puzzles, seconds: +$('#emojiSecs').value });
};

// ---------- event + wedding packs ----------
const names = () => ({ A: state?.event.a || 'Partner 1', B: state?.event.b || 'Partner 2' });
const fill = (t) => t.replace(/\{(A|B)\}/g, (_, k) => names()[k]);
let accentVal = '';
function readEvent() {
  return { type: $('#evType').value, title: $('#evTitle').value.trim(), a: $('#evA').value.trim(), b: $('#evB').value.trim(), accent: accentVal };
}
$('#evAccent').oninput = (e) => { accentVal = e.target.value; applyTheme(readEvent()); };
$('#accentReset').onclick = () => { accentVal = ''; applyTheme(readEvent()); $('#evAccent').value = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff3d9a'; };

// Logo: shrunk in the browser to keep it light, kept in this browser for the next event.
function showLogoBox(src) {
  $('#logoBox').innerHTML = src ? `<img src="${esc(src)}" alt="Your logo" />` : '<span class="muted">No logo</span>';
  $('#logoClear').hidden = !src;
}
function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || max) * k));
      c.height = Math.max(1, Math.round((img.naturalHeight || max) * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("That file doesn't look like an image."));
    img.src = URL.createObjectURL(file);
  });
}
$('#logoPick').onclick = () => $('#logoIn').click();
$('#logoIn').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    let data = await shrinkImage(f, 600);
    if (data.length > 500e3) data = await shrinkImage(f, 360);
    store.set('cg-logo', data);
    showLogoBox(data);
    send('host:logo', { data });
  } catch (err) { $('#err').textContent = err.message; }
};
$('#logoClear').onclick = () => { store.set('cg-logo', null); showLogoBox(null); send('host:logo', { data: null }); };
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
  if (ev.accent) document.body.style.setProperty('--accent', ev.accent);
  else document.body.style.removeProperty('--accent');
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

// ---------- raffle & wheel ----------
let rfMode = 'raffle';
const WHEEL_IDEAS = {
  '🎤 Forfeits': ['Sing a chorus', 'Dance for 10 seconds', 'Do an impression', 'Tell a joke', 'Air guitar solo', 'Free pass!', 'Pick someone to dance', 'Lead a conga'],
  '🍹 Drinks': ['Shot!', 'Water break', 'Free drink', 'Cocktail of your choice', 'Buy the next round', 'Pick who drinks', 'Free pass!', 'Mocktail'],
  '🎵 Next genre': ['80s', '90s', 'Disco', 'Rock', 'Pop hits', 'Dance anthems', 'Cheesy classic', 'DJ\'s choice'],
  '🎁 Prizes': ['Free drink', 'Spot prize', 'Bar tab', 'Mystery prize', 'Spin again', 'Better luck next time', 'Choose the next song', 'Bonus raffle ticket'],
};
$('#rfIdeas').innerHTML = '<span class="muted">Ideas:</span>' + Object.keys(WHEEL_IDEAS).map((k) => `<button data-idea="${esc(k)}">${esc(k)}</button>`).join('');
$('#rfIdeas').querySelectorAll('[data-idea]').forEach((b) => (b.onclick = () => { $('#rfSegs').value = WHEEL_IDEAS[b.dataset.idea].join('\n'); }));
$('#rfMode').querySelectorAll('button').forEach((b) => (b.onclick = () => {
  rfMode = b.dataset.mode;
  $('#rfMode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelector('.rf-raffle').hidden = rfMode !== 'raffle';
  document.querySelector('.rf-wheel').hidden = rfMode !== 'wheel';
}));
$('#startRaffle').onclick = () => {
  const d = { mode: rfMode, title: $('#rfTitle').value, prizes: $('#rfPrizes').value, segments: $('#rfSegs').value, entry: $('#rfEntry').value, repeat: $('#rfRepeat').checked };
  store.set('cg-raffle', d);
  wheelSound.unlock();
  send('host:startRaffle', d);
};
{
  const d = store.get('cg-raffle');
  if (d) {
    $('#rfTitle').value = d.title || ''; $('#rfPrizes').value = d.prizes || ''; $('#rfSegs').value = d.segments || '';
    $('#rfEntry').value = d.entry || 'all'; $('#rfRepeat').checked = !!d.repeat;
    $(`#rfMode [data-mode=${d.mode === 'wheel' ? 'wheel' : 'raffle'}]`).click();
  }
}

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
  $('#quizText').closest('details').open = true;
  $('#quizText').value = p.coupleQuiz.map((q) => [fill(q.q), ...q.options.map(fill)].join('\n')).join('\n\n');
  $('#err').textContent = '';
  alert('Template loaded. Edit the answers with the couple before the night. The * marks the correct answer, so move it to the right line.');
};
$('#loadWeddingTrivia').onclick = async () => { $('#quizText').value = quizToText((await getPack()).trivia); };
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
  const songs = window.musicLabels ? window.musicLabels() : $('#songText').value.split('\n').map((s) => s.trim()).filter(Boolean);
  try { localStorage.setItem('cg-songs', $('#songText').value); } catch {}
  send('host:startBingo', { mode: 'music', songs, pattern: $('#musicPattern').value, audience: $('#audience').value });
};
try {
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

const AUDIENCE_OPTS = [['hidden', 'Nothing: guess by ear'], ['titles', 'Song titles'], ['video', 'Video only'], ['both', 'Video + song titles']];

function primaryAction() {
  const g = state?.game;
  if (!g) return null;
  if (g.type === 'quiz' && g.phase !== 'final') return () => send('host:next');
  if (g.type === 'bingo' && (g.mode === 'numbers' || window.musicCanPlay?.())) return () => (g.mode === 'music' ? window.musicNext() : send('host:call'));
  if (g.type === 'couple' && g.phase !== 'final') return () => send('host:coupleNext');
  if (g.type === 'challenge' && g.phase === 'signup') return () => send('host:draw');
  if (g.type === 'karaoke') return () => send('host:karaoke', { act: 'next' });
  if (g.type === 'raffle' && g.phase !== 'spinning') return () => { wheelSound.unlock(); send('host:spin'); };
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
      ? (name === 'liveMusic' && g.type === 'bingo' && g.mode === 'music') || (name === 'liveKaraoke' && g.type === 'karaoke') || (name === 'liveCouple' && g.type === 'couple' && g.phase === 'answering')
      : name === tab;
    p.classList.toggle('hidden', !show);
  });
  if (!g) { live.innerHTML = ''; return; }
  let html = '';
  if (g.type === 'karaoke') {
    html += `<button class="primary" data-act="kNext">${g.current ? (g.queue.length ? '🎤 Next singer' : '✓ Finish this song') : '🎤 First singer'} <span class="muted">(space)</span></button>`;
    if (g.current?.yt) html += `<button data-act="kVideo">${g.video ? '⏹ Stop video' : '▶ Play video'}</button>`;
    html += `<label class="inline"><input type="checkbox" data-act="kOpen" ${g.open ? 'checked' : ''} /> Sign-ups open</label>`;
    html += `<label class="inline"><input type="checkbox" data-act="kAuto" ${g.autoVideo ? 'checked' : ''} /> Play videos automatically</label>`;
    html += `<span class="muted">${g.queue.length} waiting · ${g.played} sung</span>`;
  } else if (g.type === 'raffle') {
    const again = g.phase === 'won' ? (g.mode === 'raffle' && g.nextPrize ? `Draw next prize` : 'Spin again') : '🎡 Spin the wheel';
    if (g.phase !== 'spinning') html += `<button class="primary" data-act="spin">${again} <span class="muted">(space)</span></button>`;
    if (g.phase === 'won' && g.mode === 'raffle') html += `<button data-act="redraw" title="Spin again for the same prize">🙋 Winner not here? Redraw</button>`;
    html += `<span class="muted">${g.mode === 'raffle' ? `${g.poolSize} in the draw${g.entry === 'optin' ? ` · ${g.entrants} entered` : ''}${g.prizeCount ? ` · ${g.prizesLeft} prizes left` : ''}` : `${g.poolSize} on the wheel`}</span>`;
  } else if (g.type === 'challenge') {
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
    const rounds = g.variant !== 'quiz';
    const label = { intro: rounds ? 'Start first round' : 'Start first question', question: 'Reveal answer', reveal: g.index + 1 >= g.total ? 'Final results' : rounds ? 'Next round' : 'Next question' }[g.phase];
    if (label) html += `<button class="primary" data-act="next">${label} <span class="muted">(space)</span></button>`;
    html += `<span class="muted">${rounds ? 'Round' : 'Question'} ${Math.max(0, g.index + 1)} of ${g.total}</span>`;
  } else {
    if (g.mode === 'numbers') html += `<button class="primary" data-act="call">Call next number <span class="muted">(space)</span></button>`;
    html += `<select data-act="pattern">${['line', 'two', 'full'].map((p) => `<option value="${p}" ${p === g.pattern ? 'selected' : ''}>${{ line: 'One line', two: 'Two lines', full: 'Full house' }[p]}</option>`).join('')}</select>`;
    if (g.mode === 'music') html += `<label class="inline">Audience sees <select data-act="audience">${AUDIENCE_OPTS.map(([v, t]) => `<option value="${v}" ${v === g.audience ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    html += `<span class="muted">${g.called.length} called</span>`;
  }
  html += `<button data-act="end">End game</button>`;
  live.innerHTML = html;
  live.querySelector('[data-act=next]')?.addEventListener('click', () => send('host:next'));
  live.querySelector('[data-act=kNext]')?.addEventListener('click', () => send('host:karaoke', { act: 'next' }));
  live.querySelector('[data-act=kVideo]')?.addEventListener('click', () => send('host:karaoke', { act: 'video', on: !g.video }));
  live.querySelector('[data-act=kOpen]')?.addEventListener('change', (e) => send('host:karaoke', { act: 'open', open: e.target.checked }));
  live.querySelector('[data-act=kAuto]')?.addEventListener('change', (e) => send('host:karaoke', { act: 'autoVideo', on: e.target.checked }));
  live.querySelector('[data-act=spin]')?.addEventListener('click', () => { wheelSound.unlock(); send('host:spin'); });
  live.querySelector('[data-act=redraw]')?.addEventListener('click', () => { wheelSound.unlock(); send('host:redraw'); });
  live.querySelector('[data-act=draw]')?.addEventListener('click', () => send('host:draw'));
  live.querySelector('[data-act=drawOne]')?.addEventListener('click', () => send('host:draw', { n: 1 }));
  live.querySelector('[data-act=chVote]')?.addEventListener('click', () => send('host:challengeVote'));
  live.querySelector('[data-act=coupleNext]')?.addEventListener('click', () => send('host:coupleNext'));
  live.querySelector('[data-act=couplePhones]')?.addEventListener('click', showCouplePhones);
  live.querySelector('[data-act=pollNext]')?.addEventListener('click', () => send('host:pollNext'));
  live.querySelector('[data-act=poll]')?.addEventListener('click', () => send('host:pollOpen', { open: !g.open }));
  live.querySelector('[data-act=call]')?.addEventListener('click', () => send('host:call'));
  live.querySelector('[data-act=pattern]')?.addEventListener('change', (e) => send('host:pattern', { pattern: e.target.value }));
  live.querySelector('[data-act=audience]')?.addEventListener('change', (e) => { send('host:audience', { view: e.target.value }); window.musicAudienceChanged?.(e.target.value); });
  live.querySelector('[data-act=end]').addEventListener('click', () => confirm('End this game and go back to the lobby?') && send('host:end'));
  if (g.type === 'bingo' && g.mode === 'music') renderSongPick();
  if (g.type === 'couple') renderCoupleEntry(g);
  if (g.type === 'karaoke') window.karaokeQueue(g);
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
    .map((i) => `<button data-id="${i.id}" class="${called.has(i.id) ? 'on' : ''}">${window.musicHasFile?.(i.label) ? '♪ ' : window.musicYtFor?.(i.label) ? '▶ ' : ''}${esc(i.label)}</button>`)
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
        ${state.event.logo ? `<img class="lobbylogo" src="${esc(state.event.logo)}" alt="" />` : ''}
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
  if (g.type === 'raffle') return renderRaffle(st, g);
  if (g.type === 'karaoke') return window.karaokeStage(st, g);
  if (g.type === 'couple') return renderCouple(st, g);
  if (g.type === 'poll') return renderPoll(st, g);
  if (g.type === 'quiz') return renderQuiz(st, g);
  return renderBingo(st, g);
}

function renderQuiz(st, g) {
  const isHl = g.variant === 'hl';
  const isEmoji = g.variant === 'emoji';
  const rounds = isHl || isEmoji;
  if (g.phase === 'intro') {
    const title = isHl ? 'Higher or lower?' : isEmoji ? '😀 Guess the emoji!' : 'Quiz time!';
    const sub = isEmoji ? '<div class="qhead" style="margin-top:1vh">Work out what the emojis spell, then tap the answer on your phone</div>' : '';
    st.innerHTML = `<div class="center"><div class="qhead">Get your phones ready</div><div class="qtext">${title}</div>${sub}<div class="qhead" style="margin-top:2vh">${g.total} ${rounds ? 'rounds' : 'questions'} · ${state.players.length} players</div></div>`;
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
  const top = isHl ? hlCards(g.hl) : isEmoji ? `<div class="emojiq">${esc(q.q)}</div>` : `<div class="qtext">${esc(q.q)}</div>`;
  const note = g.note ? `<div class="hlnote">${esc(g.note)}</div>` : '';
  st.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
    <div class="qhead">${rounds ? 'Round' : 'Question'} ${g.index + 1} of ${g.total}${q.cat ? ` · <span class="qcat">${esc(q.cat)}</span>` : ''}</div>
    ${top}${note}
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

// ---------- the wheel ----------
// Spins are timed from the server's clock, so a redraw mid-spin (or the phone
// remote) picks up at exactly the same angle.
const wheelSound = {
  ctx: null,
  unlock() { try { this.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume?.(); } catch {} },
  tick(gain = 0.25) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const o = c.createOscillator(), v = c.createGain();
    o.type = 'square'; o.frequency.value = 1800;
    v.gain.setValueAtTime(gain, c.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
    o.connect(v).connect(c.destination); o.start(); o.stop(c.currentTime + 0.04);
  },
  tada() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = c.createOscillator(), v = c.createGain(), t = c.currentTime + i * 0.09;
      o.type = 'triangle'; o.frequency.value = f;
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.3, t + 0.02); v.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(v).connect(c.destination); o.start(t); o.stop(t + 0.65);
    });
  },
};
let wheelRaf = 0;
let wheelLogo = { src: '', img: null };
let lastTick = -1, tadaFor = 0;
const IDLE_DPS = 6; // slow idle turn, degrees per second
const idleAngle = (t) => ((t / 1000) * IDLE_DPS) % 360;
const easeOut = (t) => 1 - (1 - t) ** 4;

function wheelAngle(g, now) {
  const n = g.segs.length || 1, a = 360 / n;
  if (!g.spin) return idleAngle(now);
  const start = idleAngle(g.spin.at);
  const target = ((-(g.spin.index + 0.5 + g.spin.jitter) * a) % 360 + 360) % 360;
  const final = start + g.spin.turns * 360 + ((target - start) % 360 + 360) % 360;
  const t = Math.min(1, Math.max(0, (now - g.spin.at) / g.spin.ms));
  return start + (final - start) * easeOut(t);
}

function wheelColours(n) {
  const cs = getComputedStyle(document.body);
  const base = ['--a0', '--a1', '--a2', '--a3', '--accent'].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
  const out = Array.from({ length: n }, (_, i) => base[i % base.length]);
  if (n > 1 && out[n - 1] === out[0]) out[n - 1] = base[(n - 1 + 2) % base.length];
  return out;
}

function drawWheel(cv, g) {
  const dpr = window.devicePixelRatio || 1;
  const size = cv.clientWidth;
  if (!size) return;
  if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
  const x = cv.getContext('2d');
  const W = cv.width, R = W / 2 - 14 * dpr, C = W / 2;
  const segs = g.segs.length ? g.segs : [{ label: 'Waiting for guests…' }];
  const n = segs.length, a = (Math.PI * 2) / n;
  const now = Date.now() + clockOffset;
  const rot = (wheelAngle({ ...g, segs }, now) * Math.PI) / 180;
  const cols = wheelColours(n);
  const won = g.phase === 'won' && g.spin;
  x.clearRect(0, 0, W, W);
  x.save();
  x.translate(C, C);
  // rim
  x.beginPath(); x.arc(0, 0, R + 10 * dpr, 0, Math.PI * 2); x.fillStyle = '#ffffff22'; x.fill();
  for (let i = 0; i < n; i++) {
    const s0 = -Math.PI / 2 + rot + i * a;
    x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, s0, s0 + a); x.closePath();
    x.fillStyle = cols[i];
    x.globalAlpha = won && i !== g.spin.index ? 0.35 : 1;
    x.fill();
    x.globalAlpha = 1;
    x.strokeStyle = '#0006'; x.lineWidth = 2 * dpr; x.stroke();
    // label along the radius
    x.save();
    x.rotate(s0 + a / 2);
    // Shrink long labels to fit before resorting to "…".
    let fs = Math.min(R * 0.11, (R * a) / 1.7, R / 9);
    const minFs = Math.max(10 * dpr, fs * 0.55);
    let label = segs[i].label;
    const maxW = R * 0.66;
    x.font = `800 ${fs}px system-ui, sans-serif`;
    while (fs > minFs && x.measureText(label).width > maxW) { fs *= 0.93; x.font = `800 ${fs}px system-ui, sans-serif`; }
    x.fillStyle = '#fff'; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.shadowColor = '#0008'; x.shadowBlur = 4 * dpr;
    while (label.length > 3 && x.measureText(label).width > maxW) label = label.slice(0, -2).trimEnd() + '…';
    x.fillText(label, R - 16 * dpr, 0);
    x.restore();
  }
  // pegs
  for (let i = 0; i < n; i++) {
    const s0 = -Math.PI / 2 + rot + i * a;
    x.beginPath(); x.arc(Math.cos(s0) * (R + 2 * dpr), Math.sin(s0) * (R + 2 * dpr), 4 * dpr, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  }
  // hub with the DJ's logo
  const hub = R * 0.24;
  const cs = getComputedStyle(document.body);
  x.beginPath(); x.arc(0, 0, hub, 0, Math.PI * 2); x.fillStyle = cs.getPropertyValue('--bg').trim() || '#0b0b14';
  x.shadowColor = '#0009'; x.shadowBlur = 20 * dpr; x.fill(); x.shadowBlur = 0;
  x.lineWidth = 5 * dpr; x.strokeStyle = cs.getPropertyValue('--accent').trim(); x.stroke();
  const logo = state?.event?.logo;
  if (logo && wheelLogo.src !== logo) { wheelLogo = { src: logo, img: new Image() }; wheelLogo.img.src = logo; }
  if (logo && wheelLogo.img?.complete && wheelLogo.img.naturalWidth) {
    const im = wheelLogo.img, k = Math.min((hub * 1.7) / im.naturalWidth, (hub * 1.25) / im.naturalHeight);
    x.drawImage(im, (-im.naturalWidth * k) / 2, (-im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
  } else {
    x.font = `${hub}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(g.mode === 'raffle' ? '🎟️' : '🎡', 0, hub * 0.05);
  }
  x.restore();
  // pointer at the top
  x.beginPath();
  x.moveTo(C - 22 * dpr, 2 * dpr); x.lineTo(C + 22 * dpr, 2 * dpr); x.lineTo(C, 46 * dpr); x.closePath();
  x.fillStyle = '#fff'; x.shadowColor = '#000a'; x.shadowBlur = 10 * dpr; x.fill(); x.shadowBlur = 0;
  x.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent'); x.lineWidth = 3 * dpr; x.stroke();
  // tick as each peg passes the pointer
  if (g.phase === 'spinning') {
    const under = Math.floor(((((-rot * 180) / Math.PI) % 360) + 360) % 360 / (360 / n));
    if (under !== lastTick) { if (lastTick !== -1) wheelSound.tick(); lastTick = under; }
  } else lastTick = -1;
}

function renderRaffle(st, g) {
  cancelAnimationFrame(wheelRaf);
  const raffle = g.mode === 'raffle';
  const prizeLine = raffle && g.nextPrize && g.phase !== 'won' ? `<div class="rf-prize">Now drawing: <b>${esc(g.nextPrize)}</b></div>` : '';
  const how = raffle
    ? g.entry === 'optin'
      ? `Tap <b>ENTER</b> on your phone to get in the draw! <b>${g.entrants}</b> entered`
      : `Your ticket number is on your phone · <b>${g.poolSize}</b> in the draw`
    : '';
  const winners = raffle && g.winners.length
    ? `<div class="rf-winners"><div class="qhead">Winners</div>${g.winners.slice().reverse().slice(0, 8).map((w) => `<div class="rf-w"><span class="rf-t">${esc(w.ticket)}</span> <b>${esc(w.label)}</b>${w.prize ? `<small>${esc(w.prize)}</small>` : ''}</div>`).join('')}</div>`
    : '';
  const shown = g.phase === 'won' && g.last;
  const result = shown
    ? `<div class="rf-result pop">${raffle ? `<div class="qhead">${g.last.prize ? esc(g.last.prize) : 'And the winner is…'}</div><div class="rf-wname">🎉 ${esc(g.last.label)}</div><div class="rf-wticket">Ticket ${esc(g.last.ticket)}</div>` : `<div class="rf-wname">${esc(g.last.label)}</div>`}</div>`
    : '';
  st.innerHTML = `<div class="rf">
    <div class="rf-wheelwrap"><canvas id="wheel"></canvas></div>
    <div class="rf-info">
      <div class="qtext rf-title">${esc(g.title)}</div>
      ${prizeLine}
      ${g.phase === 'spinning' ? '<div class="qhead">🥁 Round and round it goes…</div>' : ''}
      ${result}
      ${how ? `<div class="qhead">${how}</div>` : ''}
      ${winners}
    </div>
  </div>`;
  if (shown && tadaFor !== g.spin?.at) { tadaFor = g.spin?.at; wheelSound.tada(); }
  const cv = $('#wheel');
  const loop = () => {
    const cur = state?.game;
    if (cur?.type !== 'raffle' || !cv.isConnected) return;
    drawWheel(cv, cur);
    wheelRaf = requestAnimationFrame(loop);
  };
  loop();
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

// Every song played so far, newest first, as tiles: title big, artist small.
function songBoard(g, max = 40) {
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i.label]));
  const tiles = g.called.slice().reverse().slice(0, max).map((id, n) => {
    const [artist, ...t] = String(byId[id] || '').split(' - ');
    const title = t.length ? t.join(' - ') : artist;
    return `<div class="sb-tile ${n === 0 ? 'now' : ''}"><b>${esc(title)}</b>${t.length ? `<small>${esc(artist)}</small>` : ''}</div>`;
  }).join('');
  return `<div class="songboard"><div class="sb-head">Song board · ${g.called.length} of ${g.items.length} played</div><div class="sb-grid">${tiles}</div></div>`;
}
window.songBoard = songBoard;

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
    history = songBoard(g);
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
    $('#brand').innerHTML = (state.event.logo ? `<img class="sidelogo" src="${esc(state.event.logo)}" alt="" />` : '') +
      (t ? `<span class="evtitle">${esc(t)}</span>` : state.event.logo ? '' : 'Crowd <span>QR</span> Games');
    if (!eventFormFilled) {
      eventFormFilled = true;
      const fresh = !state.event.title && !state.event.a && state.event.type === 'party';
      const ev = fresh && !isRemote ? store.get('cg-event') || state.event : state.event;
      // Carry the DJ's last event settings into a fresh room.
      if (fresh && !isRemote && store.get('cg-event')) send('host:event', ev);
      $('#evType').value = ev.type; $('#evTitle').value = ev.title; $('#evA').value = ev.a; $('#evB').value = ev.b;
      accentVal = ev.accent || '';
      applyTheme(ev);
      $('#evAccent').value = accentVal || getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff3d9a';
      const logo = store.get('cg-logo');
      if (!state.event.logo && logo && !isRemote) send('host:logo', { data: logo });
      showLogoBox(state.event.logo || (!isRemote && logo) || null);
    }
  }
  if (state) $('#chTonight').textContent = state.pickedTonight ? `(${state.pickedTonight} picked so far tonight)` : '';
  renderSide();
  renderStage();
  renderControls();
}
