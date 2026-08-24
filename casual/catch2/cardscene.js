/** Dramatic 3D dex-card duel: fly-in, clash burst, win/lose fireworks. */

import { TYPE_COLOR, TYPE_KO, combatPower, typeEffect } from "./poke.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function wait(ms, reduced) {
  return new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 90) : ms));
}

function cardFaceHtml(mon, side) {
  const t0 = mon.types?.[0] || "normal";
  const col = TYPE_COLOR[t0] || "#888";
  const img = mon.front || mon.art || "";
  const cp = combatPower(mon);
  return `
    <div class="duel-card ${side}" style="--type:${col}">
      <div class="duel-card-inner">
        <div class="duel-card-shine" aria-hidden="true"></div>
        <div class="duel-card-top">
          <span class="duel-name">${esc(mon.ko)}</span>
          <span class="duel-cp">CP ${cp}</span>
        </div>
        <div class="duel-art-wrap">
          <img class="duel-art" src="${esc(img)}" alt="" draggable="false">
        </div>
        <div class="duel-types">
          ${(mon.types || []).map((t) =>
            `<span style="background:${TYPE_COLOR[t] || "#888"}">${TYPE_KO[t] || t}</span>`
          ).join("")}
        </div>
        <div class="duel-foil" aria-hidden="true"></div>
      </div>
    </div>
  `;
}

function spawnBurst(fxRoot, x, y, color, count = 28) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "duel-spark";
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 40 + Math.random() * 120;
    const size = 4 + Math.random() * 8;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.background = i % 3 === 0 ? "#fff8d0" : color;
    p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    p.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    p.style.animationDuration = `${0.55 + Math.random() * 0.45}s`;
    fxRoot.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

function spawnConfetti(fxRoot, win) {
  const colors = win
    ? ["#ffe066", "#ff9f1c", "#2ec4b6", "#e71d36", "#ffffff"]
    : ["#8a9099", "#5a6270", "#c0c4cc", "#3a4048"];
  for (let i = 0; i < 42; i++) {
    const p = document.createElement("span");
    p.className = "duel-confetti";
    p.style.left = `${10 + Math.random() * 80}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--fall", `${70 + Math.random() * 40}vh`);
    p.style.setProperty("--spin", `${(Math.random() - 0.5) * 900}deg`);
    p.style.animationDelay = `${Math.random() * 0.25}s`;
    p.style.animationDuration = `${1.1 + Math.random() * 0.9}s`;
    fxRoot.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

/**
 * Full card duel UX inside #card-layer.
 * @returns {Promise<{ cancelled: true } | { cancelled: false, card: object, win: boolean, my: number, theirs: number }>}
 */
export async function runCardDuel({
  layer,
  hand,
  wild,
  reducedMotion = false,
  sfx = {},
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      layer.classList.add("hidden");
      layer.innerHTML = "";
      resolve(payload);
    };

    layer.classList.remove("hidden");
    layer.innerHTML = `
      <div class="duel-arena" id="duel-arena">
        <div class="duel-sky" aria-hidden="true"></div>
        <div class="duel-floor" aria-hidden="true"></div>
        <header class="duel-hud">
          <p class="duel-title">카드 승부</p>
          <p class="duel-sub">상성 × 전투력 — 더 강한 카드를 내세요</p>
        </header>
        <div class="duel-stage" id="duel-stage">
          <div class="duel-slot foe" id="slot-foe">
            <div class="duel-card foe waiting">
              <div class="duel-card-inner back">
                <span>?</span>
              </div>
            </div>
          </div>
          <div class="duel-vs" id="duel-vs" hidden>VS</div>
          <div class="duel-slot mine" id="slot-mine"></div>
        </div>
        <canvas class="duel-fx-canvas" id="duel-fx-canvas" aria-hidden="true"></canvas>
        <div class="duel-fx" id="duel-fx" aria-hidden="true"></div>
        <div class="duel-banner" id="duel-banner" hidden></div>
        <div class="duel-hand-wrap">
          <p class="duel-hand-label">내 카드</p>
          <div class="duel-hand" id="duel-hand">
            ${hand.map((p, i) => `
              <button type="button" class="duel-hand-card" data-i="${i}" style="--type:${TYPE_COLOR[p.types?.[0]] || "#888"}">
                <img src="${esc(p.front || p.art)}" alt="">
                <strong>${esc(p.ko)}</strong>
                <small>CP ${combatPower(p)}</small>
              </button>
            `).join("")}
          </div>
        </div>
        <button type="button" class="duel-cancel btn ghost" id="duel-cancel">취소</button>
      </div>
    `;

    const arena = layer.querySelector("#duel-arena");
    const stage = layer.querySelector("#duel-stage");
    const slotFoe = layer.querySelector("#slot-foe");
    const slotMine = layer.querySelector("#slot-mine");
    const vsEl = layer.querySelector("#duel-vs");
    const fxRoot = layer.querySelector("#duel-fx");
    const banner = layer.querySelector("#duel-banner");
    const canvas = layer.querySelector("#duel-fx-canvas");
    const ctx = canvas.getContext("2d");

    function sizeCanvas() {
      const r = arena.getBoundingClientRect();
      canvas.width = Math.floor(r.width * devicePixelRatio);
      canvas.height = Math.floor(r.height * devicePixelRatio);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    sizeCanvas();
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    layer.querySelector("#duel-cancel").onclick = () => {
      window.removeEventListener("resize", onResize);
      sfx.ui?.();
      finish({ cancelled: true });
    };

    // Reveal wild card after a beat
    (async () => {
      await wait(280, reducedMotion);
      slotFoe.innerHTML = cardFaceHtml(wild, "foe");
      const foeCard = slotFoe.querySelector(".duel-card");
      foeCard.classList.add("deal-in");
      sfx.whoosh?.();
      sfx.cry?.(wild.id);
    })();

    layer.querySelectorAll(".duel-hand-card").forEach((btn) => {
      btn.onclick = async () => {
        if (settled) return;
        const idx = Number(btn.dataset.i);
        const card = hand[idx];
        layer.querySelectorAll(".duel-hand-card").forEach((b) => {
          b.disabled = true;
          b.classList.toggle("picked", b === btn);
        });
        layer.querySelector("#duel-cancel").disabled = true;
        sfx.ui?.();
        sfx.cry?.(card.id);

        // Compute outcome
        const multMine = typeEffect(card.types[0], wild.types);
        const multFoe = typeEffect(wild.types[0], card.types);
        let my = combatPower(card) * (multMine === 0 ? 0 : multMine);
        let theirs = combatPower(wild) * (multFoe === 0 ? 0 : multFoe);
        if (my === theirs) my *= 1.01;
        const win = my > theirs;

        await playClash({
          card,
          wild,
          win,
          my,
          theirs,
          multMine,
          multFoe,
          reducedMotion,
          sfx,
          stage,
          slotMine,
          slotFoe,
          vsEl,
          fxRoot,
          banner,
          arena,
          canvas,
          ctx,
          sizeCanvas,
        });

        window.removeEventListener("resize", onResize);
        await wait(win ? 900 : 700, reducedMotion);
        finish({ cancelled: false, card, win, my, theirs });
      };
    });
  });
}

