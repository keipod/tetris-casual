(() => {
  "use strict";

  const W = 720, H = 405, GROUND = 348;
  const TAU = Math.PI * 2;
  const STEP_MS = 1000 / 60, STEP_S = STEP_MS / 1000;
  const ARENA_L = 46, ARENA_R = W - 46;
  const GRAV = 560;
  const HERO_SPD = 255, HERO_MAX_HP = 100;

  const LS_BEST = "rambo.best";
  const LS_SOUND = "rambo.sound";

  const P_SPARK = 0, P_STAR = 1, P_SMOKE = 2, P_RING = 3, P_FLASH = 4, P_BODY = 5, P_CASE = 6;

  const PAL = {
    grunt: ["#7d8aa0", "#5c6a80"],
    gren: ["#c9713b", "#9c5429"],
    heavy: ["#665d78", "#4b4459"],
  };

  const F_DISP = '"Do Hyeon","Noto Sans KR",sans-serif';
  const F34 = "34px " + F_DISP;
  const F22 = "22px " + F_DISP;
  const F16 = "16px " + F_DISP;
  const F14 = "14px " + F_DISP;
  const F12 = "12px " + F_DISP;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  function angLerp(a, b, t) {
    let d = (b - a + Math.PI * 3) % TAU - Math.PI;
    return a + d * t;
  }

  const storage = (() => {
    try {
      localStorage.setItem("__r", "1");
      localStorage.removeItem("__r");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const stage = document.getElementById("stage");
  const frame = document.getElementById("frame");
  const canvas = document.getElementById("cv");
  const ctx = canvas.getContext("2d");
  const vignetteEl = document.getElementById("vignette");
  const zoneMove = document.getElementById("zone-move");
  const fireCircle = document.getElementById("fire-circle");
  const moveHint = document.getElementById("move-hint");
  const nadeBtn = document.getElementById("btn-nade");
  const nadeCountEl = document.getElementById("nade-count");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  const SFX = {
    play(role, vol) {
      if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol == null ? 0.6 : vol);
    },
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
      if (soundOn) { window.CasualSfx.unlock(); SFX.play("click", 0.5); }
    }
  });
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();
  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  let skyGrad = null;
  function fit() {
    const r = stage.getBoundingClientRect();
    const aw = Math.max(80, r.width - 16), ah = Math.max(60, r.height - 16);
    const s = Math.min(aw / W, ah / H);
    const cw = Math.max(1, Math.floor(W * s)), ch = Math.max(1, Math.floor(H * s));
    frame.style.width = cw + "px";
    frame.style.height = ch + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    fireCircle.style.fontSize = Math.max(13, Math.round(ch * 0.078)) + "px";
    nadeBtn.style.fontSize = Math.max(11, Math.round(ch * 0.056)) + "px";
    moveHint.style.fontSize = Math.max(10, Math.round(ch * 0.044)) + "px";
    skyGrad = null;
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", () => setTimeout(fit, 120));

  const SPAN = W + 160;
  const farTrees = [], midBush = [], tufts = [], specks = [], clouds = [];
  (function genBg() {
    for (let i = 0; i < 15; i++) {
      farTrees.push({
        x: rand(-60, SPAN - 20),
        w: rand(46, 92),
        h: rand(58, 128),
        round: i % 3 === 0,
        c: i % 2 ? "#2f6b50" : "#295e46",
      });
    }
    for (let i = 0; i < 12; i++) {
      midBush.push({ x: rand(-40, SPAN), w: rand(50, 110), h: rand(18, 34) });
    }
    for (let i = 0; i < 26; i++) {
      tufts.push({ x: rand(10, W - 10), h: rand(5, 11), lean: rand(-3, 3) });
    }
    for (let i = 0; i < 40; i++) {
      specks.push({ x: rand(8, W - 8), y: rand(GROUND + 14, H - 6), r: rand(1, 2.6) });
    }
    for (let i = 0; i < 3; i++) {
      clouds.push({ x: rand(0, W), y: rand(28, 96), s: rand(0.7, 1.3), v: rand(3, 7) });
    }
  })();

  function makePool(cap, tpl) {
    const arr = new Array(cap);
    for (let i = 0; i < cap; i++) {
      arr[i] = {};
      Object.assign(arr[i], tpl);
      arr[i].active = false;
    }
    return arr;
  }
  function take(pool) {
    for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
    return null;
  }

  const bullets = makePool(90, { x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const enemies = makePool(40, {
    kind: 0, x: 0, yOff: 0, hp: 1, maxHp: 1, spd: 40, face: -1,
    anim: 0, hitT: 0, atkT: 0, lungeT: 0, throwT: 0, range: 240,
  });
  const parts = makePool(260, {
    kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
    size: 3, rot: 0, vr: 0, col: "#fff", col2: null, bounced: 0,
  });
  const popups = makePool(20, { x: 0, y: 0, txt: "", col: "#fff", t: 0 });
  const nades = makePool(12, { x: 0, y: 0, vx: 0, vy: 0, spin: 0, fromHero: false, fuse: 0 });
  const pickups = makePool(6, { type: 0, x: 0, ph: 0, life: 0 });
  const scorches = [];

  const hero = {
    x: W / 2, hp: HERO_MAX_HP, nades: 2, face: 1, aim: 0,
    anim: 0, mvx: 0, kb: 0, fireT: 0, recoil: 0, mfT: 0,
    invT: 0, buff: "", buffT: 0, nadeCd: 0,
    dying: false, dieT: 0,
  };

  let state = "ready";
  let wave = 0, waveState = "rest", restT = 1600;
  let queue = [], spawnInt = 1000, spawnT = 0;
  let score = 0, kills = 0, killsSinceDrop = 0, shotCount = 0;
  let best = parseInt(storage.getItem(LS_BEST) || "0", 10) || 0;
  let bannerMain = "", bannerSub = "", bannerT = 0, bannerMax = 1;
  let shakeT = 0, shakeMax = 1, shakeMag = 0;
  let vignetteFlash = 0;
  let simTime = 0;
  let timeScale = 1;
  let canRestart = true;
  let helpPrevState = null;
  let lastShootSfx = 0, lastNadeTap = 0;
  let scoreStr = "0", bestStr = "0", lastVig = -1, lastNadeDom = -1;

  function refreshScoreStr() {
    scoreStr = String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    bestStr = String(best).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  const keys = { l: false, r: false, fire: false };
  let movePid = -1, firePid = -1, moveTargetX = null, fireHeld = false;

  function toLocal(e) {
    const r = frame.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  function syncCtl() {
    fireCircle.classList.toggle("pressed", fireHeld);
    zoneMove.classList.toggle("active", movePid >= 0);
  }

  frame.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || hero.dying) return;
    e.preventDefault();
    const p = toLocal(e);
    if (p.x < W / 2) {
      if (movePid < 0) { movePid = e.pointerId; moveTargetX = clamp(p.x, ARENA_L, ARENA_R); syncCtl(); }
    } else {
      if (firePid < 0) { firePid = e.pointerId; fireHeld = true; syncCtl(); }
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerId === movePid) {
      const p = toLocal(e);
      moveTargetX = clamp(p.x, ARENA_L, ARENA_R);
    }
  });
  function releasePtr(e) {
    if (e.pointerId === movePid) { movePid = -1; moveTargetX = null; syncCtl(); }
    if (e.pointerId === firePid) { firePid = -1; fireHeld = false; syncCtl(); }
  }
  window.addEventListener("pointerup", releasePtr);
  window.addEventListener("pointercancel", releasePtr);
  window.addEventListener("blur", releaseAllInputs);

  function releaseAllInputs() {
    keys.l = keys.r = keys.fire = false;
    movePid = firePid = -1;
    moveTargetX = null;
    fireHeld = false;
    syncCtl();
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { keys.l = true; e.preventDefault(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { keys.r = true; e.preventDefault(); }
    else if (k === " " || k === "j" || k === "J") {
      if (!keys.fire && window.CasualSfx) window.CasualSfx.unlock();
      keys.fire = true; e.preventDefault();
    }
    else if (k === "g" || k === "G") throwHeroNade();
    else if (k === "p" || k === "P") togglePause();
    else if (k === "Escape") {
      if (!helpOverlay.hidden) closeHelp();
      else togglePause();
    }
    else if (k === "Enter") {
      if (state === "ready") startFromReady();
      else if (state === "over" && canRestart) restart();
      else if (state === "paused") resumeGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = false;
    else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = false;
    else if (k === " " || k === "j" || k === "J") keys.fire = false;
  });

  nadeBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastNadeTap < 220) return;
    lastNadeTap = now;
    throwHeroNade();
  });

  function addPart(kind, x, y, vx, vy, life, size, col, col2) {
    const p = take(parts);
    if (!p) return null;
    p.active = true;
    p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life; p.size = size;
    p.rot = rand(0, TAU); p.vr = rand(-9, 9);
    p.col = col; p.col2 = col2 || null; p.bounced = 0;
    return p;
  }
  function burstStars(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU), sp = rand(90, 210);
      addPart(P_STAR, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
        rand(480, 760), rand(4, 8), i % 2 ? "#ffd94a" : "#fff8dc");
    }
  }
  function sparks(x, y) {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU), sp = rand(70, 190);
      addPart(P_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(120, 240), rand(1.5, 3), i % 2 ? "#ffd94a" : "#ffffff");
    }
  }
  function popup(x, y, txt, col) {
    const p = take(popups);
    if (!p) return;
    p.active = true;
    p.x = clamp(x, 30, W - 30); p.y = y; p.txt = txt; p.col = col; p.t = 700;
  }
  function addScorch(x, r) {
    if (scorches.length >= 10) scorches.shift();
    scorches.push({ x, r, a: 0.5 });
  }
  function addShake(mag, ms) {
    if (mag > shakeMag || shakeT <= 0) { shakeMag = mag; shakeMax = ms; }
    shakeT = Math.max(shakeT, ms);
  }
  function banner(main, sub, ms) {
    bannerMain = main; bannerSub = sub; bannerT = ms; bannerMax = ms;
  }

  function buildQueue(n) {
    const count = 4 + n * 2;
    let heavies = n % 3 === 0 ? Math.max(1, Math.round(n / 3)) : 0;
    heavies = Math.min(heavies, Math.floor(count / 4));
    let grens = n >= 2 ? Math.floor(count * 0.2) : 0;
    const grunts = Math.max(0, count - heavies - grens);
    const q = [];
    for (let i = 0; i < grunts; i++) q.push(0);
    for (let i = 0; i < grens; i++) q.push(1);
    for (let i = 0; i < heavies; i++) q.push(2);
    for (let i = q.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = q[i]; q[i] = q[j]; q[j] = t;
    }
    return q;
  }
  function startWave(n) {
    wave = n;
    queue = buildQueue(n);
    spawnInt = Math.max(1150 - n * 55, 430);
    spawnT = 500;
    waveState = "combat";
    const hasHeavy = queue.indexOf(2) >= 0;
    banner("웨이브 " + n + " 시작!", hasHeavy ? "육중 병사 출현! 조심!" : "적을 막아라!", 1500);
    SFX.play("boss", 0.75);
  }
  function countActiveEnemies() {
    let c = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].active) c++;
    return c;
  }
  function spawnEnemy(kind) {
    const e = take(enemies);
    if (!e) return;
    const hm = 1 + (wave - 1) * 0.12;
    const sm = Math.min(1 + (wave - 1) * 0.045, 1.65);
    e.active = true;
    e.kind = kind;
    e.yOff = rand(-8, 5);
    e.face = 1;
    e.anim = rand(0, 6);
    e.hitT = 0; e.atkT = 400; e.lungeT = 0;
    e.x = Math.random() < 0.5 ? -26 : W + 26;
    if (kind === 0) {
      e.hp = e.maxHp = Math.round(2 * hm);
      e.spd = 46 * sm * rand(0.85, 1.15);
    } else if (kind === 1) {
      e.hp = e.maxHp = Math.round(3 * hm);
      e.spd = 40 * sm * rand(0.85, 1.1);
      e.range = rand(225, 285);
      e.throwT = rand(1100, 1900);
    } else {
      e.hp = e.maxHp = Math.round(6 * hm);
      e.spd = 23 * sm * rand(0.9, 1.1);
    }
  }
  function updateWaves(ms) {
    if (waveState === "rest") {
      restT -= ms;
      if (restT <= 0) startWave(wave + 1);
    } else {
      if (queue.length > 0) {
        spawnT -= ms;
        if (spawnT <= 0) {
          spawnEnemy(queue.pop());
          spawnT = spawnInt * rand(0.75, 1.25);
        }
      } else if (countActiveEnemies() === 0 && !hero.dying) {
        waveState = "rest";
        restT = 3000;
        healHero(15);
        banner("웨이브 " + wave + " 클리어!", "체력 +15 회복", 1400);
        SFX.play("clear", 0.5);
      }
    }
  }

  function nearestEnemy() {
    let bestE = null, bd = 1e9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      const d = Math.abs(e.x - hero.x);
      if (d < bd) { bd = d; bestE = e; }
    }
    return bestE;
  }
  function fireInterval() {
    return hero.buff === "shot" ? 210 : hero.buff === "gun" ? 60 : 180;
  }
  function shoot() {
    const h = hero;
    const sx = h.x + h.face * 3, sy = GROUND - 40;
    const ca = Math.cos(h.aim), sa = Math.sin(h.aim);
    const mr = 38 - h.recoil * 6;
    const mx = sx + ca * mr, my = sy + sa * mr;
    const offs = h.buff === "shot" ? ANG_SHOT : ANG_ONE;
    for (let i = 0; i < offs.length; i++) {
      const b = take(bullets);
      if (!b) break;
      const va = h.aim + offs[i] + (h.buff === "gun" ? rand(-0.03, 0.03) : 0);
      b.active = true;
      b.x = mx; b.y = my;
      b.vx = Math.cos(va) * 620;
      b.vy = Math.sin(va) * 620;
      b.life = 900;
    }
    h.recoil = 1;
    h.mfT = 60;
    shotCount++;
    if (h.buff !== "gun" || shotCount % 2 === 0) {
      addPart(P_CASE, sx - h.face * 6, sy + 2,
        -h.face * rand(55, 105), rand(-200, -130), 1400, 2, "#d8a83c");
    }
    const now = performance.now();
    if (now - lastShootSfx > 70) { lastShootSfx = now; SFX.play("shoot", 0.32); }
  }
  const ANG_ONE = [0];
  const ANG_SHOT = [-0.17, 0, 0.17];

  function damageEnemy(e, dmg, hx, hy) {
    e.hp -= dmg;
    e.hitT = 90;
    if (hx != null) sparks(hx, hy);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.active = false;
    kills++;
    const pts = 100 * wave;
    score += pts;
    refreshScoreStr();
    popup(e.x, GROUND + e.yOff - (e.kind === 2 ? 66 : 52), "+" + pts, "#ffd94a");
    burstStars(e.x, GROUND + e.yOff - 24);
    const pal = e.kind === 0 ? PAL.grunt : e.kind === 1 ? PAL.gren : PAL.heavy;
    const body = addPart(P_BODY, e.x, GROUND + e.yOff - 20,
      -e.face * rand(60, 130), rand(-210, -120), 900, e.kind === 2 ? 1.45 : 1, pal[0], pal[1]);
    if (body) body.vr = rand(-8, 8);
    SFX.play("hit", 0.55);
    if (e.kind === 2) addShake(4, 180);
    killsSinceDrop++;
    if (killsSinceDrop >= 6 || Math.random() < 0.1) {
      killsSinceDrop = 0;
      dropPickup(e.x);
    }
  }
  function dropPickup(x) {
    const p = take(pickups);
    if (!p) return;
    const r = Math.random();
    p.type = r < 0.26 ? 0 : r < 0.52 ? 1 : r < 0.78 ? 2 : 3;
    p.active = true;
    p.x = clamp(x, 40, W - 40);
    p.ph = rand(0, TAU);
    p.life = 9000;
  }
  function applyPickup(p) {
    p.active = false;
    SFX.play("upgrade", 0.7);
    if (p.type === 0) { hero.buff = "shot"; hero.buffT = 12000; popup(hero.x, GROUND - 74, "산탄 강화!", "#ffa54a"); }
    else if (p.type === 1) { hero.buff = "gun"; hero.buffT = 12000; popup(hero.x, GROUND - 74, "기관총!", "#5ab4ff"); }
    else if (p.type === 2) { hero.hp = Math.min(HERO_MAX_HP, hero.hp + 30); popup(hero.x, GROUND - 74, "체력 +30", "#6fe06a"); }
    else { hero.nades += 2; popup(hero.x, GROUND - 74, "수류탄 +2", "#ffd94a"); }
  }
  function healHero(n) {
    if (hero.dying) return;
    hero.hp = Math.min(HERO_MAX_HP, hero.hp + n);
    popup(hero.x, GROUND - 74, "+" + n, "#6fe06a");
  }

  function hurtHero(dmg, kbDir) {
    if (hero.invT > 0 || hero.dying || state !== "playing") return;
    hero.hp -= dmg;
    vignetteFlash = 1;
    hero.invT = 900;
    hero.kb = kbDir * 150;
    addShake(3, 160);
    SFX.play("hitSoft", 0.7);
    if (hero.hp <= 0) {
      hero.hp = 0;
      startDeath();
    }
  }
  function startDeath() {
    hero.dying = true;
    hero.dieT = 0;
    timeScale = 0.25;
    fireHeld = false;
    moveTargetX = null;
    movePid = firePid = -1;
    syncCtl();
    addShake(8, 520);
    SFX.play("lose", 0.85);
  }
  function finishGameOver() {
    hero.dying = false;
    timeScale = 1;
    state = "over";
    const isNew = score > best;
    if (isNew) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    refreshScoreStr();
    showResult(isNew);
  }

  function clusterTargetX() {
    let bx = hero.x + hero.face * 150, bestScore = -1e9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      let c = 0;
      for (let j = 0; j < enemies.length; j++) {
        const o = enemies[j];
        if (!o.active) continue;
        const dx = o.x - e.x, dy = o.yOff - e.yOff;
        if (dx * dx + dy * dy < 8100) c++;
      }
      const s = c * 100 - Math.abs(e.x - hero.x) * 0.1;
      if (s > bestScore) { bestScore = s; bx = e.x; }
    }
    return bx;
  }
  function throwHeroNade() {
    if (state !== "playing" || hero.dying) return;
    if (hero.nades <= 0 || hero.nadeCd > 0) return;
    hero.nades--;
    hero.nadeCd = 700;
    const g = take(nades);
    if (!g) return;
    const sx = hero.x, sy = GROUND - 52, tx = clusterTargetX(), T = 0.7;
    g.active = true;
    g.fromHero = true;
    g.x = sx; g.y = sy;
    g.vx = (tx - sx) / T;
    g.vy = (GROUND - 6 - sy) / T - 0.5 * GRAV * T;
    g.spin = 0;
    g.fuse = 3000;
    SFX.play("throw", 0.6);
  }
  function lobEnemyNade(e) {
    const g = take(nades);
    if (!g) return;
    const sx = e.x + e.face * 10, sy = GROUND + e.yOff - 42;
    const T = 0.95;
    g.active = true;
    g.fromHero = false;
    g.x = sx; g.y = sy;
    g.vx = (hero.x - sx) / T;
    g.vy = (GROUND - 6 - sy) / T - 0.5 * GRAV * T;
    g.spin = 0;
    g.fuse = 3000;
    SFX.play("throw", 0.45);
  }
  function explode(x, y, r, dmgHero, dmgEnemy) {
    addShake(r >= 100 ? 9 : 5, 260);
    SFX.play("explode", 0.85);
    addPart(P_FLASH, x, y, 0, 0, 110, r * 0.85, "#fff3c0");
    addPart(P_RING, x, y, 0, 0, 320, r * 0.35, "#ffb04a");
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), sp = rand(140, 330);
      addPart(P_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
        rand(160, 340), rand(2, 3.6), i % 2 ? "#ffcf3f" : "#ff8a3a");
    }
    for (let i = 0; i < 6; i++) {
      addPart(P_SMOKE, x + rand(-14, 14), y + rand(-8, 4),
        rand(-16, 16), rand(-46, -20), rand(420, 720), rand(7, 13), "rgba(70,60,50,0.5)");
    }
    addScorch(x, r * 0.42);
    if (dmgHero > 0) {
      const dx = hero.x - x, dy = (GROUND - 24) - y;
      if (dx * dx + dy * dy < (r + 12) * (r + 12)) hurtHero(dmgHero, dx >= 0 ? 1 : -1);
    }
    if (dmgEnemy > 0) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.active) continue;
        const dx = e.x - x, dy = GROUND + e.yOff - 22 - y;
        if (dx * dx + dy * dy < (r + 14) * (r + 14)) damageEnemy(e, dmgEnemy);
      }
    }
  }

  function updateHero(ms, sdt) {
    const h = hero;
    let mvx = 0;
    if (keys.l) mvx -= 1;
    if (keys.r) mvx += 1;
    if (moveTargetX != null) {
      const d = moveTargetX - h.x;
      mvx = Math.abs(d) < 3 ? 0 : d > 0 ? 1 : -1;
    }
    h.mvx = mvx;
    h.x += mvx * HERO_SPD * sdt + h.kb * sdt;
    h.kb *= Math.exp(-6 * sdt);
    if (Math.abs(h.kb) < 4) h.kb = 0;
    if (h.x < ARENA_L) h.x = ARENA_L;
    if (h.x > ARENA_R) h.x = ARENA_R;
    if (mvx !== 0) h.anim += sdt * 11;

    const tgt = nearestEnemy();
    let ta;
    if (tgt) {
      const ay = GROUND - 40;
      const ty = GROUND + tgt.yOff - (tgt.kind === 2 ? 34 : 24);
      ta = Math.atan2(ty - ay, tgt.x - h.x);
      h.face = tgt.x >= h.x ? 1 : -1;
    } else {
      ta = h.face === 1 ? 0 : Math.PI;
      if (mvx !== 0) h.face = mvx;
    }
    let diff = Math.abs((ta - h.aim + Math.PI * 3) % TAU - Math.PI);
    h.aim = diff > 2.2 ? ta : angLerp(h.aim, ta, 1 - Math.exp(-10 * sdt));

    if ((fireHeld || keys.fire) && !h.dying) {
      h.fireT -= ms;
      let guard = 0;
      while (h.fireT <= 0 && guard++ < 3) {
        shoot();
        h.fireT += fireInterval();
      }
    } else {
      h.fireT = Math.min(h.fireT, fireInterval() * 0.4);
    }

    if (h.invT > 0) h.invT -= ms;
    if (h.mfT > 0) h.mfT -= ms;
    h.recoil *= Math.exp(-9 * sdt);
    if (h.nadeCd > 0) h.nadeCd -= ms;
    if (h.buff) {
      h.buffT -= ms;
      if (h.buffT <= 0) h.buff = "";
    }
  }

  function updateEnemies(sdt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      const dx = hero.x - e.x;
      const adx = Math.abs(dx);
      e.face = dx >= 0 ? 1 : -1;
      e.anim += sdt * (e.spd * 0.09 + 2);
      if (e.hitT > 0) e.hitT -= STEP_MS;
      if (e.lungeT > 0) e.lungeT -= STEP_MS;

      const stop = e.kind === 2 ? 32 : 20;
      const hold = (e.kind === 1 && adx < e.range) || adx < stop;
      if (!hold) e.x += e.face * e.spd * sdt;

      if (e.kind === 1 && adx < e.range) {
        e.throwT -= STEP_MS;
        if (e.throwT <= 0) {
          e.throwT = rand(2500, 3400);
          lobEnemyNade(e);
        }
      }

      const cr = e.kind === 2 ? 36 : 26;
      if (adx < cr && !hero.dying) {
        e.atkT -= STEP_MS;
        if (e.atkT <= 0) {
          e.atkT = 900;
          e.lungeT = 180;
          hurtHero(e.kind === 2 ? 22 : 10, e.face);
          if (e.kind === 2) hero.kb += e.face * 120;
        }
      }
    }
  }

  function bulletHit(b) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      const hw = e.kind === 2 ? 18 : 11;
      const top = GROUND + e.yOff - (e.kind === 2 ? 58 : 44);
      const bot = GROUND + e.yOff + 2;
      if (b.x > e.x - hw && b.x < e.x + hw && b.y > top && b.y < bot) {
        damageEnemy(e, 1, b.x, b.y);
        b.active = false;
        return true;
      }
    }
    return false;
  }
  function updateBullets() {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) continue;
      b.life -= STEP_MS;
      if (b.life <= 0) { b.active = false; continue; }
      const sub = 2, sdt = STEP_S / sub;
      for (let s = 0; s < sub; s++) {
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        if (bulletHit(b)) break;
      }
      if (b.x < -24 || b.x > W + 24 || b.y < -30) b.active = false;
    }
  }

  function updateNades(sdt) {
    for (let i = 0; i < nades.length; i++) {
      const g = nades[i];
      if (!g.active) continue;
      g.vy += GRAV * sdt;
      g.x += g.vx * sdt;
      g.y += g.vy * sdt;
      g.spin += sdt * 9;
      g.fuse -= STEP_MS;
      if (g.y >= GROUND - 4 || g.fuse <= 0 || g.x < -30 || g.x > W + 30) {
        g.active = false;
        if (g.fromHero) explode(g.x, Math.min(g.y, GROUND - 4), 120, 0, 6);
        else explode(g.x, Math.min(g.y, GROUND - 4), 64, 18, 3);
      }
    }
  }

  function updatePickups(ms) {
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.active) continue;
      p.life -= ms;
      if (p.life <= 0) { p.active = false; continue; }
      if (!hero.dying && Math.abs(p.x - hero.x) < 30) applyPickup(p);
    }
  }

  function updateParts(sdt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.active) continue;
      p.life -= STEP_MS;
      if (p.life <= 0) { p.active = false; continue; }
      switch (p.kind) {
        case P_STAR:
          p.vy += 300 * sdt;
          p.x += p.vx * sdt; p.y += p.vy * sdt;
          p.rot += p.vr * sdt;
          break;
        case P_SPARK:
          p.x += p.vx * sdt; p.y += p.vy * sdt;
          p.vx *= 1 - 3 * sdt; p.vy *= 1 - 3 * sdt;
          break;
        case P_SMOKE:
          p.y -= 22 * sdt;
          p.size += 15 * sdt;
          break;
        case P_RING:
          p.size += 170 * sdt;
          break;
        case P_BODY:
          p.vy += GRAV * sdt;
          p.x += p.vx * sdt; p.y += p.vy * sdt;
          p.rot += p.vr * sdt;
          if (p.y > GROUND - 6) {
            p.y = GROUND - 6;
            p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.6;
          }
          break;
        case P_CASE:
          p.vy += GRAV * sdt;
          p.x += p.vx * sdt; p.y += p.vy * sdt;
          p.rot += p.vr * sdt;
          if (p.y > GROUND - 2 && p.bounced < 2) {
            p.y = GROUND - 2;
            p.vy *= -0.4; p.vx *= 0.7;
            p.bounced++;
          }
          break;
      }
    }
    for (let i = 0; i < scorches.length; i++) {
      scorches[i].a -= 0.00002 * STEP_MS;
    }
  }

  function updatePopups(ms) {
    for (let i = 0; i < popups.length; i++) {
      const p = popups[i];
      if (!p.active) continue;
      p.t -= ms;
      p.y -= 30 * (ms / 1000);
      if (p.t <= 0) p.active = false;
    }
  }

  function step() {
    simTime += STEP_S;
    updateWaves(STEP_MS);
    updateHero(STEP_MS, STEP_S);
    updateEnemies(STEP_S);
    updateBullets();
    updateNades(STEP_S);
    updatePickups(STEP_MS);
    updateParts(STEP_S);
    updatePopups(STEP_MS);
    if (bannerT > 0) bannerT -= STEP_MS;
    if (shakeT > 0) shakeT -= STEP_MS;
    if (vignetteFlash > 0) vignetteFlash -= 0.0022 * STEP_MS;
    for (let i = 0; i < clouds.length; i++) {
      clouds[i].x += clouds[i].v * STEP_S;
      if (clouds[i].x > W + 70) clouds[i].x = -70;
    }
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function starPath(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : r * 0.42;
      const a = rot + i * Math.PI / 4;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function wrapX(x, off) {
    return ((x - off) % SPAN + SPAN) % SPAN - 80;
  }

  function drawBackground() {
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
      skyGrad.addColorStop(0, "#ffe9a8");
      skyGrad.addColorStop(0.55, "#ffd07a");
      skyGrad.addColorStop(1, "#f5b36b");
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,250,220,0.85)";
    ctx.beginPath(); ctx.arc(88, 62, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,250,220,0.25)";
    ctx.beginPath(); ctx.arc(88, 62, 38, 0, TAU); ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 30 * c.s, 11 * c.s, 0, 0, TAU);
      ctx.ellipse(c.x + 20 * c.s, c.y + 3 * c.s, 20 * c.s, 8 * c.s, 0, 0, TAU);
      ctx.fill();
    }

    const off = hero.x - W / 2;
    for (let i = 0; i < farTrees.length; i++) {
      const t = farTrees[i];
      const x = wrapX(t.x, off * 0.06);
      ctx.fillStyle = t.c;
      if (t.round) {
        ctx.beginPath();
        ctx.arc(x, GROUND - 8 - t.h * 0.62, t.h * 0.34, 0, TAU);
        ctx.fill();
        ctx.fillRect(x - 3, GROUND - 8 - t.h * 0.4, 6, t.h * 0.4);
      } else {
        ctx.beginPath();
        ctx.moveTo(x - t.w / 2, GROUND - 6);
        ctx.lineTo(x, GROUND - 6 - t.h);
        ctx.lineTo(x + t.w / 2, GROUND - 6);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = "#3f8f63";
    for (let i = 0; i < midBush.length; i++) {
      const b = midBush[i];
      const x = wrapX(b.x, off * 0.12);
      ctx.beginPath();
      ctx.ellipse(x, GROUND - 4, b.w / 2, b.h, 0, Math.PI, TAU);
      ctx.fill();
    }
  }

  function drawGround() {
    ctx.fillStyle = "#7c5230";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#5da84a";
    ctx.fillRect(0, GROUND, W, 9);
    ctx.fillStyle = "#4c8c3c";
    ctx.fillRect(0, GROUND + 9, W, 3);
    ctx.fillStyle = "rgba(50,32,16,0.5)";
    for (let i = 0; i < specks.length; i++) {
      ctx.beginPath();
      ctx.arc(specks[i].x, specks[i].y, specks[i].r, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "#6fbf59";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < tufts.length; i++) {
      const t = tufts[i];
      ctx.beginPath();
      ctx.moveTo(t.x, GROUND + 2);
      ctx.quadraticCurveTo(t.x + t.lean, GROUND - t.h * 0.6, t.x + t.lean * 2, GROUND - t.h);
      ctx.stroke();
    }
    for (let i = 0; i < scorches.length; i++) {
      const s = scorches[i];
      if (s.a <= 0) continue;
      ctx.fillStyle = "rgba(35,24,12," + s.a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(s.x, GROUND + 4, s.r, s.r * 0.32, 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawFrontGrass() {
    ctx.strokeStyle = "#3f7d33";
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const x = (i * 53 + 17) % W;
      const h = 8 + (i % 3) * 4;
      ctx.beginPath();
      ctx.moveTo(x, H + 2);
      ctx.quadraticCurveTo(x + 3, H - h * 0.6, x + (i % 2 ? 5 : -5), H - h);
      ctx.stroke();
    }
  }

  function drawHero() {
    const h = hero;
    const moving = Math.abs(h.mvx) > 0.1 || Math.abs(h.kb) > 10;
    const bob = moving ? Math.sin(h.anim * 2) * 2.2 : Math.sin(simTime * 2) * 0.8;

    ctx.fillStyle = "rgba(20,30,15,0.3)";
    ctx.beginPath();
    ctx.ellipse(h.x, GROUND + 3, 20, 5, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    if (h.invT > 0 && ((h.invT / 80) | 0) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.translate(h.x, GROUND);
    if (h.dying) {
      const k = Math.min(1, h.dieT / 380);
      ctx.rotate(h.face * k * 1.5);
      ctx.translate(0, k * 6);
    }
    const f = h.face;
    const sw = moving ? Math.sin(h.anim * 2) * 7 : 0;

    ctx.lineCap = "round";
    ctx.strokeStyle = "#5f4630";
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-5, -20); ctx.lineTo(-5 + sw * 0.6, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -20); ctx.lineTo(5 - sw * 0.6, -3); ctx.stroke();
    ctx.fillStyle = "#3d2c1c";
    rr(-5 + sw * 0.6 - 6, -6, 11, 6, 2); ctx.fill();
    rr(5 - sw * 0.6 - 5, -6, 11, 6, 2); ctx.fill();

    ctx.fillStyle = "#55683c";
    rr(-12, -46 + bob, 24, 27, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    rr(-12, -46 + bob, 24, 9, 7); ctx.fill();
    ctx.fillStyle = "#3a2f1d";
    ctx.fillRect(-12, -23 + bob, 24, 5);
    ctx.fillStyle = "#ffcf3f";
    ctx.fillRect(-3, -23 + bob, 6, 5);

    const hx2 = f * 2;
    ctx.fillStyle = "#ffc98f";
    ctx.beginPath(); ctx.arc(hx2, -56 + bob, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e23b3b";
    rr(hx2 - 10, -63 + bob, 20, 7, 3); ctx.fill();
    const fl = Math.sin(simTime * 7) * 3;
    ctx.beginPath();
    ctx.moveTo(hx2 - f * 9, -60 + bob);
    ctx.lineTo(hx2 - f * 21, -56 + bob + fl);
    ctx.lineTo(hx2 - f * 10, -55 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#26201a";
    ctx.fillRect(hx2 + f * 2, -57 + bob, 2.6, 3.6);
    ctx.fillRect(hx2 + f * 6.5, -57 + bob, 2.6, 3.6);
    ctx.strokeStyle = "#26201a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx2 + f * 1, -59.5 + bob);
    ctx.lineTo(hx2 + f * 4.6, -58.4 + bob);
    ctx.moveTo(hx2 + f * 5.6, -58.4 + bob);
    ctx.lineTo(hx2 + f * 9.2, -59.5 + bob);
    ctx.stroke();

    const sx = f * 3, sy = -40 + bob;
    const ca = Math.cos(h.aim), sa = Math.sin(h.aim);
    ctx.strokeStyle = "#e8a874";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(f, sy + 2);
    ctx.lineTo(sx + ca * 14 - f * 5, sy + sa * 14 + 4);
    ctx.stroke();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(h.aim);
    const rec = h.recoil * 6;
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(-7 - rec, -3, 11, 6);
    ctx.fillStyle = "#3c3a36";
    ctx.fillRect(4 - rec, -3.5, 28, 7);
    ctx.fillStyle = "#23211e";
    ctx.fillRect(30 - rec, -2, 9, 4);
    ctx.fillStyle = "#2c2a26";
    ctx.fillRect(12 - rec, 3, 6, 8);
    ctx.restore();

    ctx.strokeStyle = "#ffc98f";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 1);
    ctx.lineTo(sx + ca * 20, sy + sa * 20 + 2);
    ctx.stroke();

    if (h.mfT > 0) {
      const s = h.mfT / 60;
      const mx = sx + ca * (39 - rec), my = sy + sa * (39 - rec);
      ctx.fillStyle = "rgba(255,240,160," + (0.9 * s).toFixed(3) + ")";
      starPath(mx, my, 10 * s + 4, h.aim);
      ctx.fill();
      ctx.fillStyle = "rgba(255,170,60," + (0.7 * s).toFixed(3) + ")";
      starPath(mx, my, 5.5 * s + 2, h.aim + 0.6);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const gy = GROUND + e.yOff;
    const big = e.kind === 2;
    const bw = big ? 30 : 20, bh = big ? 40 : 28;
    const pal = e.kind === 0 ? PAL.grunt : e.kind === 1 ? PAL.gren : PAL.heavy;

    ctx.fillStyle = "rgba(20,30,15,0.28)";
    ctx.beginPath();
    ctx.ellipse(e.x, gy + 3, big ? 24 : 15, 4.5, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(e.x, gy);
    const punch = e.hitT > 0 ? 1 + (e.hitT / 90) * 0.16 : 1;
    ctx.scale(e.face * punch, punch);
    if (e.lungeT > 0) ctx.translate(4, 0);
    const wob = Math.sin(e.anim) * 2.4;
    const hy = -bh - 12;

    ctx.lineCap = "round";
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = big ? 8 : 6;
    ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(-5 + wob * 0.7, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -14); ctx.lineTo(5 - wob * 0.7, -2); ctx.stroke();

    ctx.fillStyle = pal[0];
    rr(-bw / 2, -bh - 8, bw, bh, big ? 9 : 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    rr(-bw / 2, -bh - 8, bw, 8, big ? 9 : 6);
    ctx.fill();
    ctx.fillStyle = pal[1];
    ctx.fillRect(-bw / 2, -16, bw, 4);

    ctx.fillStyle = "#f0c9a0";
    ctx.beginPath(); ctx.arc(1, hy, big ? 10 : 8, 0, TAU); ctx.fill();
    ctx.fillStyle = pal[1];
    ctx.beginPath();
    ctx.arc(1, hy - 1.5, big ? 10 : 8, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(1 - (big ? 10 : 8), hy - 2.5, big ? 20 : 16, 2.5);
    ctx.fillStyle = "#1d1d22";
    rr(1 - (big ? 9 : 7.4), hy - 1, big ? 18 : 14.8, big ? 7 : 5.6, 2.5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(2, hy + 0.8, 2.6, 3);
    ctx.fillRect(big ? 7 : 5.6, hy + 0.8, 2.6, 3);

    if (e.kind === 1 && e.throwT < 380) {
      ctx.strokeStyle = "#f0c9a0";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, -bh + 2);
      ctx.lineTo(12, -bh - 16);
      ctx.stroke();
      ctx.fillStyle = "#3d5a35";
      ctx.beginPath(); ctx.arc(13, -bh - 19, 4.5, 0, TAU); ctx.fill();
    } else if (big) {
      ctx.fillStyle = pal[1];
      ctx.beginPath(); ctx.arc(bw / 2 + 2, -bh + 4, 6, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = "#4a4038";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(6, -bh + 4);
      ctx.lineTo(17, -bh - 2);
      ctx.stroke();
    }
    ctx.restore();

    if (e.hp < e.maxHp) {
      const w = big ? 34 : 24;
      const pct = e.hp / e.maxHp;
      ctx.fillStyle = "rgba(10,16,10,0.6)";
      rr(e.x - w / 2, gy - (big ? 72 : 58), w, 4.5, 2);
      ctx.fill();
      ctx.fillStyle = pct > 0.4 ? "#ff8a3a" : "#ff5a4e";
      rr(e.x - w / 2, gy - (big ? 72 : 58), w * pct, 4.5, 2);
      ctx.fill();
    }
  }

  function drawNade(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.spin);
    ctx.fillStyle = g.fromHero ? "#3d5a35" : "#5a3030";
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.arc(-1.8, -1.8, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#8a8a8a";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(3, -9); ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    const tx = b.x - b.vx * 0.018, ty = b.y - b.vy * 0.018;
    ctx.strokeStyle = "rgba(255,217,74,0.35)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = "#ffe98a";
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function drawPickup(p) {
    const blink = p.life < 2500 && ((p.life / 160) | 0) % 2 === 0;
    if (blink) return;
    const y = GROUND - 26 + Math.sin(simTime * 4 + p.ph) * 4;
    const pulse = 0.4 + 0.25 * Math.sin(simTime * 5 + p.ph);
    ctx.strokeStyle = "rgba(255,220,110," + pulse.toFixed(3) + ")";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, y, 17 + pulse * 3, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath(); ctx.arc(p.x, y, 15, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(p.x, y);
    if (p.type === 0) {
      ctx.fillStyle = "#ff8c3a";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(9, 7); ctx.lineTo(-9, 7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-3, 3, 1.4, 0, TAU); ctx.arc(1, 3, 1.4, 0, TAU); ctx.arc(5, 3, 1.4, 0, TAU); ctx.fill();
    } else if (p.type === 1) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#4aa8ff";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      rr(-7, -7, 14, 14, 3);
      ctx.fill(); ctx.stroke();
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = "#eaf6ff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.moveTo(-4, 3); ctx.lineTo(4, 3); ctx.stroke();
    } else if (p.type === 2) {
      ctx.fillStyle = "#58d05a";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-11, 0, -7, -9, 0, -3);
      ctx.bezierCurveTo(7, -9, 11, 0, 0, 8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(-3, -2.5, 1.8, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = "#37414a";
      ctx.beginPath(); ctx.arc(0, 1.5, 7.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath(); ctx.arc(-2.5, -1, 2.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#c9a05a";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(3, -10, 6, -9); ctx.stroke();
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath(); ctx.arc(6.5, -9, 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawParts() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.active) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      switch (p.kind) {
        case P_STAR:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.col;
          starPath(p.x, p.y, p.size, p.rot);
          ctx.fill();
          break;
        case P_SPARK:
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = p.size;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
          break;
        case P_SMOKE:
          ctx.globalAlpha = a * 0.55;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          break;
        case P_RING:
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 3.5 * a + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
          break;
        case P_FLASH:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.15 - a * 0.35), 0, TAU); ctx.fill();
          break;
        case P_BODY:
          ctx.globalAlpha = Math.min(1, a * 2.2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          rr(-13, -7, 26, 14, 6);
          ctx.fill();
          ctx.fillStyle = "#f0c9a0";
          ctx.beginPath(); ctx.arc(15, 0, 6.5, 0, TAU); ctx.fill();
          ctx.fillStyle = p.col2;
          ctx.beginPath(); ctx.arc(15, -1, 6.5, Math.PI, TAU); ctx.fill();
          ctx.strokeStyle = "#3a3a3a";
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(-16, 10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-6, 12); ctx.stroke();
          ctx.restore();
          break;
        case P_CASE:
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.fillRect(-2.4, -1.2, 4.8, 2.4);
          ctx.restore();
          break;
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(8,20,12,0.55)";
    rr(10, 10, 192, 72, 10); ctx.fill();
    rr(W - 162, 10, 152, 64, 10); ctx.fill();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = F12;
    ctx.fillStyle = "#cfe6c2";
    ctx.fillText("HP", 20, 26);
    const pct = clamp(hero.hp / HERO_MAX_HP, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rr(44, 15, 148, 13, 6); ctx.fill();
    ctx.fillStyle = pct > 0.5 ? "#5fd457" : pct > 0.25 ? "#ffcf3f" : "#ff5a4e";
    if (pct > 0) { rr(44, 15, Math.max(8, 148 * pct), 13, 6); ctx.fill(); }

    if (hero.buff) {
      const frac = clamp(hero.buffT / 12000, 0, 1);
      ctx.font = F12;
      ctx.fillStyle = "#ffe9a8";
      ctx.fillText(hero.buff === "shot" ? "🔺 산탄" : "💠 기관총", 20, 44);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      rr(76, 35, 116, 9, 4); ctx.fill();
      ctx.fillStyle = hero.buff === "shot" ? "#ffa54a" : "#5ab4ff";
      rr(76, 35, Math.max(3, 116 * frac), 9, 4); ctx.fill();
    } else {
      ctx.font = F12;
      ctx.fillStyle = "#7d9573";
      ctx.fillText("무기: 기본 소총", 20, 44);
    }

    ctx.font = F14;
    ctx.fillStyle = hero.nades > 0 ? "#ffffff" : "#7d9573";
    ctx.fillText("💣 수류탄 ×" + hero.nades, 20, 68);

    ctx.textAlign = "right";
    ctx.font = F22;
    ctx.strokeStyle = "rgba(15,25,15,0.8)";
    ctx.lineWidth = 4;
    ctx.strokeText(scoreStr, W - 22, 34);
    ctx.fillStyle = "#ffd94a";
    ctx.fillText(scoreStr, W - 22, 34);
    ctx.font = F12;
    ctx.fillStyle = "#cfe6c2";
    ctx.fillText("점수", W - 22, 48);
    ctx.fillText("웨이브 " + wave + "  ·  최고 " + bestStr, W - 22, 64);
    ctx.textAlign = "left";
  }

  function drawBanner() {
    if (bannerT > 0) {
      const k = bannerT / bannerMax;
      const popIn = k > 0.86 ? (1 - k) / 0.14 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 3.2);
      ctx.translate(W / 2, 112);
      ctx.scale(0.82 + popIn * 0.18, 0.82 + popIn * 0.18);
      ctx.textAlign = "center";
      ctx.font = F34;
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(18,28,16,0.85)";
      ctx.strokeText(bannerMain, 0, 0);
      ctx.fillStyle = "#ffd94a";
      ctx.fillText(bannerMain, 0, 0);
      if (bannerSub) {
        ctx.font = F16;
        ctx.lineWidth = 5;
        ctx.strokeText(bannerSub, 0, 28);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(bannerSub, 0, 28);
      }
      ctx.restore();
    }
    if (waveState === "rest" && state === "playing" && bannerT <= 0) {
      ctx.save();
      ctx.globalAlpha = 0.65 + 0.3 * Math.sin(simTime * 5);
      ctx.textAlign = "center";
      ctx.font = F16;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(18,28,16,0.8)";
      const msg = "다음 웨이브까지 " + Math.ceil(restT / 1000) + "초…";
      ctx.strokeText(msg, W / 2, 146);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(msg, W / 2, 146);
      ctx.restore();
    }
  }

  function render(now) {
    drawBackground();

    ctx.save();
    if (shakeT > 0) {
      const k = shakeT / shakeMax;
      const m = shakeMag * k;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawGround();
    for (let i = 0; i < pickups.length; i++) if (pickups[i].active) drawPickup(pickups[i]);
    for (let i = 0; i < enemies.length; i++) if (enemies[i].active) drawEnemy(enemies[i]);
    drawHero();
    for (let i = 0; i < nades.length; i++) if (nades[i].active) drawNade(nades[i]);
    for (let i = 0; i < bullets.length; i++) if (bullets[i].active) drawBullet(bullets[i]);
    drawParts();
    drawFrontGrass();
    ctx.restore();

    drawHUD();
    drawBanner();

    const lowHp = hero.hp > 0 && hero.hp < 30 && state === "playing"
      ? 0.2 + 0.1 * Math.sin(now / 170) : 0;
    const vig = Math.max(lowHp, Math.max(0, vignetteFlash));
    if (Math.abs(vig - lastVig) > 0.01 || (vig === 0 && lastVig !== 0)) {
      vignetteEl.style.opacity = vig.toFixed(2);
      lastVig = vig;
    }
    if (hero.nades !== lastNadeDom) {
      lastNadeDom = hero.nades;
      nadeCountEl.textContent = String(hero.nades);
      nadeBtn.classList.toggle("empty", hero.nades <= 0);
    }
  }

  let last = performance.now(), acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = now - last;
    last = now;
    if (dt > 32) dt = 32;
    if (state === "playing") {
      acc += dt * timeScale;
      let n = 0;
      while (acc >= STEP_MS && n < 3) { step(); acc -= STEP_MS; n++; }
      if (n === 3) acc = 0;
      if (hero.dying) {
        hero.dieT += dt;
        if (hero.dieT >= 420) finishGameOver();
      }
    }
    render(now);
  }

  function showReady() {
    overlayCard.innerHTML =
      '<div class="card-emblem">🎖️</div>' +
      "<h2>람보 히어로</h2>" +
      '<p class="lead">오른쪽 버튼으로 사격!<br>혼자서 몰려오는 적 웨이브를 막아라!</p>' +
      '<div class="ctrl-grid">' +
      "<span>이동</span><b>왼쪽 화면 드래그 · ←→ / A D</b>" +
      "<span>사격</span><b>오른쪽 FIRE 홀드 · Space / J</b>" +
      "<span>수류탄</span><b>💣 버튼 · G</b>" +
      "</div>" +
      '<button class="retry" id="btn-start">작전 개시</button>';
    overlay.hidden = false;
    document.getElementById("btn-start").addEventListener("click", startFromReady);
  }
  function startFromReady() {
    if (state !== "ready") return;
    SFX.play("click", 0.5);
    overlay.hidden = true;
    state = "playing";
    banner("준비!", "적이 다가옵니다…", 1300);
  }
  function showPause() {
    overlayCard.innerHTML =
      "<h2>⏸ 일시정지</h2>" +
      '<p class="lead">잠시 숨을 고르는 중…</p>' +
      '<button class="retry" id="btn-resume">계속하기</button>' +
      '<button class="ghost" id="btn-restart">재시작</button>';
    overlay.hidden = false;
    document.getElementById("btn-resume").addEventListener("click", resumeGame);
    document.getElementById("btn-restart").addEventListener("click", () => {
      SFX.play("click", 0.5);
      restart();
    });
  }
  function showResult(isNew) {
    overlayCard.innerHTML =
      "<h2>작전 종료</h2>" +
      (isNew ? '<span class="new-best">🏆 신기록 달성!</span>' : "") +
      '<div class="result-row">' +
      '<div class="result-item"><span class="result-num">' + wave + "</span><span class=\"result-label\">웨이브</span></div>" +
      '<div class="result-item"><span class="result-num">' + kills + "</span><span class=\"result-label\">처치</span></div>" +
      '<div class="result-item"><span class="result-num">' + scoreStr + "</span><span class=\"result-label\">점수</span></div>" +
      "</div>" +
      '<p class="best-line">최고 점수 <b>' + bestStr + "</b></p>" +
      '<button class="retry" id="btn-again" disabled>재시작</button>';
    overlay.hidden = false;
    const again = document.getElementById("btn-again");
    canRestart = false;
    setTimeout(() => {
      canRestart = true;
      again.disabled = false;
    }, 400);
    again.addEventListener("click", () => {
      if (!canRestart) return;
      SFX.play("click", 0.5);
      restart();
    });
  }
  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    btnPause.classList.add("paused");
    releaseAllInputs();
    showPause();
  }
  function resumeGame() {
    if (state !== "paused") return;
    SFX.play("click", 0.5);
    state = "playing";
    btnPause.classList.remove("paused");
    overlay.hidden = true;
  }
  function togglePause() {
    if (!helpOverlay.hidden) return;
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
  }
  function restart() {
    resetGame();
    btnPause.classList.remove("paused");
    overlay.hidden = true;
    state = "playing";
    banner("준비!", "적이 다가옵니다…", 1300);
  }
  function resetGame() {
    hero.x = W / 2; hero.hp = HERO_MAX_HP; hero.nades = 2;
    hero.face = 1; hero.aim = 0; hero.anim = 0; hero.mvx = 0;
    hero.kb = 0; hero.fireT = 0; hero.recoil = 0; hero.mfT = 0;
    hero.invT = 0; hero.buff = ""; hero.buffT = 0; hero.nadeCd = 0;
    hero.dying = false; hero.dieT = 0;
    deactivateAll(bullets); deactivateAll(enemies); deactivateAll(parts);
    deactivateAll(popups); deactivateAll(nades); deactivateAll(pickups);
    scorches.length = 0;
    wave = 0; waveState = "rest"; restT = 1600;
    queue = []; spawnT = 0;
    score = 0; kills = 0; killsSinceDrop = 0; shotCount = 0;
    bannerT = 0; shakeT = 0; vignetteFlash = 0;
    timeScale = 1; acc = 0;
    refreshScoreStr();
  }
  function deactivateAll(pool) {
    for (let i = 0; i < pool.length; i++) pool[i].active = false;
  }

  btnPause.addEventListener("click", () => {
    SFX.play("click", 0.4);
    togglePause();
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.play("click", 0.5);
    if (state === "playing") {
      helpPrevState = "playing";
      state = "paused";
      btnPause.classList.add("paused");
      releaseAllInputs();
    }
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }
  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
    if (helpPrevState === "playing" && state === "paused") {
      helpPrevState = null;
      state = "playing";
      btnPause.classList.remove("paused");
    } else {
      helpPrevState = null;
    }
  }
  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => {
    SFX.play("click", 0.5);
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pauseGame();
  });

  resetGame();
  refreshScoreStr();
  fit();
  requestAnimationFrame(() => fit());
  showReady();
  requestAnimationFrame(loop);
})();
