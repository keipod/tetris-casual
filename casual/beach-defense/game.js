// casual/beach-defense/game.js
import {
  CELL,
  MAP,
  T,
  TERRAIN,
  BUILDINGS,
  ENEMIES,
  terrainAt,
  isoToScreen,
  screenToIso,
  canPlace,
  moveAlongPath,
  upgradeCosts,
  scaledStat,
  productionPayout,
  pickLanding,
  resolveTroopPath,
  waveSpec,
  landBounds,
} from "./logic.js";

const UPGRADE_STAT = 1.35;
const SELL_REFUND = 0.6;
const SPAWN_STAGGER = 0.55;

// ---------- DOM ----------
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const stageWrap = canvas.parentElement;
const banner = document.getElementById("banner");
const goldEl = document.getElementById("gold");
const woodEl = document.getElementById("wood");
const waveEl = document.getElementById("wave");
const hpEl = document.getElementById("hp");
const nextWaveEl = document.getElementById("next-wave");
const btnStartWave = document.getElementById("btn-start-wave");
const btnPause = document.getElementById("btn-pause");
const btnSpeed = document.getElementById("btn-speed");
const btnSound = document.getElementById("btn-sound");
const btnHelp = document.getElementById("btn-help");
const btnHelpClose = document.getElementById("btn-help-close");
const btnHelpOk = document.getElementById("btn-help-ok");
const helpEl = document.getElementById("help");
const towerBtns = Array.from(document.querySelectorAll(".tower-btn"));
const sheetEl = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheet-title");
const sheetBody = document.getElementById("sheet-body");
const btnUpgrade = document.getElementById("btn-upgrade");
const btnSell = document.getElementById("btn-sell");
const btnSheetClose = document.getElementById("btn-sheet-close");
const overlayEl = document.getElementById("overlay");
const overlayCard = document.getElementById("overlay-card");

const sfx = typeof window !== "undefined" && window.CasualSfx
  ? window.CasualSfx
  : { play() {}, setEnabled() {}, isEnabled: () => false };

// ---------- assets ----------
function stripWhiteBg(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0, w, h);
  const data = octx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const lum = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    // Only lift bake/export white mats — never erase dark metal / muzzle holes.
    if (lum > 248 && spread < 18) {
      px[i + 3] = 0;
    } else if (lum > 225 && spread < 28) {
      px[i + 3] = Math.round(px[i + 3] * 0.25);
    }
  }
  octx.putImageData(data, 0, 0);
  return off;
}

function loadImage(src) {
  const img = new Image();
  img.ready = false;
  img.onload = () => {
    // Boom Beach extracts already have clean alpha — avoid post-process that eats dark metal.
    img.processed = null;
    img.ready = true;
  };
  img.onerror = () => { img.ready = false; };
  img.src = src;
  return img;
}

const ASSET_V = "bb-pure2";
const IMAGES = {
  hq: loadImage(`assets/hq.png?v=${ASSET_V}`),
  tower_mg: loadImage(`assets/tower-mg.png?v=${ASSET_V}`),
  tower_cannon: loadImage(`assets/tower-cannon.png?v=${ASSET_V}`),
  tower_mortar: loadImage(`assets/tower-mortar.png?v=${ASSET_V}`),
  building_residence: loadImage(`assets/building-residence.png?v=${ASSET_V}`),
  building_sawmill: loadImage(`assets/building-sawmill.png?v=${ASSET_V}`),
  enemy_rifle: loadImage(`assets/enemy-rifle.png?v=${ASSET_V}`),
  enemy_brute: loadImage(`assets/enemy-brute.png?v=${ASSET_V}`),
  enemy_tank: loadImage(`assets/enemy-tank.png?v=${ASSET_V}`),
  landing: loadImage(`assets/landing-craft.png?v=${ASSET_V}`),
  gunboat: loadImage(`assets/gunboat.png?v=${ASSET_V}`),
  tree1: loadImage(`assets/tree-1.png?v=${ASSET_V}`),
  tree2: loadImage(`assets/tree-2.png?v=${ASSET_V}`),
  tree3: loadImage(`assets/tree-3.png?v=${ASSET_V}`),
  decoGrass: loadImage(`assets/deco-grass.png?v=${ASSET_V}`),
  decoGrassSm: loadImage(`assets/deco-grass-sm.png?v=${ASSET_V}`),
  bbCliff: loadImage(`assets/bb-cliff.png?v=${ASSET_V}`),
};
const TREE_IMG = ["tree1", "tree2", "tree3"];

