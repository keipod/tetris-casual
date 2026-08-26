(() => {
  "use strict";

  const LS_BEST = "breakout.best";
  const LS_SOUND = "breakout.sound";

  const W = 400;
  const H = 600;
  const WALL = 8;
  const PHYS_DT = 1 / 120;
  const MAX_FRAME_DT = 0.032;

  const PADDLE_Y = H - 46;
  const PADDLE_H = 12;
  const PADDLE_W = 72;
  const PADDLE_WIDE_MULT = 1.55;
  const PADDLE_KEY_SPEED = 470;
  const PADDLE_LERP = 26;

  const BALL_R = 6;
  const BALL_BASE_SPEED = 300;
  const BALL_SPEED_PER_LEVEL = 16;
  const BALL_SPEED_PER_BRICK = 1.6;
  const BALL_MAX_SPEED = 560;
  const SLOW_FACTOR = 0.62;
  // vertical velocity floor: |vy| >= 28% of speed, so the ball can never
  // settle into a near-horizontal loop
  const MIN_VY_RATIO = 0.28;
  // classic breakout: paddle hit offset maps to exit angle, capped ±60° from vertical
  const MAX_BOUNCE_ANGLE = Math.PI / 3;
  const MAX_BALLS = 3;

  const COLS = 8;
  const FIELD_PAD = 10;
  const BRICK_TOP = 64;
  const BRICK_GAP = 5;
  const BRICK_H = 17;
  const BRICK_W = (W - FIELD_PAD * 2 - BRICK_GAP * (COLS - 1)) / COLS;

  const DROP_CHANCE = 0.12;
  const PU_FALL_SPEED = 95;
  const PU_SIZE = 30;
  const PU_DUR = { wide: 10, slow: 6, pierce: 8 };

  const START_LIVES = 3;
  const RESPAWN_MS = 700;
  const LEVEL_CLEAR_MS = 1500;
  const RESTART_LOCKOUT_MS = 400;

  // 1-hit pastel tiers by row + darker 2-hit variant (crack state when damaged)
  const ROW_COLORS = [
    { fill: "#7fe3c9", gloss: "#d2f9ee", edge: "#2ea88c" },
    { fill: "#ffd98a", gloss: "#fff0c9", edge: "#d99a1f" },
    { fill: "#ffb09a", gloss: "#ffddd2", edge: "#d85a34" },
    { fill: "#c9b6ff", gloss: "#e7dfff", edge: "#8f6fe8" },
  ];
  const HARD_COLORS = [
    { fill: "#35b394", gloss: "#6fd3ba", edge: "#17705b" },
    { fill: "#e0a52e", gloss: "#f2c666", edge: "#8f6410" },
    { fill: "#e87a55", gloss: "#f5a184", edge: "#96401f" },
    { fill: "#9a7ce8", gloss: "#bda8f4", edge: "#56399f" },
  ];

  const PU_TYPES = {
    multi: { emoji: "🟢", label: "멀티볼!", color: "#4fd8c4" },
    wide: { emoji: "🔵", label: "패들 확대!", color: "#5aa9ff" },
    slow: { emoji: "🟡", label: "슬로우!", color: "#ffcf5c" },
    pierce: { emoji: "💥", label: "관통!", color: "#ff8a5b" },
  };
  const PU_KEYS = ["multi", "wide", "slow", "pierce"];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function signOf(v, fallback) { return v === 0 ? fallback : v < 0 ? -1 : 1; }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function p(role, vol) {
    if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
  }
  const SFX = {
    bounce() { p("bounce", 0.45); },
    crack() { p("hitSoft", 0.5); },
    // spec asked for role 'pop', but sfx-bank has no pop.ogg (play would silently fail);
    // bigHit is the closest existing stem
    brickBreak() { p("bigHit", 0.5); },
    pickup() { p("pickup", 0.6); },
    loseBall() { p("lose", 0.55); },
    levelClear() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "level"], 90, 0.65); },
    gameOver() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["failDeep", "gameOver"], 130, 0.6); },
    click() { p("click", 0.5); },
  };

  function syncSoundBtn() { btnSound.classList.toggle("muted", !soundOn); }
  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    btnSound.blur(); // keep Space from re-triggering the focused button
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

  let state = "ready"; // ready | playing | dying | levelclear | gameover
  let paused = false;
  let runId = 0; // increments on newGame so stale setTimeouts become no-ops

  let score = 0;
  let best = parseInt(storage.getItem(LS_BEST) || "0", 10) || 0;
  let level = 1;
  let lives = START_LIVES;

  let bricks = [];
  let remaining = 0;
  let rampBricks = 0;

  const timers = { wide: 0, slow: 0, pierce: 0 };

  const paddle = { x: W / 2, targetX: W / 2, w: PADDLE_W, flash: 0 };
  const keys = { left: false, right: false };

  let shake = 0;
  let deathFlash = 0;
  let hintPulse = 0;

  const balls = [];
  const ballPool = [];
  function acquireBall() {
    const b = ballPool.pop() || { active: false, x: 0, y: 0, vx: 0, vy: 0, stuck: false, trail: [] };
    b.active = true;
    b.stuck = false;
    b.trail.length = 0;
    balls.push(b);
    return b;
  }
  function releaseBall(b) {
    b.active = false;
    const i = balls.indexOf(b);
    if (i >= 0) balls.splice(i, 1);
    ballPool.push(b);
  }
  function clearBalls() { while (balls.length) releaseBall(balls[balls.length - 1]); }

  const drops = [];
  const dropPool = [];
  function spawnDrop(x, y) {
    const d = dropPool.pop() || { active: false, x: 0, y: 0, type: "wide" };
    d.active = true;
    d.x = x;
    d.y = y;
    d.type = PU_KEYS[(Math.random() * PU_KEYS.length) | 0];
    drops.push(d);
  }
  function releaseDrop(d) {
    d.active = false;
    const i = drops.indexOf(d);
    if (i >= 0) drops.splice(i, 1);
    dropPool.push(d);
  }
  function clearDrops() { while (drops.length) releaseDrop(drops[drops.length - 1]); }

  const PARTICLE_MAX = 140;
  const particles = [];
  for (let i = 0; i < PARTICLE_MAX; i++) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: "#fff" });
  }
  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const pt = particles.find((q) => !q.active);
      if (!pt) return;
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.25, 1) * power;
      pt.active = true;
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(a) * sp;
      pt.vy = Math.sin(a) * sp - power * 0.35;
      pt.maxLife = pt.life = rand(0.35, 0.7);
      pt.size = rand(1.6, 3.4);
      pt.color = color;
    }
  }

  const POPUP_MAX = 12;
  const popups = [];
  for (let i = 0; i < POPUP_MAX; i++) {
    popups.push({ active: false, x: 0, y: 0, text: "", life: 0, color: "#fff" });
  }
  function popup(x, y, text, color) {
    const pp = popups.find((q) => !q.active) || popups[0];
    pp.active = true;
    pp.x = clamp(x, 26, W - 26);
    pp.y = y;
    pp.text = text;
    pp.color = color;
    pp.life = 0.85;
  }

  const PATTERNS = [
    function solid(r, c) { return true; },
    function checker(r, c) { return (r + c) % 2 === 0; },
    // pyramid grows downward from center: row r spans [COLS/2 - half, COLS/2 + half)
    function pyramid(r, c) {
      const half = Math.min(r + 1, COLS / 2);
      return c >= COLS / 2 - half && c < COLS / 2 + half;
    },
    function zigzag(r, c) { return ((r + c) % 4) < 2; },
  ];

  function buildLevel(lv) {
    const pattern = PATTERNS[(lv - 1) % PATTERNS.length];
    const rows = Math.min(4 + (lv - 1), 7);
    const hp2Rows = Math.min(2, Math.floor(lv / 2));
    bricks = [];
    remaining = 0;
    rampBricks = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!pattern(r, c)) continue;
        const hp = r < hp2Rows ? 2 : 1;
        bricks.push({
          alive: true,
          x: FIELD_PAD + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          hp,
          maxHp: hp,
          row: r,
          seed: Math.random(),
        });
        remaining++;
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = best > 0 ? String(best) : "–";
    levelEl.textContent = String(level);
  }
  function updateHearts() {
    let html = "";
    for (let i = 0; i < START_LIVES; i++) {
      html += '<span class="heart' + (i < lives ? "" : " off") + '">❤</span>';
    }
    livesEl.innerHTML = html;
  }
  function addScore(pts) {
    score += pts;
    if (score > best) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    updateHud();
  }

  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.hidden = false;
  }
  function hideOverlay() { overlay.hidden = true; }

  function resetForServe() {
    clearBalls();
    clearDrops();
    timers.wide = timers.slow = timers.pierce = 0;
    paddle.x = paddle.targetX = W / 2;
    paddle.w = PADDLE_W;
    const b = acquireBall();
    b.stuck = true;
    b.x = paddle.x;
    b.y = PADDLE_Y - BALL_R - 2;
    b.vx = 0;
    b.vy = 0;
  }

  function newGame() {
    runId++;
    score = 0;
    level = 1;
    lives = START_LIVES;
    shake = 0;
    deathFlash = 0;
    paused = false;
    btnPause.classList.remove("paused");
    hideOverlay();
    buildLevel(level);
    resetForServe();
    state = "ready";
    updateHud();
    updateHearts();
  }

  function launchBall() {
    if (state !== "ready" || paused) return;
    const b = balls.find((q) => q.stuck);
    if (!b) return;
    b.stuck = false;
    const spd = effSpeed();
    const a = rand(-Math.PI / 12, Math.PI / 12);
    b.vx = Math.sin(a) * spd;
    b.vy = -Math.cos(a) * spd;
    state = "playing";
  }

  function loseLife() {
    SFX.loseBall();
    if (window.CasualMobile && window.CasualMobile.vibrate) window.CasualMobile.vibrate(40);
    lives--;
    updateHearts();
    deathFlash = 1;
    clearDrops();
    timers.wide = timers.slow = timers.pierce = 0;
    const myRun = runId;
    if (lives <= 0) {
      state = "gameover";
      setTimeout(() => { if (runId === myRun) showGameOver(); }, 500);
    } else {
      state = "dying";
      setTimeout(() => {
        if (runId !== myRun || state !== "dying") return;
        resetForServe();
        state = "ready";
      }, RESPAWN_MS);
    }
  }

  function showGameOver() {
    SFX.gameOver();
    const isNewBest = score >= best && score > 0 && score === best;
    showOverlay(
      "<h2>게임 오버</h2>" +
      (isNewBest ? '<span class="new-best">🏆 최고 기록 달성!</span>' : "") +
      '<div class="result-row">' +
      '<div class="result-item"><span class="result-num">' + score + '</span><span class="result-label">점수</span></div>' +
      '<div class="result-item"><span class="result-num">' + best + '</span><span class="result-label">최고</span></div>' +
      '<div class="result-item"><span class="result-num">' + level + '</span><span class="result-label">레벨 도달</span></div>' +
      "</div>" +
      '<button type="button" id="btn-restart" disabled>재시작</button>'
    );
    const btnRestart = document.getElementById("btn-restart");
    // 400ms lockout: gameplay taps just before game over must not trigger restart
    setTimeout(() => { btnRestart.disabled = false; }, RESTART_LOCKOUT_MS);
    btnRestart.addEventListener("click", () => {
      if (btnRestart.disabled) return;
      SFX.click();
      newGame();
    });
  }

  function levelCleared() {
    state = "levelclear";
    SFX.levelClear();
    const myRun = runId;
    showOverlay("<h2>레벨업!</h2><p>레벨 " + (level + 1) + " 시작합니다!</p>");
    setTimeout(() => {
      if (runId !== myRun || state !== "levelclear") return;
      hideOverlay();
      level++;
      buildLevel(level);
      resetForServe();
      state = "ready";
      updateHud();
    }, LEVEL_CLEAR_MS);
  }

  function setPaused(v) {
    if (v === paused) return;
    if (v && (state === "gameover" || state === "levelclear")) return;
    paused = v;
    btnPause.classList.toggle("paused", paused);
    if (paused) {
      showOverlay("<h2>일시정지</h2><p>잠시 쉬어가는 중…</p>" +
        '<button type="button" id="btn-resume">계속하기</button>');
      document.getElementById("btn-resume").addEventListener("click", () => {
        SFX.click();
        setPaused(false);
      });
    } else {
      hideOverlay();
    }
  }

  btnPause.addEventListener("click", () => {
    SFX.click();
    setPaused(!paused);
    btnPause.blur();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !paused) setPaused(true);
  });

  function steerTo(e) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    paddle.targetX = clamp(lx, WALL + paddle.w / 2, W - WALL - paddle.w / 2);
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    steerTo(e);
    launchBall();
  });
  canvas.addEventListener("pointermove", (e) => { steerTo(e); });

  document.addEventListener("keydown", (e) => {
    if (!helpOverlay.hidden) {
      if (e.key === "Escape") closeHelp();
      return;
    }
    if (e.key === "ArrowLeft") { keys.left = true; e.preventDefault(); }
    else if (e.key === "ArrowRight") { keys.right = true; e.preventDefault(); }
    else if (e.key === " ") {
      e.preventDefault();
      if (paused) setPaused(false);
      else launchBall();
    }
    else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      setPaused(!paused);
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    else if (e.key === "ArrowRight") keys.right = false;
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
  btnHelpClose.addEventListener("click", () => { SFX.click(); closeHelp(); });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  function effSpeed() {
    const base = Math.min(
      BALL_BASE_SPEED + (level - 1) * BALL_SPEED_PER_LEVEL + rampBricks * BALL_SPEED_PER_BRICK,
      BALL_MAX_SPEED
    );
    return timers.slow > 0 ? base * SLOW_FACTOR : base;
  }

  function enforceVyFloor(b) {
    const spd = Math.hypot(b.vx, b.vy);
    if (spd <= 0) return;
    const minVy = spd * MIN_VY_RATIO;
    if (Math.abs(b.vy) < minVy) {
      b.vy = signOf(b.vy, -1) * minVy;
      const vxMag = Math.sqrt(Math.max(0, spd * spd - b.vy * b.vy));
      b.vx = signOf(b.vx, Math.random() < 0.5 ? -1 : 1) * vxMag;
    }
  }

  function collideWalls(b) {
    if (b.x - BALL_R < WALL) { b.x = WALL + BALL_R; b.vx = Math.abs(b.vx); enforceVyFloor(b); }
    else if (b.x + BALL_R > W - WALL) { b.x = W - WALL - BALL_R; b.vx = -Math.abs(b.vx); enforceVyFloor(b); }
    if (b.y - BALL_R < WALL) { b.y = WALL + BALL_R; b.vy = Math.abs(b.vy); enforceVyFloor(b); }
  }

  function collidePaddle(b) {
    if (b.vy <= 0) return;
    const hw = paddle.w / 2;
    if (
      b.y + BALL_R >= PADDLE_Y &&
      b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
      b.x >= paddle.x - hw - BALL_R &&
      b.x <= paddle.x + hw + BALL_R
    ) {
      const off = clamp((b.x - paddle.x) / hw, -1, 1);
      const ang = off * MAX_BOUNCE_ANGLE;
      const spd = effSpeed();
      b.vx = Math.sin(ang) * spd;
      b.vy = -Math.cos(ang) * spd;
      b.y = PADDLE_Y - BALL_R - 0.5;
      paddle.flash = 1;
      SFX.bounce();
    }
  }

  function brickCenter(br) { return { cx: br.x + br.w / 2, cy: br.y + br.h / 2 }; }

  function damageBrick(br) {
    const { cx, cy } = brickCenter(br);
    br.hp--;
    if (br.hp <= 0) {
      br.alive = false;
      remaining--;
      const color = (br.maxHp > 1 ? HARD_COLORS : ROW_COLORS)[br.row % ROW_COLORS.length].fill;
      addScore((br.maxHp > 1 ? 20 : 10) * level);
      popup(cx, cy, "+" + (br.maxHp > 1 ? 20 : 10) * level, color);
      burst(cx, cy, color, 12, 150);
      shake = Math.min(shake + 1.8, 3.2);
      SFX.brickBreak();
      rampBricks++;
      if (Math.random() < DROP_CHANCE) spawnDrop(cx, cy);
      if (remaining <= 0 && state === "playing") levelCleared();
    } else {
      addScore(10 * level);
      popup(cx, cy, "+" + 10 * level, "#ffd98a");
      burst(cx, cy, "#ffffff", 5, 90);
      shake = Math.min(shake + 0.8, 3.2);
      SFX.crack();
    }
  }

  function collideBricks(b) {
    const piercing = timers.pierce > 0;
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      if (!br.alive) continue;
      const { cx, cy } = brickCenter(br);
      const ox = br.w / 2 + BALL_R - Math.abs(b.x - cx);
      const oy = br.h / 2 + BALL_R - Math.abs(b.y - cy);
      if (ox > 0 && oy > 0) {
        damageBrick(br);
        if (!piercing) {
          if (ox < oy) {
            b.vx = -b.vx;
            b.x += b.x < cx ? -ox : ox;
          } else {
            b.vy = -b.vy;
            b.y += b.y < cy ? -oy : oy;
          }
        }
        break;
      }
    }
  }

  function moveBall(b, dt) {
    const spd = effSpeed();
    const m = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / m) * spd;
    b.vy = (b.vy / m) * spd;
    const dist = spd * dt;
    const steps = Math.max(1, Math.ceil(dist / BALL_R)); // sub-step ≤ ball radius (no tunneling)
    const sd = dist / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * sd;
      b.y += b.vy * sd;
      collideWalls(b);
      collidePaddle(b);
      collideBricks(b);
      if (b.y - BALL_R > H) return false;
      if (state !== "playing") return true; // levelCleared() may fire mid-loop
    }
    return true;
  }

  function splitBalls() {
    const room = MAX_BALLS - balls.length;
    if (room <= 0) {
      addScore(100);
      popup(paddle.x, PADDLE_Y - 34, "+100", "#4fd8c4");
      return;
    }
    const src = balls.find((q) => !q.stuck) || balls[0];
    if (!src) return;
    for (let i = 0; i < room; i++) {
      const nb = acquireBall();
      const ang = (i === 0 ? -1 : 1) * (Math.PI / 9); // ±20° clones
      const cos = Math.cos(ang), sin = Math.sin(ang);
      nb.x = src.x + (i === 0 ? -10 : 10);
      nb.y = src.y;
      nb.vx = src.vx * cos - src.vy * sin;
      nb.vy = src.vx * sin + src.vy * cos;
      if (nb.vx === 0 && nb.vy === 0) { nb.vx = rand(-60, 60); nb.vy = -effSpeed(); }
    }
  }

  function applyPowerup(type) {
    const info = PU_TYPES[type];
    popup(paddle.x, PADDLE_Y - 34, info.label, info.color);
    paddle.flash = 1;
    SFX.pickup();
    if (type === "multi") splitBalls();
    else timers[type] = PU_DUR[type]; // refresh to max, never beyond
  }

  function updateDrops(dt) {
    const hw = paddle.w / 2;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += PU_FALL_SPEED * dt;
      if (
        d.y + PU_SIZE / 2 >= PADDLE_Y &&
        d.y - PU_SIZE / 2 <= PADDLE_Y + PADDLE_H &&
        Math.abs(d.x - paddle.x) <= hw + PU_SIZE / 2
      ) {
        applyPowerup(d.type);
        releaseDrop(d);
      } else if (d.y - PU_SIZE / 2 > H) {
        releaseDrop(d);
      }
    }
  }

  function update(dt) {
    hintPulse += dt;

    if (keys.left) paddle.targetX -= PADDLE_KEY_SPEED * dt;
    if (keys.right) paddle.targetX += PADDLE_KEY_SPEED * dt;
    paddle.targetX = clamp(paddle.targetX, WALL + paddle.w / 2, W - WALL - paddle.w / 2);

    // lerp toward target at high rate: 1:1 feel without pointer-teleport jitter
    paddle.x += (paddle.targetX - paddle.x) * Math.min(1, PADDLE_LERP * dt);

    const targetW = timers.wide > 0 ? PADDLE_W * PADDLE_WIDE_MULT : PADDLE_W;
    paddle.w += (targetW - paddle.w) * Math.min(1, 14 * dt);
    paddle.targetX = clamp(paddle.targetX, WALL + paddle.w / 2, W - WALL - paddle.w / 2);
    paddle.x = clamp(paddle.x, WALL + paddle.w / 2, W - WALL - paddle.w / 2);

    paddle.flash = Math.max(0, paddle.flash - 3.2 * dt);
    shake = Math.max(0, shake - 9 * dt);
    deathFlash = Math.max(0, deathFlash - 1.6 * dt);

    if (timers.wide > 0) timers.wide = Math.max(0, timers.wide - dt);
    if (timers.slow > 0) timers.slow = Math.max(0, timers.slow - dt);
    if (timers.pierce > 0) timers.pierce = Math.max(0, timers.pierce - dt);

    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.active = false; continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 380 * dt;
    }

    for (let i = 0; i < popups.length; i++) {
      const pp = popups[i];
      if (!pp.active) continue;
      pp.life -= dt;
      pp.y -= 46 * dt;
      if (pp.life <= 0) pp.active = false;
    }

    if (state === "ready") {
      const b = balls[0];
      if (b) { b.x = paddle.x; b.y = PADDLE_Y - BALL_R - 2; }
      return;
    }
    if (state !== "playing") return;

    updateDrops(dt);

    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const alive = moveBall(b, PHYS_DT);
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 9) b.trail.shift();
      if (timers.pierce > 0 && Math.random() < 0.35) {
        burst(b.x, b.y, "#ff9a5b", 1, 40);
      }
      if (!alive) releaseBall(b);
    }
    if (balls.length === 0 && state === "playing") loseLife();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#10233a");
    g.addColorStop(0.55, "#0c1a2c");
    g.addColorStop(1, "#081220");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.028)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 40; y < H; y += 40) { ctx.moveTo(WALL, y); ctx.lineTo(W - WALL, y); }
    for (let x = 40; x < W; x += 40) { ctx.moveTo(x, WALL); ctx.lineTo(x, H); }
    ctx.stroke();

    const tg = ctx.createRadialGradient(W / 2, -40, 20, W / 2, -40, 320);
    tg.addColorStop(0, "rgba(79,216,196,0.10)");
    tg.addColorStop(1, "rgba(79,216,196,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, H * 0.5);

    ctx.strokeStyle = "rgba(127,155,179,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, WALL / 2, WALL / 2, W - WALL, H - WALL, 12);
    ctx.stroke();
  }

  function drawBricks() {
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      if (!br.alive) continue;
      const pal = (br.maxHp > 1 ? HARD_COLORS : ROW_COLORS)[br.row % ROW_COLORS.length];
      roundRect(ctx, br.x, br.y, br.w, br.h, 5);
      ctx.fillStyle = pal.fill;
      ctx.fill();
      const gg = ctx.createLinearGradient(0, br.y, 0, br.y + br.h * 0.7);
      gg.addColorStop(0, "rgba(255,255,255,0.42)");
      gg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gg;
      roundRect(ctx, br.x + 1.5, br.y + 1.5, br.w - 3, br.h * 0.62, 4);
      ctx.fill();
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1.5;
      roundRect(ctx, br.x, br.y, br.w, br.h, 5);
      ctx.stroke();
      if (br.hp < br.maxHp) {
        // jagged crack polyline, anchored to a per-brick random seed
        ctx.strokeStyle = "rgba(20,10,5,0.5)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const mx = br.x + br.w * (0.35 + br.seed * 0.3);
        ctx.moveTo(mx, br.y + 1);
        ctx.lineTo(mx - 4, br.y + br.h * 0.45);
        ctx.lineTo(mx + 3, br.y + br.h * 0.6);
        ctx.lineTo(mx - 2, br.y + br.h - 1);
        ctx.moveTo(mx - 4, br.y + br.h * 0.45);
        ctx.lineTo(mx - br.w * 0.28, br.y + br.h * 0.7);
        ctx.moveTo(mx + 3, br.y + br.h * 0.6);
        ctx.lineTo(mx + br.w * 0.26, br.y + br.h * 0.82);
        ctx.stroke();
      }
    }
  }

  function drawPowerups() {
    ctx.font = '700 16px "Do Hyeon", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const info = PU_TYPES[d.type];
      const bob = Math.sin(hintPulse * 6 + d.x) * 1.5;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 12;
      roundRect(ctx, -PU_SIZE / 2, -PU_SIZE / 2, PU_SIZE, PU_SIZE, 9);
      ctx.fillStyle = "rgba(22,50,74,0.92)";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 1.6;
      roundRect(ctx, -PU_SIZE / 2, -PU_SIZE / 2, PU_SIZE, PU_SIZE, 9);
      ctx.stroke();
      ctx.fillText(info.emoji, 0, 1);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      if (!pt.active) continue;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBalls() {
    const piercing = timers.pierce > 0;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      for (let t = 0; t < b.trail.length; t++) {
        const tp = b.trail[t];
        const f = (t + 1) / b.trail.length;
        ctx.globalAlpha = f * 0.3;
        ctx.fillStyle = piercing ? "#ff8a5b" : "#dff3ff";
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, BALL_R * f * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = piercing ? "#ff6b3d" : "rgba(223,243,255,0.9)";
      ctx.shadowBlur = piercing ? 18 : 10;
      ctx.fillStyle = piercing ? "#ffb347" : "#ffffff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (piercing) {
        ctx.fillStyle = "rgba(255,240,200,0.9)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPaddle() {
    const hw = paddle.w / 2;
    ctx.save();
    if (paddle.flash > 0) {
      ctx.shadowColor = "rgba(255,207,92," + (0.85 * paddle.flash).toFixed(3) + ")";
      ctx.shadowBlur = 22 * paddle.flash;
    }
    const g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    g.addColorStop(0, "#ffa075");
    g.addColorStop(1, "#d85a34");
    ctx.fillStyle = g;
    roundRect(ctx, paddle.x - hw, PADDLE_Y, paddle.w, PADDLE_H, PADDLE_H / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, paddle.x - hw + 4, PADDLE_Y + 2, paddle.w - 8, 3, 2);
    ctx.fill();

    if (timers.wide > 0) {
      const frac = timers.wide / PU_DUR.wide;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(paddle.x, PADDLE_Y - 16, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#5aa9ff";
      ctx.beginPath();
      ctx.arc(paddle.x, PADDLE_Y - 16, 11, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawPopups() {
    ctx.font = '700 15px "Do Hyeon", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < popups.length; i++) {
      const pp = popups[i];
      if (!pp.active) continue;
      ctx.globalAlpha = clamp(pp.life / 0.85, 0, 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBuffChips() {
    let chipX = W - WALL - 22;
    const chipY = WALL + 22;
    const list = [];
    if (timers.slow > 0) list.push({ emoji: "🟡", frac: timers.slow / PU_DUR.slow, color: "#ffcf5c" });
    if (timers.pierce > 0) list.push({ emoji: "💥", frac: timers.pierce / PU_DUR.pierce, color: "#ff8a5b" });
    ctx.font = '700 13px "Do Hyeon", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(chipX, chipY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = c.color;
      ctx.beginPath();
      ctx.arc(chipX, chipY, 13, -Math.PI / 2, -Math.PI / 2 + c.frac * Math.PI * 2);
      ctx.stroke();
      ctx.fillText(c.emoji, chipX, chipY + 1);
      chipX -= 34;
    }
  }

  function drawReadyHint() {
    if (state !== "ready" || paused) return;
    const alpha = 0.55 + Math.sin(hintPulse * 4) * 0.3;
    ctx.globalAlpha = clamp(alpha, 0.2, 1);
    ctx.font = '700 19px "Do Hyeon", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText("탭하여 발사", W / 2, PADDLE_Y - 64);
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawBackground();
    drawBricks();
    drawPowerups();
    drawParticles();
    drawBalls();
    drawPaddle();
    drawPopups();
    drawBuffChips();
    drawReadyHint();

    ctx.restore();

    if (deathFlash > 0) {
      ctx.fillStyle = "rgba(255,80,80," + (0.22 * deathFlash).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function resize() {
    const wrap = document.getElementById("canvas-wrap");
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(availW / W, availH / H);
    const cssW = Math.max(1, Math.floor(W * scale));
    const cssH = Math.max(1, Math.floor(H * scale));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (!paused) {
      acc += dt;
      let guard = 0;
      while (acc >= PHYS_DT && guard++ < 8) {
        update(PHYS_DT);
        acc -= PHYS_DT;
      }
      if (guard >= 8) acc = 0; // spiral-of-death guard
    }
    render();
  }

  newGame();
  resize();
  requestAnimationFrame(frame);
})();
