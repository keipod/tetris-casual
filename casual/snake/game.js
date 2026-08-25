(() => {
  "use strict";

  const COLS = 17;
  const ROWS = 17;

  const TICK_START_MS = 140;
  const TICK_MIN_MS = 70;
  const TICK_STEP_MS = 6;
  const RAMP_EVERY = 5;

  const STAR_EVERY = 8;
  const STAR_LIFE_MS = 6000;
  const STAR_BLINK_MS = 2000;
  const STAR_POINTS = 5;

  const SWIPE_MIN_PX = 24;
  const QUEUE_MAX = 2;
  const DEATH_LOCK_MS = 400;
  const HIT_FX_MS = 480;
  const DT_CLAMP_MS = 32;

  const LS_BEST = "snake.best";
  const LS_SOUND = "snake.sound";

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_DIR = {
    ArrowUp: DIRS.up, KeyW: DIRS.up,
    ArrowDown: DIRS.down, KeyS: DIRS.down,
    ArrowLeft: DIRS.left, KeyA: DIRS.left,
    ArrowRight: DIRS.right, KeyD: DIRS.right,
  };

  const BOARD_A = "#21492f";
  const BOARD_B = "#1b3e27";
  const SNAKE_HEAD_RGB = [143, 224, 82];
  const SNAKE_MID_RGB = [84, 180, 71];
  const SNAKE_TAIL_RGB = [46, 125, 60];

  const storage = (() => {
    try {
      localStorage.setItem("__snk", "1");
      localStorage.removeItem("__snk");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const stage = document.getElementById("stage");
  const wrap = document.getElementById("board-wrap");
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const hintEl = document.getElementById("hint");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const btnPause = document.getElementById("btn-pause");
  const btnNew = document.getElementById("btn-new");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let best = parseInt(storage.getItem(LS_BEST) || "0", 10) || 0;

  let state = "ready"; // ready | running | paused | over
  let snake = [];
  let prevSnake = []; // 직전 틱 스냅샷 — 틱 사이 위치 보간에 사용
  let dir = DIRS.right;
  let dirQueue = [];

  let food = null;
  let star = null; // { x, y, expireAt }

  let apples = 0;
  let starsGot = 0;
  let score = 0;

  let tickMs = TICK_START_MS;
  let acc = 0;
  let lastTs = 0;

  let cell = 20;
  let viewSize = 340;

  let deathAt = -1e9;
  let lockUntil = 0;
  let hitTimer = 0;

  function sfx(role, vol) {
    if (!soundOn || !window.CasualSfx) return;
    window.CasualSfx.play(role, vol);
  }

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

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

  function keyOf(p) { return p.x + "," + p.y; }

  function freeCell() {
    const occ = new Set(snake.map(keyOf));
    if (food) occ.add(keyOf(food));
    if (star) occ.add(keyOf(star));
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (!occ.has(x + "," + y)) return { x, y };
    }
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occ.has(x + "," + y)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    prevSnake = snake.map((p) => ({ x: p.x, y: p.y }));
    dir = DIRS.right;
    dirQueue = [];
    food = null;
    star = null;
    food = freeCell();
    apples = 0;
    starsGot = 0;
    score = 0;
    tickMs = TICK_START_MS;
    acc = 0;
    state = "ready";
    hintEl.classList.remove("hidden");
    hideOverlay();
    syncPauseBtn();
    updateHud();
  }

  function start() {
    if (state !== "ready") return;
    state = "running";
    hintEl.classList.add("hidden");
    lastTs = performance.now();
    acc = 0;
    sfx("click", 0.4);
  }

  function tryRestart() {
    if (state !== "over") return;
    if (performance.now() < lockUntil) return;
    sfx("click", 0.5);
    reset();
  }

  function setPaused(p) {
    if (p && state === "running") {
      state = "paused";
      syncPauseBtn();
      showPauseCard();
    } else if (!p && state === "paused") {
      state = "running";
      lastTs = performance.now();
      acc = 0;
      syncPauseBtn();
      hideOverlay();
    }
  }

  function togglePause() {
    if (state === "running") setPaused(true);
    else if (state === "paused") setPaused(false);
  }

  function syncPauseBtn() {
    const paused = state === "paused";
    btnPause.classList.toggle("paused", paused);
    btnPause.setAttribute("aria-label", paused ? "계속하기" : "일시정지");
  }

  function step() {
    if (dirQueue.length) {
      const nd = dirQueue.shift();
      const reverse = nd.x === -dir.x && nd.y === -dir.y;
      const same = nd.x === dir.x && nd.y === dir.y;
      if (!reverse && !same) {
        dir = nd;
        sfx("tick", 0.15);
      }
    }

    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      die(false);
      return;
    }

    const eatsApple = !!food && food.x === nx && food.y === ny;
    const eatsStar = !!star && star.x === nx && star.y === ny;
    const grows = eatsApple || eatsStar;

    // 성장하지 않는 틱에서는 꼬리가 함께 비켜가므로 꼬리 칸은 충돌 대상에서 제외
    const bodyToCheck = grows ? snake : snake.slice(0, -1);
    for (let i = 0; i < bodyToCheck.length; i++) {
      if (bodyToCheck[i].x === nx && bodyToCheck[i].y === ny) {
        die(false);
        return;
      }
    }

    prevSnake = snake.map((p) => ({ x: p.x, y: p.y }));
    snake.unshift({ x: nx, y: ny });
    if (!grows) snake.pop();

    if (eatsApple) {
      apples += 1;
      score += 1;
      sfx("pickup", 0.6);
      if (apples % RAMP_EVERY === 0) {
        tickMs = Math.max(TICK_MIN_MS, tickMs - TICK_STEP_MS);
      }
      if (apples % STAR_EVERY === 0 && !star) {
        const c = freeCell();
        if (c) star = { x: c.x, y: c.y, expireAt: performance.now() + STAR_LIFE_MS };
      }
      const next = freeCell();
      if (next) {
        food = next;
      } else {
        die(true); // 빈 칸 없음 → 클리어
        return;
      }
    }

    if (eatsStar) {
      starsGot += 1;
      score += STAR_POINTS;
      star = null;
      sfx("special", 0.7);
    }

    updateHud();
  }

  function die(victory) {
    state = "over";
    deathAt = performance.now();
    lockUntil = deathAt + DEATH_LOCK_MS;
    sfx("lose", 0.8);

    wrap.classList.remove("hit");
    void wrap.offsetWidth; // 리플로우로 shake 애니메이션 재시작
    wrap.classList.add("hit");
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => wrap.classList.remove("hit"), HIT_FX_MS);

    const isNew = score > best;
    if (isNew) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    updateHud();

    setTimeout(() => {
      if (state === "over") showGameOver(victory, isNew);
    }, 520);
  }

  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showPauseCard() {
    showOverlay(`
      <h2>잠시 멈춤</h2>
      <p>준비되면 계속 진행하세요.</p>
      <button type="button" class="retry" id="btn-resume">계속하기</button>
    `);
    document.getElementById("btn-resume").onclick = () => {
      sfx("click", 0.5);
      setPaused(false);
    };
  }

  function showGameOver(victory, isNew) {
    showOverlay(`
      <h2>${victory ? "모두 먹었어요!" : "게임 오버!"}</h2>
      ${isNew ? '<span class="new-best">🏆 신기록 달성!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${score}</span><span class="result-label">점수</span></div>
        <div class="result-item"><span class="result-num">${best}</span><span class="result-label">최고</span></div>
      </div>
      <p>사과 ${apples}개 · 황금 별 ${starsGot}개</p>
      <button type="button" class="retry" id="btn-retry">재시작</button>
    `);
    document.getElementById("btn-retry").onclick = tryRestart;
  }

  // 역방향 판정을 '마지막 대기 방향' 기준으로 수행해야
  // 연속 두 입력(예: 오른쪽→왼쪽 빠르게)이 적용 순서에서 자기 반향을 만들지 않는다
  function pushDir(d) {
    if (state === "ready") start();
    if (state !== "running") return;
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    const reverse = d.x === -last.x && d.y === -last.y;
    const same = d.x === last.x && d.y === last.y;
    if (reverse || same) return;
    if (dirQueue.length >= QUEUE_MAX) dirQueue.shift();
    dirQueue.push(d);
  }

  document.addEventListener("keydown", (e) => {
    if (!helpOverlay.hidden) {
      if (e.key === "Escape") closeHelp();
      return;
    }
    const d = KEY_DIR[e.code];
    if (d) {
      e.preventDefault();
      pushDir(d);
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (state === "ready") start();
      else if (state === "over") tryRestart();
      else togglePause();
    } else if (e.code === "KeyP") {
      togglePause();
    } else if (e.code === "Enter" && state === "over") {
      tryRestart();
    }
  });

  let ptr = null;

  wrap.addEventListener("pointerdown", (e) => {
    ptr = { x: e.clientX, y: e.clientY, moved: false };
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!ptr) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_MIN_PX) return;
    ptr.moved = true;
    const d = ax > ay ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up);
    pushDir(d);
    ptr.x = e.clientX; // 시작점 재설정 — 손을 떼지 않고 연속 방향 전환
    ptr.y = e.clientY;
  });

  function endPointer() {
    if (ptr && !ptr.moved && state === "ready") start();
    ptr = null;
  }
  wrap.addEventListener("pointerup", endPointer);
  wrap.addEventListener("pointercancel", endPointer);

  btnPause.addEventListener("click", () => {
    sfx("click", 0.4);
    togglePause();
  });

  btnNew.addEventListener("click", () => {
    sfx("click", 0.5);
    reset();
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    sfx("click", 0.4);
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
  }

  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => {
    sfx("click", 0.4);
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") setPaused(true);
  });
  window.addEventListener("blur", () => {
    if (state === "running") setPaused(true);
  });

  function fit() {
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const size = Math.floor(Math.min(availW, availH));
    if (size < 80) return;
    viewSize = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = size / COLS;
  }

  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  function mix(c1, c2, k) {
    return (
      Math.round(c1[0] + (c2[0] - c1[0]) * k) + "," +
      Math.round(c1[1] + (c2[1] - c1[1]) * k) + "," +
      Math.round(c1[2] + (c2[2] - c1[2]) * k)
    );
  }

  function bodyColor(k) {
    return k < 0.5
      ? "rgb(" + mix(SNAKE_HEAD_RGB, SNAKE_MID_RGB, k * 2) + ")"
      : "rgb(" + mix(SNAKE_MID_RGB, SNAKE_TAIL_RGB, (k - 0.5) * 2) + ")";
  }

  function drawBoard() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = ((x + y) & 1) ? BOARD_B : BOARD_A;
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  function drawFood(now) {
    if (!food) return;
    const bob = Math.sin(now / 300) * cell * 0.03;
    const cx = (food.x + 0.5) * cell;
    const cy = (food.y + 0.5) * cell + bob;
    const r = cell * 0.36;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = cell * 0.22;
    ctx.shadowOffsetY = cell * 0.08;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
    g.addColorStop(0, "#ff8a75");
    g.addColorStop(1, "#e6392f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#7a4a21";
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.quadraticCurveTo(cx + r * 0.08, cy - r * 1.12, cx + r * 0.18, cy - r * 1.2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx + r * 0.34, cy - r * 1.02);
    ctx.rotate(-0.5);
    ctx.fillStyle = "#43a047";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.34, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStar(now) {
    if (!star) return;
    const rem = star.expireAt - now;
    if (rem <= 0) {
      star = null;
      return;
    }
    const alpha = rem < STAR_BLINK_MS
      ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 90))
      : 1;
    const cx = (star.x + 0.5) * cell;
    const cy = (star.y + 0.5) * cell;
    const rot = Math.sin(now / 350) * 0.16;
    const ro = cell * 0.42;
    const ri = ro * 0.45;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.shadowColor = "rgba(255,207,92,0.8)";
    ctx.shadowBlur = cell * 0.3;
    const g = ctx.createLinearGradient(-ro, -ro, ro, ro);
    g.addColorStop(0, "#ffe08a");
    g.addColorStop(1, "#f5b301");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? ro : ri;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(t, now) {
    const n = snake.length;
    // 세그먼트 i는 prevSnake[i] → snake[i]로 한 칸 이동한다.
    // 성장 틱에는 snake가 prev보다 1 길어 새 꼬리는 prev 마지막에 고정되어 제자리에 머문다.
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const cur = snake[i];
      const prev = prevSnake[Math.min(i, prevSnake.length - 1)] || cur;
      pts[i] = {
        x: (prev.x + (cur.x - prev.x) * t + 0.5) * cell,
        y: (prev.y + (cur.y - prev.y) * t + 0.5) * cell,
      };
    }

    const wHead = cell * 0.84;
    const wTail = cell * 0.42;
    const widthAt = (i) =>
      n > 1 ? wTail + (wHead - wTail) * (1 - i / (n - 1)) : wHead;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.save();
    ctx.translate(0, cell * 0.07);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    for (let i = n - 1; i >= 1; i--) {
      ctx.lineWidth = (widthAt(i) + widthAt(i - 1)) / 2;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = n - 1; i >= 1; i--) {
      const k = n > 1 ? (i - 0.5) / (n - 1) : 0;
      ctx.strokeStyle = bodyColor(k);
      ctx.lineWidth = (widthAt(i) + widthAt(i - 1)) / 2;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.stroke();
    }

    const hp = pts[0];
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = cell * 0.25;
    ctx.shadowOffsetY = cell * 0.06;
    const hg = ctx.createRadialGradient(
      hp.x - cell * 0.12, hp.y - cell * 0.14, cell * 0.08,
      hp.x, hp.y, cell * 0.5
    );
    hg.addColorStop(0, "#b6f26f");
    hg.addColorStop(1, "#5cb844");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, cell * 0.47, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state === "running" && Math.floor(now / 260) % 3 === 0) {
      const tx = hp.x + dir.x * cell * 0.45;
      const ty = hp.y + dir.y * cell * 0.45;
      const mx = hp.x + dir.x * cell * 0.68;
      const my = hp.y + dir.y * cell * 0.68;
      ctx.strokeStyle = "#ff5a6e";
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(mx, my);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - dir.y * cell * 0.12 + dir.x * cell * 0.1, my + dir.x * cell * 0.12 + dir.y * cell * 0.1);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + dir.y * cell * 0.12 + dir.x * cell * 0.1, my - dir.x * cell * 0.12 + dir.y * cell * 0.1);
      ctx.stroke();
    }

    const sx = -dir.y;
    const sy = dir.x;
    for (let s = -1; s <= 1; s += 2) {
      const ex = hp.x + dir.x * cell * 0.16 + sx * s * cell * 0.19;
      const ey = hp.y + dir.y * cell * 0.16 + sy * s * cell * 0.19;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.115, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#17240f";
      ctx.beginPath();
      ctx.arc(ex + dir.x * cell * 0.045, ey + dir.y * cell * 0.045, cell * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDeathFlash(now) {
    if (state !== "over") return;
    const f = (now - deathAt) / HIT_FX_MS;
    if (f < 0 || f >= 1) return;
    ctx.fillStyle = "rgba(255,60,50," + (0.42 * (1 - f)).toFixed(3) + ")";
    ctx.fillRect(0, 0, viewSize, viewSize);
  }

  function render(now) {
    drawBoard();
    drawFood(now);
    drawStar(now);
    let t = 1;
    if (state === "running") t = Math.min(1, acc / tickMs);
    drawSnake(t, now);
    drawDeathFlash(now);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = ts - lastTs;
    lastTs = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > DT_CLAMP_MS) dt = DT_CLAMP_MS; // 탭 전환 등 긴 정지 후 위치 점프 방지

    if (state === "running") {
      acc += dt;
      while (acc >= tickMs && state === "running") {
        acc -= tickMs;
        step();
      }
    }
    render(ts);
  }

  fit();
  reset();
  updateHud();
  requestAnimationFrame((ts) => {
    lastTs = ts;
    requestAnimationFrame(frame);
  });
})();
