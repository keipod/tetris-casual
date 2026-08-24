/*! CasualSfx — play shared Kenney-style UI pack under /casual/assets/sfx_ui/ */
(function (root) {
  "use strict";

  var BASE = "/casual/assets/sfx_ui/";
  var cache = Object.create(null);
  var enabled = true;

  /** Semantic roles → file stem (without .ogg). Use only files in sfx_ui/. */
  var ROLE = {
    click: "click1",
    clickAlt: "click2",
    clickSoft: "click3",
    clickSharp: "click4",
    tick: "click5",
    mouseDown: "mouseclick1",
    mouseUp: "mouserelease1",
    hover: "rollover1",
    hoverSoft: "rollover2",
    hoverMid: "rollover3",
    hoverBright: "rollover4",
    hoverHigh: "rollover5",
    hoverDeep: "rollover6",
    toggle: "switch1",
    toggle2: "switch2",
    rotate: "switch3",
    warn: "switch4",
    swap: "switch5",
    hitSoft: "switch6",
    fail: "switch7",
    slide: "switch8",
    spawn: "switch9",
    failDeep: "switch10",
    build: "switch11",
    thud: "switch12",
    tap: "switch13",
    pickup: "switch14",
    rattle: "switch15",
    hit: "switch16",
    lock: "switch17",
    upgrade: "switch18",
    success: "switch19",
    shoot: "switch20",
    drop: "switch21",
    whoosh: "switch22",
    throw: "switch23",
    bounce: "switch24",
    combo: "switch25",
    clear: "switch26",
    level: "switch27",
    special: "switch28",
    pressure: "switch29",
    power: "switch30",
    explode: "switch31",
    boss: "switch32",
    win: "switch33",
    fanfare: "switch34",
    bomb: "switch35",
    bigHit: "switch36",
    lose: "switch37",
    gameOver: "switch38",
  };

  function resolveStem(roleOrStem) {
    return ROLE[roleOrStem] || roleOrStem;
  }

  function getAudio(stem) {
    var a = cache[stem];
    if (!a) {
      a = new Audio(BASE + stem + ".ogg");
      a.preload = "auto";
      cache[stem] = a;
    }
    return a;
  }

  function unlock() {
    ["click1", "switch1", "switch19", "switch33"].forEach(function (stem) {
      try {
        getAudio(stem).load();
      } catch (_) {}
    });
  }

  function play(roleOrStem, vol) {
    if (!enabled) return;
    var stem = resolveStem(roleOrStem);
    var volume = vol == null ? 0.55 : vol;
    try {
      var src = getAudio(stem);
      var node = src.cloneNode();
      node.volume = Math.max(0, Math.min(1, volume));
      var p = node.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (_) {}
  }

  function playSeq(roles, gapMs, vol) {
    var gap = gapMs == null ? 80 : gapMs;
    roles.forEach(function (role, i) {
      setTimeout(function () {
        play(role, vol);
      }, i * gap);
    });
  }

  function preload(roles) {
    (roles || Object.keys(ROLE)).forEach(function (role) {
      getAudio(resolveStem(role));
    });
  }

  root.CasualSfx = {
    BASE: BASE,
    ROLE: ROLE,
    setEnabled: function (v) {
      enabled = !!v;
    },
    isEnabled: function () {
      return enabled;
    },
    unlock: unlock,
    play: play,
    playSeq: playSeq,
    preload: preload,
  };
})(typeof window !== "undefined" ? window : globalThis);
