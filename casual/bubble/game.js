(() => {
  "use strict";

  const COLS = 11;
  const INIT_ROWS = 4;
  const MAX_ROWS = 15;
  const NUM_COLORS = 6;
  const POP_MIN = 3;
  const PRESSURE_START_MS = 42000;
  const PRESSURE_MIN_MS = 18000;
  const CLEAR_BONUS = 1000;
  const LS_BEST = "bubble_best";
  const LS_SOUND = "bubble_sound";
  const LS_TERRAIN = "bubble_terrain_url";
  const LS_MEADOW = "bubble_meadow_url";
  const AIROUTER_BASE = "/api/airouter";
  const AIROUTER_DIRECT = "http://192.168.223.101:20101";
  const POKE_CDN = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const POKE_ANIM = `${POKE_CDN}/versions/generation-v/black-white/animated`;
  const POKE_CRY = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
  const SLING_ID = "25";
  const SQRT3_2 = 0.8660254037844386;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COLORS = [
    { fill: "#E15A4A", deep: "#9B2F28", glow: "#F4A090", label: "coral" },
    { fill: "#E0A03A", deep: "#9A6418", glow: "#F3D08A", label: "amber" },
    { fill: "#D2C24A", deep: "#8A7A18", glow: "#EFE6A4", label: "citron" },
    { fill: "#3CBB88", deep: "#1B7A56", glow: "#9BE0C4", label: "foam" },
    { fill: "#3A7FD4", deep: "#1C4E96", glow: "#9EC2F0", label: "cobalt" },
    { fill: "#9A6BB8", deep: "#623A84", glow: "#D2B4E8", label: "orchid" },
  ];

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const comboEl = document.getElementById("combo");
  const pressureBar = document.getElementById("pressure-bar");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const btnSound = document.getElementById("btn-sound");
  const comboToast = document.getElementById("combo-toast");

  const storage = (() => {
    try {
      localStorage.setItem("__b", "1");
      localStorage.removeItem("__b");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  let W = 0, H = 0, R = 18, D = 36, rowH = 31, padX = 8, padY = 16;
  let dangerY = 0, cannonY = 0, pullWell = 150, maxPull = 110, restX = 0;
  let grid = [];
  let stagger = 0;
  let state = "ready";
  let score = 0;
  let best = +(storage.getItem(LS_BEST) || 0);
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let combo = 0;

  let currentColor = 0;
  let nextColor = 0;
  let flying = null;
  let aiming = false;
  let aimAngle = -Math.PI / 2;
  let pullX = 0, pullY = 0, pullDist = 0, pullPower = 0;
  let pointerId = null;
  let dragStartX = 0, dragStartY = 0;
  let hasDragged = false;
  const DRAG_THRESHOLD = 14;
  let lastPullTone = 0;
  let recoilUntil = 0;
  const roamLayer = document.getElementById("roamers");
  const slingshotEl = document.getElementById("slingshot-pokemon");
  const terrainLeft = document.querySelector(".terrain-left");
  const terrainRight = document.querySelector(".terrain-right");
  const meadowGrass = document.querySelector(".meadow-grass");
  const ROAM_IDS = ["1","4","7","39","52","54","133","143","172","175","183","194","252","255","258","280","311","312","387","390","393","417","427","447","506"];
  let roamers = [];

  const pokeSprites = {
    idle: `${POKE_ANIM}/${SLING_ID}.gif`,
    pull: `${POKE_CDN}/back/${SLING_ID}.png`,
    release: `${POKE_CDN}/back/${SLING_ID}.png`,
    grumpy: `${POKE_CDN}/${SLING_ID}.png`,
  };
  let pullGenToken = 0;
  let pullGenBusy = false;
  let pullGenRequested = false;
  let releaseGenToken = 0;
  let releaseGenBusy = false;
  let releaseGenRequested = false;
  let slingshotVisible = false;

  let pressureElapsed = 0;
  let pressureInterval = PRESSURE_START_MS;
  let pressurePushes = 0;

  let shake = 0;
  let shakeDecay = 0;
  let flash = 0;
  const particles = [];
  const popups = [];
  const falling = [];
  const rings = [];
  const trails = [];
  let toastTimer = 0;

  bestEl.textContent = best;
  syncSoundBtn();

  const SFX = (() => {
    let actx;
    const init = () => {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
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
    const noiseBurst = (dur, vol = 0.08) => {
      if (!soundOn) return;
      try {
        const a = init();
        const n = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = a.createBufferSource();
        src.buffer = n;
        const g = a.createGain();
        const f = a.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1400;
        g.gain.setValueAtTime(vol, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
        src.connect(f); f.connect(g); g.connect(a.destination);
        src.start();
      } catch (_) {}
    };
    return {
      init,
      pull(p) {
        const now = performance.now();
        if (now - lastPullTone < 70) return;
        lastPullTone = now;
        tone(140 + p * 260, 0.05, "triangle", 0.04 + p * 0.05);
      },
      shoot(p = 0.6) {
        noiseBurst(0.09, 0.07);
        tone(220 + p * 180, 0.12, "square", 0.1);
        tone(620, 0.08, "sine", 0.08);
      },
      bounce() { tone(410, 0.06, "triangle", 0.07); noiseBurst(0.04, 0.04); },
      impact() { tone(90, 0.12, "sine", 0.1); noiseBurst(0.08, 0.06); },
      snap() { tone(180, 0.08, "sine", 0.06); },
      pop(n) {
        noiseBurst(0.1, 0.06);
        for (let i = 0; i < Math.min(n, 6); i++) {
          setTimeout(() => tone(720 + i * 90, 0.1, "sine", 0.09), i * 32);
        }
      },
      drop(n) { tone(330, 0.15, "square", 0.08); setTimeout(() => tone(220 + n * 18, 0.22, "sine", 0.06), 80); },
      combo(n) { tone(880 + n * 100, 0.16, "sine", 0.12); },
      pressure() { tone(160, 0.28, "sine", 0.08); },
      gameOver() { tone(220, 0.4, "sawtooth", 0.08); setTimeout(() => tone(110, 0.6, "sawtooth", 0.06), 250); },
      win() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, "sine", 0.1), i * 120));
      },
    };
  })();

  const BGM = (() => {
    let actx;
    let master;
    let loopTimer = null;
    let running = false;
    const tempo = 108;
    const beat = 60 / tempo;
    const MELODY = [
      { f: 523.25, d: 1 }, { f: 587.33, d: 1 }, { f: 659.25, d: 1 }, { f: 783.99, d: 1 },
      { f: 659.25, d: 1 }, { f: 587.33, d: 2 }, { f: 523.25, d: 2 },
      { f: 493.88, d: 1 }, { f: 587.33, d: 1 }, { f: 659.25, d: 2 }, { f: 523.25, d: 2 },
    ];
    const BASS = [
      { f: 130.81, d: 4 }, { f: 146.83, d: 4 }, { f: 164.81, d: 4 }, { f: 130.81, d: 4 },
    ];

    function init() {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.075;
        master.connect(actx.destination);
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    }

    function note(freq, start, dur, type, vol) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur - 0.03);
      o.connect(g);
      g.connect(master);
      o.start(start);
      o.stop(start + dur);
    }

    function playBar(start) {
      let t = start;
      for (const n of MELODY) {
        const dur = n.d * beat * 0.92;
        note(n.f, t, dur, "square", 0.09);
        note(n.f * 0.5, t, dur, "triangle", 0.045);
        t += n.d * beat;
      }
      let bt = start;
      for (const n of BASS) {
        note(n.f, bt, n.d * beat * 0.95, "triangle", 0.14);
        bt += n.d * beat;
      }
    }

    function loopLen() {
      return MELODY.reduce((s, n) => s + n.d, 0) * beat * 1000;
    }

    function start() {
      if (running || !soundOn) return;
      init();
      running = true;
      playBar(actx.currentTime + 0.06);
      loopTimer = setInterval(() => {
        if (!running || !soundOn) return;
        playBar(actx.currentTime + 0.06);
      }, loopLen() - 60);
    }

    function stop() {
      running = false;
      if (loopTimer) clearInterval(loopTimer);
      loopTimer = null;
    }

    return { start, stop, init };
  })();

  let bgmStarted = false;
  function ensureBgm() {
    if (!soundOn) return;
    BGM.start();
    bgmStarted = true;
  }

  const haptic = (ms = 12) => { try { navigator.vibrate(ms); } catch (_) {} };

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  function airouterUrl(path) {
    const useProxy = window.location.protocol.startsWith("http")
      && !window.location.hostname.includes("192.168.223.101");
    const base = useProxy ? AIROUTER_BASE : AIROUTER_DIRECT;
    return `${base}${path}`;
  }

  function rewriteArtifactUrl(url) {
    if (!url || typeof url !== "string") return url;
    const m = url.match(/\/v1\/jobs\/([^/]+)\/artifact$/);
    if (!m) return url;
    const useProxy = window.location.protocol.startsWith("http")
      && !window.location.hostname.includes("192.168.223.101");
    return useProxy
      ? `${AIROUTER_BASE}/v1/jobs/${m[1]}/artifact`
      : url;
  }

  async function stripLightBackground(blobUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const cx = c.getContext("2d");
          cx.drawImage(img, 0, 0);
          const imgData = cx.getImageData(0, 0, c.width, c.height);
          const px = imgData.data;
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i], g = px[i + 1], b = px[i + 2];
            const lum = (r + g + b) / 3;
            if (lum > 248 && Math.max(r, g, b) - Math.min(r, g, b) < 18) px[i + 3] = 0;
            else if (lum > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 28) px[i + 3] = Math.round(px[i + 3] * 0.25);
          }
          cx.putImageData(imgData, 0, 0);
          c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : blobUrl), "image/png");
        } catch (_) {
          resolve(blobUrl);
        }
      };
      img.onerror = () => resolve(blobUrl);
      img.src = blobUrl;
    });
  }

  async function airouterImage(prompt, size = "512x512") {
    try {
      const res = await fetch(airouterUrl("/v1/images/generations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "t2i_z_image_turbo_v1",
          prompt,
          size,
          response_format: "url",
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const rawUrl = data?.data?.[0]?.url;
      const url = rewriteArtifactUrl(rawUrl);
      if (!url) return null;
      const imgRes = await fetch(url);
      if (!imgRes.ok) return url;
      const blob = await imgRes.blob();
      const raw = URL.createObjectURL(blob);
      return stripLightBackground(raw);
    } catch (_) {
      return null;
    }
  }

  async function generatePullSprite() {
    if (pullGenBusy || pullGenRequested) return;
    pullGenRequested = true;
    pullGenBusy = true;
    const token = ++pullGenToken;
    const url = await airouterImage(
      "cute pikachu pulling a slingshot backwards, straining determined face, pokemon anime style, full body side view, vibrant yellow, isolated character, fully transparent background, alpha channel, no floor, no shadow backdrop",
    );
    pullGenBusy = false;
    if (token !== pullGenToken || !url) return;
    pokeSprites.pull = url;
    if (aiming && pullDist > minPull()) updateSlingshotPokemon();
  }

  async function generateReleaseSprite() {
    if (releaseGenBusy || releaseGenRequested) return;
    releaseGenRequested = true;
    releaseGenBusy = true;
    const token = ++releaseGenToken;
    const url = await airouterImage(
      "cute pikachu launching from slingshot, excited dynamic pose, pokemon anime style, motion blur feeling, vibrant yellow, clean simple background",
    );
    releaseGenBusy = false;
    if (token !== releaseGenToken || !url) return;
    pokeSprites.release = url;
    if (performance.now() < recoilUntil) updateSlingshotPokemon();
  }

  async function ensureTerrainBackground() {
    const meadowCached = storage.getItem(LS_MEADOW);
    if (meadowCached) applyMeadowUrl(meadowCached);
    const cached = storage.getItem(LS_TERRAIN);
    if (cached) {
      applyTerrainUrl(cached);
      return;
    }
    const url = await airouterImage(
      "pokemon route meadow, lush tall grass field, wild flowers, gentle hills, bright summer sky, game background art, rich greens and soft blues",
      "768x512",
    );
    if (!url) return;
    storage.setItem(LS_TERRAIN, url);
    storage.setItem(LS_MEADOW, url);
    applyTerrainUrl(url);
    applyMeadowUrl(url);
  }

  function applyMeadowUrl(url) {
    if (!meadowGrass || !url) return;
    meadowGrass.style.background = `
      linear-gradient(180deg, transparent 0%, transparent 34%, rgba(47,122,38,0.12) 52%, rgba(34,96,28,0.28) 100%),
      url("${url}") center bottom / cover no-repeat`;
    meadowGrass.style.opacity = "0.95";
    meadowGrass.style.mixBlendMode = "normal";
  }

  function applyTerrainUrl(url) {
    const bg = `linear-gradient(90deg, rgba(47,122,38,0.45) 0%, transparent 68%), url("${url}") 20% center / cover no-repeat`;
    if (terrainLeft) terrainLeft.style.background = bg;
    if (terrainRight) terrainRight.style.background = bg;
  }

  function playPokemonCry(id) {
    if (!soundOn) return;
    try {
      const audio = new Audio(`${POKE_CRY}/${id}.ogg`);
      audio.volume = 0.55;
      audio.play().catch(() => {});
    } catch (_) {}
  }

  function onRoamerBubbleHit(r, x, y, colorIdx) {
    if (!r.alive) return;
    r.hits += 1;
    playPokemonCry(r.id);
    haptic(22);
    SFX.impact();
    spawnRing(x, y, COLORS[colorIdx]?.glow || "#f4f1ea", 8);
    if (r.hits >= 2) {
      r.alive = false;
      spawnBurst(x, y, colorIdx, 10);
      r.el.style.transition = "opacity 0.35s ease, transform 0.35s ease";
      r.el.style.opacity = "0";
      r.el.style.transform += " scale(0.2)";
      setTimeout(() => {
        r.el.remove();
        roamers = roamers.filter((o) => o !== r);
      }, 380);
      return;
    }
    r.hurtUntil = performance.now() + 900;
    r.el.classList.add("hurt");
    r.el.src = `${POKE_CDN}/${r.id}.png`;
    clearTimeout(r.hurtTimer);
    r.hurtTimer = setTimeout(() => {
      if (!r.alive) return;
      r.el.classList.remove("hurt");
      r.el.src = `${POKE_ANIM}/${r.id}.gif`;
    }, 900);
  }

  function roamerHitTest(x, y, bubbleR = R) {
    for (let i = roamers.length - 1; i >= 0; i--) {
      const r = roamers[i];
      if (!r.alive) continue;
      const cx = r.x + r.size * 0.5;
      const cy = r.y + r.size * 0.82;
      const hitR = r.size * 0.38;
      if (Math.hypot(x - cx, y - cy) < bubbleR + hitR) return r;
    }
    return null;
  }
  function roamerAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (let i = roamers.length - 1; i >= 0; i--) {
      const r = roamers[i];
      if (!r.alive) continue;
      if (x >= r.x && x <= r.x + r.size && y >= r.y && y <= r.y + r.size) return r;
    }
    return null;
  }

  function onRoamerTap(roamer, e) {
    if (e?.stopPropagation) e.stopPropagation();
    if (!roamer.alive || roamer.grumpyUntil > performance.now()) return;
    roamer.grumpyUntil = performance.now() + 900;
    roamer.el.classList.add("grumpy");
    roamer.el.src = `${POKE_CDN}/${roamer.id}.png`;
    playPokemonCry(roamer.id);
    haptic(22);
    SFX.snap();
    clearTimeout(roamer.grumpyTimer);
    roamer.grumpyTimer = setTimeout(() => {
      if (!roamer.alive) return;
      roamer.el.classList.remove("grumpy");
      roamer.el.src = `${POKE_ANIM}/${roamer.id}.gif`;
      roamer.grumpyUntil = 0;
    }, 900);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn) {
      SFX.init();
      BGM.init();
      ensureBgm();
    } else {
      BGM.stop();
      bgmStarted = false;
    }
  });

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

    pullWell = Math.max(136, Math.min(H * 0.28, 220));
    padY = 16;
    const rW = (W - 20) / (COLS + 0.5) / 2;
    const rH = (H - pullWell - padY - 56) / 25.22;
    R = Math.max(11, Math.floor(Math.min(rW, rH)));
    D = R * 2;
    rowH = D * SQRT3_2;
    const gridW = (COLS + 0.5) * D;
    padX = (W - gridW) / 2;
    dangerY = padY + D + (MAX_ROWS - 2) * rowH;
    cannonY = H - pullWell + R * 1.05;
    if (cannonY - R * 1.7 < dangerY + 28) cannonY = dangerY + 28 + R * 1.7;
    cannonY = Math.min(cannonY, H - 24);
    restX = W / 2;
    maxPull = Math.max(72, Math.min(H - cannonY - 8, pullWell - 18, R * 6));
    if (!aiming) {
      pullX = restX;
      pullY = cannonY;
      pullDist = 0;
      pullPower = 0;
    }
    setupRoamers();
  }

  function emptyGrid() {
    grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(-1));
  }

  function isShifted(r) {
    return ((r + stagger) & 1) === 1;
  }

  function cellCenter(r, c) {
    const x = padX + R + c * D + (isShifted(r) ? R : 0);
    const y = padY + R + r * rowH;
    return { x, y };
  }

  function inBounds(r, c) {
    return r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS;
  }

  function neighbors(r, c) {
    const offs = isShifted(r)
      ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]
      : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
    return offs
      .map(([dc, dr]) => [r + dr, c + dc])
      .filter(([rr, cc]) => inBounds(rr, cc));
  }

  function randColor() {
    return Math.floor(Math.random() * NUM_COLORS);
  }

  function remainingColors() {
    const seen = new Set();
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] >= 0) seen.add(grid[r][c]);
      }
    }
    return [...seen];
  }

  function pickShotColor() {
    const live = remainingColors();
    if (!live.length) return randColor();
    return live[Math.floor(Math.random() * live.length)];
  }

  function wouldPop(r, c, color) {
    const prev = grid[r][c];
    grid[r][c] = color;
    const n = bfsSameColor(r, c).length;
    grid[r][c] = prev;
    return n >= POP_MIN;
  }

  function fillInitial() {
    emptyGrid();
    stagger = 0;
    for (let r = 0; r < INIT_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let placed = randColor();
        const left = c > 0 ? grid[r][c - 1] : -1;
        if (left >= 0 && Math.random() < 0.45) placed = left;
        else {
          const nbs = neighbors(r, c).filter(([nr, nc]) => grid[nr][nc] >= 0);
          if (nbs.length && Math.random() < 0.4) {
            const [nr, nc] = nbs[Math.floor(Math.random() * nbs.length)];
            placed = grid[nr][nc];
          }
        }
        for (let t = 0; t < 10 && wouldPop(r, c, placed); t++) placed = randColor();
        grid[r][c] = placed;
      }
    }
  }

  function walls() {
    return { left: padX + R, right: padX + COLS * D };
  }

  function pushPressureRow() {
    for (let r = MAX_ROWS - 1; r > 0; r--) grid[r] = grid[r - 1].slice();
    stagger ^= 1;
    grid[0] = Array.from({ length: COLS }, () => randColor());
    for (let c = 0; c < COLS; c++) {
      let col = grid[0][c];
      for (let t = 0; t < 8 && wouldPop(0, c, col); t++) col = randColor();
      grid[0][c] = col;
    }
    pressurePushes++;
    pressureInterval = Math.max(PRESSURE_MIN_MS, PRESSURE_START_MS - pressurePushes * 350);
    SFX.pressure();
    haptic(30);
    triggerShake(7, 320);
    spawnRing(W / 2, padY + 18, "#2bb8a3", 10);
    if (checkDanger()) endGame(false);
  }

  function checkDanger() {
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] >= 0) {
          const { y } = cellCenter(r, c);
          if (y + R >= dangerY - 0.5) return true;
        }
      }
    }
    return false;
  }

  function countFilled() {
    let n = 0;
    for (let r = 0; r < MAX_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] >= 0) n++;
    return n;
  }

  function bfsSameColor(sr, sc) {
    const color = grid[sr][sc];
    if (color < 0) return [];
    const visited = new Set();
    const queue = [[sr, sc]];
    const group = [];
    visited.add(`${sr},${sc}`);
    while (queue.length) {
      const [r, c] = queue.shift();
      group.push([r, c]);
      for (const [nr, nc] of neighbors(r, c)) {
        const k = `${nr},${nc}`;
        if (!visited.has(k) && grid[nr][nc] === color) {
          visited.add(k);
          queue.push([nr, nc]);
        }
      }
    }
    return group;
  }

  function bfsCeilingConnected() {
    const connected = new Set();
    const queue = [];
    for (let c = 0; c < COLS; c++) {
      if (grid[0][c] >= 0) {
        queue.push([0, c]);
        connected.add(`0,${c}`);
      }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [nr, nc] of neighbors(r, c)) {
        const k = `${nr},${nc}`;
        if (!connected.has(k) && grid[nr][nc] >= 0) {
          connected.add(k);
          queue.push([nr, nc]);
        }
      }
    }
    return connected;
  }

  function isAttachable(r, c) {
    if (!inBounds(r, c) || grid[r][c] >= 0) return false;
    if (r === 0) return true;
    for (const [nr, nc] of neighbors(r, c)) {
      if (grid[nr][nc] >= 0) return true;
    }
    return false;
  }

  function closestCandidate(fx, fy, list) {
    let bestCell = null;
    let bestDist = Infinity;
    for (const [r, c] of list) {
      const { x, y } = cellCenter(r, c);
      const d = (x - fx) ** 2 + (y - fy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestCell = { r, c };
      }
    }
    return bestCell;
  }

  function findSnapFromHit(fx, fy, hitR, hitC) {
    const local = neighbors(hitR, hitC).filter(([r, c]) => isAttachable(r, c));
    if (local.length) return closestCandidate(fx, fy, local);
    return findSnapFallback(fx, fy);
  }

  function findSnapCeiling(fx, fy) {
    const list = [];
    for (let c = 0; c < COLS; c++) if (grid[0][c] < 0) list.push([0, c]);
    if (list.length) return closestCandidate(fx, fy, list);
    return findSnapFallback(fx, fy);
  }

  function findSnapFallback(fx, fy) {
    const list = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isAttachable(r, c)) list.push([r, c]);
      }
    }
    return closestCandidate(fx, fy, list);
  }

  function hitTest(x, y, radius = D * 0.92) {
    let best = null;
    let bestDist = radius;
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] < 0) continue;
        const p = cellCenter(r, c);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { r, c, d };
        }
      }
    }
    return best;
  }

  function landBubble(r, c, color, impactX, impactY) {
    if (!inBounds(r, c) || grid[r][c] >= 0) {
      const fb = findSnapFallback(cellCenter(r, c).x, cellCenter(r, c).y);
      if (!fb) return;
      r = fb.r; c = fb.c;
    }
    const p = cellCenter(r, c);
    spawnImpact(impactX ?? p.x, impactY ?? p.y, color);
    grid[r][c] = color;
    resolveLanding(r, c);
  }

  function showToast(text) {
    comboToast.hidden = false;
    comboToast.textContent = text;
    comboToast.classList.remove("show");
    void comboToast.offsetWidth;
    comboToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      comboToast.classList.remove("show");
      comboToast.hidden = true;
    }, 700);
  }

  function resolveLanding(r, c) {
    const group = bfsSameColor(r, c);
    let popped = 0;
    if (group.length >= POP_MIN) {
      combo++;
      for (const [pr, pc] of group) {
        const p = cellCenter(pr, pc);
        spawnBurst(p.x, p.y, grid[pr][pc]);
        grid[pr][pc] = -1;
        popped++;
      }
      SFX.pop(popped);
      haptic(18 + combo * 6);
      triggerShake(4 + combo, 180);
      flash = Math.max(flash, 0.18);
    } else {
      combo = 0;
    }

    const connected = bfsCeilingConnected();
    let dropped = 0;
    for (let rr = 0; rr < MAX_ROWS; rr++) {
      for (let cc = 0; cc < COLS; cc++) {
        if (grid[rr][cc] >= 0 && !connected.has(`${rr},${cc}`)) {
          const p = cellCenter(rr, cc);
          falling.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 3,
            vy: 1.2 + Math.random() * 2,
            rot: (Math.random() - 0.5) * 0.2,
            color: grid[rr][cc],
            life: 1,
          });
          spawnBurst(p.x, p.y, grid[rr][cc], 8);
          grid[rr][cc] = -1;
          dropped++;
        }
      }
    }
    if (dropped > 0) {
      SFX.drop(dropped);
      haptic(28);
      triggerShake(6, 220);
    }

    const removed = popped + dropped;
    let pts = popped * 10 + dropped * 20;
    if (removed >= 10) pts *= 2;
    if (removed >= 15) pts = Math.floor(pts * 1.5);
    if (combo > 1) pts *= combo;
    if (pts > 0) {
      score += pts;
      spawnPopup(r, c, `+${pts}`);
    }
    if (combo > 1) {
      SFX.combo(combo);
      showToast(`×${combo}`);
    } else if (removed >= 10) {
      showToast(removed >= 15 ? "AMAZING" : "COMBO");
    }

    if (countFilled() === 0) {
      score += CLEAR_BONUS;
      spawnPopup(r, c, `클리어 +${CLEAR_BONUS}`);
    }

    scoreEl.textContent = score;
    comboEl.textContent = combo;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      storage.setItem(LS_BEST, String(best));
    }

    const live = remainingColors();
    if (live.length) {
      if (!live.includes(currentColor)) currentColor = pickShotColor();
      if (!live.includes(nextColor)) nextColor = pickShotColor();
    }

    if (countFilled() === 0) endGame(true);
    else if (checkDanger()) endGame(false);
  }

  function spawnParticles(x, y, colorIdx, count = 12) {
    const col = COLORS[colorIdx] || COLORS[0];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        life: 1,
        color: col.glow,
        size: 2.5 + Math.random() * 4,
        kind: "dot",
      });
    }
  }

  function spawnBurst(x, y, colorIdx, extra = 14) {
    spawnParticles(x, y, colorIdx, extra);
    const col = COLORS[colorIdx] || COLORS[0];
    spawnRing(x, y, col.glow, R * 0.4);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.2;
      const sp = 3 + Math.random() * 5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color: col.fill,
        size: 5 + Math.random() * 4,
        rot: a,
        kind: "shard",
      });
    }
  }

  function spawnRing(x, y, color, r0 = 6) {
    rings.push({ x, y, r: r0, max: r0 + 38, life: 1, color });
  }

  function spawnImpact(x, y, colorIdx) {
    const col = COLORS[colorIdx] || COLORS[0];
    spawnRing(x, y, "#f4f1ea", 8);
    spawnRing(x, y, col.glow, 4);
    spawnParticles(x, y, colorIdx, 16);
    SFX.impact();
    triggerShake(5, 140);
    flash = Math.max(flash, 0.22);
  }

  function spawnPopup(r, c, text) {
    const { x, y } = cellCenter(Math.max(0, r), Math.max(0, Math.min(COLS - 1, c)));
    popups.push({ x, y, text, life: 1, vy: -1.6 });
  }

  function triggerShake(amt, dur) {
    if (reducedMotion) return;
    shake = Math.max(shake, amt);
    shakeDecay = amt / Math.max(1, dur / 16);
  }

  function minPull() {
    return Math.max(18, R * 0.65);
  }

  function pointerToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function inLauncherZone(x, y) {
    const wellTop = cannonY - R * 2.2;
    return y >= wellTop && y <= H + 4 && x >= padX - R && x <= padX + (COLS + 0.5) * D + R;
  }

  function fireBubble(fromPull = false) {
    if (flying || state !== "playing") return false;
    const power = fromPull ? pullPower : 0.55;
    if (fromPull && pullDist < minPull()) {
      SFX.snap();
      pullX = restX;
      pullY = cannonY;
      pullDist = 0;
      pullPower = 0;
      return false;
    }
    const t = Math.max(0, Math.min(1, power));
    const speed = R * (0.22 + t * t * 1.35);
    const ox = restX;
    const oy = cannonY;
    flying = {
      x: ox,
      y: oy,
      vx: Math.cos(aimAngle) * speed,
      vy: Math.sin(aimAngle) * speed,
      color: currentColor,
      squash: 1.25,
    };
    spawnRing(ox, oy, COLORS[currentColor].glow, 6);
    for (let i = 0; i < 10; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const a = aimAngle + spread;
      particles.push({
        x: ox, y: oy,
        vx: Math.cos(a) * (2 + Math.random() * 6),
        vy: Math.sin(a) * (2 + Math.random() * 6),
        life: 0.8,
        color: COLORS[currentColor].glow,
        size: 2 + Math.random() * 3,
        kind: "dot",
      });
    }
    currentColor = nextColor;
    nextColor = pickShotColor();
    pullX = restX;
    pullY = cannonY;
    pullDist = 0;
    pullPower = 0;
    SFX.shoot(power);
    haptic(14 + power * 12);
    triggerShake(3 + power * 4, 120);
    flash = Math.max(flash, 0.12);
    recoilUntil = performance.now() + 380;
    generateReleaseSprite();
    return true;
  }

  function updateFlying() {
    if (!flying) return;
    flying.squash += (1 - flying.squash) * 0.18;
    const { left, right } = walls();
    const top = padY + R;
    const speed = Math.hypot(flying.vx, flying.vy);
    const steps = Math.max(4, Math.ceil(speed / 3));
    const dx = flying.vx / steps;
    const dy = flying.vy / steps;

    for (let s = 0; s < steps; s++) {
      flying.x += dx;
      flying.y += dy;
      if ((s & 1) === 0) {
        trails.push({ x: flying.x, y: flying.y, color: flying.color, life: 0.55, r: R * 0.7 });
      }

      const roamerHit = roamerHitTest(flying.x, flying.y);
      if (roamerHit) {
        const color = flying.color;
        const ix = flying.x;
        const iy = flying.y;
        flying = null;
        spawnImpact(ix, iy, color);
        onRoamerBubbleHit(roamerHit, ix, iy, color);
        combo = 0;
        comboEl.textContent = "0";
        return;
      }

      if (flying.x < left) {
        flying.x = left;
        flying.vx = Math.abs(flying.vx);
        flying.squash = 1.35;
        spawnWallSparks(left - R, flying.y, 1);
        SFX.bounce();
        haptic(8);
      } else if (flying.x > right) {
        flying.x = right;
        flying.vx = -Math.abs(flying.vx);
        flying.squash = 1.35;
        spawnWallSparks(right + R, flying.y, -1);
        SFX.bounce();
        haptic(8);
      }

      if (flying.y <= top) {
        const snap = findSnapCeiling(flying.x, flying.y);
        const color = flying.color;
        const ix = flying.x, iy = flying.y;
        flying = null;
        if (snap) landBubble(snap.r, snap.c, color, ix, iy);
        return;
      }

      const hit = hitTest(flying.x, flying.y);
      if (hit) {
        const snap = findSnapFromHit(flying.x, flying.y, hit.r, hit.c);
        const color = flying.color;
        const ix = flying.x, iy = flying.y;
        flying = null;
        if (snap) landBubble(snap.r, snap.c, color, ix, iy);
        else endGame(false);
        return;
      }

      if (flying.y > H + R) {
        flying = null;
        combo = 0;
        comboEl.textContent = "0";
        return;
      }
    }
  }

  function spawnWallSparks(x, y, dir) {
    spawnRing(x + dir * 6, y, "#f4f1ea", 5);
    for (let i = 0; i < 7; i++) {
      particles.push({
        x, y,
        vx: dir * (2 + Math.random() * 4),
        vy: (Math.random() - 0.5) * 6,
        life: 0.8,
        color: "#f4f1ea",
        size: 2 + Math.random() * 2,
        kind: "dot",
      });
    }
  }

  function traceAimPath() {
    const { left, right } = walls();
    const top = padY + R;
    let x = restX;
    let y = cannonY;
    let vx = Math.cos(aimAngle);
    let vy = Math.sin(aimAngle);
    const pts = [{ x, y }];
    const step = 5;
    let dist = 0;
    let bounces = 0;
    const maxDist = Math.max(W, H) * 3;
    while (dist < maxDist && bounces <= 5) {
      x += vx * step;
      y += vy * step;
      dist += step;
      let bounced = false;
      if (x < left) { x = left; vx = Math.abs(vx); bounced = true; }
      else if (x > right) { x = right; vx = -Math.abs(vx); bounced = true; }
      if (bounced) {
        bounces++;
        pts.push({ x, y });
      }
      if (y <= top) {
        pts.push({ x, y });
        return { pts, snap: findSnapCeiling(x, y) };
      }
      const hit = hitTest(x, y);
      if (hit) {
        pts.push({ x, y });
        return { pts, snap: findSnapFromHit(x, y, hit.r, hit.c) };
      }
    }
    pts.push({ x, y });
    return { pts, snap: null };
  }

  function drawBubble(x, y, colorIdx, alpha = 1, scale = 1, squash = 1) {
    const col = COLORS[colorIdx] || COLORS[0];
    const rad = R * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(2 - squash, squash);
    const g = ctx.createRadialGradient(-rad * 0.32, -rad * 0.38, rad * 0.08, 0, 0, rad);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.18, col.glow);
    g.addColorStop(0.62, col.fill);
    g.addColorStop(1, col.deep);
    ctx.beginPath();
    ctx.arc(0, 0, rad - 0.6, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-rad * 0.28, -rad * 0.32, rad * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, rad * 0.06);
    ctx.arc(0, 0, rad * 0.86, 0.15, 1.15);
    ctx.stroke();
    ctx.restore();
  }

  function forkPosts() {
    const w = R * 1.85;
    return [
      { x: restX - w, y: cannonY + R * 0.15 },
      { x: restX + w, y: cannonY + R * 0.15 },
    ];
  }

  function drawSling() {
    const wellTop = cannonY - R * 1.6;
    const wellH = H - wellTop + 8;
    const wellX = padX + 6;
    const wellW = (COLS + 0.5) * D - 12;
    roundRect(wellX, wellTop, wellW, wellH, 18);
    ctx.fillStyle = "rgba(36,82,32,0.32)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const posts = forkPosts();
    for (const p of posts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "#c4a574";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - 1.5, p.y - 1.5, R * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    }

    const bx = aiming ? pullX : restX;
    const by = aiming ? pullY : cannonY;

    if (aiming && pullDist > 4) {
      ctx.strokeStyle = `rgba(244,241,234,${0.35 + pullPower * 0.45})`;
      ctx.lineWidth = 2.4 + pullPower * 2;
      ctx.lineCap = "round";
      for (const p of posts) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo((p.x + bx) / 2, Math.max(p.y, by) + R * 0.4, bx, by);
        ctx.stroke();
      }
    }

    if (state === "playing") {
      if (!flying) {
        drawBubble(bx, by, currentColor, 1, aiming ? 1.04 : 1, aiming ? 1.08 : 1);
      }
      const nx = wellX + R * 1.4;
      const ny = cannonY + R * 0.35;
      drawBubble(nx, ny, nextColor, 0.85, 0.55);
      ctx.font = `600 ${Math.max(9, R * 0.36)}px "Noto Sans KR", sans-serif`;
      ctx.fillStyle = "rgba(232,238,233,0.55)";
      ctx.textAlign = "center";
      ctx.fillText("NEXT", nx, ny + R * 1.05);
    }
  }

  function slingshotSpriteSrc() {
    const pulling = aiming && pullDist > minPull();
    const recoiling = !aiming && performance.now() < recoilUntil;
    if (pulling) return pokeSprites.pull;
    if (recoiling) return pokeSprites.release;
    return pokeSprites.idle;
  }

  function updateSlingshotPokemon() {
    if (!slingshotEl || state !== "playing") {
      if (slingshotEl) slingshotEl.hidden = true;
      slingshotVisible = false;
      return;
    }
    const bx = aiming ? pullX : restX;
    const by = aiming ? pullY : cannonY;
    const pulling = aiming && pullDist > minPull();
    const recoiling = !aiming && performance.now() < recoilUntil;
    if (pulling && !pullGenBusy && !pullGenRequested) generatePullSprite();
    const src = slingshotSpriteSrc();
    if (slingshotEl.src !== src) slingshotEl.src = src;
    const h = pulling
      ? Math.max(168, R * 11.2)
      : recoiling
        ? Math.max(130, R * 8.2)
        : Math.max(118, R * 7.2);
    const aspect = slingshotEl.naturalWidth && slingshotEl.naturalHeight
      ? slingshotEl.naturalWidth / slingshotEl.naturalHeight
      : 1;
    const w = h * aspect;
    const rot = pulling ? (aimAngle + Math.PI / 2) * 0.55 : recoiling ? -0.18 : 0;
    const stretchY = pulling ? 1 + pullPower * 0.12 : recoiling ? 1.06 : 1;
    const bob = (!pulling && !recoiling) ? Math.sin(performance.now() / 420) * 2 : 0;
    slingshotEl.hidden = false;
    slingshotEl.style.width = `${w}px`;
    slingshotEl.style.height = `${h}px`;
    slingshotEl.style.transform = `translate(${bx - w * 0.5}px, ${by + bob - h * 0.05}px) rotate(${rot}rad) scale(${pulling ? 1.15 : 1}, ${stretchY * (pulling ? 1.08 : 1)})`;
    slingshotVisible = true;
  }

  function setupRoamers() {
    if (!roamLayer) return;
    roamLayer.innerHTML = "";
    roamers = [];
    const pool = ROAM_IDS.slice();
    const n = Math.min(6, pool.length);
    const fieldW = (COLS + 0.5) * D;
    const wellTop = cannonY - R * 1.6;
    const fieldH = Math.max(80, wellTop - padY - 40);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const id = pool.splice(idx, 1)[0];
      const img = document.createElement("img");
      img.src = `${POKE_ANIM}/${id}.gif`;
      img.alt = "";
      img.addEventListener("pointerdown", (e) => {
        const roamer = roamers.find((r) => r.el === img);
        if (roamer) onRoamerTap(roamer, e);
      });
      roamLayer.appendChild(img);
      const size = 52 + Math.random() * 28;
      roamers.push({
        el: img,
        id,
        x: padX + Math.random() * Math.max(20, fieldW - size),
        y: padY + 24 + Math.random() * fieldH,
        vx: (0.22 + Math.random() * 0.42) * (Math.random() < 0.5 ? -1 : 1),
        vy: (0.12 + Math.random() * 0.32) * (Math.random() < 0.5 ? -1 : 1),
        size,
        hits: 0,
        alive: true,
        hurtUntil: 0,
        hurtTimer: null,
        grumpyUntil: 0,
        grumpyTimer: null,
      });
    }
  }

  function updateRoamers() {
    if (!roamers.length || !W) return;
    const wellTop = cannonY - R * 1.6;
    const fieldW = (COLS + 0.5) * D;
    const minX = padX + 4;
    const maxX = padX + fieldW - 4;
    const minY = padY + 18;
    const maxY = Math.max(minY + 40, wellTop - 8);
    for (const r of roamers) {
      if (!r.alive) continue;
      r.x += r.vx;
      r.y += r.vy;
      const maxXr = maxX - r.size;
      const maxYr = maxY - r.size;
      if (r.x < minX) { r.x = minX; r.vx = Math.abs(r.vx); }
      if (r.x > maxXr) { r.x = maxXr; r.vx = -Math.abs(r.vx); }
      if (r.y < minY) { r.y = minY; r.vy = Math.abs(r.vy); }
      if (r.y > maxYr) { r.y = maxYr; r.vy = -Math.abs(r.vy); }
      if (Math.random() < 0.006) r.vx *= -1;
      if (Math.random() < 0.005) r.vy *= -1;
      r.el.style.width = `${r.size}px`;
      const flip = r.vx < 0 ? -1 : 1;
      const hurt = r.hurtUntil > performance.now();
      const grumpy = r.grumpyUntil > performance.now();
      const squash = (hurt || grumpy) ? " scaleY(0.88)" : "";
      r.el.style.opacity = r.alive ? "1" : "0";
      r.el.style.transform = `translate(${r.x}px, ${r.y}px) scaleX(${flip})${squash}`;
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawAimLine() {
    if (state !== "playing" || flying || !aiming || pullDist < minPull()) return;
    const path = traceAimPath();
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = `rgba(244,241,234,${0.35 + pullPower * 0.4})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(path.pts[0].x, path.pts[0].y);
    for (let i = 1; i < path.pts.length; i++) ctx.lineTo(path.pts[i].x, path.pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (path.snap) {
      const p = cellCenter(path.snap.r, path.snap.c);
      drawBubble(p.x, p.y, currentColor, 0.32, 0.9);
    }
    ctx.restore();
  }

  function drawField() {
    const { left, right } = walls();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(padX, padY, (COLS + 0.5) * D, Math.max(0, dangerY - padY));

    const railBottom = cannonY - R * 1.7;
    ctx.strokeStyle = "rgba(92,62,28,0.5)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(left - R, padY + 8);
    ctx.lineTo(left - R, railBottom);
    ctx.moveTo(right + R, padY + 8);
    ctx.lineTo(right + R, railBottom);
    ctx.stroke();

    ctx.fillStyle = "rgba(139,98,48,0.45)";
    ctx.fillRect(padX, padY - 2, (COLS + 0.5) * D, 5);

    ctx.strokeStyle = "rgba(212,82,74,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(padX + 4, dangerY);
    ctx.lineTo(padX + (COLS + 0.5) * D - 4, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 10px \"Noto Sans KR\", sans-serif";
    ctx.fillStyle = "rgba(212,82,74,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("위험선", padX + 8, dangerY - 6);
  }

  function draw() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.clearRect(0, 0, W, H);
    drawField();

    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] >= 0) {
          const { x, y } = cellCenter(r, c);
          drawBubble(x, y, grid[r][c]);
        }
      }
    }

    drawAimLine();
    drawSling();

    for (const t of trails) {
      drawBubble(t.x, t.y, t.color, t.life * 0.35, t.r / R);
    }

    if (flying) {
      const ang = Math.atan2(flying.vy, flying.vx);
      ctx.save();
      ctx.translate(flying.x, flying.y);
      ctx.rotate(ang);
      ctx.scale(flying.squash, 2 - flying.squash);
      ctx.rotate(-ang);
      ctx.translate(-flying.x, -flying.y);
      drawBubble(flying.x, flying.y, flying.color);
      ctx.restore();
    }

    for (const f of falling) {
      drawBubble(f.x, f.y, f.color, Math.max(0, f.life), 0.95);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.kind === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size * 0.3, -p.size * 0.15, p.size, p.size * 0.35);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * Math.max(0.15, p.life), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const rg of rings) {
      ctx.globalAlpha = Math.max(0, rg.life) * 0.7;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    for (const p of popups) {
      ctx.globalAlpha = p.life;
      ctx.font = `700 ${15 + (1 - p.life) * 6}px Outfit, sans-serif`;
      ctx.fillStyle = "#f4f1ea";
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (flash > 0) {
      ctx.fillStyle = `rgba(244,241,234,${flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.life -= 0.036;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y += p.vy;
      p.life -= 0.022;
      if (p.life <= 0) popups.splice(i, 1);
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 0.38;
      f.x += f.vx;
      f.y += f.vy;
      f.life -= 0.012;
      if (f.y > H + 40 || f.life <= 0) falling.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.r += (rg.max - rg.r) * 0.18 + 1.2;
      rg.life -= 0.05;
      if (rg.life <= 0) rings.splice(i, 1);
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life -= 0.08;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - shakeDecay);
    if (flash > 0) flash = Math.max(0, flash - 0.045);
  }

  function updatePressure(dt) {
    if (state !== "playing" || flying || aiming) return;
    pressureElapsed += dt;
    const ratio = Math.min(1, pressureElapsed / pressureInterval);
    pressureBar.style.width = `${ratio * 100}%`;
    pressureBar.classList.toggle("danger", ratio > 0.85);
    if (pressureElapsed >= pressureInterval) {
      pressureElapsed = 0;
      pushPressureRow();
    }
  }

  let lastTs = 0;
  function loop(ts) {
    const dt = lastTs ? Math.min(48, ts - lastTs) : 16;
    lastTs = ts;
    if (state === "playing") {
      updateFlying();
      updatePressure(dt);
    }
    updateParticles();
    updateRoamers();
    updateSlingshotPokemon();
    draw();
    requestAnimationFrame(loop);
  }

  function clampAngle(a) {
    const min = (-165 * Math.PI) / 180;
    const max = (-15 * Math.PI) / 180;
    return Math.max(min, Math.min(max, a));
  }

  function setPullFromPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const dx = px - restX;
    const dy = py - cannonY;
    let fire = Math.atan2(-dy, -dx);
    fire = clampAngle(fire);
    let dist = Math.hypot(dx, dy);
    dist = Math.min(dist, maxPull);
    pullX = restX - Math.cos(fire) * dist;
    pullY = cannonY - Math.sin(fire) * dist;
    if (pullY < cannonY - 4) {
      dist = Math.min(dist, maxPull);
    }
    aimAngle = fire;
    pullDist = dist;
    pullPower = dist / maxPull;
    if (pullDist > minPull()) SFX.pull(pullPower);
  }

  function showOverlay(title, sub, btnText, onClick) {
    overlayCard.innerHTML = `
      <h2>${title}</h2>
      <p>${sub}</p>
      <button class="btn" type="button">${btnText}</button>`;
    overlay.classList.remove("hidden");
    overlayCard.querySelector(".btn").addEventListener("click", onClick, { once: true });
  }

  function startGame() {
    SFX.init();
    ensureBgm();
    resize();
    fillInitial();
    score = 0;
    combo = 0;
    scoreEl.textContent = "0";
    comboEl.textContent = "0";
    currentColor = pickShotColor();
    nextColor = pickShotColor();
    flying = null;
    aiming = false;
    aimAngle = -Math.PI / 2;
    pullX = restX;
    pullY = cannonY;
    pullDist = 0;
    pullPower = 0;
    pressureElapsed = 0;
    pressureInterval = PRESSURE_START_MS;
    pressurePushes = 0;
    pressureBar.style.width = "0%";
    particles.length = 0;
    popups.length = 0;
    falling.length = 0;
    rings.length = 0;
    trails.length = 0;
    flash = 0;
    state = "playing";
    overlay.classList.add("hidden");
    setupRoamers();
  }

  function endGame(won) {
    if (state !== "playing") return;
    flying = null;
    aiming = false;
    state = won ? "win" : "gameover";
    if (won) SFX.win();
    else SFX.gameOver();
    showOverlay(
      won ? "클리어" : "게임 오버",
      won
        ? `보드를 비웠습니다 · ${score}점`
        : `버블이 위험선에 닿았어요 · ${score}점`,
      "다시 하기",
      startGame,
    );
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || flying) return;
    const roamer = roamerAt(e.clientX, e.clientY);
    if (roamer) {
      onRoamerTap(roamer, e);
      return;
    }
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!inLauncherZone(pt.x, pt.y)) return;
    e.preventDefault();
    SFX.init();
    ensureBgm();
    canvas.setPointerCapture(e.pointerId);
    pointerId = e.pointerId;
    aiming = true;
    hasDragged = false;
    dragStartX = pt.x;
    dragStartY = pt.y;
    pullGenRequested = false;
    releaseGenRequested = false;
    pullDist = 0;
    pullPower = 0;
    pullX = restX;
    pullY = cannonY;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!aiming || state !== "playing") return;
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
    pullGenToken++;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (hasDragged && pullDist >= minPull()) {
      fireBubble(true);
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

  function snapshotGrid() {
    return grid.map((row) => row.slice());
  }

  function selfTest() {
    resize();
    const saved = {
      grid: snapshotGrid(),
      stagger, score, combo, state, currentColor, nextColor,
      flying, pressurePushes,
    };
    const out = [];
    const check = (name, pass, extra) => out.push({ name, pass: !!pass, ...extra });

    stagger = 0;
    emptyGrid();
    check("even interior neighbors", neighbors(2, 5).length === 6, { n: neighbors(2, 5).length });
    stagger = 1;
    check("odd-stagger interior neighbors", neighbors(2, 5).length === 6, { n: neighbors(2, 5).length });

    stagger = 0;
    emptyGrid();
    grid[0][3] = 1; grid[0][4] = 1; grid[1][3] = 1;
    check("pop group size 3", bfsSameColor(0, 3).length === 3, { n: bfsSameColor(0, 3).length });

    emptyGrid();
    grid[0][0] = 2;
    grid[2][2] = 3;
    check("floating detected", !bfsCeilingConnected().has("2,2"));

    emptyGrid();
    stagger = 0;
    grid[0][4] = 1;
    const x0 = cellCenter(0, 4).x;
    for (let r = MAX_ROWS - 1; r > 0; r--) grid[r] = grid[r - 1].slice();
    stagger ^= 1;
    const x1 = cellCenter(1, 4).x;
    check("pressure keeps column x", Math.abs(x0 - x1) < 0.01, { x0, x1 });

    emptyGrid();
    grid[0][5] = 1;
    const snap = findSnapFromHit(cellCenter(0, 5).x, cellCenter(0, 5).y + D, 0, 5);
    check("snap is neighbor", !!(snap && neighbors(0, 5).some(([rr, cc]) => rr === snap.r && cc === snap.c)), snap);

    emptyGrid();
    stagger = 0;
    grid[1][0] = 0; grid[1][1] = 0; grid[1][2] = 0;
    const group = bfsSameColor(1, 0);
    check("pop group on row", group.length === 3, { n: group.length });

    check("pull well room", maxPull >= 64 && cannonY < H - 40, { maxPull, cannonY, H, pullWell });

    emptyGrid();
    stagger = saved.stagger;
    grid = saved.grid;
    score = saved.score;
    combo = saved.combo;
    state = saved.state;
    currentColor = saved.currentColor;
    nextColor = saved.nextColor;
    flying = saved.flying;
    pressurePushes = saved.pressurePushes;
    return { ok: out.every((t) => t.pass), tests: out };
  }

  window.__bubble = {
    start: startGame,
    fire: () => fireBubble(false),
    end: endGame,
    resize,
    selfTest,
    setAngle(deg) { aimAngle = clampAngle((deg * Math.PI) / 180); },
    landAt(r, c, color) { landBubble(r, c, color == null ? currentColor : color); },
    setCell(r, c, color) { if (inBounds(r, c)) grid[r][c] = color; },
    clearBoard() { emptyGrid(); },
    push: pushPressureRow,
    get state() { return state; },
    get score() { return score; },
    get combo() { return combo; },
    get grid() { return snapshotGrid(); },
    get flying() { return flying ? { ...flying } : null; },
    get angle() { return aimAngle; },
    get colors() { return { current: currentColor, next: nextColor }; },
    get metrics() {
      return { W, H, R, D, rowH, padX, dangerY, cannonY, stagger, pullWell, maxPull, restX };
    },
  };

  resize();
  emptyGrid();
  if (slingshotEl) slingshotEl.src = pokeSprites.idle;
  ensureTerrainBackground();
  showOverlay(
    "버블슈터",
    "같은 색 3개를 터뜨리세요.<br>구슬을 아래로 당겼다 놓으면 반대 방향으로 날아갑니다.",
    "시작",
    startGame,
  );
  requestAnimationFrame(loop);
})();