async function playClash({
  card, wild, win, my, theirs, multMine, multFoe,
  reducedMotion, sfx, stage, slotMine, slotFoe, vsEl, fxRoot, banner, arena,
  canvas, ctx, sizeCanvas,
}) {
  sizeCanvas();
  slotMine.innerHTML = cardFaceHtml(card, "mine");
  const mine = slotMine.querySelector(".duel-card");
  const foe = slotFoe.querySelector(".duel-card");

  mine.classList.add("fly-in");
  foe.classList.add("charge");
  sfx.throw?.();
  await wait(reducedMotion ? 120 : 520, false);

  vsEl.hidden = false;
  vsEl.classList.add("pop");
  stage.classList.add("clash");
  arena.classList.add("shake");
  sfx.clash?.();

  const stageRect = stage.getBoundingClientRect();
  const fxRect = fxRoot.getBoundingClientRect();
  const ax = stageRect.left - fxRect.left + stageRect.width / 2;
  const ay = stageRect.top - fxRect.top + stageRect.height * 0.42;
  const cMine = TYPE_COLOR[card.types?.[0]] || "#f0c030";
  const cFoe = TYPE_COLOR[wild.types?.[0]] || "#6890F0";
  spawnBurst(fxRoot, ax, ay, cMine, 22);
  spawnBurst(fxRoot, ax, ay, cFoe, 18);
  const canvasRect = canvas.getBoundingClientRect();
  runShockwave(
    ctx,
    canvas,
    stageRect.left - canvasRect.left + stageRect.width / 2,
    stageRect.top - canvasRect.top + stageRect.height * 0.42,
    win ? cMine : cFoe,
  );

  await wait(reducedMotion ? 100 : 380, false);
  arena.classList.remove("shake");
  vsEl.classList.remove("pop");
  vsEl.hidden = true;

  if (win) {
    mine.classList.add("victory");
    foe.classList.add("defeat");
    spawnConfetti(fxRoot, true);
    spawnBurst(fxRoot, ax, ay - 20, "#ffe066", 36);
    sfx.win?.();
    banner.hidden = false;
    banner.className = "duel-banner win";
    banner.innerHTML = `<strong>승리!</strong><span>${esc(card.ko)} ${my.toFixed(0)} > ${esc(wild.ko)} ${theirs.toFixed(0)}</span><small>상성 ×${multMine}</small>`;
  } else {
    foe.classList.add("victory");
    mine.classList.add("defeat");
    spawnConfetti(fxRoot, false);
    spawnBurst(fxRoot, ax, ay - 20, "#8899aa", 24);
    sfx.lose?.();
    banner.hidden = false;
    banner.className = "duel-banner lose";
    banner.innerHTML = `<strong>패배…</strong><span>${esc(card.ko)} ${my.toFixed(0)} ≤ ${esc(wild.ko)} ${theirs.toFixed(0)}</span><small>상성 ×${multMine}</small>`;
  }
}

function runShockwave(ctx, canvas, x, y, color) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  let t0 = performance.now();
  const max = 420;
  function frame(now) {
    const u = Math.min(1, (now - t0) / max);
    ctx.clearRect(0, 0, w, h);
    const r = 20 + u * Math.max(w, h) * 0.55;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1 - u;
    ctx.lineWidth = 6 * (1 - u) + 1;
    ctx.stroke();
    ctx.globalAlpha = (1 - u) * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (u < 1) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}
