(() => {
  "use strict";

  const SAVE_KEY = "cookieclicker.save";
  const SOUND_KEY = "cookieclicker.sound.v1";
  const OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
  const GOLDEN_LIFE_MS = 10000;
  const GOLDEN_GAP_MIN_S = 60;
  const GOLDEN_GAP_MAX_S = 100;
  const MAX_PARTICLES = 30;
  const UI_THROTTLE_MS = 100;
  const SAVE_EVERY_MS = 5000;

  const BUILDINGS = [
    { id: "cursor", emoji: "🖱️", name: "커서", base: 15, cps: 0.1 },
    { id: "grandma", emoji: "👵", name: "할머니", base: 100, cps: 1 },
    { id: "farm", emoji: "🌾", name: "농장", base: 1100, cps: 8 },
    { id: "factory", emoji: "🏭", name: "공장", base: 12000, cps: 47 },
    { id: "mine", emoji: "⛏️", name: "광산", base: 130000, cps: 260 },
    { id: "space", emoji: "🚀", name: "우주항구", base: 1400000, cps: 1400 },
  ];

  const UPGRADES = [
    { id: "up1", emoji: "💪", name: "강화 커서", desc: "손클릭 ×2", cost: 100 },
    { id: "up2", emoji: "🌟", name: "플래티넘 커서", desc: "손클릭 ×2", cost: 1000 },
    { id: "up3", emoji: "🛸", name: "우주 커서", desc: "손클릭 ×2", cost: 10000 },
  ];

  const MILESTONES = [
    { n: 100, label: "첫 100개 굽기" },
    { n: 10000, label: "1만개 굽기" },
    { n: 1000000, label: "100만개 굽기" },
  ];

  const UNITS = [
    [1e24, "자"], [1e20, "해"], [1e16, "경"], [1e12, "조"], [1e8, "억"], [1e4, "만"],
  ];

  function fmt(n) {
    n = Math.floor(n);
    if (n < 1e4) return n.toLocaleString("ko-KR");
    for (const [v, u] of UNITS) {
      if (n >= v) {
        const x = n / v;
        const s = x >= 100 ? String(Math.floor(x)) : String(Math.floor(x * 10) / 10);
        return s + u;
      }
    }
    return String(n);
  }

  function fmtRate(r) {
    if (r < 1000) return String(Math.round(r * 10) / 10);
    return fmt(r);
  }

  function fmtUnitCps(c) {
    return c % 1 === 0 ? c.toLocaleString("ko-KR") : String(c);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  const storage = (() => {
    try {
      localStorage.setItem("__cc", "1");
      localStorage.removeItem("__cc");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    }
  })();

  function freshState() {
    return {
      v: 1,
      cookies: 0,
      totalBaked: 0,
      handClicks: 0,
      owned: {},
      ups: {},
      ach: {},
      lastSeen: Date.now(),
    };
  }

  function sanitizeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function loadState() {
    let raw = null;
    try {
      raw = storage.getItem(SAVE_KEY);
    } catch (_) {}
    if (!raw) return freshState();
    try {
      const d = JSON.parse(raw);
      const s = freshState();
      if (d && typeof d === "object") {
        s.cookies = sanitizeNum(d.cookies);
        s.totalBaked = sanitizeNum(d.totalBaked);
        s.handClicks = sanitizeNum(d.handClicks);
        for (const b of BUILDINGS) {
          const v = sanitizeNum(d.owned && d.owned[b.id]);
          if (v > 0) s.owned[b.id] = v;
        }
        for (const u of UPGRADES) {
          if (d.ups && d.ups[u.id]) s.ups[u.id] = true;
        }
        for (const m of MILESTONES) {
          if (d.ach && d.ach[m.n]) s.ach[m.n] = true;
        }
        const ls = Number(d.lastSeen);
        s.lastSeen = Number.isFinite(ls) && ls > 0 ? ls : Date.now();
      }
      return s;
    } catch (_) {
      return freshState();
    }
  }

  function saveState() {
    state.lastSeen = Date.now();
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  let state = loadState();

  function buildingCps() {
    let sum = 0;
    for (const b of BUILDINGS) sum += (state.owned[b.id] || 0) * b.cps;
    return sum;
  }

  function clickPower() {
    let tiers = 0;
    for (const u of UPGRADES) if (state.ups[u.id]) tiers += 1;
    return Math.pow(2, tiers);
  }

  function costOf(b) {
    return Math.floor(b.base * Math.pow(1.15, state.owned[b.id] || 0));
  }

  const cookiesEl = document.getElementById("cookies");
  const cpsEl = document.getElementById("cps");
  const handEl = document.getElementById("hand");
  const hintEl = document.getElementById("cookie-hint");
  const bigCookie = document.getElementById("big-cookie");
  const cookieZone = document.getElementById("cookie-zone");
  const buildingsEl = document.getElementById("shop-buildings");
  const upgradesEl = document.getElementById("shop-upgrades");
  const fxLayer = document.getElementById("fx-layer");
  const toastsEl = document.getElementById("toasts");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnReset = document.getElementById("btn-reset");

  let soundOn = storage.getItem(SOUND_KEY) !== "0";

  const SFX = {
    click() {
      clickFlip = !clickFlip;
      if (soundOn && window.CasualSfx) window.CasualSfx.play(clickFlip ? "mouseDown" : "tap", 0.5);
    },
    buy() { if (soundOn && window.CasualSfx) window.CasualSfx.play("upgrade", 0.6); },
    golden() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["special", "power"], 90, 0.7); },
    ach() { if (soundOn && window.CasualSfx) window.CasualSfx.play("success", 0.65); },
  };
  let clickFlip = false;

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(SOUND_KEY, soundOn ? "1" : "0");
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

  const buildingRows = BUILDINGS.map((b) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "shop-row";
    row.innerHTML =
      `<span class="row-emoji">${b.emoji}</span>` +
      `<span class="row-info"><span class="row-name">${b.name}</span>` +
      `<span class="row-sub"></span></span>` +
      `<span class="row-cost"></span>`;
    row.addEventListener("click", () => buyBuilding(b, row));
    buildingsEl.appendChild(row);
    return {
      b,
      row,
      subEl: row.querySelector(".row-sub"),
      costEl: row.querySelector(".row-cost"),
    };
  });

  const upgradeRows = UPGRADES.map((u) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "shop-row";
    row.innerHTML =
      `<span class="row-emoji">${u.emoji}</span>` +
      `<span class="row-info"><span class="row-name">${u.name}</span>` +
      `<span class="row-sub">${u.desc} · 현재 +${fmtUnitCps(0)}</span></span>` +
      `<span class="row-cost">${fmt(u.cost)}</span>`;
    row.addEventListener("click", () => buyUpgrade(u, row));
    upgradesEl.appendChild(row);
    return {
      u,
      row,
      subEl: row.querySelector(".row-sub"),
      costEl: row.querySelector(".row-cost"),
    };
  });

  function flashRow(row, cls) {
    row.classList.remove(cls);
    void row.offsetWidth;
    row.classList.add(cls);
    row.addEventListener("animationend", () => row.classList.remove(cls), { once: true });
  }

  function shakeRow(row) {
    flashRow(row, "row-shake");
  }

  function buyBuilding(b, row) {
    if (!helpOverlay.hidden) return;
    const cost = costOf(b);
    if (state.cookies < cost) {
      shakeRow(row);
      return;
    }
    state.cookies -= cost;
    state.owned[b.id] = (state.owned[b.id] || 0) + 1;
    SFX.buy();
    flashRow(row, "row-flash");
    syncHud();
    syncShop();
  }

  function buyUpgrade(u, row) {
    if (!helpOverlay.hidden) return;
    if (state.ups[u.id]) return;
    if (state.cookies < u.cost) {
      shakeRow(row);
      return;
    }
    state.cookies -= u.cost;
    state.ups[u.id] = true;
    SFX.buy();
    flashRow(row, "row-flash");
    syncHud();
    syncShop();
  }

  function syncHud() {
    cookiesEl.textContent = fmt(state.cookies);
    cpsEl.textContent = fmtRate(buildingCps());
    handEl.textContent = "+" + fmt(clickPower());
    hintEl.textContent = `탭할 때마다 +${fmt(clickPower())}개 구워요!`;
  }

  function syncShop() {
    for (const r of buildingRows) {
      const cost = costOf(r.b);
      const owned = state.owned[r.b.id] || 0;
      r.row.classList.toggle("can-buy", state.cookies >= cost);
      r.costEl.textContent = fmt(cost);
      r.subEl.textContent = `초당 +${fmtUnitCps(r.b.cps)} · ${owned.toLocaleString("ko-KR")}개 보유`;
    }
    for (const r of upgradeRows) {
      const bought = !!state.ups[r.u.id];
      r.row.disabled = bought;
      r.row.classList.toggle("done", bought);
      if (bought) {
        r.costEl.textContent = "구매 완료";
        r.subEl.textContent = `${r.u.desc} · 현재 손클릭 +${fmt(clickPower())}`;
      } else {
        r.row.classList.toggle("can-buy", state.cookies >= r.u.cost);
        r.costEl.textContent = fmt(r.u.cost);
        r.subEl.textContent = `${r.u.desc} · 현재 손클릭 +${fmt(clickPower())}`;
      }
    }
  }

  let liveParticles = 0;

  function trackParticle(el, anim) {
    liveParticles += 1;
    anim.onfinish = () => {
      el.remove();
      liveParticles -= 1;
    };
    anim.oncancel = () => {
      el.remove();
      liveParticles -= 1;
    };
  }

  function spawnFloat(x, y, text) {
    if (liveParticles >= MAX_PARTICLES) return;
    const el = document.createElement("span");
    el.className = "fnum";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    cookieZone.appendChild(el);
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: "translate(-50%, -110%) scale(1.15)", opacity: 0 },
      ],
      { duration: 900, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }
    );
    trackParticle(el, anim);
  }

  function spawnCrumbs(parent, x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      if (liveParticles >= MAX_PARTICLES) return;
      const size = rand(4, 8);
      const el = document.createElement("span");
      el.className = "crumb";
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.left = x + "px";
      el.style.top = y + "px";
      parent.appendChild(el);
      const dx = rand(-46, 46);
      const up = rand(-52, -22);
      const down = rand(24, 56);
      const anim = el.animate(
        [
          { transform: "translate(-50%, -50%)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${up}px))`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${down}px))`, opacity: 0 },
        ],
        { duration: rand(520, 760), easing: "cubic-bezier(0.3, 0.6, 0.6, 1)" }
      );
      trackParticle(el, anim);
    }
  }

  const CRUMB_COLORS = ["#8a5420", "#a86a2c", "#5e3a18", "#d99a4e"];

  bigCookie.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const gain = clickPower();
    state.cookies += gain;
    state.totalBaked += gain;
    state.handClicks += 1;
    SFX.click();
    bigCookie.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.92, 0.87)" },
        { transform: "scale(1.05, 1.04)" },
        { transform: "scale(1)" },
      ],
      { duration: 190, easing: "ease-out" }
    );
    const rect = cookieZone.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 12), rect.width - 12);
    const y = Math.min(Math.max(e.clientY - rect.top, 12), rect.height - 12);
    spawnFloat(x, y, "+" + fmt(gain));
    spawnCrumbs(cookieZone, x, y, 5, CRUMB_COLORS);
    syncHud();
    checkMilestones();
  });

  let goldenEl = null;
  let goldenSpawnTimer = 0;
  let goldenExpireTimer = 0;

  function scheduleGolden() {
    clearTimeout(goldenSpawnTimer);
    const delayS = rand(GOLDEN_GAP_MIN_S, GOLDEN_GAP_MAX_S);
    goldenSpawnTimer = setTimeout(spawnGolden, delayS * 1000);
  }

  function spawnGolden() {
    if (goldenEl) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = 64;
    const pad = 24;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "golden-cookie";
    el.setAttribute("aria-label", "황금 쿠키");
    el.style.left = rand(pad, Math.max(pad + 1, w - size - pad)) + "px";
    el.style.top = rand(pad + 40, Math.max(pad + 41, h - size - pad)) + "px";
    el.addEventListener("pointerdown", collectGolden, { once: true });
    fxLayer.appendChild(el);
    goldenEl = el;
    goldenExpireTimer = setTimeout(() => {
      if (goldenEl === el) {
        el.classList.add("expiring");
        setTimeout(() => removeGolden(el), 800);
      }
    }, GOLDEN_LIFE_MS - 800);
  }

  function removeGolden(el) {
    clearTimeout(goldenExpireTimer);
    if (goldenEl === el) goldenEl = null;
    el.remove();
    scheduleGolden();
  }

  function collectGolden(e) {
    e.preventDefault();
    const el = e.currentTarget;
    const bonus = Math.max(buildingCps() * 77, state.cookies * 0.13, 7);
    const gain = Math.floor(bonus);
    state.cookies += gain;
    state.totalBaked += gain;
    SFX.golden();
    toast(`✨ 행운의 쿠키 +${fmt(gain)}개!`, "toast-gold");
    const rect = fxLayer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ring = document.createElement("span");
    ring.className = "ring";
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    ring.style.width = "64px";
    ring.style.height = "64px";
    fxLayer.appendChild(ring);
    const ringAnim = ring.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.6)", opacity: 1 },
        { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 },
      ],
      { duration: 550, easing: "ease-out" }
    );
    trackParticle(ring, ringAnim);
    spawnCrumbs(fxLayer, x, y, 8, ["#ffd75e", "#fff3b0", "#e8a020"]);
    removeGolden(el);
    syncHud();
    checkMilestones();
  }

  function toast(msg, cls) {
    const el = document.createElement("div");
    el.className = "toast" + (cls ? " " + cls : "");
    el.textContent = msg;
    toastsEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function checkMilestones() {
    for (const m of MILESTONES) {
      if (!state.ach[m.n] && state.totalBaked >= m.n) {
        state.ach[m.n] = true;
        SFX.ach();
        toast(`🏆 업적 달성 — ${m.label}!`, "toast-gold");
        saveState();
      }
    }
  }

  function applyOfflineProgress() {
    const elapsedMs = Math.min(Math.max(Date.now() - state.lastSeen, 0), OFFLINE_CAP_MS);
    const rate = buildingCps();
    const gain = rate * (elapsedMs / 1000);
    if (gain >= 1) {
      state.cookies += gain;
      state.totalBaked += gain;
      if (elapsedMs >= 30 * 1000) {
        toast(`👋 부재 중 ${fmt(gain)}개 구웠어요`, "toast-gold");
      }
    }
  }

  let resetArmTimer = 0;

  btnReset.addEventListener("click", () => {
    if (!btnReset.classList.contains("arm")) {
      btnReset.classList.add("arm");
      btnReset.textContent = "정말?";
      clearTimeout(resetArmTimer);
      resetArmTimer = setTimeout(() => {
        btnReset.classList.remove("arm");
        btnReset.textContent = "초기화";
      }, 3000);
      return;
    }
    clearTimeout(resetArmTimer);
    btnReset.classList.remove("arm");
    btnReset.textContent = "초기화";
    try {
      storage.removeItem(SAVE_KEY);
    } catch (_) {}
    state = freshState();
    if (goldenEl) {
      goldenEl.remove();
      goldenEl = null;
      clearTimeout(goldenExpireTimer);
    }
    scheduleGolden();
    syncHud();
    syncShop();
    toast("🔄 초기화 완료");
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveState();
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("beforeunload", saveState);

  applyOfflineProgress();

  let lastFrame = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;

  function frame(now) {
    const dms = Math.min(Math.max(now - lastFrame, 0), OFFLINE_CAP_MS);
    lastFrame = now;
    const rate = buildingCps();
    if (rate > 0 && dms > 0) {
      const gain = rate * (dms / 1000);
      state.cookies += gain;
      state.totalBaked += gain;
    }
    uiAcc += dms;
    saveAcc += dms;
    if (uiAcc >= UI_THROTTLE_MS) {
      uiAcc = 0;
      syncHud();
      syncShop();
      checkMilestones();
    }
    if (saveAcc >= SAVE_EVERY_MS) {
      saveAcc = 0;
      saveState();
    }
    requestAnimationFrame(frame);
  }

  syncHud();
  syncShop();
  scheduleGolden();
  setInterval(saveState, SAVE_EVERY_MS);
  requestAnimationFrame(frame);
})();
