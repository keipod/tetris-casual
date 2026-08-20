/**
 * Pastel medieval tower defense.
 * Three.js plane + billboards when WebGL is available.
 * Falls back to isometric 2.5D canvas (PRD) if WebGL cannot start.
 */
import * as THREE from "three";

const COLS = 9;
const ROWS = 12;
const CELL = 1;
const WAVES = 10;
const PREP = 7;
const START_GOLD = 130;
const START_HP = 20;

const PATH = [
  [0, 10], [1, 10], [2, 10], [3, 10], [3, 9], [3, 8], [3, 7],
  [4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4],
  [5, 4], [4, 4], [3, 4], [2, 4], [2, 3], [2, 2],
  [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
];

const TOWERS = {
  arrow: { name: "화살 탑", cost: 50, range: 2.55, cooldown: 0.42, damage: 9, splash: 0, speed: 11, color: "#c49462" },
  magic: { name: "마법 탑", cost: 70, range: 2.35, cooldown: 0.85, damage: 8, splash: 1.15, speed: 9, color: "#7894d2" },
  cannon: { name: "대포", cost: 90, range: 2.9, cooldown: 1.35, damage: 28, splash: 0.45, speed: 7, color: "#8c7c54" },
};

const WAVE_DEFS = Array.from({ length: WAVES }, (_, i) => ({
  count: 6 + i * 2,
  hp: 28 + i * 14,
  speed: 1.35 + i * 0.08,
  gold: 7 + Math.floor(i / 2),
  kind: i % 3 === 2 ? "beast" : "grunt",
  leak: i % 3 === 2 ? 2 : 1,
}));

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const goldEl = $("gold");
const waveEl = $("wave");
const hpEl = $("hp");
const bannerEl = $("banner");
const overlay = $("overlay");
const overlayCard = $("overlay-card");
const sheet = $("sheet");
const sheetTitle = $("sheet-title");
const sheetBody = $("sheet-body");
const btnPause = $("btn-pause");
const btnSpeed = $("btn-speed");
const btnUpgrade = $("btn-upgrade");
const btnSound = $("btn-sound");

const LS_SOUND = "tower_sound";
const storage = window.localStorage;
let soundOn = storage.getItem(LS_SOUND) !== "0";

const SFX = (() => {
  const clips = {};
  const bgm = new Audio("assets/audio/bgm.mp3");
  bgm.loop = true;
  bgm.volume = 0.26;
  bgm.preload = "auto";
  ["build", "wave", "kill", "leak", "upgrade", "win", "lose"].forEach((name) => {
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
    if (!soundOn) return false;
    const src = clips[name];
    if (!src) return false;
    try {
      const node = src.cloneNode();
      node.volume = 0.72;
      const p = node.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      return true;
    } catch {
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
    } catch {
      /* ignore */
    }
  };
  const syncBgm = () => {
    if (soundOn && running) {
      const p = bgm.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      bgm.pause();
    }
  };
  window.addEventListener("pointerdown", () => {
    try { init(); } catch { /* ignore */ }
    syncBgm();
  }, { once: true });
  return { init, playClip, tone, syncBgm, bgm };
})();

const pathSet = new Set(PATH.map(([c, r]) => `${c},${r}`));
const keepCell = PATH[PATH.length - 1];
const spawnCell = PATH[0];

let gold = START_GOLD;
let hp = START_HP;
let nextWave = 0;
let activeWave = 0;
let speed = 1;
let paused = false;
let running = false;
let selectedKind = "arrow";
let selectedTower = null;
let prepLeft = PREP;
let spawning = false;
let spawnLeft = 0;
let spawnGap = 0.55;
let toSpawn = 0;
let bannerUntil = 0;
let use3d = false;
let last = performance.now();

const enemies = [];
const towers = [];
const shots = [];
const trees = [];
const images = {};

let renderer = null;
let scene = null;
let camera = null;
let raycaster = null;
let pointer = null;
let groundPlane = null;
let hit = null;
let ctx = null;
let keepSprite3d = null;

function cellToWorld(c, r) {
  return { x: (c - (COLS - 1) / 2) * CELL, z: (r - (ROWS - 1) / 2) * CELL };
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

const waypoints = PATH.map(([c, r]) => cellToWorld(c, r));
const segs = [];
let pathLen = 0;
for (let i = 0; i < waypoints.length - 1; i++) {
  const a = waypoints[i];
  const b = waypoints[i + 1];
  const len = dist2(a.x, a.z, b.x, b.z);
  segs.push({ a, b, len });
  pathLen += len;
}

function posOnPath(dist) {
  if (dist >= pathLen) return { ...waypoints[waypoints.length - 1] };
  let rest = Math.max(0, dist);
  for (const seg of segs) {
    if (rest <= seg.len) {
      const t = seg.len ? rest / seg.len : 0;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t };
    }
    rest -= seg.len;
  }
  return { ...waypoints[waypoints.length - 1] };
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function tryWebGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xb8d4e8, 1);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb8d4e8, 18, 32);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    scene.add(new THREE.HemisphereLight(0xfff2d8, 0x6a8a58, 1.05));
    const sun = new THREE.DirectionalLight(0xffe6c0, 0.55);
    sun.position.set(6, 12, 4);
    scene.add(sun);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    hit = new THREE.Vector3();
    return true;
  } catch {
    renderer = null;
    return false;
  }
}

