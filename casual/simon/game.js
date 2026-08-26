(() => {
  "use strict";

  const LS_BEST = "simon.best";
  const LS_MODE = "simon.mode";
  const LS_SOUND = "simon.sound";

  const PAD_KEYS = ["green", "red", "yellow", "blue"];
  const TONE_HZ = { green: 261.63, red: 329.63, yellow: 392.0, blue: 523.25 };

  const BASE_INTERVAL_MS = 620;
  const INTERVAL_STEP_MS = 30;
  const MIN_INTERVAL_MS = 240;
  const FIRST_BEAT_DELAY_MS = 550;
  const NEXT_ROUND_DELAY_MS = 750;
  const INPUT_FLASH_MS = 230;
  const PRACTICE_RETRY_DELAY_MS = 900;
  const SHAKE_MS = 500;
  const RETRY_LOCKOUT_MS = 400;

  function stepIntervalFor(round) {
    return Math.max(BASE_INTERVAL_MS - (round - 1) * INTERVAL_STEP_MS, MIN_INTERVAL_MS);
  }

  const api = { TONE_HZ, stepIntervalFor };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__simon = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const padEl = document.getElementById("pad");
  const padWrap = document.getElementById("pad-wrap");
  const hubRound = document.getElementById("hub-round");
  const hubStatus = document.getElementById("hub-status");
  const hubRing = document.getElementById("hub-ring");
  const btnStart = document.getElementById("btn-start");
  const statRound = document.getElementById("stat-round");
  const statBest = document.getElementById("stat-best");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnStrict = document.getElementById("btn-strict");
  const btnPractice = document.getElementById("btn-practice");
  const btnNew = document.getElementById("btn-new");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  const padBtns = {};
  PAD_KEYS.forEach((key) => {
    padBtns[key] = padEl.querySelector(`.pad-btn[data-pad="${key}"]`);
  });

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let mode = storage.getItem(LS_MODE) === "practice" ? "practice" : "strict";
  let best = parseInt(storage.getItem(LS_BEST), 10) || 0;

  let phase = "idle";
  let sequence = [];
  let inputPos = 0;
  let shownAt = 0;

  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  let actx = null;
  let master = null;
  function ensureAudio() {
    if (!soundOn) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(actx.destination);
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  function tone(freq, durMs, type, vol) {
    if (!soundOn || !ensureAudio()) return;
    const t0 = actx.currentTime;
    const dur = durMs / 1000;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const padTone = (key) => tone(TONE_HZ[key], 320, "sine", 0.28);
  const buzz = () => tone(110, 400, "square", 0.22);

  const SFX = {
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
    milestone() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "level"], 80, 0.7); },
    fanfare() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.75); },
  };

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) { window.CasualSfx.unlock(); SFX.click(); }
    }
    if (master) master.gain.value = soundOn ? 0.9 : 0;
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
    ensureAudio();
  }, { once: true });

  function setLit(key, on) {
    const btn = padBtns[key];
    if (btn) btn.classList.toggle("lit", on);
  }

  function setPhase(next) {
    phase = next;
    padEl.dataset.phase = next;
  }

  function setStatus(text) {
    hubStatus.textContent = text;
  }

  function updateChips() {
    statRound.textContent = sequence.length ? String(sequence.length) : "–";
    statBest.textContent = best ? String(best) : "–";
  }

  function renderHub() {
    hubRound.textContent = sequence.length ? String(sequence.length) : "–";
    if (phase === "showing") setStatus("보세요 👀");
    else if (phase === "input") setStatus("따라하기 ✋");
    else if (phase === "between") setStatus("좋아요! ✨");
    else if (phase === "paused") setStatus("잠깐 멈춤 ⏸");
    else if (phase === "idle") setStatus("준비됐나요?");
  }

  function pulseRing() {
    hubRing.classList.remove("pulse");
    void hubRing.offsetWidth;
    hubRing.classList.add("pulse");
  }

  function playSequence() {
    clearTimers();
    setPhase("showing");
    renderHub();
    updateChips();
    const iv = stepIntervalFor(sequence.length);
    const litMs = Math.max(Math.round(iv * 0.6), 150);
    let i = 0;
    const step = () => {
      if (phase !== "showing") return;
      if (i >= sequence.length) {
        inputPos = 0;
        setPhase("input");
        renderHub();
        return;
      }
      const key = sequence[i];
      setLit(key, true);
      padTone(key);
      later(() => { if (phase === "showing") setLit(key, false); }, litMs);
      i += 1;
      later(step, iv);
    };
    later(step, FIRST_BEAT_DELAY_MS);
  }

  function pressPad(key) {
    if (phase !== "input") return;
    ensureAudio();
    setLit(key, true);
    padTone(key);
    later(() => setLit(key, false), INPUT_FLASH_MS);
    if (key === sequence[inputPos]) {
      inputPos += 1;
      if (inputPos >= sequence.length) succeedRound();
    } else {
      failRound();
    }
  }

  function succeedRound() {
    setPhase("between");
    renderHub();
    if (sequence.length % 5 === 0) {
      pulseRing();
      SFX.milestone();
    }
    sequence.push(PAD_KEYS[Math.floor(Math.random() * PAD_KEYS.length)]);
    later(playSequence, NEXT_ROUND_DELAY_MS);
  }

  function failRound() {
    buzz();
    padWrap.classList.add("shake");
    later(() => padWrap.classList.remove("shake"), SHAKE_MS);
    if (mode === "practice") {
      setPhase("between");
      setStatus("다시 볼래요! 🔁");
      inputPos = 0;
      later(playSequence, PRACTICE_RETRY_DELAY_MS);
    } else {
      setPhase("over");
      later(showGameOver, SHAKE_MS);
    }
  }

  function showGameOver() {
    const reached = sequence.length;
    let isNew = false;
    if (reached > best) {
      best = reached;
      storage.setItem(LS_BEST, String(best));
      isNew = true;
      updateChips();
    }
    if (isNew) SFX.fanfare();
    overlayCard.innerHTML = `
      <h2>게임 오버</h2>
      ${isNew ? '<span class="new-best">🏆 신기록!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${reached}</span><span class="result-label">도달 라운드</span></div>
        <div class="result-item"><span class="result-num">${best}</span><span class="result-label">최고 기록</span></div>
      </div>
      <p>${mode === "practice" ? "연습 모드" : "엄격 모드"} · 라운드마다 재생이 빨라져요.</p>
      <button type="button" class="retry" id="btn-again">재시작</button>
    `;
    overlay.hidden = false;
    shownAt = performance.now();
    document.getElementById("btn-again").onclick = () => {
      if (performance.now() - shownAt < RETRY_LOCKOUT_MS) return;
      SFX.click();
      startGame();
    };
  }

  function startGame() {
    clearTimers();
    overlay.hidden = true;
    PAD_KEYS.forEach((k) => setLit(k, false));
    sequence = [PAD_KEYS[Math.floor(Math.random() * PAD_KEYS.length)]];
    inputPos = 0;
    playSequence();
  }

  function toIdle() {
    clearTimers();
    overlay.hidden = true;
    PAD_KEYS.forEach((k) => setLit(k, false));
    sequence = [];
    inputPos = 0;
    setPhase("idle");
    renderHub();
    updateChips();
  }

  function syncModeButtons() {
    btnStrict.classList.toggle("is-active", mode === "strict");
    btnPractice.classList.toggle("is-active", mode === "practice");
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    storage.setItem(LS_MODE, mode);
    syncModeButtons();
    SFX.click();
    toIdle();
  }

  btnStart.addEventListener("click", () => {
    SFX.click();
    ensureAudio();
    startGame();
  });

  btnStrict.addEventListener("click", () => setMode("strict"));
  btnPractice.addEventListener("click", () => setMode("practice"));

  btnNew.addEventListener("click", () => {
    SFX.click();
    ensureAudio();
    startGame();
  });

  PAD_KEYS.forEach((key) => {
    const btn = padBtns[key];
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pressPad(key);
    });
    btn.addEventListener("click", (e) => {
      if (e.detail === 0) pressPad(key);
    });
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.click();
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
  }

  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => {
    SFX.click();
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (phase === "showing" || phase === "between") {
        clearTimers();
        PAD_KEYS.forEach((k) => setLit(k, false));
        setPhase("paused");
        renderHub();
      }
    } else if (phase === "paused") {
      playSequence();
    }
  });

  syncModeButtons();
  toIdle();
})();
