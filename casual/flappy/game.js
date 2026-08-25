(() => {
  "use strict";

  const LS_BEST = "flappy.best";
  const LS_SOUND = "flappy.sound";

  const W = 360;
  const H = 640;
  const GROUND_H = 84;
  const GROUND_Y = H - GROUND_H;

  const GRAVITY = 1800;
  const FLAP_VY = -520;
  const MAX_FALL = 700;

  const BIRD_X = 100;
  const BIRD_R = 13;

  const PIPE_W = 64;
  const GAP_START = 150;
  const GAP_MIN = 120;
  const GAP_SHRINK_PER_POINT = 0.75;
  const SPEED_START = 130;
  const SPEED_MAX_GAIN = 90;
  const SPEED_RAMP_POINTS = 30;
  const SPAWN_TIME_S = 1.6;

  const STEP = 1 / 120;
  const MAX_FRAME_DT = 0.032;
  const RESTART_GUARD_MS = 400;

  const storage = (() => {
    try {
      localStorage.setItem("__f", "1");
      localStorage.removeItem("__f");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const canvasBox = document.getElementById("canvas-box");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let best = parseInt(storage.getItem(LS_BEST), 10) || 0;

  const SFX = {
    flap() { if (soundOn && window.CasualSfx) window.CasualSfx.play("whoosh", 0.5); },
    score() { if (soundOn && window.CasualSfx) window.CasualSfx.play("pickup", 0.6); },
    die() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["hit", "lose"], 170, 0.8); },
    medal() { if (soundOn && window.CasualSfx) window.CasualSfx.play("fanfare", 0.75); },
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
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

  const STATE = { READY: 0, PLAYING: 1, DYING: 2, GAMEOVER: 3 };
  let state = STATE.READY;
  let paused = false;

  let viewScale = 1;
  let lastTs = 0;
  let acc = 0;
  let tGlobal = 0;

  const bird = { y: H * 0.42, vy: 0, rot: 0, wingPhase: 0, wingBoost: 0 };
  let pipes = [];
  let clouds = [];
  let score = 0;
  let scorePop = 0;
  let flash = 0;
  let distSinceSpawn = 0;
  let groundOffset = 0;
  let hillOffsetNear = 0;
  let hillOffsetFar = 0;
  let goShownAt = 0;
  let landTimer = -1;

  function curSpeed() {
    return SPEED_START + Math.min(score, SPEED_RAMP_POINTS) / SPEED_RAMP_POINTS * SPEED_MAX_GAIN;
  }

  function curGap() {
    return Math.max(GAP_MIN, GAP_START - score * GAP_SHRINK_PER_POINT);
  }

  function spawnSpacing() {
    return curSpeed() * SPAWN_TIME_S;
  }

  function makeClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * 220,
        s: 0.6 + Math.random() * 0.8,
        v: 6 + Math.random() * 10,
      });
    }
  }

  function resetRun() {
    bird.y = H * 0.42;
    bird.vy = 0;
    bird.rot = 0;
    bird.wingPhase = 0;
    bird.wingBoost = 0;
    pipes = [];
    score = 0;
    scorePop = 0;
    flash = 0;
    landTimer = -1;
    distSinceSpawn = spawnSpacing() - 240;
  }

  function flap() {
    bird.vy = FLAP_VY;
    bird.wingBoost = 0.22;
    SFX.flap();
  }

  function startPlay() {
    state = STATE.PLAYING;
    flap();
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitsPipe() {
    for (const p of pipes) {
      if (BIRD_X + BIRD_R < p.x || BIRD_X - BIRD_R > p.x + PIPE_W) continue;
      if (circleRect(BIRD_X, bird.y, BIRD_R, p.x, 0, PIPE_W, p.gapTop)) return true;
      const botY = p.gapTop + p.gap;
      if (circleRect(BIRD_X, bird.y, BIRD_R, p.x, botY, PIPE_W, GROUND_Y - botY)) return true;
    }
    return false;
  }

  function die() {
    if (state !== STATE.PLAYING) return;
    state = STATE.DYING;
    flash = 1;
    SFX.die();
  }

  function medalFor(s) {
    if (s >= 100) return "💎";
    if (s >= 50) return "🥇";
    if (s >= 25) return "🥈";
    if (s >= 10) return "🥉";
    return null;
  }

  function showGameOver() {
    if (state !== STATE.DYING) return;
    state = STATE.GAMEOVER;
    const isNew = score > best;
    if (isNew) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    const medal = medalFor(score);
    if (medal) SFX.medal();
    overlayCard.innerHTML = `
      <h2>게임 오버</h2>
      <div class="medal-slot ${medal ? "earned" : ""}">${medal || '<span class="medal-none">10점 이상이면<br>메달 획득!</span>'}</div>
      <div class="result-row">
        <div class="result-item"><span class="result-num">${score}</span><span class="result-label">점수</span></div>
        <div class="result-item"><span class="result-num">${best}${isNew ? '<em class="new-badge">NEW!</em>' : ""}</span><span class="result-label">최고</span></div>
      </div>
      <button type="button" class="retry" id="btn-retry">재시작</button>
    `;
    overlay.hidden = false;
    requestAnimationFrame(() => overlayCard.classList.add("show"));
    document.getElementById("btn-retry").addEventListener("click", (e) => {
      e.stopPropagation();
      SFX.click();
      restart();
    });
    goShownAt = performance.now();
  }

  function restart() {
    if (state !== STATE.GAMEOVER) return;
    overlayCard.classList.remove("show");
    overlay.hidden = true;
    resetRun();
    state = STATE.READY;
  }

  function setPaused(p) {
    if (p === paused) return;
    if (p && state !== STATE.PLAYING) return;
    paused = p;
    btnPause.classList.toggle("paused", paused);
    btnPause.setAttribute("aria-label", paused ? "계속하기" : "일시정지");
  }

  function primaryAction() {
    if (!helpOverlay.hidden || paused) return;
    if (state === STATE.READY) startPlay();
    else if (state === STATE.PLAYING) flap();
    else if (state === STATE.GAMEOVER && performance.now() - goShownAt > RESTART_GUARD_MS) restart();
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    primaryAction();
  });

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    primaryAction();
  });

  btnPause.addEventListener("pointerdown", (e) => e.stopPropagation());
  btnPause.addEventListener("click", () => {
    SFX.click();
    setPaused(!paused);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!helpOverlay.hidden) closeHelp();
      return;
    }
    if (!helpOverlay.hidden) return;
    if (e.code === "Space" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.repeat) return;
      primaryAction();
    } else if (e.code === "KeyP") {
      setPaused(!paused);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) setPaused(true);
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

  function resize() {
    const rect = canvasBox.getBoundingClientRect();
    const availW = Math.max(60, rect.width);
    const availH = Math.max(120, rect.height);
    const s = Math.min(availW / W, availH / H);
    const cssW = Math.floor(W * s);
    const cssH = Math.floor(H * s);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    viewScale = canvas.width / W;
  }

  window.addEventListener("resize", resize);

  function update(step) {
    tGlobal += step;
    flash = Math.max(0, flash - step * 2.6);
    scorePop = Math.max(0, scorePop - step * 4);

    const bgAlive = state === STATE.READY || state === STATE.PLAYING;
    if (bgAlive) {
      const spd = state === STATE.PLAYING ? curSpeed() : SPEED_START * 0.4;
      groundOffset = (groundOffset + spd * step) % 24;
      hillOffsetFar += spd * 0.18 * step;
      hillOffsetNear += spd * 0.38 * step;
      for (const c of clouds) {
        c.x -= c.v * step;
        if (c.x < -70 * c.s) {
          c.x = W + 40;
          c.y = 40 + Math.random() * 220;
          c.s = 0.6 + Math.random() * 0.8;
        }
      }
    }

    if (bird.wingBoost > 0) bird.wingBoost -= step;
    const wingSpeed = state === STATE.DYING ? 0 : bird.wingBoost > 0 ? 34 : state === STATE.PLAYING ? 13 : 7;
    bird.wingPhase += wingSpeed * step;

    if (state === STATE.READY) {
      bird.y = H * 0.42 + Math.sin(tGlobal * 3.1) * 7;
      bird.rot = Math.sin(tGlobal * 3.1 + 0.6) * 5 * Math.PI / 180;
    } else if (state === STATE.PLAYING) {
      bird.vy = Math.min(bird.vy + GRAVITY * step, MAX_FALL);
      bird.y += bird.vy * step;
      if (bird.y < BIRD_R + 1) {
        bird.y = BIRD_R + 1;
        if (bird.vy < 0) bird.vy = 0;
      }
      const targetRot = bird.vy < 0
        ? -24 * Math.PI / 180
        : Math.min(88 * Math.PI / 180, (-24 + (bird.vy / MAX_FALL) * 130) * Math.PI / 180);
      bird.rot += (targetRot - bird.rot) * Math.min(1, step * 11);

      distSinceSpawn += curSpeed() * step;
      if (distSinceSpawn >= spawnSpacing()) {
        distSinceSpawn -= spawnSpacing();
        const gap = curGap();
        const margin = 56;
        const minTop = margin;
        const maxTop = GROUND_Y - gap - margin;
        const prev = pipes.length ? pipes[pipes.length - 1] : null;
        let gapTop = minTop + Math.random() * (maxTop - minTop);
        if (prev) {
          gapTop = Math.max(prev.gapTop - 170, Math.min(prev.gapTop + 170, gapTop));
          gapTop = Math.max(minTop, Math.min(maxTop, gapTop));
        }
        pipes.push({ x: W + 10, gapTop, gap, passed: false });
      }
      const spd = curSpeed();
      for (const p of pipes) p.x -= spd * step;
      while (pipes.length && pipes[0].x < -PIPE_W - 12) pipes.shift();

      for (const p of pipes) {
        if (!p.passed && BIRD_X > p.x + PIPE_W) {
          p.passed = true;
          score += 1;
          scorePop = 1;
          SFX.score();
        }
      }

      if (bird.y + BIRD_R >= GROUND_Y) {
        bird.y = GROUND_Y - BIRD_R;
        die();
      } else if (hitsPipe()) {
        die();
      }
    } else if (state === STATE.DYING) {
      bird.vy = Math.min(bird.vy + GRAVITY * step, MAX_FALL);
      bird.y += bird.vy * step;
      bird.rot += (90 * Math.PI / 180 - bird.rot) * Math.min(1, step * 9);
      if (bird.y + BIRD_R >= GROUND_Y) {
        bird.y = GROUND_Y - BIRD_R;
        if (landTimer < 0) landTimer = 0.32;
      }
      if (landTimer > 0) {
        landTimer -= step;
        if (landTimer <= 0) showGameOver();
      }
    }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#5fa8d3");
    g.addColorStop(0.45, "#8fc9dd");
    g.addColorStop(0.78, "#ffd98e");
    g.addColorStop(1, "#ffb37a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y);

    const sunY = 118;
    const sg = ctx.createRadialGradient(W - 74, sunY, 6, W - 74, sunY, 64);
    sg.addColorStop(0, "rgba(255,244,214,0.95)");
    sg.addColorStop(0.35, "rgba(255,220,140,0.55)");
    sg.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(W - 148, sunY - 74, 148, 148);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(W - 74, sunY, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloud(c) {
    const x = c.x;
    const y = c.y;
    const s = c.s;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 18 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(x + 40 * s, y, 15 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 12 * s, y + 4 * s, 62 * s, 14 * s);
  }

  function drawHills(offset, baseY, amp, wavelength, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 8) {
      const y = baseY - amp * (0.6 + 0.4 * Math.sin((x + offset) / wavelength)) - amp * 0.5 * Math.sin((x + offset * 1.7) / (wavelength * 0.53));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = "#e8c17a";
    ctx.fillRect(0, GROUND_Y, W, GROUND_H);
    ctx.fillStyle = "#d9a95f";
    for (let x = -24 - groundOffset; x < W + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 26);
      ctx.lineTo(x + 10, GROUND_Y + 26);
      ctx.lineTo(x + 2, GROUND_H + GROUND_Y);
      ctx.lineTo(x - 8, GROUND_H + GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#79c257";
    ctx.fillRect(0, GROUND_Y, W, 16);
    ctx.fillStyle = "#5da33f";
    for (let x = -groundOffset; x < W + 12; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 16);
      ctx.lineTo(x + 6, GROUND_Y + 4);
      ctx.lineTo(x + 12, GROUND_Y + 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(0, GROUND_Y + 16, W, 3);
  }

  function drawPipes() {
    for (const p of pipes) {
      const botY = p.gapTop + p.gap;
      drawPipeBody(p.x, 0, p.gapTop, true);
      drawPipeBody(p.x, botY, GROUND_Y - botY, false);
    }
  }

  function drawPipeBody(x, y, h, isTop) {
    if (h <= 0) return;
    const capH = Math.min(26, h);
    const bodyY = isTop ? y : y + capH;
    const bodyH = h - capH;
    const capY = isTop ? y + h - capH : y;

    const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    g.addColorStop(0, "#4ea344");
    g.addColorStop(0.28, "#7ed36a");
    g.addColorStop(0.62, "#5fbf4a");
    g.addColorStop(1, "#3d8f33");

    ctx.fillStyle = g;
    ctx.fillRect(x + 3, bodyY, PIPE_W - 6, bodyH);
    ctx.fillRect(x - 2, capY, PIPE_W + 4, capH);

    ctx.strokeStyle = "#2e6b27";
    ctx.lineWidth = 2;
    if (bodyH > 2) ctx.strokeRect(x + 2.5, bodyY + (isTop ? 1 : -1), PIPE_W - 5, bodyH);
    ctx.strokeRect(x - 1, capY + 1, PIPE_W + 2, capH - 2);

    ctx.fillStyle = "rgba(255,255,255,0.32)";
    if (bodyH > 10) ctx.fillRect(x + 11, bodyY + 4, 6, bodyH - 8);
    ctx.fillRect(x + 4, capY + 4, 5, capH - 8);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#7a5a12";

    ctx.fillStyle = "#ffd93b";
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fff1b8";
    ctx.beginPath();
    ctx.arc(-1, 5, 8, 0, Math.PI);
    ctx.fill();

    const wingAngles = [-0.7, 0.05, 0.65];
    const frame = Math.floor(bird.wingPhase) % 3;
    ctx.save();
    ctx.translate(-3, 1);
    ctx.rotate(wingAngles[frame]);
    ctx.fillStyle = "#f5b73d";
    ctx.beginPath();
    ctx.ellipse(-4, 0, 8.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(6, -4.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a5a12";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(7.4, -4.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8.1, -5.3, 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff8c42";
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(20, 1.5);
    ctx.lineTo(11, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c25e1d";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,138,107,0.55)";
    ctx.beginPath();
    ctx.arc(2.5, 2.5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function outlinedText(text, x, y, size, fill, stroke, align) {
    ctx.font = `${size}px "Do Hyeon", "Noto Sans KR", sans-serif`;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawHud() {
    if (state === STATE.PLAYING || state === STATE.DYING) {
      const size = 46 * (1 + 0.32 * scorePop);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      outlinedText(String(score), W / 2, 86, size, "#ffffff", "#3a2c14");
      ctx.restore();
    }

    if (state === STATE.READY) {
      const pulse = 0.55 + 0.45 * Math.sin(tGlobal * 4.2);
      const bob = Math.sin(tGlobal * 4.2) * 4;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffffff";
      const ax = BIRD_X;
      const ay = bird.y - 44 + bob;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 12);
      ctx.lineTo(ax + 10, ay + 2);
      ctx.lineTo(ax + 4, ay + 2);
      ctx.lineTo(ax + 4, ay + 12);
      ctx.lineTo(ax - 4, ay + 12);
      ctx.lineTo(ax - 4, ay + 2);
      ctx.lineTo(ax - 10, ay + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(58,44,20,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      outlinedText("탭하여 시작", W / 2, H * 0.58, 24, "#ffffff", "#3a2c14");
      outlinedText(`최고 ${best}`, W / 2, H * 0.58 + 34, 15, "#ffe9b8", "rgba(58,44,20,0.7)");
    }

    if (paused) {
      ctx.fillStyle = "rgba(6,12,20,0.55)";
      ctx.fillRect(0, 0, W, H);
      outlinedText("일시정지", W / 2, H * 0.44, 30, "#ffcf5c", "#3a2c14");
      outlinedText("⏸ 버튼을 눌러 계속하기", W / 2, H * 0.44 + 36, 14, "#eef4f8", "rgba(58,44,20,0.7)");
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.85})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    drawSky();
    for (const c of clouds) drawCloud(c);
    drawHills(hillOffsetFar, GROUND_Y - 52, 34, 90, "rgba(126,168,178,0.75)");
    drawHills(hillOffsetNear, GROUND_Y - 22, 26, 64, "rgba(96,146,124,0.9)");
    drawPipes();
    drawGround();
    drawBird();
    drawHud();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = now;
    let dt = (now - lastTs) / 1000;
    lastTs = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    }
    render();
  }

  makeClouds();
  resetRun();
  resize();
  requestAnimationFrame(frame);
})();