function drawSprite(img, x, y, w, h, fallbackColor, fallbackLabel) {
  if (img && img.ready && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img.processed || img, x - w / 2, y - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
  ctx.fillStyle = fallbackColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1c3d4a";
  ctx.stroke();
  if (fallbackLabel) {
    ctx.fillStyle = "#1c3d4a";
    ctx.font = `${Math.max(9, Math.floor(h * 0.28))}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackLabel, x, y);
  }
  ctx.restore();
}

// ---------- map / viewport ----------
const hqKey = `${MAP.hq[0]},${MAP.hq[1]}`;
let cell = CELL;
let originX = 0;
let originY = 0;
let dpr = 1;

function fitViewport() {
  const w = stageWrap.clientWidth;
  const h = stageWrap.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Frame land mass (not empty ocean corners) like Boom Beach scout view.
  const lb = landBounds();
  const minC = lb.minC - 0.4;
  const maxC = lb.maxC + 0.8;
  const minR = lb.minR - 0.3;
  const maxR = lb.maxR + 0.6;
  const corners = [
    [minC, minR], [maxC, minR], [minC, maxR], [maxC, maxR],
  ];
  const probe = (cellSize) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [c, r] of corners) {
      const p = isoToScreen(c, r, 0, 0, cellSize);
      minX = Math.min(minX, p.x - cellSize * 0.5);
      maxX = Math.max(maxX, p.x + cellSize * 0.5);
      minY = Math.min(minY, p.y - cellSize * 0.25);
      maxY = Math.max(maxY, p.y + cellSize * 0.45);
    }
    return { minX, maxX, minY, maxY, bw: maxX - minX, bh: maxY - minY };
  };
  const unit = probe(1);
  // Prefer filling viewport height (phone portrait) like Boom Beach scout.
  const cover = Math.max((w * 1.12) / unit.bw, (h * 1.14) / unit.bh);
  cell = Math.max(40, Math.min(cover, 180));
  const box = probe(cell);
  originX = (w - (box.minX + box.maxX)) / 2 + w * 0.04;
  // Bias so bottom-left beach sits lower-left in the stage.
  originY = (h - (box.minY + box.maxY)) / 2 - h * 0.06;
}

function toScreen(col, row) {
  return isoToScreen(col, row, originX, originY, cell);
}

function cellCorners(col, row) {
  return [
    toScreen(col - 0.5, row - 0.5),
    toScreen(col + 0.5, row - 0.5),
    toScreen(col + 0.5, row + 0.5),
    toScreen(col - 0.5, row + 0.5),
  ];
}

// ---------- game state ----------
let nextId = 1;
const state = {
  gold: MAP.startGold,
  wood: MAP.startWood ?? 0,
  hp: MAP.startHp,
  waveIndex: 0,
  phase: "prep", // prep | combat | won | lost
  buildings: [],
  enemies: [],
  projectiles: [],
  fx: [],
  selectedKind: null,
  selectedBuilding: null,
  speed: 1,
  paused: false,
  spawnQueue: [],
  spawnTimer: 0,
};
const occupied = new Set();

// ---------- UI sync ----------
function refreshHud() {
  goldEl.textContent = String(Math.floor(state.gold));
  if (woodEl) woodEl.textContent = String(Math.floor(state.wood));
  const displayWave = state.phase === "combat"
    ? Math.min(state.waveIndex + 1, MAP.waves)
    : Math.min(state.waveIndex, MAP.waves);
  waveEl.textContent = `${displayWave}/${MAP.waves}`;
  hpEl.textContent = String(Math.max(0, Math.floor(state.hp)));
  if (nextWaveEl) {
    if (state.phase === "prep" && state.waveIndex < MAP.waves) {
      const spec = waveSpec(state.waveIndex);
      const name = ENEMIES[spec.kind]?.name || spec.kind;
      nextWaveEl.textContent = `${name}×${spec.count}`;
    } else if (state.phase === "combat") {
      nextWaveEl.textContent = "교전 중";
    } else {
      nextWaveEl.textContent = "—";
    }
  }
  towerBtns.forEach((btn) => {
    const kind = btn.dataset.kind;
    const def = BUILDINGS[kind];
    if (!def) return;
    const cost = def.cost.gold;
    btn.disabled = state.phase !== "prep" || state.gold < cost;
    btn.setAttribute("aria-pressed", String(state.selectedKind === kind));
  });
  if (btnStartWave) btnStartWave.disabled = state.phase !== "prep";
}

function showBanner(text, ms = 1800) {
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { banner.hidden = true; }, ms);
}

function openHelp() { helpEl.classList.remove("hidden"); }
function closeHelp() { helpEl.classList.add("hidden"); }

function closeSheet() {
  sheetEl.classList.add("hidden");
  state.selectedBuilding = null;
}

function openSheetForBuilding(building) {
  state.selectedBuilding = building;
  const base = BUILDINGS[building.kind];
  sheetTitle.textContent = `${base.name} (Lv.${building.level + 1})`;
  const up = upgradeCosts(base.cost.gold);
  const sellValue = Math.floor(building.spent * SELL_REFUND);
  const hpLine = `내구 ${Math.ceil(building.hp)}/${building.maxHp}`;
  if (base.role === "defense") {
    const dmg = scaledStat(base.damage, building.level, UPGRADE_STAT).toFixed(0);
    const range = scaledStat(base.range, building.level, UPGRADE_STAT).toFixed(1);
    sheetBody.textContent = `${hpLine} · 피해 ${dmg} · 사거리 ${range} · 판매가 ${sellValue}G`;
  } else {
    const mul = building.level >= 1 ? 1.5 : 1;
    const parts = [];
    if (base.income.gold) parts.push(`금 ${Math.floor(base.income.gold * mul)}`);
    if (base.income.wood) parts.push(`나무 ${Math.floor(base.income.wood * mul)}`);
    sheetBody.textContent = `${hpLine} · 수입 ${parts.join(" · ")} / 웨이브 · 판매가 ${sellValue}G`;
  }
  const notPrep = state.phase !== "prep";
  const canUpgrade = !notPrep && building.level < 1
    && state.gold >= up.gold && state.wood >= up.wood;
  btnUpgrade.disabled = notPrep || building.level >= 1 || !canUpgrade;
  btnUpgrade.textContent = building.level >= 1
    ? "강화 완료"
    : `강화 (${up.gold}G + ${up.wood}나무)`;
  btnSell.disabled = notPrep;
  btnSell.textContent = `판매 (${sellValue}G)`;
  sheetEl.classList.remove("hidden");
}

function showOverlay(won) {
  overlayCard.innerHTML = "";
  const h2 = document.createElement("h2");
  h2.textContent = won ? "작전 성공!" : "본부 함락...";
  const p = document.createElement("p");
  p.textContent = won
    ? "모든 웨이브를 막아내고 섬을 지켜냈습니다."
    : "본부가 파괴되었습니다. 다시 도전해보세요.";
  const actions = document.createElement("div");
  actions.className = "actions";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "btn";
  retry.textContent = "다시하기";
  retry.addEventListener("click", () => window.location.reload());
  const list = document.createElement("button");
  list.type = "button";
  list.className = "btn ghost";
  list.textContent = "목록";
  list.addEventListener("click", () => { window.location.href = "../"; });
  actions.appendChild(retry);
  actions.appendChild(list);
  overlayCard.appendChild(h2);
  overlayCard.appendChild(p);
  overlayCard.appendChild(actions);
  overlayEl.hidden = false;
  sfx.play(won ? "win" : "lose");
}

// ---------- placement ----------
function occupiedSet() {
  const s = new Set(occupied);
  s.add(hqKey);
  return s;
}

/** Buildings block pathfinding; HQ is the goal (not blocked for path). */
function pathBlockedSet() {
  return new Set(occupied);
}

function buildingAt(col, row) {
  return state.buildings.find((b) => b.col === col && b.row === row) || null;
}

function tryPlaceBuilding(col, row, kind) {
  if (state.phase !== "prep") return false;
  const base = BUILDINGS[kind];
  if (!base || state.gold < base.cost.gold) return false;
  if (!canPlace(col, row, occupiedSet(), MAP.cols, MAP.rows, MAP.hq)) return false;
  state.gold -= base.cost.gold;
  const building = {
    id: nextId++,
    kind,
    col,
    row,
    level: 0,
    spent: base.cost.gold,
    cooldown: 0,
    targetId: null,
    hp: base.hp,
    maxHp: base.hp,
  };
  state.buildings.push(building);
  occupied.add(`${col},${row}`);
  sfx.play("build");
  refreshHud();
  return true;
}

function upgradeBuilding(building) {
  if (state.phase !== "prep") return;
  const base = BUILDINGS[building.kind];
  const cost = upgradeCosts(base.cost.gold);
  if (building.level >= 1 || state.gold < cost.gold || state.wood < cost.wood) return;
  state.gold -= cost.gold;
  state.wood -= cost.wood;
  building.spent += cost.gold;
  building.level = 1;
  building.maxHp = Math.floor(base.hp * UPGRADE_STAT);
  building.hp = building.maxHp;
  sfx.play("upgrade");
  refreshHud();
  openSheetForBuilding(building);
}

function sellBuilding(building) {
  if (state.phase !== "prep") return;
  const refund = Math.floor(building.spent * SELL_REFUND);
  state.gold += refund;
  state.buildings = state.buildings.filter((b) => b.id !== building.id);
  occupied.delete(`${building.col},${building.row}`);
  sfx.play("drop");
  refreshHud();
  closeSheet();
}

// ---------- waves ----------
function buildSpawnQueue() {
  const spec = waveSpec(state.waveIndex);
  const queue = [];
  for (let i = 0; i < spec.count; i++) {
    queue.push({ kind: spec.kind, hpMul: spec.hpMul, speedMul: spec.speedMul, goldMul: spec.goldMul });
  }
  return queue;
}

function startWave() {
  if (state.phase !== "prep") return;
  state.spawnQueue = buildSpawnQueue();
  state.spawnTimer = 0;
  state.phase = "combat";
  showBanner(`웨이브 ${state.waveIndex + 1} 시작!`);
  refreshHud();
}

function spawnEnemy(spec) {
  const base = ENEMIES[spec.kind];
  const landing = pickLanding();
  const blocked = pathBlockedSet();
  const route = resolveTroopPath(landing, MAP.hq, state.buildings, blocked);
  const waypoints = route.waypoints.length ? route.waypoints : [landing];
  state.enemies.push({
    id: nextId++,
    kind: spec.kind,
    hp: base.hp * spec.hpMul,
    maxHp: base.hp * spec.hpMul,
    speed: base.speed * spec.speedMul,
    gold: base.gold * spec.goldMul,
    leak: base.leak,
    attack: base.attack,
    attackCd: base.attackCd,
    attackTimer: 0,
    dist: 0,
    waypoints,
    mode: route.mode,
    assaultId: route.targetId,
    x: waypoints[0][0],
    y: waypoints[0][1],
  });
}

function assignEnemyRoute(enemy) {
  const start = [Math.round(enemy.x), Math.round(enemy.y)];
  const blocked = pathBlockedSet();
  const route = resolveTroopPath(start, MAP.hq, state.buildings, blocked);
  enemy.waypoints = route.waypoints.length ? route.waypoints : [start];
  enemy.mode = route.mode;
  enemy.assaultId = route.targetId;
  enemy.dist = 0;
  enemy.x = enemy.waypoints[0][0];
  enemy.y = enemy.waypoints[0][1];
  enemy.leaked = false;
}

function destroyBuilding(building) {
  state.buildings = state.buildings.filter((b) => b.id !== building.id);
  occupied.delete(`${building.col},${building.row}`);
  const p = toScreen(building.col, building.row);
  state.fx.push({ x: p.x, y: p.y, life: 0.4, maxLife: 0.4 });
  sfx.play("explode", 0.45);
  if (state.selectedBuilding?.id === building.id) closeSheet();
  for (const enemy of state.enemies) {
    if (!enemy.dead) assignEnemyRoute(enemy);
  }
  showBanner(`${BUILDINGS[building.kind].name} 파괴됨!`, 1400);
}

function damageEnemy(enemy, amount) {
  enemy.hp -= amount;
  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.dead = true;
    state.gold += Math.round(enemy.gold);
    sfx.play("hit");
  }
}

function endWaveIfClear() {
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.waveIndex += 1;
    const payout = productionPayout(state.buildings);
    state.gold += payout.gold;
    state.wood += payout.wood;
    const incomeParts = [];
    if (payout.gold) incomeParts.push(`+${payout.gold}G`);
    if (payout.wood) incomeParts.push(`+${payout.wood}나무`);
    const incomeNote = incomeParts.length ? ` 수입 ${incomeParts.join(" ")}` : "";
    if (state.waveIndex >= MAP.waves) {
      state.phase = "won";
      showBanner(`웨이브 클리어!${incomeNote}`);
      showOverlay(true);
    } else {
      state.phase = "prep";
      showBanner(`웨이브 클리어!${incomeNote} 다음 공격을 준비하세요.`, 2200);
    }
    refreshHud();
  }
}

// ---------- combat update ----------
function updateCombat(dt) {
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state.spawnQueue.shift());
      state.spawnTimer = SPAWN_STAGGER;
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.mode === "assault" && enemy.assaultId != null) {
      const target = state.buildings.find((b) => b.id === enemy.assaultId);
      if (!target) {
        assignEnemyRoute(enemy);
        continue;
      }
      enemy.dist += enemy.speed * dt;
      const pos = moveAlongPath(enemy.dist, enemy.waypoints);
      enemy.x = pos.x;
      enemy.y = pos.y;
      if (pos.done) {
        enemy.x = target.col;
        enemy.y = target.row;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          target.hp -= enemy.attack;
          enemy.attackTimer = enemy.attackCd;
          sfx.play("hitSoft", 0.25);
          if (target.hp <= 0) destroyBuilding(target);
        }
      }
      continue;
    }

    if (enemy.mode === "stuck") {
      assignEnemyRoute(enemy);
      continue;
    }

    enemy.dist += enemy.speed * dt;
    const pos = moveAlongPath(enemy.dist, enemy.waypoints);
    enemy.x = pos.x;
    enemy.y = pos.y;
    if (pos.done) enemy.leaked = true;
  }

  const leakedEnemies = state.enemies.filter((e) => e.leaked);
  if (leakedEnemies.length) {
    for (const enemy of leakedEnemies) state.hp -= enemy.leak;
    state.enemies = state.enemies.filter((e) => !e.leaked);
    sfx.play("hitSoft");
  }

  if (state.hp <= 0) {
    state.hp = 0;
    state.phase = "lost";
    refreshHud();
    showOverlay(false);
    return;
  }

  for (const building of state.buildings) {
    const base = BUILDINGS[building.kind];
    if (!base || base.role !== "defense") continue;
    building.cooldown -= dt;
    if (building.cooldown > 0) continue;
    const range = scaledStat(base.range, building.level, UPGRADE_STAT);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - building.col, enemy.y - building.row);
      if (d <= range && d < bestDist) { best = enemy; bestDist = d; }
    }
    if (best) {
      fireProjectile(building, best);
      building.cooldown = base.cooldown;
      sfx.play("shoot", 0.35);
    }
  }

  updateProjectiles(dt);

  state.enemies = state.enemies.filter((e) => e.hp > 0);

  for (const f of state.fx) f.life -= dt;
  state.fx = state.fx.filter((f) => f.life > 0);

  endWaveIfClear();
  refreshHud();
}

function fireProjectile(building, target) {
  const base = BUILDINGS[building.kind];
  const dmg = scaledStat(base.damage, building.level, UPGRADE_STAT);
  const from = toScreen(building.col, building.row);
  const proj = {
    id: nextId++,
    kind: base.projectile,
    x: building.col,
    y: building.row,
    sx: from.x,
    sy: from.y,
    speed: base.speed,
    damage: dmg,
    splash: base.splash,
    targetId: target.id,
  };
  if (base.projectile === "arc") {
    proj.destX = target.x;
    proj.destY = target.y;
  }
  state.projectiles.push(proj);
  state.fx.push({ x: from.x, y: from.y, life: 0.12, maxLife: 0.12, kind: "muzzle" });
}

function applyImpact(x, y, damage, splash) {
  if (splash > 0) {
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - x, enemy.y - y);
      if (d <= splash) damageEnemy(enemy, damage);
    }
  } else {
    const enemy = state.enemies.find((e) => Math.hypot(e.x - x, e.y - y) < 0.35);
    if (enemy) damageEnemy(enemy, damage);
  }
  const p = toScreen(x, y);
  state.fx.push({ x: p.x, y: p.y, life: 0.28, maxLife: 0.28 });
}

function updateProjectiles(dt) {
  const remaining = [];
  for (const proj of state.projectiles) {
    let destX, destY, hasTarget = true;
    if (proj.kind === "arc") {
      destX = proj.destX;
      destY = proj.destY;
    } else {
      const target = state.enemies.find((e) => e.id === proj.targetId);
      if (!target) { hasTarget = false; destX = proj.x; destY = proj.y; }
      else { destX = target.x; destY = target.y; }
    }
    if (!hasTarget) continue;
    const dx = destX - proj.x;
    const dy = destY - proj.y;
    const dist = Math.hypot(dx, dy);
    const step = proj.speed * dt;
    if (dist <= step || dist < 0.12) {
      applyImpact(destX, destY, proj.damage, proj.splash);
      sfx.play(proj.splash > 0 ? "explode" : "bigHit", 0.3);
      continue;
    }
    proj.x += (dx / dist) * step;
    proj.y += (dy / dist) * step;
    remaining.push(proj);
  }
  state.projectiles = remaining;
}

// ---------- rendering ----------
function drawOcean() {
  const w = stageWrap.clientWidth;
  const h = stageWrap.clientHeight;
  // Boom Beach sea — clean turquoise, no foreign island wash.
  const grad = ctx.createLinearGradient(0, 0, w * 0.2, h);
  grad.addColorStop(0, "#6ec8dc");
  grad.addColorStop(0.45, "#3eb0c8");
  grad.addColorStop(1, "#1f7f9a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

const TERRAIN_FILL = {
  // Soft Boom Beach palette — low checker contrast so props sit on unified ground.
  [T.WATER]: ["#45b4cc", "#3aa8c0"],
  [T.BEACH]: ["#edd6a0", "#e5cb92"],
  [T.GRASS]: ["#6ec456", "#66bc50"],
  [T.FOREST]: ["#4f9f48", "#479440"],
};

function fillCell(col, row, fill, stroke) {
  const corners = cellCorners(col, row);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawTerrain() {
  for (let row = 0; row < MAP.rows; row++) {
    for (let col = 0; col < MAP.cols; col++) {
      const kind = terrainAt(col, row, TERRAIN);
      const palette = TERRAIN_FILL[kind];
      if (!palette) continue;
      const light = (col + row) % 2 === 0;
      const stroke = kind === T.WATER ? "rgba(255,255,255,0.06)" : "rgba(40,70,50,0.06)";
      fillCell(col, row, light ? palette[0] : palette[1], stroke);
    }
  }
}

function drawSurf(time) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (let row = 0; row < MAP.rows; row++) {
    for (let col = 0; col < MAP.cols; col++) {
      if (terrainAt(col, row, TERRAIN) !== T.BEACH) continue;
      for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (terrainAt(col + dc, row + dr, TERRAIN) !== T.WATER) continue;
        const corners = cellCorners(col, row);
        let a; let b;
        if (dc === 1) { a = corners[0]; b = corners[1]; }
        else if (dr === 1) { a = corners[1]; b = corners[2]; }
        else if (dc === -1) { a = corners[2]; b = corners[3]; }
        else { a = corners[3]; b = corners[0]; }
        ctx.beginPath();
        const steps = 5;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t + Math.sin(time * 2.6 + col + t * 4) * 2.2;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawPier() {
  const cells = MAP.pier || [];
  if (!cells.length) return;
  for (const [col, row] of cells) {
    fillCell(col, row, "#9a9a92", "rgba(40,40,36,0.35)");
    fillCell(col, row - 0.02, "#b0aea4", null);
  }
  // Plank lines along the pier spine (rightward into water).
  ctx.save();
  ctx.strokeStyle = "rgba(55,52,45,0.45)";
  ctx.lineWidth = 1.2;
  for (const [col, row] of cells) {
    const corners = cellCorners(col, row);
    for (let i = 1; i <= 2; i++) {
      const t = i / 3;
      const a = {
        x: corners[0].x + (corners[3].x - corners[0].x) * t,
        y: corners[0].y + (corners[3].y - corners[0].y) * t,
      };
      const b = {
        x: corners[1].x + (corners[2].x - corners[1].x) * t,
        y: corners[1].y + (corners[2].y - corners[1].y) * t,
      };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDecor() {
  drawPier();
  const grassImg = IMAGES.decoGrass;
  const grassSm = IMAGES.decoGrassSm;
  for (let row = 0; row < MAP.rows; row++) {
    for (let col = 0; col < MAP.cols; col++) {
      if (terrainAt(col, row, TERRAIN) !== T.GRASS) continue;
      const p = toScreen(col, row);
      if (grassImg.ready && (col * 3 + row * 5) % 8 === 0) {
        const s = cell * 0.42;
        ctx.drawImage(grassImg.processed || grassImg, p.x - s / 2, p.y - s * 0.4, s, s * 0.75);
      } else if (grassSm.ready && (col * 5 + row * 3) % 10 === 0) {
        const s = cell * 0.28;
        ctx.drawImage(grassSm.processed || grassSm, p.x - s / 2, p.y - s * 0.35, s, s * 0.7);
      }
    }
  }
  for (const [col, row] of MAP.boats || []) {
    const p = toScreen(col, row);
    drawSprite(IMAGES.landing, p.x, p.y + cell * 0.05, cell * 1.2, cell * 1.0, "#3a6ea5", "LC");
  }
  // One gunboat offshore (Boom Beach flavor)
  if (IMAGES.gunboat.ready) {
    const p = toScreen(1.2, 12.5);
    drawSprite(IMAGES.gunboat, p.x, p.y, cell * 1.4, cell * 1.1, "#2a5a8a", "");
  }
}

function drawForest() {
  // Boom Beach map-shape behind the treeline (rear of island).
  if (IMAGES.bbCliff?.ready) {
    const p = toScreen(7, -0.4);
    const w = cell * 10;
    const h = cell * 4.2;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(IMAGES.bbCliff.processed || IMAGES.bbCliff, p.x - w / 2, p.y - h * 0.75, w, h);
    ctx.restore();
  }
  const trees = [...(MAP.trees || [])].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const [col, row, variant] of trees) {
    const p = toScreen(col, row);
    const key = TREE_IMG[variant % TREE_IMG.length];
    const h = cell * (1.2 + (variant % 3) * 0.12);
    const w = h * 1.05;
    drawSprite(IMAGES[key], p.x, p.y - h * 0.3, w, h, "#2f7a32", "");
  }
}

function drawRangePreview() {
  if (!state.selectedKind || state.phase !== "prep") return;
  if (!hoverCell) return;
  const def = BUILDINGS[state.selectedKind];
  if (!def) return;
  const { col, row } = hoverCell;
  const ok = canPlace(col, row, occupiedSet(), MAP.cols, MAP.rows, MAP.hq) && state.gold >= def.cost.gold;
  fillCell(col, row, ok ? "rgba(123,198,126,0.35)" : "rgba(224,80,80,0.3)", ok ? "#2f8f36" : "#c0392b");
  if (def.role !== "defense") return;
  const center = toScreen(col, row);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, def.range * cell / 2, def.range * cell / 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = ok ? "rgba(123,198,126,0.18)" : "rgba(224,80,80,0.15)";
  ctx.strokeStyle = ok ? "#2f8f36" : "#c0392b";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const DEFENSE_COLOR = { mg: "#5aa9e6", cannon: "#e0763d", mortar: "#9a6bd6" };
const DEFENSE_LABEL = { mg: "MG", cannon: "CN", mortar: "MO" };
const DEFENSE_IMG = { mg: "tower_mg", cannon: "tower_cannon", mortar: "tower_mortar" };
const PROD_COLOR = { residence: "#c4a574", sawmill: "#8b6b4a" };
const PROD_LABEL = { residence: "주", sawmill: "제" };
const PROD_IMG = { residence: "building_residence", sawmill: "building_sawmill" };

function drawBuildings() {
  for (const building of state.buildings) {
    const p = toScreen(building.col, building.row);
    const base = BUILDINGS[building.kind];
    if (base.role === "defense") {
      drawSprite(
        IMAGES[DEFENSE_IMG[building.kind]],
        p.x, p.y - cell * 0.15, cell * 0.8, cell * 0.8,
        DEFENSE_COLOR[building.kind], DEFENSE_LABEL[building.kind],
      );
    } else {
      drawSprite(
        IMAGES[PROD_IMG[building.kind]],
        p.x, p.y - cell * 0.12, cell * 0.85, cell * 0.85,
        PROD_COLOR[building.kind], PROD_LABEL[building.kind],
      );
    }
    if (building.level >= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y - cell * 0.15, cell * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffd54a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    if (building.hp < building.maxHp) {
      const barW = cell * 0.55;
      const ratio = Math.max(0, building.hp / building.maxHp);
      ctx.save();
      ctx.fillStyle = "rgba(28,61,74,0.55)";
      ctx.fillRect(p.x - barW / 2, p.y + cell * 0.28, barW, 4);
      ctx.fillStyle = ratio > 0.4 ? "#4ade80" : "#f87171";
      ctx.fillRect(p.x - barW / 2, p.y + cell * 0.28, barW * ratio, 4);
      ctx.restore();
    }
  }
}

const ENEMY_COLOR = { rifle: "#e05050", brute: "#e0a840", tank: "#555f6e" };
const ENEMY_LABEL = { rifle: "보", brute: "돌", tank: "탱" };
const ENEMY_IMG = { rifle: "enemy_rifle", brute: "enemy_brute", tank: "enemy_tank" };

function drawEnemies() {
  for (const enemy of state.enemies) {
    const p = toScreen(enemy.x, enemy.y);
    const size = enemy.kind === "tank" ? cell * 0.62 : cell * 0.46;
    drawSprite(IMAGES[ENEMY_IMG[enemy.kind]], p.x, p.y, size, size, ENEMY_COLOR[enemy.kind], ENEMY_LABEL[enemy.kind]);
    const barW = size * 0.9;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.save();
    ctx.fillStyle = "rgba(28,61,74,0.5)";
    ctx.fillRect(p.x - barW / 2, p.y - size / 2 - 8, barW, 4);
    ctx.fillStyle = ratio > 0.4 ? "#4ade80" : "#f87171";
    ctx.fillRect(p.x - barW / 2, p.y - size / 2 - 8, barW * ratio, 4);
    ctx.restore();
  }
}

function drawProjectiles() {
  for (const proj of state.projectiles) {
    const p = toScreen(proj.x, proj.y);
    ctx.save();
    ctx.beginPath();
    const r = proj.kind === "arc" ? 5 : proj.kind === "shell" ? 4 : 2.5;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = proj.kind === "arc" ? "#5b4636" : proj.kind === "shell" ? "#e0763d" : "#fffde0";
    ctx.fill();
    ctx.restore();
  }
}

function drawFx() {
  for (const f of state.fx) {
    const t = 1 - f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    if (f.kind === "muzzle") {
      ctx.beginPath();
      ctx.arc(f.x, f.y, cell * 0.14 * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = "#fff176";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(f.x, f.y, cell * 0.18 * (1 + t), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,180,60,0.8)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(f.x, f.y, cell * (0.22 + t * 0.34), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHq() {
  const [col, row] = MAP.hq;
  const p = toScreen(col, row);
  drawSprite(IMAGES.hq, p.x, p.y - cell * 0.35, cell * 1.35, cell * 1.55, "#c0392b", "HQ");
}

function render(time) {
  drawOcean();
  drawTerrain();
  drawSurf(time);
  drawDecor();
  drawRangePreview();
  drawBuildings();
  drawEnemies();
  drawProjectiles();
  drawFx();
  drawHq();
  drawForest();
}

// ---------- input ----------
let hoverCell = null;

function eventToCell(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  return screenToIso(x, y, originX, originY, cell);
}

canvas.addEventListener("pointermove", (evt) => {
  if (state.phase !== "prep" || !state.selectedKind) { hoverCell = null; return; }
  hoverCell = eventToCell(evt);
});

canvas.addEventListener("pointerdown", (evt) => {
  const { col, row } = eventToCell(evt);
  const existing = buildingAt(col, row);
  if (existing) {
    openSheetForBuilding(existing);
    return;
  }
  if (state.selectedKind && state.phase === "prep") {
    const placed = tryPlaceBuilding(col, row, state.selectedKind);
    if (!placed) sfx.play("fail");
  }
});

towerBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.kind;
    if (!BUILDINGS[kind]) return;
    state.selectedKind = state.selectedKind === kind ? null : kind;
    sfx.play("click");
    refreshHud();
  });
});

if (btnStartWave) {
  btnStartWave.addEventListener("click", () => {
    startWave();
    sfx.play("success");
  });
}

btnPause.addEventListener("click", () => {
  state.paused = !state.paused;
  btnPause.textContent = state.paused ? "▶" : "Ⅱ";
  btnPause.setAttribute("aria-label", state.paused ? "재생" : "일시정지");
  sfx.play("toggle");
});

btnSpeed.addEventListener("click", () => {
  state.speed = state.speed === 1 ? 2 : 1;
  btnSpeed.textContent = `${state.speed}×`;
  sfx.play("toggle2");
});

btnSound.addEventListener("click", () => {
  const muted = btnSound.classList.toggle("muted");
  sfx.setEnabled(!muted);
  btnSound.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
});

btnHelp.addEventListener("click", openHelp);
btnHelpClose.addEventListener("click", closeHelp);
btnHelpOk.addEventListener("click", closeHelp);

btnUpgrade.addEventListener("click", () => {
  if (state.selectedBuilding) upgradeBuilding(state.selectedBuilding);
});
btnSell.addEventListener("click", () => {
  if (state.selectedBuilding) sellBuilding(state.selectedBuilding);
});
btnSheetClose.addEventListener("click", closeSheet);

window.addEventListener("resize", fitViewport);

// ---------- main loop ----------
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  dt = Math.min(dt, 0.05);

  if (!state.paused && state.phase === "combat") {
    updateCombat(dt * state.speed);
  }
  render(ts / 1000);
}

// ---------- init ----------
fitViewport();
refreshHud();
openHelp();
requestAnimationFrame(frame);
