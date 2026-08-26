/*! 공주 육성 — BGM / 타이틀 영상 컨트롤러 */
window.PMMedia = (function () {
  "use strict";

  var TRACKS = {
    title: "assets/bgm/title.mp3",
    hub: "assets/bgm/hub.mp3",
    festival: "assets/bgm/festival.mp3",
    adventure: "assets/bgm/adventure.mp3",
    ending: "assets/bgm/ending.mp3"
  };

  var audio = null;
  var current = null;
  var enabled = true;
  var volume = 0.42;

  function ensure() {
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = volume;
    }
    return audio;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stop();
    else if (current) play(current, true);
  }

  function play(id, force) {
    if (!enabled) return;
    var src = TRACKS[id];
    if (!src) return;
    if (!force && current === id && audio && !audio.paused) return;
    var a = ensure();
    current = id;
    if (!a.src.endsWith(src) && a.getAttribute("data-track") !== id) {
      a.src = src;
      a.setAttribute("data-track", id);
    }
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch (_) {}
  }

  function crossfadeTo(id) {
    play(id, true);
  }

  return {
    TRACKS: TRACKS,
    play: play,
    stop: stop,
    crossfadeTo: crossfadeTo,
    setEnabled: setEnabled,
    unlock: function () {
      var a = ensure();
      a.muted = true;
      var p = a.play();
      if (p && p.then) {
        p.then(function () {
          a.pause();
          a.muted = false;
          a.currentTime = 0;
        }).catch(function () { a.muted = false; });
      } else {
        a.muted = false;
      }
    }
  };
})();
