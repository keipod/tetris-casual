(() => {
  "use strict";

  const LS_BEST = "shootingrange.best";
  const LS_SOUND = "shootingrange.sound";
  const W = 640;
  const H = 400;
  const TAU = Math.PI * 2;
  const PAD = 6;              // 모바일 관대한 판정 여유
  const MAG = 8;              // 탄약
  const RELOAD_S = 1.2;
  const ROUND_TIME = 45;
  const MIN_SHOT_GAP = 0.09;

  // 레인: [원거리, 중거리, 근거리] — 그리기 순서 far → near
  const ROWS = [
    { base: 134, dir: 1,  speed: 74, scale: 0.58, max: 4, interval: 1.7 }, // 원거리: 빠르고 작음
    { base: 198, dir: -1, speed: 46, scale: 0.78, max: 3, interval: 2.0 }, // 중거리: 오른→왼
    { base: 262, dir: 1,  speed: 26, scale: 1.00, max: 3, interval: 2.5 }, // 근거리: 느리고 큼
  ];

  const TYPES = {
    duck:    { pts: 10, w: 64, h: 44, stick: 22 },
    gold:    { pts: 50, w: 64, h: 44, stick: 22 },
    bottle:  { pts: 2,  w: 26, h: 54, stick: 12 },
    balloon: { pts: 1,  w: 40, h: 44, stick: 18 },
  };

  // 레인별 출현 가중치 [far, mid, near]
  const MIX = [
    { duck: 0.22, bottle: 0.30, balloon: 0.48 },
    { duck: 0.42, bottle: 0.30, balloon: 0.28 },
    { duck: 0.62, bottle: 0.22, balloon: 0.16 },
  ];
  const GOLD_CHANCE = 0.07;

  const BALLOON_COLORS = ["#ff6b6b", "#ffd166", "#6bd6a8", "#69b7ff", "#c792ea"];
  const MUZZLE = { x: 314, y: 340 };
  const COUNTER_TOP = 304;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOutBack = (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

  function goalFor(r) { return 200 + (r - 1) * 150 + ((r - 1) * (r - 2) / 2) * 50; }
  function speedMul(r) { return Math.min(2.2, 1 + 0.16 * (r - 1)); }
  function spawnMul(r) { return Math.max(0.55, Math.pow(0.93, r - 1)); }

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  function readBest() {
    try {
      const rec = JSON.parse(storage.getItem(LS_BEST) || "null");
      if (rec && typeof rec.score === "number") return rec;
    } catch (_) {}
    return { score: 0, round: 1 };
  }
  function writeBest(rec) {
    try { storage.setItem(LS_BEST, JSON.stringify(rec)); } catch (_) {}
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const elScore = document.getElementById("score");
  const elRound = document.getElementById("round");
  const ammoChip = document.getElementById("ammo-chip");
  const elAmmo = document.getElementById("ammo");
  const elAmmoNote = document.getElementById("ammo-note");
  const timebar = document.querySelector(".timebar");
  const elTimeFill = document.getElementById("time-fill");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  for (let i = 0; i < MAG; i++) {
    const dot = document.createElement("i");
    elAmmo.appendChild(dot);
  }
  const ammoDots = Array.from(elAmmo.children);

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(role, vol) {
    if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
  }
  function syncSoundBtn() { btnSound.classList.toggle("muted", !soundOn); }
  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) { window.CasualSfx.unlock(); sfx("click", 0.5); }
    }
  });
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();
  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  const view = { scale: 1 };
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(rect.width / W, rect.height / H);
    const cssW = Math.max(1, Math.floor(W * scale));
    const cssH = Math.max(1, Math.floor(H * scale));
    view.scale = scale;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / view.scale, 0, W),
      y: clamp((e.clientY - rect.top) / view.scale, 0, H),
    };
  }

  let phase = "ready"; // ready | playing | clear | paused | over
  let score = 0;
  let round = 1;
  let goal = goalFor(1);
  let timeLeft = ROUND_TIME;
  let fired = 0;
  let hits = 0;
  let streak = 0;
  let ammo = MAG;
  let reloading = false;
  let reloadT = 0;
  let lastShotAt = -9;
  let clearT = 0;
  let elapsed = 0;

  const reticle = { x: W / 2, y: H * 0.55, ax: W / 2, ay: H * 0.55, kick: 0 };
  let shake = 0;
  let muzzleT = 0;
  let toast = null;   // { text, sub, t, life }
  let banner = null;

  const holes = [];
  const parts = [];
  const pops = [];
  const MAXP = 240;
  const MAXU = 24;

  // 과녁: rows[ri] 배열
  const lanes = [[], [], []];
  const spawnT = [rand(0.3, 1), rand(0.3, 1), rand(0.3, 1)];

  const STARS = [];
  for (let i = 0; i < 42; i++) {
    STARS.push({ x: rand(8, W - 8), y: rand(58, 200), p: rand(0, TAU), r: rand(0.6, 1.5) });
  }

  function updateScoreHud() { elScore.textContent = String(score); }
  function updateRoundHud() { elRound.textContent = String(round); }
  function updateAmmoHud() {
    for (let i = 0; i < MAG; i++) ammoDots[i].classList.toggle("full", i < ammo);
    ammoChip.classList.toggle("reloading", reloading);
    elAmmoNote.textContent = reloading ? "재장전…" : "";
  }
  function updateTimeHud() {
    const pct = clamp(timeLeft / ROUND_TIME, 0, 1) * 100;
    elTimeFill.style.width = `${pct}%`;
    timebar.classList.toggle("low", phase === "playing" && timeLeft <= 10);
  }
  function flashDry() {
    ammoChip.classList.remove("dry");
    void ammoChip.offsetWidth;
    ammoChip.classList.add("dry");
  }

  function spawnPart(o) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.t >= p.life) { Object.assign(p, o, { t: 0 }); return; }
    }
    if (parts.length < MAXP) parts.push(Object.assign({ t: 0 }, o));
  }
  function spawnPop(x, y, text, color, size) {
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i];
      if (p.t >= p.life) { Object.assign(p, { x, y, text, color, size, t: 0, life: 0.85 }); return; }
    }
    if (pops.length < MAXU) pops.push({ x, y, text, color, size, t: 0, life: 0.85 });
  }

  function burstShards(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 220);
      spawnPart({
        kind: "shard", x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 140),
        g: 900, rot: rand(0, TAU), vr: rand(-9, 9),
        size: rand(3, 7), life: rand(0.6, 0.95),
        color: Math.random() < 0.5 ? "#bfe8d0" : "#8fd8ae",
      });
    }
    spawnPart({ kind: "ring", x, y, size: 6, vr: 0, g: 0, vx: 0, vy: 0, life: 0.32, color: "rgba(220,255,235,0.8)" });
  }
  function burstScrap(x, y, color) {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU);
      const sp = rand(50, 190);
      spawnPart({
        kind: "scrap", x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(20, 90),
        g: 620, rot: 0, vr: 0, size: rand(2, 4.5), life: rand(0.45, 0.7), color,
      });
    }
    spawnPart({ kind: "ring", x, y, size: 8, vr: 0, g: 0, vx: 0, vy: 0, life: 0.3, color: "rgba(255,255,255,0.75)" });
  }
  function burstSplinters(x, y, dark) {
    for (let i = 0; i < 6; i++) {
      spawnPart({
        kind: "splinter", x, y,
        vx: rand(-110, 110), vy: rand(-190, -50),
        g: 800, rot: rand(0, TAU), vr: rand(-10, 10),
        size: rand(2.5, 5), life: rand(0.5, 0.8),
        color: dark ? "#5a3a22" : (Math.random() < 0.5 ? "#8a5a33" : "#6b4226"),
      });
    }
    spawnPart({ kind: "puff", x, y, size: 4, vr: 0, g: 0, vx: 0, vy: -14, life: 0.45, color: dark ? "rgba(120,90,60,0.5)" : "rgba(230,210,180,0.4)" });
  }
  function burstSparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      spawnPart({
        kind: "spark", x: x + rand(-14, 14), y: y + rand(-14, 14),
        vx: rand(-40, 40), vy: rand(-120, -30),
        g: 160, rot: rand(0, TAU), vr: rand(-6, 6),
        size: rand(2.5, 5), life: rand(0.55, 0.9), color: "#ffd977",
      });
    }
  }
  function ejectCasing() {
    spawnPart({
      kind: "casing", x: 332, y: 352,
      vx: rand(70, 150), vy: rand(-320, -220),
      g: 1150, rot: rand(0, TAU), vr: rand(-14, 14),
      size: 4.5, life: 1.5, bounceY: 374, color: "#d9a441",
    });
  }

  function pickType(ri) {
    const m = MIX[ri];
    const r = Math.random();
    let type = r < m.duck ? "duck" : r < m.duck + m.bottle ? "bottle" : "balloon";
    if (type === "duck" && Math.random() < GOLD_CHANCE) type = "gold";
    return type;
  }

  function makeTarget(ri, x) {
    const row = ROWS[ri];
    const type = pickType(ri);
    const def = TYPES[type];
    const mul = speedMul(round);
    return {
      type, row: ri,
      x,
      vx: row.dir * row.speed * mul * rand(0.9, 1.12),
      s: row.scale,
      face: row.dir,
      phase: rand(0, TAU),
      bobAmp: type === "balloon" ? 5 : 3,
      bobY: 0, tilt: 0, cy: 0,
      state: "alive",
      deathT: 0,
      sparkT: 0,
      color: BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0],
    };
  }

  function entryX(ri) {
    return ROWS[ri].dir === 1 ? -70 : W + 70;
  }

  function seedRows() {
    for (let ri = 0; ri < 3; ri++) {
      lanes[ri].length = 0;
      const count = ROWS[ri].max - 1;
      for (let i = 0; i < count; i++) {
        const frac = (i + 0.5) / count;
        const x = ROWS[ri].dir === 1 ? frac * W : W - frac * W;
        lanes[ri].push(makeTarget(ri, clamp(x + rand(-36, 36), 40, W - 40)));
      }
      spawnT[ri] = rand(0.4, ROWS[ri].interval);
    }
  }

  function updateLanes(dt) {
    for (let ri = 0; ri < 3; ri++) {
      const row = ROWS[ri];
      const arr = lanes[ri];
      let aliveCount = 0;
      for (let i = arr.length - 1; i >= 0; i--) {
        const t = arr[i];
        if (t.state === "alive") {
          t.x += t.vx * dt;
          const bob = Math.sin(elapsed * 2.1 + t.phase) * t.bobAmp;
          t.bobY = bob;
          t.tilt = Math.sin(elapsed * 1.4 + t.phase) * (t.type === "balloon" ? 0.11 : 0.06);
          const def = TYPES[t.type];
          t.cy = row.base + bob - (def.stick * t.s + def.h * t.s / 2);
          aliveCount++;
          if (t.type === "gold") {
            t.sparkT -= dt;
            if (t.sparkT <= 0) { t.sparkT = 0.28; burstSparks(t.x, t.cy, 1); }
          }
          if ((row.dir === 1 && t.x > W + 70) || (row.dir === -1 && t.x < -70)) arr.splice(i, 1);
        } else {
          t.deathT += dt;
          if (t.deathT > 0.5) arr.splice(i, 1);
        }
      }
      spawnT[ri] -= dt;
      if (spawnT[ri] <= 0) {
        if (aliveCount < row.max) {
          arr.push(makeTarget(ri, entryX(ri)));
          spawnT[ri] = row.interval * spawnMul(round) * rand(0.75, 1.25);
        } else {
          spawnT[ri] = 0.4;
        }
      }
    }
  }

  function hitTest(x, y) {
    for (let ri = 2; ri >= 0; ri--) { // 근거리 우선
      const arr = lanes[ri];
      for (let i = arr.length - 1; i >= 0; i--) {
        const t = arr[i];
        if (t.state !== "alive") continue;
        const def = TYPES[t.type];
        const hw = def.w * t.s / 2 + PAD;
        const hh = def.h * t.s / 2 + PAD;
        if (Math.abs(x - t.x) <= hw && Math.abs(y - t.cy) <= hh) return t;
      }
    }
    return null;
  }

  function fire(x, y) {
    if (phase !== "playing" || !helpOverlay.hidden) return;
    if (reloading) return;
    if (elapsed - lastShotAt < MIN_SHOT_GAP) return;
    if (ammo <= 0) {
      sfx("tick", 0.5);
      flashDry();
      startReload();
      return;
    }
    lastShotAt = elapsed;
    ammo--;
    fired++;
    updateAmmoHud();
    sfx("shoot", 0.5);
    muzzleT = 1;
    reticle.kick = 1;
    shake = 3.5;
    ejectCasing();

    const t = hitTest(x, y);
    if (t) {
      hits++;
      streak++;
      applyHit(t, x, y);
    } else {
      streak = 0;
      if (y >= COUNTER_TOP) burstSplinters(x, y, true);
      else {
        burstSplinters(x, y, false);
        holes.push({ x, y, age: 0 });
        if (holes.length > 14) holes.shift();
      }
    }
    if (ammo === 0) startReload();
  }

  function applyHit(t, px, py) {
    const def = TYPES[t.type];
    score += def.pts;
    updateScoreHud();
    t.state = "dying";
    t.deathT = 0;

    if (t.type === "duck") {
      sfx("hit", 0.6);
      spawnPop(t.x, t.cy - 18, `+${def.pts}`, "#ffe9c9", 15);
    } else if (t.type === "gold") {
      sfx("pickup", 0.65);
      burstSparks(t.x, t.cy, 10);
      spawnPop(t.x, t.cy - 20, `+${def.pts}`, "#ffd166", 20);
    } else if (t.type === "bottle") {
      sfx("explode", 0.55);
      burstShards(t.x, t.cy, 9);
      spawnPop(t.x, t.cy - 16, `+${def.pts}`, "#bfe8d0", 13);
    } else {
      sfx("tap", 0.5);
      burstScrap(t.x, t.cy, t.color);
      spawnPop(t.x, t.cy - 16, `+${def.pts}`, t.color, 13);
    }

    if (streak > 0 && streak % 10 === 0) {
      score += 100;
      updateScoreHud();
      sfx("combo", 0.65);
      spawnPop(px, py - 34, "연속 보너스 +100", "#ffd166", 19);
      burstSparks(px, py, 8);
    }
    checkGoal();
  }

  function checkGoal() {
    if (phase === "playing" && score >= goal) roundClear();
  }

  function startReload() {
    if (reloading || ammo === MAG) return;
    reloading = true;
    reloadT = RELOAD_S;
    sfx("rattle", 0.6);
    updateAmmoHud();
  }

  ammoChip.addEventListener("click", () => {
    if (phase !== "playing") return;
    sfx("click", 0.45);
    startReload();
  });

  function startRound(r) {
    round = r;
    goal = goalFor(r);
    timeLeft = ROUND_TIME;
    ammo = MAG;
    reloading = false;
    reloadT = 0;
    clearT = 0;
    phase = "playing";
    toast = { text: `라운드 ${r}`, sub: `목표 ${goal}점`, t: 0, life: 1.5 };
    updateRoundHud();
    updateAmmoHud();
    updateTimeHud();
    syncPauseBtn();
  }

  function roundClear() {
    phase = "clear";
    clearT = 0;
    banner = { t: 0, life: 1.8 };
    sfx("success", 0.6);
    setTimeout(() => sfx("fanfare", 0.7), 130);
    updateTimeHud();
    syncPauseBtn();
  }

  function gameOver() {
    phase = "over";
    sfx("lose", 0.6);
    const best = readBest();
    const isNew = score > best.score;
    if (isNew) writeBest({ score, round });
    const acc = fired > 0 ? Math.round((hits / fired) * 100) : 0;
    const shownBest = isNew ? score : best.score;
    overlayCard.innerHTML = `
      <h2>게임 오버</h2>
      ${isNew ? '<span class="new-best">🏆 신기록 달성!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${round}</span><span class="result-label">도달 라운드</span></div>
        <div class="result-item"><span class="result-num gold">${score}</span><span class="result-label">점수</span></div>
        <div class="result-item"><span class="result-num">${acc}%</span><span class="result-label">명중률</span></div>
        <div class="result-item"><span class="result-num">${shownBest}</span><span class="result-label">최고</span></div>
      </div>
      <p>목표 점수까지 조금 더! 다시 도전해보세요.</p>
      <button type="button" class="retry" id="btn-again">다시 도전</button>
    `;
    overlay.hidden = false;
    document.getElementById("btn-again").onclick = () => {
      sfx("click", 0.5);
      restart();
    };
    syncPauseBtn();
  }

  function showReady() {
    const best = readBest();
    overlayCard.innerHTML = `
      <h2>사격장</h2>
      <p>탭하여 발사! 45초 안에 목표 점수를 넘기세요.<br>오리 +10 · 병 +2 · 풍선 +1 · 황금 오리 +50</p>
      ${best.score > 0 ? `<p>최고 기록: <strong style="color:var(--gold)">${best.score}점</strong> (라운드 ${best.round})</p>` : ""}
      <button type="button" class="retry" id="btn-start">탭하여 시작!</button>
    `;
    overlay.hidden = false;
    document.getElementById("btn-start").onclick = () => {
      sfx("click", 0.5);
      restart();
    };
  }

  function showPause() {
    overlayCard.innerHTML = `
      <h2>일시정지</h2>
      <p>잠시 쉬어가는 중이에요.</p>
      <div class="btn-row">
        <button type="button" class="retry sub" id="btn-quit">처음부터</button>
        <button type="button" class="retry" id="btn-resume">계속하기</button>
      </div>
    `;
    overlay.hidden = false;
    document.getElementById("btn-resume").onclick = () => { sfx("click", 0.5); resumeGame(); };
    document.getElementById("btn-quit").onclick = () => {
      sfx("click", 0.5);
      overlay.hidden = true;
      phase = "ready";
      syncPauseBtn();
      showReady();
    };
  }

  function restart() {
    score = 0;
    fired = 0;
    hits = 0;
    streak = 0;
    holes.length = 0;
    parts.length = 0;
    pops.length = 0;
    reticle.kick = 0;
    shake = 0;
    muzzleT = 0;
    banner = null;
    toast = null;
    overlay.hidden = true;
    updateScoreHud();
    seedRows();
    startRound(1);
  }

  let prePause = "playing";
  function pauseGame() {
    if (phase !== "playing" && phase !== "clear") return;
    prePause = phase;
    phase = "paused";
    showPause();
    syncPauseBtn();
  }
  function resumeGame() {
    if (phase !== "paused") return;
    overlay.hidden = true;
    phase = prePause;
    syncPauseBtn();
  }
  function syncPauseBtn() {
    btnPause.classList.toggle("paused", phase === "paused");
    btnPause.disabled = !(phase === "playing" || phase === "clear" || phase === "paused");
    btnPause.style.opacity = btnPause.disabled ? "0.4" : "1";
  }

  btnPause.addEventListener("click", () => {
    if (phase === "playing" || phase === "clear") { sfx("click", 0.5); pauseGame(); }
    else if (phase === "paused") { sfx("click", 0.5); resumeGame(); }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = toWorld(e);
    reticle.ax = p.x;
    reticle.ay = p.y;
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = toWorld(e);
    reticle.ax = p.x;
    reticle.ay = p.y;
    fire(p.x, p.y);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      fire(reticle.x, reticle.y);
    } else if (e.key === "r" || e.key === "R") {
      if (phase === "playing") startReload();
    } else if (e.key === "Escape") {
      if (!helpOverlay.hidden) closeHelp();
      else if (phase === "playing" || phase === "clear") pauseGame();
      else if (phase === "paused") resumeGame();
    }
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    sfx("click", 0.5);
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }
  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
  }
  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => { sfx("click", 0.5); closeHelp(); });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  function updateFX(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.t >= p.life) continue;
      p.t += dt;
      if (p.kind === "ring") { p.size += dt * 170; continue; }
      if (p.kind === "puff") { p.size += dt * 26; p.y += p.vy * dt; continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.bounceY && p.y > p.bounceY && p.vy > 0) {
        p.y = p.bounceY;
        p.vy *= -0.45;
        p.vx *= 0.7;
        p.vr *= 0.6;
      }
    }
    for (let i = 0; i < pops.length; i++) {
      const u = pops[i];
      if (u.t >= u.life) continue;
      u.t += dt;
      u.y -= dt * 32;
    }
    for (let i = holes.length - 1; i >= 0; i--) {
      holes[i].age += dt;
      if (holes[i].age > 6) holes.splice(i, 1);
    }
    if (toast) {
      toast.t += dt;
      if (toast.t > toast.life) toast = null;
    }
    if (banner) {
      banner.t += dt;
      if (banner.t > banner.life) banner = null;
    }
    reticle.kick = Math.max(0, reticle.kick - reticle.kick * dt * 11 - dt * 0.4);
    shake = Math.max(0, shake - shake * dt * 9 - dt * 1.5);
    muzzleT = Math.max(0, muzzleT - dt * 12);
  }

  function update(dt) {
    elapsed += dt;
    updateFX(dt);

    // 조준선 지연 보간
    const k = 1 - Math.exp(-dt * 16);
    reticle.x += (reticle.ax - reticle.x) * k;
    reticle.y += (reticle.ay - reticle.y) * k;

    if (phase === "playing") {
      if (reloading) {
        reloadT -= dt;
        if (reloadT <= 0) {
          reloading = false;
          ammo = MAG;
          updateAmmoHud();
        }
      }
      updateLanes(dt);
      timeLeft -= dt;
      updateTimeHud();
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateTimeHud();
        if (score >= goal) roundClear();
        else gameOver();
      }
    } else if (phase === "clear") {
      updateLanes(dt * 0.35); // 클리어 연출 동안 살짝만 흐름
      clearT += dt;
      if (clearT >= 1.8) startRound(round + 1);
    }
  }

  function drawBackdrop(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, "#141c3f");
    sky.addColorStop(0.55, "#3a2050");
    sky.addColorStop(1, "#8a4a58");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 260);

    ctx.fillStyle = "#fff";
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + s.p));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,236,200,0.14)";
    ctx.beginPath(); ctx.arc(556, 106, 27, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffecc8";
    ctx.beginPath(); ctx.arc(556, 106, 15, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(200,170,130,0.5)";
    ctx.beginPath(); ctx.arc(551, 102, 3.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(561, 111, 2.4, 0, TAU); ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    const cx1 = ((t * 5) % (W + 240)) - 120;
    cloud(cx1, 96, 1);
    cloud(((t * 3.4 + 380) % (W + 240)) - 120, 138, 0.7);

    hill(238, "#3a2050", 26, 46);
    hill(250, "#241238", 18, 34);

    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(0, 132, W, 7);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, 132, W, 2);

    ctx.fillStyle = "#1d3b2a";
    ctx.fillRect(0, 172, W, 28);
    ctx.fillStyle = "#25492f";
    for (let x = 8; x < W; x += 34) {
      ctx.beginPath();
      ctx.arc(x, 172, 9, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 196, W, 4);

    const water = ctx.createLinearGradient(0, 262, 0, COUNTER_TOP);
    water.addColorStop(0, "#17395c");
    water.addColorStop(1, "#0d2036");
    ctx.fillStyle = water;
    ctx.fillRect(0, 262, W, COUNTER_TOP - 262);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.4;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      const wy = 272 + r * 11;
      for (let x = 0; x <= W; x += 16) {
        const yy = wy + Math.sin(x * 0.05 + t * (1.6 + r * 0.4) + r * 2) * 2;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, TAU);
    ctx.arc(x + 18 * s, y + 4 * s, 12 * s, 0, TAU);
    ctx.arc(x - 17 * s, y + 5 * s, 11 * s, 0, TAU);
    ctx.fill();
  }

  function hill(baseY, color, amp, wl) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 30);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, baseY - Math.abs(Math.sin(x * 0.011 + baseY)) * amp * 0.5 - Math.sin(x * 0.031) * 4);
    }
    ctx.lineTo(W, baseY + 30);
    ctx.closePath();
    ctx.fill();
  }

  function drawHoles() {
    for (const hle of holes) {
      const a = 1 - hle.age / 6;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = "#171017";
      ctx.beginPath(); ctx.arc(hle.x, hle.y, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,220,170,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hle.x, hle.y, 3.4, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawAwning() {
    for (let i = 0; i * 40 < W; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#e8503f" : "#ffe9c9";
      ctx.fillRect(i * 40, 0, 40, 46);
      ctx.beginPath();
      ctx.moveTo(i * 40, 46);
      ctx.arc(i * 40 + 20, 46, 20, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i * 40 < W; i++) {
      ctx.beginPath();
      ctx.arc(i * 40 + 20, 46, 20, Math.PI, 0);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 44, W, 4);

    ctx.strokeStyle = "rgba(20,12,24,0.8)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 66);
    ctx.quadraticCurveTo(W / 2, 86, W, 66);
    ctx.stroke();
    const bulbCols = ["#ffd166", "#ff8a5b", "#7ee0c0", "#ff6b8a"];
    for (let i = 0; i <= 15; i++) {
      const bx = (i / 15) * W;
      const by = 66 + Math.sin((i / 15) * Math.PI) * 18;
      const col = bulbCols[i % bulbCols.length];
      const tw = 0.55 + 0.45 * Math.sin(elapsed * 2.4 + i * 1.7);
      ctx.globalAlpha = 0.22 * tw;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(bx, by + 4, 7, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.5 * tw;
      ctx.beginPath(); ctx.arc(bx, by + 4, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDuckBody(gold) {
    if (gold) {
      const g = ctx.createLinearGradient(0, -22, 0, 22);
      g.addColorStop(0, "#ffdf8a");
      g.addColorStop(1, "#dd9418");
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = "#232d38";
    }
    ctx.beginPath();
    ctx.ellipse(0, 7, 26, 14, 0, 0, TAU);           // 몸통
    ctx.moveTo(-22, 4);
    ctx.lineTo(-34, -12);                            // 꼬리
    ctx.lineTo(-12, -3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(15, -11, 9.5, 0, TAU);                   // 머리
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(23, -14);
    ctx.lineTo(34, -10);                             // 부리
    ctx.lineTo(23, -6);
    ctx.closePath();
    ctx.fill();
    // 하이라이트
    ctx.strokeStyle = gold ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(15, -11, 7, -2.4, -0.9);
    ctx.stroke();
    // 눈
    ctx.fillStyle = gold ? "#5a3708" : "#ffd166";
    ctx.beginPath(); ctx.arc(18, -13, 1.8, 0, TAU); ctx.fill();
  }

  function drawBottleBody() {
    ctx.fillStyle = "#2e6b46";
    ctx.beginPath();
    ctx.moveTo(-9, 26);
    ctx.lineTo(-9, -8);
    ctx.quadraticCurveTo(-9, -17, -4, -20);
    ctx.lineTo(-4, -27);
    ctx.lineTo(4, -27);
    ctx.lineTo(4, -20);
    ctx.quadraticCurveTo(9, -17, 9, -8);
    ctx.lineTo(9, 26);
    ctx.quadraticCurveTo(9, 29, 6, 29);
    ctx.lineTo(-6, 29);
    ctx.quadraticCurveTo(-9, 29, -9, 26);
    ctx.closePath();
    ctx.fill();
    // 포일
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(-4.6, -29, 9.2, 8);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(-4.6, -23.5, 9.2, 1.6);
    // 유리 하이라이트
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.beginPath();
    ctx.roundRect(-6.4, -6, 3.2, 26, 1.6);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.roundRect(3.6, -4, 2.4, 22, 1.2);
    ctx.fill();
  }

  function drawBalloonBody(color, ph) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -2, 17, 20, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.4, 17);
    ctx.lineTo(3.4, 17);
    ctx.lineTo(0, 22);
    ctx.closePath();
    ctx.fill();
    // 광택
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-4, -6, 10, -2.5, -1.4);
    ctx.stroke();
    // 실
    ctx.strokeStyle = "rgba(255,243,227,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.quadraticCurveTo(Math.sin(ph * 3) * 4, 30, 0, 36);
    ctx.stroke();
  }

  function drawTarget(t) {
    const row = ROWS[t.row];
    const def = TYPES[t.type];
    const dying = t.state === "dying";
    ctx.save();
    ctx.translate(t.x, row.base + (dying ? 0 : t.bobY));
    if (dying) {
      const u = Math.min(1, t.deathT / 0.45);
      const e = 1 - Math.pow(1 - u, 3);
      ctx.rotate(-e * 2.1 * (t.face || 1));
      ctx.globalAlpha = u < 0.65 ? 1 : Math.max(0, 1 - (u - 0.65) / 0.35);
    }
    ctx.strokeStyle = "#6b4a2f";
    ctx.lineWidth = Math.max(2, 3 * t.s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -(def.stick * t.s));
    ctx.stroke();
    ctx.translate(0, -(def.stick * t.s + def.h * t.s / 2));
    if (!dying) ctx.rotate(t.tilt);
    ctx.scale(t.s * (t.face || 1), t.s);
    if (t.type === "duck") drawDuckBody(false);
    else if (t.type === "gold") drawDuckBody(true);
    else if (t.type === "bottle") drawBottleBody();
    else drawBalloonBody(t.color, t.phase + elapsed);
    ctx.restore();
  }

  function drawCounter() {
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(0, COUNTER_TOP, W, 16);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(0, COUNTER_TOP, W, 2);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, COUNTER_TOP + 5 + i * 4);
      ctx.lineTo(W, COUNTER_TOP + 5 + i * 4);
      ctx.stroke();
    }
    const front = ctx.createLinearGradient(0, COUNTER_TOP + 16, 0, H);
    front.addColorStop(0, "#6b4226");
    front.addColorStop(1, "#452a15");
    ctx.fillStyle = front;
    ctx.fillRect(0, COUNTER_TOP + 16, W, H - COUNTER_TOP - 16);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    for (let x = 32; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, COUNTER_TOP + 16);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,220,170,0.25)";
      ctx.beginPath(); ctx.arc(x + 5, COUNTER_TOP + 26, 1.4, 0, TAU); ctx.fill();
    }

    ctx.fillStyle = "#2b1626";
    ctx.strokeStyle = "rgba(255,207,92,0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(22, 330, 128, 52, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = '700 15px "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("사격장", 86, 350);
    ctx.fillStyle = "rgba(253,243,227,0.75)";
    ctx.font = '600 9px "Apple SD Gothic Neo", sans-serif';
    ctx.fillText("오리 +10 · 병 +2 · 풍선 +1", 86, 365);
    ctx.fillStyle = "#ffd166";
    ctx.fillText("황금 오리 +50", 86, 376);

    ctx.fillStyle = "#4e2f1a";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(512, 336, 104, 54, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,207,92,0.85)";
    ctx.font = '700 12px "Apple SD Gothic Neo", sans-serif';
    ctx.fillText("탄약", 564, 356);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#d9a441";
      ctx.beginPath();
      ctx.roundRect(540 + i * 18, 364, 8, 18, 3);
      ctx.fill();
      ctx.fillStyle = "#b3542e";
      ctx.beginPath();
      ctx.roundRect(540 + i * 18, 364, 8, 6, 3);
      ctx.fill();
    }

    // 총열
    ctx.save();
    ctx.translate(320, 398);
    ctx.rotate(-0.10);
    ctx.fillStyle = "#2e2a33";
    ctx.strokeStyle = "#17141c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-7, -58, 14, 58, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a4452";
    ctx.fillRect(-7.5, -20, 15, 3.4);
    ctx.fillRect(-7.5, -42, 15, 3.4);
    ctx.fillStyle = "#101014";
    ctx.beginPath();
    ctx.ellipse(0, -57, 6.4, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (muzzleT > 0) {
      ctx.save();
      ctx.translate(MUZZLE.x, MUZZLE.y);
      ctx.rotate(rand(0, TAU));
      ctx.globalAlpha = muzzleT;
      ctx.fillStyle = "#ffd166";
      star(0, 0, 5, 15 * muzzleT + 4, 7 * muzzleT + 2);
      ctx.fillStyle = "#fff3d6";
      star(0, 0, 5, 8 * muzzleT + 2, 3.6 * muzzleT + 1);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function star(cx, cy, spikes, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawParts() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.t >= p.life) continue;
      const lf = 1 - p.t / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.globalAlpha = lf;
      if (p.kind === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, TAU);
        ctx.stroke();
      } else if (p.kind === "puff") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, TAU);
        ctx.fill();
      } else if (p.kind === "shard") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.7, p.size * 0.8);
        ctx.lineTo(-p.size * 0.7, p.size * 0.6);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === "spark") {
        ctx.fillStyle = p.color;
        star(0, 0, 4, p.size, p.size * 0.4);
      } else if (p.kind === "casing") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9, p.size * 0.4);
        ctx.fill();
        ctx.fillStyle = "#8a6220";
        ctx.fillRect(p.size * 0.6, -p.size * 0.45, p.size * 0.5, p.size * 0.9);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawPops() {
    ctx.textAlign = "center";
    for (let i = 0; i < pops.length; i++) {
      const u = pops[i];
      if (u.t >= u.life) continue;
      const lf = u.t / u.life;
      ctx.globalAlpha = lf < 0.7 ? 1 : 1 - (lf - 0.7) / 0.3;
      ctx.font = `800 ${u.size}px "Apple SD Gothic Neo", sans-serif`;
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = "rgba(20,10,26,0.85)";
      ctx.strokeText(u.text, u.x, u.y);
      ctx.fillStyle = u.color;
      ctx.fillText(u.text, u.x, u.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawGoalPill() {
    const reached = score >= goal;
    const label = reached ? "목표 달성!" : `목표 ${goal}`;
    ctx.font = '700 13px "Apple SD Gothic Neo", sans-serif';
    const wTxt = ctx.measureText(label).width;
    const pw = wTxt + 22;
    const px = W - pw - 10;
    ctx.fillStyle = reached ? "rgba(31,155,138,0.85)" : "rgba(20,10,26,0.62)";
    ctx.beginPath();
    ctx.roundRect(px, 76, pw, 22, 11);
    ctx.fill();
    if (reached) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.fillStyle = reached ? "#eafffb" : "#ffd166";
    ctx.textAlign = "center";
    ctx.fillText(label, px + pw / 2, 91);
  }

  function drawToast() {
    if (!toast) return;
    const u = Math.min(1, toast.t / 0.3);
    const e = easeOutBack(u);
    const fade = toast.t > toast.life - 0.3 ? (toast.life - toast.t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(W / 2, 150);
    ctx.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e);
    ctx.textAlign = "center";
    ctx.font = '800 30px "Apple SD Gothic Neo", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(20,10,26,0.9)";
    ctx.strokeText(toast.text, 0, 0);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(toast.text, 0, 0);
    ctx.font = '700 15px "Apple SD Gothic Neo", sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText(toast.sub, 0, 26);
    ctx.fillStyle = "#fdf3e3";
    ctx.fillText(toast.sub, 0, 26);
    ctx.restore();
  }

  function drawBanner() {
    if (!banner) return;
    const u = Math.min(1, banner.t / 0.35);
    const e = easeOutBack(u);
    const fade = banner.t > banner.life - 0.4 ? (banner.life - banner.t) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(W / 2, 168);
    ctx.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e);
    ctx.textAlign = "center";
    ctx.font = '800 34px "Apple SD Gothic Neo", sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20,10,26,0.92)";
    ctx.strokeText(`라운드 ${round} 클리어!`, 0, 0);
    ctx.fillStyle = "#7ee0c0";
    ctx.fillText(`라운드 ${round} 클리어!`, 0, 0);
    ctx.font = '700 15px "Apple SD Gothic Neo", sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText("다음 라운드는 더 빨라져요!", 0, 28);
    ctx.fillStyle = "#fdf3e3";
    ctx.fillText("다음 라운드는 더 빨라져요!", 0, 28);
    ctx.restore();
  }

  function drawReticle() {
    if (phase === "over" || phase === "ready") return;
    const s = 1 + reticle.kick * 0.35;
    ctx.save();
    ctx.translate(reticle.x, reticle.y);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
      ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21);
    }
    ctx.stroke();
    ctx.fillStyle = "#ff5a4e";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();
    if (reloading) {
      const prog = 1 - reloadT / RELOAD_S;
      ctx.strokeStyle = "#7ee0c0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    const t = elapsed;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.05) {
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }
    drawBackdrop(t);
    drawHoles();
    drawAwning();
    drawGoalPill();
    // 화가 순서: far → mid → near
    for (let ri = 0; ri < 3; ri++) {
      const arr = lanes[ri];
      for (let i = 0; i < arr.length; i++) drawTarget(arr[i]);
    }
    drawCounter();
    drawParts();
    drawPops();
    drawToast();
    drawBanner();
    drawReticle();
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.032);
    last = now;
    if (phase !== "paused") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  seedRows();
  updateAmmoHud();
  updateTimeHud();
  syncPauseBtn();
  showReady();
  requestAnimationFrame(loop);
})();
