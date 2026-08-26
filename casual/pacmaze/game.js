(() => {
  "use strict";

  // 1 wall, 0 path with dot, 2 empty path, 3 gate
  const MAP = [
    "1111111111111",
    "1000000000001",
    "1011110111101",
    "1000000000001",
    "1011011101101",
    "1001000001001",
    "1111011101111",
    "2000033300002",
    "1111011101111",
    "1001000001001",
    "1011011101101",
    "1000000000001",
    "1011110111101",
    "1000000000001",
    "1111111111111",
  ];
  const ROWS = MAP.length, COLS = MAP[0].length, TILE = 30;
  const LS_BEST = "pacmaze.best", LS_SOUND = "pacmaze.sound";
  const GHOST_COLORS = ["#ff6b6b", "#4fd8c4", "#ffcf5c", "#c084fc"];

  const storage = (() => {
    try { localStorage.setItem("__p", "1"); localStorage.removeItem("__p"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const canvas = document.getElementById("maze");
  const ctx = canvas.getContext("2d");
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;

  const el = {
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    btnNew: document.getElementById("btn-new"),
  };

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;
  let grid, dotsLeft, score, lives, over, player, ghosts, wantDir, tickAcc;
  let lastTs = 0;

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }

  function cell(c, r) {
    if (r < 0 || r >= ROWS) return 1;
    let cc = c;
    if (cc < 0) cc = COLS - 1;
    if (cc >= COLS) cc = 0;
    return grid[r][cc];
  }

  function walkable(c, r, forGhost) {
    const v = cell(c, r);
    if (v === 1) return false;
    if (v === 3) return !!forGhost;
    return true;
  }

  function buildGrid() {
    grid = MAP.map((row) => row.split("").map(Number));
    dotsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === 0) dotsLeft++;
      }
    }
  }

  function start() {
    buildGrid();
    score = 0; lives = 3; over = false; wantDir = "left"; tickAcc = 0;
    player = { c: 6, r: 11, dir: "left", x: 6, y: 11 };
    ghosts = [
      { c: 5, r: 7, dir: "left", x: 5, y: 7, color: GHOST_COLORS[0] },
      { c: 6, r: 7, dir: "up", x: 6, y: 7, color: GHOST_COLORS[1] },
      { c: 7, r: 7, dir: "right", x: 7, y: 7, color: GHOST_COLORS[2] },
    ];
    el.overlay.hidden = true;
    syncHud();
  }

  function syncHud() {
    el.score.textContent = String(score);
    el.lives.textContent = String(lives);
    el.best.textContent = String(best);
  }

  function end(win) {
    over = true;
    if (score > best) { best = score; storage.setItem(LS_BEST, String(best)); }
    syncHud();
    sfx(win ? "win" : "lose");
    el.card.innerHTML = `<h2>${win ? "클리어!" : "게임 오버"}</h2><p>점수 ${score}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; start(); };
  }

  function tryTurn(ent, dir, forGhost) {
    const [dx, dy] = DIRS[dir];
    const nc = Math.round(ent.x) + dx;
    const nr = Math.round(ent.y) + dy;
    if (!walkable(nc, nr, forGhost)) return false;
    if (Math.abs(ent.x - Math.round(ent.x)) > 0.15 || Math.abs(ent.y - Math.round(ent.y)) > 0.15) return false;
    ent.x = Math.round(ent.x); ent.y = Math.round(ent.y);
    ent.dir = dir;
    return true;
  }

  function moveEnt(ent, speed, forGhost) {
    tryTurn(ent, forGhost ? ent.dir : wantDir, forGhost);
    const [dx, dy] = DIRS[ent.dir];
    const nx = ent.x + dx * speed;
    const ny = ent.y + dy * speed;
    const tc = dx > 0 ? Math.floor(nx + 0.5) : dx < 0 ? Math.ceil(nx - 0.5) : Math.round(nx);
    const tr = dy > 0 ? Math.floor(ny + 0.5) : dy < 0 ? Math.ceil(ny - 0.5) : Math.round(ny);
    if (!walkable(tc, tr, forGhost) && !walkable(Math.round(nx + dx * 0.5), Math.round(ny + dy * 0.5), forGhost)) {
      ent.x = Math.round(ent.x); ent.y = Math.round(ent.y);
      if (forGhost) pickGhostDir(ent);
      return;
    }
    ent.x = nx; ent.y = ny;
    if (ent.x < -0.5) ent.x = COLS - 0.5;
    if (ent.x > COLS - 0.5) ent.x = -0.5;
    ent.c = Math.round(ent.x); ent.r = Math.round(ent.y);
  }

  function pickGhostDir(g) {
    const opts = Object.keys(DIRS).filter((d) => {
      const [dx, dy] = DIRS[d];
      return walkable(Math.round(g.x) + dx, Math.round(g.y) + dy, true);
    });
    if (!opts.length) return;
    let bestD = opts[0], bestS = Infinity;
    for (const d of opts) {
      const [dx, dy] = DIRS[d];
      const dist = Math.hypot(Math.round(g.x) + dx - player.x, Math.round(g.y) + dy - player.y);
      const score = Math.random() < 0.3 ? Math.random() * 10 : dist;
      if (score < bestS) { bestS = score; bestD = d; }
    }
    g.dir = bestD;
  }

  function step(dt) {
    if (over) return;
    moveEnt(player, 4.2 * dt, false);
    const pc = Math.round(player.x), pr = Math.round(player.y);
    if (grid[pr] && grid[pr][pc] === 0) {
      grid[pr][pc] = 2; dotsLeft--; score += 10; syncHud(); sfx("pickup");
      if (dotsLeft <= 0) end(true);
    }
    for (const g of ghosts) {
      if (Math.random() < 0.02) pickGhostDir(g);
      moveEnt(g, 3.2 * dt, true);
      if (Math.hypot(g.x - player.x, g.y - player.y) < 0.55) {
        lives--; syncHud(); sfx("explode");
        if (lives <= 0) { end(false); return; }
        player = { c: 6, r: 11, dir: "left", x: 6, y: 11 };
        wantDir = "left";
        ghosts.forEach((gh, i) => { gh.x = 5 + i; gh.y = 7; gh.c = 5 + i; gh.r = 7; });
        break;
      }
    }
  }

  function draw() {
    ctx.fillStyle = "#050b14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (v === 1) {
          ctx.fillStyle = "#1e4d8c";
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        } else if (v === 0) {
          ctx.fillStyle = "#ffe8a3";
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (v === 3) {
          ctx.fillStyle = "#ff8a5b";
          ctx.fillRect(x + 4, y + TILE / 2 - 2, TILE - 8, 4);
        }
      }
    }
    // player
    const px = player.x * TILE + TILE / 2, py = player.y * TILE + TILE / 2;
    ctx.fillStyle = "#ffcf5c";
    ctx.beginPath();
    ctx.arc(px, py, TILE * 0.38, 0, Math.PI * 2);
    ctx.fill();
    for (const g of ghosts) {
      const gx = g.x * TILE + TILE / 2, gy = g.y * TILE + TILE / 2;
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(gx, gy, TILE * 0.36, Math.PI, 0);
      ctx.lineTo(gx + TILE * 0.36, gy + TILE * 0.36);
      ctx.lineTo(gx - TILE * 0.36, gy + TILE * 0.36);
      ctx.closePath();
      ctx.fill();
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setDir(d) { wantDir = d; tryTurn(player, d, false); }

  document.querySelectorAll(".dpad button").forEach((b) => {
    b.addEventListener("click", () => setDir(b.dataset.dir));
  });
  window.addEventListener("keydown", (e) => {
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
    if (map[e.code]) { e.preventDefault(); setDir(map[e.code]); }
  });

  let sx = 0, sy = 0;
  canvas.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
    else setDir(dy > 0 ? "down" : "up");
  }, { passive: true });

  el.btnNew.onclick = () => { sfx("click"); start(); };
  el.btnHelp.onclick = () => { el.help.hidden = false; };
  el.btnHelpClose.onclick = () => { el.help.hidden = true; };
  el.btnSound.onclick = () => {
    soundOn = !soundOn; storage.setItem(LS_SOUND, soundOn ? "1" : "0"); syncSound();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  };

  syncSound();
  start();
  requestAnimationFrame(loop);
})();
