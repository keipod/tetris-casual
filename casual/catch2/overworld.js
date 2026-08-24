/** Overworld: large tilemap, camera follow, smooth steps, walk-cycle sprites. */

export const T = {
  GRASS: 0, PATH: 1, TALL: 2, WATER: 3, TREE: 4, FLOWERS: 5,
  BRIDGE: 6, HOUSE: 7, SHOP: 8,
};

export const MAP_W = 108;
export const MAP_H = 80;
export const TILE = 48;
export const MOVE_MS = 165;
export const VIEW_TILES_X = 11;
export const ENCOUNTER_RATE = 0.12;
/** @deprecated random finds removed — balls are map pickups */
export const BALL_FIND_RATE = 0;
/** Steps before a grass patch can spawn again after an encounter. */
export const PATCH_COOLDOWN_STEPS = 52;
/** Neighbor patches get a shorter soft cooldown. */
export const PATCH_SOFT_COOLDOWN = 22;
/** Speak with shop NPC when this many tiles away (Chebyshev). */
export const NPC_TALK_RANGE = 2;
/** About how many Poké Ball icons to scatter on the map. */
export const BALL_PICKUP_TARGET = 12;
/** Occasional gold coins on paths/grass. */
export const COIN_PICKUP_TARGET = 8;
/** Fireball battle items on the field. */
export const FIREBALL_PICKUP_TARGET = 5;
/** Visible roaming wild Pokémon on the overworld. */
export const WILD_SPAWN_COUNT = 24;
/** How far a wild may wander from its home tile. */
export const WILD_HOME_RADIUS = 5;
/** Base ms between wild wander steps. */
export const WILD_WANDER_MS = 850;
/** Refill delay after wilds are caught/fled below target. */
export const WILD_RESPAWN_MS = 12000;
/** Refill delay for field loot (ball/coin/fireball). */
export const LOOT_RESPAWN_MS = 15000;

const FACE_ROW = { down: 0, left: 1, right: 2, up: 3 };

const HOUSE_VARIANTS = ["houseCottage", "houseBlue", "houseInn"];

function hash(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return (n ^ (n >> 16)) >>> 0;
}

function noise(x, y) {
  return (hash(x, y) % 1000) / 1000;
}

function fillRect(m, x0, y0, w, h, tile, skip = null) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (m[y]?.[x] === undefined) continue;
      if (skip && skip(m[y][x])) continue;
      m[y][x] = tile;
    }
  }
}

/**
 * Place a multi-tile building footprint (tight — no sprawling path wipe).
 * Door on bottom center is PATH (or SHOP for mart).
 */
function placeBuilding(m, bx, by, w, h, kind, variant, village) {
  for (let y = by; y < by + h; y++) {
    for (let x = bx; x < bx + w; x++) {
      if (m[y]?.[x] === undefined) continue;
      m[y][x] = T.HOUSE;
    }
  }
  const doorX = bx + Math.floor(w / 2);
  const doorY = by + h - 1;
  if (kind === "shop") {
    m[doorY][doorX] = T.SHOP;
  } else {
    m[doorY][doorX] = T.PATH;
  }
  // One-tile porch only
  if (m[doorY + 1]?.[doorX] !== undefined) m[doorY + 1][doorX] = T.PATH;

  return {
    x: bx,
    y: by,
    w,
    h,
    kind,
    variant: variant || 0,
    village: village || "",
    doorX,
    doorY,
  };
}

/**
 * Compact village: houses clustered in neat rows around a small plaza + shop.
 *
 * Layout (tile footprint):
 *   H H H     ← north terrace (3 houses side-by-side)
 *   #######   ← plaza
 *   ## S ##   ← shop faces plaza
 *   #######
 *   H   H     ← south pair flanking the road
 */
function placeVillage(m, cx, cy, villageName, withShop = true) {
  // Compact plaza (9×7) — keep roads connected through center
  fillRect(m, cx - 4, cy - 3, 9, 7, T.PATH);
  const buildings = [];
  const shops = [];
  const npcs = [];

  // North terrace — three 3×3 houses packed with no gap
  const northY = cy - 6;
  const northRow = [
    [cx - 4, northY, 0],
    [cx - 1, northY, 1],
    [cx + 2, northY, 2],
  ];
  for (const [hx, hy, v] of northRow) {
    buildings.push(placeBuilding(m, hx, hy, 3, 3, "house", v, villageName));
  }
  // Path strip under north doors
  fillRect(m, cx - 4, cy - 3, 9, 1, T.PATH);

  // South pair — just below plaza
  const southY = cy + 4;
  for (const [hx, v] of [[cx - 4, 1], [cx + 2, 0]]) {
    buildings.push(placeBuilding(m, hx, southY, 3, 3, "house", v, villageName));
  }
  fillRect(m, cx - 1, cy + 2, 3, 3, T.PATH); // center lane south

  if (withShop) {
    // Shop sits on plaza, slightly north of center, door toward south
    const shop = placeBuilding(m, cx - 1, cy - 2, 3, 3, "shop", 0, villageName);
    buildings.push(shop);
    shops.push({
      x: shop.doorX,
      y: shop.doorY,
      name: "강화 상점",
      village: villageName,
    });
    const npcX = shop.doorX;
    const npcY = shop.doorY + 1;
    if (m[npcY]?.[npcX] !== undefined) m[npcY][npcX] = T.PATH;
    npcs.push({
      x: npcX,
      y: npcY,
      kind: "shopkeep",
      village: villageName,
      lines: [
        `${villageName} 강화 상점이에요!`,
        "문을 밟으면 강화할 수 있어요.",
        "실패할 수도 있으니 신중히!",
      ],
    });
  }

  // Keep plaza walkable (trees/tall wiped) without erasing buildings
  fillRect(m, cx - 4, cy - 3, 9, 7, T.PATH, (t) => t === T.HOUSE || t === T.SHOP);

  return { buildings, shops, npcs };
}

