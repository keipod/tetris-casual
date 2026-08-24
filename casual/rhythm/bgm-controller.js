/*! RhythmBgm — HTMLAudio BGM that stays independent of hit/miss judgments.
 *  Web Audio BufferSource after async await often stays silent on mobile;
 *  HTMLAudio primed in a user gesture keeps the track playing through gaps/misses.
 */
(function (root) {
  "use strict";

  /**
   * @param {{ AudioCtor?: typeof Audio }} [opts]
   */
  function createBgmController(opts) {
    const AudioCtor = (opts && opts.AudioCtor) || root.Audio;
    let el = null;
    let srcUrl = "";
    let primed = false;

    function stop() {
      if (!el) return;
      try {
        el.pause();
      } catch (_) {}
      try {
        el.currentTime = 0;
      } catch (_) {}
    }

    function dispose() {
      stop();
      el = null;
      srcUrl = "";
      primed = false;
    }

    /** Call synchronously inside a click/tap handler before any await. */
    function prime(url) {
      if (!url || !AudioCtor) return;
      if (!el || srcUrl !== url) {
        el = new AudioCtor(url);
        el.preload = "auto";
        el.loop = false;
        srcUrl = url;
        primed = false;
      }
      const wasMuted = el.muted;
      el.muted = true;
      let p;
      try {
        p = el.play();
      } catch (_) {
        el.muted = wasMuted;
        return;
      }
      if (p && typeof p.then === "function") {
        p.then(function () {
          try {
            el.pause();
            el.currentTime = 0;
          } catch (_) {}
          el.muted = wasMuted;
          primed = true;
        }).catch(function () {
          el.muted = wasMuted;
        });
      } else {
        try {
          el.pause();
          el.currentTime = 0;
        } catch (_) {}
        el.muted = wasMuted;
        primed = true;
      }
    }

    function attach(url) {
      if (!url || !AudioCtor) {
        dispose();
        return null;
      }
      if (el && srcUrl === url) return el;
      dispose();
      el = new AudioCtor(url);
      el.preload = "auto";
      el.loop = false;
      srcUrl = url;
      primed = false;
      try {
        el.load();
      } catch (_) {}
      return el;
    }

    function whenReady(timeoutMs) {
      if (!el) return Promise.reject(new Error("BGM missing"));
      if (el.readyState >= 3) return Promise.resolve(el);
      const ms = timeoutMs == null ? 20000 : timeoutMs;
      return new Promise(function (resolve, reject) {
        let done = false;
        const finish = function (fn, arg) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.removeEventListener("canplaythrough", onReady);
          el.removeEventListener("error", onErr);
          fn(arg);
        };
        const onReady = function () {
          finish(resolve, el);
        };
        const onErr = function () {
          finish(reject, new Error("BGM load failed"));
        };
        const timer = setTimeout(function () {
          finish(reject, new Error("BGM load timeout"));
        }, ms);
        el.addEventListener("canplaythrough", onReady);
        el.addEventListener("error", onErr);
        try {
          el.load();
        } catch (_) {}
      });
    }

    function start(offsetSec, volume) {
      if (!el) return Promise.resolve(false);
      const off = Math.max(0, offsetSec || 0);
      try {
        if (Math.abs(el.currentTime - off) > 0.05) el.currentTime = off;
      } catch (_) {}
      el.volume = Math.max(0, Math.min(1, volume == null ? 0.85 : volume));
      el.muted = false;
      let p;
      try {
        p = el.play();
      } catch (_) {
        return Promise.resolve(false);
      }
      if (p && typeof p.then === "function") {
        return p.then(function () {
          return true;
        }).catch(function () {
          return false;
        });
      }
      return Promise.resolve(true);
    }

    function pause() {
      if (!el) return 0;
      const t = el.currentTime || 0;
      try {
        el.pause();
      } catch (_) {}
      return t;
    }

    function setVolume(v) {
      if (!el) return;
      el.volume = Math.max(0, Math.min(1, v));
    }

    /** Song clock in ms. Returns null if BGM element is not the clock source. */
    function songTimeMs() {
      if (!el || el.paused) return null;
      return (el.currentTime || 0) * 1000;
    }

    function getElement() {
      return el;
    }

    function isPrimed() {
      return primed;
    }

    /** Miss/hit must never stop BGM — exposed for tests and callers. */
    function onMiss() {
      /* intentionally empty: judgment SFX must not pause/stop the track */
    }

    return {
      prime: prime,
      attach: attach,
      whenReady: whenReady,
      start: start,
      pause: pause,
      stop: stop,
      dispose: dispose,
      setVolume: setVolume,
      songTimeMs: songTimeMs,
      getElement: getElement,
      isPrimed: isPrimed,
      onMiss: onMiss,
    };
  }

  function computeGameEndMs(durationMs, lastNoteMs) {
    const last = lastNoteMs || 0;
    const graceEnd = last + 2200;
    const dur = durationMs || graceEnd;
    // Prefer full track window; still allow a short tail after the last note.
    return Math.max(dur, graceEnd);
  }

  root.RhythmBgm = {
    createBgmController: createBgmController,
    computeGameEndMs: computeGameEndMs,
  };
})(typeof window !== "undefined" ? window : globalThis);