function texFrom(img) {
  if (!img || !use3d) return null;
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSprite3d(img, color, w, h) {
  const mat = img
    ? new THREE.SpriteMaterial({ map: texFrom(img), transparent: true, depthWrite: false })
    : new THREE.SpriteMaterial({ color, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(w, h, 1);
  spr.center.set(0.5, 0.08);
  return spr;
}

function addGround3d() {
  const grass = texFrom(images["path-grass.png"]);
  if (grass) {
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(COLS / 2.2, ROWS / 2.2);
  }
  const geo = new THREE.PlaneGeometry(COLS * CELL + 1.6, ROWS * CELL + 1.6);
  geo.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: grass ? 0xffffff : 0x8fbf7a, map: grass })));
  const dirt = texFrom(images["path-dirt.png"]);
  const pathGeo = new THREE.BoxGeometry(CELL * 0.92, 0.06, CELL * 0.92);
  const pathMat = new THREE.MeshLambertMaterial({ color: dirt ? 0xffffff : 0xc49a6a, map: dirt });
  for (const [c, r] of PATH) {
    const m = new THREE.Mesh(pathGeo, pathMat);
    const p = cellToWorld(c, r);
    m.position.set(p.x, 0.03, p.z);
    scene.add(m);
  }
}

function scatterTrees() {
  for (let i = 0; i < 12; i++) {
    const c = (i * 5 + 3) % COLS;
    const r = (i * 7 + 1) % ROWS;
    if (pathSet.has(`${c},${r}`)) continue;
    if (Math.abs(c - keepCell[0]) + Math.abs(r - keepCell[1]) < 2) continue;
    const p = cellToWorld(c, r);
    const node = { c, r, x: p.x, z: p.z, spr: null };
    if (use3d) {
      node.spr = makeSprite3d(images["tree.png"], 0x5c8c4a, 1.05, 1.4);
      node.spr.position.set(p.x, 0, p.z);
      scene.add(node.spr);
    }
    trees.push(node);
  }
}

function towerAt(c, r) {
  return towers.find((t) => t.c === c && t.r === r);
}

function treeAt(c, r) {
  return trees.some((t) => t.c === c && t.r === r);
}

function canBuild(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  if (pathSet.has(`${c},${r}`)) return false;
  if (towerAt(c, r) || treeAt(c, r)) return false;
  return true;
}

function setGold(n) {
  gold = n;
  goldEl.textContent = String(gold);
  document.querySelectorAll(".tower-btn").forEach((btn) => {
    btn.disabled = gold < TOWERS[btn.dataset.kind].cost;
  });
}

function setHp(n) {
  hp = Math.max(0, n);
  hpEl.textContent = String(hp);
}

function setWaveUi() {
  waveEl.textContent = `${activeWave}/${WAVES}`;
}

function showBanner(text, sec = 1.6) {
  bannerEl.hidden = false;
  bannerEl.textContent = text;
  bannerUntil = performance.now() / 1000 + sec;
}

function beep(freq, dur = 0.08, type = "triangle", gain = 0.04) {
  SFX.tone(freq, dur, type, gain);
}

function sfx(name, fallback) {
  if (!SFX.playClip(name)) fallback?.();
}

function spawnEnemy(def) {
  const p = posOnPath(0);
  const en = { dist: 0, hp: def.hp, maxHp: def.hp, speed: def.speed, gold: def.gold, leak: def.leak, kind: def.kind, x: p.x, z: p.z, spr: null };
  if (use3d) {
    en.spr = makeSprite3d(images[def.kind === "beast" ? "enemy-beast.png" : "enemy-grunt.png"], def.kind === "beast" ? 0xa8a49c : 0x789c62, 0.95, 1.15);
    en.spr.position.set(p.x, 0, p.z);
    scene.add(en.spr);
  }
  enemies.push(en);
}