/** Deterministic Poké Ball pickups on walkable ground. */
export function buildBallPickups(map) {
  return buildFieldLoot(map).filter((p) => p.kind === "ball");
}

function lootTileOk(map, x, y) {
  const t = map[y]?.[x];
  if (t === undefined) return false;
  if (t === T.WATER || t === T.TREE || t === T.HOUSE || t === T.SHOP) return false;
  return t === T.PATH || t === T.GRASS || t === T.FLOWERS || t === T.BRIDGE || t === T.TALL;
}

function spacedOk(list, x, y, minDist = 3) {
  for (const p of list) {
    if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < minDist) return false;
  }
  return true;
}

/** Scatter balls, coins, fireballs on walkable field tiles. */
export function buildFieldLoot(map) {
  const loot = [];
  let id = 0;
  const addKind = (kind, target, preferPath) => {
    for (let y = 5; y < MAP_H - 5 && loot.filter((p) => p.kind === kind).length < target; y++) {
      for (let x = 5; x < MAP_W - 5 && loot.filter((p) => p.kind === kind).length < target; x++) {
        if (!lootTileOk(map, x, y)) continue;
        const t = map[y][x];
        const gate = kind === "ball"
          ? (t === T.PATH ? 0.88 : 0.94)
          : kind === "coin"
            ? (preferPath && t === T.PATH ? 0.9 : 0.96)
            : (t === T.TALL ? 0.86 : 0.95);
        const salt = kind === "ball" ? 1 : kind === "coin" ? 17 : 31;
        if (noise(x * (5 + salt), y * (5 + salt)) < gate) continue;
        if (!spacedOk(loot, x, y, kind === "coin" ? 4 : 3)) continue;
        const item = { id: ++id, kind, x, y };
        if (kind === "ball") item.n = noise(x + 40, y + 90) > 0.82 ? 2 : 1;
        if (kind === "coin") item.amount = 12 + (hash(x, y) % 29);
        if (kind === "fireball") item.n = 1;
        loot.push(item);
      }
    }
  };
  addKind("ball", BALL_PICKUP_TARGET, true);
  addKind("coin", COIN_PICKUP_TARGET, true);
  addKind("fireball", FIREBALL_PICKUP_TARGET, false);
  return loot;
}

function makeWildAt(x, y, speciesPool, id) {
  const speciesId = speciesPool[hash(x, y + id * 3) % speciesPool.length];
  const level = 3 + (hash(x * 3, y * 7 + id) % 6);
  return {
    id,
    speciesId,
    level,
    x, y, tx: x, ty: y,
    homeX: x, homeY: y,
    facing: "down",
    moving: false,
    fromX: x, fromY: y, toX: x, toY: y,
    t0: 0,
    nextWander: 400 + (hash(x, y) % 1200),
    bob: 0,
    sprite: null,
  };
}

