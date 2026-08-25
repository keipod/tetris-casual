(() => {
  "use strict";

  const SIZE = 4;
  const ANIM_MS = 120;
  const SWIPE_PX = 24;
  const LS_BEST = "2048.best";
  const LS_STATE = "2048.state";
  const LS_SOUND = "2048.sound";

  const VECTORS = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 },
  };

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function within(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function traversals(dir) {
    const rs = [0, 1, 2, 3];
    const cs = [0, 1, 2, 3];
    if (dir === "down") rs.reverse();
    if (dir === "right") cs.reverse();
    return { rs, cs };
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

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const tilesEl = document.getElementById("tiles");
  const stageEl = document.getElementById("stage");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnNew = document.getElementById("btn-new");
  const btnUndo = document.getElementById("btn-undo");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let grid = emptyGrid();
  let uid = 0;
  let score = 0;
  let best = parseInt(storage.getItem(LS_BEST), 10) || 0;
  let undoSnap = null;
  let won = false;
  let over = false;

  const SFX = {
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
    slide() { if (soundOn && window.CasualSfx) window.CasualSfx.play("slide", 0.3); },
    merge(v) {
      if (!soundOn || !window.CasualSfx) return;
      if (v >= 1024) window.CasualSfx.playSeq(["level", "special"], 90, 0.75);
      else if (v >= 128) window.CasualSfx.play("level", 0.7);
      else if (v >= 32) window.CasualSfx.play("combo", 0.65);
      else if (v >= 8) window.CasualSfx.play("swap", 0.55);
      else window.CasualSfx.play("tick", 0.5);
    },
    win() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "level", "fanfare"], 90, 0.75); },
    lose() { if (soundOn && window.CasualSfx) window.CasualSfx.play("lose", 0.7); },
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

  function snapshot() {
    return {
      cells: grid.map((row) => row.map((t) => (t ? t.value : 0))),
      score,
    };
  }

  function saveState() {
    storage.setItem(LS_STATE, JSON.stringify({ v: 1, cells: snapshot().cells, score, won }));
  }

  function clearState() {
    storage.removeItem(LS_STATE);
  }

  function validState(data) {
    if (!data || data.v !== 1 || !Array.isArray(data.cells) || data.cells.length !== SIZE) return false;
    for (const row of data.cells) {
      if (!Array.isArray(row) || row.length !== SIZE) return false;
      for (const v of row) {
        if (!Number.isInteger(v) || v < 0 || (v & (v - 1)) !== 0) return false;
      }
    }
    return Number.isInteger(data.score) && data.score >= 0;
  }

  function addRandomTile() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) empties.push({ r, c });
      }
    }
    if (!empties.length) return null;
    const { r, c } = empties[Math.floor(Math.random() * empties.length)];
    const t = { id: ++uid, value: Math.random() < 0.9 ? 2 : 4, r, c };
    grid[r][c] = t;
    return t;
  }

  function makeTileEl(t, cls) {
    const el = document.createElement("div");
    el.className = "tile" + (cls ? " " + cls : "");
    const inner = document.createElement("div");
    inner.className = "tile-inner";
    inner.dataset.v = String(t.value > 2048 ? "super" : t.value);
    if (t.value > 2048) inner.classList.add("tile-super");
    if (String(t.value).length >= 4) inner.classList.add("len-4");
    else if (String(t.value).length === 3) inner.classList.add("len-3");
    inner.textContent = String(t.value);
    el.appendChild(inner);
    el.style.setProperty("--tx", t.c);
    el.style.setProperty("--ty", t.r);
    tilesEl.appendChild(el);
    t.el = el;
    return el;
  }

  function refreshTileEl(t) {
    const inner = t.el.firstChild;
    inner.textContent = String(t.value);
    if (t.value > 2048) {
      inner.dataset.v = "super";
      inner.classList.add("tile-super");
    } else {
      inner.dataset.v = String(t.value);
    }
    inner.classList.toggle("len-4", String(t.value).length >= 4);
    inner.classList.toggle("len-3", String(t.value).length === 3);
  }

  function positionTile(t) {
    t.el.style.setProperty("--tx", t.c);
    t.el.style.setProperty("--ty", t.r);
  }

  function renderAll() {
    tilesEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c];
        if (t) makeTileEl(t);
      }
    }
  }

  function updateHud(bumpScore) {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    if (bumpScore) {
      scoreEl.parentElement.classList.remove("bump");
      void scoreEl.parentElement.offsetWidth;
      scoreEl.parentElement.classList.add("bump");
    }
  }

  function updateUndoBtn() {
    btnUndo.disabled = !undoSnap;
  }

  function movesAvailable() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c];
        if (!t) return true;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === t.value) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === t.value) return true;
      }
    }
    return false;
  }

  function move(dir) {
    if (over || !overlay.hidden || !helpOverlay.hidden) return;
    const snap = snapshot();
    const v = VECTORS[dir];
    const { rs, cs } = traversals(dir);
    const mergedIds = new Set();
    const consumed = [];
    const mergedTargets = [];
    let moved = false;
    let gained = 0;
    let reachedWin = false;

    for (const r of rs) {
      for (const c of cs) {
        const t = grid[r][c];
        if (!t) continue;
        let nr = r;
        let nc = c;
        let target = null;
        for (;;) {
          const tr = nr + v.r;
          const tc = nc + v.c;
          if (!within(tr, tc)) break;
          const occ = grid[tr][tc];
          if (!occ) { nr = tr; nc = tc; continue; }
          if (occ.value === t.value && !mergedIds.has(occ.id)) target = occ;
          break;
        }
        if (target) {
          grid[r][c] = null;
          mergedIds.add(target.id);
          target.value *= 2;
          gained += target.value;
          consumed.push({ src: t, dstR: target.r, dstC: target.c });
          mergedTargets.push(target);
          if (target.value === 2048 && !won) reachedWin = true;
          moved = true;
        } else if (nr !== r || nc !== c) {
          grid[r][c] = null;
          grid[nr][nc] = t;
          t.r = nr;
          t.c = nc;
          moved = true;
        }
      }
    }

    if (!moved) return;

    undoSnap = snap;
    score += gained;
    if (score > best) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }

    for (const row of grid) {
      for (const t of row) {
        if (t && t.el) positionTile(t);
      }
    }
    for (const { src, dstR, dstC } of consumed) {
      src.el.classList.add("merging-src");
      src.el.style.setProperty("--tx", dstC);
      src.el.style.setProperty("--ty", dstR);
      setTimeout(() => src.el.remove(), ANIM_MS + 40);
    }
    for (const target of mergedTargets) {
      target.el.classList.remove("tile-merged");
      void target.el.offsetWidth;
      target.el.classList.add("tile-merged");
      refreshTileEl(target);
    }

    const fresh = addRandomTile();
    if (fresh) makeTileEl(fresh, "tile-new");

    updateHud(gained > 0);
    updateUndoBtn();

    if (gained > 0) SFX.merge(Math.max(...mergedTargets.map((t) => t.value)));
    else SFX.slide();

    saveState();

    if (reachedWin) {
      won = true;
      saveState();
      setTimeout(() => showWin(), 260);
      return;
    }
    if (!movesAvailable()) {
      over = true;
      clearState();
      setTimeout(() => showGameOver(), 320);
    }
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlayCard.innerHTML = "";
  }

  function showWin() {
    SFX.win();
    overlayCard.innerHTML = `
      <h2>🎉 2048 달성!</h2>
      <p>환상적이에요! 이제부터는 더 큰 숫자에 도전할 수 있어요.</p>
      <div class="result-row">
        <div class="result-item"><span class="result-num">${score}</span><span class="result-label">점수</span></div>
        <div class="result-item"><span class="result-num">${best}</span><span class="result-label">최고</span></div>
      </div>
      <button type="button" class="retry" id="btn-keep">계속하기</button>
      <button type="button" class="btn-ghost" id="btn-restart">새 게임</button>
    `;
    overlay.hidden = false;
    document.getElementById("btn-keep").onclick = () => {
      SFX.click();
      hideOverlay();
    };
    document.getElementById("btn-restart").onclick = () => {
      SFX.click();
      resetGame(false);
    };
  }

  function showGameOver() {
    SFX.lose();
    const isNewBest = score >= best && score > 0;
    overlayCard.innerHTML = `
      <h2>게임 오버</h2>
      ${isNewBest ? '<span class="new-best">🏆 신기록 달성!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${score}</span><span class="result-label">점수</span></div>
        <div class="result-item"><span class="result-num">${best}</span><span class="result-label">최고</span></div>
      </div>
      <button type="button" class="retry" id="btn-again">다시 하기</button>
      <button type="button" class="btn-ghost" id="btn-undo-over" ${undoSnap ? "" : "disabled"}>↩ 되돌리기</button>
    `;
    overlay.hidden = false;
    document.getElementById("btn-again").onclick = () => {
      SFX.click();
      resetGame(false);
    };
    const undoOver = document.getElementById("btn-undo-over");
    undoOver.onclick = () => {
      if (undoOver.disabled) return;
      SFX.click();
      undo();
    };
  }

  function undo() {
    if (!undoSnap) return;
    grid = emptyGrid();
    undoSnap.cells.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v > 0) grid[r][c] = { id: ++uid, value: v, r, c };
      });
    });
    score = undoSnap.score;
    undoSnap = null;
    over = false;
    hideOverlay();
    renderAll();
    updateHud(false);
    updateUndoBtn();
    saveState();
  }

  function resetGame(askConfirm) {
    const hasProgress = score > 0 || grid.some((row) => row.some((t) => t));
    if (askConfirm && hasProgress && !window.confirm("진행 중인 게임을 버리고 새로 시작할까요?")) return;
    grid = emptyGrid();
    score = 0;
    undoSnap = null;
    won = false;
    over = false;
    hideOverlay();
    addRandomTile();
    addRandomTile();
    renderAll();
    updateHud(false);
    updateUndoBtn();
    saveState();
  }

  btnUndo.addEventListener("click", () => {
    if (!undoSnap) return;
    SFX.click();
    undo();
  });

  btnNew.addEventListener("click", () => {
    SFX.click();
    resetGame(true);
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

  const KEY_DIRS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  document.addEventListener("keydown", (e) => {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  let touchStart = null;

  stageEl.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { touchStart = null; return; }
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  stageEl.addEventListener("touchmove", (e) => {
    if (touchStart) e.preventDefault();
  }, { passive: false });

  stageEl.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    move(dir);
  });

  stageEl.addEventListener("touchcancel", () => {
    touchStart = null;
  });

  function loadGame() {
    let restored = false;
    try {
      const data = JSON.parse(storage.getItem(LS_STATE) || "null");
      if (validState(data)) {
        grid = emptyGrid();
        data.cells.forEach((row, r) => {
          row.forEach((v, c) => {
            if (v > 0) grid[r][c] = { id: ++uid, value: v, r, c };
          });
        });
        score = data.score;
        won = !!data.won;
        over = !movesAvailable();
        restored = true;
      }
    } catch (_) {}
    if (!restored) {
      addRandomTile();
      addRandomTile();
    }
    renderAll();
    updateHud(false);
    updateUndoBtn();
    if (over) setTimeout(() => showGameOver(), 400);
  }

  loadGame();
})();
