(() => {
  "use strict";

  const N = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const LS_SOUND = "omok-online.sound";

  const storage = (window.CasualSafeStorage && CasualSafeStorage.get()) || {
    getItem: () => null,
    setItem: () => {},
  };

  const el = {
    screenGame: document.getElementById("screen-game"),
    board: document.getElementById("board"),
    fx: document.getElementById("fx-layer"),
    status: document.getElementById("status-text"),
    stoneMe: document.getElementById("stone-me"),
    moveCount: document.getElementById("move-count"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
  };

  const ctx = el.board.getContext("2d");
  const fxCtx = el.fx.getContext("2d");

  let view = null;
  let placing = new Map();
  let particles = [];
  let winGlowT = 0;
  let rafId = 0;
  let lastFrame = 0;

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && root().CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function root() { return window; }

  function cellSize() { return el.board.width / (N + 1); }
  function toXY(r, c) { const s = cellSize(); return [(c + 1) * s, (r + 1) * s]; }

  function drawBoard() {
    const W = el.board.width;
    const s = cellSize();
    ctx.clearRect(0, 0, W, W);

    const g = ctx.createLinearGradient(0, 0, W, W);
    g.addColorStop(0, "#d8a75f");
    g.addColorStop(0.5, "#c9964f");
    g.addColorStop(1, "#b98343");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);

    ctx.strokeStyle = "rgba(90, 55, 20, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 42; i++) {
      const y = (i * 97) % W;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.3, y + ((i % 3) - 1) * 6, W * 0.7, y + ((i % 5) - 2) * 4, W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(60, 35, 10, 0.6)";
    ctx.lineWidth = 1.1;
    for (let i = 1; i <= N; i++) {
      ctx.beginPath();
      ctx.moveTo(s, i * s); ctx.lineTo(N * s, i * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * s, s); ctx.lineTo(i * s, N * s);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.strokeRect(s, s, (N - 1) * s, (N - 1) * s);

    ctx.fillStyle = "rgba(45, 24, 6, 0.85)";
    for (const [r, c] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
      const [x, y] = toXY(r, c);
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStone(x, y, radius, color, alpha, scale) {
    const sc = scale == null ? 1 : scale;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.12, x, y, radius * sc);
    if (color === BLACK) {
      grad.addColorStop(0, "#787878");
      grad.addColorStop(0.55, "#2c2c2c");
      grad.addColorStop(1, "#0a0a0a");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.6, "#e9e9e9");
      grad.addColorStop(1, "#bdbdbd");
    }
    ctx.beginPath();
    ctx.arc(x, y, radius * sc, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2.5;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.35, radius * 0.22 * sc, 0, Math.PI * 2);
    ctx.fillStyle = color === BLACK ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.restore();
  }

  function placementScale(r, c) {
    const rec = placing.get(`${r}:${c}`);
    if (!rec) return 1;
    const t = Math.min(1, (performance.now() - rec.t0) / 180);
    if (t >= 1) { placing.delete(`${r}:${c}`); return 1; }
    return 0.4 + 0.6 * (1 + Math.sin(t * Math.PI) * 0.18) * t;
  }

  function render(now) {
    if (!view) return;
    const s = cellSize();
    const rad = s * 0.41;
    drawBoard();

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = view.board[r][c];
        if (!v) continue;
        const [x, y] = toXY(r, c);
        drawStone(x, y, rad, v, 1, placementScale(r, c));
      }
    }

    if (view.last && !view.winLine) {
      const [lx, ly] = toXY(view.last[0], view.last[1]);
      ctx.save();
      ctx.strokeStyle = "rgba(232, 80, 60, 0.95)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(lx, ly, rad * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (view.winLine) {
      const pulse = 0.65 + 0.35 * Math.sin(winGlowT / 260);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 196, 92, ${pulse})`;
      ctx.lineWidth = rad * 0.36;
      ctx.lineCap = "round";
      const [x0, y0] = toXY(view.winLine[0][0], view.winLine[0][1]);
      const [x1, y1] = toXY(view.winLine[4][0], view.winLine[4][1]);
      ctx.shadowColor = "rgba(255, 170, 60, 0.9)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    stepParticles();
    fxCtx.clearRect(0, 0, el.fx.width, el.fx.height);
    for (const p of particles) {
      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.fillStyle = p.color;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.globalAlpha = 1;

    winGlowT += now - lastFrame;
    lastFrame = now;
    rafId = requestAnimationFrame(render);
  }

  function burstWin(line) {
    const s = cellSize();
    const [x0, y0] = toXY(line[0][0], line[0][1]);
    const [x1, y1] = toXY(line[4][0], line[4][1]);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 4.5;
      particles.push({
        x: mx, y: my,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2,
        r: 1.6 + Math.random() * 3.2,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        color: ["#ffd98a", "#ffb347", "#fff3d6", "#e8b96b"][i % 4],
      });
    }
  }

  function stepParticles() {
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.09;
      p.vx *= 0.985;
      p.life -= p.decay;
    }
  }

  function updateHud() {
    if (!view) return;
    const myTurn = view.yourTurn;
    if (view.phase === "ended") {
      const iWon = view.winner != null && view.winner === myPid();
      if (view.winner == null) {
        el.status.textContent = "무승부";
        el.resultTitle.textContent = "무승부";
        el.resultSub.textContent = "판이 가득 찼어요";
      } else if (view.isCpuMatch) {
        el.status.textContent = iWon ? "승리!" : "패배";
        el.resultTitle.textContent = iWon ? "승리!" : "패배";
        el.resultSub.textContent = iWon ? "CPU에게 승리했어요" : "CPU가 먼저 다섯 수를 이었어요";
      } else {
        el.status.textContent = iWon ? "승리!" : "패배";
        el.resultTitle.textContent = iWon ? "승리!" : "패배";
        el.resultSub.textContent = iWon ? "다섯 수 완성!" : "상대가 먼저 다섯 수를 이었어요";
      }
      el.resultOverlay.hidden = false;
    } else {
      el.resultOverlay.hidden = true;
      el.status.textContent = myTurn ? "당신 차례" : "상대 차례…";
      el.status.classList.toggle("is-wait", !myTurn);
    }
    el.moveCount.textContent = `${view.moveCount}수`;
    el.stoneMe.className = `turn-stone ${view.yourColor === BLACK ? "turn-black" : "turn-white"}`;
  }

  function myPid() { return mp ? mp.id : null; }

  function posToCell(clientX, clientY) {
    const rect = el.board.getBoundingClientRect();
    const x = (clientX - rect.left) * (el.board.width / rect.width);
    const y = (clientY - rect.top) * (el.board.height / rect.height);
    const s = cellSize();
    const c = Math.round(x / s) - 1;
    const r = Math.round(y / s) - 1;
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return { r, c };
  }

  function onTap(e) {
    if (!view || view.phase !== "playing" || !view.yourTurn) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const cell = posToCell(t.clientX, t.clientY);
    if (!cell || view.board[cell.r][cell.c] !== EMPTY) return;
    mp.action({ r: cell.r, c: cell.c });
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "place") {
        placing.set(`${ev.r}:${ev.c}`, { t0: performance.now() });
        sfx(ev.color === BLACK ? "drop" : "click");
      } else if (ev.type === "win") {
        if (ev.line) setTimeout(() => burstWin(ev.line), 120);
        const iWon = view && ev.winner === myPid();
        sfx(iWon ? "win" : "lose");
      } else if (ev.type === "draw") {
        sfx("success");
      } else if (ev.type === "forfeit") {
        toastMsg(view && ev.winner === myPid() ? "상대가 기권했습니다 · 승리!" : "기권으로 패배");
      }
    }
  }

  function toastMsg(text) {
    if (mp) mp.toast(text);
  }

  const mp = window.MPClient.create({
    cpuButton: true,
    onState(state) {
      const firstLoad = !view;
      view = state;
      if (firstLoad) {
        particles = [];
        placing.clear();
        lastFrame = performance.now();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(render);
      }
      updateHud();
    },
    onEvents(events) { handleEvents(events); },
    onLobbyReturn() {
      view = null;
      particles = [];
      cancelAnimationFrame(rafId);
      drawBoard();
    },
  });

  el.board.addEventListener("click", onTap);
  el.board.addEventListener("touchend", onTap, { passive: false });

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();

  drawBoard();
})();
