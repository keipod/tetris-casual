/* 파스텔 테트리스 · 게임 로직 (vanilla JS, 캔버스 렌더) */
(() => {
  "use strict";

  // ── 상수 ────────────────────────────────────────────────────────
  const COLS = 10;
  const ROWS_VISIBLE = 20;
  const HIDDEN = 2;                 // 보드 위 숨겨진 스폰 영역
  const ROWS = ROWS_VISIBLE + HIDDEN;

  const DAS_MS = 160;               // 좌우 키 유지 지연
  const ARR_MS = 45;                // 좌우 반복 간격
  const LOCK_DELAY_MS = 380;        // 바닥 도달 후 고정 지연
  const MAX_LOCK_RESETS = 15;       // 이동·회전으로 lock delay 리셋 상한
  const CLEAR_ANIM_MS = 260;        // 라인 클리어 플래시 시간

  const LS_KEY = "pastel-tetris-best";

  // Safari 개인화 모드 등에서 localStorage 접근 예외 방지
  const storage = (() => {
    try {
      localStorage.setItem("__t", "1");
      localStorage.removeItem("__t");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  // ── 테트로미노 (SRS) ───────────────────────────────────────────
  const SHAPES = {
    I: ["....", "XXXX", "....", "...."],
    J: ["X..", "XXX", "..."],
    L: ["..X", "XXX", "..."],
    O: ["XX", "XX"],
    S: [".XX", "XX.", "..."],
    T: [".X.", "XXX", "..."],
    Z: ["XX.", ".XX", "..."],
  };

  // SRS 월킥 테이블 (+y = 위). 인덱스 `${from}>${to}`
  const KICKS_JLSTZ = {
    "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const KICKS_O = { "0>1": [[0, 0]], "1>0": [[0, 0]], "1>2": [[0, 0]], "2>1": [[0, 0]], "2>3": [[0, 0]], "3>2": [[0, 0]], "3>0": [[0, 0]], "0>3": [[0, 0]] };

  // 파스텔 캔디 팔레트
  const COLORS = {
    I: "#5fc9d8", O: "#ffc94d", T: "#b18ae0", S: "#6fd39a",
    Z: "#ff8fa3", J: "#7aa2f7", L: "#ffa26e",
  };

  // ── 도우미: 색상·행렬 ──────────────────────────────────────────
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgbCss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  const SHADE = {};
  for (const [t, hex] of Object.entries(COLORS)) {
    const base = hexToRgb(hex);
    SHADE[t] = {
      base: hex,
      light: rgbCss(mix(base, [255, 255, 255], 0.6)),
      dark: rgbCss(mix(base, [74, 63, 71], 0.3)),
    };
  }

  const rotateCW = (m) => {
    const H = m.length, W = m[0].length;
    const out = Array.from({ length: W }, () => Array(H).fill("."));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (m[r][c] !== ".") out[c][H - 1 - r] = "X";
    }
    return out;
  };

  // 각 타입의 회전 상태 4개 + 스폰 x 좌표 미리 계산
  const PIECES = {};
  for (const [t, base] of Object.entries(SHAPES)) {
    const states = [base];
    let m = base;
    for (let i = 0; i < 3; i++) { m = rotateCW(m); states.push(m); }
    PIECES[t] = {
      states,
      spawnX: Math.floor((COLS - base[0].length) / 2),
      kicks: t === "I" ? KICKS_I : t === "O" ? KICKS_O : KICKS_JLSTZ,
    };
  }

  // ── DOM ────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const boardCanvas = $("board-canvas");
  const holdCanvas = $("hold-canvas");
  const nextCanvas = $("next-canvas");
  const overlayEl = $("overlay");
  const overlayCard = $("overlay-card");
  const scoreEl = $("score"), levelEl = $("level"), linesEl = $("lines"), bestEl = $("best");
  const btnSound = $("btn-sound"), btnPause = $("btn-pause"), btnRestart = $("btn-restart");
  const btnRestartTouch = $("btn-restart-touch");
  const bgm = $("bgm");
  const boardWrap = $("board-wrap");

  // 오버레이 터치가 보드 캔버스 제스처로 버블링되지 않도록 차단
  // click은 차단하지 않아야 overlay 안의 .btn 이 정상 동작
  if (overlayEl) {
    for (const ev of ["pointerdown", "pointerup", "pointercancel", "touchstart", "touchend", "touchcancel"]) {
      overlayEl.addEventListener(ev, (e) => {
        if (!e.target.closest(".btn")) e.stopPropagation();
      }, { passive: ev.startsWith("touch") });
    }
  }

  // ── 캔버스 설정 (DPR 대응) ─────────────────────────────────────
  let cell = 28;                    // 보드 셀 픽셀 크기 (반응형 계산)
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  const bctx = boardCanvas.getContext("2d");

  function setupMini(canvas) {
    const w = canvas.width;         // HTML에 하드코딩된 논리 크기
    canvas.width = w * dpr; canvas.height = (canvas.height / w) * w * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, size: w };
  }
  holdCanvas.width = 108; holdCanvas.height = 108;
  nextCanvas.width = 108; nextCanvas.height = 324;
  const holdView = setupMini(holdCanvas);
  const nextView = setupMini(nextCanvas);

  function resizeBoard() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const topbar = document.querySelector(".topbar");
    const touch = document.getElementById("touch-controls");
    const topH = topbar ? topbar.offsetHeight : 48;
    const ctrlH = touch ? touch.offsetHeight : 130;
    const pad = 8 * 4;
    const availH = Math.max(200, window.innerHeight - topH - ctrlH - pad);
    const sideW = Math.max(56, Math.min(90, window.innerWidth * 0.12));
    const availW = Math.max(160, window.innerWidth - sideW * 2 - pad * 2);
    cell = Math.max(14, Math.floor(Math.min(availH / ROWS_VISIBLE, availW / COLS)));
    boardCanvas.width = COLS * cell * dpr;
    boardCanvas.height = ROWS_VISIBLE * cell * dpr;
    boardCanvas.style.width = `${COLS * cell}px`;
    boardCanvas.style.height = `${ROWS_VISIBLE * cell}px`;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // ── 게임 상태 ──────────────────────────────────────────────────
  let grid, queue, bag;
  let piece = null;                 // {type, rot, x, y}
  let heldType = null, canHold = true;
  let state = "start";              // start | playing | clearing | paused | over
  let score = 0, lines = 0, level = 1;
  let best = Number(storage.getItem(LS_KEY) || 0);

  let gravTimer = 0, softAccum = 0, lockTimer = 0, grounded = false, lockResets = 0;
  let clearRows = [], clearTimer = 0;
  let lastTs = 0;

  const gravityMs = () => Math.max(45, Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000);

  function newBag() {
    const b = ["I", "O", "T", "S", "Z", "J", "L"];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
  function refillQueue() { while (queue.length < 7) { if (!bag.length) bag = newBag(); queue.push(bag.pop()); } }

  // ── 충돌·이동 ──────────────────────────────────────────────────
  const cellsOf = (p) => {
    const m = PIECES[p.type].states[p.rot], out = [];
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      if (m[r][c] === "X") out.push([p.x + c, p.y + r]);
    }
    return out;
  };

  const collides = (p) => cellsOf(p).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || grid[y][x] !== 0);

  function tryMove(dx, dy) {
    if (!piece) return false;
    const next = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (collides(next)) return false;
    piece = next;
    return true;
  }

  function tryRotate(dir) {
    if (!piece) return false;
    const from = piece.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    for (const [kx, ky] of PIECES[piece.type].kicks[`${from}>${to}`]) {
      const cand = { ...piece, rot: to, x: piece.x + kx, y: piece.y - ky }; // SRS +y는 위
      if (!collides(cand)) { piece = cand; return true; }
    }
    return false;
  }

  function ghostY() {
    let g = { ...piece }, d = 0;
    while (true) { const n = { ...g, y: g.y + 1 }; if (collides(n)) break; g = n; d++; }
    return piece.y + d;
  }

  // ── 스폰·홀드·고정 ─────────────────────────────────────────────
  function spawnPiece() {
    refillQueue();
    const type = queue.shift();
    refillQueue();
    piece = { type, rot: 0, x: PIECES[type].spawnX, y: 0 };
    canHold = true;
    gravTimer = 0; softAccum = 0; lockTimer = 0; grounded = false; lockResets = 0;
    drawNext(); drawHold();
    if (collides(piece)) gameOver("spawn");
  }

  function swapHoldInternal(typeToSpawn) {
    piece = { type: typeToSpawn, rot: 0, x: PIECES[typeToSpawn].spawnX, y: 0 };
    gravTimer = 0; softAccum = 0; lockTimer = 0; grounded = false; lockResets = 0;
    if (collides(piece)) gameOver("spawn");
  }
  function spawnNextFromQueue() {
    piece = null;
    const t = queue.shift(); refillQueue();
    swapHoldInternal(t);
    drawNext();
  }

  function holdAction() {
    if (!piece || !canHold || state !== "playing") return;
    canHold = false;
    const cur = piece.type;
    const prevHeld = heldType;
    heldType = cur;
    if (prevHeld) swapHoldInternal(prevHeld);
    else spawnNextFromQueue();
    drawHold(); drawNext();
  }

  function hardDrop() {
    if (!piece || state !== "playing") return;
    let d = 0;
    while (tryMove(0, 1)) d++;
    score += d * 2;
    lockPiece();
  }

  function lockPiece() {
    const cells = cellsOf(piece);
    for (const [x, y] of cells) if (y >= 0 && y < ROWS) grid[y][x] = piece.type;
    canHold = true;
    grounded = false;
    // 클리어 라인 탐색
    clearRows = [];
    for (let r = 0; r < ROWS; r++) if (grid[r].every((v) => v !== 0)) clearRows.push(r);

    // 탑아웃: 고정된 블록이 전부 숨겨진 영역에 있을 때
    if (!clearRows.length && cells.every(([x, y]) => y < HIDDEN)) { gameOver("topout-hidden"); return; }

    piece = null;
    if (clearRows.length) {
      state = "clearing"; clearTimer = CLEAR_ANIM_MS;
    } else {
      afterClear();
    }
    updateStats(); draw();
  }

  function finishClear() {
    for (const r of clearRows.slice().sort((a, b) => a - b)) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(0));
    }
    afterClear();
  }

  const LINE_SCORES = [0, 100, 300, 500, 800];
  function afterClear() {
    const n = clearRows.length;
    if (n) {
      score += LINE_SCORES[n] * level;
      lines += n;
      level = Math.floor(lines / 10) + 1;
    }
    clearRows = [];
    state = "playing";
    spawnPiece();
    updateStats(); draw();
  }

  let lastGameOverReason = "none";

  function gameOver(reason = "unknown") {
    lastGameOverReason = reason;
    state = "over";
    resetInput();
    if (score > best) { best = score; storage.setItem(LS_KEY, String(best)); }
    btnPause.textContent = "⏸️";
    showOverlay("over");
    updateStats(); draw();
  }

  // ── 오버레이 ───────────────────────────────────────────────────
  function showOverlay(kind) {
    if (kind === "start") {
      overlayCard.innerHTML = `
        <div class="overlay-title">🍬 파스텔 테트리스</div>
        <p class="overlay-sub">달콤한 색감으로 라인 정리해 볼까요?</p>
        <button class="btn" type="button">시작하기</button>
        <div class="overlay-keys">
          <span>아래 버튼 · 보드 스와이프로 조작</span>
          <span>탭 = 회전 · ↔ 스와이프 = 이동 · ↕ = 드롭</span>
        </div>`;
    } else if (kind === "pause") {
      overlayCard.innerHTML = `
        <div class="overlay-title">일시정지 ☁️</div>
        <p class="overlay-sub">잠시 쉬어가는 중이에요</p>
        <button class="btn" type="button">계속하기</button>`;
    } else { // over
      const isRecord = score > 0 && score >= best;
      overlayCard.innerHTML = `
        <div class="overlay-title">게임 오버 🎀</div>
        ${isRecord ? '<p class="overlay-sub">🏆 신기록이에요!</p>' : ""}
        <div class="overlay-score-line">이번 점수 <b>${score.toLocaleString()}</b></div>
        <button class="btn" type="button">다시 하기</button>`;
    }
    overlayEl.classList.remove("hidden");
  }
  const hideOverlay = () => overlayEl.classList.add("hidden");

  // ── 게임 흐름 ──────────────────────────────────────────────────
  function startGame() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    bag = newBag(); queue = []; refillQueue();
    heldType = null; canHold = true;
    score = 0; lines = 0; level = 1;
    resetInput();
    state = "playing";
    hideOverlay();
    btnPause.textContent = "⏸️";
    ensureBgm();
    spawnPiece();
    updateStats(); draw();
  }

  function setPaused(p) {
    if (p && state === "playing") {
      state = "paused"; showOverlay("pause"); btnPause.textContent = "▶️";
    } else if (!p && state === "paused") {
      state = "playing"; hideOverlay(); btnPause.textContent = "⏸️"; lastTs = 0;
    }
  }

  function updateStats() {
    scoreEl.textContent = score.toLocaleString();
    levelEl.textContent = String(level);
    linesEl.textContent = String(lines);
    bestEl.textContent = Math.max(best, score).toLocaleString();
  }

  // ── BGM (자율재생 정책 대응) ───────────────────────────────────
  let bgmStarted = false;
  function ensureBgm() {
    if (!bgm) return;
    try {
      const p = bgm.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* 자동재생 정책·헤드리스 환경 무시 */ }
    bgmStarted = true;
  }
  btnSound.addEventListener("click", () => {
    if (!bgm) return;
    if (!bgm.muted && !bgmStarted) ensureBgm();
    bgm.muted = !bgm.muted;
    btnSound.textContent = bgm.muted ? "🔇" : "🔊";
    btnSound.blur();
  });

  // ── 입력: DAS/ARR (터치 버튼·스와이프 공용) ───────────────────
  const leftDown = { v: false }, rightDown = { v: false };
  let dirHeld = 0, dasTimer = 0, arrAccum = 0;
  let downHeld = false;

  function pressDir(d) {
    tryMove(d, 0); onGroundedAction();
    dirHeld = d; dasTimer = 0; arrAccum = 0;
  }

  function releaseDir(d) {
    const other = d < 0 ? rightDown.v : leftDown.v;
    dirHeld = other ? -d : 0;
    dasTimer = 0; arrAccum = 0;
  }

  function resetInput() {
    leftDown.v = false; rightDown.v = false; downHeld = false;
    dirHeld = 0; dasTimer = 0; arrAccum = 0; softAccum = 0;
  }

  function onGroundedAction() {
    if (grounded && lockResets < MAX_LOCK_RESETS) { lockTimer = LOCK_DELAY_MS; lockResets++; }
  }

  // ── 입력: 터치 컨트롤 ──────────────────────────────────────────
  const touchTimers = {};

  function ensurePlayingFromTouch(act) {
    if (state === "start" || state === "over") {
      if (act !== "hold") startGame();
    } else if (state === "paused" && act !== "hold") {
      setPaused(false);
    }
  }

  function touchAct(act) {
    ensurePlayingFromTouch(act);
    if (state !== "playing") return;
    switch (act) {
      case "left":
        leftDown.v = true;
        pressDir(-1);
        break;
      case "right":
        rightDown.v = true;
        pressDir(1);
        break;
      case "down":
        downHeld = true;
        softAccum = 0;
        if (tryMove(0, 1)) score++;
        updateStats();
        break;
      case "rotate": tryRotate(1); onGroundedAction(); break;
      case "rotateccw": tryRotate(-1); onGroundedAction(); break;
      case "drop": hardDrop(); break;
      case "hold": holdAction(); break;
    }
  }

  function touchStart(act, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    ensureBgm();
    touchAct(act);
    if (!["left", "right", "down"].includes(act)) return;
    clearTimeout(touchTimers[act + "_d"]);
    clearInterval(touchTimers[act + "_r"]);
    const firstDelay = act === "down" ? 120 : DAS_MS;
    touchTimers[act + "_d"] = setTimeout(() => {
      if (state !== "playing") return;
      if (act === "left") pressDir(-1);
      else if (act === "right") pressDir(1);
      touchTimers[act + "_r"] = setInterval(() => {
        if (state !== "playing") { clearInterval(touchTimers[act + "_r"]); return; }
        if (act === "left") tryMove(-1, 0), onGroundedAction();
        else if (act === "right") tryMove(1, 0), onGroundedAction();
        else if (tryMove(0, 1)) score++;
        updateStats();
      }, act === "down" ? 60 : ARR_MS);
    }, firstDelay);
  }

  function touchEnd(act, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    clearTimeout(touchTimers[act + "_d"]);
    clearInterval(touchTimers[act + "_r"]);
    if (act === "left") { leftDown.v = false; releaseDir(-1); }
    else if (act === "right") { rightDown.v = false; releaseDir(1); }
    else if (act === "down") { downHeld = false; softAccum = 0; }
  }

  function bindTouchButton(btn, act) {
    const onDown = (e) => {
      if (e.type === "pointerdown" && e.pointerType === "mouse" && e.button !== 0) return;
      touchStart(act, e);
      if (e.pointerId != null && btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    };
    const onUp = (e) => {
      touchEnd(act, e);
      if (e.pointerId != null && btn.releasePointerCapture) {
        try { btn.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    };
    btn.addEventListener("pointerdown", onDown);
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
  }

  // ── 보드 스와이프·탭 (캔버스만) ───────────────────────────────
  const SWIPE_MIN = 28;
  const TAP_MAX_MS = 280;
  const TAP_MAX_DIST = 14;
  let boardPointer = null;

  function onBoardPointerDown(e) {
    if (state !== "playing" || overlayEl && !overlayEl.classList.contains("hidden")) return;
    if (e.pointerType === "mouse") return;
    boardPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    boardCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onBoardPointerUp(e) {
    if (!boardPointer || boardPointer.id !== e.pointerId) return;
    const dx = e.clientX - boardPointer.x;
    const dy = e.clientY - boardPointer.y;
    const dt = performance.now() - boardPointer.t;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    boardPointer = null;
    try { boardCanvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    e.preventDefault();
    e.stopPropagation();

    if (state !== "playing") return;
    ensureBgm();

    if (adx < TAP_MAX_DIST && ady < TAP_MAX_DIST && dt < TAP_MAX_MS) {
      tryRotate(1);
      onGroundedAction();
      draw();
      return;
    }
    if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;

    if (adx >= ady) {
      if (dx < 0) pressDir(-1);
      else pressDir(1);
    } else if (dy > 0) {
      if (tryMove(0, 1)) score++;
      updateStats();
    } else {
      hardDrop();
    }
    draw();
  }

  function onBoardPointerCancel(e) {
    if (boardPointer && boardPointer.id === e.pointerId) boardPointer = null;
  }

  function onBoardTouchStart(e) {
    if (state !== "playing" || e.touches.length !== 1) return;
    const t = e.touches[0];
    boardPointer = { id: t.identifier, x: t.clientX, y: t.clientY, t: performance.now(), touch: true };
    e.preventDefault();
  }

  function onBoardTouchEnd(e) {
    if (!boardPointer?.touch) return;
    const t = e.changedTouches[0];
    if (!t || t.identifier !== boardPointer.id) return;
    const dx = t.clientX - boardPointer.x;
    const dy = t.clientY - boardPointer.y;
    const dt = performance.now() - boardPointer.t;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    boardPointer = null;
    e.preventDefault();

    if (state !== "playing") return;
    ensureBgm();

    if (adx < TAP_MAX_DIST && ady < TAP_MAX_DIST && dt < TAP_MAX_MS) {
      tryRotate(1);
      onGroundedAction();
    } else if (adx >= SWIPE_MIN || ady >= SWIPE_MIN) {
      if (adx >= ady) pressDir(dx < 0 ? -1 : 1);
      else if (dy > 0) { if (tryMove(0, 1)) score++; updateStats(); }
      else hardDrop();
    }
    draw();
  }

  boardCanvas.addEventListener("pointerdown", onBoardPointerDown);
  boardCanvas.addEventListener("pointerup", onBoardPointerUp);
  boardCanvas.addEventListener("pointercancel", onBoardPointerCancel);
  boardCanvas.addEventListener("touchstart", onBoardTouchStart, { passive: false });
  boardCanvas.addEventListener("touchend", onBoardTouchEnd, { passive: false });
  boardCanvas.addEventListener("touchcancel", onBoardTouchEnd, { passive: false });
  boardCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const touchNav = $("touch-controls");
  if (touchNav) {
    for (const btn of touchNav.querySelectorAll("button[data-act]")) {
      bindTouchButton(btn, btn.dataset.act);
    }
    touchNav.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ── 버튼·오버레이 클릭 ─────────────────────────────────────────
  function handleOverlayAction(e) {
    const b = e.target.closest(".btn");
    if (!b) return;
    e.stopPropagation();
    ensureBgm();
    if (state === "start" || state === "over") startGame();
    else if (state === "paused") setPaused(false);
  }
  overlayCard.addEventListener("click", handleOverlayAction);
  overlayCard.addEventListener("pointerup", handleOverlayAction);
  overlayCard.addEventListener("touchend", (e) => {
    const b = e.target.closest(".btn");
    if (!b) return;
    e.preventDefault();
    handleOverlayAction(e);
  });
  btnPause.addEventListener("click", () => {
    if (state === "playing") setPaused(true);
    else if (state === "paused") setPaused(false);
    btnPause.blur();
  });
  btnRestart.addEventListener("click", () => { ensureBgm(); startGame(); btnRestart.blur(); });
  if (btnRestartTouch) {
    btnRestartTouch.addEventListener("click", () => { ensureBgm(); startGame(); btnRestartTouch.blur(); });
  }

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") setPaused(true);
  });

  // ── 메인 루프 ──────────────────────────────────────────────────
  function update(dt) {
    if (state === "clearing") {
      clearTimer -= dt;
      if (clearTimer <= 0) finishClear();
      return;
    }
    if (state !== "playing" || !piece) return;

    // DAS/ARR 좌우 반복
    if (dirHeld !== 0) {
      dasTimer += dt;
      if (dasTimer >= DAS_MS) {
        arrAccum += dt;
        while (arrAccum >= ARR_MS && dirHeld !== 0) {
          tryMove(dirHeld, 0); onGroundedAction();
          arrAccum -= ARR_MS;
        }
      }
    } else {
      dasTimer = 0; arrAccum = 0;
    }

    // 소프트 드롭 / 중력
    const g = gravityMs();
    if (downHeld && state === "playing") {
      softAccum += dt;
      const sd = Math.min(45, g / 3);
      while (softAccum >= sd) {
        softAccum -= sd;
        if (tryMove(0, 1)) { score++; } else break;
      }
    } else {
      gravTimer += dt;
      while (gravTimer >= g && piece) {
        gravTimer -= g;
        if (!tryMove(0, 1)) break;
      }
    }

    // lock delay
    const groundedNow = !!piece && collides({ ...piece, y: piece.y + 1 });
    if (groundedNow) {
      if (!grounded) { grounded = true; lockTimer = LOCK_DELAY_MS; }
      else {
        lockTimer -= dt;
        if (lockTimer <= 0) lockPiece();
      }
    } else {
      grounded = false; lockTimer = 0;
    }

    updateStats();
  }

  // ── 렌더링 ─────────────────────────────────────────────────────
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBlock(ctx, px, py, s, type, alpha = 1) {
    const sh = SHADE[type];
    if (!sh) return;
    ctx.globalAlpha = alpha;
    roundRectPath(ctx, px + 1.5, py + 1.5, s - 3, s - 3, s * 0.26);
    ctx.fillStyle = sh.base;
    ctx.fill();
    // 캔디 광택 (상단 하이라이트)
    roundRectPath(ctx, px + s * 0.18, py + s * 0.14, s * 0.64, s * 0.26, s * 0.13);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    // 가장자리
    roundRectPath(ctx, px + 1.5, py + 1.5, s - 3, s - 3, s * 0.26);
    ctx.strokeStyle = sh.dark;
    ctx.globalAlpha = alpha * 0.45;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!grid) return;
    const W = COLS * cell, H = ROWS_VISIBLE * cell;
    bctx.clearRect(0, 0, W, H);

    // 배경 + 그리드
    bctx.fillStyle = "rgba(255,253,251,0.6)";
    roundRectPath(bctx, 0, 0, W, H, cell * 0.5);
    bctx.fill();
    bctx.strokeStyle = "rgba(232,125,153,0.14)";
    bctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      bctx.beginPath(); bctx.moveTo(c * cell + 0.5, 0); bctx.lineTo(c * cell + 0.5, H); bctx.stroke();
    }
    for (let r = 1; r < ROWS_VISIBLE; r++) {
      bctx.beginPath(); bctx.moveTo(0, r * cell + 0.5); bctx.lineTo(W, r * cell + 0.5); bctx.stroke();
    }

    // 고정 블록
    for (let y = HIDDEN; y < ROWS; y++) {
      const py = (y - HIDDEN) * cell;
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        if (t !== 0) drawBlock(bctx, x * cell, py, cell, t);
      }
    }

    // 클리어 플래시
    if (state === "clearing" && clearRows.length) {
      const a = Math.max(0, clearTimer / CLEAR_ANIM_MS);
      for (const r of clearRows) {
        if (r < HIDDEN) continue;
        bctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
        bctx.fillRect(0, (r - HIDDEN) * cell, W, cell);
      }
    }

    // 고스트 + 현재 조각
    if (piece && (state === "playing" || state === "paused")) {
      const gy = ghostY();
      if (gy > piece.y) {
        for (const [gx, gyy] of cellsOf({ ...piece, y: gy })) {
          if (gyy < HIDDEN) continue;
          drawBlock(bctx, gx * cell, (gyy - HIDDEN) * cell, cell, piece.type, 0.22);
        }
      }
      for (const [x, y] of cellsOf(piece)) {
        if (y < HIDDEN) continue;
        drawBlock(bctx, x * cell, (y - HIDDEN) * cell, cell, piece.type);
      }
    }
  }

  // 미니 캔버스 (HOLD / NEXT) — 조각의 바운딩 박스 기준으로 중앙 배치
  function drawMiniPiece(ctx, size, type, cy, alpha = 1) {
    if (!type) return;
    const m = PIECES[type].states[0];
    let minR = 9, maxR = -1, minC = 9, maxC = -1;
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      if (m[r][c] === "X") { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
    }
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const s = Math.min(24, (size * 0.78) / Math.max(w, h));
    const ox = (size - w * s) / 2, oy = cy + (size - h * s) / 2;
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
      if (m[r][c] === "X") drawBlock(ctx, ox + (c - minC) * s, oy + (r - minR) * s, s, type, alpha);
    }
  }

  function drawHold() {
    const { ctx, size } = holdView;
    ctx.clearRect(0, 0, size, size);
    if (heldType) drawMiniPiece(ctx, size, heldType, 0, canHold ? 1 : 0.38);
  }

  function drawNext() {
    const { ctx, size } = nextView;
    ctx.clearRect(0, 0, size, size * 3);
    for (let i = 0; i < 3 && queue[i]; i++) {
      drawMiniPiece(ctx, size, queue[i], i * size, i === 0 ? 1 : 0.85 - i * 0.08);
    }
  }

  // ── 디버그 핸들 (콘솔 스모크 테스트용) ────────────────────────
  window.__tetris = {
    get state() { return state; },
    get score() { return score; },
    get lines() { return lines; },
    get level() { return level; },
    start: startGame,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    move: (dx) => tryMove(dx, 0),
    rotate: (d = 1) => tryRotate(d),
    drop: hardDrop,
    hold: holdAction,
    soft: () => { const ok = tryMove(0, 1); if (ok) score++; return ok; },
    // ── 스모크 테스트용 디버그 핸들 ──
    get held() { return heldType; },
    get currentType() { return piece ? piece.type : null; },
    get lastGameOverReason() { return lastGameOverReason; },
    debugSpawn(type) {
      if (!PIECES[type]) throw new Error("bad type " + type);
      piece = { type, rot: 0, x: PIECES[type].spawnX, y: 0 };
      gravTimer = 0; softAccum = 0; lockTimer = 0; grounded = false; lockResets = 0;
      if (collides(piece)) gameOver("spawn");
    },
    fillRowExcept(r, exceptCols) {
      for (let x = 0; x < COLS; x++) if (!(exceptCols || []).includes(x)) grid[r][x] = "I";
    },
    debugFill(rows) { rows.forEach((r) => this.fillRowExcept(r)); },
  };

  // ── 시작 ───────────────────────────────────────────────────────
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  bag = newBag(); queue = []; refillQueue();
  updateStats();
  resizeBoard();
  window.addEventListener("resize", resizeBoard);
  showOverlay("start");

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = Math.min(100, ts - lastTs);
    lastTs = ts;
    if (state === "paused") dt = 0;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
