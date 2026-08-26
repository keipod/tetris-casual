(() => {
  "use strict";

  const N = 8;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];
  const LS_BEST = "othello.best";
  const LS_STREAK = "othello.streak";
  const LS_SOUND = "othello.sound";

  const storage = (() => {
    try {
      localStorage.setItem("__o", "1");
      localStorage.removeItem("__o");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let board = [];
  let turn = BLACK;
  let busy = false;
  let streak = Number(storage.getItem(LS_STREAK) || 0) || 0;
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;

  const el = {
    board: document.getElementById("board"),
    scoreB: document.getElementById("score-b"),
    scoreW: document.getElementById("score-w"),
    streak: document.getElementById("streak"),
    best: document.getElementById("best"),
    hint: document.getElementById("hint"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    btnNew: document.getElementById("btn-new"),
  };

  function sfx(role) {
    if (!soundOn || !window.CasualSfx) return;
    CasualSfx.play(role);
  }

  function syncSoundUi() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }

  function emptyBoard() {
    const b = Array.from({ length: N }, () => Array(N).fill(EMPTY));
    b[3][3] = WHITE; b[3][4] = BLACK;
    b[4][3] = BLACK; b[4][4] = WHITE;
    return b;
  }

  function inBounds(r, c) {
    return r >= 0 && r < N && c >= 0 && c < N;
  }

  function flipsAt(b, r, c, color) {
    if (b[r][c] !== EMPTY) return [];
    const opp = color === BLACK ? WHITE : BLACK;
    const flips = [];
    for (const [dr, dc] of DIRS) {
      let rr = r + dr, cc = c + dc;
      const line = [];
      while (inBounds(rr, cc) && b[rr][cc] === opp) {
        line.push([rr, cc]);
        rr += dr; cc += dc;
      }
      if (line.length && inBounds(rr, cc) && b[rr][cc] === color) {
        flips.push(...line);
      }
    }
    return flips;
  }

  function legalMoves(b, color) {
    const moves = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const f = flipsAt(b, r, c, color);
        if (f.length) moves.push({ r, c, flips: f });
      }
    }
    return moves;
  }

  function applyMove(b, r, c, color, flips) {
    const next = b.map((row) => row.slice());
    next[r][c] = color;
    for (const [fr, fc] of flips) next[fr][fc] = color;
    return next;
  }

  function counts(b) {
    let black = 0, white = 0;
    for (const row of b) for (const v of row) {
      if (v === BLACK) black++;
      else if (v === WHITE) white++;
    }
    return { black, white };
  }

  function render() {
    const moves = turn === BLACK ? legalMoves(board, BLACK) : [];
    const moveSet = new Set(moves.map((m) => m.r + "," + m.c));
    const { black, white } = counts(board);
    el.scoreB.textContent = String(black);
    el.scoreW.textContent = String(white);
    el.streak.textContent = String(streak);
    el.best.textContent = String(best);
    el.hint.textContent = busy
      ? "AI 생각 중…"
      : turn === BLACK
        ? "당신 차례 · 검은 돌"
        : "AI 차례 · 흰 돌";

    el.board.innerHTML = "";
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        const v = board[r][c];
        if (v === BLACK || v === WHITE) {
          const d = document.createElement("span");
          d.className = "disc " + (v === BLACK ? "black" : "white");
          btn.appendChild(d);
          btn.disabled = true;
        } else if (moveSet.has(r + "," + c) && !busy) {
          const h = document.createElement("span");
          h.className = "hint-dot";
          btn.appendChild(h);
        } else {
          btn.disabled = true;
        }
        el.board.appendChild(btn);
      }
    }
  }

  function endGame() {
    const { black, white } = counts(board);
    let title, msg;
    if (black > white) {
      streak += 1;
      if (streak > best) best = streak;
      storage.setItem(LS_STREAK, String(streak));
      storage.setItem(LS_BEST, String(best));
      title = "승리!";
      msg = `나 ${black} · AI ${white}`;
      sfx("win");
    } else if (white > black) {
      streak = 0;
      storage.setItem(LS_STREAK, "0");
      title = "패배";
      msg = `나 ${black} · AI ${white}`;
      sfx("lose");
    } else {
      title = "무승부";
      msg = `둘 다 ${black}개`;
      sfx("success");
    }
    el.card.innerHTML =
      `<h2>${title}</h2><p>${msg}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => {
      el.overlay.hidden = true;
      start();
    };
    render();
  }

  function maybePassOrEnd() {
    const my = legalMoves(board, turn);
    if (my.length) return false;
    const other = turn === BLACK ? WHITE : BLACK;
    if (!legalMoves(board, other).length) {
      endGame();
      return true;
    }
    turn = other;
    el.hint.textContent = "둘 곳이 없어 패스!";
    sfx("warn");
    return false;
  }

  function aiMove() {
    busy = true;
    render();
    setTimeout(() => {
      const moves = legalMoves(board, WHITE);
      if (!moves.length) {
        busy = false;
        turn = BLACK;
        if (!maybePassOrEnd()) render();
        else return;
        return;
      }
      moves.sort((a, b) => b.flips.length - a.flips.length);
      const top = moves.filter((m) => m.flips.length === moves[0].flips.length);
      const pick = top[Math.floor(Math.random() * top.length)];
      board = applyMove(board, pick.r, pick.c, WHITE, pick.flips);
      sfx("drop");
      busy = false;
      turn = BLACK;
      if (maybePassOrEnd()) return;
      if (!legalMoves(board, BLACK).length) {
        turn = WHITE;
        if (maybePassOrEnd()) return;
        aiMove();
        return;
      }
      render();
    }, 380);
  }

  function onCell(r, c) {
    if (busy || turn !== BLACK) return;
    const flips = flipsAt(board, r, c, BLACK);
    if (!flips.length) return;
    board = applyMove(board, r, c, BLACK, flips);
    sfx("click");
    turn = WHITE;
    render();
    if (maybePassOrEnd()) return;
    if (!legalMoves(board, WHITE).length) {
      turn = BLACK;
      if (maybePassOrEnd()) return;
      render();
      return;
    }
    aiMove();
  }

  function start() {
    board = emptyBoard();
    turn = BLACK;
    busy = false;
    el.overlay.hidden = true;
    render();
  }

  el.board.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || cell.disabled) return;
    onCell(Number(cell.dataset.r), Number(cell.dataset.c));
  });

  el.btnNew.addEventListener("click", () => { sfx("click"); start(); });
  el.btnHelp.addEventListener("click", () => { el.help.hidden = false; });
  el.btnHelpClose.addEventListener("click", () => { el.help.hidden = true; });
  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundUi();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });

  syncSoundUi();
  start();
})();