/** Spawn visible wild mons on tall grass / meadows (not villages). */
export function buildWildSpawns(map, speciesPool) {
  const candidates = [];
  for (let y = 5; y < MAP_H - 5; y++) {
    for (let x = 5; x < MAP_W - 5; x++) {
      const t = map[y][x];
      if (t !== T.TALL && t !== T.GRASS && t !== T.FLOWERS) continue;
      if (noise(x * 9, y * 13) < (t === T.TALL ? 0.55 : 0.82)) continue;
      candidates.push({ x, y });
    }
  }
  candidates.sort((a, b) => hash(a.x, a.y) - hash(b.x, b.y));
  const wilds = [];
  for (const c of candidates) {
    if (wilds.length >= WILD_SPAWN_COUNT) break;
    let ok = true;
    for (const w of wilds) {
      if (Math.max(Math.abs(w.x - c.x), Math.abs(w.y - c.y)) < 4) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    wilds.push(makeWildAt(c.x, c.y, speciesPool, wilds.length + 1));
  }
  return wilds;
}

/** Keep wild count topped up over time. */
export function maintainWildPopulation(wilds, map, speciesPool, now, ctrl, playerTile = null) {
  if (!ctrl.nextId) {
    ctrl.nextId = wilds.reduce((m, w) => Math.max(m, w.id), 0) + 1;
  }
  if (wilds.length >= WILD_SPAWN_COUNT) return 0;
  if (now < (ctrl.nextAt || 0)) return 0;
  let spawned = 0;
  const need = Math.min(2, WILD_SPAWN_COUNT - wilds.length);
  const tries = 80;
  for (let i = 0; i < tries && spawned < need; i++) {
    const x = 5 + (hash(ctrl.nextId + i, Math.floor(now / 1000)) % (MAP_W - 10));
    const y = 5 + (hash(Math.floor(now / 500) + i, ctrl.nextId) % (MAP_H - 10));
    const t = map[y]?.[x];
    if (t !== T.TALL && t !== T.GRASS && t !== T.FLOWERS) continue;
    if (playerTile && Math.max(Math.abs(playerTile.x - x), Math.abs(playerTile.y - y)) < 6) continue;
    if (wilds.some((w) => Math.max(Math.abs(w.tx - x), Math.abs(w.ty - y)) < 4)) continue;
    wilds.push(makeWildAt(x, y, speciesPool, ctrl.nextId++));
    spawned += 1;
  }
  ctrl.nextAt = now + WILD_RESPAWN_MS;
  return spawned;
}

const LOOT_TARGETS = {
  ball: BALL_PICKUP_TARGET,
  coin: COIN_PICKUP_TARGET,
  fireball: FIREBALL_PICKUP_TARGET,
};

/** Top up field loot gradually (coins/fireballs/balls). */
export function maintainFieldLoot(loot, map, now, ctrl, playerTile = null) {
  if (!ctrl.nextId) {
    ctrl.nextId = loot.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  }
  if (now < (ctrl.nextAt || 0)) return 0;
  let spawned = 0;
  for (const kind of Object.keys(LOOT_TARGETS)) {
    const count = loot.filter((p) => p.kind === kind).length;
    const target = LOOT_TARGETS[kind];
    if (count >= target) continue;
    // coins are rarer to refill (sometimes)
    if (kind === "coin" && (hash(Math.floor(now / 3000), ctrl.nextId) % 100) < 35) continue;
    for (let i = 0; i < 60; i++) {
      const x = 5 + ((hash(ctrl.nextId, i + Math.floor(now / 800)) ) % (MAP_W - 10));
      const y = 5 + ((hash(i * 9, ctrl.nextId + Math.floor(now / 900)) ) % (MAP_H - 10));
      if (!lootTileOk(map, x, y)) continue;
      if (playerTile && Math.max(Math.abs(playerTile.x - x), Math.abs(playerTile.y - y)) < 4) continue;
      if (!spacedOk(loot, x, y, 3)) continue;
      const item = { id: ctrl.nextId++, kind, x, y };
      if (kind === "ball") item.n = 1 + (hash(x, y) % 100 > 85 ? 1 : 0);
      if (kind === "coin") item.amount = 10 + (hash(x * 2, y) % 35);
      if (kind === "fireball") item.n = 1;
      loot.push(item);
      spawned += 1;
      break;
    }
  }
  ctrl.nextAt = now + LOOT_RESPAWN_MS;
  return spawned;
}

const WILD_MOVE_MS = 220;

/** Step wilds around their home; call each frame with now. */
export function updateWilds(wilds, map, now, playerTile = null) {
  for (const w of wilds) {
    if (w.moving) {
      const u = Math.min(1, (now - w.t0) / WILD_MOVE_MS);
      const e = u * u * (3 - 2 * u);
      w.x = w.fromX + (w.toX - w.fromX) * e;
      w.y = w.fromY + (w.toY - w.fromY) * e;
      w.bob = Math.sin(u * Math.PI) * 0.08;
      if (u >= 1) {
        w.moving = false;
        w.x = w.tx;
        w.y = w.ty;
        w.bob = 0;
      }
      continue;
    }
    if (now < w.nextWander) continue;
    w.nextWander = now + WILD_WANDER_MS * (0.65 + (hash(w.id, Math.floor(now / 100)) % 100) / 100);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const order = dirs.sort((a, b) => hash(w.id + a[0] * 9, Math.floor(now) + b[1]) - hash(w.id + b[0] * 9, Math.floor(now) + a[1]));
    for (const [dx, dy] of order) {
      const nx = w.tx + dx;
      const ny = w.ty + dy;
      if (!walkable(map, nx, ny)) continue;
      if (Math.max(Math.abs(nx - w.homeX), Math.abs(ny - w.homeY)) > WILD_HOME_RADIUS) continue;
      if (playerTile && playerTile.x === nx && playerTile.y === ny) continue;
      // Don't stack on another wild's target
      if (wilds.some((o) => o !== w && o.tx === nx && o.ty === ny)) continue;
      w.fromX = w.tx;
      w.fromY = w.ty;
      w.toX = nx;
      w.toY = ny;
      w.tx = nx;
      w.ty = ny;
      w.facing = faceFromDelta(dx, dy);
      w.moving = true;
      w.t0 = now;
      break;
    }
  }
}

/** Wild on this tile (by destination tile). */
export function wildAt(wilds, x, y) {
  return wilds.find((w) => w.tx === x && w.ty === y) || null;
}

/** Procedural world: meadows, river + bridges, villages, tall-grass patches. */
export function buildMap() {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.GRASS));
  const patchId = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));

  // Outer woods belt
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) m[y][x] = T.TREE;
      else if (noise(x, y) > 0.93 && (x < 5 || y < 5 || x > MAP_W - 6 || y > MAP_H - 6)) {
        m[y][x] = T.TREE;
      }
    }
  }

  // Winding east-west roads
  for (const pathY of [Math.floor(MAP_H * 0.28), Math.floor(MAP_H * 0.62)]) {
    for (let x = 3; x < MAP_W - 3; x++) {
      const wobble = Math.floor(Math.sin(x * 0.14) * 2);
      for (let t = -1; t <= 1; t++) {
        const y = pathY + wobble + t;
        if (y > 2 && y < MAP_H - 3) m[y][x] = T.PATH;
      }
    }
  }
  // North-south roads
  for (const cx of [18, 36, 54, 72, 90]) {
    for (let y = 4; y < MAP_H - 4; y++) {
      const wobble = Math.floor(Math.sin(y * 0.18) * 1.5);
      for (let t = -1; t <= 1; t++) {
        const x = cx + wobble + t;
        if (x > 2 && x < MAP_W - 3) m[y][x] = T.PATH;
      }
    }
  }

  // River belt (horizontal) with bridges
  const riverY = Math.floor(MAP_H * 0.42);
  for (let y = riverY - 2; y <= riverY + 2; y++) {
    for (let x = 3; x < MAP_W - 3; x++) {
      if (m[y]?.[x] === undefined) continue;
      m[y][x] = T.WATER;
    }
  }
  const bridgeXs = [18, 36, 54, 72, 90];
  for (const bx of bridgeXs) {
    for (let y = riverY - 2; y <= riverY + 2; y++) {
      for (let t = -1; t <= 1; t++) {
        const x = bx + t;
        if (m[y]?.[x] !== undefined) m[y][x] = T.BRIDGE;
      }
    }
    // Connect bridge to roads
    for (let y = riverY - 5; y <= riverY + 5; y++) {
      if (m[y]?.[bx] !== undefined && m[y][bx] !== T.WATER) m[y][bx] = T.PATH;
      if (m[y]?.[bx] === T.BRIDGE) continue;
    }
  }

  // Extra ponds
  const ponds = [
    [14, 12, 5, 4], [48, 14, 6, 4], [88, 18, 5, 5],
    [28, 58, 7, 4], [68, 62, 6, 5], [96, 55, 5, 4],
    [12, 70, 5, 3],
  ];
  for (const [cx, cy, rw, rh] of ponds) {
    for (let y = cy - rh; y <= cy + rh; y++) {
      for (let x = cx - rw; x <= cx + rw; x++) {
        const dx = (x - cx) / rw;
        const dy = (y - cy) / rh;
        if (dx * dx + dy * dy <= 1 && m[y]?.[x] !== undefined && m[y][x] !== T.BRIDGE) {
          m[y][x] = T.WATER;
        }
      }
    }
  }

  // Tall grass patches (encounter zones) — larger world, more patches
  // NOTE: T.GRASS === 0 — must not use falsy checks on tile ids.
  const patches = [
    [8, 8, 12, 9],
    [26, 6, 11, 8],
    [44, 10, 13, 9],
    [62, 7, 12, 8],
    [82, 9, 14, 10],
    [10, 22, 11, 8],
    [40, 24, 12, 9],
    [70, 22, 13, 8],
    [92, 28, 10, 8],
    [8, 48, 12, 9],
    [30, 50, 14, 10],
    [52, 48, 12, 9],
    [74, 52, 13, 10],
    [94, 48, 10, 8],
    [20, 66, 12, 8],
    [48, 68, 14, 9],
    [78, 66, 12, 8],
    [36, 34, 11, 6], // near river south
    [60, 34, 11, 6],
  ];
  let nextPatch = 1;
  const patchMeta = [];
  for (const [x0, y0, w, h] of patches) {
    const id = nextPatch++;
    let cells = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (m[y]?.[x] === undefined) continue;
        if (m[y][x] === T.PATH || m[y][x] === T.WATER || m[y][x] === T.TREE
          || m[y][x] === T.BRIDGE || m[y][x] === T.HOUSE || m[y][x] === T.SHOP) continue;
        if (noise(x * 3, y * 3) > 0.2) {
          m[y][x] = T.TALL;
          patchId[y][x] = id;
          cells++;
        }
      }
    }
    if (cells) patchMeta.push({ id, x0, y0, w, h });
  }

  // Flower meadows
  for (let y = 4; y < MAP_H - 4; y++) {
    for (let x = 4; x < MAP_W - 4; x++) {
      if (m[y][x] !== T.GRASS) continue;
      if (noise(x + 90, y + 40) > 0.9) m[y][x] = T.FLOWERS;
    }
  }

  // Tree clusters inland
  for (let i = 0; i < 160; i++) {
    const x = 4 + (hash(i, 7) % (MAP_W - 8));
    const y = 4 + (hash(i, 13) % (MAP_H - 8));
    if (m[y][x] === T.GRASS || m[y][x] === T.FLOWERS) {
      if (noise(x, y + 200) > 0.58) m[y][x] = T.TREE;
    }
  }

  // Villages with multi-tile houses, shops, and porch NPCs
  const buildings = [];
  const shops = [];
  const npcs = [];
  const south = placeVillage(m, Math.floor(MAP_W / 2), Math.floor(MAP_H * 0.72), "남쪽 마을", true);
  const north = placeVillage(m, Math.floor(MAP_W * 0.28), Math.floor(MAP_H * 0.18), "북쪽 마을", true);
  const east = placeVillage(m, Math.floor(MAP_W * 0.82), Math.floor(MAP_H * 0.22), "동쪽 마을", true);
  for (const v of [south, north, east]) {
    buildings.push(...v.buildings);
    shops.push(...v.shops);
    npcs.push(...v.npcs);
  }

  // Re-assert bridges after village/trees
  for (const bx of bridgeXs) {
    for (let y = riverY - 2; y <= riverY + 2; y++) {
      for (let t = -1; t <= 1; t++) {
        const x = bx + t;
        if (m[y]?.[x] !== undefined) m[y][x] = T.BRIDGE;
      }
    }
  }

  // Spawn on south village plaza south of shop NPC
  const sx = Math.floor(MAP_W / 2);
  const sy = Math.floor(MAP_H * 0.72) + 3;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (m[y]?.[x] === undefined) continue;
      if (m[y][x] === T.SHOP || m[y][x] === T.HOUSE) continue;
      m[y][x] = T.PATH;
      patchId[y][x] = 0;
    }
  }
  m[sy][sx] = T.PATH;

  const fieldLoot = buildFieldLoot(m);

  return {
    map: m,
    spawnX: sx,
    spawnY: sy,
    patchId,
    shops,
    patchMeta,
    buildings,
    npcs,
    fieldLoot,
    ballPickups: fieldLoot.filter((p) => p.kind === "ball"),
  };
}

