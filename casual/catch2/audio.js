/** Field BGM + battle SFX + Pokémon cries for catch2. */

const POKE_CRY = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

let enabled = true;
let cryEl = null;

const BGM = (() => {
  let actx = null;
  let master = null;
  let loopTimer = null;
  let running = false;
  const beat = 60 / 100;
  const MELODY = [
    { f: 523.25, d: 2 }, { f: 587.33, d: 1 }, { f: 659.25, d: 3 },
    { f: 587.33, d: 2 }, { f: 523.25, d: 2 }, { f: 392.0, d: 4 },
    { f: 440.0, d: 2 }, { f: 493.88, d: 2 }, { f: 523.25, d: 4 },
  ];
  const BASS = [
    { f: 130.81, d: 4 }, { f: 146.83, d: 4 }, { f: 110.0, d: 4 }, { f: 98.0, d: 4 },
  ];

  function init() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.065;
      master.connect(actx.destination);
    }
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }

  function note(freq, start, dur, type, vol) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, dur - 0.03));
    o.connect(g);
    g.connect(master);
    o.start(start);
    o.stop(start + dur);
  }

  function playBar(start) {
    let t = start;
    for (const n of MELODY) {
      const dur = n.d * beat * 0.88;
      note(n.f, t, dur, "triangle", 0.07);
      note(n.f * 0.5, t, dur, "sine", 0.035);
      t += n.d * beat;
    }
    let bt = start;
    for (const n of BASS) {
      note(n.f, bt, n.d * beat * 0.95, "triangle", 0.1);
      bt += n.d * beat;
    }
  }

  function loopLen() {
    return MELODY.reduce((s, n) => s + n.d, 0) * beat * 1000;
  }

  function start() {
    if (running || !enabled) return;
    init();
    running = true;
    const kick = () => {
      if (!running || !enabled) return;
      playBar(actx.currentTime);
      loopTimer = setTimeout(kick, loopLen());
    };
    kick();
  }

  function stop() {
    running = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  return {
    sync() {
      if (enabled) start();
      else stop();
    },
    unlock() {
      init();
    },
  };
})();

function sfx(role, vol) {
  if (!enabled || !window.CasualSfx) return;
  window.CasualSfx.play(role, vol);
}

function sfxSeq(roles, gap, vol) {
  if (!enabled || !window.CasualSfx) return;
  window.CasualSfx.playSeq(roles, gap, vol);
}

export const AudioFx = {
  setEnabled(on) {
    enabled = !!on;
    if (window.CasualSfx) window.CasualSfx.setEnabled(enabled);
    if (!enabled && cryEl) {
      try { cryEl.pause(); } catch { /* ignore */ }
      cryEl = null;
    }
    BGM.sync();
  },

  isEnabled() {
    return enabled;
  },

  unlock() {
    if (window.CasualSfx) window.CasualSfx.unlock();
    BGM.unlock();
    BGM.sync();
  },

  click() { sfx("clickSoft", 0.4); },
  step() { sfx("tap", 0.22); },
  encounter() { sfxSeq(["warn", "spawn"], 70, 0.55); },
  battleStart() { sfxSeq(["whoosh", "boss"], 80, 0.55); },
  hit() { sfxSeq(["whoosh", "hit", "bigHit"], 55, 0.55); },
  hurt() { sfxSeq(["thud", "hitSoft"], 60, 0.5); },
  superEffective() { sfxSeq(["power", "explode"], 70, 0.6); },
  notEffective() { sfx("failDeep", 0.4); },
  catchTry() { sfx("throw", 0.55); },
  catchShake() { sfx("rattle", 0.5); },
  catchOk() { sfxSeq(["success", "win", "fanfare"], 100, 0.65); },
  catchFail() { sfxSeq(["fail", "whoosh"], 90, 0.55); },
  catchMiss() { sfx("failDeep", 0.4); },
  fleeOk() { sfx("whoosh", 0.4); },
  fleeFail() { sfx("failDeep", 0.45); },
  faint() { sfx("lose", 0.45); },
  win() { sfxSeq(["success", "fanfare"], 100, 0.55); },
  ui() { sfx("click", 0.35); },
  pickup() { sfxSeq(["pickup", "success"], 70, 0.5); },

  cry(id) {
    if (!enabled || !id) return;
    try {
      if (cryEl) {
        cryEl.pause();
        cryEl = null;
      }
      const audio = new Audio(`${POKE_CRY}/${id}.ogg`);
      audio.volume = 0.55;
      cryEl = audio;
      audio.play().catch(() => {});
    } catch { /* ignore */ }
  },
};