function fire(tower, target) {
  const spec = TOWERS[tower.kind];
  const shot = {
    kind: tower.kind,
    damage: spec.damage * (tower.upgraded ? 1.6 : 1),
    splash: spec.splash * (tower.upgraded ? 1.15 : 1),
    speed: spec.speed,
    target,
    life: 1.6,
    x: tower.x,
    z: tower.z,
    y: 0.9,
    mesh: null,
  };
  if (use3d) {
    const geo = new THREE.SphereGeometry(tower.kind === "cannon" ? 0.12 : 0.07, 8, 8);
    shot.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: spec.color }));
    shot.mesh.position.set(tower.x, 0.9, tower.z);
    scene.add(shot.mesh);
  }
  shots.push(shot);
}

function damageEnemy(en, amount) {
  en.hp -= amount;
  if (en.hp <= 0) {
    setGold(gold + en.gold);
    if (en.spr) scene.remove(en.spr);
    enemies.splice(enemies.indexOf(en), 1);
    sfx("kill", () => beep(520, 0.06, "sine", 0.03));
  }
}

function splashAt(x, z, amount, radius, skip) {
  if (radius <= 0) return;
  for (const en of [...enemies]) {
    if (en === skip) continue;
    if (dist2(en.x, en.z, x, z) <= radius) damageEnemy(en, amount * 0.55);
  }
}

function startWave() {
  if (nextWave >= WAVES) return;
  const def = WAVE_DEFS[nextWave];
  activeWave = nextWave + 1;
  spawning = true;
  toSpawn = def.count;
  spawnLeft = 0.2;
  spawnGap = Math.max(0.32, 0.62 - nextWave * 0.02);
  showBanner(`웨이브 ${activeWave}`);
  sfx("wave", () => beep(330, 0.12, "triangle", 0.05));
  setWaveUi();
}

function checkEnd() {
  if (!running) return;
  if (hp <= 0) {
    running = false;
    SFX.bgm.pause();
    sfx("lose", () => beep(110, 0.25, "sawtooth", 0.05));
    overlay.hidden = false;
    overlayCard.innerHTML = `<h2>기지가 함락됐습니다</h2><p>웨이브 ${activeWave}/${WAVES}에서 무너졌어요.</p><div class="actions"><button class="btn" id="btn-retry" type="button">다시</button><a class="btn ghost" href="../">목록</a></div>`;
    $("btn-retry").onclick = resetGame;
    return;
  }
  if (nextWave >= WAVES && !spawning && enemies.length === 0) {
    running = false;
    SFX.bgm.pause();
    sfx("win", () => { beep(520, 0.12, "sine", 0.06); beep(660, 0.18, "triangle", 0.05); });
    overlay.hidden = false;
    overlayCard.innerHTML = `<h2>성을 지켜냈습니다</h2><p>금화 ${gold}을 남기고 마지막 웨이브를 막았어요.</p><div class="actions"><button class="btn" id="btn-retry" type="button">다시</button><a class="btn ghost" href="../">목록</a></div>`;
    $("btn-retry").onclick = resetGame;
  }
}

function placeTower(c, r, kind) {
  const spec = TOWERS[kind];
  if (gold < spec.cost || !canBuild(c, r)) return false;
  setGold(gold - spec.cost);
  const p = cellToWorld(c, r);
  const t = { kind, c, r, x: p.x, z: p.z, cooldown: 0, upgraded: false, spent: spec.cost, spr: null, ring: null };
  if (use3d) {
    t.spr = makeSprite3d(images[`tower-${kind}.png`], spec.color, 1.05, 1.4);
    t.spr.position.set(p.x, 0, p.z);
    scene.add(t.spr);
    t.ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.range - 0.04, spec.range, 40),
      new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    t.ring.rotation.x = -Math.PI / 2;
    t.ring.position.set(p.x, 0.08, p.z);
    scene.add(t.ring);
  }
  towers.push(t);
  sfx("build", () => beep(260, 0.07));
  return true;
}

function upgradeCost(t) {
  return Math.round(TOWERS[t.kind].cost * 0.6);
}

