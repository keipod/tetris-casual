(() => {
  "use strict";

  const LS_DEX = "catch_dex_v1";
  const LS_SOUND = "catch_sound";
  const POKE_API = "https://pokeapi.co/api/v2";
  const POKE_CDN = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const POKE_ANIM = `${POKE_CDN}/versions/generation-v/black-white/animated`;
  const POKE_ART = `${POKE_CDN}/other/official-artwork`;
  const POKE_CRY = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
  const DRAG_THRESHOLD = 14;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SPECIES_IDS = [
    "1", "4", "7", "25", "39", "52", "54",
    "133", "134", "135", "136", "143", "172", "175", "183", "194",
    "196", "197", "252", "255", "258", "280", "311", "312",
    "387", "390", "393", "417", "427", "447", "470", "471", "506", "700",
  ];

  const ROUTES = ["초원 3번도로", "햇살 목장", "바람 언덕", "물결 연못", "이슬 숲길", "노을 들판"];

  const TYPE_KO = {
    normal: "노말", fire: "불꽃", water: "물", grass: "풀", electric: "전기", ice: "얼음",
    fighting: "격투", poison: "독", ground: "땅", flying: "비행", psychic: "에스퍼",
    bug: "벌레", rock: "바위", ghost: "고스트", dragon: "드래곤", dark: "악",
    steel: "강철", fairy: "페어리",
  };

  const TYPE_STYLE = {
    normal: { edge: "#8a8068", a: "#e8e0c8", b: "#c8c0a8", chip: "#A8A878" },
    fire: { edge: "#c45a18", a: "#ffd0a0", b: "#f08030", chip: "#F08030" },
    water: { edge: "#3a58b8", a: "#c8dcff", b: "#6890F0", chip: "#6890F0" },
    grass: { edge: "#3d8b28", a: "#d8f0b8", b: "#78C850", chip: "#78C850" },
    electric: { edge: "#c9a010", a: "#fff3b0", b: "#F8D030", chip: "#F8D030" },
    ice: { edge: "#5aa0b0", a: "#e0f6f6", b: "#98D8D8", chip: "#98D8D8" },
    fighting: { edge: "#8a2018", a: "#f0c0b8", b: "#C03028", chip: "#C03028" },
    poison: { edge: "#702870", a: "#e8c8e8", b: "#A040A0", chip: "#A040A0" },
    ground: { edge: "#a88830", a: "#f4e6b8", b: "#E0C068", chip: "#E0C068" },
    flying: { edge: "#7060c0", a: "#ddd4ff", b: "#A890F0", chip: "#A890F0" },
    psychic: { edge: "#c03860", a: "#ffd0e0", b: "#F85888", chip: "#F85888" },
    bug: { edge: "#7a8820", a: "#e8f0a8", b: "#A8B820", chip: "#A8B820" },
    rock: { edge: "#887828", a: "#ece0b0", b: "#B8A038", chip: "#B8A038" },
    ghost: { edge: "#483868", a: "#d0c8e8", b: "#705898", chip: "#705898" },
    dragon: { edge: "#4820c0", a: "#d0c0ff", b: "#7038F8", chip: "#7038F8" },
    dark: { edge: "#403830", a: "#c8b8a8", b: "#705848", chip: "#705848" },
    steel: { edge: "#7878a0", a: "#e8e8f4", b: "#B8B8D0", chip: "#B8B8D0" },
    fairy: { edge: "#c06880", a: "#ffd8e4", b: "#EE99AC", chip: "#EE99AC" },
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const roamLayer = document.getElementById("roamers");
  const dexCountEl = document.getElementById("dex-count");
  const btnSound = document.getElementById("btn-sound");
  const btnDex = document.getElementById("btn-dex");
  const cardOverlay = document.getElementById("card-overlay");
  const dexOverlay = document.getElementById("dex-overlay");
  const dexCardEl = document.getElementById("dex-card");
  const dexGrid = document.getElementById("dex-grid");
  const dexEmpty = document.getElementById("dex-empty");
  const catchToast = document.getElementById("catch-toast");

  const storage = (() => {
    try {
      localStorage.setItem("__c", "1");
      localStorage.removeItem("__c");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  function emptyDex() {
    return { caught: {} };
  }

  function parseDex(raw) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !data.caught || typeof data.caught !== "object") {
        return emptyDex();
      }
      return { caught: data.caught };
    } catch (_) {
      return emptyDex();
    }
  }

  function serializeDex(dex) {
    return JSON.stringify({ caught: dex.caught || {} });
  }

  function loadDex() {
    return parseDex(storage.getItem(LS_DEX) || "");
  }

  function saveDex(dex) {
    storage.setItem(LS_DEX, serializeDex(dex));
  }

  function rollStars(rng = Math.random) {
    const r = rng();
    if (r < 0.08) return 5;
    if (r < 0.22) return 4;
    if (r < 0.48) return 3;
    if (r < 0.78) return 2;
    return 1;
  }

  function rollIv(rng = Math.random) {
    const n = () => Math.floor(rng() * 32);
    return { hp: n(), atk: n() };
  }

  function catchChance(size) {
    const smallBonus = size < 62 ? 0.08 : 0;
    return 0.62 + smallBonus;
  }

  function rollCatch(size, rng = Math.random) {
    return rng() < catchChance(size);
  }

  function mergeCatch(caught, id, stars, now, route, iv) {
    const prev = caught[id];
    if (!prev) {
      return {
        ...caught,
        [id]: { count: 1, bestStars: stars, caughtAt: now, route, iv },
      };
    }
    const better = stars >= (prev.bestStars || 0);
    return {
      ...caught,
      [id]: {
        count: (prev.count || 1) + 1,
        bestStars: Math.max(prev.bestStars || 0, stars),
        caughtAt: prev.caughtAt || now,
        route: prev.route || route,
        iv: better ? iv : (prev.iv || iv),
      },
    };
  }

  let dex = loadDex();
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let W = 0, H = 0, R = 16;
  let restX = 0, cannonY = 0, maxPull = 110, padX = 10, padY = 12;
  let roamers = [];
  let flying = null;
  let aiming = false;
  let aimAngle = -Math.PI / 2;
  let pullX = 0, pullY = 0, pullDist = 0, pullPower = 0;
  let pointerId = null;
  let dragStartX = 0, dragStartY = 0;
  let hasDragged = false;
  let resolving = false;
  let toastTimer = 0;
  const speciesCache = new Map();
  const cryAudio = { el: null };

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  function haptic(ms = 14) {
    try { navigator.vibrate(ms); } catch (_) {}
  }

  const SFX = (() => {
    const clips = {};
    const bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.28;
    bgm.preload = "auto";
    ["throw", "shake", "catch", "flee", "snap"].forEach((name) => {
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
        node.volume = 0.7;
        const p = node.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    };
    const tone = (freq, dur, type = "sine", vol = 0.1) => {
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
    window.addEventListener("pointerdown", () => {
      try { init(); } catch (_) {}
      syncBgm();
    }, { once: true });
    return {
      init,
      syncBgm,
      pull(p) { if (!soundOn) return; tone(180 + p * 220, 0.05, "triangle", 0.04); },
      snap() { if (!soundOn) return; if (!playClip("snap")) tone(140, 0.08, "square", 0.05); },
      throw() { if (!soundOn) return; if (!playClip("throw")) { tone(320, 0.12, "sine", 0.07); tone(180, 0.18, "triangle", 0.04); } },
      shake() { if (!soundOn) return; if (!playClip("shake")) tone(90, 0.09, "square", 0.06); },
      catch() { if (!soundOn) return; if (!playClip("catch")) { tone(520, 0.16, "sine", 0.08); tone(780, 0.22, "triangle", 0.05); } },
      flee() { if (!soundOn) return; if (!playClip("flee")) { tone(220, 0.2, "sawtooth", 0.04); tone(140, 0.28, "triangle", 0.05); } },
    };
  })();

  function playPokemonCry(id) {
    if (!soundOn) return;
    try {
      if (cryAudio.el) {
        cryAudio.el.pause();
        cryAudio.el = null;
      }
      const audio = new Audio(`${POKE_CRY}/${id}.ogg`);
      audio.volume = 0.55;
      cryAudio.el = audio;
      audio.play().catch(() => {});
    } catch (_) {}
  }

  function loadSprite(src) {
    const img = new Image();
    img.src = src;
    return img;
  }
  const ballSprite = loadSprite("assets/pokeball.png");
  const sparkleSprite = loadSprite("assets/sparkle.png");
  const pouchSprite = loadSprite("assets/pouch.png");

  function spriteReady(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function updateDexCount() {
    const n = Object.keys(dex.caught).length;
    dexCountEl.textContent = `${n}/${SPECIES_IDS.length}`;
  }

  function minPull() {
    return Math.max(18, R * 0.7);
  }

  function pointerToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function inLauncherZone(x, y) {
    return y >= cannonY - R * 3.2 && y <= H + 8;
  }

  function clampAngle(a) {
    const min = (-165 * Math.PI) / 180;
    const max = (-15 * Math.PI) / 180;
    return Math.max(min, Math.min(max, a));
  }

  function setPullFromPointer(clientX, clientY) {
    const pt = pointerToCanvas(clientX, clientY);
    const dx = pt.x - restX;
    const dy = pt.y - cannonY;
    const fire = clampAngle(Math.atan2(-dy, -dx));
    const dist = Math.min(maxPull, Math.hypot(dx, dy));
    pullX = restX - Math.cos(fire) * dist;
    pullY = cannonY - Math.sin(fire) * dist;
    aimAngle = fire;
    pullDist = dist;
    pullPower = dist / maxPull;
    if (pullDist > minPull()) SFX.pull(pullPower);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.max(14, Math.min(20, W * 0.042));
    restX = W * 0.5;
    cannonY = H - R * 2.4;
    maxPull = Math.max(90, Math.min(140, H * 0.22));
    padX = Math.max(10, W * 0.04);
    padY = Math.max(12, H * 0.04);
  }

  function spawnRoamer(id) {
    const img = document.createElement("img");
    img.src = `${POKE_ANIM}/${id}.gif`;
    img.alt = "";
    img.addEventListener("pointerdown", (e) => {
      const roamer = roamers.find((r) => r.el === img);
      if (roamer) onRoamerTap(roamer, e);
    });
    roamLayer.appendChild(img);
    const size = 52 + Math.random() * 28;
    const fieldW = W - padX * 2;
    const fieldH = Math.max(80, cannonY - R * 3.2 - padY);
    const roamer = {
      el: img,
      id,
      x: padX + Math.random() * Math.max(20, fieldW - size),
      y: padY + 20 + Math.random() * Math.max(40, fieldH - size),
      vx: (0.22 + Math.random() * 0.42) * (Math.random() < 0.5 ? -1 : 1),
      vy: (0.12 + Math.random() * 0.32) * (Math.random() < 0.5 ? -1 : 1),
      size,
      alive: true,
      reactUntil: 0,
      reactTimer: null,
    };
    roamers.push(roamer);
    return roamer;
  }

  function setupRoamers() {
    roamLayer.innerHTML = "";
    roamers = [];
    const pool = SPECIES_IDS.slice();
    const n = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      spawnRoamer(pool.splice(idx, 1)[0]);
    }
  }

  function spawnReplacement() {
    const used = new Set(roamers.filter((r) => r.alive).map((r) => r.id));
    const pool = SPECIES_IDS.filter((id) => !used.has(id));
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : SPECIES_IDS[Math.floor(Math.random() * SPECIES_IDS.length)];
    spawnRoamer(pick);
  }

  function onRoamerTap(roamer, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!roamer.alive || resolving) return;
    playPokemonCry(roamer.id);
    haptic(10);
    roamer.el.classList.add("react");
    roamer.reactUntil = performance.now() + 420;
    clearTimeout(roamer.reactTimer);
    roamer.reactTimer = setTimeout(() => roamer.el.classList.remove("react"), 420);
  }

  function roamerAt(clientX, clientY) {
    const pt = pointerToCanvas(clientX, clientY);
    for (let i = roamers.length - 1; i >= 0; i--) {
      const r = roamers[i];
      if (!r.alive) continue;
      if (pt.x >= r.x && pt.x <= r.x + r.size && pt.y >= r.y && pt.y <= r.y + r.size * 0.95) return r;
    }
    return null;
  }

  function hitRoamer(x, y) {
    const rad = R * 0.95;
    for (let i = roamers.length - 1; i >= 0; i--) {
      const r = roamers[i];
      if (!r.alive) continue;
      const cx = r.x + r.size * 0.5;
      const cy = r.y + r.size * 0.55;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= (rad + r.size * 0.32) ** 2) return r;
    }
    return null;
  }

  function fireBall() {
    if (flying || resolving) return false;
    if (pullDist < minPull()) return false;
    const t = Math.max(0, Math.min(1, pullPower));
    const speed = R * (0.28 + t * t * 1.45);
    flying = {
      x: restX,
      y: cannonY,
      vx: Math.cos(aimAngle) * speed,
      vy: Math.sin(aimAngle) * speed,
    };
    SFX.throw();
    pullDist = 0;
    pullPower = 0;
    pullX = restX;
    pullY = cannonY;
    return true;
  }

  function showToast(text) {
    catchToast.hidden = false;
    catchToast.textContent = text;
    catchToast.classList.remove("show");
    void catchToast.offsetWidth;
    catchToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      catchToast.hidden = true;
      catchToast.classList.remove("show");
    }, 900);
  }

  async function fetchSpecies(id) {
    if (speciesCache.has(id)) return speciesCache.get(id);
    const [poke, species] = await Promise.all([
      fetch(`${POKE_API}/pokemon/${id}`).then((r) => r.json()),
      fetch(`${POKE_API}/pokemon-species/${id}`).then((r) => r.json()),
    ]);
    const ko = (species.names || []).find((n) => n.language?.name === "ko");
    const en = (species.names || []).find((n) => n.language?.name === "en");
    const flavorKo = (species.flavor_text_entries || []).find((f) => f.language?.name === "ko");
    const flavorEn = (species.flavor_text_entries || []).find((f) => f.language?.name === "en");
    const flavor = (flavorKo?.flavor_text || flavorEn?.flavor_text || "")
      .replace(/[\f\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const types = (poke.types || []).map((t) => t.type?.name).filter(Boolean);
    const art = poke.sprites?.other?.["official-artwork"]?.front_default
      || poke.sprites?.front_default
      || `${POKE_ART}/${id}.png`;
    const info = {
      id,
      ko: ko?.name || en?.name || `#${id}`,
      en: en?.name || "",
      flavor,
      types,
      height: poke.height,
      weight: poke.weight,
      art,
    };
    speciesCache.set(id, info);
    return info;
  }

  function starLine(n) {
    return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function formatCaughtAt(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  }

  function typeVars(types) {
    const primary = types[0] || "normal";
    const st = TYPE_STYLE[primary] || TYPE_STYLE.normal;
    return {
      "--type-edge": st.edge,
      "--type-grad": `linear-gradient(165deg, ${st.a} 0%, ${st.b} 100%)`,
    };
  }

  function applyVars(el, vars) {
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  }

  function renderCard(el, info, entry, { reveal = false } = {}) {
    const vars = typeVars(info.types);
    applyVars(el, vars);
    el.className = "dex-card" + (reveal && !reducedMotion ? " reveal" : "");
    const chips = info.types.map((t) => {
      const st = TYPE_STYLE[t] || TYPE_STYLE.normal;
      const label = TYPE_KO[t] || t;
      return `<span class="type-chip" style="background:${st.chip}">${label}</span>`;
    }).join("");
    const iv = entry.iv || { hp: 0, atk: 0 };
    const no = String(info.id).padStart(3, "0");
    el.innerHTML = `
      <div class="dex-card-frame">
        <div class="dex-card-head">
          <span class="dex-no">#${no}</span>
          <h2 id="card-name">${esc(info.ko)}</h2>
          <span class="dex-en">${esc(info.en)}</span>
        </div>
        <div class="dex-art-wrap"><img alt="${esc(info.ko)}" src="${esc(info.art)}"></div>
        <div class="dex-types">${chips}</div>
        <p class="dex-flavor">${esc(info.flavor || "초원에서 만난 포켓몬.")}</p>
        <div class="dex-meta"><span>${(info.height / 10).toFixed(1)} m</span><span>${(info.weight / 10).toFixed(1)} kg</span></div>
        <div class="dex-foot">
          <span class="dex-stars">${starLine(entry.bestStars || 1)}</span>
          <span>${esc(entry.route || "")} · ${formatCaughtAt(entry.caughtAt)}</span>
          <span>개체값 HP ${iv.hp} / 공격 ${iv.atk}${entry.count > 1 ? ` · ${entry.count}마리` : ""}</span>
        </div>
      </div>`;
  }

  function bindCardTilt(el) {
    if (reducedMotion) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--tilt-y", `${(px - 0.5) * 16}deg`);
      el.style.setProperty("--tilt-x", `${(0.5 - py) * 12}deg`);
      el.style.setProperty("--foil-x", `${px * 100}%`);
      el.style.setProperty("--foil-y", `${py * 100}%`);
    };
    const reset = () => {
      el.style.setProperty("--tilt-y", "0deg");
      el.style.setProperty("--tilt-x", "0deg");
    };
    el.onpointermove = onMove;
    el.onpointerleave = reset;
  }

  async function openCard(id, { reveal = false } = {}) {
    const entry = dex.caught[id];
    if (!entry) return;
    let info;
    try {
      info = await fetchSpecies(id);
    } catch (_) {
      info = {
        id, ko: `#${id}`, en: "", flavor: "", types: ["normal"],
        height: 10, weight: 100, art: `${POKE_ART}/${id}.png`,
      };
    }
    renderCard(dexCardEl, info, entry, { reveal });
    bindCardTilt(dexCardEl);
    cardOverlay.classList.remove("hidden");
  }

  async function renderDexGrid() {
    const ids = Object.keys(dex.caught).sort((a, b) => Number(a) - Number(b));
    dexEmpty.classList.toggle("hidden", ids.length > 0);
    dexGrid.innerHTML = "";
    for (const id of ids) {
      let info;
      try {
        info = await fetchSpecies(id);
      } catch (_) {
        info = { id, ko: `#${id}`, types: ["normal"], art: `${POKE_CDN}/${id}.png` };
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dex-thumb";
      applyVars(btn, typeVars(info.types));
      btn.innerHTML = `<img alt="" src="${esc(info.art)}"><span>${esc(info.ko)}</span>`;
      btn.addEventListener("click", () => {
        dexOverlay.classList.add("hidden");
        openCard(id);
      });
      dexGrid.appendChild(btn);
    }
  }

  async function resolveHit(roamer) {
    resolving = true;
    flying = { x: roamer.x + roamer.size * 0.5, y: roamer.y + roamer.size * 0.45, vx: 0, vy: 0, shaking: true, shakeT: 0 };
    roamer.el.style.visibility = "hidden";
    for (let i = 0; i < 3; i++) {
      SFX.shake();
      haptic(18);
      flying.shakeT = 1;
      await wait(reducedMotion ? 120 : 380);
    }
    const ok = rollCatch(roamer.size);
    if (ok) {
      const stars = rollStars();
      const iv = rollIv();
      const now = Date.now();
      const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
      dex.caught = mergeCatch(dex.caught, roamer.id, stars, now, route, iv);
      saveDex(dex);
      updateDexCount();
      SFX.catch();
      haptic([12, 40, 24]);
      playPokemonCry(roamer.id);
      showToast("잡았다!");
      roamer.alive = false;
      roamer.el.remove();
      roamers = roamers.filter((r) => r !== roamer);
      flying = null;
      await openCard(roamer.id, { reveal: true });
      spawnReplacement();
    } else {
      SFX.flee();
      showToast("놓쳤다!");
      playPokemonCry(roamer.id);
      roamer.alive = false;
      roamer.el.remove();
      roamers = roamers.filter((r) => r !== roamer);
      flying = null;
      spawnReplacement();
    }
    resolving = false;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function drawSprite(img, x, y, size) {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  function drawBallFallback(r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#f2f2f2";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.fillStyle = "#d94444";
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f7f7";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#d0d0d0";
    ctx.fill();
  }

  function drawBall(x, y, scale = 1) {
    const r = R * scale;
    ctx.save();
    ctx.translate(x, y);
    if (flying?.shaking) ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5);
    if (spriteReady(ballSprite)) drawSprite(ballSprite, 0, 0, r * 2.15);
    else drawBallFallback(r);
    if (flying?.shaking && spriteReady(sparkleSprite)) {
      ctx.globalAlpha = 0.85;
      drawSprite(sparkleSprite, 0, -r * 0.2, r * 3.2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPouch() {
    if (!spriteReady(pouchSprite) || flying) return;
    const size = R * 3.6;
    drawSprite(pouchSprite, restX, cannonY + R * 0.85, size);
  }

  function drawAim() {
    if (!aiming || !hasDragged) {
      drawBall(restX, cannonY, 1);
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(pullX, pullY);
    ctx.lineTo(restX, cannonY);
    ctx.stroke();
    ctx.restore();
    const steps = 8;
    const t = pullPower;
    const speed = R * (0.28 + t * t * 1.45);
    let x = restX;
    let y = cannonY;
    let vx = Math.cos(aimAngle) * speed;
    let vy = Math.sin(aimAngle) * speed;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < steps; i++) {
      x += vx * 4;
      y += vy * 4;
      vy += 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBall(pullX, pullY, 1);
  }

  function updateRoamers() {
    const minX = padX + 4;
    const maxX = W - padX - 4;
    const minY = padY + 16;
    const maxY = cannonY - R * 3.4;
    for (const r of roamers) {
      if (!r.alive) continue;
      r.x += r.vx;
      r.y += r.vy;
      if (r.x < minX) { r.x = minX; r.vx = Math.abs(r.vx); }
      if (r.x > maxX - r.size) { r.x = maxX - r.size; r.vx = -Math.abs(r.vx); }
      if (r.y < minY) { r.y = minY; r.vy = Math.abs(r.vy); }
      if (r.y > maxY - r.size) { r.y = maxY - r.size; r.vy = -Math.abs(r.vy); }
      if (Math.random() < 0.006) r.vx *= -1;
      if (Math.random() < 0.005) r.vy *= -1;
      r.el.style.width = `${r.size}px`;
      const flip = r.vx < 0 ? -1 : 1;
      const squash = r.reactUntil > performance.now() ? " scaleY(0.88)" : "";
      r.el.style.transform = `translate(${r.x}px, ${r.y}px) scaleX(${flip})${squash}`;
    }
  }

  function tick() {
    if (flying && !flying.shaking) {
      flying.x += flying.vx;
      flying.y += flying.vy;
      flying.vy += 0.085;
      if (flying.x < R || flying.x > W - R) flying.vx *= -0.82;
      const hit = hitRoamer(flying.x, flying.y);
      if (hit) {
        resolveHit(hit);
      } else if (flying.y > H + R || flying.y < -R * 4) {
        flying = null;
      }
    }
    updateRoamers();
    ctx.clearRect(0, 0, W, H);
    drawPouch();
    if (flying) drawBall(flying.x, flying.y, flying.shaking ? 1.05 : 0.92);
    else drawAim();
    requestAnimationFrame(tick);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (flying || resolving || !cardOverlay.classList.contains("hidden") || !dexOverlay.classList.contains("hidden")) return;
    const tapped = roamerAt(e.clientX, e.clientY);
    if (tapped) {
      onRoamerTap(tapped, e);
      return;
    }
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!inLauncherZone(pt.x, pt.y)) return;
    e.preventDefault();
    SFX.init();
    SFX.syncBgm();
    canvas.setPointerCapture(e.pointerId);
    pointerId = e.pointerId;
    aiming = true;
    hasDragged = false;
    dragStartX = pt.x;
    dragStartY = pt.y;
    pullDist = 0;
    pullPower = 0;
    pullX = restX;
    pullY = cannonY;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!aiming) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!hasDragged && Math.hypot(pt.x - dragStartX, pt.y - dragStartY) < DRAG_THRESHOLD) return;
    hasDragged = true;
    setPullFromPointer(e.clientX, e.clientY);
  });

  function releaseAim(e) {
    if (!aiming) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    if (hasDragged) setPullFromPointer(e.clientX, e.clientY);
    aiming = false;
    pointerId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (hasDragged && pullDist >= minPull()) {
      fireBall();
    } else {
      SFX.snap();
      pullX = restX;
      pullY = cannonY;
      pullDist = 0;
      pullPower = 0;
    }
    hasDragged = false;
  }

  canvas.addEventListener("pointerup", releaseAim);
  window.addEventListener("pointerup", releaseAim);
  canvas.addEventListener("pointercancel", () => {
    aiming = false;
    pointerId = null;
    hasDragged = false;
    pullX = restX;
    pullY = cannonY;
    pullDist = 0;
    pullPower = 0;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", resize);

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn) {
      SFX.init();
      SFX.syncBgm();
    } else {
      SFX.syncBgm();
      if (cryAudio.el) cryAudio.el.pause();
    }
  });

  btnDex.addEventListener("click", async () => {
    await renderDexGrid();
    dexOverlay.classList.remove("hidden");
  });

  document.getElementById("btn-dex-close").addEventListener("click", () => {
    dexOverlay.classList.add("hidden");
  });

  document.getElementById("btn-card-close").addEventListener("click", () => {
    cardOverlay.classList.add("hidden");
  });

  function wouldFireFromGesture(dragged, dist) {
    return !!(dragged && dist >= minPull());
  }

  function selfTest() {
    const out = [];
    const check = (name, pass, extra) => out.push({ name, pass: !!pass, ...extra });
    check("tap does not fire", wouldFireFromGesture(false, 80) === false);
    check("short drag does not fire", wouldFireFromGesture(true, minPull() - 1) === false);
    check("drag release fires", wouldFireFromGesture(true, minPull() + 8) === true);

    const seq = [0.01, 0.99, 0.4];
    let i = 0;
    const rng = () => seq[i++] ?? 0.5;
    check("catch roll uses chance", typeof rollCatch(50, rng) === "boolean");

    const merged = mergeCatch({}, "25", 3, 1000, "초원 3번도로", { hp: 10, atk: 12 });
    check("first catch stored", merged["25"].count === 1 && merged["25"].bestStars === 3);
    const dup = mergeCatch(merged, "25", 5, 2000, "바람 언덕", { hp: 30, atk: 31 });
    check("duplicate updates stars", dup["25"].count === 2 && dup["25"].bestStars === 5 && dup["25"].route === "초원 3번도로");
    check("better iv kept", dup["25"].iv.hp === 30);

    const raw = serializeDex({ caught: dup });
    const parsed = parseDex(raw);
    check("serialize roundtrip", parsed.caught["25"].count === 2);
    check("bad json fallback", parseDex("{").caught && Object.keys(parseDex("{").caught).length === 0);
    check("species pool size", SPECIES_IDS.length >= 25);
    return { ok: out.every((t) => t.pass), tests: out };
  }

  window.__catch = {
    selfTest,
    loadDex,
    saveDex,
    parseDex,
    serializeDex,
    mergeCatch,
    rollCatch,
    rollStars,
    wouldFireFromGesture,
    get dex() { return dex; },
    get roaming() { return roamers.length; },
  };

  syncSoundBtn();
  updateDexCount();
  resize();
  setupRoamers();
  tick();
})();
