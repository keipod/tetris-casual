(function () {
  "use strict";

  var SIZE = 4;
  var GAP = 8;
  var LS_BEST = "merge_best_v1";
  var LS_SOUND = "merge_sound_v1";

  var ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  var SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

  var SPECIES = {
    1: { nameKo: "이상해씨", line: "a", stage: 1, next: 2, value: 2 },
    2: { nameKo: "이상해풀", line: "a", stage: 2, next: 3, value: 4 },
    3: { nameKo: "이상해꽃", line: "a", stage: 3, next: null, value: 8 },
    4: { nameKo: "파이리", line: "b", stage: 1, next: 5, value: 2 },
    5: { nameKo: "리자드", line: "b", stage: 2, next: 6, value: 4 },
    6: { nameKo: "리자몽", line: "b", stage: 3, next: null, value: 8 },
    7: { nameKo: "꼬부기", line: "c", stage: 1, next: 8, value: 2 },
    8: { nameKo: "어니부기", line: "c", stage: 2, next: 9, value: 4 },
    9: { nameKo: "거북왕", line: "c", stage: 3, next: null, value: 8 },
    172: { nameKo: "피츄", line: "d", stage: 1, next: 25, value: 3 },
    25: { nameKo: "피카츄", line: "d", stage: 2, next: null, value: 10 },
  };

  var SPAWN_BASIC = [
    { dex: 1, w: 30 },
    { dex: 4, w: 30 },
    { dex: 7, w: 30 },
    { dex: 172, w: 10 },
  ];
  var SPAWN_BONUS = [2, 5, 8];
  var BONUS_CHANCE = 0.1;

  var VECTORS = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 },
  };

  var KEY_MAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  var storage = (function () {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: function () { return null; }, setItem: function () {} };
    }
  })();

  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var boardBg = document.getElementById("board-bg");
  var tileLayer = document.getElementById("tile-layer");
  var boardWrap = document.querySelector(".board-wrap");
  var evoToast = document.getElementById("evo-toast");
  var btnSound = document.getElementById("btn-sound");
  var btnHelp = document.getElementById("btn-help");
  var btnHelpClose = document.getElementById("btn-help-close");
  var btnNew = document.getElementById("btn-new");
  var btnRetry = document.getElementById("btn-retry");
  var helpOverlay = document.getElementById("help-overlay");
  var gameoverOverlay = document.getElementById("gameover-overlay");
  var finalScoreEl = document.getElementById("final-score");
  var finalBestEl = document.getElementById("final-best");

  var grid = [];
  var elementsById = new Map();
  var nextId = 1;
  var score = 0;
  var best = parseInt(storage.getItem(LS_BEST), 10) || 0;
  var soundOn = storage.getItem(LS_SOUND) !== "0";
  var animating = false;
  var isGameOver = false;
  var toastTimer = null;
  var metrics = { cellSize: 0 };

  function forEachCell(fn) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) fn(r, c);
    }
  }

  function createEmptyGrid() {
    var g = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(null);
      g.push(row);
    }
    return g;
  }

  function withinBounds(pos) {
    return pos.r >= 0 && pos.r < SIZE && pos.c >= 0 && pos.c < SIZE;
  }

  function emptyCells() {
    var cells = [];
    forEachCell(function (r, c) {
      if (!grid[r][c]) cells.push({ r: r, c: c });
    });
    return cells;
  }

  function weightedPick(list) {
    var total = list.reduce(function (s, i) { return s + i.w; }, 0);
    var roll = Math.random() * total;
    for (var i = 0; i < list.length; i++) {
      roll -= list[i].w;
      if (roll <= 0) return list[i].dex;
    }
    return list[list.length - 1].dex;
  }

  function pickSpawnDex() {
    if (Math.random() < BONUS_CHANCE) {
      return SPAWN_BONUS[Math.floor(Math.random() * SPAWN_BONUS.length)];
    }
    return weightedPick(SPAWN_BASIC);
  }

  function spawnTile() {
    var cells = emptyCells();
    if (!cells.length) return null;
    var cell = cells[Math.floor(Math.random() * cells.length)];
    var tile = { id: nextId++, dex: pickSpawnDex(), r: cell.r, c: cell.c, _merged: false };
    grid[cell.r][cell.c] = tile;
    return tile;
  }

  function anyMovesAvailable() {
    if (emptyCells().length > 0) return true;
    var found = false;
    forEachCell(function (r, c) {
      if (found) return;
      var tile = grid[r][c];
      if (!tile) return;
      var species = SPECIES[tile.dex];
      if (species.next == null) return;
      var right = withinBounds({ r: r, c: c + 1 }) ? grid[r][c + 1] : null;
      var down = withinBounds({ r: r + 1, c: c }) ? grid[r + 1][c] : null;
      if ((right && right.dex === tile.dex) || (down && down.dex === tile.dex)) found = true;
    });
    return found;
  }

  function buildTraversals(vector) {
    var rows = [0, 1, 2, 3].slice(0, SIZE);
    var cols = rows.slice();
    if (vector.r === 1) rows.reverse();
    if (vector.c === 1) cols.reverse();
    return { rows: rows, cols: cols };
  }

  function findFarthest(pos, vector) {
    var farthest = pos;
    var next = { r: pos.r + vector.r, c: pos.c + vector.c };
    while (withinBounds(next) && !grid[next.r][next.c]) {
      farthest = next;
      next = { r: farthest.r + vector.r, c: farthest.c + vector.c };
    }
    return { farthest: farthest, next: next };
  }

  function move(dir) {
    var vector = VECTORS[dir];
    var traversals = buildTraversals(vector);
    var moved = false;
    var scoreGain = 0;
    var removedIds = [];
    var mergedNew = [];
    var transit = new Map();

    forEachCell(function (r, c) {
      var t = grid[r][c];
      if (t) t._merged = false;
    });

    traversals.rows.forEach(function (r) {
      traversals.cols.forEach(function (c) {
        var tile = grid[r][c];
        if (!tile) return;
        var found = findFarthest({ r: r, c: c }, vector);
        var farthest = found.farthest;
        var nextPos = found.next;
        var nextTile = withinBounds(nextPos) ? grid[nextPos.r][nextPos.c] : null;
        var species = SPECIES[tile.dex];

        if (nextTile && !nextTile._merged && !tile._merged && nextTile.dex === tile.dex && species.next != null) {
          var mergedDex = species.next;
          var newTile = { id: nextId++, dex: mergedDex, r: nextPos.r, c: nextPos.c, _merged: true };
          transit.set(tile.id, { r: nextPos.r, c: nextPos.c });
          transit.set(nextTile.id, { r: nextPos.r, c: nextPos.c });
          removedIds.push(tile.id, nextTile.id);
          grid[r][c] = null;
          grid[nextPos.r][nextPos.c] = newTile;
          mergedNew.push(newTile);
          scoreGain += SPECIES[mergedDex].value;
          moved = true;
        } else {
          transit.set(tile.id, { r: farthest.r, c: farthest.c });
          if (farthest.r !== r || farthest.c !== c) {
            moved = true;
            grid[farthest.r][farthest.c] = tile;
            grid[r][c] = null;
            tile.r = farthest.r;
            tile.c = farthest.c;
          }
        }
      });
    });

    return { moved: moved, scoreGain: scoreGain, removedIds: removedIds, mergedNew: mergedNew, transit: transit };
  }

  function recomputeMetrics() {
    var rect = tileLayer.getBoundingClientRect();
    metrics.cellSize = (rect.width - GAP * (SIZE - 1)) / SIZE;
  }

  function placeElement(el, r, c) {
    if (!el) return;
    var x = c * (metrics.cellSize + GAP);
    var y = r * (metrics.cellSize + GAP);
    el.style.width = metrics.cellSize + "px";
    el.style.height = metrics.cellSize + "px";
    el.style.transform = "translate(" + x + "px," + y + "px)";
  }

  function repositionAll() {
    forEachCell(function (r, c) {
      var t = grid[r][c];
      if (t) placeElement(elementsById.get(t.id), r, c);
    });
  }

  function buildTileElement(tile) {
    var species = SPECIES[tile.dex];
    var el = document.createElement("div");
    el.className = "tile line-" + species.line + " stage-" + species.stage;
    el.dataset.id = tile.id;
    var img = document.createElement("img");
    img.alt = species.nameKo;
    img.loading = "lazy";
    img.src = ART + "/" + tile.dex + ".png";
    img.onerror = function () {
      img.onerror = null;
      img.src = SPRITE + "/" + tile.dex + ".png";
    };
    var name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = species.nameKo;
    el.appendChild(img);
    el.appendChild(name);
    return el;
  }

  function addTileToDom(tile, extraClass) {
    var el = buildTileElement(tile);
    if (extraClass) el.classList.add(extraClass);
    placeElement(el, tile.r, tile.c);
    tileLayer.appendChild(el);
    elementsById.set(tile.id, el);
    return el;
  }

  function updateScoreDisplay() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    bestEl.textContent = best;
  }

  function sfx(role, vol) {
    if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
  }

  function showToast(text) {
    evoToast.textContent = text;
    evoToast.hidden = false;
    evoToast.classList.remove("hide");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      evoToast.classList.add("hide");
      setTimeout(function () { evoToast.hidden = true; }, 220);
    }, 1400);
  }

  function checkEvolutionToast(mergedNew) {
    var finalTile = null;
    for (var i = 0; i < mergedNew.length; i++) {
      if (SPECIES[mergedNew[i].dex].next == null) { finalTile = mergedNew[i]; break; }
    }
    if (finalTile) {
      showToast(SPECIES[finalTile.dex].nameKo + " 완전 진화! \u2728");
      sfx("fanfare", 0.6);
    } else if (mergedNew.length) {
      sfx("combo", 0.5);
    }
  }

  function attemptMove(dir) {
    if (animating || isGameOver) return;
    var result = move(dir);
    if (!result.moved) return;

    animating = true;
    sfx("slide", 0.35);

    result.transit.forEach(function (pos, id) {
      placeElement(elementsById.get(id), pos.r, pos.c);
    });

    setTimeout(function () { finalizeMove(result); }, 120);
  }

  function finalizeMove(result) {
    result.removedIds.forEach(function (id) {
      var el = elementsById.get(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      elementsById.delete(id);
    });

    result.mergedNew.forEach(function (tile) {
      addTileToDom(tile, "pop");
    });

    score += result.scoreGain;
    checkEvolutionToast(result.mergedNew);

    var spawned = spawnTile();
    if (spawned) addTileToDom(spawned, "spawn");

    updateScoreDisplay();
    animating = false;

    if (!anyMovesAvailable()) triggerGameOver();
  }

  function triggerGameOver() {
    isGameOver = true;
    sfx("gameOver", 0.6);
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    gameoverOverlay.hidden = false;
  }

  function clearBoardDom() {
    elementsById.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    elementsById.clear();
  }

  function newGame() {
    clearBoardDom();
    grid = createEmptyGrid();
    nextId = 1;
    score = 0;
    isGameOver = false;
    animating = false;
    gameoverOverlay.hidden = true;
    recomputeMetrics();

    var t1 = spawnTile();
    var t2 = spawnTile();
    if (t1) addTileToDom(t1, "spawn");
    if (t2) addTileToDom(t2, "spawn");

    updateScoreDisplay();
  }

  function buildBoardBackground() {
    boardBg.style.gridTemplateColumns = "repeat(" + SIZE + ", 1fr)";
    boardBg.style.gridTemplateRows = "repeat(" + SIZE + ", 1fr)";
    boardBg.innerHTML = "";
    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      boardBg.appendChild(cell);
    }
  }

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  btnSound.addEventListener("click", function () {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) window.CasualSfx.unlock();
    }
  });

  btnHelp.addEventListener("click", function () {
    sfx("click", 0.4);
    helpOverlay.hidden = false;
  });
  btnHelpClose.addEventListener("click", function () {
    sfx("click", 0.4);
    helpOverlay.hidden = true;
  });

  btnNew.addEventListener("click", function () {
    sfx("click", 0.4);
    newGame();
  });
  btnRetry.addEventListener("click", function () {
    sfx("click", 0.4);
    newGame();
  });

  Array.prototype.forEach.call(document.querySelectorAll(".dpad-btn"), function (btn) {
    btn.addEventListener("click", function () {
      sfx("tap", 0.4);
      attemptMove(btn.dataset.dir);
    });
  });

  window.addEventListener("keydown", function (e) {
    var dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    attemptMove(dir);
  });

  var pointerTracking = false;
  var startX = 0;
  var startY = 0;
  var THRESHOLD = 24;

  boardWrap.addEventListener("pointerdown", function (e) {
    pointerTracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  boardWrap.addEventListener("pointerup", function (e) {
    if (!pointerTracking) return;
    pointerTracking = false;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    attemptMove(dir);
  });
  boardWrap.addEventListener("pointercancel", function () { pointerTracking = false; });

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      recomputeMetrics();
      repositionAll();
    });
    ro.observe(tileLayer);
  } else {
    window.addEventListener("resize", function () {
      recomputeMetrics();
      repositionAll();
    });
  }

  syncSoundBtn();
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  buildBoardBackground();
  newGame();
})();
