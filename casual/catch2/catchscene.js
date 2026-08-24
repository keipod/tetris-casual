/** Catch-1 style 1:1 throw scene for catch2. Stronger mons move faster. */

const GRAVITY = 0.3;
const WALL_DAMP = 0.82;
const MAX_BOUNCES = 4;

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function strengthFactor(mon) {
  const cp = mon.combatPower || (mon.bst || 300) * 0.35 + (mon.level || 5) * 12;
  // ~80 (weak) → 0, ~220 (strong) → 1
  return Math.max(0, Math.min(1, (cp - 80) / 140));
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {object} opts.mon
 * @param {number} opts.catchProb 0..1
 * @param {boolean} opts.reducedMotion
 * @param {{ throw?:Fn, shake?:Fn, catch?:Fn, flee?:Fn, miss?:Fn, cry?:Fn }} opts.sfx
 * @returns {Promise<{ caught: boolean }>}
 */
export async function runCatchScene(opts) {
  const {
    canvas,
    mon,
    catchProb,
    reducedMotion = false,
    sfx = {},
  } = opts;

  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;
  const ballImg = await loadImage("assets/ui/pokeball.png");
  const sparkleImg = await loadImage("assets/ui/sparkle.png");
  const monImg = await loadImage(mon.front || mon.art);

  let W = 0;
  let H = 0;
  let R = 16;
  let restX = 0;
  let cannonY = 0;
  let running = true;
  let raf = 0;
  let flying = null;
  let aiming = false;
  let hasDragged = false;
  let aimAngle = -Math.PI / 2;
  let pullX = 0;
  let pullY = 0;
  let pullDist = 0;
  let pullPower = 0;
  let pointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let resolving = false;
  let resultBanner = null; // { text, ok, until }
  let doneResolve = null;
  const donePromise = new Promise((r) => { doneResolve = r; });

  const str = strengthFactor(mon);
  // Sized relative to viewport — readable on phone portrait
  let monSize = 128;
  const speed = (1.15 + str * 2.6) * (reducedMotion ? 0.55 : 1);
  const monState = {
    x: 0,
    y: 0,
    vx: (Math.random() < 0.5 ? -1 : 1) * speed,
    vy: (Math.random() < 0.5 ? -1 : 1) * speed * 0.85,
    wobble: Math.random() * Math.PI * 2,
  };

  function resize() {
    const w = parent?.clientWidth || 360;
    const h = parent?.clientHeight || 520;
    canvas.width = Math.floor(w * devicePixelRatio);
    canvas.height = Math.floor(h * devicePixelRatio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    W = w;
    H = h;
    R = Math.max(28, Math.min(42, w * 0.09));
    monSize = Math.max(118, Math.min(176, w * 0.42)) + str * 24;
    restX = w * 0.5;
    // Leave room below the rest point so a full pull can actually charge
    cannonY = h - Math.max(R * 5.8, h * 0.2);
    if (!monState.x) {
      monState.x = w * (0.22 + Math.random() * 0.45);
      monState.y = h * (0.18 + Math.random() * 0.22);
    }
  }

  function minPull() {
    return R * 0.7;
  }

  /** Reachable sling stretch (matches pointer clamp in onPointerMove). */
  function maxPullDist() {
    const maxDx = W * 0.28;
    const maxDy = Math.max(R * 3.2, H - cannonY - R * 0.6);
    return Math.hypot(maxDx, maxDy);
  }

  function throwSpeed(power) {
    const t = Math.max(0, Math.min(1, power));
    // Full pull actually charges (old maxPull was unreachable → felt weak even when stretched).
    const unit = Math.min(W, H) * 0.03;
    return unit * (0.95 + t * 0.5 + t * t * 0.45);
  }

  function stepBall(ball) {
    const prevX = ball.x;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vy += GRAVITY;
    let bounced = false;
    if (ball.x < R) {
      ball.x = R;
      if (prevX >= R && ball.vx < 0) { ball.vx *= -WALL_DAMP; bounced = true; }
    } else if (ball.x > W - R) {
      ball.x = W - R;
      if (prevX <= W - R && ball.vx > 0) { ball.vx *= -WALL_DAMP; bounced = true; }
    }
    return bounced;
  }

  function hitMon(x, y) {
    const cx = monState.x + monSize * 0.5;
    const cy = monState.y + monSize * 0.52;
    const dx = x - cx;
    const dy = y - cy;
    const rad = R * 0.95 + monSize * 0.3;
    return dx * dx + dy * dy <= rad * rad;
  }

  function updateMon(dt) {
    if (resolving || flying?.shaking) return;
    monState.wobble += dt * (2.2 + str * 2);
    monState.x += monState.vx * dt * 60;
    monState.y += monState.vy * dt * 60;
    // bounce in upper playfield
    const pad = 8;
    const maxY = H * 0.55;
    if (monState.x < pad) { monState.x = pad; monState.vx = Math.abs(monState.vx); }
    if (monState.x > W - monSize - pad) { monState.x = W - monSize - pad; monState.vx = -Math.abs(monState.vx); }
    if (monState.y < pad + 24) { monState.y = pad + 24; monState.vy = Math.abs(monState.vy); }
    if (monState.y > maxY - monSize) { monState.y = maxY - monSize; monState.vy = -Math.abs(monState.vy); }
    // occasional direction flick — stronger = more erratic
    if (Math.random() < 0.012 + str * 0.025) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.85 + Math.random() * 0.4);
      monState.vx = Math.cos(a) * sp;
      monState.vy = Math.sin(a) * sp * 0.9;
    }
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, reducedMotion ? Math.min(ms, 140) : ms));
  }

  async function resolveHit() {
    resolving = true;
    flying = {
      x: monState.x + monSize * 0.5,
      y: monState.y + monSize * 0.45,
      vx: 0,
      vy: 0,
      shaking: true,
    };
    // Longer shake / result hold than catch1
    for (let i = 0; i < 4; i++) {
      sfx.shake?.();
      await wait(420 + i * 40);
    }
    const ok = Math.random() < catchProb;
    if (ok) {
      sfx.catch?.();
      sfx.cry?.(mon.id);
      resultBanner = { text: `잡았다! ${mon.ko}`, ok: true, until: performance.now() + 2600 };
      await wait(2600);
      finish(true);
    } else {
      sfx.flee?.();
      sfx.cry?.(mon.id);
      resultBanner = { text: `놓쳤다… ${mon.ko}`, ok: false, until: performance.now() + 2200 };
      await wait(2200);
      finish(false);
    }
  }

  function finish(caught) {
    running = false;
    cancelAnimationFrame(raf);
    unbind();
    doneResolve({ caught });
  }

  function fireBall() {
    if (flying || resolving) return;
    if (pullDist < minPull()) return;
    const speedThrow = throwSpeed(pullPower);
    flying = {
      x: restX,
      y: cannonY,
      vx: Math.cos(aimAngle) * speedThrow,
      vy: Math.sin(aimAngle) * speedThrow,
      bounces: 0,
    };
    sfx.throw?.();
    pullDist = 0;
    pullPower = 0;
    hasDragged = false;
    aiming = false;
  }

  function onPointerDown(e) {
    if (resolving || flying || resultBanner) return;
    if (e.target !== canvas && !canvas.contains(e.target)) return;
    canvas.setPointerCapture(e.pointerId);
    pointerId = e.pointerId;
    aiming = true;
    hasDragged = false;
    const rect = canvas.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;
    pullX = restX;
    pullY = cannonY;
  }

  function onPointerMove(e) {
    if (!aiming || e.pointerId !== pointerId || resolving) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragStartX;
    const dy = y - dragStartY;
    if (Math.hypot(dx, dy) > 8) hasDragged = true;
    // pull down/back from rest — wide enough to reach full power
    const maxDx = W * 0.28;
    pullX = restX + Math.max(-maxDx, Math.min(maxDx, x - restX));
    pullY = Math.max(cannonY, Math.min(H - R * 0.55, y));
    const pdx = restX - pullX;
    const pdy = cannonY - pullY;
    pullDist = Math.hypot(pdx, pdy);
    pullPower = Math.max(0, Math.min(1, pullDist / maxPullDist()));
    aimAngle = Math.atan2(pdy, pdx);
    if (aimAngle > -0.15) aimAngle = -0.15;
    if (aimAngle < -Math.PI + 0.15) aimAngle = -Math.PI + 0.15;
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!aiming) return;
    aiming = false;
    if (hasDragged && pullDist >= minPull()) fireBall();
    else {
      pullDist = 0;
      pullPower = 0;
      sfx.miss?.();
    }
  }

  function bind() {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", resize);
  }

  function unbind() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("resize", resize);
  }

  function drawBall(x, y, scale = 1) {
    const r = R * scale;
    ctx.save();
    ctx.translate(x, y);
    if (flying?.shaking) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
    if (ballImg) ctx.drawImage(ballImg, -r * 1.35, -r * 1.35, r * 2.7, r * 2.7);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#eee";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.fillStyle = "#d94444";
      ctx.fill();
    }
    if (flying?.shaking && sparkleImg) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sparkleImg, -r * 1.6, -r * 1.8, r * 3.2, r * 3.2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#6eb8ef");
    sky.addColorStop(0.45, "#a8d878");
    sky.addColorStop(1, "#4a8a3a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // meadow ellipse
    ctx.fillStyle = "rgba(60,120,40,0.45)";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.72, W * 0.55, H * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // hint
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `700 ${Math.max(13, W * 0.035)}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${mon.ko} · 아래로 당겨 던지기`, W * 0.5, 28);
    ctx.font = `600 ${Math.max(11, W * 0.028)}px "Noto Sans KR", sans-serif`;
    ctx.fillStyle = "rgba(255,255,245,0.75)";
    ctx.fillText(str > 0.55 ? "빠른 움직임! 조준에 집중" : "타이밍에 맞춰 볼을 던지세요", W * 0.5, 48);

    if (!flying?.shaking && !resultBanner) {
      const bob = Math.sin(monState.wobble) * (4 + str * 5);
      if (monImg) {
        ctx.drawImage(monImg, monState.x, monState.y + bob, monSize, monSize);
      } else {
        ctx.fillStyle = "#f0d060";
        ctx.beginPath();
        ctx.arc(monState.x + monSize / 2, monState.y + monSize / 2 + bob, monSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // speed trails for strong mons
      if (str > 0.4) {
        ctx.globalAlpha = 0.25;
        if (monImg) {
          ctx.drawImage(monImg, monState.x - monState.vx * 4, monState.y - monState.vy * 4 + bob, monSize, monSize);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (aiming && hasDragged) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pullX, pullY);
      ctx.lineTo(restX, cannonY);
      ctx.stroke();
      ctx.setLineDash([]);
      // trajectory preview
      const preview = { x: restX, y: cannonY, vx: Math.cos(aimAngle) * throwSpeed(pullPower), vy: Math.sin(aimAngle) * throwSpeed(pullPower) };
      ctx.beginPath();
      ctx.moveTo(preview.x, preview.y);
      for (let i = 0; i < 40; i++) {
        stepBall(preview);
        if (i % 2 === 0) ctx.lineTo(preview.x, preview.y);
      }
      ctx.strokeStyle = `rgba(255,240,160,${0.35 + pullPower * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawBall(pullX, pullY, 0.95);
    } else if (!flying) {
      drawBall(restX, cannonY, 1.08);
    }

    if (flying && !flying.shaking) {
      drawBall(flying.x, flying.y, 1);
    } else if (flying?.shaking) {
      drawBall(flying.x, flying.y, 1.15);
    }

    if (resultBanner) {
      ctx.fillStyle = resultBanner.ok ? "rgba(30,90,40,0.82)" : "rgba(90,30,30,0.82)";
      const bw = Math.min(W * 0.86, 320);
      const bh = 72;
      const bx = (W - bw) / 2;
      const by = H * 0.38;
      ctx.beginPath();
      roundRect(ctx, bx, by, bw, bh, 14);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.max(18, W * 0.048)}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(resultBanner.text, W * 0.5, by + 44);
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  let lastT = performance.now();
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    updateMon(dt);

    if (flying && !flying.shaking && !resolving) {
      const bounced = stepBall(flying);
      if (bounced) {
        flying.bounces = (flying.bounces || 0) + 1;
        if (flying.bounces > MAX_BOUNCES) flying = null;
      }
      if (flying && hitMon(flying.x, flying.y)) {
        resolveHit();
      } else if (flying && (flying.y > H + R * 2 || flying.y < -R * 4)) {
        flying = null;
        sfx.miss?.();
      }
    }

    draw();
  }

  resize();
  bind();
  sfx.cry?.(mon.id);
  requestAnimationFrame(loop);
  return donePromise;
}
