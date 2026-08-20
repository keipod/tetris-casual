(() => {
  "use strict";

  const LS_BEST = "puzzle_best_v1";
  const LS_SOUND = "puzzle_sound_v1";
  const POKE_API = "https://pokeapi.co/api/v2";
  const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const POKE_CRY = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
  const PREVIEW_MS = 3000;
  const SNAP_RATIO = 0.5;

  const SPECIES_POOL = [
    1, 4, 7, 25, 26, 39, 52, 54, 133, 134, 135, 136, 143, 172, 175, 183, 194,
    196, 197, 252, 255, 258, 280, 311, 312, 387, 390, 393, 417, 427, 447, 506, 700,
  ];

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function solvedBoard(size) {
    const n = size * size;
    const board = [];
    for (let i = 1; i < n; i++) board.push(i);
    board.push(0);
    return board;
  }

  function emptyIndex(board) {
    return board.indexOf(0);
  }

  function indexToRC(index, size) {
    return { row: Math.floor(index / size), col: index % size };
  }

  function neighborsOf(index, size) {
    const { row, col } = indexToRC(index, size);
    const out = [];
    if (row > 0) out.push(index - size);
    if (row < size - 1) out.push(index + size);
    if (col > 0) out.push(index - 1);
    if (col < size - 1) out.push(index + 1);
    return out;
  }

  function isAdjacent(a, b, size) {
    return neighborsOf(a, size).includes(b);
  }

  function canMoveTile(tileIndex, board, size) {
    const empty = emptyIndex(board);
    return isAdjacent(tileIndex, empty, size);
  }

  function moveTile(tileIndex, board) {
    const empty = emptyIndex(board);
    const next = board.slice();
    next[empty] = next[tileIndex];
    next[tileIndex] = 0;
    return next;
  }

  function inversionCount(board) {
    const vals = board.filter((v) => v !== 0);
    let inv = 0;
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] > vals[j]) inv++;
      }
    }
    return inv;
  }

  function isSolvable(board, size) {
    const inv = inversionCount(board);
    if (size % 2 === 1) return inv % 2 === 0;
    const empty = emptyIndex(board);
    const rowFromBottom = size - Math.floor(empty / size);
    return (inv + rowFromBottom) % 2 === 1;
  }

  function isSolved(board, size) {
    const n = size * size;
    for (let i = 0; i < n - 1; i++) {
      if (board[i] !== i + 1) return false;
    }
    return board[n - 1] === 0;
  }

  function nCells(size) {
    return size * size;
  }

  function shuffleBoard(size, rng, shuffleMoves) {
    let board = solvedBoard(size);
    let empty = nCells(size) - 1;
    let prev = -1;
    const total = shuffleMoves || size * size * 24;
    for (let i = 0; i < total; i++) {
      const options = neighborsOf(empty, size).filter((n) => n !== prev);
      const pick = options[Math.floor(rng() * options.length)];
      board = moveTile(pick, board);
      prev = empty;
      empty = pick;
    }
    if (isSolved(board, size)) {
      return shuffleBoard(size, rng, Math.max(8, Math.floor(total / 3)));
    }
    return board;
  }

  function slicePosition(value, size) {
    const idx = value - 1;
    const row = Math.floor(idx / size);
    const col = idx % size;
    const denom = Math.max(size - 1, 1);
    return {
      x: (col * 100) / denom,
      y: (row * 100) / denom,
    };
  }

  function bestKey(size, speciesId) {
    return `${LS_BEST}_${size}_${speciesId}`;
  }

  function parseBest(raw) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data.moves !== "number" || typeof data.timeMs !== "number") return null;
      return { moves: data.moves, timeMs: data.timeMs };
    } catch (_) {
      return null;
    }
  }

  function formatTime(ms) {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function pickKoName(names) {
    const ko = (names || []).find((n) => n.language && n.language.name === "ko");
    return ko ? String(ko.name).trim() : "";
  }

  function artUrl(id) {
    return `${ART}/${id}.png`;
  }

  function fallbackUrl(id) {
    return `${SPRITE}/${id}.png`;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function selfTest() {
    const rng = mulberry32(99);
    const size3 = 3;
    const solved = solvedBoard(size3);
    assert(isSolved(solved, size3), "solved board detected");
    assert(isSolvable(solved, size3), "solved is solvable");

    const bad = [1, 2, 3, 4, 5, 6, 8, 7, 0];
    assert(!isSolvable(bad, size3), "single swap 3x3 unsolvable");
    assert(!isSolved(bad, size3), "bad board not solved");

    for (let i = 0; i < 40; i++) {
      const shuffled = shuffleBoard(size3, rng);
      assert(isSolvable(shuffled, size3), "shuffle must stay solvable");
    }

    for (let i = 0; i < 20; i++) {
      const shuffled = shuffleBoard(4, rng);
      assert(isSolvable(shuffled, 4), "4x4 shuffle solvable");
    }

    let board = solved.slice();
    assert(canMoveTile(7, board, size3), "tile 8 adjacent to empty in solved");
    assert(!canMoveTile(0, board, size3), "corner tile not movable in solved");
    assert(!canMoveTile(4, board, size3), "center not adjacent to empty corner");

    board = moveTile(7, board);
    assert(board[8] === 8 && board[7] === 0, "move into empty works");
    assert(!canMoveTile(0, board, size3), "remote corner not movable");
    assert(!canMoveTile(2, board, size3), "non-adjacent tile blocked");
    assert(canMoveTile(6, board, size3), "orthogonally adjacent tile movable");

    const pos = slicePosition(5, 3);
    assert(pos.x === 50 && pos.y === 50, "slice center for tile 5 on 3x3");

    return { ok: true, checked: ["parity", "shuffle", "adjacency", "solved", "slice"] };
  }

  const api = {
    solvedBoard,
    shuffleBoard,
    moveTile,
    canMoveTile,
    isAdjacent,
    isSolvable,
    isSolved,
    inversionCount,
    slicePosition,
    selfTest,
    mulberry32,
  };

  const root = typeof window !== "undefined" ? window : globalThis;
  root.__puzzle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const boardEl = document.getElementById("board");
  const minimapImg = document.getElementById("minimap-img");
  const movesEl = document.getElementById("moves");
  const timerEl = document.getElementById("timer");
  const bestEl = document.getElementById("best");
  const hintEl = document.getElementById("hint");
  const btnSound = document.getElementById("btn-sound");
  const btnNew = document.getElementById("btn-new");
  const previewOverlay = document.getElementById("preview-overlay");
  const previewImg = document.getElementById("preview-img");
  const previewName = document.getElementById("preview-name");
  const previewSec = document.getElementById("preview-sec");
  const winOverlay = document.getElementById("win-overlay");
  const winImg = document.getElementById("win-img");
  const winName = document.getElementById("win-name");
  const winStats = document.getElementById("win-stats");
  const btnReplay = document.getElementById("btn-replay");
  const btnNext = document.getElementById("btn-next");
  const sizeBtns = document.querySelectorAll(".size-btn");

  const storage = (() => {
    try {
      localStorage.setItem("__p", "1");
      localStorage.removeItem("__p");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let gridSize = 3;
  let board = solvedBoard(3);
  let speciesId = 25;
  let speciesName = "피카츄";
  let imageUrl = artUrl(25);
  let moves = 0;
  let startedAt = 0;
  let timerId = null;
  let locked = true;
  let dragState = null;
  let cryAudio = null;

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  const SFX = (() => {
    const clips = {};
    const bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.28;
    bgm.preload = "auto";
    ["slide", "snap", "shuffle", "win", "click"].forEach((name) => {
      const a = new Audio(`assets/audio/${name}.mp3`);
      a.preload = "auto";
      clips[name] = a;
    });
    let actx;
    const init = () => {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
    };
    const playClip = (name) => {
      const src = clips[name];
      if (!src) return false;
      try {
        const node = src.cloneNode();
        node.volume = 0.7;
        const p = node.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    };
    const tone = (freq, dur, type, vol) => {
      if (!soundOn) return;
      try {
        const a = init();
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
        o.connect(g);
        g.connect(a.destination);
        o.start();
        o.stop(a.currentTime + dur);
      } catch (_) {}
    };
    const syncBgm = () => {
      if (soundOn) {
        const p = bgm.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        bgm.pause();
      }
    };
    window.addEventListener("pointerdown", () => {
      try { init(); } catch (_) {}
      syncBgm();
    }, { once: true });
    return {
      slide() { if (!soundOn) return; if (!playClip("slide")) tone(280, 0.08, "sine", 0.05); },
      snap() { if (!soundOn) return; if (!playClip("snap")) tone(420, 0.05, "square", 0.04); },
      shuffle() { if (!soundOn) return; if (!playClip("shuffle")) tone(180, 0.12, "triangle", 0.05); },
      win() { if (!soundOn) return; if (!playClip("win")) { tone(523, 0.1, "triangle", 0.07); setTimeout(() => tone(784, 0.16, "triangle", 0.06), 90); } },
      click() { if (!soundOn) return; if (!playClip("click")) tone(440, 0.04, "square", 0.03); },
      syncBgm,
    };
  })();

  function playCry(id) {
    if (!soundOn) return;
    try {
      if (cryAudio) {
        cryAudio.pause();
        cryAudio = null;
      }
      cryAudio = new Audio(`${POKE_CRY}/${id}.ogg`);
      cryAudio.volume = 0.55;
      cryAudio.play().catch(() => {});
    } catch (_) {}
  }

  function loadBestDisplay() {
    const best = parseBest(storage.getItem(bestKey(gridSize, speciesId)) || "");
    if (!best) {
      bestEl.textContent = "—";
      return;
    }
    bestEl.textContent = `${best.moves}·${formatTime(best.timeMs)}`;
  }

  function maybeSaveBest() {
    const elapsed = Date.now() - startedAt;
    const key = bestKey(gridSize, speciesId);
    const prev = parseBest(storage.getItem(key) || "");
    const candidate = { moves, timeMs: elapsed };
    if (!prev || candidate.moves < prev.moves || (candidate.moves === prev.moves && candidate.timeMs < prev.timeMs)) {
      storage.setItem(key, JSON.stringify(candidate));
    }
    loadBestDisplay();
  }

  function startTimer() {
    stopTimer();
    startedAt = Date.now();
    timerEl.textContent = "0:00";
    timerId = setInterval(() => {
      timerEl.textContent = formatTime(Date.now() - startedAt);
    }, 500);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function setLocked(on) {
    locked = on;
    boardEl.classList.toggle("locked", on);
  }

  function tileBgStyle(value) {
    if (!value) return {};
    const { x, y } = slicePosition(value, gridSize);
    return {
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    };
  }

  function renderBoard(animateFrom) {
    boardEl.className = `board size-${gridSize}${locked ? " locked" : ""}`;
    boardEl.innerHTML = "";
    const n = nCells(gridSize);

    for (let i = 0; i < n; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = String(i);
      const val = board[i];

      if (val === 0) {
        cell.classList.add("empty");
      } else {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.index = String(i);
        tile.dataset.value = String(val);

        const bg = document.createElement("div");
        bg.className = "tile-bg";
        Object.assign(bg.style, tileBgStyle(val));
        tile.appendChild(bg);

        if (animateFrom && animateFrom.from === i) {
          tile.classList.add("sliding");
          const dx = (animateFrom.toCol - animateFrom.fromCol) * 100;
          const dy = (animateFrom.toRow - animateFrom.fromRow) * 100;
          tile.style.transform = `translate(${-dx}%, ${-dy}%)`;
          requestAnimationFrame(() => {
            tile.style.transform = "translate(0, 0)";
          });
          tile.addEventListener("transitionend", () => tile.classList.remove("sliding"), { once: true });
        }

        bindTileEvents(tile);
        cell.appendChild(tile);
      }
      boardEl.appendChild(cell);
    }
  }

  function bindTileEvents(tile) {
    tile.addEventListener("pointerdown", onPointerDown);
  }

  function onPointerDown(e) {
    if (locked) return;
    const tile = e.currentTarget;
    const index = Number(tile.dataset.index);
    if (!canMoveTile(index, board, gridSize)) return;

    e.preventDefault();
    tile.setPointerCapture(e.pointerId);

    const empty = emptyIndex(board);
    const from = indexToRC(index, gridSize);
    const to = indexToRC(empty, gridSize);

    dragState = {
      pointerId: e.pointerId,
      tile,
      index,
      empty,
      dirRow: to.row - from.row,
      dirCol: to.col - from.col,
      startX: e.clientX,
      startY: e.clientY,
      cellSize: tile.parentElement.getBoundingClientRect().width,
      moved: false,
    };

    tile.classList.add("dragging");
    SFX.slide();
    tile.addEventListener("pointermove", onPointerMove);
    tile.addEventListener("pointerup", onPointerUp);
    tile.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { tile, dirRow, dirCol, startX, startY, cellSize } = dragState;
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;

    if (dirCol !== 0) dy = 0;
    if (dirRow !== 0) dx = 0;

    const max = cellSize;
    dx = Math.max(-max, Math.min(max, dx));
    dy = Math.max(-max, Math.min(max, dy));

    if (dirCol === 1) dx = Math.max(0, dx);
    if (dirCol === -1) dx = Math.min(0, dx);
    if (dirRow === 1) dy = Math.max(0, dy);
    if (dirRow === -1) dy = Math.min(0, dy);

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.moved = true;
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function cleanupDrag(tile) {
    tile.classList.remove("dragging");
    tile.style.transform = "";
    tile.removeEventListener("pointermove", onPointerMove);
    tile.removeEventListener("pointerup", onPointerUp);
    tile.removeEventListener("pointercancel", onPointerUp);
    dragState = null;
  }

  function commitMove(fromIndex, animate) {
    const empty = emptyIndex(board);
    const from = indexToRC(fromIndex, gridSize);
    const to = indexToRC(empty, gridSize);
    board = moveTile(fromIndex, board);
    moves += 1;
    movesEl.textContent = String(moves);

    if (animate) {
      renderBoard({
        from: empty,
        fromRow: to.row,
        fromCol: to.col,
        toRow: from.row,
        toCol: from.col,
      });
    } else {
      renderBoard();
    }

    if (isSolved(board, gridSize)) {
      onWin();
    } else {
      SFX.snap();
    }
  }

  function onPointerUp(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { tile, index, dirRow, dirCol, startX, startY, cellSize, moved } = dragState;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const along = dirCol !== 0 ? dx * dirCol : dy * dirRow;
    const shouldSnap = along >= cellSize * SNAP_RATIO;

    cleanupDrag(tile);

    if (!moved) {
      commitMove(index, true);
      return;
    }

    if (shouldSnap) {
      commitMove(index, true);
    } else {
      tile.classList.add("sliding");
      tile.style.transform = "translate(0, 0)";
      tile.addEventListener("transitionend", () => tile.classList.remove("sliding"), { once: true });
    }
  }

  function spawnConfetti() {
    if (reducedMotion) return;
    const colors = ["#ffd166", "#5ecf8a", "#6ec6ff", "#ff8fab", "#c9a0ff"];
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("div");
      el.className = "confetti";
      el.style.left = `${20 + Math.random() * 60}%`;
      el.style.top = `${10 + Math.random() * 20}%`;
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = `${Math.random() * 0.3}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1400);
    }
  }

  function onWin() {
    setLocked(true);
    stopTimer();
    maybeSaveBest();
    playCry(speciesId);
    SFX.win();
    spawnConfetti();

    const elapsed = Date.now() - startedAt;
    winImg.src = imageUrl;
    winImg.alt = speciesName;
    winName.textContent = speciesName;
    winStats.textContent = `${moves}번 이동 · ${formatTime(elapsed)}`;
    winOverlay.hidden = false;
    hintEl.textContent = "완성!";

    board = solvedBoard(gridSize);
    renderBoard();
  }

  async function fetchSpecies(id) {
    const res = await fetch(`${POKE_API}/pokemon-species/${id}`);
    if (!res.ok) throw new Error("species fetch failed");
    const data = await res.json();
    const name = pickKoName(data.names) || data.name;
    return { id, name };
  }

  function pickRandomSpecies() {
    const idx = Math.floor(Math.random() * SPECIES_POOL.length);
    return SPECIES_POOL[idx];
  }

  async function loadImage(url, fallback) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(fallback);
      img.src = url;
    });
  }

  async function startRound(options = {}) {
    const { keepSpecies, skipPreview } = options;
    setLocked(true);
    stopTimer();
    winOverlay.hidden = true;
    moves = 0;
    movesEl.textContent = "0";
    timerEl.textContent = "0:00";
    hintEl.textContent = "타일을 빈칸 쪽으로 밀어 맞춰 보세요";

    if (!keepSpecies) speciesId = pickRandomSpecies();

    try {
      const info = await fetchSpecies(speciesId);
      speciesName = info.name;
    } catch (_) {
      speciesName = `#${speciesId}`;
    }

    imageUrl = await loadImage(artUrl(speciesId), fallbackUrl(speciesId));
    minimapImg.src = imageUrl;
    minimapImg.alt = speciesName;
    loadBestDisplay();

    if (!skipPreview) {
      previewImg.src = imageUrl;
      previewImg.alt = speciesName;
      previewName.textContent = speciesName;
      previewOverlay.hidden = false;

      let left = PREVIEW_MS / 1000;
      previewSec.textContent = String(left);
      await new Promise((resolve) => {
        const tick = setInterval(() => {
          left -= 1;
          previewSec.textContent = String(Math.max(left, 0));
          if (left <= 0) {
            clearInterval(tick);
            previewOverlay.hidden = true;
            resolve();
          }
        }, 1000);
      });
    } else {
      previewOverlay.hidden = true;
    }

    board = shuffleBoard(gridSize, Math.random);
    renderBoard();
    setLocked(false);
    startTimer();
    SFX.shuffle();
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    SFX.syncBgm();
  });

  btnNew.addEventListener("click", () => {
    SFX.click();
    startRound({});
  });

  btnReplay.addEventListener("click", () => {
    SFX.click();
    startRound({ keepSpecies: true, skipPreview: true });
  });

  btnNext.addEventListener("click", () => {
    SFX.click();
    startRound({});
  });

  sizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = Number(btn.dataset.size);
      if (next === gridSize) return;
      SFX.click();
      gridSize = next;
      sizeBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.size) === gridSize));
      startRound({ keepSpecies: true, skipPreview: true });
    });
  });

  syncSoundBtn();
  startRound({});
})();
