(() => {
  "use strict";

  const W = 360;
  const H = 640;

  const GRAVITY = 1500;      // px/s²
  const JUMP_V = -620;       // px/s, fixed bounce impulse
  const SPRING_MULT = 1.7;   // spring super-jump multiplier
  const MAX_FALL = 1150;     // terminal fall velocity cap
  const STEP = 1 / 60;       // fixed timestep
  const DT_CLAMP = 0.032;    // max frame delta fed to the accumulator (ms→s)

  /* --- Reachability math -------------------------------------------------
   * Max jump height   h = JUMP_V² / (2·GRAVITY) = 620² / 3000 ≈ 128 px
   * Vertical gap cap  GAP_MAX = 104 px ≈ 81% of h   (spec limit: ≤ 82%)
   * Airtime between equal heights t = 2·|JUMP_V| / GRAVITY ≈ 0.83 s
   * Horizontal reach per hop = MAX_VX · t ≈ 330 · 0.83 ≈ 273 px
   *   (edge wrap-around only adds reach), so consecutive platform centers
   *   are kept within X_REACH = 250 px, measured wrap-aware:
   *   min(|dx|, W − |dx|). Every platform is therefore reachable.
   * Spring hops: v = JUMP_V·1.7 → h ≈ 370 px (bonus, never required).
   * --------------------------------------------------------------------- */
  const GAP_MIN = 54;
  const GAP_MAX = 104;       // ≤ 82% of max jump height (128 px)
  const X_REACH = 250;

  const MOVE_ACC = 2000;     // px/s² horizontal acceleration
  const MAX_VX = 330;        // px/s max steer speed
  const FRICTION = 7.5;      // exponential drag when no input (vx *= e^-k·dt)
  const DRAG_FOLLOW = 1.12;  // finger-drag follow responsiveness

  const PLAYER_R = 15;       // body radius
  const PLAYER_HW = 13;      // half-width for platform overlap
  const ANCHOR_Y = H * 0.40; // camera keeps player ~40% down the screen
  const PX_PER_M = 10;       // world px per meter of altitude
  const DIFF_RAMP_M = 420;   // meters until full difficulty
  const RESTART_GUARD_MS = 400;

  const PLAT_W = 64;
  const PLAT_H = 14;
  const PLAT_PAD = 10;

  // p(move) = 0.06 + 0.22·d,  p(break) = 0.05 + 0.23·d,  rest normal.
  // spring attaches to ~5.5% of normal platforms.
  const MOVE_BASE = 0.06, MOVE_RAMP = 0.22;
  const BREAK_BASE = 0.05, BREAK_RAMP = 0.23;
  const SPRING_CHANCE = 0.055;
  const STAR_CHANCE = 0.16;
  const SAFE_START_M = 30;   // meters with guaranteed normal platforms

  const STATE = { READY: 0, PLAYING: 1, OVER: 2 };
  const LS_BEST = "doodlejump.best";
  const LS_SOUND = "doodlejump.sound";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrapDist = (a, b) => {
    const d = Math.abs(a - b) % W;
    return Math.min(d, W - d);
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, cx, cy, ro, ri) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? ro : ri;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  const storage = (() => {
    try {
      localStorage.setItem("__dj", "1");
      localStorage.removeItem("__dj");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  function readBest() {
    const n = parseInt(storage.getItem(LS_BEST) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function writeBest(n) {
    storage.setItem(LS_BEST, String(n));
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const canvasBox = document.getElementById("canvas-box");
  const btnPause = document.getElementById("btn-pause");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  const SFX = {
    bounce() { if (soundOn && window.CasualSfx) window.CasualSfx.play("bounce", 0.5); },
    whoosh() { if (soundOn && window.CasualSfx) window.CasualSfx.play("whoosh", 0.55); },
    rattle() { if (soundOn && window.CasualSfx) window.CasualSfx.play("rattle", 0.5); },
    lose() { if (soundOn && window.CasualSfx) window.CasualSfx.play("lose", 0.6); },
    pickup() { if (soundOn && window.CasualSfx) window.CasualSfx.play("pickup", 0.55); },
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
    fanfare() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["level", "fanfare"], 90, 0.7); },
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

  let viewScale = 1;
  let state = STATE.READY;
  let paused = false;
  let tGlobal = 0;
  let acc = 0;
  let lastTs = 0;

  let plats = [];
  let starsArr = [];
  let particles = [];
  let clouds = [];
  let spaceStars = [];

  const player = { x: W / 2, y: 0, vx: 0, vy: 0, facing: 1, landT: 0 };
  let camY = 0;
  let startY = 0;          // player's initial world y (altitude origin)
  let altPx = 0;           // max altitude reached, in px
  let starCount = 0;
  let best = readBest();
  let liveNewShown = false;
  let liveNewT = 0;
  let hintT = 0;
  let goShownAt = 0;
  let deathDelay = 0;

  const keys = { left: false, right: false };
  const pointers = new Map(); // id -> {startLX, lastLX, curLX, side, drag}

  function difficulty(m) { return clamp(m / DIFF_RAMP_M, 0, 1); }

  function makePlatform(y, prevCx, forceNormal) {
    const altM = (startY - y) / PX_PER_M;
    const d = difficulty(Math.max(0, altM));
    let type = "normal";
    if (!forceNormal && altM > SAFE_START_M) {
      const r = Math.random();
      const pMove = MOVE_BASE + MOVE_RAMP * d;
      const pBreak = BREAK_BASE + BREAK_RAMP * d;
      if (r < pMove) type = "move";
      else if (r < pMove + pBreak) type = "break";
    }

    const plat = {
      type,
      y,
      w: type === "break" ? PLAT_W + 4 : PLAT_W,
      h: PLAT_H,
      broken: false,
      vy: 0,
      rot: 0,
      rotV: 0,
      hasSpring: false,
      springT: 0,
      baseX: 0,
      x: 0,
      amp: 0,
      spd: 0,
      phase: rand(0, Math.PI * 2),
    };

    if (type === "move") {
      plat.amp = rand(34, 62);
      plat.spd = rand(1.1, 2.1);
      const lo = PLAT_PAD + plat.amp;
      const hi = W - PLAT_PAD - plat.w - plat.amp;
      plat.baseX = hi > lo ? rand(lo, hi) : (lo + hi) / 2;
      if (hi <= lo) plat.amp = Math.max(10, (W - PLAT_PAD * 2 - plat.w) / 2 - 2);
      plat.x = plat.baseX;
    } else {
      // Wrap-aware horizontal reachability vs previous platform center.
      const lo = PLAT_PAD;
      const hi = W - PLAT_PAD - plat.w;
      let x = 0, ok = false;
      for (let i = 0; i < 24; i++) {
        x = rand(lo, hi);
        if (!prevCx || wrapDist(x + plat.w / 2, prevCx) <= X_REACH) { ok = true; break; }
      }
      if (!ok && prevCx) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        x = clamp(prevCx + dir * rand(70, 180) - plat.w / 2, lo, hi);
      }
      plat.x = x;
    }

    if (type === "normal" && Math.random() < SPRING_CHANCE) plat.hasSpring = true;

    // Occasional star floating in the gap just above this platform.
    if (!forceNormal && Math.random() < STAR_CHANCE) {
      starsArr.push({
        x: rand(40, W - 40),
        y: y - rand(26, 44),
        r: 11,
        phase: rand(0, Math.PI * 2),
        taken: false,
      });
    }
    return plat;
  }

  function spawnAbove() {
    let highest = null;
    for (const p of plats) if (!highest || p.y < highest.y) highest = p;
    let guard = 64;
    while (highest && highest.y > camY - 80 && guard-- > 0) {
      const altM = Math.max(0, (startY - highest.y) / PX_PER_M);
      const d = difficulty(altM);
      const gapMin = lerp(50, 78, d);
      const gapMax = lerp(72, GAP_MAX, d);
      const gap = clamp(rand(gapMin, gapMax), GAP_MIN, GAP_MAX);
      const prevCx = highest.x + highest.w / 2;
      const np = makePlatform(highest.y - gap, prevCx, false);
      plats.push(np);
      highest = np;
    }
  }

  function buildClouds() {
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: rand(-30, W + 30),
        y: rand(0, H * 1.6),
        s: rand(0.6, 1.25),
        v: rand(4, 11),
      });
    }
  }

  function buildSpaceStars() {
    spaceStars = [];
    for (let i = 0; i < 70; i++) {
      spaceStars.push({
        x: Math.random() * W,
        y0: Math.random() * H * 1.5,
        s: rand(0.7, 1.9),
        tw: rand(1.5, 4),
        ph: rand(0, Math.PI * 2),
      });
    }
  }

  function resetGame() {
    plats = [];
    starsArr = [];
    particles = [];
    starCount = 0;
    altPx = 0;
    liveNewShown = false;
    liveNewT = 0;
    hintT = 0;
    deathDelay = 0;
    camY = 0;
    player.x = W / 2;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.landT = 0;

    const startYPlat = H - 84;
    const start = makePlatform(startYPlat, 0, true);
    start.w = 88;
    start.x = (W - start.w) / 2;
    plats.push(start);

    startY = startYPlat - PLAYER_R;
    player.y = startY;
    spawnAbove();
    buildClouds();
  }

  function logicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  function beginPlay() {
    if (state !== STATE.READY) return;
    state = STATE.PLAYING;
    hintT = 1;
  }

  function primaryAction() {
    if (!helpOverlay.hidden || paused) return;
    if (state === STATE.READY) beginPlay();
    else if (state === STATE.OVER && performance.now() - goShownAt > RESTART_GUARD_MS) restart();
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (paused) { setPaused(false); return; }
    primaryAction();
    if (state !== STATE.PLAYING) return;
    const lx = logicalX(e.clientX);
    pointers.set(e.pointerId, {
      startLX: lx, lastLX: lx, curLX: lx,
      side: lx < W / 2 ? -1 : 1, drag: false,
    });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.curLX = logicalX(e.clientX);
    if (Math.abs(p.curLX - p.startLX) > 14) p.drag = true;
  });

  function releasePointer(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!helpOverlay.hidden) closeHelp();
      return;
    }
    if (!helpOverlay.hidden) return;
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      e.preventDefault();
      keys.left = true;
      beginPlay();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      e.preventDefault();
      keys.right = true;
      beginPlay();
    } else if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (e.repeat) return;
      if (paused) setPaused(false);
      else primaryAction();
    } else if (e.code === "KeyP") {
      setPaused(!paused);
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });

  btnPause.addEventListener("pointerdown", (e) => e.stopPropagation());
  btnPause.addEventListener("click", () => {
    SFX.click();
    setPaused(!paused);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING && !paused) setPaused(true);
  });

  function setPaused(v) {
    if (state !== STATE.PLAYING && v) return;
    paused = v;
    btnPause.classList.toggle("paused", paused);
    btnPause.setAttribute("aria-label", paused ? "계속하기" : "일시정지");
    if (paused) pointers.clear();
    lastTs = performance.now();
  }

  function burst(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(spread * 0.3, spread);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: rand(0.35, 0.7),
        t: 0,
        size: rand(2, 4.5),
        color,
      });
    }
  }

  function land(plat) {
    const feet = player.y + PLAYER_R;
    const springZone = plat.hasSpring &&
      player.x > plat.x + plat.w - 32 && player.x < plat.x + plat.w + 2;

    if (springZone) {
      player.vy = JUMP_V * SPRING_MULT;
      plat.springT = 0.28;
      player.landT = 0.16;
      SFX.whoosh();
      burst(player.x, feet, "#ffe08a", 8, 130);
    } else {
      player.vy = JUMP_V;
      player.landT = 0.13;
      if (plat.type === "break") {
        plat.broken = true;
        plat.vy = 40;
        plat.rotV = rand(2.4, 4.5) * (Math.random() < 0.5 ? -1 : 1);
        SFX.rattle();
        burst(player.x, feet, "#b98a58", 7, 110);
      } else {
        SFX.bounce();
        burst(player.x, feet, "rgba(255,255,255,0.85)", 4, 70);
      }
    }
  }

  function die() {
    if (state !== STATE.PLAYING) return;
    state = STATE.OVER;
    SFX.lose();
    const score = Math.floor(altPx / PX_PER_M) + starCount * 50;
    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      writeBest(best);
    }
    setTimeout(() => showGameOver(score, isNewBest), 320);
  }

  function update(step) {
    tGlobal += step;
    hintT = Math.max(0, hintT - step);
    liveNewT = Math.max(0, liveNewT - step);
    player.landT = Math.max(0, player.landT - step);

    // Ambient layers always drift a little (also on READY).
    for (const c of clouds) {
      c.x -= c.v * step;
      if (c.x < -90 * c.s) { c.x = W + 60; c.y = rand(0, H * 1.6); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.t += step;
      pt.x += pt.vx * step;
      pt.y += pt.vy * step;
      pt.vy += GRAVITY * 0.35 * step;
      if (pt.t >= pt.life) particles.splice(i, 1);
    }

    for (const p of plats) {
      if (p.type === "move" && !p.broken) {
        p.x = p.baseX + Math.sin(p.phase + tGlobal * p.spd) * p.amp;
      }
      if (p.broken) {
        p.vy += GRAVITY * 0.9 * step;
        p.y += p.vy * step;
        p.rot += p.rotV * step;
      }
      if (p.springT > 0) p.springT = Math.max(0, p.springT - step);
    }

    if (state === STATE.READY) {
      player.y = startY + Math.sin(tGlobal * 3.1) * 4;
      player.facing = Math.sin(tGlobal * 0.9) > 0 ? 1 : -1;
      return;
    }
    if (state !== STATE.PLAYING) return;

    let dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    let dragging = false;
    pointers.forEach((pt) => {
      if (pt.drag) {
        dragging = true;
        const dx = pt.curLX - pt.lastLX;
        if (Math.abs(dx) > 0.01) {
          player.x += dx * DRAG_FOLLOW;
          player.facing = dx > 0 ? 1 : -1;
        }
        pt.lastLX = pt.curLX;
      } else if (!dir) {
        dir = pt.side;
      }
    });

    if (!dragging) {
      if (dir !== 0) {
        player.vx = clamp(player.vx + dir * MOVE_ACC * step, -MAX_VX, MAX_VX);
        player.facing = dir;
      } else {
        player.vx *= Math.exp(-FRICTION * step);
        if (Math.abs(player.vx) < 4) player.vx = 0;
      }
      player.x += player.vx * step;
    } else {
      player.vx *= Math.exp(-10 * step);
    }

    if (player.x < -PLAYER_HW) player.x += W + PLAYER_HW * 2;
    else if (player.x > W + PLAYER_HW) player.x -= W + PLAYER_HW * 2;

    const prevBottom = player.y + PLAYER_R;
    player.vy = Math.min(player.vy + GRAVITY * step, MAX_FALL);
    player.y += player.vy * step;

    // ---- Platform collisions (only while falling, swept feet test) ----
    if (player.vy > 0) {
      const feet = player.y + PLAYER_R;
      for (const p of plats) {
        if (p.broken) continue;
        if (prevBottom <= p.y + 2 && feet >= p.y &&
            player.x + PLAYER_HW > p.x && player.x - PLAYER_HW < p.x + p.w) {
          land(p);
          break;
        }
      }
    }

    for (const s of starsArr) {
      if (s.taken) continue;
      const dy = s.y + Math.sin(tGlobal * 2.4 + s.phase) * 5;
      const dx = s.x - player.x;
      const dyy = dy - player.y;
      if (dx * dx + dyy * dyy < (s.r + PLAYER_R) * (s.r + PLAYER_R)) {
        s.taken = true;
        starCount += 1;
        SFX.pickup();
        burst(s.x, dy, "#ffd75c", 12, 170);
      }
    }

    if (player.y - camY < ANCHOR_Y) camY = player.y - ANCHOR_Y;
    altPx = Math.max(altPx, startY - player.y);

    const score = Math.floor(altPx / PX_PER_M) + starCount * 50;
    if (!liveNewShown && best > 0 && score > best) {
      liveNewShown = true;
      liveNewT = 1.8;
      SFX.pickup();
    }

    spawnAbove();

    const cullY = camY + H + 80;
    plats = plats.filter((p) => p.y < cullY);
    starsArr = starsArr.filter((s) => !s.taken && s.y < cullY);

    if (player.y - camY > H + 70) die();
  }

  // Altitude-keyed sky stops: dawn → day → dusk → night → space
  const SKY_STOPS = [
    [0,   "#ffca8f", "#ffe9cd"],
    [120, "#8fd0f5", "#dcf2ff"],
    [350, "#5a74c9", "#a58fd8"],
    [650, "#1b2350", "#3a3f7d"],
    [900, "#070b26", "#141a44"],
  ];

  function skyColors(altM) {
    let i = 0;
    while (i < SKY_STOPS.length - 2 && altM > SKY_STOPS[i + 1][0]) i++;
    const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
    const t = clamp((altM - a[0]) / (b[0] - a[0]), 0, 1);
    return [mixHex(a[1], b[1], t), mixHex(a[2], b[2], t)];
  }

  function drawBackground(altM) {
    const [top, bottom] = skyColors(altM);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Space stars fade in above ~550 m
    const starA = clamp((altM - 550) / 250, 0, 1) * 0.95;
    if (starA > 0.01) {
      const band = H * 1.5;
      for (const st of spaceStars) {
        let sy = (st.y0 - camY * 0.12) % band;
        if (sy < 0) sy += band;
        sy -= H * 0.25;
        if (sy < -4 || sy > H + 4) continue;
        const tw = 0.55 + 0.45 * Math.sin(tGlobal * st.tw + st.ph);
        ctx.globalAlpha = starA * tw;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(st.x, sy, st.s, st.s);
      }
      ctx.globalAlpha = 1;
    }

    // Parallax clouds fade out toward space
    const cloudA = 1 - clamp((altM - 380) / 220, 0, 1);
    if (cloudA > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * cloudA})`;
      for (const c of clouds) {
        let cy = (c.y - camY * 0.32) % (H * 1.8);
        if (cy < -80) cy += H * 1.8;
        drawCloud(c.x, cy, c.s);
      }
    }
  }

  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y - 8 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(x + 38 * s, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 19 * s, y + 7 * s, 15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlatform(p) {
    const sx = p.x, sy = p.y - camY;
    if (sy < -40 || sy > H + 40) return;

    ctx.save();
    if (p.broken) {
      ctx.translate(sx + p.w / 2, sy + p.h / 2);
      ctx.rotate(p.rot);
      ctx.globalAlpha = clamp(1 - p.vy / 700, 0.15, 1);
      ctx.translate(-p.w / 2, -p.h / 2);
    } else {
      ctx.translate(sx, sy);
    }

    let g;
    if (p.type === "break") {
      g = ctx.createLinearGradient(0, 0, 0, p.h);
      g.addColorStop(0, "#c99a63");
      g.addColorStop(1, "#8a5a33");
    } else if (p.type === "move") {
      g = ctx.createLinearGradient(0, 0, 0, p.h);
      g.addColorStop(0, "#c79bf2");
      g.addColorStop(1, "#8b5cc9");
    } else {
      g = ctx.createLinearGradient(0, 0, 0, p.h);
      g.addColorStop(0, "#8ce46a");
      g.addColorStop(1, "#3fae3f");
    }

    rr(ctx, 0, 0, p.w, p.h, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // top highlight
    rr(ctx, 3, 2, p.w - 6, 3.5, 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();

    if (p.type === "break" && !p.broken) {
      ctx.strokeStyle = "rgba(60,35,15,0.55)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.w * 0.32, 1);
      ctx.lineTo(p.w * 0.45, p.h * 0.6);
      ctx.lineTo(p.w * 0.38, p.h - 1);
      ctx.moveTo(p.w * 0.62, 1);
      ctx.lineTo(p.w * 0.56, p.h * 0.55);
      ctx.lineTo(p.w * 0.68, p.h - 1);
      ctx.stroke();
    }
    if (p.type === "move" && !p.broken) {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      const midY = p.h / 2;
      ctx.beginPath();
      ctx.moveTo(9, midY - 3); ctx.lineTo(14, midY); ctx.lineTo(9, midY + 3);
      ctx.moveTo(p.w - 9, midY - 3); ctx.lineTo(p.w - 14, midY); ctx.lineTo(p.w - 9, midY + 3);
      ctx.fill();
    }

    if (p.hasSpring && !p.broken) {
      drawSpring(p.springT);
    }
    ctx.restore();
  }

  function drawSpring(compressT) {
    // Coil sits on the right end of the platform (local coords)
    const bx = 46, bw = 15;
    const k = compressT > 0 ? compressT / 0.28 : 0;         // 1 → fully compressed
    const coilH = lerp(15, 6, k);
    const baseY = 0;
    const topY = baseY - coilH;

    ctx.strokeStyle = "#5a6b7d";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    const coils = 3;
    for (let i = 0; i <= coils * 2; i++) {
      const yy = baseY - (coilH * i) / (coils * 2);
      const xx = bx + (i % 2 === 0 ? 2 : bw - 2);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();

    rr(ctx, bx - 2, topY - 4, bw + 4, 5, 2.5);
    ctx.fillStyle = "#ff8a5b";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawStarPickup(s) {
    const sy = s.y - camY + Math.sin(tGlobal * 2.4 + s.phase) * 5;
    if (sy < -30 || sy > H + 30) return;
    const pulse = 1 + Math.sin(tGlobal * 4 + s.phase) * 0.09;
    ctx.save();
    ctx.translate(s.x, sy);
    ctx.rotate(Math.sin(tGlobal * 1.6 + s.phase) * 0.18);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "rgba(255, 210, 80, 0.9)";
    ctx.shadowBlur = 12;
    starPath(ctx, 0, 0, s.r, s.r * 0.45);
    ctx.fillStyle = "#ffd75c";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d99a1f";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerAt(px, py) {
    const rising = player.vy < -140;
    const stretchK = rising ? clamp(-player.vy / 900, 0, 1) : 0;
    const squashK = player.landT > 0 ? player.landT / 0.13 : 0;

    const sy = 1 + stretchK * 0.2 - squashK * 0.3;
    const sx = 1 - stretchK * 0.13 + squashK * 0.32;

    ctx.save();
    ctx.translate(px, py + PLAYER_R);          // pivot at feet
    ctx.scale(sx, sy);
    ctx.translate(0, -PLAYER_R);

    ctx.fillStyle = "rgba(20,40,30,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, PLAYER_R + 2, 11, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs (trail up when rising, dangle when falling)
    const legK = clamp(player.vy / MAX_FALL, -1, 1);
    ctx.strokeStyle = "#2f7d26";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const lx = side * 6.5;
      const ly1 = PLAYER_R - 2;
      const ly2 = PLAYER_R + 5 - legK * 4;
      ctx.beginPath();
      ctx.moveTo(lx, ly1);
      ctx.lineTo(lx + side * legK * 2.5, ly2);
      ctx.stroke();
    }

    // body
    const bg = ctx.createRadialGradient(-4, -5, 3, 0, 0, PLAYER_R + 3);
    bg.addColorStop(0, "#a8ef86");
    bg.addColorStop(0.55, "#6fce4e");
    bg.addColorStop(1, "#3d9a2c");
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "#2f7d26";
    ctx.lineWidth = 2;
    ctx.stroke();

    const lean = clamp(player.vx / MAX_VX, -1, 1) * 3 + player.facing * 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 5.5 + lean, -3.5, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(side * 5.5 + lean * 1.5, -3.5, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "#1c2b18";
      ctx.fill();
    }

    ctx.strokeStyle = "#245c1c";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(lean * 0.6, 3.5, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,150,120,0.4)";
    ctx.beginPath();
    ctx.arc(-9 + lean * 0.5, 2, 2.4, 0, Math.PI * 2);
    ctx.arc(9 + lean * 0.5, 2, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPlayer() {
    const py = player.y - camY;
    drawPlayerAt(player.x, py);
    // wrap-around ghost near edges
    if (player.x < PLAYER_R + 4) drawPlayerAt(player.x + W + PLAYER_HW * 2, py);
    else if (player.x > W - PLAYER_R - 4) drawPlayerAt(player.x - W - PLAYER_HW * 2, py);
  }

  function drawParticles() {
    for (const pt of particles) {
      const a = 1 - pt.t / pt.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - camY, pt.size * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD(altM) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 5;

    ctx.font = '400 30px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${Math.floor(altM)}m`, 14, 12);

    ctx.font = '400 17px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(`⭐ ${starCount}  (+${starCount * 50})`, 15, 48);

    if (best > 0) {
      ctx.textAlign = "right";
      ctx.font = '400 14px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(`최고 ${best}`, W - 56, 16);
    }
    ctx.restore();
  }

  function drawReadyHint() {
    if (state !== STATE.READY) return;
    const py = player.y - camY;
    ctx.save();
    ctx.textAlign = "center";
    const pulse = 0.72 + 0.28 * Math.sin(tGlobal * 4.2);
    ctx.globalAlpha = pulse;
    ctx.font = '400 21px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.fillStyle = "#2b4a66";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeText("좌우를 눌러 조종!", W / 2, py + 52);
    ctx.fillText("좌우를 눌러 조종!", W / 2, py + 52);

    ctx.globalAlpha = pulse * 0.55;
    ctx.font = '400 26px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.fillStyle = "#2b4a66";
    ctx.fillText("◀", 42, H * 0.5);
    ctx.fillText("▶", W - 42, H * 0.5);
    ctx.restore();
  }

  function drawLiveNew() {
    if (liveNewT <= 0) return;
    const a = clamp(liveNewT / 0.4, 0, 1);
    const pop = 1 + Math.max(0, liveNewT - 1.4) * 1.6;
    ctx.save();
    ctx.translate(W / 2, 108);
    ctx.scale(pop, pop);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.font = '400 24px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(120,70,0,0.85)";
    ctx.strokeText("🏆 신기록!", 0, 0);
    ctx.fillStyle = "#ffd75c";
    ctx.fillText("🏆 신기록!", 0, 0);
    ctx.restore();
  }

  function drawPausedVeil() {
    ctx.fillStyle = "rgba(8,14,26,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = '400 34px "Do Hyeon","Apple SD Gothic Neo",sans-serif';
    ctx.fillText("일시정지", W / 2, H / 2 - 12);
    ctx.font = '400 16px "Noto Sans KR",sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("탭하거나 P 키로 계속하기", W / 2, H / 2 + 22);
    ctx.restore();
  }

  function render() {
    const altM = altPx / PX_PER_M;
    ctx.save();
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);

    drawBackground(altM);
    for (const p of plats) drawPlatform(p);
    for (const s of starsArr) if (!s.taken) drawStarPickup(s);
    drawParticles();
    if (state !== STATE.OVER) drawPlayer();
    drawHUD(altM);
    drawReadyHint();
    drawLiveNew();
    if (paused) drawPausedVeil();

    ctx.restore();
  }

  function showGameOver(score, isNewBest) {
    overlayCard.innerHTML = `
      <h2>게임 오버</h2>
      ${isNewBest ? '<span class="new-badge">🏆 신기록 달성!</span>' : ""}
      <div class="result-row">
        <div class="result-item">
          <span class="result-num">${score}<small>점</small></span>
          <span class="result-label">점수</span>
        </div>
        <div class="result-item">
          <span class="result-num">${best}<small>점</small></span>
          <span class="result-label">최고</span>
        </div>
      </div>
      <p class="result-sub">높이 ${Math.floor(altPx / PX_PER_M)}m · ⭐ ${starCount}개</p>
      <button type="button" class="retry" id="btn-again">재시작</button>
    `;
    overlay.hidden = false;
    requestAnimationFrame(() => overlayCard.classList.add("show"));
    goShownAt = performance.now();
    if (isNewBest) SFX.fanfare();
    document.getElementById("btn-again").addEventListener("click", () => {
      if (performance.now() - goShownAt <= RESTART_GUARD_MS) return;
      SFX.click();
      restart();
    });
  }

  function restart() {
    overlayCard.classList.remove("show");
    overlay.hidden = true;
    paused = false;
    btnPause.classList.remove("paused");
    pointers.clear();
    resetGame();
    state = STATE.READY;
  }

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

  function resize() {
    const rect = canvasBox.getBoundingClientRect();
    const availW = Math.max(60, rect.width);
    const availH = Math.max(120, rect.height);
    const s = Math.min(availW / W, availH / H);
    const cssW = Math.floor(W * s);
    const cssH = Math.floor(H * s);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    viewScale = canvas.width / W;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > DT_CLAMP) dt = DT_CLAMP;

    if (!paused && helpOverlay.hidden && state !== STATE.OVER) {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    } else if (state === STATE.OVER) {
      // keep particles/platform debris settling behind the game-over card
      acc += dt;
      while (acc >= STEP) {
        tGlobal += STEP;
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.t += STEP;
          pt.x += pt.vx * STEP;
          pt.y += pt.vy * STEP;
          pt.vy += GRAVITY * 0.35 * STEP;
          if (pt.t >= pt.life) particles.splice(i, 1);
        }
        for (const p of plats) {
          if (p.broken) {
            p.vy += GRAVITY * 0.9 * STEP;
            p.y += p.vy * STEP;
            p.rot += p.rotV * STEP;
          }
        }
        acc -= STEP;
      }
    }

    render();
    requestAnimationFrame(frame);
  }

  buildSpaceStars();
  resetGame();
  resize();
  requestAnimationFrame(frame);
})();
