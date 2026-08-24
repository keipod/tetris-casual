/* TCGFx — sequential animation playback for match events. */
(function () {
  "use strict";

  const TYPE_COLOR = {
    grass: "#5fa84a", fire: "#f2793a", water: "#4f92d6", lightning: "#f4d02c",
    psychic: "#c065b0", fighting: "#b3702f", darkness: "#8d84a0", metal: "#a9b3bd",
    dragon: "#8a63d6", colorless: "#cfc7ac",
  };
  const TYPE_KO = {
    grass: "풀", fire: "불꽃", water: "물", lightning: "전기", psychic: "에스퍼",
    fighting: "격투", darkness: "악", metal: "강철", dragon: "드래곤", colorless: "무색",
  };

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function dur(ms) { return reducedMotion() ? Math.min(ms, 50) : ms; }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, dur(ms))); }

  function fxLayer() { return document.getElementById("fx-layer"); }

  function centerOf(el) {
    const layer = fxLayer();
    if (!el || !layer) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const lr = layer.getBoundingClientRect();
    return { x: r.left + r.width / 2 - lr.left, y: r.top + r.height / 2 - lr.top };
  }

  function spawn(cls, styles) {
    const layer = fxLayer();
    if (!layer) return null;
    const el = document.createElement("div");
    el.className = cls;
    Object.assign(el.style, styles || {});
    layer.appendChild(el);
    return el;
  }

  function removeAfter(el, ms) {
    if (!el) return;
    setTimeout(() => el.remove(), dur(ms));
  }

  async function flyProjectile(from, to, color) {
    if (!from || !to || reducedMotion()) return;
    const el = spawn("fx-projectile", { left: from.x + "px", top: from.y + "px", color, background: color });
    if (!el) return;
    await new Promise((r) => requestAnimationFrame(r));
    el.style.transition = "left 0.18s cubic-bezier(0.3,0.4,0.2,1), top 0.18s cubic-bezier(0.3,0.4,0.2,1)";
    el.style.left = to.x + "px";
    el.style.top = to.y + "px";
    await wait(180);
    el.remove();
  }

  function burst(pt) {
    if (!pt || reducedMotion()) return;
    const el = spawn("fx-burst", { left: pt.x + "px", top: pt.y + "px" });
    removeAfter(el, 380);
  }

  function floatDamage(pt, dmg, weak) {
    if (!pt) return;
    const el = spawn("fx-float-dmg" + (weak ? " weak" : ""), { left: pt.x + "px", top: pt.y - 14 + "px" });
    if (el) el.textContent = "-" + dmg;
    removeAfter(el, 950);
    if (weak) {
      const tag = spawn("fx-weak-tag", { left: pt.x + "px", top: pt.y + 18 + "px" });
      if (tag) tag.textContent = "약점!";
      removeAfter(tag, 950);
    }
  }

  function bannerStack() {
    const layer = fxLayer();
    if (!layer) return null;
    let stack = layer.querySelector(".fx-banner-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "fx-banner-stack";
      layer.appendChild(stack);
    }
    return stack;
  }

  function banner(text) {
    const stack = bannerStack();
    if (!stack) return;
    // Cap so a long match doesn't flood the screen.
    while (stack.children.length >= 5) stack.firstChild.remove();

    const el = document.createElement("div");
    el.className = "fx-banner";
    el.textContent = text;
    stack.appendChild(el);

    // Toast TTL: each banner fades out on its own after a few seconds.
    const ttl = 2200;
    setTimeout(() => {
      if (!el.isConnected) return;
      el.classList.add("fx-banner-out");
      setTimeout(() => {
        el.remove();
        if (stack.isConnected && !stack.children.length) stack.remove();
      }, dur(280));
    }, dur(ttl));
  }

  function findCardData(state, uid) {
    if (!uid || !state || !state.players) return null;
    for (const pid of state.order || []) {
      const side = state.players[pid];
      if (!side) continue;
      if (side.active && side.active.uid === uid) return side.active;
      for (const b of side.bench || []) {
        if (b && b.uid === uid) return b;
      }
    }
    return null;
  }

  function patchHp(el, data) {
    if (!el || !data) return;
    const hpEl = el.querySelector(".card-hp");
    const fillEl = el.querySelector(".hp-fill");
    if (hpEl) hpEl.innerHTML = "<em>HP</em>" + data.hp;
    if (fillEl) {
      const pct = data.maxHp ? Math.max(0, (data.hp / data.maxHp) * 100) : 0;
      fillEl.style.width = pct + "%";
      fillEl.classList.toggle("low", pct <= 30);
    }
  }

  // ---------------- sound ----------------
  let actx = null;
  function audioCtx() {
    if (!actx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) { try { actx = new Ctx(); } catch (e) { actx = null; } }
    }
    return actx;
  }
  const BEEP = {
    draw: [520, 0.05, "sine"], attach: [430, 0.06, "triangle"], play: [360, 0.08, "triangle"],
    evolve: [300, 0.18, "sawtooth"], attack: [230, 0.09, "square"], hit: [140, 0.13, "square"],
    ko: [90, 0.3, "sawtooth"], turn: [660, 0.06, "sine"], win: [780, 0.24, "sine"],
    lose: [160, 0.32, "sine"], click: [500, 0.03, "sine"], error: [180, 0.09, "square"],
  };
  function beep(freq, dur_, type, vol) {
    const ctx = audioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(vol || 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur_);
    osc.start(now);
    osc.stop(now + dur_ + 0.02);
  }
  function chord(notes) {
    notes.forEach(([f, d, t, v, delay]) => {
      setTimeout(() => {
        try { beep(f, d, t, v); } catch (e) { /* ignore */ }
      }, delay || 0);
    });
  }
  function playSfx(name) {
    try {
      if (name === "attack") {
        chord([[180, 0.08, "square", 0.07, 0], [320, 0.06, "sawtooth", 0.05, 40]]);
        return;
      }
      if (name === "hit") {
        chord([[120, 0.12, "square", 0.08, 0], [90, 0.16, "triangle", 0.05, 50]]);
        return;
      }
      if (name === "ko") {
        chord([[110, 0.18, "sawtooth", 0.08, 0], [70, 0.28, "sine", 0.07, 90], [40, 0.35, "triangle", 0.05, 180]]);
        return;
      }
      if (name === "evolve") {
        chord([[280, 0.1, "triangle", 0.06, 0], [360, 0.12, "sine", 0.06, 70], [480, 0.16, "sine", 0.05, 150]]);
        return;
      }
      if (name === "win") {
        chord([[520, 0.1, "sine", 0.06, 0], [660, 0.12, "sine", 0.06, 90], [880, 0.2, "sine", 0.07, 180]]);
        return;
      }
      const spec = BEEP[name];
      if (!spec) return;
      beep(spec[0], spec[1], spec[2]);
    } catch (e) { /* audio unavailable */ }
  }

  // ---------------- event handlers ----------------
  async function ev_match_start(ev, state, h) {
    h.refresh();
    banner("대전 시작!");
    h.sfx("draw");
    await wait(200);
  }

  async function ev_draw(ev, state, h) {
    h.refresh();
    h.sfx("draw");
    const el = h.getCardEl(ev.uid);
    if (el) {
      el.classList.add("anim-draw");
      await wait(150);
      el.classList.remove("anim-draw");
    } else {
      await wait(80);
    }
  }

  async function ev_energy_ready(ev, state, h) {
    h.refresh();
    if (ev.player === state.you) h.sfx("attach");
  }

  async function ev_turn_start(ev, state, h) {
    h.refresh();
    h.sfx("turn");
    banner(ev.player === state.you ? "내 턴!" : "상대 턴");
    await wait(150);
  }

  async function ev_setup_active(ev, state, h) {
    h.refresh();
    const el = h.getCardEl(ev.uid);
    if (el) {
      el.classList.add("anim-slam");
      h.sfx("play");
      await wait(210);
      el.classList.remove("anim-slam");
    }
  }
  const ev_setup_bench = ev_setup_active;

  async function ev_setup_ready(ev, state, h) {
    h.refresh();
    h.sfx("click");
  }

  async function ev_attach_energy(ev, state, h) {
    const from = centerOf(document.getElementById("turn-info"));
    h.refresh();
    const el = h.getCardEl(ev.uid);
    const to = centerOf(el);
    h.sfx("attach");
    if (from && to) {
      await flyProjectile(from, to, TYPE_COLOR[ev.energy] || TYPE_COLOR.colorless);
      burst(to);
    }
    if (el) {
      el.classList.add("anim-slam");
      await wait(150);
      el.classList.remove("anim-slam");
    }
  }

  async function ev_play_basic(ev, state, h) {
    h.refresh();
    h.sfx("play");
    const el = h.getCardEl(ev.uid);
    if (el) {
      el.classList.add("anim-slam");
      await wait(210);
      el.classList.remove("anim-slam");
    }
  }

  async function ev_evolve(ev, state, h) {
    h.refresh();
    h.sfx("evolve");
    const el = h.getCardEl(ev.toUid);
    if (el) {
      burst(centerOf(el));
      el.classList.add("anim-evolve");
      await wait(170);
      el.classList.remove("anim-evolve");
    }
  }

  async function ev_retreat(ev, state, h) {
    h.refresh();
    h.sfx("play");
    banner("교체!");
    const el = h.getCardEl(ev.newActive);
    if (el) {
      el.classList.add("anim-promote");
      await wait(210);
      el.classList.remove("anim-promote");
    }
  }

  async function ev_attack(ev, state, h) {
    const attackerSlot = document.getElementById(ev.player === state.you ? "my-active" : "opp-active");
    const atkCard = attackerSlot ? attackerSlot.querySelector(".card") : null;
    const targetEl = h.getCardEl(ev.targetUid);
    const fromPt = centerOf(atkCard || attackerSlot);
    const toPt = centerOf(targetEl);
    const color = TYPE_COLOR[ev.attackerType] || TYPE_COLOR.colorless;

    if (ev.attackName) banner(ev.attackName);
    h.sfx("attack");
    if (atkCard) {
      atkCard.classList.add("anim-attack-prep");
      await wait(170);
      atkCard.classList.remove("anim-attack-prep");
      atkCard.classList.add("anim-attack-lunge");
    }
    if (fromPt && toPt) {
      await flyProjectile(fromPt, toPt, color);
      burst(toPt);
      if (!reducedMotion()) {
        const ring = spawn("fx-impact-ring", {
          left: toPt.x + "px",
          top: toPt.y + "px",
          borderColor: color,
        });
        removeAfter(ring, 420);
      }
    } else {
      await wait(90);
    }
    if (targetEl) targetEl.classList.add("anim-hit");
    const table = document.querySelector(".table");
    if (table && !reducedMotion()) {
      table.classList.add("screen-shake");
      setTimeout(() => table.classList.remove("screen-shake"), dur(320));
    }
    h.sfx("hit");
    if (toPt) floatDamage(toPt, ev.damage, ev.weakness);
    await wait(260);
    if (targetEl) targetEl.classList.remove("anim-hit");
    if (atkCard) atkCard.classList.remove("anim-attack-lunge");
    patchHp(targetEl, findCardData(state, ev.targetUid));
  }

  async function ev_knock_out(ev, state, h) {
    const el = h.getCardEl(ev.uid);
    if (el) {
      h.sfx("ko");
      el.classList.add("anim-ko");
      await wait(dur(380));
    }
    h.refresh();
    const track = document.querySelector(ev.attacker === state.you ? "#prize-me" : "#prize-opp");
    if (track) {
      const gems = track.querySelectorAll(".prize-gem.filled");
      const last = gems[gems.length - 1];
      if (last) last.classList.add("pop");
    }
  }

  async function ev_promote(ev, state, h) {
    h.refresh();
    const el = h.getCardEl(ev.uid);
    if (el) {
      el.classList.add("anim-promote");
      h.sfx("play");
      await wait(210);
      el.classList.remove("anim-promote");
    }
  }

  async function ev_turn_end(ev, state, h) {
    h.refresh();
  }

  async function ev_game_over(ev, state, h) {
    h.refresh();
    h.sfx(ev.winner === state.you ? "win" : "lose");
    banner(ev.winner === state.you ? "승리!" : "패배...");
    await wait(170);
  }

  const HANDLERS = {
    match_start: ev_match_start,
    draw: ev_draw,
    energy_ready: ev_energy_ready,
    turn_start: ev_turn_start,
    setup_active: ev_setup_active,
    setup_bench: ev_setup_bench,
    setup_ready: ev_setup_ready,
    attach_energy: ev_attach_energy,
    play_basic: ev_play_basic,
    evolve: ev_evolve,
    retreat: ev_retreat,
    attack: ev_attack,
    knock_out: ev_knock_out,
    promote: ev_promote,
    turn_end: ev_turn_end,
    game_over: ev_game_over,
  };

  async function queue(events, state, helpers) {
    helpers = helpers || {};
    const h = {
      getCardEl: helpers.getCardEl || (() => null),
      refresh: helpers.refresh || (() => {}),
      sfx(name) {
        try { (helpers.sfx || playSfx)(name); } catch (e) { /* ignore */ }
      },
    };
    for (const ev of events || []) {
      const fn = HANDLERS[ev && ev.type];
      if (!fn) continue;
      try {
        await fn(ev, state, h);
      } catch (e) {
        console.warn("[TCGFx] event failed:", ev.type, e);
      }
    }
  }

  window.TCGFx = { queue, playSfx, TYPE_COLOR, TYPE_KO };
})();
