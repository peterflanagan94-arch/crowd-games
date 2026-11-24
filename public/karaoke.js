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

  // Zoom Karaoke lets its videos play on other sites, so look there first; "any channel" is the fallback.
  const ytSearch = (song) => `https://www.youtube.com/@ZoomKaraokeOfficial/search?query=${encodeURIComponent(song.replace(/\s+-\s+/, ' '))}`;
  const ytSearchAll = (song) => `https://www.youtube.com/results?search_query=${encodeURIComponent(song + ' karaoke')}`;
  const finds = (song, label) => `<a href="${ytSearch(song)}" target="_blank" rel="noopener" title="Search Zoom Karaoke's channel: their videos play here">🔍 ${label} on Zoom Karaoke</a> <a href="${ytSearchAll(song)}" target="_blank" rel="noopener" class="muted" title="Search every YouTube channel">or anywhere</a>`;
  const k = (act, d = {}) => send('host:karaoke', { act, ...d });

  // ---------- DJ queue manager ----------
  // In-app video search needs YOUTUBE_API_KEY on the server; without it the find links open YouTube.
  let canSearch = false, lastG = null;
  let search = null; // { id, q, scope: 'zoom' | 'all', results, msg, busy }
  fetch('/api/karaoke-search?q=').then((r) => r.json()).then((j) => { canSearch = !j.error; if (lastG) window.karaokeQueue(lastG, true); }, () => {});
  const SEARCH_MSG = { nokey: 'Search needs a YouTube API key on the server.', quota: "Today's YouTube searches are used up. Use the links to search on YouTube instead.", failed: "YouTube search didn't work just now. Try again." };
  async function runSearch() {
    const s = search; if (!s) return;
    s.busy = true; s.msg = ''; window.karaokeQueue(lastG, true);
    try {
      const j = await fetch(`/api/karaoke-search?scope=${s.scope}&q=${encodeURIComponent(s.q)}`).then((r) => r.json());
      if (search !== s) return;
      s.results = j.results || []; s.msg = j.error ? SEARCH_MSG[j.error] || SEARCH_MSG.failed : s.results.length ? '' : s.scope === 'zoom' ? 'Nothing on Zoom Karaoke for that. Try All channels.' : 'No videos found.';
    } catch { s.msg = SEARCH_MSG.failed; }
    s.busy = false; window.karaokeQueue(lastG, true);
  }
  const findBtn = (label) => canSearch ? `<button class="kq-find" data-k="search" title="Search for a lyrics video, Zoom Karaoke first">🔎 ${label}</button>` : '';
  const searchPanel = (e) => {
    const s = search;
    return `<div class="kq-search" data-id="${e.id}">
      <form class="bar"><input class="kq-q" value="${esc(s.q)}" placeholder="Artist and song" />
        <button class="${s.scope === 'zoom' ? 'primary' : ''}" data-scope="zoom" title="Zoom Karaoke's videos are allowed to play here">Zoom Karaoke</button>
        <button class="${s.scope === 'all' ? 'primary' : ''}" data-scope="all">All channels</button>
        <button type="button" data-close title="Close">✕</button></form>
      ${s.busy ? '<div class="muted">Searching…</div>' : s.msg ? `<div class="muted">${esc(s.msg)}</div>` : ''}
      ${!s.busy && s.results?.length ? `<div class="kq-results">${s.results.map((v) => `<div class="kq-res">
        ${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" />` : '<span></span>'}
        <span class="kq-who"><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" title="Watch on YouTube">${esc(v.title)}</a><small>${esc(v.by)}</small></span>
        <button class="primary" data-use="${esc(v.id)}">${e.yt === v.id ? '✓ Linked' : 'Use this'}</button></div>`).join('')}</div>` : ''}
    </div>`;
  };
  window.karaokeQueue = (g, force) => {
    lastG = g;
    const row = (e, i, now) => `<div class="kq-row ${now ? 'now' : ''}" data-id="${e.id}">
      <span class="kq-n">${now ? '🎤' : i + 1}</span>
      <span class="kq-who"><b>${esc(e.singer)}</b><small>${esc(e.song)}</small></span>
      <span class="kq-yt">${e.yt && e.ytStatus === 'blocked' ? `<span class="bad" title="The channel doesn't allow this video to play on other sites">⚠ won't play here</span> ${findBtn('Find another') || finds(e.song, 'Find another')}`
          : e.yt && e.ytStatus === 'missing' ? `<span class="bad">⚠ video not found</span> ${findBtn('Find another') || finds(e.song, 'Find another')}`
          : e.yt ? `<span class="ok" title="Lyrics video linked">▶ video${e.ytStatus === 'ok' ? ' ✓' : ''}${e.ytBy ? ` <small class="muted">${esc(e.ytBy)}</small>` : ''}</span>${canSearch ? '<button class="kq-find" data-k="search" title="Search for a different video">🔎</button>' : ''}`
          : findBtn('Find video') || finds(e.song, 'Find video')}
        <input class="kq-link" placeholder="${e.yt ? 'Change link' : 'Paste YouTube link'}" /></span>
      ${now ? '' : `<span class="kq-btns"><button data-k="top" title="Move to the front">⤒</button><button data-k="up" title="Up">▲</button><button data-k="down" title="Down">▼</button><button data-k="remove" title="Remove">✕</button></span>`}
    </div>${search?.id === e.id ? searchPanel(e) : ''}`;
    const el = $('#kQueue');
    if (!force && el.contains(document.activeElement) && document.activeElement.value) return; // don't wipe a link being typed
    const all = [g.current, ...g.queue].filter(Boolean);
    if (search && !all.some((e) => e.id === search.id)) search = null; // that singer has gone
    el.innerHTML = (g.current ? row(g.current, -1, true) : '') +
      (g.queue.length ? g.queue.map((e, i) => row(e, i, false)).join('') : `<div class="muted">Nobody waiting. Guests sign up on their phones${g.open ? '' : ' (sign-ups are closed)'}, or add someone below.</div>`);
    el.querySelectorAll('.kq-row').forEach((r) => {
      const id = r.dataset.id;
      r.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.k;
        if (a === 'search') {
          const e = all.find((x) => x.id === id);
          search = search?.id === id ? null : { id, q: e.song.replace(/\s+-\s+/, ' '), scope: 'zoom', results: null, msg: '' };
          if (search) runSearch(); else window.karaokeQueue(lastG, true);
        } else if (a === 'remove') k('remove', { id });
        else if (a === 'top') k('top', { id });
        else k('move', { id, dir: a === 'up' ? -1 : 1 });
      }));
      const inp = r.querySelector('.kq-link');
      inp.onchange = () => k('link', { id, link: inp.value.trim() });
    });
    const sp = el.querySelector('.kq-search');
    if (sp) {
      const form = sp.querySelector('form');
      let scope = search.scope;
      form.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => { scope = b.dataset.scope; }));
      form.onsubmit = (ev) => { ev.preventDefault(); search.q = form.querySelector('.kq-q').value.trim() || search.q; search.scope = scope; runSearch(); };
      form.querySelector('[data-close]').onclick = () => { search = null; window.karaokeQueue(lastG, true); };
      sp.querySelectorAll('[data-use]').forEach((b) => (b.onclick = () => { k('link', { id: sp.dataset.id, link: b.dataset.use }); search = null; window.karaokeQueue(lastG, true); }));
    }
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

  // ---------- lyrics video ----------
  // Plays on the big screen: the audience window when one is open, otherwise the main host
  // screen. The phone remote just sends commands.
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
      const text = "YouTube won't play that video here (the owner may have blocked embedding). Try another link.";
      $('#err').textContent = text;
      if (isScreen) secondScreen.post({ type: 'err', text });
    }
  }
  function sync() {
    const g = state?.game;
    if (isRemote) return;
    const here = isScreen || !secondScreen.alive;
    const want = here && g?.type === 'karaoke' && g.video && g.current?.yt ? g.current : null;
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
  secondScreen.on(() => setTimeout(sync, 0));
  new ResizeObserver(() => !box.hidden && place()).observe($('#stage'));
  window.addEventListener('resize', () => !box.hidden && place());
})();
