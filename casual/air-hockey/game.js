(() => {
  "use strict";

  const W = 360, H = 520, GOAL = 5;
  const LS_WINS = "airhockey.wins";
  const LS_SOUND = "airhockey.sound";
  const storage = (() => {
    try { localStorage.setItem("__a", "1"); localStorage.removeItem("__a"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const canvas = document.getElementById("rink");
  const ctx = canvas.getContext("2d");
  const el = {
    ai: document.getElementById("score-ai"),
    me: document.getElementById("score-me"),
    wins: document.getElementById("wins"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
  };

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let wins = Number(storage.getItem(LS_WINS) || 0) || 0;
  let scoreMe = 0, scoreAi = 0, running = true;

  const player = { x: W / 2, y: H - 70, r: 28, px: W / 2, py: H - 70 };
  const ai = { x: W / 2, y: 70, r: 28 };
  const puck = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 14 };

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }

  function resetPuck(dir) {
    puck.x = W / 2; puck.y = H / 2;
    puck.vx = (Math.random() * 2 - 1) * 1.2;
    puck.vy = dir * (2.8 + Math.random());
  }

  function hitPaddle(p) {
    const dx = puck.x - p.x, dy = puck.y - p.y;
    const dist = Math.hypot(dx, dy);
    const min = puck.r + p.r;
    if (dist >= min || dist < 0.001) return;
    const nx = dx / dist, ny = dy / dist;
    puck.x = p.x + nx * min;
    puck.y = p.y + ny * min;
    let pvx = 0, pvy = 0;
    if (p === player) { pvx = (player.x - player.px) * 0.45; pvy = (player.y - player.py) * 0.45; }
    const vdot = (puck.vx - pvx) * nx + (puck.vy - pvy) * ny;
    if (vdot < 0) {
      puck.vx -= 1.85 * vdot * nx;
      puck.vy -= 1.85 * vdot * ny;
    }
    puck.vx += pvx * 0.35;
    puck.vy += pvy * 0.35;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > 12) { puck.vx *= 12 / sp; puck.vy *= 12 / sp; }
    sfx("bounce");
  }

  function goal(who) {
    if (who === "me") scoreMe++; else scoreAi++;
    el.me.textContent = String(scoreMe);
    el.ai.textContent = String(scoreAi);
    sfx(who === "me" ? "success" : "fail");
    if (scoreMe >= GOAL || scoreAi >= GOAL) {
      running = false;
      const win = scoreMe >= GOAL;
      if (win) { wins++; storage.setItem(LS_WINS, String(wins)); sfx("win"); }
      else sfx("lose");
      el.wins.textContent = String(wins);
      el.card.innerHTML = `<h2>${win ? "승리!" : "패배"}</h2><p>${scoreMe} : ${scoreAi}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
      el.overlay.hidden = false;
      document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; startMatch(); };
      return;
    }
    resetPuck(who === "me" ? -1 : 1);
  }

  function update() {
    if (!running) return;
    player.px = player.x; player.py = player.y;

    const targetX = puck.x + puck.vx * 4;
    ai.x += (targetX - ai.x) * 0.12;
    ai.x = Math.max(ai.r + 8, Math.min(W - ai.r - 8, ai.x));
    ai.y = 70 + Math.sin(performance.now() / 400) * 4;

    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= 0.999;
    puck.vy *= 0.999;

    if (puck.x < puck.r) { puck.x = puck.r; puck.vx *= -0.95; sfx("tick"); }
    if (puck.x > W - puck.r) { puck.x = W - puck.r; puck.vx *= -0.95; sfx("tick"); }

    const goalW = 110;
    if (puck.y < puck.r) {
      if (puck.x > W / 2 - goalW / 2 && puck.x < W / 2 + goalW / 2) goal("me");
      else { puck.y = puck.r; puck.vy *= -0.95; }
    }
    if (puck.y > H - puck.r) {
      if (puck.x > W / 2 - goalW / 2 && puck.x < W / 2 + goalW / 2) goal("ai");
      else { puck.y = H - puck.r; puck.vy *= -0.95; }
    }

    hitPaddle(player);
    hitPaddle(ai);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14506c"); g.addColorStop(1, "#0b3144");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 36, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = "rgba(255,207,92,0.35)";
    ctx.fillRect(W / 2 - 55, 0, 110, 8);
    ctx.fillRect(W / 2 - 55, H - 8, 110, 8);

    function paddle(p, color) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    paddle(ai, "#ff8a5b");
    paddle(player, "#4fd8c4");

    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
    ctx.fillStyle = "#eef4f8";
    ctx.fill();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function pointerToLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height),
    };
  }

  function movePlayer(clientX, clientY) {
    if (!running) return;
    const p = pointerToLocal(clientX, clientY);
    player.x = Math.max(player.r + 6, Math.min(W - player.r - 6, p.x));
    player.y = Math.max(H / 2 + player.r, Math.min(H - player.r - 10, p.y));
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    movePlayer(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons || e.pointerType === "touch") movePlayer(e.clientX, e.clientY);
  });

  function startMatch() {
    scoreMe = 0; scoreAi = 0; running = true;
    el.me.textContent = "0"; el.ai.textContent = "0";
    el.wins.textContent = String(wins);
    player.x = W / 2; player.y = H - 70;
    ai.x = W / 2; ai.y = 70;
    resetPuck(Math.random() < 0.5 ? 1 : -1);
  }

  el.btnHelp.onclick = () => { el.help.hidden = false; };
  el.btnHelpClose.onclick = () => { el.help.hidden = true; };
  el.btnSound.onclick = () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSound();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  };

  syncSound();
  startMatch();
  loop();
})();