export function walkable(map, x, y) {
  const t = map[y]?.[x];
  return t !== undefined && t !== T.WATER && t !== T.TREE && t !== T.HOUSE;
}

export function createPlayerState(save, spawnX, spawnY, map = null) {
  let px = save.px ?? spawnX;
  let py = save.py ?? spawnY;
  if (px < 2 || py < 2 || px >= MAP_W - 2 || py >= MAP_H - 2) {
    px = spawnX;
    py = spawnY;
  }
  if (map && !walkable(map, px, py)) {
    px = spawnX;
    py = spawnY;
  }
  return {
    tx: px,
    ty: py,
    x: px,
    y: py,
    facing: save.facing || "down",
    moving: false,
    fromX: px,
    fromY: py,
    toX: px,
    toY: py,
    t0: 0,
    walkFrame: 1,
    bob: 0,
  };
}

export function faceFromDelta(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  if (dy < 0) return "up";
  if (dy > 0) return "down";
  return null;
}

/**
 * Start a one-tile step. Returns false if blocked / busy.
 */
export function beginStep(player, map, dx, dy, now) {
  if (player.moving) return false;
  const face = faceFromDelta(dx, dy);
  if (face) player.facing = face;
  const nx = player.tx + dx;
  const ny = player.ty + dy;
  if (!walkable(map, nx, ny)) return false;
  player.moving = true;
  player.fromX = player.tx;
  player.fromY = player.ty;
  player.toX = nx;
  player.toY = ny;
  player.t0 = now;
  player.tx = nx;
  player.ty = ny;
  return true;
}

