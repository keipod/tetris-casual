(() => {
  "use strict";

  const N = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const LS_WINS = "gomoku.wins";
  const LS_STREAK = "gomoku.streak";
  const LS_BEST = "gomoku.best";
  const LS_SOUND = "gomoku.sound";

  const storage = (() => {
    try { localStorage.setItem("__g", "1"); localStorage.removeItem("__g"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const el = {
    hint: document.getElementById("hint"),
    wins: document.getElementById("wins"),
    streak: document.getElementById("streak"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    btnNew: document.getElementById("btn-new"),
  };

  let board, turn, over, busy;
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let wins = Number(storage.getItem(LS_WINS) || 0) || 0;
  let streak = Number(storage.getItem(LS_STREAK) || 0) || 0;
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }

  function cellSize() { return canvas.width / (N + 1); }

  function draw() {
    const s = cellSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#c9965a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(60, 35, 10, 0.55)";
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= N; i++) {
      ctx.beginPath();
      ctx.moveTo(s, i * s);
      ctx.lineTo(N * s, i * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * s, s);
      ctx.lineTo(i * s, N * s);
      ctx.stroke();
    }
    const stars = [[4, 4], [4, 12], [8, 8], [12, 4], [12, 12]];
    ctx.fillStyle = "rgba(40, 20, 5, 0.7)";
    for (const [r, c] of stars) {
      ctx.beginPath();
      ctx.arc((c + 1) * s, (r + 1) * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = board[r][c];
        if (!v) continue;
        const x = (c + 1) * s, y = (r + 1) * s;
        const g = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, s * 0.42);
        if (v === BLACK) { g.addColorStop(0, "#666"); g.addColorStop(1, "#111"); }
        else { g.addColorStop(0, "#fff"); g.addColorStop(1, "#cfcfcf"); }
        ctx.beginPath();
        ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    el.wins.textContent = String(wins);
    el.streak.textContent = String(streak);
    el.best.textContent = String(best);
    el.hint.textContent = over ? "게임 종료" : busy ? "AI 생각 중…" : "당신 차례 · 검은 돌";
  }

  function countDir(r, c, color, dr, dc) {
    let n = 0;
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr][cc] === color) {
      n++; rr += dr; cc += dc;
    }
    return n;
  }

  function isWin(r, c, color) {
    for (const [dr, dc] of DIRS) {
      const n = 1 + countDir(r, c, color, dr, dc) + countDir(r, c, color, -dr, -dc);
      if (n >= 5) return true;
    }
    return false;
  }

  function scoreLine(r, c, color) {
    let score = 0;
    for (const [dr, dc] of DIRS) {
      const n = 1 + countDir(r, c, color, dr, dc) + countDir(r, c, color, -dr, -dc);
      if (n >= 5) score += 100000;
      else if (n === 4) score += 8000;
      else if (n === 3) score += 400;
      else if (n === 2) score += 20;
    }
    const center = Math.abs(r - 7) + Math.abs(c - 7);
    score += (14 - center);
    return score;
  }

  function aiPick() {
    let bestMoves = [];
    let bestScore = -1;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] !== EMPTY) continue;
        const attack = scoreLine(r, c, WHITE);
        const defend = scoreLine(r, c, BLACK) * 0.95;
        const s = Math.max(attack, defend);
        if (s > bestScore) { bestScore = s; bestMoves = [[r, c]]; }
        else if (s === bestScore) bestMoves.push([r, c]);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)] || [7, 7];
  }

  function finish(winner) {
    over = true;
    let title, msg;
    if (winner === BLACK) {
      wins += 1; streak += 1;
      if (streak > best) best = streak;
      storage.setItem(LS_WINS, String(wins));
      storage.setItem(LS_STREAK, String(streak));
      storage.setItem(LS_BEST, String(best));
      title = "승리!"; msg = "검은 돌 5목 완성!"; sfx("win");
    } else if (winner === WHITE) {
      streak = 0; storage.setItem(LS_STREAK, "0");
      title = "패배"; msg = "AI가 먼저 5목을 만들었어요."; sfx("lose");
    } else {
      title = "무승부"; msg = "판이 가득 찼어요."; sfx("success");
    }
    draw();
    el.card.innerHTML = `<h2>${title}</h2><p>${msg}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; start(); };
  }

  function place(r, c, color) {
    board[r][c] = color;
    draw();
    if (isWin(r, c, color)) { finish(color); return true; }
    if (board.every((row) => row.every((v) => v !== EMPTY))) { finish(0); return true; }
    return false;
  }

  function aiTurn() {
    busy = true; draw();
    setTimeout(() => {
      const [r, c] = aiPick();
      busy = false;
      sfx("drop");
      if (!place(r, c, WHITE)) { turn = BLACK; draw(); }
    }, 280);
  }

  function posToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const s = cellSize();
    const c = Math.round(x / s) - 1;
    const r = Math.round(y / s) - 1;
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return { r, c };
  }

  function onTap(e) {
    if (over || busy || turn !== BLACK) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const cell = posToCell(t.clientX, t.clientY);
    if (!cell || board[cell.r][cell.c] !== EMPTY) return;
    e.preventDefault();
    sfx("click");
    if (place(cell.r, cell.c, BLACK)) return;
    turn = WHITE;
    aiTurn();
  }

  function start() {
    board = Array.from({ length: N }, () => Array(N).fill(EMPTY));
    turn = BLACK; over = false; busy = false;
    el.overlay.hidden = true;
    draw();
  }

  canvas.addEventListener("click", onTap);
  canvas.addEventListener("touchend", onTap, { passive: false });
  el.btnNew.onclick = () => { sfx("click"); start(); };
  el.btnHelp.onclick = () => { el.help.hidden = false; };
  el.btnHelpClose.onclick = () => { el.help.hidden = true; };
  el.btnSound.onclick = () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSound();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  };
  syncSound();
  start();
})();
