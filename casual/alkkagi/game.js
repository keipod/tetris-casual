(() => {
  "use strict";

  const LS_SOUND = "alkkagi.sound";
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
    aliveCount: document.getElementById("alive-count"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
    helpText: document.getElementById("help-text"),
    boardWrap: document.querySelector(".board-wrap"),
  };

  const ctx = el.board.getContext("2d");
  const fxCtx = el.fx.getContext("2d");

  let view = null;
  let marbles = [];
  let boardR = 220, marbleR = 17, maxSpeed = 950;
  let drag = null;
  let particles = [];
  let playing = null;
  let lastFrame = 0;
  let rafId = 0;

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function scale() { return el.board.width / (boardR * 2 + 60); }
  function toPx(x, y) {
    const k = scale();
    return [el.board.width / 2 + x * k, el.board.height / 2 + y * k];
  }
  function toWorld(px, py) {
    const k = scale();
    return [(px - el.board.width / 2) / k, (py - el.board.height / 2) / k];
  }

  function drawArena() {
    const W = el.board.width;
    ctx.clearRect(0, 0, W, W);
    const [cx, cy] = [W / 2, W / 2];
    const Rk = boardR * scale();

    const spot = ctx.createRadialGradient(cx, cy - Rk * 0.25, Rk * 0.1, cx, cy, Rk * 1.15);
    spot.addColorStop(0, "#5b4433");
    spot.addColorStop(0.7, "#463427");
    spot.addColorStop(1, "#2e2118");
    ctx.beginPath();
    ctx.arc(cx, cy, Rk + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#17110b";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Rk, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = "rgba(255, 235, 200, 0.05)";
    for (let i = 0; i < 26; i++) {
      const y = (i * 97) % W;
      ctx.beginPath();
      ctx.moveTo(cx - Rk, y);
      ctx.bezierCurveTo(cx - Rk * 0.3, y + 4, cx + Rk * 0.3, y - 5, cx + Rk, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 210, 140, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, Rk, 0, Math.PI * 2);
    ctx.stroke();

    if (view && view.phase === "setup") {
      const halfY = view.yourTop ? 0 : 0;
      ctx.fillStyle = view.yourTop ? "rgba(120, 160, 255, 0.07)" : "rgba(255, 130, 100, 0.07)";
      ctx.fillRect(cx - Rk, view.yourTop ? cy - Rk : cy, Rk * 2, Rk);
      void halfY;
    }
  }

  function drawMarble(x, y, owner, alive, spinAngle, ghost) {
    const [px, py] = toPx(x, y);
    const rk = marbleR * scale() * (ghost ? 0.9 : 1);
    ctx.save();
    ctx.globalAlpha = ghost ? 0.45 : alive ? 1 : 0.18;
    ctx.beginPath();
    ctx.arc(px, py + 2.5, rk, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    const grad = ctx.createRadialGradient(px - rk * 0.35, py - rk * 0.4, rk * 0.12, px, py, rk);
    if (owner === view?.order?.[0] || owner === "top") {
      grad.addColorStop(0, "#ffd9cf");
      grad.addColorStop(0.55, "#ff8a70");
      grad.addColorStop(1, "#b23c28");
    } else {
      grad.addColorStop(0, "#d3f0ff");
      grad.addColorStop(0.55, "#6fb7e8");
      grad.addColorStop(1, "#255e91");
    }
    ctx.beginPath();
    ctx.arc(px, py, rk, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, py, rk * 0.72, spinAngle, spinAngle + Math.PI * 0.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px - rk * 0.32, py - rk * 0.38, rk * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.restore();
  }

  function render(now) {
    const dt = now - lastFrame;
    lastFrame = now;
    drawArena();

    if (!marbles.length && view) {
      marbles = view.marbles.map((m) => ({ ...m }));
    }
    stepPlayback(dt);

    let mineAlive = 0, foeAlive = 0;
    for (const m of marbles) {
      drawMarble(m.x, m.y, m.owner, m.alive !== false, m.spin || 0, false);
      if (m.alive !== false) {
        if (isMine(m)) mineAlive++;
        else foeAlive++;
      }
    }
    if (view) {
      el.aliveCount.textContent = `${mineAlive} : ${foeAlive}`;
      void view;
    }

    if (drag && drag.marbleId) {
      const m = marbles.find((x) => x.id === drag.marbleId);
      if (m) {
        const [mx, my] = toWorld(...toPx(m.x, m.y));
        void mx; void my;
        const dxw = drag.curW[0] - m.x;
        const dyw = drag.curW[1] - m.y;
        const len = Math.hypot(dxw, dyw) || 1;
        const power = Math.min(maxSpeed, len * 4.2);
        const ang = Math.atan2(dyw, dxw);
        const [px, py] = toPx(m.x, m.y);
        const ex = px + Math.cos(ang) * (power / maxSpeed) * 110 * scale() * 0.5;
        const ey = py + Math.sin(ang) * (power / maxSpeed) * 110 * scale() * 0.5;
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${(1 - power / maxSpeed) * 110}, 90%, 60%)`;
        ctx.fill();
        ctx.font = '700 13px "Noto Sans KR"';
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(`${Math.round((power / maxSpeed) * 100)}%`, ex, ey - 12);
      }
    }

    fxCtx.clearRect(0, 0, el.fx.width, el.fx.height);
    for (const p of particles) {
      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.fillStyle = p.color;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.globalAlpha = 1;
    stepParticles();

    rafId = requestAnimationFrame(render);
  }

  function isMine(m) {
    return view && ((view.yourTop && m.owner === view.order[0]) ||
                    (!view.yourTop && m.owner === view.order[1]) || false);
  }

  function stepPlayback(dtMs) {
    if (!playing || !playing.frames.length) return;
    playing.t += dtMs;
    while (playing.seg < playing.frames.length - 1 &&
           playing.t >= playing.frames[playing.seg + 1].t) {
      playing.seg++;
    }
    const a = playing.frames[playing.seg];
    const b = playing.frames[Math.min(playing.seg + 1, playing.frames.length - 1)];
    const span = Math.max(1, b.t - a.t);
    const f = Math.min(1, (playing.t - a.t) / span);
    const posById = {};
    for (const rec of b.m) posById[rec[0]] = { x: rec[1], y: rec[2], alive: rec[3] };
    for (const rec of a.m) {
      if (!posById[rec[0]]) continue;
      const pb = posById[rec[0]];
      const m = marbles.find((x) => x.id === rec[0]);
      if (!m) continue;
      m.x = rec[1] + (pb.x - rec[1]) * f;
      m.y = rec[2] + (pb.y - rec[2]) * f;
      const moved = Math.hypot(pb.x - rec[1], pb.y - rec[2]);
      m.spin = (m.spin || 0) + moved * 0.02 * (pb.alive ? 1 : 0);
      m.alive = true;
    }
    for (const fall of playing.falls) {
      if (fall.done) continue;
      if (playing.t >= fall.atMs) {
        fall.done = true;
        const m = marbles.find((x) => x.id === fall.id);
        if (m) { m.alive = false; spawnFallBurst(m.x, m.y); }
        sfx("drop");
        el.boardWrap.classList.remove("shake");
        void el.boardWrap.offsetWidth;
        el.boardWrap.classList.add("shake");
      }
    }
    for (const hit of playing.hits) {
      if (hit.done) continue;
      if (playing.t >= hit.atMs) {
        hit.done = true;
        spawnSparks(hit.wx, hit.wy, hit.power);
        if (hit.power > 0.35) sfx("bigHit");
        else sfx("bounce");
      }
    }
    if (playing.t >= playing.totalMs) {
      playing = null;
      if (view) {
        marbles = view.marbles.map((m) => ({ ...m }));
      }
    }
  }

  function scheduleSim(simEvent) {
    const frames = simEvent.frames
      .filter((fr) => fr.i >= 0)
      .map((fr) => ({ t: fr.i * 33.3, m: fr.m }));
    const lastRaw = simEvent.frames[simEvent.frames.length - 1];
    if (lastRaw && !frames.length) frames.push({ t: 0, m: lastRaw.m });
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].t <= frames[i - 1].t) frames[i].t = frames[i - 1].t + 33.3;
    }
    const durMs = Math.min(5200, (frames[frames.length - 1]?.t || 0) + 120);
    frames.push({ t: durMs, m: lastRaw.m });
    const falls = (simEvent.falls || []).map((f2) => ({
      id: f2.id, atMs: Math.min(durMs - 80, f2.step * 33.3), done: false,
    }));
    const hits = (simEvent.hits || []).map((h) => ({
      x: h.step, wx: h.x, wy: h.y, power: h.power,
      atMs: Math.min(durMs - 80, h.step * 33.3), done: false,
    }));
    playing = { frames, falls, hits, t: 0, seg: 0, totalMs: durMs };
  }

  function spawnSparks(wx, wy, power) {
    const [px, py] = toPx(wx, wy);
    const n = 6 + Math.round(power * 16);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3.4 * (0.4 + power);
      particles.push({
        x: px, y: py,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        r: 1 + Math.random() * 2.2,
        life: 1, decay: 0.03 + Math.random() * 0.04,
        color: ["#ffe9a8", "#fff", "#ffc36b"][i % 3],
      });
    }
  }

  function spawnFallBurst(wx, wy) {
    const [px, py] = toPx(wx, wy);
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = 1.4 + Math.random() * 3;
      particles.push({
        x: px, y: py,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 1,
        r: 1.4 + Math.random() * 2.6,
        life: 1, decay: 0.02,
        color: ["#9fd8ff", "#ffd0c4", "#ffffff"][i % 3],
      });
    }
  }

  function stepParticles() {
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.vx *= 0.98;
      p.life -= p.decay;
    }
  }

  function updateHud() {
    if (!view) return;
    el.resultOverlay.hidden = true;
    if (view.phase === "ended") {
      const iWon = view.winner != null && view.winner === mp.id;
      el.status.textContent = "종료";
      el.resultTitle.textContent = view.winner == null ? "무승부" : iWon ? "승리!" : "패배";
      el.resultSub.textContent = view.winner == null
        ? "동시에 모두 떨어졌어요"
        : iWon ? "상대 알을 모두 판 밖으로!" : "내 알이 모두 떨어졌어요";
      el.resultOverlay.hidden = false;
    } else if (view.phase === "setup") {
      el.status.textContent = view.yourTurn ? "알 배치 · 위쪽 절반을 탭" : "상대 배치 중…";
    } else {
      el.status.textContent = view.yourTurn ? "당신 차례 · 알을 끌어 던지세요" : "상대 차례…";
    }
    el.helpText.textContent = view.phase === "setup"
      ? "자기 진영(위쪽/아래쪽 절반)에 알 4개를 배치하세요"
      : "내 알을 끌어 방향과 힘을 정하고 놓으세요";
  }

  function pickMarble(clientX, clientY) {
    const rect = el.board.getBoundingClientRect();
    const px = (clientX - rect.left) * (el.board.width / rect.width);
    const py = (clientY - rect.top) * (el.board.height / rect.height);
    const [wx, wy] = toWorld(px, py);
    let best = null, bestD = 1e9;
    for (const m of marbles) {
      if (m.alive === false || !isMine(m)) continue;
      const d = Math.hypot(m.x - wx, m.y - wy);
      if (d < marbleR * 1.6 && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  function onDown(e) {
    if (!view || !view.yourTurn || playing) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const m = pickMarble(t.clientX, t.clientY);
    if (!m) return;
    e.preventDefault();
    const rect = el.board.getBoundingClientRect();
    const px = (t.clientX - rect.left) * (el.board.width / rect.width);
    const py = (t.clientY - rect.top) * (el.board.height / rect.height);
    drag = { marbleId: m.id, curW: toWorld(px, py) };
    sfx("mouseDown");
  }

  function onMoveDrag(e) {
    if (!drag) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const rect = el.board.getBoundingClientRect();
    const px = (t.clientX - rect.left) * (el.board.width / rect.width);
    const py = (t.clientY - rect.top) * (el.board.height / rect.height);
    drag.curW = toWorld(px, py);
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag) return;
    const m = marbles.find((x) => x.id === drag.marbleId);
    const dx = drag.curW[0] - m.x;
    const dy = drag.curW[1] - m.y;
    const len = Math.hypot(dx, dy);
    drag = null;
    if (len < 12) return;
    const power = Math.min(maxSpeed, len * 4.2);
    mp.action({
      t: "flick",
      id: m.id,
      vx: (dx / len) * power,
      vy: (-dy / -len) * power,
    });
    void e;
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "place") {
        marbles.push({ id: ev.id, owner: ev.owner, x: ev.x, y: ev.y, alive: true, spin: 0 });
        sfx(ev.owner === (view && view.order[0]) ? "tap" : "pickup");
      } else if (ev.type === "sim") {
        const falls = ev.falls || [];
        const hits = ev.hits || [];
        scheduleSim({ frames: ev.frames, falls, hits });
      } else if (ev.type === "win") {
        if (view) marbles = view.marbles.map((m) => ({ ...m }));
        const iWon = ev.winner != null && ev.winner === mp.id;
        sfx(ev.winner == null ? "success" : iWon ? "win" : "lose");
        updateHud();
      } else if (ev.type === "phase") {
        sfx("level");
      }
    }
  }

  const mp = window.MPClient.create({
    cpuButton: true,
    onState(state) {
      const first = !view;
      view = state;
      boardR = state.boardR;
      marbleR = state.marbleR;
      maxSpeed = state.maxSpeed;
      if (first) {
        marbles = state.marbles.map((m) => ({ ...m, spin: 0 }));
        particles = [];
        lastFrame = performance.now();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(render);
      } else if (!playing) {
        marbles = state.marbles.map((m) => ({ ...m, spin: 0 }));
      }
      updateHud();
    },
    onEvents(events) { handleEvents(events); },
    onLobbyReturn() {
      view = null;
      marbles = [];
      particles = [];
      cancelAnimationFrame(rafId);
      drawArena();
    },
  });

  el.board.addEventListener("mousedown", onDown);
  el.board.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("mousemove", onMoveDrag);
  window.addEventListener("touchmove", onMoveDrag, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();

  drawArena();
})();
