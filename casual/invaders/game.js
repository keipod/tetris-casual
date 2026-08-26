(() => {
  "use strict";

  const W = 360, H = 480;
  const LS_BEST = "invaders.best", LS_SOUND = "invaders.sound";
  const storage = (() => {
    try { localStorage.setItem("__i", "1"); localStorage.removeItem("__i"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const el = {
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    wave: document.getElementById("wave"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    left: document.getElementById("btn-left"),
    right: document.getElementById("btn-right"),
    fire: document.getElementById("btn-fire"),
  };

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;
  let score = 0, lives = 3, wave = 1, over = false;
  let ship, aliens, bullets, enemyBullets, dir, moveAcc, shootAcc, keys;
  let lastTs = 0;

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }
  function hud() {
    el.score.textContent = String(score);
    el.lives.textContent = String(lives);
    el.wave.textContent = String(wave);
    el.best.textContent = String(best);
  }

  function spawnWave() {
    aliens = [];
    const cols = 8, rows = Math.min(5, 2 + Math.floor(wave / 2));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        aliens.push({
          x: 28 + c * 38,
          y: 40 + r * 32,
          w: 26, h: 20,
          alive: true,
          hue: (r * 40 + wave * 20) % 360,
        });
      }
    }
    dir = 1;
    moveAcc = 0;
  }

  function start() {
    score = 0; lives = 3; wave = 1; over = false;
    ship = { x: W / 2, y: H - 40, w: 36, h: 16 };
    bullets = []; enemyBullets = [];
    keys = { left: false, right: false };
    shootAcc = 0; moveAcc = 0;
    spawnWave();
    el.overlay.hidden = true;
    hud();
  }

  function gameOver() {
    over = true;
    if (score > best) { best = score; storage.setItem(LS_BEST, String(best)); }
    hud();
    sfx("lose");
    el.card.innerHTML = `<h2>게임 오버</h2><p>점수 ${score} · 웨이브 ${wave}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; start(); };
  }

  function fire() {
    if (over) return;
    if (bullets.length >= 3) return;
    bullets.push({ x: ship.x, y: ship.y - 12, vy: -320 });
    sfx("shoot");
  }

  function update(dt) {
    if (over) return;
    const speed = 220;
    if (keys.left) ship.x -= speed * dt;
    if (keys.right) ship.x += speed * dt;
    ship.x = Math.max(20, Math.min(W - 20, ship.x));

    for (const b of bullets) b.y += b.vy * dt;
    bullets = bullets.filter((b) => b.y > -10);
    for (const b of enemyBullets) b.y += b.vy * dt;
    enemyBullets = enemyBullets.filter((b) => b.y < H + 10);

    const alive = aliens.filter((a) => a.alive);
    const stepEvery = Math.max(0.18, 0.55 - wave * 0.03 - (8 - Math.min(8, alive.length)) * 0.02);
    moveAcc += dt;
    if (moveAcc >= stepEvery) {
      moveAcc = 0;
      let hitEdge = false;
      for (const a of alive) {
        a.x += dir * 10;
        if (a.x < 16 || a.x > W - 16) hitEdge = true;
      }
      if (hitEdge) {
        dir *= -1;
        for (const a of alive) {
          a.x += dir * 10;
          a.y += 14;
          if (a.y + a.h >= ship.y) { gameOver(); return; }
        }
      }
    }

    shootAcc += dt;
    if (shootAcc > Math.max(0.6, 1.4 - wave * 0.08) && alive.length) {
      shootAcc = 0;
      const a = alive[Math.floor(Math.random() * alive.length)];
      enemyBullets.push({ x: a.x, y: a.y + a.h, vy: 160 + wave * 8 });
    }

    for (const b of bullets) {
      for (const a of aliens) {
        if (!a.alive) continue;
        if (Math.abs(b.x - a.x) < a.w / 2 && Math.abs(b.y - a.y) < a.h / 2) {
          a.alive = false;
          b.y = -99;
          score += 10;
          sfx("explode");
          hud();
        }
      }
    }
    bullets = bullets.filter((b) => b.y > -10);

    for (const b of enemyBullets) {
      if (Math.abs(b.x - ship.x) < ship.w / 2 && Math.abs(b.y - ship.y) < ship.h) {
        b.y = H + 99;
        lives -= 1;
        sfx("hit");
        hud();
        if (lives <= 0) gameOver();
      }
    }
    enemyBullets = enemyBullets.filter((b) => b.y < H + 10);

    if (!aliens.some((a) => a.alive)) {
      wave += 1;
      score += 50;
      hud();
      sfx("level");
      spawnWave();
    }
  }

  function draw() {
    ctx.fillStyle = "#050a12";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    for (let i = 0; i < 40; i++) {
      ctx.fillRect((i * 97) % W, (i * 53) % (H - 80), 2, 2);
    }
    for (const a of aliens) {
      if (!a.alive) continue;
      ctx.fillStyle = `hsl(${a.hue} 70% 58%)`;
      ctx.fillRect(a.x - a.w / 2, a.y - a.h / 2, a.w, a.h);
      ctx.fillStyle = "#050a12";
      ctx.fillRect(a.x - 6, a.y - 4, 4, 4);
      ctx.fillRect(a.x + 2, a.y - 4, 4, 4);
    }
    ctx.fillStyle = "#4fd8c4";
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y - ship.h);
    ctx.lineTo(ship.x - ship.w / 2, ship.y + ship.h / 2);
    ctx.lineTo(ship.x + ship.w / 2, ship.y + ship.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffcf5c";
    for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 10);
    ctx.fillStyle = "#ff8a5b";
    for (const b of enemyBullets) ctx.fillRect(b.x - 2, b.y, 4, 10);
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function bindHold(btn, key) {
    const on = () => { keys[key] = true; };
    const off = () => { keys[key] = false; };
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); on(); });
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off);
    btn.addEventListener("pointercancel", off);
  }
  bindHold(el.left, "left");
  bindHold(el.right, "right");
  el.fire.addEventListener("click", fire);

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Space") { e.preventDefault(); fire(); }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!e.buttons && e.pointerType !== "touch") return;
    const rect = canvas.getBoundingClientRect();
    ship.x = ((e.clientX - rect.left) / rect.width) * W;
  });
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    ship.x = ((e.clientX - rect.left) / rect.width) * W;
  });

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
