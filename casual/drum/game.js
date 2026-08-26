(() => {
  "use strict";

  const LANES = 4;
  const LANE_KEYS = ["z", "x", "c", "v"];
  const LANE_COLORS = ["#ffd56a", "#ff6b4a", "#5ec8ff", "#9dff6a"];
  const LANE_GLOW = ["rgba(255,213,106,0.55)", "rgba(255,107,74,0.5)", "rgba(94,200,255,0.5)", "rgba(157,255,106,0.5)"];
  const LS_BEST = "drum_best_v1";
  const LS_SOUND = "drum_sound_v1";
  const LS_SONG = "drum_song_v1";

  const SONGS = [
    { id: "easy", title: "연습 그루브", difficulty: "easy", difficultyLabel: "쉬움", bpm: 96, fallMs: 2300 },
    { id: "normal", title: "스튜디오 세션", difficulty: "normal", difficultyLabel: "보통", bpm: 112, fallMs: 1950 },
    { id: "hard", title: "라이브 피날레", difficulty: "hard", difficultyLabel: "어려움", bpm: 132, fallMs: 1680 },
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
      localStorage.setItem("__d", "1");
      localStorage.removeItem("__d");
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
  let fallMs = 2200;
  let perfectMs = 75;
  let goodMs = 155;
  let songEndTime = 4000;
  let bpm = 96;
  let W = 0,
    H = 0,
    dpr = 1,
    laneW = 0,
    hitY = 0;
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
    master = null,
    grooveGain = null;
  let wallStart = 0,
    pauseOffset = 0;
  let grooveBeat = -1;
  let beatMs = 625;
  let lastMissPopupAt = 0;
  let countdownTimer = null;
  const flashes = [];
  const pressedUntil = [0, 0, 0, 0];

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

  function pushNote(notes, t, lane, seen) {
    const key = t + ":" + lane;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({ time: t, lane, judged: false });
  }

  /** Pattern-based charts: readable on easy, denser on hard, no random clutter. */
  function buildChart(song) {
    const beat = 60000 / song.bpm;
    const notes = [];
    const seen = new Set();
    const startBeat = 4;
    const bars = song.difficulty === "easy" ? 10 : song.difficulty === "normal" ? 12 : 14;
    const endBeat = startBeat + bars * 4;

    for (let b = startBeat; b < endBeat; b++) {
      const t = Math.round(b * beat);
      const step = b % 4;
      const bar = Math.floor((b - startBeat) / 4);

      if (song.difficulty === "easy") {
        // Kick on 1 & 3, snare on 2 & 4, soft hat on off-beats of bars 4+
        if (step === 0 || step === 2) pushNote(notes, t, 0, seen);
        if (step === 1 || step === 3) pushNote(notes, t, 1, seen);
        if (bar >= 4 && step === 0) pushNote(notes, Math.round(t + beat * 0.5), 2, seen);
        if (bar >= 7 && step === 2) pushNote(notes, Math.round(t + beat * 0.5), 2, seen);
      } else if (song.difficulty === "normal") {
        if (step === 0 || step === 2) pushNote(notes, t, 0, seen);
        if (step === 1 || step === 3) pushNote(notes, t, 1, seen);
        // Hats on every off-eighth
        pushNote(notes, Math.round(t + beat * 0.5), 2, seen);
        // Occasional tom fill every 4th bar on beat 4
        if (bar % 4 === 3 && step === 3) {
          pushNote(notes, t, 3, seen);
          pushNote(notes, Math.round(t + beat * 0.5), 3, seen);
        }
        // Kick ghost on & of 2 in mid section
        if (bar >= 4 && bar % 2 === 1 && step === 1) {
          pushNote(notes, Math.round(t + beat * 0.5), 0, seen);
        }
      } else {
        // Hard: kick/snare spine + offbeat hats (thinned for small screens) + tom accents
        if (step === 0) {
          pushNote(notes, t, 0, seen);
          pushNote(notes, Math.round(t + beat * 0.5), 0, seen);
        } else if (step === 2) {
          pushNote(notes, t, 0, seen);
          if (bar % 2 === 1) pushNote(notes, Math.round(t + beat * 0.25), 0, seen);
        }
        if (step === 1 || step === 3) pushNote(notes, t, 1, seen);
        // Hats on & only — avoids stacking on kick/snare downbeats
        pushNote(notes, Math.round(t + beat * 0.5), 2, seen);
        // Sparse 16th flourishes every 4 bars (was every 2 — too dense on narrow lanes)
        if (bar % 4 === 0 && step === 0) {
          pushNote(notes, Math.round(t + beat * 0.25), 2, seen);
          pushNote(notes, Math.round(t + beat * 0.75), 2, seen);
        }
        // Tom rolls into bar ends
        if (step === 3) {
          pushNote(notes, Math.round(t + beat * 0.25), 3, seen);
          pushNote(notes, Math.round(t + beat * 0.5), 3, seen);
          if (bar % 4 === 3) pushNote(notes, Math.round(t + beat * 0.75), 3, seen);
        }
      }
    }

    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    const last = notes.length ? notes[notes.length - 1].time : 4000;
    return {
      notes,
      fallMs: song.fallMs,
      perfectMs: song.difficulty === "hard" ? 58 : song.difficulty === "normal" ? 68 : 82,
      goodMs: song.difficulty === "hard" ? 130 : song.difficulty === "normal" ? 148 : 168,
      durationMs: last + 2400,
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
      grooveGain = audioCtx.createGain();
      grooveGain.gain.value = 0.55;
      grooveGain.connect(master);
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playHit(lane) {
    if (!ensureAudio() || !master) return;
    const now = audioCtx.currentTime;
    if (lane === 0) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(55, now);
      o.frequency.exponentialRampToValueAtTime(32, now + 0.12);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + 0.3);
    } else if (lane === 1) {
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.18));
      const src = audioCtx.createBufferSource();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800;
      src.buffer = buf;
      g.gain.value = 0.32;
      src.connect(f).connect(g).connect(master);
      src.start(now);
    } else if (lane === 2) {
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.25));
      const src = audioCtx.createBufferSource();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      src.buffer = buf;
      g.gain.value = 0.2;
      src.connect(f).connect(g).connect(master);
      src.start(now);
    } else {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(90, now + 0.2);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(0.26, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + 0.28);
    }
  }

  function playGrooveTick(accent) {
    if (!ensureAudio() || !grooveGain || !soundOn) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = accent ? 660 : 440;
    const peak = accent ? 0.045 : 0.022;
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(g).connect(grooveGain);
    o.start(now);
    o.stop(now + 0.06);
  }

  /** Song-time synced groove — pause/resume stays on beat; miss never stops it. */
  function tickGroove(songTime) {
    if (!playing || paused || !soundOn || songTime < 0) return;
    const beat = Math.floor(songTime / beatMs);
    if (beat === grooveBeat || beat < 0) return;
    grooveBeat = beat;
    playGrooveTick(beat % 4 === 0);
  }

  function buzz(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  function feedback(kind) {
    if (!window.CasualSfx) return;
    // Judgment SFX stay quieter than the Web Audio groove/hits
    const roles = { perfect: "combo", good: "hit", miss: "fail", end: "fanfare" };
    const vols = { perfect: 0.14, good: 0.12, miss: 0.1, end: 0.22 };
    window.CasualSfx.play(roles[kind] || "click", vols[kind] != null ? vols[kind] : 0.15);
  }

  function getSongTime() {
    if (!playing) return -1e9;
    if (paused) return pauseOffset;
    return performance.now() - wallStart;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    laneW = W / LANES;
    hitY = H * 0.8;
  }
  window.addEventListener("resize", resize);

  function updateHud() {
    hudScore.textContent = score.toLocaleString("ko-KR");
    hudCombo.textContent = String(combo);
    hudBest.textContent = songBest(selectedId).toLocaleString("ko-KR");
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
        `<span class="song-sub">BPM ${s.bpm} · 약 30초</span></span>` +
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

  function flashPad(lane, strong) {
    const btn = pads[lane];
    if (!btn) return;
    btn.classList.remove("hit-flash");
    void btn.offsetWidth;
    btn.classList.add("pressed", "hit-flash");
    if (strong) btn.classList.add("hit-flash-strong");
    else btn.classList.remove("hit-flash-strong");
    pressedUntil[lane] = performance.now() + 100;
    setTimeout(() => {
      if (performance.now() >= pressedUntil[lane] - 5) {
        btn.classList.remove("pressed", "hit-flash", "hit-flash-strong");
      }
    }, 110);
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
    showJudge(judge === "perfect" ? "퍼펙트!" : "굿!", judge);
    playHit(lane);
    flashPad(lane, judge === "perfect");
    buzz(judge === "perfect" ? 14 : 10);
    feedback(judge);
  }

  function registerMiss(lane) {
    combo = 0;
    missCount++;
    updateHud();
    flashes.push({ lane, judge: "miss", t: performance.now() });
    const now = performance.now();
    // Avoid miss-popup spam when several notes expire together
    if (now - lastMissPopupAt > 90) {
      showJudge("미스", "miss");
      lastMissPopupAt = now;
      feedback("miss");
    }
    // Groove is song-time driven — miss must never silence it
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
      // Notes far ahead aren't candidates
      if (n.time - t > goodMs + 80) break;
    }
    if (best && bestDelta <= goodMs) {
      best.judged = true;
      registerHit(lane, bestDelta <= perfectMs ? "perfect" : "good");
    } else {
      playHit(lane);
      flashPad(lane, false);
      buzz(6);
      flashes.push({ lane, judge: "empty", t: performance.now() });
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
    fallMs = data.fallMs;
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
    lastMissPopupAt = 0;
    flashes.length = 0;
    chart.forEach((n) => {
      n.judged = false;
    });
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
    // Capture song time BEFORE flipping paused
    pauseOffset = Math.max(0, performance.now() - wallStart);
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
    paused = false;
    wallStart = performance.now() - pauseOffset;
    grooveBeat = Math.floor(pauseOffset / beatMs);
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    countdownEl.classList.add("hidden");
    countdownEl.textContent = "";
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
        countdownEl.textContent = "시작!";
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
    grooveBeat = -1;
    pauseOverlay.classList.add("hidden");
    const total = chart.length || 1;
    const hit = perfectCount + goodCount;
    const acc = ((perfectCount + goodCount * 0.7) / total) * 100;
    const rank =
      acc >= 97 && missCount === 0
        ? "S"
        : acc >= 90
        ? "A"
        : acc >= 75
        ? "B"
        : acc >= 50
        ? "C"
        : "D";
    const prev = songBest(selectedId);
    const isNew = score > prev;
    if (isNew) saveBest(selectedId, score);
    updateBests();
    renderSongs();
    resultRankEl.textContent = rank;
    resultScoreEl.textContent = score.toLocaleString("ko-KR");
    resultComboEl.textContent = String(maxCombo);
    resultAccEl.textContent = acc.toFixed(1) + "%";
    resultAccEl.title = `히트 ${hit}/${total}`;
    resultNewBestEl.classList.toggle("hidden", !isNew);
    resultOverlay.classList.remove("hidden");
    feedback("end");
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawReceptors(t) {
    for (let i = 0; i < LANES; i++) {
      const cx = (i + 0.5) * laneW;
      const w = laneW * 0.62;
      const h = 28;
      // Outer guide
      ctx.strokeStyle = "rgba(255,244,232,0.18)";
      ctx.lineWidth = 2;
      roundRect(cx - w / 2, hitY - h / 2, w, h, 10);
      ctx.stroke();
      // Soft fill
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      roundRect(cx - w / 2, hitY - h / 2, w, h, 10);
      ctx.fill();

      // Pulse when a note is near the hit line
      if (playing && !paused && t >= 0) {
        let near = false;
        for (const n of chart) {
          if (n.lane !== i || n.judged) continue;
          if (Math.abs(n.time - t) < perfectMs + 40) {
            near = true;
            break;
          }
          if (n.time - t > fallMs) break;
        }
        if (near) {
          ctx.strokeStyle = LANE_COLORS[i];
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2.5;
          roundRect(cx - w / 2 - 2, hitY - h / 2 - 2, w + 4, h + 4, 12);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Lane columns
    for (let i = 0; i < LANES; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.012)";
      ctx.fillRect(i * laneW, 0, laneW, H);
      // Vertical lane edge
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo((i + 1) * laneW, 0);
      ctx.lineTo((i + 1) * laneW, H);
      ctx.stroke();
    }

    // Hit line band
    const band = 36;
    const grad = ctx.createLinearGradient(0, hitY - band, 0, hitY + band);
    grad.addColorStop(0, "rgba(255,179,71,0)");
    grad.addColorStop(0.5, "rgba(255,179,71,0.12)");
    grad.addColorStop(1, "rgba(255,179,71,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, hitY - band, W, band * 2);

    ctx.strokeStyle = "rgba(255,212,122,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(W, hitY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,212,122,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, hitY - 14);
    ctx.lineTo(W, hitY - 14);
    ctx.moveTo(0, hitY + 14);
    ctx.lineTo(W, hitY + 14);
    ctx.stroke();

    const t = playing ? getSongTime() : -1e9;
    drawReceptors(t);

    // Notes freeze at pauseOffset while paused; groove only ticks when live
    if (playing) {
      if (!paused) {
        checkMisses(t);
        tickGroove(t);
      }
      const narrow = W < 400;
      for (const n of chart) {
        if (n.judged) continue;
        const spawn = n.time - fallMs;
        if (t < spawn - 80) continue;
        const progress = (t - spawn) / fallMs;
        if (progress > 1.4) continue;
        const y = Math.min(progress, 1.4) * hitY;
        // Hat lane: thinner + slight stagger so dense 16ths don't blob together
        const isHat = n.lane === 2;
        const noteH = isHat ? (narrow ? 18 : 20) : 26;
        const baseW = isHat ? (narrow ? 0.38 : 0.44) : 0.56;
        const stagger =
          isHat && beatMs > 0
            ? (((Math.round(n.time / (beatMs * 0.25)) % 2) * 2 - 1) * laneW * (narrow ? 0.06 : 0.04))
            : 0;
        const cx = (n.lane + 0.5) * laneW + stagger;
        const proximity = 1 - Math.min(1, Math.abs(n.time - t) / (fallMs * 0.45));
        const w = laneW * (baseW + proximity * (isHat ? 0.04 : 0.06));
        const color = LANE_COLORS[n.lane];
        const radius = isHat ? 7 : 9;

        ctx.shadowColor = color;
        ctx.shadowBlur = isHat ? 5 + proximity * 8 : 8 + proximity * 14;
        ctx.fillStyle = color;
        roundRect(cx - w / 2, y - noteH / 2, w, noteH, radius);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        roundRect(cx - w / 2 + 3, y - noteH / 2 + 3, w - 6, noteH * 0.38, 6);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.5;
        roundRect(cx - w / 2, y - noteH / 2, w, noteH, radius);
        ctx.stroke();
      }
    }

    const now = performance.now();
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = now - f.t;
      if (age > 280) {
        flashes.splice(i, 1);
        continue;
      }
      const a = 1 - age / 280;
      const ease = a * a;
      ctx.fillStyle =
        f.judge === "perfect"
          ? `rgba(255,213,106,${ease * 0.4})`
          : f.judge === "good"
          ? `rgba(94,200,255,${ease * 0.32})`
          : f.judge === "miss"
          ? `rgba(255,90,90,${ease * 0.32})`
          : `rgba(255,255,255,${ease * 0.14})`;
      ctx.fillRect(f.lane * laneW, 0, laneW, H);

      // Ring burst at hit line
      if (f.judge === "perfect" || f.judge === "good") {
        const cx = (f.lane + 0.5) * laneW;
        ctx.strokeStyle = LANE_GLOW[f.lane];
        ctx.globalAlpha = ease;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, hitY, 12 + (1 - ease) * 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
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
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add("pressed");
      ensureAudio();
      if (window.CasualSfx) window.CasualSfx.unlock();
      hitLane(lane);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      btn.addEventListener(ev, () => {
        if (performance.now() >= pressedUntil[lane]) btn.classList.remove("pressed", "hit-flash");
      })
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "Escape" && playing && !paused && resultOverlay.classList.contains("hidden")) {
      e.preventDefault();
      pauseGame();
      return;
    }
    const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
    if (idx < 0) return;
    e.preventDefault();
    ensureAudio();
    hitLane(idx);
    if (!playing || paused) flashPad(idx, false);
  });

  btnStart.addEventListener("click", () => {
    prepare();
    startOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    ensureAudio();
    if (window.CasualSfx) window.CasualSfx.unlock();
    beginCountdown(actuallyStart);
  });

  btnRetry.addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    prepare();
    beginCountdown(actuallyStart);
  });

  btnSongSelect.addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    playing = false;
    paused = false;
    grooveBeat = -1;
    clearCountdown();
    startOverlay.classList.remove("hidden");
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

  btnSound.classList.toggle("muted", !soundOn);
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  renderSongs();
  updateBests();
  updateHud();
  resize();
  loop();
})();
