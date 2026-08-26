(() => {
  "use strict";

  const LANES = 4;
  const LANE_COLORS = ["#ff4fd8", "#39f3ff", "#b6ff3d", "#ffc857"];
  const KEY_TO_LANE = {
    arrowleft: 0,
    a: 0,
    arrowdown: 1,
    s: 1,
    arrowup: 2,
    w: 2,
    arrowright: 3,
    d: 3,
  };
  const LS_BEST = "ddr_best_v1";
  const LS_SOUND = "ddr_sound_v1";
  const LS_SONG = "ddr_song_v1";

  const SONGS = [
    {
      id: "easy",
      title: "워밍업",
      difficulty: "easy",
      difficultyLabel: "쉬움",
      bpm: 96,
      travelMs: 2600,
      bars: 16,
    },
    {
      id: "normal",
      title: "클럽 플로어",
      difficulty: "normal",
      difficultyLabel: "보통",
      bpm: 120,
      travelMs: 2000,
      bars: 20,
    },
    {
      id: "hard",
      title: "네온 러시",
      difficulty: "hard",
      difficultyLabel: "어려움",
      bpm: 144,
      travelMs: 1550,
      bars: 24,
    },
  ];

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
  const pads = Array.from(document.querySelectorAll(".pad"));
  const judgePopup = document.getElementById("judge-popup");
  const resultRankEl = document.getElementById("result-rank");
  const resultScoreEl = document.getElementById("result-score");
  const resultComboEl = document.getElementById("result-combo");
  const resultAccEl = document.getElementById("result-acc");
  const resultNewBestEl = document.getElementById("result-new-best");

  const storage = (() => {
    try {
      localStorage.setItem("__ddr", "1");
      localStorage.removeItem("__ddr");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let selectedId = storage.getItem(LS_SONG) || "easy";
  if (!SONGS.some((s) => s.id === selectedId)) selectedId = "easy";
  let bestMap = {};
  try {
    bestMap = JSON.parse(storage.getItem(LS_BEST) || "{}") || {};
  } catch (_) {
    bestMap = {};
  }

  let chart = [];
  let travelMs = 2200;
  let perfectMs = 75;
  let goodMs = 155;
  let songEndTime = 4000;
  let bpm = 100;
  let beatMs = 600;
  let W = 0,
    H = 0,
    dpr = 1,
    laneW = 0,
    receptorY = 0,
    arrowSize = 34;
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let score = 0,
    combo = 0,
    maxCombo = 0;
  let perfectCount = 0,
    goodCount = 0,
    missCount = 0;
  let playing = false,
    paused = false;
  let audioCtx = null,
    master = null;
  let wallStart = 0,
    pauseOffset = 0;
  let grooveBeat = -1;
  let countdownTimer = null;
  const flashes = [];
  const pulse = { lane: -1, until: 0, perfect: false };

  function songBest(id) {
    return parseInt(bestMap[id] || "0", 10) || 0;
  }
  function saveBest(id, v) {
    bestMap[id] = v;
    storage.setItem(LS_BEST, JSON.stringify(bestMap));
  }
  function currentSong() {
    return SONGS.find((s) => s.id === selectedId) || SONGS[0];
  }

  /** Deterministic pseudo-random in [0,1) from integer seed. */
  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function pushNote(notes, time, lane) {
    notes.push({ time: Math.round(time), lane, judged: false });
  }

  /** Narrow / touch playfield — hard chart eases slightly; desktop stays dense. */
  function isMobilePlay() {
    try {
      return window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
    } catch (_) {
      return false;
    }
  }

  function buildChart(song) {
    const beat = 60000 / song.bpm;
    const notes = [];
    const introBeats = 4;
    const totalBeats = introBeats + song.bars * 4;
    let lastLane = -1;
    const easyCycle = [0, 3, 1, 2, 0, 1, 3, 2];
    const mobileHard = song.difficulty === "hard" && isMobilePlay();

    for (let b = introBeats; b < totalBeats; b++) {
      const t = b * beat;
      const barPos = b % 4;
      const h = hash01(b * 17 + song.bpm);

      if (song.difficulty === "easy") {
        // Quarters on strong beats; skip some off-beats for breathing room
        if (barPos === 1 || barPos === 3) {
          if (h > 0.55) continue;
        }
        let lane = easyCycle[b % easyCycle.length];
        if (lane === lastLane) lane = (lane + 2) % LANES;
        lastLane = lane;
        pushNote(notes, t, lane);
      } else if (song.difficulty === "normal") {
        // Quarters + selective 8ths; occasional doubles on downbeats
        if (barPos === 1 && h > 0.72) continue;
        let lane = Math.floor(hash01(b * 3 + 9) * LANES);
        if (lane === lastLane) lane = (lane + 1) % LANES;
        lastLane = lane;
        pushNote(notes, t, lane);
        if (barPos === 0 && h > 0.45) {
          pushNote(notes, t, (lane + 2) % LANES);
        }
        // Mid-beat 8ths on selected measures
        if (barPos % 2 === 0 && hash01(b + 40) > 0.55) {
          const lane8 = (lane + 1) % LANES;
          pushNote(notes, t + beat * 0.5, lane8);
          lastLane = lane8;
        }
      } else {
        // Dense quarters, frequent 8ths, doubles, light 16ths on accents
        let lane = Math.floor(hash01(b * 5 + 2) * LANES);
        if (lane === lastLane) lane = (lane + 1) % LANES;
        lastLane = lane;
        pushNote(notes, t, lane);
        // Mobile: fewer simultaneous doubles (downbeats only, rarer)
        if (mobileHard) {
          if (barPos === 0 && h > 0.52) {
            pushNote(notes, t, (lane + 2) % LANES);
          }
        } else if (barPos === 0 || (barPos === 2 && h > 0.35)) {
          pushNote(notes, t, (lane + 2) % LANES);
        }
        if (hash01(b + 90) > (mobileHard ? 0.42 : 0.28)) {
          const lane8 = (lane + 1 + Math.floor(h * 2)) % LANES;
          pushNote(notes, t + beat * 0.5, lane8);
          lastLane = lane8;
        }
        if (barPos === 0 && hash01(b + 120) > (mobileHard ? 0.78 : 0.62)) {
          pushNote(notes, t + beat * 0.25, (lane + 3) % LANES);
        }
      }
    }

    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    // Deduplicate same-time same-lane
    const deduped = [];
    for (const n of notes) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.time === n.time && prev.lane === n.lane) continue;
      deduped.push(n);
    }
    let travel = song.travelMs;
    if (mobileHard) travel = Math.round(song.travelMs + 280);
    const last = deduped.length ? deduped[deduped.length - 1].time : 4000;
    return {
      notes: deduped,
      travelMs: travel,
      perfectMs: song.difficulty === "hard" ? 52 : song.difficulty === "normal" ? 68 : 82,
      goodMs: song.difficulty === "hard" ? 125 : song.difficulty === "normal" ? 148 : 170,
      durationMs: last + Math.max(1800, travel * 0.75),
      bpm: song.bpm,
    };
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = soundOn ? 1 : 0;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone(freqStart, freqEnd, dur, type, peak) {
    if (!ensureAudio() || !master) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + dur);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function playStep() {
    playTone(480, 160, 0.09, "triangle", 0.1);
  }

  function playKick() {
    playTone(78, 36, 0.2, "sine", 0.28);
  }

  function playHat() {
    playTone(6400, 2200, 0.04, "square", 0.035);
  }

  /** Song-time synced groove — keeps beating through misses. */
  function tickGroove(songTime) {
    if (!playing || paused || !soundOn || songTime < 0) return;
    const beat = Math.floor(songTime / beatMs);
    if (beat === grooveBeat || beat < 0) return;
    grooveBeat = beat;
    const sub = beat % 4;
    if (sub === 0) playKick();
    else if (sub === 2) playStep();
    else playHat();
  }

  function feedback(kind) {
    if (!window.CasualSfx) return;
    if (kind === "perfect") window.CasualSfx.play("hitSoft", 0.22);
    else if (kind === "good") window.CasualSfx.play("tap", 0.18);
    else if (kind === "miss") window.CasualSfx.play("clickSoft", 0.12);
    else if (kind === "end") window.CasualSfx.play("fanfare", 0.28);
  }

  function getSongTime() {
    if (!playing) return -1e9;
    if (paused) return pauseOffset;
    return performance.now() - wallStart;
  }

  function captureSongTime() {
    if (!playing) return 0;
    if (paused) return pauseOffset;
    return Math.max(0, performance.now() - wallStart);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.max(1, rect.width);
    const nextH = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = nextW;
    H = nextH;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    laneW = W / LANES;
    receptorY = Math.max(48, Math.min(H * 0.16, 90));
    arrowSize = Math.min(laneW * 0.42, H * 0.07, 40);
  }

  function updateHud() {
    hudScore.textContent = score.toLocaleString("ko-KR");
    hudCombo.textContent = String(combo);
    const liveBest = Math.max(songBest(selectedId), score);
    hudBest.textContent = liveBest.toLocaleString("ko-KR");
  }

  function updateBests() {
    const b = songBest(selectedId);
    startBestEl.textContent = b.toLocaleString("ko-KR");
    resultBestEl.textContent = b.toLocaleString("ko-KR");
    hudBest.textContent = b.toLocaleString("ko-KR");
  }

  function renderSongs() {
    songListEl.innerHTML = "";
    SONGS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-item" + (s.id === selectedId ? " selected" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", s.id === selectedId ? "true" : "false");
      const best = songBest(s.id);
      btn.innerHTML =
        `<span class="song-diff ${s.difficulty}">${s.difficultyLabel}</span>` +
        `<span class="song-meta"><span class="song-title">${s.title}</span>` +
        `<span class="song-sub">BPM ${s.bpm} · ${s.bars}마디</span></span>` +
        `<span class="song-best">${best ? best.toLocaleString("ko-KR") : "—"}</span>`;
      btn.addEventListener("click", () => {
        selectedId = s.id;
        storage.setItem(LS_SONG, selectedId);
        renderSongs();
        updateBests();
      });
      songListEl.appendChild(btn);
    });
  }

  function showJudge(text, kind) {
    judgePopup.textContent = text;
    judgePopup.className = "judge-popup";
    void judgePopup.offsetWidth;
    judgePopup.classList.add("show-" + kind);
  }

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
    flashes.push({ lane, judge, t: performance.now() });
    pulse.lane = lane;
    pulse.perfect = judge === "perfect";
    pulse.until = performance.now() + (judge === "perfect" ? 380 : 160);
    showJudge(judge === "perfect" ? "PERFECT" : "GOOD", judge);
    playStep();
    feedback(judge);
  }

  function registerMiss(lane) {
    combo = 0;
    missCount++;
    updateHud();
    flashes.push({ lane, judge: "miss", t: performance.now() });
    showJudge("MISS", "miss");
    feedback("miss");
    // Groove + music keep going — miss must not duck master gain
  }

  function hitLane(lane) {
    if (!playing || paused) return;
    ensureAudio();
    const t = getSongTime();
    let best = null;
    let bestDelta = Infinity;
    for (const n of chart) {
      if (n.lane !== lane || n.judged) continue;
      const d = Math.abs(n.time - t);
      if (d < bestDelta) {
        bestDelta = d;
        best = n;
      }
    }
    if (best && bestDelta <= goodMs) {
      best.judged = true;
      registerHit(lane, bestDelta <= perfectMs ? "perfect" : "good");
    } else {
      playTone(280, 120, 0.05, "triangle", 0.04);
      flashes.push({ lane, judge: "empty", t: performance.now() });
      pulse.lane = lane;
      pulse.perfect = false;
      pulse.until = performance.now() + 90;
    }
  }

  function checkMisses(t) {
    for (const n of chart) {
      if (!n.judged && t > n.time + goodMs) {
        n.judged = true;
        registerMiss(n.lane);
      }
    }
    if (t > songEndTime) endGame();
  }

  function prepare() {
    const song = currentSong();
    const data = buildChart(song);
    chart = data.notes.map((n) => ({ time: n.time, lane: n.lane, judged: false }));
    travelMs = data.travelMs;
    perfectMs = data.perfectMs;
    goodMs = data.goodMs;
    songEndTime = data.durationMs;
    bpm = data.bpm;
    beatMs = 60000 / bpm;
  }

  function resetStats() {
    score = combo = maxCombo = 0;
    perfectCount = goodCount = missCount = 0;
    pauseOffset = 0;
    grooveBeat = -1;
    chart.forEach((n) => {
      n.judged = false;
    });
    flashes.length = 0;
    updateHud();
  }

  function actuallyStart() {
    resetStats();
    ensureAudio();
    if (window.CasualSfx) window.CasualSfx.unlock();
    wallStart = performance.now();
    playing = true;
    paused = false;
    pauseOverlay.classList.add("hidden");
  }

  function pauseGame() {
    if (!playing || paused) return;
    pauseOffset = captureSongTime();
    paused = true;
    if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
    pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!playing) {
      pauseOverlay.classList.add("hidden");
      return;
    }
    pauseOverlay.classList.add("hidden");
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    wallStart = performance.now() - pauseOffset;
    grooveBeat = Math.floor(pauseOffset / beatMs);
    paused = false;
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    countdownEl.classList.add("hidden");
  }

  function beginCountdown(cb) {
    clearCountdown();
    countdownEl.classList.remove("hidden");
    let n = 3;
    countdownEl.textContent = String(n);
    const step = () => {
      n--;
      if (n > 0) {
        countdownEl.textContent = String(n);
        countdownTimer = setTimeout(step, 500);
      } else {
        countdownEl.textContent = "출발!";
        countdownTimer = setTimeout(() => {
          countdownEl.classList.add("hidden");
          countdownTimer = null;
          cb();
        }, 360);
      }
    };
    countdownTimer = setTimeout(step, 500);
  }

  function endGame() {
    if (!playing) return;
    playing = false;
    paused = false;
    clearCountdown();
    pauseOverlay.classList.add("hidden");
    const total = chart.length || 1;
    const acc = ((perfectCount + goodCount * 0.7) / total) * 100;
    const rank = acc >= 97 ? "S" : acc >= 90 ? "A" : acc >= 75 ? "B" : acc >= 50 ? "C" : "D";
    const prev = songBest(selectedId);
    const isNew = score > prev;
    if (isNew) saveBest(selectedId, score);
    updateBests();
    renderSongs();
    resultRankEl.textContent = rank;
    resultScoreEl.textContent = score.toLocaleString("ko-KR");
    resultComboEl.textContent = String(maxCombo);
    resultAccEl.textContent = acc.toFixed(1) + "%";
    resultNewBestEl.classList.toggle("hidden", !isNew);
    resultOverlay.classList.remove("hidden");
    feedback("end");
  }

  function drawArrow(cx, cy, size, color, hollow, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = hollow ? 2.5 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.42, 0);
    ctx.lineTo(size * 0.18, 0);
    ctx.lineTo(size * 0.18, size * 0.5);
    ctx.lineTo(-size * 0.18, size * 0.5);
    ctx.lineTo(-size * 0.18, 0);
    ctx.lineTo(-size * 0.42, 0);
    ctx.closePath();
    if (hollow) {
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.55;
      ctx.stroke();
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.12;
      ctx.fill();
    } else {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function laneRotation(lane) {
    if (lane === 0) return -Math.PI / 2;
    if (lane === 1) return Math.PI;
    if (lane === 2) return 0;
    return Math.PI / 2;
  }

  function drawReceptor(i, now) {
    const cx = (i + 0.5) * laneW;
    const glowing = pulse.lane === i && now < pulse.until;
    const span = pulse.perfect ? 380 : 160;
    const pulseA = glowing ? Math.max(0, pulse.until - now) / span : 0;
    const perfectGlow = glowing && pulse.perfect;

    // Receptor plate
    ctx.save();
    ctx.fillStyle = glowing
      ? `rgba(${hexToRgb(LANE_COLORS[i])},${0.22 + pulseA * (perfectGlow ? 0.82 : 0.35)})`
      : "rgba(8,12,28,0.55)";
    ctx.strokeStyle = perfectGlow ? "#b6ff3d" : LANE_COLORS[i];
    ctx.lineWidth = perfectGlow ? 4 : 2;
    ctx.globalAlpha = glowing ? 1 : 0.55;
    const r = arrowSize * (perfectGlow ? 1.12 : 0.95);
    roundRect(cx - r, receptorY - r, r * 2, r * 2, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Timing ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, receptorY, r + 4 + (perfectGlow ? pulseA * 10 : 0), 0, Math.PI * 2);
    ctx.strokeStyle = perfectGlow ? "#b6ff3d" : LANE_COLORS[i];
    ctx.globalAlpha = 0.28 + pulseA * (perfectGlow ? 0.95 : 0.5);
    ctx.lineWidth = perfectGlow ? 3.6 : 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, receptorY);
    ctx.rotate(laneRotation(i));
    drawArrow(0, 0, arrowSize * 0.92, perfectGlow ? "#b6ff3d" : LANE_COLORS[i], true, glowing ? 1 : 0.75);
    ctx.restore();
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function roundRect(x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (W < 2 || H < 2) return;
    ctx.clearRect(0, 0, W, H);

    // Stage wash
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(57,243,255,0.07)");
    g.addColorStop(0.35, "rgba(255,79,216,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Floor perspective stripes
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const y = H * (0.35 + i * 0.08);
      ctx.strokeStyle = `rgba(57,243,255,${0.04 + i * 0.008})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    const now = performance.now();
    const t = playing ? getSongTime() : -1e9;

    // Lanes + separators
    for (let i = 0; i < LANES; i++) {
      const x = i * laneW;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.012)";
      ctx.fillRect(x, 0, laneW, H);
      ctx.fillStyle = `rgba(${hexToRgb(LANE_COLORS[i])},0.05)`;
      ctx.fillRect(x + laneW * 0.12, 0, laneW * 0.76, H);

      if (i > 0) {
        ctx.strokeStyle = "rgba(120,160,220,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }

    // Beat guide lines rising toward receptor (visual sync only)
    if (playing && t >= 0) {
      const travelDist = H - receptorY - 16;
      for (let k = 0; k < 6; k++) {
        const nextBeat = (Math.floor(t / beatMs) + k + 1) * beatMs;
        const spawn = nextBeat - travelMs;
        const progress = (t - spawn) / travelMs;
        if (progress < 0 || progress > 1.1) continue;
        const y = H - 8 - progress * travelDist;
        ctx.strokeStyle = `rgba(57,243,255,${0.08 * (1 - Math.abs(progress - 0.5))})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    // Receptor row highlight bar
    ctx.fillStyle = "rgba(10,16,40,0.45)";
    ctx.fillRect(0, receptorY - arrowSize * 1.15, W, arrowSize * 2.3);
    ctx.strokeStyle = "rgba(57,243,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, receptorY);
    ctx.lineTo(W, receptorY);
    ctx.stroke();

    for (let i = 0; i < LANES; i++) drawReceptor(i, now);

    // Notes (also freeze-draw while paused)
    if (playing) {
      if (!paused) {
        checkMisses(t);
        tickGroove(t);
      }
      const travelDist = H - receptorY - 16;
      for (const n of chart) {
        if (n.judged) continue;
        const spawn = n.time - travelMs;
        if (t < spawn - 40) continue;
        const progress = (t - spawn) / travelMs;
        const y = H - 8 - Math.min(progress, 1.35) * travelDist;
        if (y < -50) continue;
        const near = Math.abs(progress - 1);
        const alpha = near < 0.12 ? 1 : 0.85;
        const cx = (n.lane + 0.5) * laneW;
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(laneRotation(n.lane));
        drawArrow(0, 0, arrowSize * 0.95, LANE_COLORS[n.lane], false, alpha);
        ctx.restore();
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = now - f.t;
      const life = f.judge === "perfect" ? 520 : 280;
      if (age > life) {
        flashes.splice(i, 1);
        continue;
      }
      const a = 1 - age / life;
      const rgb =
        f.judge === "perfect"
          ? "182,255,61"
          : f.judge === "good"
            ? "57,243,255"
            : f.judge === "miss"
              ? "255,90,122"
              : "255,255,255";
      const strength = f.judge === "perfect" ? 0.88 : 0.32;
      ctx.fillStyle = `rgba(${rgb},${a * strength})`;
      const padH = arrowSize * (f.judge === "perfect" ? 3.4 : 2.8);
      ctx.fillRect(f.lane * laneW, receptorY - padH * 0.5, laneW, padH);
      if (f.judge === "perfect") {
        ctx.strokeStyle = `rgba(182,255,61,${a * 0.85})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(
          f.lane * laneW + 3,
          receptorY - padH * 0.5 + 3,
          laneW - 6,
          padH - 6
        );
      }
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    draw();
  }

  pads.forEach((btn) => {
    const lane = parseInt(btn.dataset.lane, 10);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("pressed");
      ensureAudio();
      if (window.CasualSfx) window.CasualSfx.unlock();
      hitLane(lane);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      btn.addEventListener(ev, () => btn.classList.remove("pressed"))
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "Escape" && playing && !paused && resultOverlay.classList.contains("hidden")) {
      e.preventDefault();
      pauseGame();
      return;
    }
    const lane = KEY_TO_LANE[e.key.toLowerCase()];
    if (lane == null) return;
    e.preventDefault();
    pads[lane].classList.add("pressed");
    setTimeout(() => pads[lane].classList.remove("pressed"), 100);
    hitLane(lane);
  });

  btnStart.addEventListener("click", () => {
    prepare();
    startOverlay.classList.add("hidden");
    ensureAudio();
    if (window.CasualSfx) window.CasualSfx.unlock();
    beginCountdown(actuallyStart);
  });

  btnRetry.addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    prepare();
    beginCountdown(actuallyStart);
  });

  btnSongSelect.addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    startOverlay.classList.remove("hidden");
    playing = false;
    paused = false;
    clearCountdown();
    renderSongs();
    updateBests();
  });

  btnResume.addEventListener("click", () => {
    resumeGame();
  });

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
    if (master) master.gain.value = soundOn ? 1 : 0;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing && !paused) pauseGame();
  });

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  btnSound.classList.toggle("muted", !soundOn);
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  renderSongs();
  updateBests();
  updateHud();
  resize();
  requestAnimationFrame(() => {
    resize();
    loop();
  });
})();
