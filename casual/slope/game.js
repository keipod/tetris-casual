(() => {
  "use strict";

  const LS_BEST = "slope.best";
  const LS_SOUND = "slope.sound";

  const BALL_R = 0.5;
  const ROAD_HW = 7;
  const SLOTS = 5;
  const SLOT_W = (ROAD_HW * 2) / SLOTS;
  const CAM_BACK = 8;
  const CAM_Y = 3.4;
  const DROP = 0.085;
  const FAR_Z = 170;
  const SAMPLES = 30;
  const LINE_STEP = 2;
  const T_GAP = 8;
  const T_SAMPLES = 12;
  const V0 = 30;
  const VMAX = 90;
  const V_TAU = 1100;
  const STEER_RATIO = 0.36;
  const DRAG_SENS = 1.25;
  const CURVE_A1 = 8, CURVE_F1 = 0.016;
  const CURVE_A2 = 4, CURVE_F2 = 0.036;
  const TRAIL_N = 14;
  const P_MAX = 90;
  const OBS_MAX = 40;
  const STAR_N = 64;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const irand = (n) => (Math.random() * n) | 0;

  const api = { clamp, lerp };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__slope = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__s", "1");
      localStorage.removeItem("__s");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = canvas.parentElement;
  const distEl = document.getElementById("dist");
  const bestEl = document.getElementById("best");
  const btnPause = document.getElementById("btn-pause");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnSound = document.getElementById("btn-sound");
  const btnResume = document.getElementById("btn-resume");
  const btnGiveup = document.getElementById("btn-giveup");
  const btnRetry = document.getElementById("btn-retry");
  const readyOverlay = document.getElementById("ready-overlay");
  const pauseOverlay = document.getElementById("pause-overlay");
  const overOverlay = document.getElementById("over-overlay");
  const overTitle = document.getElementById("over-title");
  const overDist = document.getElementById("over-dist");
  const overBest = document.getElementById("over-best");
  const newBestEl = document.getElementById("new-best");
  const helpOverlay = document.getElementById("help-overlay");

  let soundOn = storage.getItem(LS_SOUND) !== "0";

  const SFX = {
    play(role, vol) { if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol); },
    click() { this.play("click", 0.5); },
    whoosh() { this.play("whoosh", 0.6); },
    bounce() { this.play("bounce", 0.45); },
    hit() { this.play("hit", 0.9); },
    lose() { this.play("lose", 0.8); },
    level() { this.play("level", 0.8); },
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
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  let W = 1, H = 1, HOR = 0, FOCAL = 0, pxPerUnit = 1;
  let skyGrad = null, groundGrad = null, fogGrad = null, glowGrad = null, vigGrad = null;

  const stars = [];
  for (let i = 0; i < STAR_N; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.86,
      s: Math.random() < 0.8 ? 1 : 2,
      p: Math.random() * 6.28,
      w: 0.6 + Math.random() * 1.8,
    });
  }

  const sZ = new Float32Array(SAMPLES);
  const sCx = new Float32Array(SAMPLES);
  const sSc = new Float32Array(SAMPLES);
  const sSx = new Float32Array(SAMPLES);
  const sSy = new Float32Array(SAMPLES);

  const obstacles = [];
  for (let i = 0; i < OBS_MAX; i++) {
    obstacles.push({ on: false, x0: 0, cx: 0, z: 0, w: 0, h: 0, d: 0, mAmp: 0, mFreq: 0, mPh: 0, passed: false });
  }
  let obsCount = 0;

  const parts = [];
  for (let i = 0; i < P_MAX; i++) {
    parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, red: false });
  }

  const trailX = new Float32Array(TRAIL_N);
  const trailY = new Float32Array(TRAIL_N);
  const trailA = new Float32Array(TRAIL_N);
  let trailHead = 0;

  const state = {
    mode: "ready",
    ballX: 0,
    ballVx: 0,
    ballZ: 0,
    camX: 0,
    v: 12,
    dist: 0,
    time: 0,
    nextSpawnZ: 65,
    lastSafe: 2,
    dieT: 0,
    flashA: 0,
    shake: 0,
    best: parseInt(storage.getItem(LS_BEST) || "0", 10) || 0,
    shownDist: -1,
    lockUntil: 0,
    keyL: false,
    keyR: false,
    dragId: -1,
    dragLastX: 0,
  };

  function roadCenter(z) {
    return CURVE_A1 * Math.sin(z * CURVE_F1) + CURVE_A2 * Math.sin(z * CURVE_F2 + 1.7);
  }

  function difficulty() {
    return clamp(state.dist / 2200, 0, 1);
  }

  function bandGap() {
    return 30 - 13 * difficulty();
  }

  function slotCenter(i) {
    return -ROAD_HW + SLOT_W * (i + 0.5);
  }

  function spawnObstacle(x0, z, w, h, d, mAmp, mFreq, mPh) {
    if (obsCount >= OBS_MAX) return;
    const o = obstacles[obsCount++];
    o.on = true;
    o.x0 = x0;
    o.cx = x0;
    o.z = z;
    o.w = w;
    o.h = h;
    o.d = d;
    o.mAmp = mAmp;
    o.mFreq = mFreq;
    o.mPh = mPh;
    o.passed = false;
  }

  function pickSafeSlot() {
    state.lastSafe = clamp(state.lastSafe + irand(3) - 1, 0, SLOTS - 1);
    return state.lastSafe;
  }

  function spawnBand(z) {
    const t = difficulty();
    const wSingle = 3;
    const wPair = 1.5 + 2 * t;
    const wWall = state.dist > 140 ? 0.8 + 2.2 * t : 0;
    const wSlalom = 0.6 + 1.4 * t;
    const wMover = state.dist > 350 ? 2.2 * t : 0;
    const total = wSingle + wPair + wWall + wSlalom + wMover;
    let r = Math.random() * total;
    let type;
    if ((r -= wSingle) < 0) type = 0;
    else if ((r -= wPair) < 0) type = 1;
    else if ((r -= wWall) < 0) type = 2;
    else if ((r -= wSlalom) < 0) type = 3;
    else type = 4;

    if (type === 0) {
      spawnObstacle(roadCenter(z) + slotCenter(irand(SLOTS)), z, 1.7 + Math.random() * 0.6, 1.1 + Math.random() * 1.1, 1.2 + Math.random() * 0.8, 0, 0, 0);
    } else if (type === 1) {
      const safe = pickSafeSlot();
      let a = irand(SLOTS);
      while (a === safe) a = irand(SLOTS);
      let b = irand(SLOTS);
      while (b === safe || b === a) b = irand(SLOTS);
      const z2 = z + bandGap() * 0.3;
      spawnObstacle(roadCenter(z) + slotCenter(a), z, 1.7 + Math.random() * 0.6, 1.1 + Math.random() * 1.1, 1.2 + Math.random() * 0.8, 0, 0, 0);
      spawnObstacle(roadCenter(z2) + slotCenter(b), z2, 1.7 + Math.random() * 0.6, 1.1 + Math.random() * 1.1, 1.2 + Math.random() * 0.8, 0, 0, 0);
    } else if (type === 2) {
      const safe = pickSafeSlot();
      const dense = t > 0.5;
      const bc = roadCenter(z);
      for (let s = 0; s < SLOTS; s++) {
        if (s === safe) continue;
        if (!dense && s === (safe + 2) % SLOTS) continue;
        spawnObstacle(bc + slotCenter(s), z, 1.8 + Math.random() * 0.5, 1.2 + Math.random(), 1.4, 0, 0, 0);
      }
    } else if (type === 3) {
      const left = irand(2);
      const right = 3 + irand(2);
      const z2 = z + bandGap() * 0.5;
      spawnObstacle(roadCenter(z) + slotCenter(left), z, 1.8, 1.4, 1.3, 0, 0, 0);
      spawnObstacle(roadCenter(z2) + slotCenter(right), z2, 1.8, 1.4, 1.3, 0, 0, 0);
    } else {
      const safe = pickSafeSlot();
      let j = irand(SLOTS - 1);
      while (j === safe || j + 1 === safe) j = irand(SLOTS - 1);
      const w = 1.8;
      const amp = (2 * SLOT_W - w) / 2 - 0.25;
      spawnObstacle(roadCenter(z) + (-ROAD_HW + SLOT_W * (j + 1)), z, w, 1.3 + Math.random() * 0.8, 1.4, amp, 1.2 + Math.random(), Math.random() * 6.28);
    }
  }

  function resetWorld(full) {
    state.ballX = 0;
    state.ballVx = 0;
    state.camX = 0;
    state.v = V0;
    state.dist = 0;
    state.shownDist = -1;
    state.flashA = 0;
    state.shake = 0;
    state.dieT = 0;
    state.lastSafe = 2;
    state.keyL = state.keyR = false;
    state.dragId = -1;
    obsCount = 0;
    for (let i = 0; i < P_MAX; i++) parts[i].on = false;
    for (let i = 0; i < TRAIL_N; i++) trailA[i] = 0;
    trailHead = 0;
    if (full) state.ballZ = 0;
    state.nextSpawnZ = state.ballZ + 65;
    distEl.textContent = "0";
  }

  function blurActive() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function startRun() {
    if (state.mode !== "ready") return;
    blurActive();
    resetWorld(false);
    state.mode = "run";
    readyOverlay.hidden = true;
    overOverlay.hidden = true;
    SFX.whoosh();
  }

  function die(title) {
    if (state.mode !== "run") return;
    state.mode = "dying";
    state.dieT = 0;
    state.flashA = 0.85;
    state.shake = 14;
    state.dragId = -1;
    overTitle.textContent = title;
    SFX.hit();
    setTimeout(() => SFX.lose(), 160);
    burst();
  }

  function burst() {
    const n = 42;
    let made = 0;
    for (let i = 0; i < P_MAX && made < n; i++) {
      const p = parts[i];
      if (p.on) continue;
      const ang = Math.random() * 6.28;
      const sp = 3 + Math.random() * 9;
      p.on = true;
      p.x = state.ballX;
      p.y = BALL_R + Math.random() * 0.4;
      p.z = state.ballZ;
      p.vx = Math.cos(ang) * sp;
      p.vy = 2 + Math.random() * 8;
      p.vz = Math.sin(ang) * sp * 0.6;
      p.max = 0.7 + Math.random() * 0.6;
      p.life = p.max;
      p.size = 0.08 + Math.random() * 0.16;
      p.red = Math.random() < 0.35;
      made++;
    }
  }

  function showOver() {
    const score = Math.floor(state.dist);
    let isNew = false;
    if (score > state.best) {
      state.best = score;
      storage.setItem(LS_BEST, String(score));
      isNew = true;
      setTimeout(() => SFX.level(), 420);
    }
    overDist.textContent = String(score);
    overBest.textContent = String(state.best);
    newBestEl.hidden = !isNew;
    refreshBestChip();
    overOverlay.hidden = false;
    btnRetry.disabled = true;
    state.lockUntil = performance.now() + 400;
    setTimeout(() => { btnRetry.disabled = false; }, 400);
    state.mode = "over";
  }

  function retry() {
    if (state.mode !== "over") return;
    if (performance.now() < state.lockUntil) return;
    blurActive();
    SFX.click();
    resetWorld(true);
    state.mode = "run";
    overOverlay.hidden = true;
    SFX.whoosh();
  }

  function toReady() {
    blurActive();
    resetWorld(true);
    state.mode = "ready";
    pauseOverlay.hidden = true;
    overOverlay.hidden = true;
    readyOverlay.hidden = false;
  }

  function pauseGame() {
    if (state.mode !== "run") return;
    state.mode = "pause";
    pauseOverlay.hidden = false;
  }

  function resumeGame() {
    if (state.mode !== "pause") return;
    blurActive();
    SFX.click();
    state.mode = "run";
    pauseOverlay.hidden = true;
    lastT = performance.now();
  }

  function refreshBestChip() {
    bestEl.textContent = String(state.best);
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    HOR = H * 0.36;
    FOCAL = H * 0.95;
    pxPerUnit = FOCAL / CAM_BACK;

    skyGrad = ctx.createLinearGradient(0, 0, 0, HOR);
    skyGrad.addColorStop(0, "#05070f");
    skyGrad.addColorStop(0.72, "#0b1330");
    skyGrad.addColorStop(1, "#1b2c5e");

    groundGrad = ctx.createLinearGradient(0, HOR, 0, H);
    groundGrad.addColorStop(0, "#141f42");
    groundGrad.addColorStop(1, "#070c1a");

    fogGrad = ctx.createLinearGradient(0, HOR, 0, HOR + H * 0.16);
    fogGrad.addColorStop(0, "rgba(13,20,44,0.95)");
    fogGrad.addColorStop(1, "rgba(13,20,44,0)");

    glowGrad = ctx.createLinearGradient(0, HOR - H * 0.05, 0, HOR + H * 0.02);
    glowGrad.addColorStop(0, "rgba(53,230,255,0)");
    glowGrad.addColorStop(0.8, "rgba(53,230,255,0.16)");
    glowGrad.addColorStop(1, "rgba(53,230,255,0)");

    vigGrad = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.42, W / 2, H * 0.52, Math.max(W, H) * 0.78);
    vigGrad.addColorStop(0, "rgba(0,0,0,0)");
    vigGrad.addColorStop(1, "rgba(0,0,0,0.46)");

    for (let i = 0; i < TRAIL_N; i++) trailA[i] = 0;
  }

  function computeSamples() {
    const camZ = state.ballZ - CAM_BACK;
    const invN = 1 / (state.ballZ + 1.2);
    const invF = 1 / (state.ballZ + FAR_Z);
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const z = 1 / (invN + (invF - invN) * t);
      const sc = FOCAL / (z - camZ);
      sZ[i] = z;
      sSc[i] = sc;
      sCx[i] = roadCenter(z);
      sSx[i] = W / 2 + (sCx[i] - state.camX) * sc;
      sSy[i] = HOR + (CAM_Y + z * DROP) * sc;
    }
  }

  function drawGrid() {
    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.moveTo(sSx[0] - ROAD_HW * sSc[0], sSy[0]);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(sSx[i] - ROAD_HW * sSc[i], sSy[i]);
    for (let i = SAMPLES - 1; i >= 0; i--) ctx.lineTo(sSx[i] + ROAD_HW * sSc[i], sSy[i]);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(53,230,255,0.22)";
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const off = k * LINE_STEP;
      ctx.moveTo(sSx[0] + off * sSc[0], sSy[0]);
      for (let i = 1; i < SAMPLES; i++) ctx.lineTo(sSx[i] + off * sSc[i], sSy[i]);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(53,230,255,0.34)";
    ctx.beginPath();
    ctx.moveTo(sSx[0], sSy[0]);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(sSx[i], sSy[i]);
    ctx.stroke();

    ctx.strokeStyle = "rgba(53,230,255,0.14)";
    ctx.beginPath();
    const firstLine = (Math.floor((state.ballZ + 1.2) / T_GAP) + 1) * T_GAP;
    const zLimit = state.ballZ + FAR_Z;
    for (let zg = firstLine; zg < zLimit; zg += T_GAP) {
      const sc = FOCAL / (zg - state.ballZ + CAM_BACK);
      const cy = roadCenter(zg);
      const sy = HOR + (CAM_Y + zg * DROP) * sc;
      const sx = W / 2 + (cy - state.camX) * sc;
      ctx.moveTo(sx - ROAD_HW * sc, sy);
      for (let m = 1; m < T_SAMPLES; m++) {
        const off = -ROAD_HW + (2 * ROAD_HW * m) / (T_SAMPLES - 1);
        ctx.lineTo(W / 2 + (cy + off - state.camX) * sc, sy);
      }
    }
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,61,240,0.28)";
    ctx.beginPath();
    ctx.moveTo(sSx[0] - ROAD_HW * sSc[0], sSy[0]);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(sSx[i] - ROAD_HW * sSc[i], sSy[i]);
    ctx.moveTo(sSx[0] + ROAD_HW * sSc[0], sSy[0]);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(sSx[i] + ROAD_HW * sSc[i], sSy[i]);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, HOR, W, H * 0.16);
  }

  function drawBox(o) {
    const camZ = state.ballZ - CAM_BACK;
    const zn = o.z - o.d / 2;
    const zf = o.z + o.d / 2;
    if (zf < camZ + 0.6) return;
    const scN = FOCAL / Math.max(zn - camZ, 0.6);
    const scF = FOCAL / Math.max(zf - camZ, 0.6);
    const hw = o.w / 2;
    const xl = o.cx - hw;
    const xr = o.cx + hw;
    const nbl = W / 2 + (xl - state.camX) * scN;
    const nbr = W / 2 + (xr - state.camX) * scN;
    const nty = HOR + (CAM_Y + zn * DROP - o.h) * scN;
    const nby = HOR + (CAM_Y + zn * DROP) * scN;
    const ftl = W / 2 + (xl - state.camX) * scF;
    const ftr = W / 2 + (xr - state.camX) * scF;
    const fty = HOR + (CAM_Y + zf * DROP - o.h) * scF;

    ctx.fillStyle = "rgba(120,10,26,0.92)";
    ctx.beginPath();
    ctx.moveTo(nbl, nty);
    ctx.lineTo(nbr, nty);
    ctx.lineTo(ftr, fty);
    ctx.lineTo(ftl, fty);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(190,18,42,0.88)";
    ctx.beginPath();
    ctx.moveTo(nbl, nby);
    ctx.lineTo(nbr, nby);
    ctx.lineTo(nbr, nty);
    ctx.lineTo(nbl, nty);
    ctx.closePath();
    ctx.fill();

    const pulse = o.mAmp > 0 ? 0.55 + 0.45 * Math.sin(state.time * 9 + o.mPh) : 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,77,94," + (0.22 * pulse).toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(nbl, nby); ctx.lineTo(nbr, nby); ctx.lineTo(nbr, nty); ctx.lineTo(nbl, nty); ctx.closePath();
    ctx.moveTo(nbl, nty); ctx.lineTo(ftr, fty);
    ctx.moveTo(nbr, nty); ctx.lineTo(ftl, fty);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,150,160," + (0.85 * pulse).toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(nbl, nby); ctx.lineTo(nbr, nby); ctx.lineTo(nbr, nty); ctx.lineTo(nbl, nty); ctx.closePath();
    ctx.moveTo(nbl, nty); ctx.lineTo(ftr, fty);
    ctx.moveTo(nbr, nty); ctx.lineTo(ftl, fty);
    ctx.stroke();
  }

  let ballGrad = null;
  let gbX = -1e9, gbY = -1e9, gbR = -1;

  function drawBall() {
    const sc = FOCAL / CAM_BACK;
    const bx = W / 2 + (state.ballX - state.camX) * sc;
    const by = HOR + (CAM_Y - BALL_R) * sc;
    const r = BALL_R * sc;

    ctx.beginPath();
    ctx.arc(bx, by, r * 1.9, 0, 6.2832);
    ctx.fillStyle = "rgba(53,230,255,0.13)";
    ctx.fill();

    for (let i = 0; i < TRAIL_N; i++) {
      const idx = (trailHead + i) % TRAIL_N;
      const a = trailA[idx];
      if (a <= 0.01) continue;
      const k = i / TRAIL_N;
      ctx.beginPath();
      ctx.arc(trailX[idx], trailY[idx], r * (0.25 + 0.6 * k), 0, 6.2832);
      ctx.fillStyle = "rgba(53,230,255," + (a * 0.35 * k).toFixed(3) + ")";
      ctx.fill();
    }

    if (!ballGrad || Math.abs(gbX - bx) > 1 || Math.abs(gbY - by) > 1 || Math.abs(gbR - r) > 0.5) {
      ballGrad = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
      ballGrad.addColorStop(0, "#eaffff");
      ballGrad.addColorStop(0.35, "#7df0ff");
      ballGrad.addColorStop(0.75, "#17b6e8");
      ballGrad.addColorStop(1, "#076a96");
      gbX = bx; gbY = by; gbR = r;
    }
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, 6.2832);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(180,250,255,0.9)";
    ctx.stroke();
  }

  function pushTrail(bx, by) {
    trailX[trailHead] = bx;
    trailY[trailHead] = by;
    trailA[trailHead] = 1;
    trailHead = (trailHead + 1) % TRAIL_N;
    for (let i = 0; i < TRAIL_N; i++) {
      if (trailA[i] > 0) trailA[i] -= 0.09;
    }
  }

  function updateParts(dt) {
    for (let i = 0; i < P_MAX; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy -= 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; p.vx *= 0.7; }
    }
  }

  function drawParts() {
    const camZ = state.ballZ - CAM_BACK;
    for (let i = 0; i < P_MAX; i++) {
      const p = parts[i];
      if (!p.on) continue;
      const dz = p.z - camZ;
      if (dz < 0.6) continue;
      const sc = FOCAL / dz;
      const sx = W / 2 + (p.x - state.camX) * sc;
      const sy = HOR + (CAM_Y - p.y) * sc;
      const s = Math.max(p.size * sc, 1.2);
      const a = p.life / p.max;
      ctx.fillStyle = p.red
        ? "rgba(255,110,120," + (a * 0.95).toFixed(3) + ")"
        : "rgba(140,240,255," + (a * 0.95).toFixed(3) + ")";
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
  }

  function update(dt) {
    state.time += dt;

    if (state.mode === "pause") return;

    if (state.mode === "ready") {
      state.ballZ += 12 * dt;
      state.ballX = Math.sin(state.time * 0.7) * 2.5;
      state.camX = lerp(state.camX, state.ballX, 1 - Math.exp(-dt * 5));
      return;
    }

    if (state.mode === "run") {
      state.v = VMAX - (VMAX - V0) * Math.exp(-state.dist / V_TAU);
      state.dist += state.v * dt;
      state.ballZ += state.v * dt;

      const latMax = state.v * STEER_RATIO;
      let dir = 0;
      if (state.keyL) dir -= 1;
      if (state.keyR) dir += 1;
      const target = dir * latMax;
      state.ballVx += (target - state.ballVx) * Math.min(1, dt * 12);
      state.ballX = clamp(state.ballX + state.ballVx * dt, -22, 22);

      while (state.nextSpawnZ < state.ballZ + FAR_Z + 20) {
        spawnBand(state.nextSpawnZ);
        state.nextSpawnZ += bandGap();
      }
    } else if (state.mode === "dying") {
      state.v *= Math.exp(-dt * 4);
      state.ballZ += state.v * dt;
      state.dieT += dt;
      if (state.dieT > 0.95) showOver();
    }

    let write = 0;
    for (let i = 0; i < obsCount; i++) {
      const o = obstacles[i];
      if (o.z + o.d / 2 < state.ballZ - 3) { o.on = false; continue; }
      o.cx = o.mAmp > 0 ? o.x0 + Math.sin(state.time * o.mFreq + o.mPh) * o.mAmp : o.x0;
      if (write !== i) {
        const dead = obstacles[write];
        obstacles[write] = o;
        obstacles[i] = dead;
      }
      write++;
    }
    obsCount = write;

    if (state.mode === "run") {
      const rc = roadCenter(state.ballZ);
      if (Math.abs(state.ballX - rc) > ROAD_HW - 0.3) {
        die("코스 이탈!");
      } else {
        for (let i = 0; i < obsCount; i++) {
          const o = obstacles[i];
          const halfLen = o.d / 2 + BALL_R;
          const dz = o.z - state.ballZ;
          if (!o.passed && dz < -halfLen) {
            o.passed = true;
            const gap = Math.abs(o.cx - state.ballX) - (o.w / 2 + BALL_R);
            if (gap < 0.55) {
              SFX.bounce();
              state.shake = Math.max(state.shake, 3);
            }
          }
          if (dz > halfLen || dz < -halfLen) continue;
          if (Math.abs(o.cx - state.ballX) < o.w / 2 + BALL_R * 0.82) {
            die("충돌!");
            break;
          }
        }
      }
    }

    updateParts(dt);

    state.flashA *= Math.exp(-dt * 5.5);
    state.shake *= Math.exp(-dt * 7);

    const camTarget = state.mode === "run" ? state.ballX + state.ballVx * 0.06 : state.camX;
    state.camX = lerp(state.camX, camTarget, 1 - Math.exp(-dt * 6));

    const dInt = Math.floor(state.dist);
    if (dInt !== state.shownDist) {
      state.shownDist = dInt;
      distEl.textContent = String(dInt);
    }
  }

  function render() {
    ctx.save();
    if (state.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    ctx.fillStyle = skyGrad;
    ctx.fillRect(-20, -20, W + 40, HOR + 22);

    ctx.fillStyle = "#cfe9ff";
    for (let i = 0; i < STAR_N; i++) {
      const st = stars[i];
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(state.time * st.w + st.p);
      ctx.fillRect(st.x * W, st.y * HOR, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, HOR - H * 0.05, W, H * 0.07);

    computeSamples();
    drawGrid();

    const sc = FOCAL / CAM_BACK;
    const bsx = W / 2 + (state.ballX - state.camX) * sc;
    const bsy = HOR + (CAM_Y - BALL_R) * sc;
    let ballDrawn = state.mode === "dying";
    for (let i = obsCount - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (!ballDrawn && o.z < state.ballZ) {
        drawBall();
        pushTrail(bsx, bsy);
        ballDrawn = true;
      }
      drawBox(o);
    }
    if (!ballDrawn) {
      drawBall();
      pushTrail(bsx, bsy);
    }

    drawParts();

    ctx.restore();

    if (state.flashA > 0.01) {
      ctx.fillStyle = "rgba(255,235,235," + state.flashA.toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);
  }

  let lastT = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (state.mode === "pause") return;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.034) dt = 0.034;
    if (dt <= 0) return;
    update(dt);
    render();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.mode !== "run") return;
    state.dragId = e.pointerId;
    state.dragLastX = e.clientX;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== state.dragId || state.mode !== "run") return;
    const dx = e.clientX - state.dragLastX;
    state.dragLastX = e.clientX;
    state.ballX = clamp(state.ballX + (dx / pxPerUnit) * DRAG_SENS, -22, 22);
  });

  const endDrag = (e) => {
    if (e.pointerId === state.dragId) state.dragId = -1;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      state.keyL = true;
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      state.keyR = true;
      e.preventDefault();
    } else if (e.key === " " || e.key === "p" || e.key === "P") {
      if (state.mode === "run") pauseGame();
      else if (state.mode === "pause") resumeGame();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (state.mode === "ready") startRun();
      else if (state.mode === "over") retry();
    } else if (e.key === "Escape" && !helpOverlay.hidden) {
      closeHelp();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") state.keyL = false;
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") state.keyR = false;
  });

  readyOverlay.addEventListener("click", () => {
    if (state.mode === "ready") startRun();
  });

  btnPause.addEventListener("click", () => {
    SFX.click();
    pauseGame();
  });
  btnResume.addEventListener("click", resumeGame);
  btnGiveup.addEventListener("click", () => {
    SFX.click();
    toReady();
  });
  btnRetry.addEventListener("click", retry);

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.click();
    if (state.mode === "run") pauseGame();
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

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  resize();
  refreshBestChip();
  resetWorld(true);
  root.__slope.state = state;
  root.__slope.getObstacles = () => obstacles.slice(0, obsCount);
  requestAnimationFrame(frame);
})();