function openSheet(t) {
  selectedTower = t;
  if (use3d) towers.forEach((x) => { if (x.ring) x.ring.material.opacity = x === t ? 0.28 : 0; });
  const spec = TOWERS[t.kind];
  sheetTitle.textContent = spec.name + (t.upgraded ? " · 강화됨" : "");
  sheetBody.textContent = t.upgraded
    ? `판매 시 ${Math.floor(t.spent * 0.5)} 금화를 돌려받습니다.`
    : `강화 ${upgradeCost(t)} · 판매 ${Math.floor(t.spent * 0.5)}`;
  btnUpgrade.disabled = t.upgraded || gold < upgradeCost(t);
  btnUpgrade.textContent = t.upgraded ? "강화 완료" : `강화 ${upgradeCost(t)}`;
  sheet.classList.remove("hidden");
}

function closeSheet() {
  selectedTower = null;
  if (use3d) towers.forEach((x) => { if (x.ring) x.ring.material.opacity = 0; });
  sheet.classList.add("hidden");
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (use3d) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.position.set(0, h > w ? 16.2 : 13.2, h > w ? 14.4 : 11.6);
    camera.lookAt(0, 0, 0.35);
    camera.updateProjectionMatrix();
  } else {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function screenToWorld2d(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const { ox, oy, s } = isoParams();
  const lx = sx - ox;
  const ly = sy - oy;
  const x = (lx / s + ly / (s * 0.55)) / 2;
  const z = (ly / (s * 0.55) - lx / s) / 2;
  return { x, z };
}

function isoParams() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const s = Math.min(w / (COLS + ROWS) * 1.55, h / (COLS + ROWS) * 1.9);
  return { ox: w / 2, oy: h * 0.16, s };
}

function iso(x, z) {
  const { ox, oy, s } = isoParams();
  return [ox + (x - z) * s, oy + (x + z) * s * 0.55];
}

function worldToCell(x, z) {
  const c = Math.round(x / CELL + (COLS - 1) / 2);
  const r = Math.round(z / CELL + (ROWS - 1) / 2);
  return [c, r];
}

function pickCell(ev) {
  const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
  const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
  if (use3d) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return worldToCell(hit.x, hit.z);
  }
  const w = screenToWorld2d(cx, cy);
  return worldToCell(w.x, w.z);
}

function onPointer(ev) {
  if (!running || !overlay.hidden) return;
  const cell = pickCell(ev);
  if (!cell) return;
  const [c, r] = cell;
  const existing = towerAt(c, r);
  if (existing) {
    openSheet(existing);
    return;
  }
  closeSheet();
  if (!placeTower(c, r, selectedKind)) {
    if (!canBuild(c, r)) showBanner("여기는 길을 비워 두세요", 1.1);
    else showBanner("금화가 부족합니다", 1.1);
  }
}

function tick(dt) {
  const now = performance.now() / 1000;
  if (now > bannerUntil && !(!spawning && enemies.length === 0 && nextWave < WAVES && running && !paused)) {
    bannerEl.hidden = true;
  }
  if (!running || paused) return;

  if (!spawning && enemies.length === 0) {
    prepLeft -= dt;
    if (nextWave < WAVES && prepLeft <= 0) startWave();
    else if (nextWave < WAVES) {
      bannerEl.hidden = false;
      bannerEl.textContent = `다음 웨이브 ${Math.ceil(prepLeft)}초`;
    }
  }

  if (spawning) {
    spawnLeft -= dt;
    const def = WAVE_DEFS[nextWave];
    while (spawnLeft <= 0 && toSpawn > 0) {
      spawnEnemy(def);
      toSpawn -= 1;
      spawnLeft += spawnGap;
    }
    if (toSpawn <= 0) {
      spawning = false;
      nextWave += 1;
      prepLeft = PREP;
      setWaveUi();
    }
  }

  for (const en of [...enemies]) {
    en.dist += en.speed * dt;
    const p = posOnPath(en.dist);
    en.x = p.x;
    en.z = p.z;
    if (en.spr) {
      en.spr.position.set(p.x, 0, p.z);
      en.spr.material.transparent = true;
      en.spr.material.opacity = 0.55 + 0.45 * (en.hp / en.maxHp);
    }
    if (en.dist >= pathLen) {
      setHp(hp - en.leak);
      if (en.spr) scene.remove(en.spr);
      enemies.splice(enemies.indexOf(en), 1);
      sfx("leak", () => beep(110, 0.18, "sawtooth", 0.04));
      checkEnd();
    }
  }

  for (const t of towers) {
    t.cooldown -= dt;
    const range = TOWERS[t.kind].range * (t.upgraded ? 1.12 : 1);
    let best = null;
    let bestDist = -1;
    for (const en of enemies) {
      const d = dist2(t.x, t.z, en.x, en.z);
      if (d <= range && en.dist > bestDist) {
        best = en;
        bestDist = en.dist;
      }
    }
    if (best && t.cooldown <= 0) {
      fire(t, best);
      t.cooldown = TOWERS[t.kind].cooldown * (t.upgraded ? 0.88 : 1);
    }
  }

  for (const s of [...shots]) {
    s.life -= dt;
    if (!s.target || !enemies.includes(s.target) || s.life <= 0) {
      if (s.mesh) scene.remove(s.mesh);
      shots.splice(shots.indexOf(s), 1);
      continue;
    }
    const dx = s.target.x - s.x;
    const dz = s.target.z - s.z;
    const dist = Math.hypot(dx, dz);
    const step = s.speed * dt;
    if (dist <= step) {
      damageEnemy(s.target, s.damage);
      splashAt(s.target.x, s.target.z, s.damage, s.splash, s.target);
      if (s.mesh) scene.remove(s.mesh);
      shots.splice(shots.indexOf(s), 1);
    } else {
      s.x += (dx / dist) * step;
      s.z += (dz / dist) * step;
      s.y = s.kind === "cannon" ? 0.55 + Math.sin((1 - dist / 4) * Math.PI) * 0.45 : 0.7;
      if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
    }
  }

  checkEnd();
}

