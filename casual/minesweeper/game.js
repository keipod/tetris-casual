(() => {
  "use strict";

  const LS_DIFF = "minesweeper.diff";
  const LS_BEST = "minesweeper.best";
  const LS_SOUND = "minesweeper.sound";

  const DIFFS = {
    easy: { label: "초급", rows: 9, cols: 9, mines: 10 },
    normal: { label: "중급", rows: 12, cols: 12, mines: 24 },
    hard: { label: "고급", rows: 16, cols: 16, mines: 40 },
  };
  const DIFF_ORDER = ["easy", "normal", "hard"];
  const LONG_PRESS_MS = 350;
  const MOVE_CANCEL_PX = 10;
  const MAX_TIME = 999;
  const CONFETTI_COLORS = ["#ffcf5c", "#ff8a5b", "#4fd8c4", "#ff6b6b", "#eef4f8"];

  function neighborsOf(idx, rows, cols) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
      }
    }
    return out;
  }

  const api = { DIFFS, DIFF_ORDER, neighborsOf };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__minesweeper = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const minesEl = document.getElementById("mines");
  const timerEl = document.getElementById("timer");
  const bestEl = document.getElementById("best");
  const board = document.getElementById("board");
  const btnFlagMode = document.getElementById("btn-flag");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnNew = document.getElementById("btn-new");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const confettiWrap = document.getElementById("confetti");
  const modeBtns = Array.from(document.querySelectorAll(".mode-btn"));

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let diff = DIFF_ORDER.includes(storage.getItem(LS_DIFF)) ? storage.getItem(LS_DIFF) : "easy";
  let rows = DIFFS.easy.rows;
  let cols = DIFFS.easy.cols;
  let mineCount = DIFFS.easy.mines;
  let grid = [];
  let cellEls = [];
  let placed = false;
  let ended = false;
  let revealedCount = 0;
  let flagCount = 0;
  let flagMode = false;
  let timerHandle = 0;
  let startTs = 0;
  let elapsedMs = 0;

  const lp = { timer: 0, x: 0, y: 0, suppress: false };

  function play(role, vol) {
    if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
  }

  const SFX = {
    click() { play("click", 0.5); },
    tap() { play("tap", 0.55); },
    slide() { play("slide", 0.6); },
    toggle() { play("toggle", 0.6); },
    bomb() { play("bomb", 0.85); },
    lose() { play("lose", 0.7); },
    fanfare() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.75); },
  };

  function vibrate(ms) {
    if (window.CasualMobile && typeof window.CasualMobile.vibrate === "function") {
      window.CasualMobile.vibrate(ms);
    }
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
      if (soundOn) { window.CasualSfx.unlock(); SFX.click(); }
    }
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  function readBest() {
    try {
      return JSON.parse(storage.getItem(LS_BEST) || "{}");
    } catch (_) {
      return {};
    }
  }

  function updateBestChip() {
    const cur = readBest()[diff];
    bestEl.textContent = cur != null ? `${cur}초` : "–";
  }

  function updateMineCounter() {
    minesEl.textContent = String(mineCount - flagCount);
  }

  function fmtSeconds(ms) {
    return String(Math.min(MAX_TIME, Math.floor(ms / 1000)));
  }

  function startTimerIfNeeded() {
    if (timerHandle) return;
    startTs = performance.now();
    timerHandle = setInterval(() => {
      elapsedMs = performance.now() - startTs;
      timerEl.textContent = fmtSeconds(elapsedMs);
    }, 200);
  }

  function stopTimer() {
    clearInterval(timerHandle);
    timerHandle = 0;
    if (startTs) elapsedMs = performance.now() - startTs;
  }

  function buildGrid() {
    grid = [];
    for (let i = 0; i < rows * cols; i++) {
      grid.push({ mine: false, adj: 0, revealed: false, flagged: false });
    }
  }

  function placeMines(safeIdx) {
    const banned = new Set([safeIdx, ...neighborsOf(safeIdx, rows, cols)]);
    const pool = [];
    for (let i = 0; i < rows * cols; i++) {
      if (!banned.has(i)) pool.push(i);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let k = 0; k < mineCount; k++) grid[pool[k]].mine = true;
    for (let i = 0; i < rows * cols; i++) {
      if (grid[i].mine) continue;
      grid[i].adj = neighborsOf(i, rows, cols).reduce((n, j) => n + (grid[j].mine ? 1 : 0), 0);
    }
    placed = true;
  }

  function paintCell(i) {
    const el = cellEls[i];
    const c = grid[i];
    el.classList.toggle("revealed", c.revealed);
    el.classList.toggle("flagged", c.flagged);
    if (c.revealed) {
      el.disabled = true;
      if (!c.mine && c.adj > 0) {
        el.textContent = String(c.adj);
        el.dataset.n = String(c.adj);
      } else {
        el.textContent = "";
      }
    } else {
      el.innerHTML = c.flagged ? '<span class="mark">🚩</span>' : "";
    }
  }

  function floodReveal(startIdx) {
    const stack = [startIdx];
    let opened = 0;
    while (stack.length) {
      const i = stack.pop();
      const c = grid[i];
      if (c.revealed || c.flagged || c.mine) continue;
      c.revealed = true;
      revealedCount++;
      opened++;
      paintCell(i);
      if (c.adj === 0) {
        for (const n of neighborsOf(i, rows, cols)) {
          if (!grid[n].revealed && !grid[n].flagged && !grid[n].mine) stack.push(n);
        }
      }
    }
    return opened;
  }

  function tryReveal(idx) {
    if (ended || !helpOverlay.hidden) return;
    const c = grid[idx];
    if (c.revealed || c.flagged) return;
    if (!placed) placeMines(idx);
    startTimerIfNeeded();
    if (c.mine) {
      endLose(idx);
      return;
    }
    const opened = floodReveal(idx);
    if (opened === 1) SFX.tap(); else SFX.slide();
    checkWin();
  }

  function toggleFlag(idx, fromLongPress) {
    if (ended || !helpOverlay.hidden) return;
    const c = grid[idx];
    if (c.revealed) return;
    c.flagged = !c.flagged;
    flagCount += c.flagged ? 1 : -1;
    paintCell(idx);
    updateMineCounter();
    SFX.toggle();
    if (c.flagged) {
      const el = cellEls[idx];
      el.classList.add("pop");
      el.addEventListener("animationend", () => el.classList.remove("pop"), { once: true });
      if (fromLongPress) vibrate(15);
    }
  }

  function checkWin() {
    if (revealedCount !== rows * cols - mineCount) return;
    ended = true;
    stopTimer();
    board.classList.add("ended");
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].mine && !grid[i].flagged) {
        grid[i].flagged = true;
        flagCount++;
        paintCell(i);
        cellEls[i].classList.add("auto");
      }
    }
    updateMineCounter();
    SFX.fanfare();
    const sec = Math.floor(Math.min(MAX_TIME * 1000, elapsedMs) / 1000);
    const rec = readBest();
    const isNew = rec[diff] == null || sec < rec[diff];
    if (isNew) {
      rec[diff] = sec;
      storage.setItem(LS_BEST, JSON.stringify(rec));
    }
    updateBestChip();
    showWin(sec, isNew);
  }

  function endLose(hitIdx) {
    ended = true;
    stopTimer();
    board.classList.add("ended");
    SFX.bomb();
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      const el = cellEls[i];
      if (c.mine && !c.flagged) {
        el.classList.add("mine-show");
        el.innerHTML = '<span class="mark">💣</span>';
        el.style.animationDelay = `${Math.floor(i / cols) * 18 + (i % cols) * 8}ms`;
      } else if (!c.mine && c.flagged) {
        el.classList.add("wrong");
      }
    }
    cellEls[hitIdx].classList.add("hit");
    board.classList.add("shake");
    setTimeout(() => board.classList.remove("shake"), 550);
    setTimeout(() => SFX.lose(), 350);
    const safeTotal = rows * cols - mineCount;
    showLose(revealedCount, safeTotal);
  }

  function clearConfetti() {
    confettiWrap.hidden = true;
    confettiWrap.innerHTML = "";
  }

  function spawnConfetti() {
    clearConfetti();
    confettiWrap.hidden = false;
    for (let k = 0; k < 42; k++) {
      const p = document.createElement("i");
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = CONFETTI_COLORS[k % CONFETTI_COLORS.length];
      p.style.setProperty("--t", `${2.2 + Math.random() * 1.7}s`);
      p.style.setProperty("--d", `${Math.random() * 0.55}s`);
      p.style.setProperty("--dx", `${Math.random() * 140 - 70}px`);
      confettiWrap.appendChild(p);
    }
  }

  function showWin(sec, isNew) {
    overlayCard.innerHTML = `
      <h2>${DIFFS[diff].label} 클리어!</h2>
      ${isNew ? '<span class="new-best">🏆 신기록!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${sec}</span><span class="result-label">초</span></div>
        <div class="result-item"><span class="result-num">${DIFFS[diff].label}</span><span class="result-label">난이도</span></div>
      </div>
      <p>지뢰를 피해 모든 안전한 칸을 찾았어요!</p>
      <button type="button" class="retry" id="btn-again">다시 하기</button>
    `;
    spawnConfetti();
    overlay.hidden = false;
    document.getElementById("btn-again").onclick = () => {
      SFX.click();
      newGame(diff);
    };
  }

  function showLose(opened, safeTotal) {
    overlayCard.innerHTML = `
      <h2>펑! 💥</h2>
      <p>지뢰를 밟았어요. ${opened}/${safeTotal} 칸을 열었어요.<br>다시 도전해보세요!</p>
      <button type="button" class="retry" id="btn-retry">재시작</button>
    `;
    setTimeout(() => {
      overlay.hidden = false;
      document.getElementById("btn-retry").onclick = () => {
        SFX.click();
        newGame(diff);
      };
    }, 650);
  }

  function renderBoard() {
    board.style.setProperty("--cols", String(cols));
    board.innerHTML = "";
    cellEls = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows * cols; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cell";
      b.dataset.idx = String(i);
      b.setAttribute("aria-label", `${r + 1}행 ${c + 1}열 칸`);
      frag.appendChild(b);
      cellEls.push(b);
    }
    board.appendChild(frag);
  }

  function setModeButtons() {
    modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.diff === diff));
  }

  function syncCellSize() {
    const size = Math.floor(Math.min(44, Math.max(19, (window.innerWidth - 40 - (cols - 1) * 3) / cols)));
    board.style.setProperty("--cell", `${size}px`);
    board.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  }

  window.addEventListener("resize", syncCellSize);

  function newGame(nextDiff) {
    diff = nextDiff;
    storage.setItem(LS_DIFF, diff);
    rows = DIFFS[diff].rows;
    cols = DIFFS[diff].cols;
    mineCount = DIFFS[diff].mines;
    placed = false;
    ended = false;
    revealedCount = 0;
    flagCount = 0;
    stopTimer();
    startTs = 0;
    elapsedMs = 0;
    timerEl.textContent = "0";
    overlay.hidden = true;
    clearConfetti();
    board.classList.remove("ended", "shake");
    buildGrid();
    renderBoard();
    syncCellSize();
    updateMineCounter();
    updateBestChip();
    setModeButtons();
  }

  board.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    if (lp.suppress) {
      lp.suppress = false;
      return;
    }
    const idx = +cell.dataset.idx;
    if (flagMode) toggleFlag(idx, false);
    else tryReveal(idx);
  });

  board.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const cell = e.target.closest(".cell");
    if (!cell) return;
    toggleFlag(+cell.dataset.idx, false);
  });

  board.addEventListener("pointerdown", (e) => {
    lp.suppress = false;
    if (e.pointerType !== "touch") return;
    const cell = e.target.closest(".cell");
    if (!cell || ended || !helpOverlay.hidden) return;
    lp.x = e.clientX;
    lp.y = e.clientY;
    const idx = +cell.dataset.idx;
    lp.timer = setTimeout(() => {
      lp.timer = 0;
      lp.suppress = true;
      toggleFlag(idx, true);
    }, LONG_PRESS_MS);
  });

  window.addEventListener("pointermove", (e) => {
    if (!lp.timer) return;
    if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > MOVE_CANCEL_PX) {
      clearTimeout(lp.timer);
      lp.timer = 0;
    }
  }, { passive: true });

  ["pointerup", "pointercancel"].forEach((type) => {
    window.addEventListener(type, () => {
      if (lp.timer) {
        clearTimeout(lp.timer);
        lp.timer = 0;
      }
    });
  });

  btnFlagMode.addEventListener("click", () => {
    flagMode = !flagMode;
    btnFlagMode.classList.toggle("is-active", flagMode);
    btnFlagMode.setAttribute("aria-pressed", String(flagMode));
    SFX.toggle();
  });

  modeBtns.forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.diff === diff) return;
      SFX.click();
      newGame(b.dataset.diff);
    });
  });

  btnNew.addEventListener("click", () => {
    SFX.click();
    newGame(diff);
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
  btnHelpClose.addEventListener("click", () => {
    SFX.click();
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  newGame(diff);
})();
