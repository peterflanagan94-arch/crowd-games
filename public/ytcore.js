/* Thin wrapper around the YouTube IFrame Player used by music bingo (host page and pop-out window).
   The player is always shown in full and never covered: YouTube's rules don't allow overlays. */
(() => {
  let apiReady = null;
  const loadApi = () => (apiReady ||= new Promise((res) => {
    if (window.YT?.Player) return res();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }));

  class YTCore {
    constructor(el, onEvent) {
      this.el = el; this.onEvent = onEvent; this.player = null; this.want = null; this.vol = 100; this.timer = null; this.fading = null;
    }
    async ensure() {
      await loadApi();
      if (this.player) return this.player;
      await new Promise((res) => {
        this.player = new YT.Player(this.el, {
          width: '100%', height: '100%',
          playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
          events: {
            onReady: res,
            onStateChange: (e) => this.state(e.data),
            onError: (e) => this.onEvent({ type: 'error', code: e.data, id: this.want?.id }),
          },
        });
      });
      return this.player;
    }
    async play({ id, mode, clip, at, end }) {
      const p = await this.ensure();
      clearInterval(this.fading); this.fading = null;
      this.want = { id, mode, clip, start: 0, end: null, placed: false, at, endAt: end };
      p.setVolume(this.vol);
      p.loadVideoById({ videoId: id });
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
    }
    state(s) {
      const w = this.want; if (!w) return;
      if (s === YT.PlayerState.PLAYING && !w.placed) {
        w.placed = true;
        const dur = this.player.getDuration() || 0;
        if (w.mode === 'resume') {
          w.start = w.at || 0; w.end = w.endAt || null;
          if (w.at) this.player.seekTo(w.at, true);
        } else if (w.mode === 'clip' && dur > w.clip + 20) {
          w.start = Math.round(Math.min(dur - w.clip - 5, Math.max(25, dur * 0.35)));
          w.end = w.start + w.clip;
          this.player.seekTo(w.start, true);
        }
        this.onEvent({ type: 'start', id: w.id, start: w.start, end: w.end, dur });
      }
      if (s === YT.PlayerState.ENDED) this.finish();
      this.onEvent({ type: 'state', playing: s === YT.PlayerState.PLAYING, id: w.id });
    }
    tick() {
      const w = this.want, p = this.player; if (!w || !p?.getCurrentTime) return;
      const cur = p.getCurrentTime(), dur = p.getDuration();
      this.onEvent({ type: 'time', id: w.id, cur, dur, start: w.start, end: w.end });
      if (w.end && cur >= w.end - 1.5 && !this.fading) this.fadeOut(() => this.finish());
    }
    fadeOut(then) {
      let v = this.vol;
      clearInterval(this.fading);
      this.fading = setInterval(() => {
        v -= 8; this.player.setVolume(Math.max(0, v));
        if (v <= 0) { clearInterval(this.fading); this.fading = null; this.player.pauseVideo(); this.player.setVolume(this.vol); then?.(); }
      }, 100);
    }
    finish() {
      const w = this.want; if (!w) return;
      clearInterval(this.timer); this.want = null;
      this.onEvent({ type: 'ended', id: w.id });
    }
    pause() { this.player?.pauseVideo(); }
    resume() { this.player?.playVideo(); }
    stop() { clearInterval(this.timer); clearInterval(this.fading); this.fading = null; this.want = null; this.player?.stopVideo(); }
    volume(v) { this.vol = Math.round(v * 100); this.player?.setVolume(this.vol); }
  }
  window.YTCore = YTCore;
})();
