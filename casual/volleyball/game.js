(() => {
  "use strict";

  const WIN_SCORE = 7;
  const DRAG_THRESHOLD = 14;
  const MAX_DRAG = 160;
  const MIN_JUMP = 420;
  const MAX_JUMP = 1080;
  const MAX_VX = 460;
  const GRAVITY_CHAR = 1680;
  const GRAVITY_BALL = 980;
  const LS_SOUND = "vb_sound";
  const YOU_ID = "25";
  const CPU_ID = "7";
  const POKE_CDN = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const POKE_ANIM = `${POKE_CDN}/versions/generation-v/black-white/animated`;
  const POKE_CRY = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreYouEl = document.getElementById("score-you");
  const scoreCpuEl = document.getElementById("score-cpu");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const btnSound = document.getElementById("btn-sound");
  const spriteYou = document.getElementById("sprite-you");
  const spriteCpu = document.getElementById("sprite-cpu");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const storage = (() => {
    try {
      localStorage.setItem("__v", "1");
      localStorage.removeItem("__v");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let W = 0, H = 0;
  let groundY = 0, netX = 0, netTop = 0, netH = 0;
  let charW = 72, charH = 72, ballR = 13;
  let state = "ready";
  let scoreYou = 0, scoreCpu = 0;
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let server = "you";
  let held = true;
  let freezeUntil = 0;
  let lastHit = "";
  let youHitCd = 0, cpuHitCd = 0;
  let cpuServeAt = 0;

  let you = null, cpu = null, ball = null;

  let aiming = false;
  let pointerId = null;
  let dragStartX = 0, dragStartY = 0;
  let dragX = 0, dragY = 0;
  let hasDragged = false;

  const youIdle = "assets/you-idle.png";
  const youJump = "assets/you-jump.png";
  const cpuIdle = "assets/cpu-idle.png";
  const cpuJump = "assets/cpu-jump.png";
  const youIdleFb = `${POKE_ANIM}/${YOU_ID}.gif`;
  const youJumpFb = `${POKE_CDN}/back/${YOU_ID}.png`;
  const cpuIdleFb = `${POKE_ANIM}/${CPU_ID}.gif`;
  const cpuJumpFb = `${POKE_CDN}/back/${CPU_ID}.png`;
  const ballImg = new Image();
  ballImg.src = "assets/ball.png";

  spriteYou.addEventListener("error", () => {
    if (spriteYou.src.includes("you-jump")) spriteYou.src = youJumpFb;
    else if (!spriteYou.src.includes("back/")) spriteYou.src = youIdleFb;
  });
  spriteCpu.addEventListener("error", () => {
    if (spriteCpu.src.includes("cpu-jump")) spriteCpu.src = cpuJumpFb;
    else if (!spriteCpu.src.includes("back/")) spriteCpu.src = cpuIdleFb;
  });

  function jumpFromDist(dist) {
    if (dist <= DRAG_THRESHOLD) return MIN_JUMP * 0.18;
    const t = Math.min(1, (dist - DRAG_THRESHOLD) / (MAX_DRAG - DRAG_THRESHOLD));
    return MIN_JUMP + t * (MAX_JUMP - MIN_JUMP);
  }

  function vxFromDx(dx, dist) {
    if (dist <= DRAG_THRESHOLD) return 0;
    const t = Math.min(1, dist / MAX_DRAG);
    return Math.max(-MAX_VX, Math.min(MAX_VX, dx * 3.2 * (0.45 + 0.55 * t)));
  }

  const SFX = (() => {
    const clips = {};
    const bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.28;
    bgm.preload = "auto";
    ["hit", "jump", "point", "win", "lose"].forEach((name) => {
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
        node.volume = name === "hit" ? 0.85 : 0.7;
        const p = node.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    };
    const tone = (freq, dur, type = "sine", vol = 0.1) => {
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
    return {
      init,
      syncBgm,
      pop() { if (!soundOn) return; if (!playClip("hit")) tone(520, 0.08, "triangle", 0.07); },
      jump() { if (!soundOn) return; if (!playClip("jump")) tone(640, 0.07, "triangle", 0.06); },
      point() { if (!soundOn) return; if (!playClip("point")) { tone(392, 0.12, "sine", 0.08); tone(523, 0.18, "sine", 0.07); } },
      win() { if (!soundOn) return; if (!playClip("win")) { tone(523, 0.12); tone(659, 0.14); tone(784, 0.22); } },
      lose() { if (!soundOn) return; if (!playClip("lose")) tone(196, 0.28, "sine", 0.08); },
      cry() { if (!soundOn) return; if (!playClip("hit")) tone(880, 0.06, "square", 0.05); },
    };
  })();

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
    SFX.syncBgm();
  }

  function pointerToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function showOverlay(title, sub, btnText, onClick) {
    overlayCard.innerHTML = `
      <h2>${title}</h2>
      <p>${sub}</p>
      <button class="btn" type="button">${btnText}</button>`;
    overlay.classList.remove("hidden");
    overlayCard.querySelector(".btn").addEventListener("click", onClick, { once: true });
  }

  function makeChar(side) {
    const x = side === "you" ? W * 0.22 : W * 0.78;
    return { side, x, y: groundY, vx: 0, vy: 0, grounded: true };
  }

  function resetRally(keepScore) {
    if (!keepScore) {
      scoreYou = 0;
      scoreCpu = 0;
      scoreYouEl.textContent = "0";
      scoreCpuEl.textContent = "0";
    }
    you = makeChar("you");
    cpu = makeChar("cpu");
    held = true;
    lastHit = "";
    youHitCd = 0;
    cpuHitCd = 0;
    freezeUntil = 0;
    placeServeBall();
    spriteYou.src = youIdle;
    spriteCpu.src = cpuIdle;
  }

  function placeServeBall() {
    const s = server === "you" ? you : cpu;
    const dir = server === "you" ? 1 : -1;
    ball = {
      x: s.x + dir * charW * 0.28,
      y: s.y - charH * 0.62,
      vx: 0,
      vy: 0,
    };
    held = true;
    if (server === "cpu") cpuServeAt = performance.now() + 520;
    else cpuServeAt = 0;
  }

  function startMatch() {
    SFX.init();
    SFX.syncBgm();
    state = "playing";
    server = "you";
    resetRally(false);
    overlay.classList.add("hidden");
  }

  function endMatch() {
    const youWin = scoreYou >= WIN_SCORE;
    state = "over";
    if (youWin) SFX.win();
    else SFX.lose();
    showOverlay(
      youWin ? "승리" : "패배",
      `${scoreYou} : ${scoreCpu}`,
      "다시 하기",
      startMatch,
    );
  }

  function scorePoint(to) {
    if (state !== "playing" || freezeUntil) return;
    if (to === "you") {
      scoreYou += 1;
      scoreYouEl.textContent = String(scoreYou);
      server = "you";
    } else {
      scoreCpu += 1;
      scoreCpuEl.textContent = String(scoreCpu);
      server = "cpu";
    }
    SFX.point();
    if (scoreYou >= WIN_SCORE || scoreCpu >= WIN_SCORE) {
      endMatch();
      return;
    }
    freezeUntil = performance.now() + 700;
  }

  function applyJump(ch, dist, dx) {
    if (!ch.grounded) return false;
    ch.vy = -jumpFromDist(dist);
    ch.vx = vxFromDx(dx, dist);
    ch.grounded = false;
    if (ch.side === "you") spriteYou.src = youJump;
    else spriteCpu.src = cpuJump;
    if (ch.side === "you") SFX.jump();
    return true;
  }

  function launchServe(ch, dist, dx) {
    if (!held || (server === "you" ? ch !== you : ch !== cpu)) return;
    if (dist <= DRAG_THRESHOLD) return;
    held = false;
    const dir = ch.side === "you" ? 1 : -1;
    const t = Math.min(1, (dist - DRAG_THRESHOLD) / (MAX_DRAG - DRAG_THRESHOLD));
    ball.vx = dir * (220 + t * 340) + vxFromDx(dx, dist) * 0.25;
    ball.vy = -380 - t * 280;
    lastHit = ch.side;
    SFX.cry();
  }

  function tryHit(ch) {
    const cd = ch.side === "you" ? youHitCd : cpuHitCd;
    if (cd > 0 || held) return;
    const hx = ch.x;
    const hy = ch.y - charH * (ch.grounded ? 0.42 : 0.58);
    const hr = charW * (ch.grounded ? 0.32 : 0.42);
    const dx = ball.x - hx;
    const dy = ball.y - hy;
    if (dx * dx + dy * dy > (hr + ballR) * (hr + ballR)) return;

    const dir = ch.side === "you" ? 1 : -1;
    const air = !ch.grounded;
    const spike = air && ch.vy > 40 && ball.y < ch.y - charH * 0.25;
    if (air) {
      ball.vx = dir * (320 + Math.abs(ch.vx) * 0.35) + dx * 2.4;
      ball.vy = spike ? 90 + ch.vy * 0.15 : -520 - Math.max(0, -ch.vy) * 0.2;
    } else {
      ball.vx = dir * 180 + dx * 1.6;
      ball.vy = -360;
    }
    const maxSpd = 780;
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > maxSpd) {
      ball.vx *= maxSpd / spd;
      ball.vy *= maxSpd / spd;
    }
    lastHit = ch.side;
    SFX.cry();
    if (ch.side === "you") youHitCd = 0.22;
    else cpuHitCd = 0.22;
  }

  function updateChar(ch, dt) {
    ch.vy += GRAVITY_CHAR * dt;
    ch.x += ch.vx * dt;
    ch.y += ch.vy * dt;
    const left = ch.side === "you" ? charW * 0.35 : netX + charW * 0.38;
    const right = ch.side === "you" ? netX - charW * 0.38 : W - charW * 0.35;
    ch.x = Math.max(left, Math.min(right, ch.x));
    if (ch.y >= groundY) {
      ch.y = groundY;
      ch.vy = 0;
      ch.vx *= Math.pow(0.08, dt * 4);
      if (Math.abs(ch.vx) < 12) ch.vx = 0;
      if (!ch.grounded) {
        ch.grounded = true;
        if (ch.side === "you") spriteYou.src = youIdle;
        else spriteCpu.src = cpuIdle;
      }
    } else {
      ch.grounded = false;
    }
  }

  function predictBallX(ahead) {
    return ball.x + ball.vx * ahead;
  }

  function updateCpu(now, dt) {
    if (held && server === "cpu" && now >= cpuServeAt && cpu.grounded) {
      const dist = 70 + Math.random() * 28;
      const dx = -28 - Math.random() * 24;
      applyJump(cpu, dist, dx);
      launchServe(cpu, dist, dx);
      return;
    }
    if (held) return;

    const courtL = netX + 24;
    const courtR = W - 28;
    let target = Math.max(courtL, Math.min(courtR, predictBallX(0.28)));
    if (ball.x < netX && ball.vx <= 0) target = W * 0.72;
    const gap = target - cpu.x;
    if (cpu.grounded) {
      cpu.vx = Math.abs(gap) > 10 ? Math.max(-260, Math.min(260, gap * 3.1)) : 0;
    } else {
      cpu.vx += Math.sign(gap) * 80 * dt;
    }

    const inCourt = ball.x > netX - 30;
    const reach = Math.hypot(ball.x - cpu.x, ball.y - (cpu.y - charH * 0.5));
    const shouldJump = cpu.grounded && inCourt && ball.vy > 20 && reach < 130 && ball.y > netTop + 10;
    if (shouldJump) {
      const dist = 70 + Math.min(90, (groundY - ball.y) * 0.35);
      applyJump(cpu, dist, Math.max(-80, Math.min(40, ball.x - cpu.x)));
    }
  }

  function updateBall(dt) {
    if (held) {
      const s = server === "you" ? you : cpu;
      const dir = server === "you" ? 1 : -1;
      ball.x = s.x + dir * charW * 0.28;
      ball.y = s.y - charH * 0.62;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    ball.vy += GRAVITY_BALL * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - ballR < 8) {
      ball.y = 8 + ballR;
      ball.vy = Math.abs(ball.vy) * 0.55;
    }

    const netHalf = 5;
    if (ball.y + ballR > netTop && Math.abs(ball.x - netX) < netHalf + ballR) {
      if (ball.y < netTop + 10 && ball.vy > 0) {
        ball.y = netTop - ballR;
        ball.vy = -Math.abs(ball.vy) * 0.45;
      } else {
        ball.x = ball.x < netX ? netX - netHalf - ballR : netX + netHalf + ballR;
        ball.vx = -ball.vx * 0.72;
      }
    }

    if (ball.y + ballR >= groundY) {
      scorePoint(ball.x < netX ? "cpu" : "you");
      return;
    }
    if (ball.x + ballR < 0 || ball.x - ballR > W) {
      scorePoint(ball.x < netX ? "cpu" : "you");
    }
  }

  function placeSprite(el, ch, flip) {
    const size = charW;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.left = (ch.x - size / 2) + "px";
    el.style.top = (ch.y - size) + "px";
    const squish = ch.grounded ? 1 : 0.94;
    el.style.transform = `${flip ? "scaleX(-1) " : ""}scale(${squish}, ${2 - squish})`;
  }

  function drawCourt() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, groundY);
    ctx.lineTo(W - 18, groundY);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(netX - 1, groundY - 4, 2, 4);

    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(netX - 4, netTop, 8, netH);
    ctx.strokeStyle = "rgba(80,90,70,0.35)";
    ctx.lineWidth = 1;
    for (let y = netTop + 8; y < groundY; y += 10) {
      ctx.beginPath();
      ctx.moveTo(netX - 4, y);
      ctx.lineTo(netX + 4, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#d96b4a";
    ctx.fillRect(netX - 5, netTop - 6, 10, 8);
  }

  function drawBall() {
    const size = ballR * 2.2;
    if (ballImg.complete && ballImg.naturalWidth) {
      ctx.drawImage(ballImg, ball.x - size / 2, ball.y - size / 2, size, size);
      return;
    }
    const g = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 3, ball.x, ball.y, ballR);
    g.addColorStop(0, "#fff8ee");
    g.addColorStop(0.45, "#f3c14a");
    g.addColorStop(1, "#d68a28");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAim() {
    if (!aiming || !you.grounded) return;
    const dx = dragX - dragStartX;
    const dist = Math.hypot(dx, dragY - dragStartY);
    const power = Math.min(1, Math.max(0, (dist - DRAG_THRESHOLD) / (MAX_DRAG - DRAG_THRESHOLD)));
    const ang = Math.atan2(-jumpFromDist(dist), vxFromDx(dx, dist) || 0.001);
    const len = 36 + power * 78;
    const ox = you.x;
    const oy = you.y - charH * 0.7;
    ctx.save();
    ctx.strokeStyle = `rgba(36,56,64,${0.25 + power * 0.55})`;
    ctx.lineWidth = 3 + power * 3;
    ctx.lineCap = "round";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(224,122,95,${0.35 + power * 0.5})`;
    ctx.beginPath();
    ctx.arc(dragStartX, dragStartY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(36,56,64,0.4)";
    ctx.beginPath();
    ctx.moveTo(dragStartX, dragStartY);
    ctx.lineTo(dragX, dragY);
    ctx.stroke();
    ctx.restore();
  }

  function resize() {
    const wrap = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * 0.84;
    netX = W * 0.5;
    netH = Math.max(88, H * 0.26);
    netTop = groundY - netH;
    charW = Math.max(56, Math.min(96, W * 0.16));
    charH = charW;
    ballR = Math.max(11, charW * 0.18);
    if (you) {
      you.y = Math.min(you.y, groundY);
      cpu.y = Math.min(cpu.y, groundY);
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.033, (now - (tick.prev || now)) / 1000) || 0.016;
    tick.prev = now;

    if (state === "playing" && you) {
      if (freezeUntil && now >= freezeUntil) {
        freezeUntil = 0;
        resetRally(true);
      }
      if (!freezeUntil) {
        youHitCd = Math.max(0, youHitCd - dt);
        cpuHitCd = Math.max(0, cpuHitCd - dt);
        updateCpu(now, dt);
        updateChar(you, dt);
        updateChar(cpu, dt);
        updateBall(dt);
        if (!held && ball) {
          tryHit(you);
          tryHit(cpu);
        }
      }
    }

    drawCourt();
    if (ball) drawBall();
    if (aiming) drawAim();
    if (you) {
      placeSprite(spriteYou, you, false);
      placeSprite(spriteCpu, cpu, true);
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || freezeUntil) return;
    if (!you.grounded) return;
    e.preventDefault();
    SFX.init();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    pointerId = e.pointerId;
    aiming = true;
    hasDragged = false;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    dragStartX = dragX = pt.x;
    dragStartY = dragY = pt.y;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!aiming || (pointerId != null && e.pointerId !== pointerId)) return;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!hasDragged && Math.hypot(pt.x - dragStartX, pt.y - dragStartY) < DRAG_THRESHOLD) return;
    hasDragged = true;
    dragX = pt.x;
    dragY = pt.y;
  });

  function releaseAim(e) {
    if (!aiming) return;
    if (pointerId != null && e && e.pointerId !== pointerId) return;
    aiming = false;
    pointerId = null;
    try { if (e) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state !== "playing" || !you.grounded || freezeUntil) return;
    const dx = dragX - dragStartX;
    const dy = dragY - dragStartY;
    const dist = Math.hypot(dx, dy);
    applyJump(you, dist, dx);
    launchServe(you, dist, dx);
  }

  canvas.addEventListener("pointerup", releaseAim);
  window.addEventListener("pointerup", releaseAim);
  canvas.addEventListener("pointercancel", (e) => {
    aiming = false;
    pointerId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn) SFX.init();
    SFX.syncBgm();
  });

  window.addEventListener("resize", resize);
  syncSoundBtn();
  resize();
  resetRally(false);
  state = "ready";
  showOverlay(
    "피카츄 배구",
    "화면을 당긴 만큼 뛰어요. 짧은 튕김은 작은 점프, 길게 당기면 높이 뜹니다.",
    "시작",
    startMatch,
  );
  requestAnimationFrame(tick);
})();
