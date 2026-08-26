(() => {
  "use strict";

  const DURATION_MS = 60000;
  const MAX_ACTIVE = 3;
  const GRACE_MS = 220;
  const BG_GRACE_MS = 150;
  const BOMB_HALF_UNTIL_MS = 3000;
  const LS_BEST = "whackmole.best";
  const LS_SOUND = "whackmole.sound";

  const KIND_UPTIME = { normal: 1, gold: 0.6, bomb: 1.05, helm: 1.3 };
  const POINTS = { normal: 100, gold: 500, helmFirst: 150, helmDone: 300 };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const rand = (n) => Math.floor(Math.random() * n);

  const storage = (() => {
    try {
      localStorage.setItem("__wm", "1");
      localStorage.removeItem("__wm");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const $ = (id) => document.getElementById(id);
  const field = $("field");
  const el = {
    score: $("score"),
    combo: $("combo"),
    mult: $("mult"),
    time: $("time"),
    best: $("best"),
    timebar: $("timebar"),
    fill: $("timebar-fill"),
    fx: null,
    tapFx: $("tap-fx"),
    hammer: $("hammer"),
    banner: $("combo-banner"),
    overlay: $("overlay"),
    card: $("overlay-card"),
    help: $("help-overlay"),
    btnSound: $("btn-sound"),
    btnHelp: $("btn-help"),
    btnHelpClose: $("btn-help-close"),
    btnPause: $("btn-pause"),
    stage: document.querySelector(".stage"),
  };

  const HOLES = 9;
  const holes = [];

  function moleMarkup() {
    return (
      '<div class="pit-back"></div>' +
      '<div class="pit-mask"><div class="mole" data-kind="normal"><div class="mole-inner">' +
      '<div class="m-ear m-ear-l"></div><div class="m-ear m-ear-r"></div>' +
      '<div class="m-body"></div>' +
      '<div class="m-belly"></div>' +
      '<div class="m-eye m-eye-l"></div><div class="m-eye m-eye-r"></div>' +
      '<div class="m-brow m-brow-l"></div><div class="m-brow m-brow-r"></div>' +
      '<div class="m-snout"></div>' +
      '<div class="m-mouth"></div>' +
      '<div class="m-whisker m-wk-l"></div><div class="m-whisker m-wk-r"></div>' +
      '<div class="m-paw m-paw-l"></div><div class="m-paw m-paw-r"></div>' +
      '<div class="m-spk m-spk-1"></div><div class="m-spk m-spk-2"></div>' +
      '<div class="m-fuse"></div><div class="m-spark"></div>' +
      '<div class="m-helmet"></div>' +
      "</div></div></div>" +
      '<div class="pit-lip"></div>'
    );
  }

  function buildField() {
    for (let i = 0; i < HOLES; i++) {
      const pit = document.createElement("div");
      pit.className = "pit";
      pit.dataset.i = String(i);
      pit.innerHTML = moleMarkup();
      field.appendChild(pit);
      holes.push({
        pit,
        mole: pit.querySelector(".mole"),
        inner: pit.querySelector(".mole-inner"),
        helmet: pit.querySelector(".m-helmet"),
        state: "idle",
        kind: "normal",
        hp: 1,
        hideDue: 0,
        lastHitAt: -1e9,
      });
    }
    const fx = document.createElement("div");
    fx.className = "fx-layer";
    field.appendChild(fx);
    el.fx = fx;
  }

  const pools = { pop: [], pt: [], rip: [] };

  function makePool(key, count, cls, parent) {
    for (let i = 0; i < count; i++) {
      const d = document.createElement("div");
      d.className = cls;
      d.style.display = "none";
      parent.appendChild(d);
      pools[key].push(d);
    }
  }

  function take(key) {
    const d = pools[key].shift();
    pools[key].push(d);
    return d;
  }

  function animateFx(node, frames, opt) {
    try {
      const a = node.animate(frames, opt);
      a.onfinish = () => {
        node.style.display = "none";
      };
    } catch (_) {
      node.style.display = "none";
    }
  }

  function popup(x, y, text, cls) {
    const d = take("pop");
    d.textContent = text;
    d.className = "pop " + cls;
    d.style.left = x + "px";
    d.style.top = y + "px";
    d.style.display = "block";
    animateFx(d, [
      { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
      { transform: "translate(-50%,-95%) scale(1.15)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%,-170%) scale(1)", opacity: 0 },
    ], { duration: 750, easing: "ease-out" });
  }

  function burst(x, y, count, color) {
    for (let k = 0; k < count; k++) {
      const d = take("pt");
      d.style.left = x + "px";
      d.style.top = y + "px";
      d.style.background = color;
      d.style.display = "block";
      const ang = Math.random() * Math.PI * 2;
      const dist = 34 + Math.random() * 46;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - 26;
      animateFx(d, [
        { transform: "translate(-50%,-50%) scale(0.5) rotate(0deg)", opacity: 1 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) scale(1) rotate(" + (180 + rand(180)) + "deg)", opacity: 0 },
      ], { duration: 480 + rand(240), easing: "cubic-bezier(.17,.67,.4,1)" });
    }
  }

  function ripple(x, y) {
    const d = take("rip");
    d.style.left = x + "px";
    d.style.top = y + "px";
    d.style.display = "block";
    animateFx(d, [
      { transform: "scale(0.3)", opacity: 0.9 },
      { transform: "scale(1.25)", opacity: 0 },
    ], { duration: 360, easing: "ease-out" });
  }

  let soundOn = storage.getItem(LS_SOUND) !== "0";

  function sfx(role, vol) {
    if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
  }

  function syncSoundBtn() {
    el.btnSound.classList.toggle("muted", !soundOn);
  }

  let state = "idle";
  let vt = 0;
  let nextSpawnDue = 450;
  let lastTs = 0;
  let lastSec = -1;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let hits = 0;
  let whiffs = 0;
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;
  let lastHitAnyAt = -1e9;
  let announcedMult = 1;
  let fieldRect = null;

  function cacheRect() {
    fieldRect = field.getBoundingClientRect();
  }

  function currentMult() {
    return combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
  }

  function renderScore() {
    el.score.textContent = String(score);
  }

  function renderCombo() {
    el.combo.textContent = String(combo);
    const mult = currentMult();
    el.mult.hidden = mult === 1;
    el.mult.textContent = "×" + mult;
  }

  function showBanner(mult) {
    el.banner.hidden = false;
    el.banner.textContent = "×" + mult + " 콤보!";
    el.banner.classList.remove("pop-in");
    void el.banner.offsetWidth;
    el.banner.classList.add("pop-in");
  }

  function hideBanner() {
    el.banner.hidden = true;
  }

  function pickKind(p) {
    const wn = lerp(0.8, 0.5, p);
    const wg = lerp(0.05, 0.17, p);
    let wb = lerp(0.07, 0.21, p);
    const wh = lerp(0.08, 0.12, p);
    if (vt < BOMB_HALF_UNTIL_MS) wb *= 0.5;
    let r = Math.random() * (wn + wg + wb + wh);
    if ((r -= wn) < 0) return "normal";
    if ((r -= wg) < 0) return "gold";
    if ((r -= wb) < 0) return "bomb";
    return "helm";
  }

  function activeCount() {
    let n = 0;
    for (const h of holes) if (h.state !== "idle") n++;
    return n;
  }

  function spawnOne(p) {
    if (activeCount() >= MAX_ACTIVE) return false;
    const empty = holes.filter((h) => h.state === "idle");
    if (!empty.length) return false;
    const h = empty[rand(empty.length)];
    const kind = pickKind(p);
    h.kind = kind;
    h.hp = kind === "helm" ? 2 : 1;
    h.state = "up";
    const m = h.mole;
    m.classList.remove("up", "is-angry");
    m.dataset.kind = kind;
    try {
      h.helmet.getAnimations().forEach((a) => a.cancel());
    } catch (_) {}
    h.helmet.style.display = kind === "helm" ? "block" : "none";
    void m.offsetWidth;
    m.classList.add("up");
    h.hideDue = vt + lerp(1100, 550, p) * KIND_UPTIME[kind];
    return true;
  }

  function doSpawn() {
    const p = clamp01(vt / DURATION_MS);
    if (!spawnOne(p)) return;
    if (p > 0.55 && Math.random() < 0.35) spawnOne(p);
  }

  function retire(h) {
    h.state = "idle";
    h.mole.classList.remove("up");
  }

  function renderTime(rem) {
    const frac = rem / DURATION_MS;
    el.fill.style.width = (frac * 100).toFixed(2) + "%";
    const stage = frac > 0.62 ? "gold" : frac > 0.28 ? "coral" : "red";
    if (el.timebar.dataset.stage !== stage) el.timebar.dataset.stage = stage;
    const sec = Math.ceil(rem / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      el.time.textContent = String(sec);
      el.time.classList.toggle("low", sec <= 10);
      el.timebar.classList.toggle("low", sec <= 10);
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs;
    lastTs = ts;
    if (state !== "playing") return;
    if (dt > 100) dt = 100;
    vt += dt;
    const rem = Math.max(0, DURATION_MS - vt);
    renderTime(rem);
    if (rem <= 0) {
      finish();
      return;
    }
    for (const h of holes) {
      if (h.state !== "idle" && vt >= h.hideDue) retire(h);
    }
    if (vt >= nextSpawnDue) {
      doSpawn();
      const p = clamp01(vt / DURATION_MS);
      nextSpawnDue = vt + lerp(900, 460, p) * (0.85 + Math.random() * 0.3);
    }
  }

  function holeCenter(pit) {
    if (!fieldRect) cacheRect();
    const r = pit.getBoundingClientRect();
    return {
      x: r.left - fieldRect.left + r.width / 2,
      y: r.top - fieldRect.top + r.height * 0.34,
    };
  }

  function squash(h) {
    try {
      h.inner.getAnimations().forEach((a) => a.cancel());
      h.inner.animate([
        { transform: "scale(1,1)" },
        { transform: "scale(1.22,0.68)", offset: 0.38 },
        { transform: "scale(1,1)" },
      ], { duration: 230, easing: "ease-out" });
    } catch (_) {}
  }

  function helmetFly(h) {
    const hel = h.helmet;
    try {
      hel.getAnimations().forEach((a) => a.cancel());
    } catch (_) {}
    hel.style.display = "block";
    try {
      const a = hel.animate([
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: "translate(-46px,-84px) rotate(-200deg)", opacity: 0 },
      ], { duration: 480, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" });
      a.onfinish = () => {
        hel.style.display = "none";
      };
    } catch (_) {
      hel.style.display = "none";
    }
  }

  function shake(cls) {
    field.classList.remove("shake-sm", "shake-lg");
    void field.offsetWidth;
    field.classList.add(cls);
  }

  field.addEventListener("animationend", () => {
    field.classList.remove("shake-sm", "shake-lg");
  });

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  function tapMark(e) {
    if (coarsePointer) ripple(e.clientX, e.clientY);
  }

  function strike(h, base, role, color, e) {
    hits++;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    const mult = currentMult();
    const gain = base * mult;
    score += gain;
    h.lastHitAt = vt;
    lastHitAnyAt = vt;
    const c = holeCenter(h.pit);
    popup(c.x, c.y - 8, "+" + gain + (mult > 1 ? " ×" + mult : ""), base >= 500 ? "gold" : "good");
    burst(c.x, c.y - 6, base >= 500 ? 9 : 6, color);
    sfx(role, base >= 500 ? 0.72 : 0.62);
    renderScore();
    renderCombo();
    if (mult > announcedMult) {
      announcedMult = mult;
      showBanner(mult);
      sfx("combo", 0.6);
    }
    tapMark(e);
  }

  function killMole(h, base, role, color, e) {
    h.state = "dying";
    h.hideDue = vt + 170;
    h.mole.classList.remove("up");
    strike(h, base, role, color, e);
    squash(h);
  }

  function hitHelmFirst(h, e) {
    h.hp = 1;
    helmetFly(h);
    h.mole.classList.add("is-angry");
    strike(h, POINTS.helmFirst, "thud", "#cfd8e0", e);
  }

  function hitBomb(h, e) {
    h.state = "dying";
    h.hideDue = vt + 240;
    h.mole.classList.remove("up");
    h.lastHitAt = vt;
    lastHitAnyAt = vt;
    score -= 300;
    const c = holeCenter(h.pit);
    popup(c.x, c.y - 8, "-300", "bad");
    burst(c.x, c.y - 6, 8, "#ff8f5b");
    shake("shake-lg");
    sfx("bomb", 0.8);
    if (window.CasualMobile) window.CasualMobile.vibrate(70);
    renderScore();
    tapMark(e);
  }

  function doWhiff(e) {
    whiffs++;
    if (combo > 0) {
      combo = 0;
      renderCombo();
    }
    if (announcedMult > 1) {
      announcedMult = 1;
      hideBanner();
    }
    shake("shake-sm");
    sfx("whoosh", 0.45);
    tapMark(e);
  }

  function onDown(e) {
    if (state !== "playing") return;
    e.preventDefault();
    const pit = e.target.closest(".pit");
    if (!pit) {
      if (vt - lastHitAnyAt > BG_GRACE_MS) doWhiff(e);
      else tapMark(e);
      return;
    }
    const h = holes[Number(pit.dataset.i)];
    if (h.state === "up") {
      if (h.kind === "bomb") {
        hitBomb(h, e);
        return;
      }
      if (h.kind === "helm" && h.hp === 2) {
        hitHelmFirst(h, e);
        return;
      }
      const gold = h.kind === "gold";
      killMole(h, gold ? POINTS.gold : POINTS.normal, gold ? "special" : "bigHit", gold ? "#ffd23c" : "#ffe9c4", e);
      return;
    }
    if (vt - h.lastHitAt < GRACE_MS) {
      tapMark(e);
      return;
    }
    doWhiff(e);
  }

  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (finePointer) document.body.classList.add("fine");

  let hammerX = 0;
  let hammerY = 0;
  let swingAnim = null;

  function hammerPlace() {
    el.hammer.style.transform = "translate(" + (hammerX - 30) + "px," + (hammerY - 24) + "px)";
  }

  function hammerMove(x, y) {
    hammerX = x;
    hammerY = y;
    if (swingAnim && swingAnim.playState === "running") return;
    hammerPlace();
  }

  function hammerSwing() {
    if (!finePointer) return;
    hammerPlace();
    try {
      if (swingAnim) swingAnim.cancel();
      const base = "translate(" + (hammerX - 30) + "px," + (hammerY - 24) + "px)";
      swingAnim = el.hammer.animate([
        { transform: base + " rotate(0deg)" },
        { transform: base + " rotate(-72deg)", offset: 0.42 },
        { transform: base + " rotate(0deg)" },
      ], { duration: 210, easing: "ease-out" });
      swingAnim.onfinish = () => {
        swingAnim = null;
      };
    } catch (_) {}
  }

  el.stage.addEventListener("pointermove", (e) => {
    if (!finePointer || document.body.classList.contains("ui-open")) return;
    el.hammer.classList.add("show");
    hammerMove(e.clientX, e.clientY);
  });
  el.stage.addEventListener("pointerdown", (e) => {
    if (!finePointer || document.body.classList.contains("ui-open")) return;
    el.hammer.classList.add("show");
    hammerMove(e.clientX, e.clientY);
    hammerSwing();
  });
  el.stage.addEventListener("pointerleave", () => {
    el.hammer.classList.remove("show");
  });

  function syncUiOpen() {
    const open = !el.overlay.hidden || !el.help.hidden;
    document.body.classList.toggle("ui-open", open);
  }

  function showOverlay(html) {
    el.card.innerHTML = html;
    el.overlay.hidden = false;
    syncUiOpen();
  }

  function hideOverlay() {
    el.overlay.hidden = true;
    syncUiOpen();
  }

  function syncPauseBtn() {
    el.btnPause.classList.toggle("is-paused", state === "paused");
  }

  function showReady() {
    showOverlay(
      "<h2>탭하여 시작!</h2>" +
      '<div class="legend">' +
      '<div class="lg"><i class="mini mini-normal"></i>일반 두더지<b>+100</b></div>' +
      '<div class="lg"><i class="mini mini-gold"></i>황금 두더지 🌟<b>+500 · 아주 빠름</b></div>' +
      '<div class="lg"><i class="mini mini-bomb"></i>폭탄 💣<b>-300 · 콤보 유지</b></div>' +
      '<div class="lg"><i class="mini mini-helm"></i>헬멧 두더지 🪖<b>2회 타격 +150/+300</b></div>' +
      "</div>" +
      '<p class="ready-tip">5연타 ×2 · 10연타 ×3 배율! 빈 구멍 탭은 콤보 리셋</p>' +
      '<button type="button" class="retry" id="btn-start">탭하여 시작!</button>'
    );
    $("btn-start").addEventListener("click", () => {
      sfx("click", 0.5);
      startRound();
    });
  }

  function showPauseCard() {
    showOverlay(
      "<h2>일시정지</h2>" +
      "<p>잠시 쉬어가는 중… 남은 시간은 그대로 보관돼요.</p>" +
      '<button type="button" class="retry" id="btn-resume">계속하기</button>'
    );
    $("btn-resume").addEventListener("click", () => {
      sfx("click", 0.5);
      resumeGame();
    });
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    syncPauseBtn();
    showPauseCard();
  }

  function resumeGame() {
    if (state !== "paused") return;
    hideOverlay();
    state = "playing";
    syncPauseBtn();
  }

  function startRound() {
    for (const h of holes) {
      h.state = "idle";
      h.kind = "normal";
      h.hp = 1;
      h.mole.classList.remove("up", "is-angry");
    }
    score = 0;
    combo = 0;
    maxCombo = 0;
    hits = 0;
    whiffs = 0;
    vt = 0;
    nextSpawnDue = 450;
    announcedMult = 1;
    lastHitAnyAt = -1e9;
    lastSec = -1;
    renderScore();
    renderCombo();
    hideBanner();
    el.best.textContent = String(best);
    renderTime(DURATION_MS);
    hideOverlay();
    state = "playing";
    syncPauseBtn();
    cacheRect();
  }

  function finish() {
    state = "over";
    for (const h of holes) retire(h);
    hideBanner();
    const isNew = score > best;
    if (isNew) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    el.best.textContent = String(best);
    const total = hits + whiffs;
    const acc = total ? Math.round((hits / total) * 100) + "%" : "–";
    if (isNew && window.CasualSfx) {
      window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.75);
    } else {
      sfx("lose", 0.7);
    }
    showOverlay(
      "<h2>시간 종료!</h2>" +
      (isNew ? '<div class="new-best">🏆 신기록!</div>' : "") +
      '<div class="result-grid">' +
      "<div class=\"rg\"><b>" + score + "</b><span>점수</span></div>" +
      "<div class=\"rg\"><b>" + best + "</b><span>최고</span></div>" +
      "<div class=\"rg\"><b>" + acc + "</b><span>정확도</span></div>" +
      "<div class=\"rg\"><b>" + maxCombo + "</b><span>최대 콤보</span></div>" +
      "</div>" +
      '<button type="button" class="retry" id="btn-retry">다시 하기</button>'
    );
    $("btn-retry").addEventListener("click", () => {
      sfx("click", 0.5);
      startRound();
    });
  }

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) {
        window.CasualSfx.unlock();
        sfx("click", 0.5);
      }
    }
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (!window.CasualSfx) return;
    window.CasualSfx.unlock();
    window.CasualSfx.preload(["bigHit", "whoosh", "special", "bomb", "combo", "thud", "lose", "click"]);
  }, { once: true });

  el.btnPause.addEventListener("click", () => {
    sfx("click", 0.5);
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
  });

  function openHelp() {
    if (!el.help.hidden) return;
    sfx("click", 0.5);
    if (state === "playing") pauseGame();
    el.help.hidden = false;
    syncUiOpen();
    el.btnHelpClose.focus();
  }

  function closeHelp() {
    if (el.help.hidden) return;
    el.help.hidden = true;
    syncUiOpen();
  }

  el.btnHelp.addEventListener("click", openHelp);
  el.btnHelpClose.addEventListener("click", () => {
    sfx("click", 0.5);
    closeHelp();
  });
  el.help.addEventListener("click", (e) => {
    if (e.target === el.help) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.help.hidden) closeHelp();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state === "playing") pauseGame();
  });

  window.addEventListener("resize", cacheRect);

  buildField();
  makePool("pop", 10, "pop", el.fx);
  makePool("pt", 36, "pt", el.fx);
  makePool("rip", 6, "ripple", el.tapFx);
  el.best.textContent = String(best);
  renderTime(DURATION_MS);
  cacheRect();
  showReady();
  requestAnimationFrame(frame);
})();
