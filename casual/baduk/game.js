(() => {
  "use strict";

  const N = 9;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const LS_SOUND = "baduk.sound";
  const COLS = "ABCDEFGHJ";

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
    capBlack: document.getElementById("cap-black"),
    capWhite: document.getElementById("cap-white"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
    btnPass: document.getElementById("btn-pass"),
    btnResign: document.getElementById("btn-resign"),
  };

  const ctx = el.board.getContext("2d");
  const fxCtx = el.fx.getContext("2d");

  let view = null;
  let drops = new Map();
  let pops = [];
  let territoryPulse = 0;
  let lastFrame = 0;
  let rafId = 0;

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function cellSize() { return el.board.width / (N + 1); }
  function toXY(r, c) { const s = cellSize(); return [(c + 1) * s, (r + 1) * s]; }

  function drawWood(s, W) {
    const g = ctx.createLinearGradient(0, 0, W, W);
    g.addColorStop(0, "#e0b96b");
    g.addColorStop(0.5, "#d3a855");
    g.addColorStop(1, "#c2934a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);

    ctx.strokeStyle = "rgba(120, 80, 25, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 34; i++) {
      const y = (i * 131) % W;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.35, y + ((i % 3) - 1) * 5, W * 0.7, y + ((i % 4) - 1) * 7, W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(55, 32, 8, 0.65)";
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= N; i++) {
      ctx.beginPath();
      ctx.moveTo(s, i * s); ctx.lineTo(N * s, i * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * s, s); ctx.lineTo(i * s, N * s);
      ctx.stroke();
    }
    ctx.lineWidth = 2.6;
    ctx.strokeRect(s, s, (N - 1) * s, (N - 1) * s);

    ctx.fillStyle = "rgba(50, 28, 6, 0.9)";
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]]) {
      const [x, y] = toXY(r, c);
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(60, 36, 12, 0.75)";
    ctx.font = `600 ${Math.max(9, s * 0.22)}px "Noto Sans KR"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let c = 0; c < N; c++) {
      ctx.fillText(COLS[c], (c + 1) * s, s * 0.42);
      ctx.fillText(COLS[c], (c + 1) * s, W - s * 0.42);
    }
    for (let r = 0; r < N; r++) {
      ctx.fillText(String(N - r), s * 0.42, (r + 1) * s);
      ctx.fillText(String(N - r), W - s * 0.42, (r + 1) * s);
    }
  }

  function drawStone(x, y, radius, color, alpha, scale) {
    const sc = scale == null ? 1 : scale;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius * sc);
    if (color === BLACK) {
      grad.addColorStop(0, "#7d7d7d");
      grad.addColorStop(0.5, "#2a2a2a");
      grad.addColorStop(1, "#060606");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.65, "#f2efe8");
      grad.addColorStop(1, "#c9c4b8");
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
    ctx.arc(x - radius * 0.32, y - radius * 0.38, radius * 0.2 * sc, 0, Math.PI * 2);
    ctx.fillStyle = color === BLACK ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.restore();
  }

  function dropScale(r, c) {
    const rec = drops.get(`${r}:${c}`);
    if (!rec) return 1;
    const t = Math.min(1, (performance.now() - rec.t0) / 200);
    if (t >= 1) { drops.delete(`${r}:${c}`); return 1; }
    const ease = 1 - Math.pow(1 - t, 3);
    return 1.45 - 0.45 * ease;
  }

  function render(now) {
    if (!view) return;
    const s = cellSize();
    const rad = s * 0.46;
    const W = el.board.width;

    ctx.clearRect(0, 0, W, W);
    drawWood(s, W);

    if (view.territory) {
      territoryPulse += (now - lastFrame) / 400;
      const a = 0.16 + 0.08 * Math.sin(territoryPulse * Math.PI * 2);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const o = view.territory[r][c];
          if (!o) continue;
          ctx.fillStyle = o === BLACK ? `rgba(30, 40, 160, ${a + 0.18})` : `rgba(220, 70, 60, ${a + 0.18})`;
          const [x, y] = toXY(r, c);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
    }

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = view.board[r][c];
        if (!v) continue;
        const [x, y] = toXY(r, c);
        drawStone(x, y, rad, v, 1, dropScale(r, c));
      }
    }

    if (view.lastMove && !view.territory) {
      const [lx, ly] = toXY(view.lastMove[0], view.lastMove[1]);
      ctx.save();
      ctx.strokeStyle = view.lastColor === BLACK ? "rgba(255,220,120,0.95)" : "rgba(230,70,50,0.95)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(lx, ly, rad * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    fxCtx.clearRect(0, 0, el.fx.width, el.fx.height);
    for (const p of pops) {
      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.fillStyle = p.color;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.globalAlpha = 1;
    stepPops();

    if (view.phase === "playing" && view.yourTurn && hover.valid) {
      const [hx, hy] = toXY(hover.r, hover.c);
      drawStone(hx, hy, rad, view.yourColor, 0.4, 1);
    }

    lastFrame = now;
    rafId = requestAnimationFrame(render);
  }


  function spawnPop(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = 0.8 + Math.random() * 2.4;
      pops.push({
        x, y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        r: 1.4 + Math.random() * 2.6,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        color: color === BLACK ? "rgba(90,90,90,0.9)" : "rgba(240,240,240,0.95)",
      });
    }
  }

  function stepPops() {
    pops = pops.filter((p) => p.life > 0);
    for (const p of pops) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.vx *= 0.97;
      p.life -= p.decay;
    }
  }

  function updateHud() {
    if (!view) return;
    el.capBlack.textContent = `흑 ${view.capturesBlack}`;
    el.capWhite.textContent = `백 ${view.capturesWhite}`;
    el.stoneMe.className = `turn-stone ${view.yourColor === BLACK ? "turn-black" : "turn-white"}`;
    el.resultOverlay.hidden = true;
    if (view.phase === "ended") {
      const iWon = view.winner != null && view.winner === mp.id;
      el.status.textContent = "계가 종료";
      if (view.winner == null) {
        el.resultTitle.textContent = "무승부?";
        el.resultSub.textContent = "집이 같아요";
      } else {
        el.resultTitle.textContent = iWon ? "승리!" : "패배";
        el.resultSub.textContent = view.resultText || "";
      }
      el.resultOverlay.hidden = false;
      sfx(iWon ? "win" : "lose");
    } else {
      el.status.textContent = view.yourTurn ? "당신 차례" : "상대 차례…";
      el.status.classList.toggle("is-wait", !view.yourTurn);
    }
  }

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

  const hover = { r: 4, c: 4, valid: false };

  function onTap(e) {
    if (!view || view.phase !== "playing" || !view.yourTurn) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const cell = posToCell(t.clientX, t.clientY);
    if (!cell || view.board[cell.r][cell.c]) return;
    mp.action({ t: "place", r: cell.r, c: cell.c });
  }

  function onMove(e) {
    if (!view || !view.yourTurn || view.phase !== "playing") { hover.valid = false; return; }
    const cell = posToCell(e.clientX, e.clientY);
    hover.r = cell ? cell.r : 0;
    hover.c = cell ? cell.c : 0;
    hover.valid = !!cell && !view.board[cell.r][cell.c];
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "place") {
        drops.set(`${ev.r}:${ev.c}`, { t0: performance.now() });
        sfx("drop");
      } else if (ev.type === "capture" && ev.cells) {
        for (const [cr, cc] of ev.cells) {
          const [x, y] = toXY(cr, cc);
          spawnPop(x, y, ev.color);
        }
        sfx(ev.color === BLACK ? "hitSoft" : "pickup");
      } else if (ev.type === "pass") {
        mp.toast(`${ev.by === mp.id ? "나" : "상대"} 패스`);
        sfx("toggle");
      } else if (ev.type === "scored") {
        sfx(ev.winner === mp.id ? "win" : "lose");
      } else if (ev.type === "forfeit") {
        mp.toast(view && ev.winner === mp.id ? "상대 기권 · 승리!" : "기권했습니다");
      }
    }
  }

  const mp = window.MPClient.create({
    cpuButton: true,
    onState(state) {
      const first = !view;
      view = state;
      if (first) {
        pops = [];
        drops.clear();
        lastFrame = performance.now();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(render);
      }
      updateHud();
    },
    onEvents(events) { handleEvents(events); },
    onLobbyReturn() {
      view = null;
      pops = [];
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, el.board.width, el.board.height);
      drawWood(cellSize(), el.board.width);
    },
  });

  el.board.addEventListener("click", onTap);
  el.board.addEventListener("touchend", onTap, { passive: false });
  el.board.addEventListener("mousemove", onMove);

  el.btnPass.addEventListener("click", () => {
    if (view && view.yourTurn) {
      mp.action({ t: "pass" });
      sfx("click");
    }
  });
  el.btnResign.addEventListener("click", () => {
    if (view && view.phase === "playing" && window.confirm("정말 기권하시겠습니까?")) {
      mp.action({ t: "resign" });
    }
  });

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();

  drawWood(cellSize(), el.board.width);
})();