function draw2d() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#b8d4e8");
  sky.addColorStop(1, "#8fbf7a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tiles.push({ c, r, path: pathSet.has(`${c},${r}`) });
    }
  }
  tiles.sort((a, b) => a.c + a.r - (b.c + b.r));
  for (const t of tiles) {
    const p = cellToWorld(t.c, t.r);
    const [sx, sy] = iso(p.x, p.z);
    const { s } = isoParams();
    ctx.beginPath();
    ctx.moveTo(sx, sy - s * 0.28);
    ctx.lineTo(sx + s * 0.92, sy);
    ctx.lineTo(sx, sy + s * 0.28);
    ctx.lineTo(sx - s * 0.92, sy);
    ctx.closePath();
    ctx.fillStyle = t.path ? "#c49a6a" : "#7dae6c";
    ctx.fill();
  }

  const sprites = [];
  for (const tr of trees) sprites.push({ x: tr.x, z: tr.z, img: images["tree.png"], h: 1.35, w: 1.05 });
  sprites.push({ x: cellToWorld(keepCell[0], keepCell[1]).x, z: cellToWorld(keepCell[0], keepCell[1]).z, img: images["keep.png"], h: 1.7, w: 1.45 });
  for (const t of towers) sprites.push({ x: t.x, z: t.z, img: images[`tower-${t.kind}.png`], h: t.upgraded ? 1.55 : 1.4, w: 1.1, ring: selectedTower === t });
  for (const en of enemies) sprites.push({ x: en.x, z: en.z, img: images[en.kind === "beast" ? "enemy-beast.png" : "enemy-grunt.png"], h: 1.15, w: 0.95, alpha: 0.55 + 0.45 * (en.hp / en.maxHp) });
  sprites.sort((a, b) => a.x + a.z - (b.x + b.z));
  const { s } = isoParams();
  for (const sp of sprites) {
    const [sx, sy] = iso(sp.x, sp.z);
    if (sp.ring) {
      ctx.beginPath();
      ctx.arc(sx, sy, s * 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(90, 120, 70, 0.45)";
      ctx.stroke();
    }
    ctx.globalAlpha = sp.alpha ?? 1;
    const dw = s * sp.w;
    const dh = s * sp.h;
    if (sp.img) ctx.drawImage(sp.img, sx - dw / 2, sy - dh, dw, dh);
    else {
      ctx.fillStyle = "#6a8a58";
      ctx.fillRect(sx - dw / 2, sy - dh, dw, dh);
    }
    ctx.globalAlpha = 1;
  }
  for (const sh of shots) {
    const [sx, sy] = iso(sh.x, sh.z);
    ctx.fillStyle = TOWERS[sh.kind].color;
    ctx.beginPath();
    ctx.arc(sx, sy - sh.y * s * 0.4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resetGame() {
  for (const en of enemies) if (en.spr) scene.remove(en.spr);
  for (const t of towers) {
    if (t.spr) scene.remove(t.spr);
    if (t.ring) scene.remove(t.ring);
  }
  for (const s of shots) if (s.mesh) scene.remove(s.mesh);
  enemies.length = 0;
  towers.length = 0;
  shots.length = 0;
  gold = START_GOLD;
  hp = START_HP;
  nextWave = 0;
  activeWave = 0;
  prepLeft = PREP;
  spawning = false;
  toSpawn = 0;
  paused = false;
  speed = 1;
  running = true;
  overlay.hidden = true;
  closeSheet();
  btnPause.textContent = "Ⅱ";
  btnSpeed.textContent = "1×";
  setGold(START_GOLD);
  setHp(START_HP);
  setWaveUi();
  showBanner("길을 따라 탑을 세우세요");
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  tick(dt);
  if (use3d) renderer.render(scene, camera);
  else draw2d();
  requestAnimationFrame(loop);
}

function bindUi() {
  document.querySelectorAll(".tower-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedKind = btn.dataset.kind;
      document.querySelectorAll(".tower-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    });
  });
  document.querySelector('.tower-btn[data-kind="arrow"]').setAttribute("aria-pressed", "true");
  btnPause.onclick = () => {
    paused = !paused;
    btnPause.textContent = paused ? "▶" : "Ⅱ";
    if (paused) SFX.bgm.pause();
    else SFX.syncBgm();
  };
  btnSpeed.onclick = () => {
    speed = speed === 1 ? 2 : 1;
    btnSpeed.textContent = `${speed}×`;
  };
  btnSound.onclick = () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    btnSound.classList.toggle("muted", !soundOn);
    SFX.syncBgm();
  };
  btnSound.classList.toggle("muted", !soundOn);
  $("btn-sheet-close").onclick = closeSheet;
  btnUpgrade.onclick = () => {
    if (!selectedTower || selectedTower.upgraded) return;
    const cost = upgradeCost(selectedTower);
    if (gold < cost) return;
    setGold(gold - cost);
    selectedTower.upgraded = true;
    selectedTower.spent += cost;
    if (selectedTower.spr) selectedTower.spr.scale.multiplyScalar(1.12);
    sfx("upgrade", () => beep(400, 0.1));
    closeSheet();
  };
  $("btn-sell").onclick = () => {
    if (!selectedTower) return;
    const t = selectedTower;
    setGold(gold + Math.floor(t.spent * 0.5));
    if (t.spr) scene.remove(t.spr);
    if (t.ring) scene.remove(t.ring);
    towers.splice(towers.indexOf(t), 1);
    beep(180, 0.08); // sell — no dedicated clip
    closeSheet();
  };
  canvas.addEventListener("pointerdown", onPointer);
  window.addEventListener("resize", resize);
}

async function boot() {
  const names = [
    "path-grass.png", "path-dirt.png", "tower-arrow.png", "tower-magic.png",
    "tower-cannon.png", "enemy-grunt.png", "enemy-beast.png", "keep.png", "tree.png",
  ];
  await Promise.all(names.map(async (n) => { images[n] = await loadImage(`assets/${n}`); }));
  use3d = tryWebGL();
  ctx = canvas.getContext("2d");
  if (use3d) {
    addGround3d();
    const kp = cellToWorld(keepCell[0], keepCell[1]);
    keepSprite3d = makeSprite3d(images["keep.png"], 0xd4b094, 1.45, 1.85);
    keepSprite3d.position.set(kp.x, 0, kp.z);
    scene.add(keepSprite3d);
  }
  scatterTrees();
  bindUi();
  resize();
  overlay.hidden = false;
  overlayCard.innerHTML = `<h2>파스텔 킵워치</h2><p>구불구불한 길로 적이 몰려옵니다. 금화로 화살·마법·대포 탑을 세우고 기지를 지키세요.${use3d ? "" : " (이 기기는 아이소메트릭 2.5D로 플레이합니다.)"}</p><div class="actions"><button class="btn" id="btn-start" type="button">수비 시작</button></div>`;
  $("btn-start").onclick = () => {
    overlay.hidden = true;
    resetGame();
    SFX.syncBgm();
  };
  setGold(START_GOLD);
  setHp(START_HP);
  setWaveUi();
  last = performance.now();
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  overlay.hidden = false;
  overlayCard.innerHTML = `<h2>전장을 불러오지 못했습니다</h2><p>${String(err)}</p>`;
});
