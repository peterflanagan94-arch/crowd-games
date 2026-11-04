/* Karaoke on the host screen: the queue manager in the DJ drawer, the big-screen
   "now singing / up next" board, and the lyrics video player. Uses host.js globals. */
(() => {
  let lists = {};
  fetch('/karaoke-songs.json').then((r) => r.json()).then((l) => {
    lists = l;
    const all = Object.values(l).flat();
    $('#kSongList').innerHTML = all.map((s) => `<option value="${esc(s)}">`).join('');
    $('#kIdeasBody').innerHTML = Object.entries(l).map(([k, songs]) =>
      `<div class="kidea"><b>${esc(k)}</b><ol>${songs.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`).join('');
  });

  $('#startKaraoke').onclick = () => {
    const d = { title: $('#kTitle').value, perGuest: +$('#kPer').value };
    store.set('cg-karaoke', d);
    send('host:startKaraoke', d);
  };
  const saved = store.get('cg-karaoke');
  if (saved) { $('#kTitle').value = saved.title || ''; $('#kPer').value = String(saved.perGuest || 1); }

  $('#kAdd').onsubmit = (e) => {
    e.preventDefault();
    send('host:karaoke', { act: 'add', singer: $('#kAddSinger').value, song: $('#kAddSong').value, link: $('#kAddLink').value });
    $('#kAddSinger').value = $('#kAddSong').value = $('#kAddLink').value = '';
  };

  const ytSearch = (song) => `https://www.youtube.com/results?search_query=${encodeURIComponent(song + ' karaoke')}`;
  const k = (act, d = {}) => send('host:karaoke', { act, ...d });

  // ---------- DJ queue manager ----------
  window.karaokeQueue = (g) => {
    const row = (e, i, now) => `<div class="kq-row ${now ? 'now' : ''}" data-id="${e.id}">
      <span class="kq-n">${now ? '🎤' : i + 1}</span>
      <span class="kq-who"><b>${esc(e.singer)}</b><small>${esc(e.song)}</small></span>
      <span class="kq-yt">${e.yt ? '<span class="ok" title="Lyrics video linked">▶ video</span>' : `<a href="${ytSearch(e.song)}" target="_blank" rel="noopener">🔍 Find video</a>`}
        <input class="kq-link" placeholder="${e.yt ? 'Change link' : 'Paste YouTube link'}" /></span>
      ${now ? '' : `<span class="kq-btns"><button data-k="top" title="Move to the front">⤒</button><button data-k="up" title="Up">▲</button><button data-k="down" title="Down">▼</button><button data-k="remove" title="Remove">✕</button></span>`}
    </div>`;
    const el = $('#kQueue');
    if (el.contains(document.activeElement) && document.activeElement.value) return; // don't wipe a link being typed
    el.innerHTML = (g.current ? row(g.current, -1, true) : '') +
      (g.queue.length ? g.queue.map((e, i) => row(e, i, false)).join('') : `<div class="muted">Nobody waiting. Guests sign up on their phones${g.open ? '' : ' (sign-ups are closed)'}, or add someone below.</div>`);
    el.querySelectorAll('.kq-row').forEach((r) => {
      const id = r.dataset.id;
      r.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.k;
        if (a === 'remove') k('remove', { id });
        else if (a === 'top') k('top', { id });
        else k('move', { id, dir: a === 'up' ? -1 : 1 });
      }));
      const inp = r.querySelector('.kq-link');
      inp.onchange = () => k('link', { id, link: inp.value.trim() });
    });
  };

  // ---------- big screen ----------
  window.karaokeStage = (st, g) => {
    const next = g.queue.slice(0, 6);
    st.innerHTML = `<div class="kstage">
      <div class="kmain">
        <div class="qhead">🎤 ${esc(g.title)}</div>
        ${g.current
          ? `<div class="klabel">Now singing</div><div class="ksinger">${esc(g.current.singer)}</div><div class="ksong">${esc(g.current.song)}</div>`
          : `<div class="ksinger">${g.queue.length ? 'Get ready…' : 'Who\'s first?'}</div><div class="ksong">Scan the code and pick your song!</div>`}
      </div>
      <div class="kside">
        <div class="klabel">Up next</div>
        ${next.length ? `<ol class="knext">${next.map((e) => `<li><b>${esc(e.singer)}</b><small>${esc(e.song)}</small></li>`).join('')}</ol>` : '<div class="muted">Nobody in the queue yet</div>'}
        ${g.queue.length > next.length ? `<div class="muted">+ ${g.queue.length - next.length} more</div>` : ''}
        ${g.open ? `<div class="ksign"><div class="kqr">${joinInfo?.svg || ''}</div><div><b>Want to sing?</b><br><span class="muted">Scan, then tap <b>Sign up</b></span></div></div>` : ''}
      </div>
    </div>`;
  };

  // ---------- lyrics video (main host screen only; the phone remote just sends commands) ----------
  let core = null, playingId = null;
  const box = $('#kScreen');
  function place() {
    const r = $('#stage').getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  function stop() {
    if (playingId) core?.stop();
    playingId = null; box.hidden = true;
  }
  function onYt(e) {
    if (e.type === 'ended') { stop(); send('host:karaoke', { act: 'video', on: false }); }
    if (e.type === 'error') {
      stop(); send('host:karaoke', { act: 'video', on: false });
      $('#err').textContent = "YouTube won't play that video here (the owner may have blocked embedding). Try another link.";
    }
  }
  function sync() {
    const g = state?.game;
    if (isRemote) return;
    const want = g?.type === 'karaoke' && g.video && g.current?.yt ? g.current : null;
    if (!want) return stop();
    const nextUp = g.queue[0];
    $('#kCap').innerHTML = `🎤 <b>${esc(want.singer)}</b> · ${esc(want.song)}${nextUp ? ` <span class="muted">· Next up: ${esc(nextUp.singer)}</span>` : ''}`;
    place();
    box.hidden = false;
    const id = `${want.id}:${want.yt}`;
    if (playingId === id) return;
    playingId = id;
    core ||= new YTCore($('#kPlayer'), onYt);
    core.play({ id: want.yt, mode: 'full' });
  }
  socket.on('state', () => setTimeout(sync, 0));
  new ResizeObserver(() => !box.hidden && place()).observe($('#stage'));
  window.addEventListener('resize', () => !box.hidden && place());
})();
