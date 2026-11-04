/* Music bingo audio: the DJ's own files play from this computer (never uploaded),
   plus playlist import (Spotify / Apple Music links, CSV / M3U / TXT files).
   Loaded after host.js and shares its globals (state, socket, send, $, esc). */
(() => {
  const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;
  const files = new Map(); // matching key -> File
  const byTitle = new Map(); // title-only key -> File (null when two files share a title)
  // Loose key so "Don’t Stop Me Now" matches "Dont Stop Me Now" and "Beyoncé" matches "Beyonce".
  const key = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and')
    .replace(/\s(ft|feat|featuring)\.?\s.*?(?=\s-\s|$)/g, ' ').replace(/[^a-z0-9]+/g, '');
  const titleKey = (s) => key(String(s).split(' - ').slice(1).join(' - ') || s);
  const norm = key;
  const fileFor = (label) => files.get(key(label)) || byTitle.get(titleKey(label)) || null;
  const settings = () => ({ mode: $('#playMode').value, clip: +$('#clipLen').value, auto: $('#autoCall').checked, audience: $('#audience').value });
  const saveSettings = () => { try { localStorage.setItem('cg-music', JSON.stringify(settings())); } catch {} };
  try {
    const s = JSON.parse(localStorage.getItem('cg-music') || 'null');
    if (s) { $('#playMode').value = s.mode; $('#clipLen').value = String(s.clip); $('#autoCall').checked = !!s.auto; if (s.audience) $('#audience').value = s.audience; }
  } catch {}
  ['#playMode', '#clipLen', '#autoCall', '#audience'].forEach((id) => $(id).addEventListener('change', () => { saveSettings(); renderNow(); }));

  // ---------- song list helpers ----------
  // A line is "Artist - Title", optionally followed by " | <YouTube link>".
  const YT_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/;
  const splitLine = (l) => { const m = l.match(/^(.*?)\s*\|\s*(\S+)\s*$/); const id = m && (m[2].match(YT_ID) || [])[1]; return id ? { label: m[1].trim(), yt: id } : { label: l.trim(), yt: null }; };
  const rawLines = () => $('#songText').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const lines = () => rawLines().map((l) => splitLine(l).label).filter(Boolean);
  window.musicLabels = lines;
  function addLines(list) {
    const have = new Set(lines().map(norm));
    const add = list.map((s) => s.trim()).filter((s) => s && !have.has(norm(splitLine(s).label)) && have.add(norm(splitLine(s).label)));
    $('#songText').value = [...rawLines(), ...add].join('\n');
    updateCounts();
    window.renderLibSongs?.();
    renderMine?.();
    return add.length;
  }
  function updateCounts() {
    const n = lines().length;
    const withFile = lines().filter((l) => !!fileFor(l) || !!window.musicYtFor?.(l)).length;
    $('#songCount').textContent = n ? `${n} songs${n < 16 ? ` · need ${16 - n} more` : n < 24 ? ' · 4x4 cards' : ' · 5x5 cards'} · ${withFile} can play` : '';
  }
  $('#songText').addEventListener('input', updateCounts);
  $('#clearSongs').onclick = () => { if (!lines().length || confirm('Clear the song list?')) { $('#songText').value = ''; updateCounts(); renderLibSongs(); renderMine(); } };

  // ---------- reading tags ----------
  function decodeText(bytes) {
    const enc = bytes[0], body = bytes.subarray(1);
    const label = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
    return new TextDecoder(label).decode(body).replace(/\u0000/g, ' ').replace(/^﻿/, '').trim();
  }
  async function id3(file) {
    try {
      const b = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
      if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
      const v = b[3];
      const syncsafe = (i) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
      const end = Math.min(b.length, 10 + syncsafe(6));
      let i = 10;
      if (b[5] & 0x40) i += v === 4 ? syncsafe(10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4; // extended header
      const out = {};
      while (i + 10 < end) {
        const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const size = v === 4 ? syncsafe(i + 4) : (b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7];
        if (size <= 0 || i + 10 + size > b.length) break;
        if (id === 'TIT2') out.title = decodeText(b.subarray(i + 10, i + 10 + size));
        if (id === 'TPE1') out.artist = decodeText(b.subarray(i + 10, i + 10 + size));
        i += 10 + size;
      }
      return out;
    } catch { return {}; }
  }
  const fromName = (name) => name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}\s*[-.)]?\s+/, '').replace(/\s+/g, ' ').trim();
  async function labelFor(file) {
    const t = await id3(file);
    if (t.title) return t.artist ? `${t.artist} - ${t.title}` : t.title;
    return fromName(file.name);
  }

  // ---------- My music: saved in this browser (IndexedDB), never uploaded ----------
  const mine = new Map(); // key -> { key, label, size, added }
  let dbp = null;
  const db = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('crowd-qr-music', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'key' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  async function store(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('songs', mode);
      const req = fn(t.objectStore('songs'));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('aborted'));
    });
  }
  function rebuildTitles() {
    byTitle.clear();
    for (const [k, f] of files) {
      const tk = titleKey(mine.get(k)?.label || k);
      byTitle.set(tk, byTitle.has(tk) && byTitle.get(tk) !== f ? null : f);
    }
  }
  function register(rec, blob) {
    mine.set(rec.key, { key: rec.key, label: rec.label, size: rec.size, added: rec.added });
    files.set(rec.key, blob);
  }
  let storageOk = true;

  function musicChanged() {
    rebuildTitles();
    $('#playOpts').classList.toggle('has-files', files.size > 0);
    updateCounts();
    renderMine();
    renderNow();
    window.renderSongPick?.();
    window.renderLibSongs?.();
  }

  async function addFiles(list) {
    const audio = [...list].filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name));
    if (!audio.length) return;
    $('#fileCount').textContent = `Reading ${audio.length} songs…`;
    const fresh = [];
    let dupes = 0;
    for (const f of audio) {
      const label = (await labelFor(f)).slice(0, 100);
      if (!label) continue;
      const k = key(label);
      if (mine.has(k) || fresh.some((r) => r.key === k)) { dupes++; continue; }
      fresh.push({ key: k, label, blob: f, size: f.size, added: Date.now() });
    }
    for (const r of fresh) register(r, r.blob);
    let saved = fresh.length;
    if (fresh.length && storageOk) {
      try {
        await store('readwrite', (os) => { for (const r of fresh) os.put(r); });
        navigator.storage?.persist?.().catch(() => {});
      } catch (e) {
        saved = 0;
        $('#err').textContent = /quota/i.test(e?.name + e?.message) ? "This computer's browser storage is full, so these songs will only work until you close the page." : "This browser can't save songs (private window?), so they'll only work until you close the page.";
      }
    }
    musicChanged();
    const labels = fresh.map((r) => r.label);
    const el = $('#fileCount');
    el.innerHTML = `${saved ? `Saved ${saved} new songs to My music.` : fresh.length ? `Added ${fresh.length} songs for this session.` : ''}${dupes ? ` ${dupes} were already there.` : ''} ` +
      (labels.length ? '<button id="addFresh">Add them to this game</button>' : '');
    $('#addFresh')?.addEventListener('click', () => { const n = addLines(labels); flash(`Added ${n} songs to this game.`); el.textContent = ''; });
  }

  const fmtSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
  function renderMine() {
    const total = [...mine.values()].reduce((a, r) => a + (r.size || 0), 0);
    $('#mineCount').textContent = mine.size ? `${mine.size} songs saved on this computer (${fmtSize(total)})` : 'Save your songs here once and use them in every game.';
    $('#mineBody').hidden = !mine.size;
    if (!mine.size) return;
    const q = key($('#mineSearch').value);
    const have = inList();
    const list = [...mine.values()].filter((r) => !q || r.key.includes(q)).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    $('#mineSongs').innerHTML = list.slice(0, 400).map((r) => {
      const on = have.has(r.key);
      return `<button data-song="${esc(r.label)}" class="${on ? 'on' : ''}" title="${on ? 'Remove from this game' : 'Add to this game'}"><span class="del" data-del="${esc(r.key)}" title="Remove from My music">✕</span>${on ? '✓' : '+'} ${esc(r.label)}</button>`;
    }).join('') + (list.length > 400 ? `<span class="muted">…and ${list.length - 400} more. Search to narrow it down.</span>` : '') + (!list.length ? '<span class="muted">No songs match.</span>' : '');
  }
  function toggleSong(s, on) {
    if (on) { $('#songText').value = rawLines().filter((l) => key(splitLine(l).label) !== key(s)).join('\n'); updateCounts(); window.renderLibSongs?.(); renderMine(); }
    else addLines([s]);
  }
  async function forget(keys) {
    for (const k of keys) { mine.delete(k); files.delete(k); }
    try { await store('readwrite', (os) => { for (const k of keys) os.delete(k); }); } catch {}
    musicChanged();
  }
  $('#mineSongs').onclick = (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { e.stopPropagation(); const r = mine.get(d.dataset.del); if (r && confirm(`Remove "${r.label}" from My music on this computer?`)) forget([r.key]); return; }
    const b = e.target.closest('[data-song]'); if (b) toggleSong(b.dataset.song, b.classList.contains('on'));
  };
  $('#mineSearch').oninput = renderMine;
  $('#mineAll').onclick = () => { const n = addLines([...mine.values()].map((r) => r.label)); flash(`Added ${n} songs.`); };
  $('#mineRandom').onclick = () => {
    const have = inList();
    const left = shuffled([...mine.values()].filter((r) => !have.has(r.key)).map((r) => r.label));
    const n = addLines(left.slice(0, +$('#mineN').value));
    flash(n ? `Added ${n} random songs from My music.` : 'All of your songs are already in this game.');
  };
  $('#mineForget').onclick = () => { if (confirm(`Remove all ${mine.size} songs from My music on this computer? Your original files aren't touched.`)) forget([...mine.keys()]); };
  const shuffled = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inList = () => new Set(lines().map(key));

  (async () => {
    try {
      const recs = await store('readonly', (os) => os.getAll());
      for (const r of recs || []) register(r, r.blob);
      musicChanged();
    } catch { storageOk = false; renderMine(); }
  })();

  $('#addFiles').onclick = () => $('#fileIn').click();
  $('#addFolder').onclick = () => $('#folderIn').click();
  $('#fileIn').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  $('#folderIn').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault(); dz.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => {
    if (t === 'dragleave' && e.relatedTarget) return;
    dz.classList.remove('over');
  }));
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    const fl = [...e.dataTransfer.files];
    const lists = fl.filter((f) => /\.(csv|m3u8?|txt)$/i.test(f.name));
    for (const f of lists) importText(await f.text(), f.name);
    addFiles(fl);
  });

  // ---------- playlist import ----------
  function parseCsvLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  }
  function importText(text, name = '') {
    const rows = text.replace(/^﻿/, '').split(/\r?\n/);
    let songs = [];
    if (/\.m3u8?$/i.test(name) || rows[0]?.startsWith('#EXTM3U')) {
      songs = rows.filter((r) => r.startsWith('#EXTINF')).map((r) => r.replace(/^#EXTINF:[^,]*,/, '').trim());
      if (!songs.length) songs = rows.filter((r) => r && !r.startsWith('#')).map((r) => fromName(r.split(/[\\/]/).pop()));
    } else if (/\.csv$/i.test(name) || /,/.test(rows[0] || '') && /(track|title|song|name)/i.test(rows[0] || '')) {
      const head = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
      const ti = head.findIndex((h) => /^(track name|title|song|track|name|song name)$/.test(h));
      const ai = head.findIndex((h) => /^(artist name\(s\)|artist name|artist|artists)$/.test(h));
      songs = rows.slice(1).filter(Boolean).map((r) => {
        const c = parseCsvLine(r);
        const t = (c[ti] || '').trim(), a = (c[ai] || '').split(/[,;]/)[0].trim();
        return t ? (a ? `${a} - ${t}` : t) : '';
      });
    } else songs = rows;
    const n = addLines(songs.filter(Boolean));
    flash(`Added ${n} songs${name ? ` from ${name}` : ''}.`);
  }
  $('#importFile').onclick = () => $('#listIn').click();
  $('#listIn').onchange = async (e) => { const f = e.target.files[0]; if (f) importText(await f.text(), f.name); e.target.value = ''; };
  $('#importPlaylist').onclick = async () => {
    const url = $('#playlistUrl').value.trim();
    if (!url) return $('#playlistUrl').focus();
    const btn = $('#importPlaylist'); btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const r = await fetch('/api/playlist?url=' + encodeURIComponent(url)).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      const n = addLines(r.songs);
      flash(`Added ${n} songs from "${r.name || 'your playlist'}".${r.note ? ' ' + r.note : ''}`);
      $('#playlistUrl').value = '';
    } catch (err) {
      $('#err').textContent = err.message || "Couldn't import that playlist.";
    } finally { btn.disabled = false; btn.textContent = 'Import titles'; }
  };
  function flash(msg) { $('#err').textContent = ''; $('#songCount').textContent = msg; setTimeout(updateCounts, 4000); }

  // ---------- playback ----------
  const audio = new Audio();
  audio.preload = 'auto';
  let playing = null; // { id, label, start, end }
  let lastCalled = null;
  let autoTimer = null;
  let fadeTimer = null;
  let winnersSeen = 0;
  let url = null;
  let vol = 1;
  let seen = false;

  const game = () => (state?.game?.type === 'bingo' && state.game.mode === 'music' ? state.game : null);
  const itemFile = (it) => fileFor(it.label);
  const ytMap = new Map(); // key -> YouTube id, from the playlist ideas
  const badYt = new Set();
  const ytFor = (label) => {
    const k = key(label);
    const own = rawLines().map(splitLine).find((x) => x.yt && key(x.label) === k)?.yt;
    const id = own || ytMap.get(k) || null;
    return id && !badYt.has(id) ? id : null;
  };
  window.musicYtFor = ytFor;
  const canPlay = (it) => !!(itemFile(it) || ytFor(it.label));

  // YouTube player: in a pop-out window on the DJ's screen (crowd never sees titles) or on the big screen.
  const audience = () => (state?.game?.type === 'bingo' && state.game.audience) || $('#audience').value;
  // Video views put the player on the big screen; otherwise it plays in the pop-out window on the DJ's screen.
  const ytWhere = () => (['video', 'both'].includes(audience()) ? 'screen' : 'popout');
  let lastWhere = null;
  window.musicAudienceChanged = (view) => {
    $('#audience').value = view; saveSettings();
    // Move a playing video to its new place, carrying on from the same point.
    setTimeout(() => {
      const where = ytWhere();
      if (playing?.kind === 'yt' && lastWhere && where !== lastWhere) {
        if (lastWhere === 'screen') { screenCore?.stop(); showScreen(false); } else ch?.postMessage({ cmd: 'stop' });
        if (where === 'popout' && !popupAlive) { $('#err').textContent = 'Open the player window to keep the music going.'; playing = null; renderNow(); return; }
        yt('play', { id: playing.yt, mode: 'resume', at: ytTime.cur || 0, end: playing.end, label: playing.label });
      }
      lastWhere = where; renderCap(); renderNow();
    }, 150);
  };
  function renderCap() {
    const cap = $('#ytScreenCap'); const g = state?.game; if (!cap || !g || g.type !== 'bingo') return;
    const both = g.audience === 'both';
    cap.classList.toggle('board', both);
    cap.innerHTML = both ? window.songBoard(g, 16) : `♪ Song ${g.called.length}: listen carefully… find it on your card!`;
  }
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('cg-yt') : null;
  let popupAlive = false, popupWin = null, ytPlaying = false, ytTime = { cur: 0, dur: 0 }, screenCore = null;
  ch?.addEventListener('message', ({ data: e }) => { if (e.type === 'pong') { popupAlive = true; renderNow(); } else if (e.type === 'closed') { popupAlive = false; renderNow(); } else onYt(e); });
  ch?.postMessage({ cmd: 'ping' });
  function openPlayer() {
    popupWin = window.open('/yt-player', 'cg-yt-player', 'width=560,height=380');
    if (!popupWin) $('#err').textContent = 'Your browser blocked the player window. Allow pop-ups for this site and try again.';
  }
  function yt(cmd, extra = {}) {
    if (cmd === 'play') lastWhere = ytWhere();
    if (ytWhere() === 'screen') {
      if (!screenCore) screenCore = new YTCore($('#ytScreenPlayer'), onYt);
      if (cmd === 'play') { showScreen(true); renderCap(); screenCore.play(extra); }
      if (cmd === 'pause') screenCore.pause();
      if (cmd === 'resume') screenCore.resume();
      if (cmd === 'stop') { screenCore.stop(); showScreen(false); }
      if (cmd === 'volume') screenCore.volume(extra.v);
    } else {
      ch?.postMessage({ cmd, ...extra });
      if (cmd === 'stop' && screenCore) { screenCore.stop(); showScreen(false); }
    }
  }
  new ResizeObserver(() => { if (!$('#ytScreen').hidden) showScreen(true); }).observe($('#stage'));
  function showScreen(on) {
    const box = $('#ytScreen'); if (!box) return;
    if (on) {
      const r = $('#stage').getBoundingClientRect();
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    }
    box.hidden = !on;
  }
  function onYt(e) {
    if (!playing || playing.kind !== 'yt' || (e.id && e.id !== playing.yt)) return;
    if (e.type === 'start') { playing.start = e.start; playing.end = e.end; playing.finding = false; renderNow(); }
    if (e.type === 'time') { ytTime = e; renderProgress(); }
    if (e.type === 'state') { ytPlaying = e.playing; renderNow(); }
    if (e.type === 'ended') { ytPlaying = false; if (ytWhere() === 'screen') showScreen(false); songEnded(); }
    if (e.type === 'error') {
      badYt.add(playing.yt); ytPlaying = false; showScreen(false);
      $('#err').textContent = `YouTube won't play "${playing.label}" here. Skipping it.`;
      playing = null; renderNow();
      if (settings().auto) autoTimer = setTimeout(() => window.musicNext(), 1500);
    }
  }
  window.musicAudio = audio; // handy for debugging
  window.musicHasFile = (label) => !!fileFor(label);
  window.musicCanPlay = () => !!game() && settings().mode !== 'none' && game().items.some(canPlay);
  window.musicNext = () => {
    const g = game(); if (!g) return;
    const called = new Set(g.called);
    // Prefer songs we can actually play.
    const pool = g.items.filter((i) => !called.has(i.id) && (settings().mode === 'none' || canPlay(i)));
    const any = pool.length ? pool : g.items.filter((i) => !called.has(i.id));
    if (!any.length) return stopAuto('Every song has been called.');
    send('host:call', { id: any[Math.floor(Math.random() * any.length)].id });
  };

  // Find the loudest stretch in the middle of the track: usually the chorus.
  async function chorusStart(file, len) {
    try {
      if (file.size > 60e6) throw 0;
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = await new Ctx(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
      const ch = buf.getChannelData(0), sr = buf.sampleRate, dur = buf.duration;
      if (dur <= len + 10) return 0;
      const secs = Math.floor(dur), rms = new Float32Array(secs);
      for (let s = 0; s < secs; s++) {
        let sum = 0; const a = s * sr, step = 64;
        for (let j = 0; j < sr; j += step) { const v = ch[a + j] || 0; sum += v * v; }
        rms[s] = Math.sqrt(sum / (sr / step));
      }
      const lo = Math.floor(dur * 0.15), hi = Math.min(secs - len, Math.floor(dur * 0.75));
      let best = lo, bestV = -1, win = 0;
      for (let s = lo; s < lo + len; s++) win += rms[s] || 0;
      for (let s = lo; s <= hi; s++) {
        if (win > bestV) { bestV = win; best = s; }
        win += (rms[s + len] || 0) - (rms[s] || 0);
      }
      return Math.max(0, best - 2);
    } catch { return null; }
  }

  async function play(it) {
    const f = itemFile(it);
    const { mode, clip } = settings();
    clearTimeout(autoTimer); clearInterval(fadeTimer);
    const ytId = !f && ytFor(it.label);
    if ((!f && !ytId) || mode === 'none') { audio.pause(); if (playing?.kind === 'yt') yt('stop'); playing = null; renderNow(); return; }
    if (ytId) {
      audio.pause();
      if (ytWhere() === 'popout' && !popupAlive) { $('#err').textContent = 'Open the player window first (the button in the DJ controls), then press Next song.'; playing = null; renderNow(); return; }
      playing = { id: it.id, label: it.label, start: 0, end: null, finding: mode === 'clip', kind: 'yt', yt: ytId };
      ytTime = { cur: 0, dur: 0 };
      yt('play', { id: ytId, mode, clip, label: it.label });
      renderNow();
      return;
    }
    if (playing?.kind === 'yt') yt('stop');
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    audio.src = url; audio.volume = vol;
    playing = { id: it.id, label: it.label, start: 0, end: null, finding: mode === 'clip' };
    renderNow();
    if (mode === 'clip') {
      await new Promise((r) => { audio.onloadedmetadata = r; audio.onerror = r; });
      let start = await chorusStart(f, clip);
      if (playing?.id !== it.id) return; // another song was called meanwhile
      if (start == null) start = Math.max(0, Math.floor((audio.duration || 0) / 3));
      playing.start = start; playing.end = start + clip; playing.finding = false;
      audio.currentTime = start;
    }
    try { await audio.play(); } catch { $('#err').textContent = 'Click anywhere on this screen once so the browser lets it play sound.'; }
    renderNow();
  }

  function fadeOut(then) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - 0.08);
      if (audio.volume <= 0) { clearInterval(fadeTimer); audio.pause(); audio.volume = vol; then?.(); }
    }, 100);
  }
  function songEnded() {
    renderNow();
    if (settings().auto && game()) autoTimer = setTimeout(() => window.musicNext(), 2500);
  }
  audio.addEventListener('timeupdate', () => {
    if (playing?.end && audio.currentTime >= playing.end - 1.2) {
      playing.end = null; fadeOut(songEnded);
    }
    renderProgress();
  });
  audio.addEventListener('ended', songEnded);
  audio.addEventListener('play', renderNow);
  audio.addEventListener('pause', renderNow);

  function stopAuto(msg) {
    clearTimeout(autoTimer);
    if ($('#autoCall').checked) { $('#autoCall').checked = false; saveSettings(); }
    if (msg) $('#err').textContent = msg;
    renderNow();
  }

  socket.on('state', () => {
    const g = game();
    if (!g) {
      if (playing) { if (playing.kind === 'yt') yt('stop'); else fadeOut(); playing = null; }
      lastCalled = null; seen = false; winnersSeen = 0; clearTimeout(autoTimer);
      return;
    }
    if (g.winners.length > winnersSeen) {
      winnersSeen = g.winners.length;
      if (settings().auto) stopAuto(`Bingo from ${g.winners.at(-1).name}! Auto-call paused: check their card, then press Next song.`);
    }
    if (!$('#ytScreen').hidden) renderCap();
    const last = g.called.at(-1) ?? null;
    if (!seen) { seen = true; lastCalled = last; renderNow(); return; } // first look at this game (or a reload mid-game): don't replay
    if (last !== lastCalled) {
      lastCalled = last;
      const it = g.items.find((i) => i.id === last);
      if (it) play(it); else { audio.pause(); if (playing?.kind === 'yt') yt('stop'); playing = null; }
    }
    renderNow();
  });

  // ---------- now playing bar ----------
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function renderProgress() {
    const el = $('#npBar'); if (!el || !playing) return;
    const cur = playing.kind === 'yt' ? ytTime.cur : audio.currentTime, dur = playing.kind === 'yt' ? ytTime.dur : audio.duration;
    const a = playing.end ? playing.start : 0, b = playing.end || dur || 1;
    el.style.width = `${Math.min(100, Math.max(0, ((cur - a) / (b - a)) * 100))}%`;
    const t = $('#npTime'); if (t) t.textContent = playing.end ? `${fmt(Math.max(0, playing.end - cur))} left` : `${fmt(cur)} / ${fmt(dur || 0)}`;
  }
  function renderNow() {
    const el = $('#nowPlaying');
    const g = game();
    if (!el) return;
    if (!g) { el.hidden = true; return; }
    if (isRemote) {
      el.hidden = false;
      el.innerHTML = `<div class="np-main"><button class="primary" data-np="remoteNext">⏭ Next song</button><span class="muted">Plays on the big screen if its music file is loaded there.</span></div>`;
      return;
    }
    const playable = g.items.filter(canPlay).length;
    const needsPopup = ytWhere() === 'popout' && !popupAlive && g.items.some((i) => !itemFile(i) && ytFor(i.label));
    el.hidden = false;
    if (!playable) {
      el.innerHTML = `<span class="muted">No music for these songs on this screen. Tap songs below as you play them from your decks, or</span>
        <button data-np="add">🎧 Add music files</button>`;
    } else {
      const s = settings();
      const paused = playing?.kind === 'yt' ? !ytPlaying : audio.paused;
      el.innerHTML = `
        <div class="np-main">
          ${needsPopup ? '<button class="secondary" data-np="popup">🪟 Open the player window</button>' : ''}
          <button class="primary" data-np="next">⏭ Next song <span class="muted">(space)</span></button>
          ${playing ? `<button data-np="toggle">${paused ? '▶ Play' : '⏸ Pause'}</button>` : ''}
          <div class="np-info">
            <div class="np-title">${playing ? (playing.finding ? (playing.kind === 'yt' ? 'Loading… ' : 'Finding the chorus… ') : playing.kind === 'yt' ? '▶ ' : '♪ ') + esc(playing.label) : `<span class="muted">${playable} of ${g.items.length} songs can play (♪ your files, ▶ YouTube). ${needsPopup ? 'Open the player window, then press Next song.' : 'Press Next song to start.'}</span>`}</div>
            ${playing ? `<div class="np-prog"><i id="npBar"></i></div>` : ''}
          </div>
          ${playing ? '<span class="muted" id="npTime"></span>' : ''}
        </div>
        <div class="np-opts">
          <select data-np="mode">${[['clip', 'Chorus clip'], ['full', 'Full song'], ['none', "Don't play"]].map(([v, t]) => `<option value="${v}" ${v === s.mode ? 'selected' : ''}>${t}</option>`).join('')}</select>
          ${s.mode === 'clip' ? `<select data-np="clip">${[20, 30, 45, 60].map((v) => `<option value="${v}" ${v === s.clip ? 'selected' : ''}>${v}s</option>`).join('')}</select>` : ''}
          <label><input type="checkbox" data-np="auto" ${s.auto ? 'checked' : ''} /> Auto-call</label>
          <input type="range" data-np="vol" min="0" max="1" step="0.05" value="${vol}" title="Volume" />
        </div>`;
      renderProgress();
    }
  }
  $('#nowPlaying').addEventListener('click', (e) => {
    const b = e.target.closest('[data-np]'); if (!b) return;
    const a = b.dataset.np;
    if (a === 'add') $('#fileIn').click();
    if (a === 'next') window.musicNext();
    if (a === 'remoteNext') send('host:call');
    if (a === 'popup') openPlayer();
    if (a === 'toggle') {
      clearTimeout(autoTimer);
      if (playing?.kind === 'yt') yt(ytPlaying ? 'pause' : 'resume');
      else audio.paused ? audio.play() : audio.pause();
    }
  });
  $('#nowPlaying').addEventListener('change', (e) => {
    const a = e.target.dataset.np;
    if (a === 'mode') { $('#playMode').value = e.target.value; if (e.target.value === 'none') { audio.pause(); if (playing?.kind === 'yt') yt('pause'); clearTimeout(autoTimer); } }
    if (a === 'clip') $('#clipLen').value = e.target.value;
    if (a === 'auto') { $('#autoCall').checked = e.target.checked; if (e.target.checked && (!playing || audio.paused)) window.musicNext(); }
    saveSettings(); renderNow();
  });
  $('#nowPlaying').addEventListener('input', (e) => {
    if (e.target.dataset.np === 'vol') { vol = +e.target.value; audio.volume = vol; yt('volume', { v: vol }); }
  });

  // ---------- shared song library ----------
  let library = [];
  const selected = new Set();
  const pool = () => {
    const packs = selected.size ? library.filter((p) => selected.has(p.id)) : library;
    const seen = new Set();
    const owned = $('#libOwned').checked;
    return packs.flatMap((p) => p.songs).filter((s) => !seen.has(key(s)) && seen.add(key(s)) && (!owned || fileFor(s) || ytFor(s)));
  };
  function renderLibrary() {
    $('#libPacks').innerHTML = library.map((p) => `<button data-pack="${p.id}" class="${selected.has(p.id) ? 'on' : ''}">${p.emoji} ${esc(p.name)} <span class="muted">${p.songs.length}</span></button>`).join('');
    const names = library.filter((p) => selected.has(p.id)).map((p) => p.name);
    $('#libRandomHint').textContent = `random songs from ${names.length ? names.join(', ') : 'all playlists'}`;
    $('#libAddAll').hidden = !selected.size;
    renderLibSongs();
  }
  function renderLibSongs() {
    const q = key($('#libSearch').value);
    const have = inList();
    const list = pool().filter((s) => !q || key(s).includes(q));
    $('#libSongs').innerHTML = list.slice(0, 300).map((s) => {
      const on = have.has(key(s));
      return `<button data-song="${esc(s)}" class="${on ? 'on' : ''}" title="${on ? 'Remove from this game' : 'Add to this game'}">${on ? '✓' : '+'} ${fileFor(s) ? '♪ ' : ytFor(s) ? '▶ ' : ''}${esc(s)}</button>`;
    }).join('') + (list.length > 300 ? `<span class="muted">…and ${list.length - 300} more. Search to narrow it down.</span>` : '') + (!list.length ? '<span class="muted">No songs match.</span>' : '');
  }
  window.renderLibSongs = renderLibSongs;
  $('#libPacks').onclick = (e) => {
    const b = e.target.closest('[data-pack]'); if (!b) return;
    selected.has(b.dataset.pack) ? selected.delete(b.dataset.pack) : selected.add(b.dataset.pack);
    renderLibrary();
  };
  $('#libSongs').onclick = (e) => {
    const b = e.target.closest('[data-song]'); if (!b) return;
    const s = b.dataset.song;
    toggleSong(s, b.classList.contains('on'));
  };
  $('#libSearch').oninput = renderLibSongs;
  $('#libOwned').onchange = renderLibSongs;
  $('#libAddAll').onclick = () => { const n = addLines(pool()); flash(`Added ${n} songs.`); renderLibSongs(); };
  $('#libRandom').onclick = () => {
    const have = inList();
    const left = pool().filter((s) => !have.has(key(s)));
    const n = addLines(shuffled(left).slice(0, +$('#libN').value));
    flash(n ? `Added ${n} random songs.` : 'Every song from those playlists is already in the list.');
    renderLibSongs();
  };
  $('#songText').addEventListener('input', () => { renderLibSongs(); renderMine(); });
  fetch('/api/music-library').then((r) => r.json()).then((d) => {
    library = Array.isArray(d) ? d : d.playlists || [];
    for (const [label, id] of Object.entries(d.yt || {})) ytMap.set(key(label), id);
    renderLibrary(); updateCounts(); window.renderSongPick?.();
  }).catch(() => { $('#library').hidden = true; });

  updateCounts();
})();