export function updatePlayer(player, now) {
  if (!player.moving) {
    player.x = player.tx;
    player.y = player.ty;
    player.walkFrame = 1;
    player.bob = 0;
    return { arrived: false, tileX: player.tx, tileY: player.ty };
  }
  const u = Math.min(1, (now - player.t0) / MOVE_MS);
  const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  player.x = player.fromX + (player.toX - player.fromX) * ease;
  player.y = player.fromY + (player.toY - player.fromY) * ease;
  // 0 stand, 1 mid, 2 step, 3 mid — classic RPG cycle
  player.walkFrame = u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.75 ? 2 : 3;
  player.bob = Math.sin(u * Math.PI) * 0.08;
  if (u >= 1) {
    player.moving = false;
    player.x = player.tx;
    player.y = player.ty;
    player.walkFrame = 1;
    player.bob = 0;
    return { arrived: true, tileX: player.tx, tileY: player.ty };
  }
  return { arrived: false, tileX: player.tx, tileY: player.ty };
}

export function cameraFor(player, vw, vh) {
  const tw = TILE;
  // Zoom so ~VIEW_TILES_X tiles fit horizontally
  const scale = vw / (VIEW_TILES_X * tw);
  const worldW = MAP_W * tw * scale;
  const worldH = MAP_H * tw * scale;
  let camX = player.x * tw * scale + (tw * scale) / 2 - vw / 2;
  let camY = player.y * tw * scale + (tw * scale) / 2 - vh / 2;
  camX = Math.max(0, Math.min(Math.max(0, worldW - vw), camX));
  camY = Math.max(0, Math.min(Math.max(0, worldH - vh), camY));
  return { camX, camY, scale, tw: tw * scale };
}

function tileColor(t) {
  return ({
    [T.GRASS]: "#6aab4a",
    [T.PATH]: "#c4a06a",
    [T.TALL]: "#3d7a2e",
    [T.WATER]: "#4a90c8",
    [T.TREE]: "#2a5a20",
    [T.FLOWERS]: "#7ab84a",
    [T.BRIDGE]: "#8b5a2b",
    [T.HOUSE]: "#c07050",
    [T.SHOP]: "#e8b020",
  })[t] || "#5a8a3a";
}

function tileImg(tiles, t) {
  if (t === T.GRASS || t === T.FLOWERS) return tiles.grass;
  if (t === T.PATH || t === T.BRIDGE || t === T.SHOP) return tiles.path;
  if (t === T.TALL) return tiles.tall;
  if (t === T.WATER) return tiles.water;
  if (t === T.TREE) return tiles.tree;
  if (t === T.HOUSE) return tiles.path; // footprint under building sprite
  return null;
}

function buildingSprite(tiles, b) {
  if (b.kind === "shop") return tiles.shopBuilding || null;
  const keys = HOUSE_VARIANTS;
  return tiles[keys[b.variant % keys.length]] || tiles.houseCottage || null;
}

