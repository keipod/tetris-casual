(() => {
  "use strict";

  // ---------- defaults (overridden per chart) ----------
  const LANES = 4;
  const LANE_KEYS = ["d", "f", "j", "k"];
  const LANE_COLORS = ["#ff5e99", "#ffd23f", "#3ddbd9", "#9b6bff"];
  const LANE_FREQS = [261.63, 329.63, 392.0, 523.25];
  const DEFAULT_FALL_MS = 2100;
  const DEFAULT_PERFECT_MS = 75;
  const DEFAULT_GOOD_MS = 160;
  const LS_BEST = "rhythm_best_v2";
  const LS_SOUND = "rhythm_sound_v1";
  const LS_SONG = "rhythm_song_v1";
  const MANIFEST_URL = "assets/manifest.json";

  // ---------- dom ----------
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("hud-score");
  const hudCombo = document.getElementById("hud-combo");
  const hudBest = document.getElementById("hud-best");
  const startBestEl = document.getElementById("start-best");
  const resultBestEl = document.getElementById("result-best");
  const btnSound = document.getElementById("btn-sound");
  const btnStart = document.getElementById("btn-start");
  const btnRetry = document.getElementById("btn-retry");
  const btnSongSelect = document.getElementById("btn-song-select");
  const btnResume = document.getElementById("btn-resume");
  const startOverlay = document.getElementById("start-overlay");
  const pauseOverlay = document.getElementById("pause-overlay");
  const resultOverlay = document.getElementById("result-overlay");
  const countdownEl = document.getElementById("countdown");
  const songListEl = document.getElementById("song-list");
  const songLoadStatus = document.getElementById("song-load-status");
  const laneButtons = Array.from(document.querySelectorAll(".lane-btn"));
  const mascotImg = document.getElementById("mascot");
  const mascotGlow = document.getElementById("mascot-glow");
  const comboDisplay = document.getElementById("combo-display");
  const comboNumEl = document.getElementById("combo-num");
  const judgePopup = document.getElementById("judge-popup");
  const resultRankEl = document.getElementById("result-rank");
  const resultScoreEl = document.getElementById("result-score");
  const resultComboEl = document.getElementById("result-combo");
  const resultAccEl = document.getElementById("result-acc");
  const resultNewBestEl = document.getElementById("result-new-best");
  const jcPerfectEl = document.getElementById("jc-perfect");
  const jcGoodEl = document.getElementById("jc-good");
  const jcMissEl = document.getElementById("jc-miss");

  const storage = (() => {
    try {
      localStorage.setItem("__rh", "1");
      localStorage.removeItem("__rh");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  // ---------- song / chart state ----------
  let songs = [];
  let selectedSongId = storage.getItem(LS_SONG) || "";
  let chart = [];
  let fallMs = DEFAULT_FALL_MS;
  let perfectMs = DEFAULT_PERFECT_MS;
  let goodMs = DEFAULT_GOOD_MS;
  let songEndTime = 4000;
  let hasBgm = false;
  let pauseSongOffset = 0;
  let loadingSong = false;
  let wallStartMs = 0;
  const bgm = window.RhythmBgm
    ? window.RhythmBgm.createBgmController()
    : null;
  const computeGameEndMs =
    (window.RhythmBgm && window.RhythmBgm.computeGameEndMs) ||
    function (durationMs, lastNoteMs) {
      const last = lastNoteMs || 0;
      return Math.max(durationMs || last + 2200, last + 2200);
    };

  // ---------- state ----------
  let W = 0,
    H = 0,
    dpr = 1,
    laneWidth = 0,
    hitLineY = 0;
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let bestMap = loadBestMap();
  let score = 0,
    combo = 0,
    maxCombo = 0;
  let perfectCount = 0,
    goodCount = 0,
    missCount = 0;
  let playing = false,
    paused = false;
  let needsBgmKick = false;
  let audioCtx = null,
    masterGain = null,
    audioStartAt = 0,
    scheduledIdx = 0;
  let schedulerTimer = null,
    rafId = null;
  const flashes = [];

  function loadBestMap() {
    try {
      const raw = storage.getItem(LS_BEST);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function songBest(id) {
    return parseInt(bestMap[id] || "0", 10) || 0;
  }

  function saveSongBest(id, value) {
    bestMap[id] = value;
    storage.setItem(LS_BEST, JSON.stringify(bestMap));
  }

  function currentSong() {
    return songs.find((s) => s.id === selectedSongId) || null;
  }

  function fallbackSongs() {
    return [
      {
        id: "practice",
        title: "연습 비트",
        difficulty: "easy",
        difficultyLabel: "쉬움",
        bpm: 96,
        durationMs: 45000,
        noteCount: 48,
        nps: 1.1,
        fallMs: 2300,
        audio: null,
        chart: null,
        _synthetic: true,
      },
    ];
  }

  function buildSyntheticChart(song) {
    const bpm = song.bpm || 96;
    const beatMs = 60000 / bpm;
    const notes = [];
    let lastLane = -1;
    for (let b = 4; b < 56; b++) {
      if (b % 8 === 7) continue;
      let lane = (b * 3 + (b % 4)) % LANES;
      if (lane === lastLane) lane = (lane + 1) % LANES;
      lastLane = lane;
      notes.push({ time: Math.round(b * beatMs), lane, judged: false, missed: false });
    }
    return {
      notes,
      fallMs: song.fallMs || DEFAULT_FALL_MS,
      perfectMs: DEFAULT_PERFECT_MS,
      goodMs: DEFAULT_GOOD_MS,
      durationMs: song.durationMs || 45000,
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function loadManifest() {
    try {
      const man = await fetchJson(MANIFEST_URL);
      songs = Array.isArray(man.songs) ? man.songs : [];
    } catch (_) {
      songs = [];
    }
    if (!songs.length) songs = fallbackSongs();
    if (!songs.some((s) => s.id === selectedSongId)) {
      selectedSongId = songs[0].id;
    }
    renderSongList();
    updateBestDisplays();
    btnStart.disabled = !selectedSongId;
  }

  function renderSongList() {
    songListEl.innerHTML = "";
    songs.forEach((song) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-item" + (song.id === selectedSongId ? " selected" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", song.id === selectedSongId ? "true" : "false");
      btn.dataset.songId = song.id;
      const best = songBest(song.id);
      btn.innerHTML =
        `<span class="song-diff ${song.difficulty || "normal"}">${escapeHtml(
          song.difficultyLabel || song.difficulty || "?"
        )}</span>` +
        `<span class="song-meta">` +
        `<span class="song-title">${escapeHtml(song.title || song.id)}</span>` +
        `<span class="song-sub">BPM ${Math.round(song.bpm || 0)} · 노트 ${song.noteCount || "?"} · ${formatDuration(
          song.durationMs
        )}</span>` +
        `</span>` +
        `<span class="song-best">${best ? best.toLocaleString("ko-KR") : "—"}</span>`;
      btn.addEventListener("click", () => selectSong(song.id));
      songListEl.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDuration(ms) {
    if (!ms) return "?";
    const sec = Math.round(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}초`;
  }

  function selectSong(id) {
    selectedSongId = id;
    storage.setItem(LS_SONG, id);
    renderSongList();
    updateBestDisplays();
    btnStart.disabled = false;
    songLoadStatus.textContent = "";
  }

  async function prepareSelectedSong() {
    const song = currentSong();
    if (!song) throw new Error("곡이 선택되지 않았어요");
    loadingSong = true;
    songLoadStatus.textContent = "곡과 차트를 불러오는 중…";
    btnStart.disabled = true;

    if (bgm) bgm.stop();
    hasBgm = false;

    let data;
    if (song._synthetic || !song.chart) {
      data = buildSyntheticChart(song);
    } else {
      data = await fetchJson(song.chart);
    }

    chart = (data.notes || []).map((n) => ({
      time: n.time,
      lane: n.lane,
      judged: false,
      missed: false,
    }));
    fallMs = data.fallMs || song.fallMs || DEFAULT_FALL_MS;
    perfectMs = data.perfectMs || DEFAULT_PERFECT_MS;
    goodMs = data.goodMs || DEFAULT_GOOD_MS;
    const lastNote = chart.length ? Math.max(...chart.map((n) => n.time)) : 0;
    songEndTime = computeGameEndMs(data.durationMs || song.durationMs, lastNote);

    if (song.audio && bgm) {
      bgm.attach(song.audio);
      try {
        await bgm.whenReady(25000);
        hasBgm = true;
      } catch (err) {
        hasBgm = false;
        throw err;
      }
    }

    loadingSong = false;
    songLoadStatus.textContent = "";
    btnStart.disabled = false;
  }

  // ---------- helpers ----------
  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function calcRank(acc) {
    if (acc >= 97) return "S";
    if (acc >= 90) return "A";
    if (acc >= 75) return "B";
    if (acc >= 50) return "C";
    return "D";
  }

  // ---------- resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    laneWidth = W / LANES;
    hitLineY = H * 0.78;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  // ---------- audio ----------
  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = soundOn ? 1 : 0;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  /** Must run inside a user-gesture handler (before await). */
  function primeAudioForGesture(song) {
    ensureAudioCtx();
    if (window.CasualSfx) window.CasualSfx.unlock();
    if (bgm && song && song.audio) bgm.prime(song.audio);
  }

  function stopBgm() {
    if (bgm) bgm.stop();
  }

  function startBgm(offsetSec) {
    if (!bgm || !hasBgm) return Promise.resolve(false);
    return bgm.start(offsetSec || 0, soundOn ? 0.88 : 0);
  }

  function playPluck(lane, when) {
    if (!audioCtx || !masterGain || hasBgm) return; // BGM present → skip metronome plucks
    const freq = LANE_FREQS[lane];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.14, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(gain).connect(masterGain);
    osc.start(when);
    osc.stop(when + 0.25);
  }

  function scheduleAhead() {
    if (!playing || !audioCtx || hasBgm) return;
    const now = audioCtx.currentTime;
    while (scheduledIdx < chart.length && audioStartAt + chart[scheduledIdx].time / 1000 <= now + 0.15) {
      playPluck(chart[scheduledIdx].lane, audioStartAt + chart[scheduledIdx].time / 1000);
      scheduledIdx++;
    }
  }

  function playFeedback(kind) {
    if (!window.CasualSfx) return;
    const roles = {
      perfect: "combo",
      good: "hit",
      miss: "fail",
      milestone: "success",
      empty: "tap",
      end: "fanfare",
    };
    // Keep judgment SFX quieter than BGM so misses don't feel like the song cutting out.
    const vol = kind === "miss" ? 0.28 : kind === "perfect" || kind === "good" ? 0.32 : 0.4;
    window.CasualSfx.play(roles[kind] || "click", vol);
  }

  function getSongTime() {
    if (hasBgm && bgm) {
      const t = bgm.songTimeMs();
      if (t != null) return t;
      // Primed but not yet audible — fall back to wall clock so notes keep moving.
      if (wallStartMs) return performance.now() - wallStartMs;
    }
    if (audioCtx && audioStartAt) return (audioCtx.currentTime - audioStartAt) * 1000;
    if (wallStartMs) return performance.now() - wallStartMs;
    return -1e9;
  }

  // ---------- hud / visuals ----------
  function updateHud() {
    hudScore.textContent = score.toLocaleString("ko-KR");
    hudCombo.textContent = String(combo);
    const best = songBest(selectedSongId);
    hudBest.textContent = best.toLocaleString("ko-KR");
    if (combo > 0) {
      comboNumEl.textContent = String(combo);
      comboDisplay.classList.remove("hidden");
      comboNumEl.classList.remove("pop");
      void comboNumEl.offsetWidth;
      comboNumEl.classList.add("pop");
    } else {
      comboDisplay.classList.add("hidden");
    }
  }

  function updateBestDisplays() {
    const best = songBest(selectedSongId);
    startBestEl.textContent = best.toLocaleString("ko-KR");
    resultBestEl.textContent = best.toLocaleString("ko-KR");
    hudBest.textContent = best.toLocaleString("ko-KR");
  }

  function flashLane(lane, judge) {
    flashes.push({ lane, judge, t: performance.now() });
  }

  function showJudge(lane, judge) {
    const cx = (lane + 0.5) * laneWidth;
    judgePopup.style.left = cx + "px";
    judgePopup.style.top = Math.max(20, hitLineY - 40) + "px";
    judgePopup.textContent = judge === "perfect" ? "퍼펙트!" : judge === "good" ? "굿!" : "미스";
    judgePopup.className = "judge-popup";
    void judgePopup.offsetWidth;
    judgePopup.classList.add("show-" + judge);
  }

  function reactMascot(judge) {
    mascotImg.classList.remove("judge-perfect", "judge-good", "judge-miss");
    void mascotImg.offsetWidth;
    mascotImg.classList.add("judge-" + judge);
  }

  function hypeMascot() {
    mascotGlow.classList.remove("hype");
    void mascotGlow.offsetWidth;
    mascotGlow.classList.add("hype");
  }

  // ---------- game logic ----------
  function registerHit(lane, judge) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (judge === "perfect") {
      perfectCount++;
      score += 300 + Math.min(combo, 50) * 2;
    } else {
      goodCount++;
      score += 100 + Math.min(combo, 50);
    }
    updateHud();
    flashLane(lane, judge);
    showJudge(lane, judge);
    reactMascot(judge);
    playFeedback(judge);
    if (combo > 0 && combo % 20 === 0) {
      hypeMascot();
      playFeedback("milestone");
    }
  }

  function registerMiss(lane) {
    combo = 0;
    missCount++;
    updateHud();
    flashLane(lane, "miss");
    showJudge(lane, "miss");
    reactMascot("miss");
    playFeedback("miss");
    // BGM must keep playing through misses — judgment SFX only.
    if (bgm) bgm.onMiss();
  }

  function registerEmptyTap(lane) {
    flashLane(lane, "empty");
  }

  function hitLane(lane) {
    if (!playing || paused) return;
    kickBgmIfNeeded();
    const t = getSongTime();
    let best_ = null;
    let bestDelta = Infinity;
    for (const n of chart) {
      if (n.lane !== lane || n.judged) continue;
      const delta = Math.abs(n.time - t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best_ = n;
      }
    }
    if (best_ && bestDelta <= goodMs) {
      best_.judged = true;
      const judge = bestDelta <= perfectMs ? "perfect" : "good";
      registerHit(lane, judge);
    } else {
      registerEmptyTap(lane);
    }
  }

  function checkMisses(t) {
    for (const n of chart) {
      if (!n.judged && t > n.time + goodMs) {
        n.judged = true;
        n.missed = true;
        registerMiss(n.lane);
      }
    }
    if (t > songEndTime) endGame();
  }

  function resetChartState() {
    chart.forEach((n) => {
      n.judged = false;
      n.missed = false;
    });
  }

  function resetState() {
    resetChartState();
    score = 0;
    combo = 0;
    maxCombo = 0;
    perfectCount = 0;
    goodCount = 0;
    missCount = 0;
    pauseSongOffset = 0;
    updateHud();
  }

  function actuallyStart() {
    resetState();
    ensureAudioCtx();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    wallStartMs = performance.now();
    audioStartAt = audioCtx ? audioCtx.currentTime : 0;
    scheduledIdx = 0;
    playing = true;
    paused = false;
    needsBgmKick = false;
    startBgm(0).then(function (ok) {
      if (!ok && hasBgm && bgm) {
        // Autoplay blocked: kick on next lane tap via hitLane resume helper.
        needsBgmKick = true;
      }
    });
    clearInterval(schedulerTimer);
    schedulerTimer = setInterval(scheduleAhead, 25);
  }

  function kickBgmIfNeeded() {
    if (!needsBgmKick || !hasBgm) return;
    needsBgmKick = false;
    const offset = Math.max(0, (performance.now() - wallStartMs) / 1000);
    startBgm(offset);
  }

  function beginCountdown(cb) {
    countdownEl.classList.remove("hidden");
    let n = 3;
    countdownEl.textContent = String(n);
    const step = () => {
      n--;
      if (n > 0) {
        countdownEl.textContent = String(n);
        setTimeout(step, 550);
      } else {
        countdownEl.textContent = "시작!";
        setTimeout(() => {
          countdownEl.classList.add("hidden");
          cb();
        }, 420);
      }
    };
    setTimeout(step, 550);
  }

  function endGame() {
    if (!playing) return;
    playing = false;
    clearInterval(schedulerTimer);
    stopBgm();
    const total = chart.length;
    const acc = total ? ((perfectCount + goodCount * 0.7) / total) * 100 : 100;
    const rank = calcRank(acc);
    const prev = songBest(selectedSongId);
    const isNewBest = score > prev;
    if (isNewBest) {
      saveSongBest(selectedSongId, score);
    }
    updateBestDisplays();
    renderSongList();
    resultRankEl.textContent = rank;
    resultScoreEl.textContent = score.toLocaleString("ko-KR");
    resultComboEl.textContent = String(maxCombo);
    resultAccEl.textContent = acc.toFixed(1) + "%";
    jcPerfectEl.textContent = String(perfectCount);
    jcGoodEl.textContent = String(goodCount);
    jcMissEl.textContent = String(missCount);
    resultNewBestEl.classList.toggle("hidden", !isNewBest);
    resultOverlay.classList.remove("hidden");
    playFeedback("end");
  }

  // ---------- drawing ----------
  function drawLanes() {
    for (let i = 0; i < LANES; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(i * laneWidth, 0, laneWidth, H);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneWidth, 0);
      ctx.lineTo(i * laneWidth, H);
      ctx.stroke();
    }
  }

  function drawHitLine() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffcb05";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, hitLineY);
    ctx.lineTo(W, hitLineY);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < LANES; i++) {
      ctx.fillStyle = LANE_COLORS[i];
      ctx.globalAlpha = 0.5;
      ctx.fillRect((i + 0.5) * laneWidth - 14, hitLineY - 3, 28, 6);
      ctx.globalAlpha = 1;
    }
  }

  function drawNotes(t) {
    const noteH = 22;
    for (const n of chart) {
      if (n.judged) continue;
      const spawn = n.time - fallMs;
      if (t < spawn - 150) continue;
      const progress = (t - spawn) / fallMs;
      if (progress > 1.3) continue;
      const y = Math.min(progress, 1.3) * hitLineY;
      const cx = (n.lane + 0.5) * laneWidth;
      const w = laneWidth * 0.62;
      ctx.save();
      ctx.shadowColor = LANE_COLORS[n.lane];
      ctx.shadowBlur = 10;
      ctx.fillStyle = LANE_COLORS[n.lane];
      roundRectPath(cx - w / 2, y - noteH / 2, w, noteH, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFlashes() {
    const now = performance.now();
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = now - f.t;
      if (age > 260) {
        flashes.splice(i, 1);
        continue;
      }
      const alpha = 1 - age / 260;
      const rgb =
        f.judge === "perfect"
          ? "255,203,5"
          : f.judge === "good"
          ? hexToRgb(LANE_COLORS[f.lane])
          : f.judge === "miss"
          ? "227,53,13"
          : "255,255,255";
      ctx.fillStyle = `rgba(${rgb},${alpha * 0.35})`;
      ctx.fillRect(f.lane * laneWidth, 0, laneWidth, H);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawLanes();
    drawHitLine();
    if (playing && !paused) {
      const t = getSongTime();
      checkMisses(t);
      drawNotes(t);
    }
    drawFlashes();
  }

  function frameLoop() {
    rafId = requestAnimationFrame(frameLoop);
    draw();
  }

  // ---------- input ----------
  laneButtons.forEach((btn) => {
    const lane = parseInt(btn.dataset.lane, 10);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("pressed");
      ensureAudioCtx();
      if (window.CasualSfx) window.CasualSfx.unlock();
      hitLane(lane);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      btn.addEventListener(ev, () => btn.classList.remove("pressed"))
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
    if (idx === -1) return;
    e.preventDefault();
    laneButtons[idx].classList.add("pressed");
    setTimeout(() => laneButtons[idx].classList.remove("pressed"), 110);
    hitLane(idx);
  });

  async function startFromMenu() {
    if (loadingSong) return;
    primeAudioForGesture(currentSong());
    try {
      await prepareSelectedSong();
    } catch (err) {
      songLoadStatus.textContent = "불러오기 실패: " + (err && err.message ? err.message : err);
      btnStart.disabled = false;
      return;
    }
    startOverlay.classList.add("hidden");
    ensureAudioCtx();
    if (window.CasualSfx) window.CasualSfx.unlock();
    beginCountdown(actuallyStart);
  }

  btnStart.addEventListener("pointerdown", () => {
    primeAudioForGesture(currentSong());
  });

  btnStart.addEventListener("click", () => {
    startFromMenu();
  });

  btnRetry.addEventListener("click", async () => {
    resultOverlay.classList.add("hidden");
    primeAudioForGesture(currentSong());
    try {
      if (!chart.length) await prepareSelectedSong();
      else resetChartState();
    } catch (err) {
      songLoadStatus.textContent = "불러오기 실패";
      startOverlay.classList.remove("hidden");
      return;
    }
    ensureAudioCtx();
    beginCountdown(actuallyStart);
  });

  btnSongSelect.addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    startOverlay.classList.remove("hidden");
    renderSongList();
    updateBestDisplays();
  });

  btnResume.addEventListener("click", () => {
    pauseOverlay.classList.add("hidden");
    paused = false;
    primeAudioForGesture(currentSong());
    ensureAudioCtx();
    wallStartMs = performance.now() - pauseSongOffset;
    audioStartAt = audioCtx ? audioCtx.currentTime - pauseSongOffset / 1000 : 0;
    startBgm(pauseSongOffset / 1000);
    clearInterval(schedulerTimer);
    schedulerTimer = setInterval(scheduleAhead, 25);
  });

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
    if (masterGain) masterGain.gain.value = soundOn ? 1 : 0;
    if (bgm) bgm.setVolume(soundOn ? 0.88 : 0);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (playing && !paused) {
        paused = true;
        pauseSongOffset = Math.max(0, getSongTime());
        if (bgm) bgm.pause();
        if (audioCtx) audioCtx.suspend();
        clearInterval(schedulerTimer);
      }
    } else if (paused) {
      pauseOverlay.classList.remove("hidden");
    }
  });

  let mascotFallbackStage = 0;
  mascotImg.addEventListener("error", () => {
    mascotFallbackStage++;
    if (mascotFallbackStage === 1) {
      mascotImg.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png";
    }
  });

  // ---------- init ----------
  btnSound.classList.toggle("muted", !soundOn);
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  updateHud();
  resize();
  frameLoop();
  loadManifest();
})();
