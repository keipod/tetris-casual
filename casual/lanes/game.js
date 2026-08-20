(() => {
  "use strict";

  const C = window.LanesCombat;
  const LS_SOUND = "lanes_sound";
  const POKE_ANIM = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated";
  const POKE_STILL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const field = document.getElementById("field");
  const fx = document.getElementById("fx");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const dock = document.getElementById("dock");
  const slotsEl = document.getElementById("slots");
  const goldEl = document.getElementById("gold");
  const hpYouEl = document.getElementById("hp-you");
  const hpThemEl = document.getElementById("hp-them");
  const barYou = document.getElementById("bar-you");
  const barThem = document.getElementById("bar-them");
  const waveLabel = document.getElementById("wave-label");
  const btnSound = document.getElementById("btn-sound");

  const storage = (() => {
    try {
      localStorage.setItem("__l", "1");
      localStorage.removeItem("__l");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  const sprites = new Map();
  const sparks = [];
  let world = null;
  let playing = false;
  let lastTs = 0;
  let fieldRect = { width: 1, height: 1 };
  let bossAlerted = false;

  function spriteUrl(id) {
    return `${POKE_ANIM}/${id}.gif`;
  }

  function stillUrl(id) {
    return `${POKE_STILL}/${id}.png`;
  }

  function slotUrl(key) {
    return `assets/slot-${key}.png`;
  }

  function preload(id) {
    const img = new Image();
    img.src = spriteUrl(id);
    img.onerror = () => { img.src = stillUrl(id); };
  }

  C.ALLIES.concat(C.ENEMIES, [C.BOSS]).forEach((d) => preload(d.id));
  C.ALLIES.forEach((d) => {
    const img = new Image();
    img.src = slotUrl(d.key);
    img.onerror = () => { img.src = stillUrl(d.id); };
  });

  const SFX = (() => {
    const clips = {};
    const bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.26;
    bgm.preload = "auto";
    ["spawn", "hit", "win", "lose", "boss"].forEach((name) => {
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
    const playClip = (name, vol = 0.72) => {
      const src = clips[name];
      if (!src) return false;
      try {
        const node = src.cloneNode();
        node.volume = vol;
        const p = node.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    };
    const tone = (freq, dur, type = "sine", vol = 0.08) => {
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
      if (soundOn && playing) {
        const p = bgm.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        bgm.pause();
      }
    };
    return {
      init,
      syncBgm,
      spawn() { if (!soundOn) return; if (!playClip("spawn", 0.65)) tone(440, 0.06, "triangle"); },
      hit() { if (!soundOn) return; if (!playClip("hit", 0.55)) tone(280, 0.05, "square", 0.05); },
      boss() { if (!soundOn) return; if (!playClip("boss", 0.8)) { tone(120, 0.2, "sawtooth"); tone(90, 0.25, "sine"); } },
      win() { if (!soundOn) return; if (!playClip("win")) { tone(523, 0.12); tone(659, 0.14); tone(784, 0.22); } },
      lose() { if (!soundOn) return; if (!playClip("lose")) tone(196, 0.28, "sine"); },
    };
  })();

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
    SFX.syncBgm();
  }

  function worldToPx(x) {
    return (x / C.WORLD_W) * fieldRect.width;
  }

  function groundY() {
    return fieldRect.height * 0.82;
  }

  function measure() {
    fieldRect = field.getBoundingClientRect();
  }

  function waveText(elapsed) {
    if (elapsed >= 72) return "보스 출현";
    if (elapsed >= 40) return "후반 웨이브";
    if (elapsed >= 18) return "중반 웨이브";
    return "초반 웨이브";
  }

  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function titleScreen() {
    playing = false;
    dock.hidden = true;
    SFX.syncBgm();
    showOverlay(`
      <h1>포켓몬 대전쟁</h1>
      <p>골드로 유닛을 뽑아 오른쪽 기지를 밀어 주세요. 내 기지가 무너지면 패배입니다.</p>
      <button class="btn" type="button" id="btn-start">출전</button>
    `);
    document.getElementById("btn-start").addEventListener("click", () => {
      if (soundOn) SFX.init();
      startGame();
    });
  }

  function endScreen(result) {
    playing = false;
    SFX.syncBgm();
    const win = result === "win";
    if (win) SFX.win();
    else SFX.lose();
    showOverlay(`
      <h2>${win ? "승리" : "패배"}</h2>
      <p>${win ? "적 기지를 파괴했습니다." : "내 기지가 무너졌습니다."}</p>
      <button class="btn" type="button" id="btn-retry">다시하기</button>
    `);
    document.getElementById("btn-retry").addEventListener("click", () => {
      if (soundOn) SFX.init();
      startGame();
    });
  }

  function buildSlots() {
    slotsEl.innerHTML = "";
    C.ALLIES.forEach((def, i) => {
      const btn = document.createElement("button");
      btn.className = "slot";
      btn.type = "button";
      btn.dataset.slot = String(i);
      btn.setAttribute("aria-label", `${def.name} ${def.cost}골드`);
      const icon = document.createElement("img");
      icon.alt = "";
      icon.width = 44;
      icon.height = 44;
      icon.src = slotUrl(def.key);
      icon.onerror = () => { icon.src = stillUrl(def.id); };
      btn.innerHTML = `
        <span class="cd-mask"></span>
        <span class="name">${def.name}</span>
        <span class="cost">${def.cost}</span>
      `;
      btn.insertBefore(icon, btn.firstChild.nextSibling);
      btn.addEventListener("click", () => {
        if (!playing) return;
        const res = C.trySpawnAlly(world, i);
        if (res.ok) SFX.spawn();
      });
      slotsEl.appendChild(btn);
    });
  }

  function unitEl(unit) {
    let el = sprites.get(unit.uid);
    if (!el) {
      el = document.createElement("div");
      el.className = "unit" + (unit.side === -1 ? " enemy" : "") + (unit.boss ? " boss" : "");
      el.innerHTML = `<span class="unit-hp"><i></i></span><img alt="${unit.name}" draggable="false" />`;
      const img = el.querySelector("img");
      img.src = spriteUrl(unit.pokeId);
      img.onerror = () => { img.src = stillUrl(unit.pokeId); };
      field.appendChild(el);
      sprites.set(unit.uid, el);
      if (unit.boss && !bossAlerted) {
        bossAlerted = true;
        SFX.boss();
      }
    }
    return el;
  }

  function syncSprites() {
    const live = new Set();
    const gy = groundY();
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      live.add(u.uid);
      const el = unitEl(u);
      const size = u.boss ? Math.round(u.h * 1.15) : u.h;
      const img = el.querySelector("img");
      img.style.width = size + "px";
      img.style.height = size + "px";
      img.style.transform = u.side === 1 ? "scaleX(-1)" : "scaleX(1)";
      el.style.transform = `translate(${worldToPx(u.x)}px, ${gy}px) translate(-50%, -100%)`;
      el.querySelector("i").style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%";
      if (u.didHit) {
        spawnSpark(u.lastHitX);
        SFX.hit();
        u.didHit = false;
      }
    }
    sprites.forEach((el, uid) => {
      if (!live.has(uid)) {
        el.remove();
        sprites.delete(uid);
      }
    });
  }

  function spawnSpark(x) {
    if (reducedMotion) return;
    const el = document.createElement("div");
    el.className = "spark";
    el.style.left = worldToPx(x) + "px";
    el.style.top = groundY() - 36 + "px";
    fx.appendChild(el);
    sparks.push({ el, t: 0.22 });
  }

  function updateHud() {
    goldEl.textContent = String(Math.floor(world.gold));
    hpYouEl.textContent = String(Math.max(0, Math.ceil(world.bases.player.hp)));
    hpThemEl.textContent = String(Math.max(0, Math.ceil(world.bases.enemy.hp)));
    const py = world.bases.player.hp / world.bases.player.maxHp;
    const ey = world.bases.enemy.hp / world.bases.enemy.maxHp;
    barYou.style.transform = `scaleX(${Math.max(0, py)})`;
    barThem.style.transform = `scaleX(${Math.max(0, ey)})`;
    waveLabel.textContent = waveText(world.elapsed);

    const buttons = slotsEl.querySelectorAll(".slot");
    buttons.forEach((btn, i) => {
      const def = C.ALLIES[i];
      const cd = world.slotCd[i];
      const mask = btn.querySelector(".cd-mask");
      mask.style.height = def.cd > 0 ? (cd / def.cd) * 100 + "%" : "0";
      btn.disabled = !playing || cd > 0 || world.gold < def.cost || world.units.length >= C.MAX_UNITS;
    });
  }

  function startGame() {
    world = C.createWorld();
    bossAlerted = false;
    sprites.forEach((el) => el.remove());
    sprites.clear();
    fx.innerHTML = "";
    sparks.length = 0;
    playing = true;
    lastTs = 0;
    dock.hidden = false;
    hideOverlay();
    updateHud();
    syncSprites();
    SFX.syncBgm();
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!playing || !world) return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    const result = C.tick(world, dt);
    for (let i = sparks.length - 1; i >= 0; i--) {
      sparks[i].t -= dt;
      sparks[i].el.style.opacity = String(Math.max(0, sparks[i].t / 0.22));
      if (sparks[i].t <= 0) {
        sparks[i].el.remove();
        sparks.splice(i, 1);
      }
    }
    syncSprites();
    updateHud();
    if (result) endScreen(result);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn) SFX.init();
  });

  buildSlots();
  measure();
  window.addEventListener("resize", measure);
  syncSoundBtn();
  titleScreen();
  requestAnimationFrame(loop);
})();