/** Draw trainer as large-face torso bust. Side art faces RIGHT; flip for left. */
export function drawTrainer(ctx, tiles, gender, facing, frame, bob, dx, dy, dw, dh) {
  const bounce = (frame === 0 || frame === 2 ? 0 : 1) * dh * 0.04 + bob * dh;

  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  const foot = (frame % 2 === 0 ? -1 : 1) * dw * 0.04;
  ctx.beginPath();
  ctx.ellipse(dx + dw / 2 + foot, dy + dh * 0.92, dw * 0.3, dh * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const walkKey = gender === "female" ? "femaleWalk" : "maleWalk";
  const sheet = tiles[walkKey];

  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh * 0.96 + bounce);

  if (sheet) {
    // Sheet rows: down, left, right, up — already direction-correct, no mirror
    const cols = 4;
    const rows = 4;
    const fw = sheet.width / cols;
    const fh = sheet.height / rows;
    const row = FACE_ROW[facing] ?? 0;
    const col = ((frame % cols) + cols) % cols;
    ctx.drawImage(sheet, col * fw, row * fh, fw, fh, -dw / 2, -dh, dw, dh);
    ctx.restore();
    return;
  }

  const down = gender === "female"
    ? (tiles.femaleDown || tiles.femaleOw)
    : (tiles.maleDown || tiles.maleOw);
  const side = gender === "female"
    ? (tiles.femaleSide || tiles.femaleOw)
    : (tiles.maleSide || tiles.maleOw);
  const up = gender === "female"
    ? (tiles.femaleUp || tiles.femaleBack || tiles.femaleOw)
    : (tiles.maleUp || tiles.maleBack || tiles.maleOw);

  let img = down;
  if (facing === "up") img = up;
  else if (facing === "left" || facing === "right") img = side;

  // Side still faces RIGHT — mirror only when walking left
  if (facing === "left") ctx.scale(-1, 1);

  if (img) {
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    ctx.fillStyle = gender === "female" ? "#e090c0" : "#5080d0";
    ctx.beginPath();
    ctx.arc(0, -dh * 0.45, dw * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw one walk-sheet frame. Sheet is 4 cols x 4 rows. */
export function drawWalkSprite(ctx, sheet, facing, frame, dx, dy, dw, dh) {
  if (!sheet) return false;
  const cols = 4;
  const rows = 4;
  const fw = sheet.width / cols;
  const fh = sheet.height / rows;
  const row = FACE_ROW[facing] ?? 0;
  const col = ((frame % cols) + cols) % cols;
  ctx.drawImage(sheet, col * fw, row * fh, fw, fh, dx, dy, dw, dh);
  return true;
}

/** @deprecated use drawTrainer */
export function drawFallbackSprite(ctx, img, facing, frame, bob, dx, dy, dw, dh) {
  drawTrainer(ctx, { maleOw: img, femaleOw: img, maleBack: img, femaleBack: img }, "male", facing, frame, bob, dx, dy, dw, dh);
}

export function drawOverworld(ctx, {
  map, tiles, player, gender, vw, vh, now, camSmooth,
  buildings = [], npcs = [], bubbleNpc = null, ballPickups = [], fieldLoot = null, wilds = [],
}) {
  const loot = fieldLoot || ballPickups;
  const target = cameraFor(player, vw, vh);
  if (!camSmooth.ready) {
    camSmooth.x = target.camX;
    camSmooth.y = target.camY;
    camSmooth.ready = true;
  } else {
    const k = reducedMotionFactor();
    camSmooth.x += (target.camX - camSmooth.x) * k;
    camSmooth.y += (target.camY - camSmooth.y) * k;
  }
  const { scale, tw } = target;
  const camX = camSmooth.x;
  const camY = camSmooth.y;

  ctx.clearRect(0, 0, vw, vh);
  // Sky wash
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, "#7eb8e8");
  sky.addColorStop(0.35, "#a8d090");
  sky.addColorStop(1, "#4a7a38");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh);

  const x0 = Math.max(0, Math.floor(camX / tw) - 1);
  const y0 = Math.max(0, Math.floor(camY / tw) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((camX + vw) / tw) + 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((camY + vh) / tw) + 1);

  // Ground layer
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = map[y][x];
      const dx = x * tw - camX;
      const dy = y * tw - camY;
      const img = tileImg(tiles, t);
      if (img) ctx.drawImage(img, dx, dy, tw + 0.6, tw + 0.6);
      else {
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(dx, dy, tw + 0.6, tw + 0.6);
      }
      if (t === T.FLOWERS) {
        const seed = hash(x, y);
        ctx.fillStyle = seed % 3 === 0 ? "#f0a0c0" : seed % 3 === 1 ? "#f0e060" : "#e878c8";
        const fx = dx + ((seed % 7) + 2) * (tw / 12);
        const fy = dy + (((seed >> 3) % 7) + 2) * (tw / 12);
        ctx.beginPath();
        ctx.arc(fx, fy, tw * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      if (t === T.WATER) {
        const wave = Math.sin(now / 400 + x * 0.4 + y * 0.3) * tw * 0.03;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(dx + tw * 0.15, dy + tw * 0.35 + wave, tw * 0.4, tw * 0.06);
      }
      if (t === T.TALL) {
        const sway = Math.sin(now / 350 + x + y) * tw * 0.04;
        ctx.fillStyle = "rgba(40,100,30,0.35)";
        ctx.fillRect(dx + tw * 0.2 + sway, dy + tw * 0.15, tw * 0.12, tw * 0.7);
        ctx.fillRect(dx + tw * 0.55 - sway, dy + tw * 0.2, tw * 0.12, tw * 0.65);
      }
      if (t === T.BRIDGE) {
        ctx.fillStyle = "rgba(90,50,20,0.55)";
        ctx.fillRect(dx + tw * 0.08, dy + tw * 0.2, tw * 0.84, tw * 0.6);
        ctx.strokeStyle = "rgba(40,20,8,0.45)";
        ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(dx + tw * 0.1, dy + tw * (0.25 + i * 0.12));
          ctx.lineTo(dx + tw * 0.9, dy + tw * (0.25 + i * 0.12));
          ctx.stroke();
        }
      }
      if (t === T.SHOP) {
        // Door mat marker under shop sprite
        ctx.fillStyle = "rgba(200,140,40,0.55)";
        ctx.fillRect(dx + tw * 0.2, dy + tw * 0.55, tw * 0.6, tw * 0.35);
        ctx.fillStyle = "#fff8e0";
        ctx.font = `800 ${Math.max(9, tw * 0.22)}px "Outfit","Noto Sans KR",sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("店", dx + tw / 2, dy + tw * 0.82);
      }
    }
  }

  // Field loot (balls / coins / fireballs)
  for (const b of loot) {
    if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
    drawFieldLoot(ctx, tiles, b, tw, camX, camY, now);
  }

  // Building sprites (sorted by foot y)
  const visibleBuildings = buildings
    .filter((b) => b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1)
    .slice()
    .sort((a, b) => (a.y + a.h) - (b.y + b.h));

  for (const b of visibleBuildings) {
    const dx = b.x * tw - camX - tw * 0.08;
    // Sit building on footprint; slight roof overhang upward only
    const dy = b.y * tw - camY - tw * 0.55;
    const dw = b.w * tw + tw * 0.16;
    const dh = b.h * tw + tw * 0.55;
    const img = buildingSprite(tiles, b);
    if (img) {
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      // Fallback painted house
      ctx.fillStyle = b.kind === "shop" ? "#e8b040" : "#d8b090";
      ctx.fillRect(dx + dw * 0.08, dy + dh * 0.38, dw * 0.84, dh * 0.55);
      ctx.fillStyle = b.kind === "shop" ? "#c04030" : "#8a3030";
      ctx.beginPath();
      ctx.moveTo(dx + dw * 0.04, dy + dh * 0.42);
      ctx.lineTo(dx + dw * 0.5, dy + dh * 0.08);
      ctx.lineTo(dx + dw * 0.96, dy + dh * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5a3a20";
      ctx.fillRect(dx + dw * 0.38, dy + dh * 0.62, dw * 0.24, dh * 0.28);
      if (b.kind === "shop") {
        ctx.fillStyle = "#fff";
        ctx.font = `800 ${Math.max(12, tw * 0.35)}px "Outfit",sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("店", dx + dw / 2, dy + dh * 0.55);
      }
    }
  }

  // Trees + NPCs + wilds + player (y-sort)
  const sprites = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (map[y][x] === T.TREE) sprites.push({ kind: "tree", x, y });
    }
  }
  for (const n of npcs) {
    if (n.x >= x0 - 1 && n.x <= x1 + 1 && n.y >= y0 - 1 && n.y <= y1 + 1) {
      sprites.push({ kind: "npc", x: n.x, y: n.y, npc: n });
    }
  }
  for (const w of wilds) {
    if (w.x >= x0 - 1 && w.x <= x1 + 1 && w.y >= y0 - 1 && w.y <= y1 + 1) {
      sprites.push({ kind: "wild", x: w.x, y: w.y, wild: w });
    }
  }
  sprites.push({ kind: "player", x: player.x, y: player.y });
  sprites.sort((a, b) => a.y - b.y);

  for (const s of sprites) {
    if (s.kind === "tree") {
      const dx = s.x * tw - camX;
      const dy = s.y * tw - camY;
      const img = tiles.tree;
      if (img) ctx.drawImage(img, dx - tw * 0.15, dy - tw * 0.55, tw * 1.3, tw * 1.55);
      else {
        ctx.fillStyle = "#2a5a20";
        ctx.fillRect(dx + tw * 0.35, dy + tw * 0.5, tw * 0.3, tw * 0.5);
        ctx.fillStyle = "#3d8a30";
        ctx.beginPath();
        ctx.arc(dx + tw / 2, dy + tw * 0.35, tw * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (s.kind === "npc") {
      drawNpc(ctx, tiles, s.npc, tw, camX, camY, now);
    } else if (s.kind === "wild") {
      drawWildMon(ctx, tiles, s.wild, tw, camX, camY, now);
    } else {
      // Torso bust — wider + shorter so face reads large
      const dx = s.x * tw - camX - tw * 0.22;
      const dy = s.y * tw - camY - tw * 0.72 - player.bob * tw;
      const dw = tw * 1.45;
      const dh = tw * 1.28;
      drawTrainer(ctx, tiles, gender, player.facing, player.walkFrame, player.bob, dx, dy, dw, dh);
    }
  }

  // Soft vignette for depth (under speech bubble)
  const vig = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.25, vw / 2, vh / 2, vw * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(10,30,8,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, vw, vh);

  // Speech bubble above active NPC (drawn last for readability)
  if (bubbleNpc) {
    drawSpeechBubble(ctx, bubbleNpc, tw, camX, camY, now);
  }
}

function drawFieldLoot(ctx, tiles, item, tw, camX, camY, now) {
  if (item.kind === "ball") {
    drawBallPickup(ctx, tiles, item, tw, camX, camY, now);
    return;
  }
  const bob = Math.sin(now / 280 + item.x * 0.7 + item.y) * tw * 0.06;
  const cx = item.x * tw - camX + tw * 0.5;
  const cy = item.y * tw - camY + tw * 0.42 + bob;
  const r = tw * (item.kind === "coin" ? 0.26 : 0.3);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, item.y * tw - camY + tw * 0.78, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  const img = item.kind === "coin" ? tiles.coin : tiles.fireball;
  if (img) {
    const s = r * 2.4;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
    ctx.imageSmoothingEnabled = true;
  } else if (item.kind === "coin") {
    ctx.fillStyle = "#f0c030";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a07010";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#fff0a0");
    g.addColorStop(0.45, "#ff9020");
    g.addColorStop(1, "#c02010");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (item.kind === "coin" && item.amount) {
    ctx.font = `800 ${Math.max(9, tw * 0.18)}px "Outfit",sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.fillStyle = "#ffe080";
    ctx.strokeText(`${item.amount}`, cx, cy + r + tw * 0.2);
    ctx.fillText(`${item.amount}`, cx, cy + r + tw * 0.2);
  }
}

function drawBallPickup(ctx, tiles, ball, tw, camX, camY, now) {
  const bob = Math.sin(now / 280 + ball.x * 0.7 + ball.y) * tw * 0.06;
  const cx = ball.x * tw - camX + tw * 0.5;
  const cy = ball.y * tw - camY + tw * 0.42 + bob;
  const r = tw * 0.28;
  // soft shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, ball.y * tw - camY + tw * 0.78, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = tiles.pokeball;
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.fillStyle = "#e04040";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI);
    ctx.fillStyle = "#f5f5f5";
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (ball.n > 1) {
    ctx.font = `800 ${Math.max(10, tw * 0.2)}px "Outfit",sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.fillStyle = "#ffe080";
    ctx.strokeText(`×${ball.n}`, cx, cy + r + tw * 0.22);
    ctx.fillText(`×${ball.n}`, cx, cy + r + tw * 0.22);
  }
}

function drawWildMon(ctx, tiles, wild, tw, camX, camY, now) {
  const bob = Math.sin(now / 320 + wild.id) * tw * 0.05 + (wild.bob || 0) * tw;
  const size = tw * 1.45;
  const dx = wild.x * tw - camX + (tw - size) * 0.5;
  const dy = wild.y * tw - camY - tw * 0.45 + bob;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(dx + size / 2, dy + size * 0.9, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = wild.sprite || tiles[`wild_${wild.speciesId}`];
  if (img) {
    ctx.drawImage(img, dx, dy, size, size);
  } else {
    ctx.fillStyle = "#f0e080";
    ctx.beginPath();
    ctx.arc(dx + size / 2, dy + size / 2, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNpc(ctx, tiles, npc, tw, camX, camY, now) {
  // Full-body pixel shopkeep — feet on tile, whole sprite visible
  const dw = tw * 1.2;
  const dh = tw * 1.65;
  const bob = Math.sin(now / 420) * tw * 0.03;
  const dx = npc.x * tw - camX + (tw - dw) * 0.5;
  const dy = npc.y * tw - camY - tw * 0.95 + bob;
  const img = tiles.shopkeep;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(dx + dw / 2, dy + dh * 0.94, dw * 0.28, dh * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = "#c08040";
    ctx.beginPath();
    ctx.arc(dx + dw / 2, dy + dh * 0.28, dw * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a7a40";
    ctx.fillRect(dx + dw * 0.28, dy + dh * 0.38, dw * 0.44, dh * 0.42);
  }
  ctx.font = `800 ${Math.max(10, tw * 0.2)}px "Outfit","Noto Sans KR",sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(20,40,10,0.55)";
  ctx.fillStyle = "#fff8d0";
  const label = "상점 아저씨";
  ctx.strokeText(label, dx + dw / 2, dy + 2);
  ctx.fillText(label, dx + dw / 2, dy + 2);
}

function drawSpeechBubble(ctx, bubbleNpc, tw, camX, camY, now) {
  const npc = bubbleNpc;
  const line = npc.lines[(Math.floor(now / 2800) % npc.lines.length)];
  const cx = npc.x * tw - camX + tw * 0.5;
  const cy = npc.y * tw - camY - tw * 0.95;
  ctx.save();
  ctx.font = `700 ${Math.max(11, tw * 0.22)}px "Noto Sans KR","Outfit",sans-serif`;
  const padX = 12;
  const padY = 8;
  const textW = Math.min(tw * 4.2, ctx.measureText(line).width);
  const bw = textW + padX * 2;
  const bh = Math.max(28, tw * 0.55);
  const bx = cx - bw / 2;
  const by = cy - bh - 8;
  // bubble
  ctx.fillStyle = "rgba(255,252,245,0.96)";
  ctx.strokeStyle = "rgba(60,40,20,0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(cx - 8, by + bh - 1);
  ctx.lineTo(cx, by + bh + 10);
  ctx.lineTo(cx + 8, by + bh - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a2010";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line, cx, by + bh / 2 + 1, bw - padX);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Nearest shop NPC within talk range, or null. */
export function nearbyShopNpc(npcs, tx, ty, range = NPC_TALK_RANGE) {
  let best = null;
  let bestD = Infinity;
  for (const n of npcs || []) {
    if (n.kind !== "shopkeep") continue;
    const d = Math.max(Math.abs(n.x - tx), Math.abs(n.y - ty));
    if (d <= range && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

function reducedMotionFactor() {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return 1;
  } catch { /* ignore */ }
  return 0.18;
}

export function heldDirection(keys, holdDir) {
  if (holdDir === "up" || keys.has("ArrowUp") || keys.has("w") || keys.has("W")) return [0, -1];
  if (holdDir === "down" || keys.has("ArrowDown") || keys.has("s") || keys.has("S")) return [0, 1];
  if (holdDir === "left" || keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) return [-1, 0];
  if (holdDir === "right" || keys.has("ArrowRight") || keys.has("d") || keys.has("D")) return [1, 0];
  return null;
}
