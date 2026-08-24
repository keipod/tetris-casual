export const CELL = 64;

/** Terrain: water / beach (landing only) / grass (buildable) / forest (blocked). */
export const T = {
  WATER: 0,
  BEACH: 1,
  GRASS: 2,
  FOREST: 3,
};

/**
 * Boom Beach attack/scout framing (matches real game camera):
 * - Large diagonal beach in the BOTTOM-LEFT (~attacker approach)
 * - Open grass inland toward center / top-right
 * - Forest along the rear; stone pier into water on the RIGHT
 * - Flanks stay open so attackers are not forced into one choke
 */
export const TERRAIN = [
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0],
  [3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 0, 0],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 0],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 0],
  [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0],
  [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 2, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

export const MAP = {
  cols: 16,
  rows: 16,
  startGold: 200,
  startWood: 0,
  startHp: 100,
  waves: 8,
  hq: [9, 3],
  landing: [[6,13],[7,13],[5,12],[6,12],[7,12],[8,12],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[3,10],[4,10],[5,10],[6,10],[8,10],[9,10],[10,10],[2,9],[3,9],[4,9],[9,9],[10,9],[1,8],[2,8],[3,8],[10,8],[0,7],[1,7],[2,7],[0,6],[1,6]],
  trees: [[0,0,0],[1,0,1],[2,0,2],[3,0,0],[4,0,1],[5,0,2],[6,0,0],[7,0,1],[8,0,2],[9,0,0],[10,0,1],[11,0,2],[12,0,0],[13,0,1],[0,1,1],[1,1,0],[12,1,2],[13,1,1],[0,2,2],[0,3,0],[0,4,1]],
  boats: [[2,12],[4,13],[5,12],[7,13],[3,11]],
  pier: [[14, 4], [14, 5], [13, 5], [13, 6], [12, 6]],
};

/** Axis-aligned land bounds (non-water), used to frame the camera on the base. */
export function landBounds(grid = TERRAIN) {
  let minC = grid[0].length;
  let maxC = -1;
  let minR = grid.length;
  let maxR = -1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === T.WATER) continue;
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
  }
  if (maxC < 0) {
    return { minC: 0, maxC: MAP.cols - 1, minR: 0, maxR: MAP.rows - 1 };
  }
  return { minC, maxC, minR, maxR };
}

/** Building catalog — defenses auto-fire; production pays out between attacks. */
export const BUILDINGS = {
  mg: {
    role: "defense",
    name: "기관총",
    cost: { gold: 50 },
    hp: 90,
    range: 2.6,
    cooldown: 0.28,
    damage: 6,
    splash: 0,
    projectile: "bullet",
    speed: 14,
  },
  cannon: {
    role: "defense",
    name: "대포",
    cost: { gold: 80 },
    hp: 130,
    range: 3.0,
    cooldown: 1.1,
    damage: 32,
    splash: 0.3,
    projectile: "shell",
    speed: 9,
  },
  mortar: {
    role: "defense",
    name: "박격포",
    cost: { gold: 100 },
    hp: 100,
    range: 3.4,
    cooldown: 1.6,
    damage: 18,
    splash: 1.2,
    projectile: "arc",
    speed: 6,
  },
  residence: {
    role: "production",
    name: "주둔지",
    cost: { gold: 60 },
    hp: 75,
    income: { gold: 25 },
  },
  sawmill: {
    role: "production",
    name: "제재소",
    cost: { gold: 70 },
    hp: 75,
    income: { wood: 15, gold: 5 },
  },
};

/** NPC troop types for landing raids. */
export const ENEMIES = {
  rifle: { name: "보병", hp: 40, speed: 1.35, gold: 8, leak: 8, attack: 10, attackCd: 0.65 },
  brute: { name: "돌격병", hp: 28, speed: 1.9, gold: 7, leak: 8, attack: 7, attackCd: 0.4 },
  tank: { name: "탱크", hp: 140, speed: 0.85, gold: 18, leak: 15, attack: 28, attackCd: 1.05 },
};

/** Wave composition for defend-mode raid index `i` (0-based). */
export function waveSpec(i) {
  const count = 5 + i * 2;
  const kind = i % 4 === 3 ? "tank" : i % 3 === 2 ? "brute" : "rifle";
  return {
    count,
    kind,
    hpMul: 1 + i * 0.22,
    speedMul: 1 + i * 0.04,
    goldMul: 1 + Math.floor(i / 3) * 0.1,
  };
}

export function terrainAt(col, row, grid = TERRAIN) {
  if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) return T.WATER;
  return grid[row][col];
}

export function isoToScreen(col, row, originX, originY, cell = CELL) {
  return {
    x: originX + (col - row) * (cell / 2),
    y: originY + (col + row) * (cell / 4),
  };
}

export function screenToIso(x, y, originX, originY, cell = CELL) {
  const dx = x - originX;
  const dy = y - originY;
  const col = Math.round(dx / (cell / 2) / 2 + dy / (cell / 4) / 2) + 0;
  const row = Math.round(dy / (cell / 4) / 2 - dx / (cell / 2) / 2) + 0;
  return { col, row };
}

/** Walkable for NPC troops: beach + grass, not water/forest, not occupied (except goal). */
export function isWalkable(col, row, blocked, cols, rows, goalKey = null) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  const key = `${col},${row}`;
  const t = terrainAt(col, row);
  if (t !== T.BEACH && t !== T.GRASS) return false;
  if (blocked.has(key) && key !== goalKey) return false;
  return true;
}

/**
 * Place defenses/production on grass only (not beach/water/forest/HQ/occupied).
 */
export function canPlace(col, row, occupied, cols, rows, hq = MAP.hq) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  const key = `${col},${row}`;
  if (`${hq[0]},${hq[1]}` === key) return false;
  if (occupied.has(key)) return false;
  return terrainAt(col, row) === T.GRASS;
}

/**
 * A* from start to goal on beach+grass, avoiding blocked building cells.
 * Returns waypoint list [[c,r], ...] including start and goal, or null.
 */
export function findPath(start, goal, blocked, cols = MAP.cols, rows = MAP.rows) {
  const [sc, sr] = start;
  const [gc, gr] = goal;
  const goalKey = `${gc},${gr}`;
  const startKey = `${sc},${sr}`;
  if (!isWalkable(gc, gr, new Set(), cols, rows, goalKey)
    && terrainAt(gc, gr) !== T.GRASS
    && terrainAt(gc, gr) !== T.BEACH) {
    // HQ sits on grass; allow goal even if listed in blocked
  }
  const open = [{ c: sc, r: sr, g: 0, f: Math.abs(gc - sc) + Math.abs(gr - sr), parent: null }];
  const openMap = new Map([[startKey, open[0]]]);
  const closed = new Set();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    const ck = `${cur.c},${cur.r}`;
    openMap.delete(ck);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.c === gc && cur.r === gr) {
      const path = [];
      let n = cur;
      while (n) {
        path.push([n.c, n.r]);
        n = n.parent;
      }
      path.reverse();
      return path;
    }
    for (const [dc, dr] of dirs) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      const nk = `${nc},${nr}`;
      if (closed.has(nk)) continue;
      // Diagonal: both orthogonal neighbors must be walkable (no corner cut)
      if (dc !== 0 && dr !== 0) {
        if (!isWalkable(cur.c + dc, cur.r, blocked, cols, rows, goalKey)) continue;
        if (!isWalkable(cur.c, cur.r + dr, blocked, cols, rows, goalKey)) continue;
      }
      if (!isWalkable(nc, nr, blocked, cols, rows, goalKey) && nk !== goalKey) continue;
      const step = dc !== 0 && dr !== 0 ? 1.414 : 1;
      const g = cur.g + step;
      const h = Math.abs(gc - nc) + Math.abs(gr - nr);
      const f = g + h;
      const prev = openMap.get(nk);
      if (prev && prev.g <= g) continue;
      const node = { c: nc, r: nr, g, f, parent: cur };
      openMap.set(nk, node);
      open.push(node);
    }
  }
  return null;
}

export function moveAlongPath(dist, waypoints) {
  if (!waypoints.length) return { x: 0, y: 0, done: true };
  let left = dist;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [c0, r0] = waypoints[i];
    const [c1, r1] = waypoints[i + 1];
    const len = Math.hypot(c1 - c0, r1 - r0) || 1e-6;
    if (left <= len) {
      const t = left / len;
      return { x: c0 + (c1 - c0) * t, y: r0 + (r1 - r0) * t, done: false };
    }
    left -= len;
  }
  const [lc, lr] = waypoints[waypoints.length - 1];
  return { x: lc, y: lr, done: true };
}

/** Gold-only upgrade price (legacy helper). */
export function upgradeCost(baseGold, mult = 0.75) {
  return upgradeCosts(baseGold, mult).gold;
}

/** Upgrade costs — wood sink so sawmill income matters. */
export function upgradeCosts(baseGold, mult = 0.75) {
  return {
    gold: Math.floor(baseGold * mult),
    wood: Math.max(5, Math.floor(baseGold * 0.2)),
  };
}

export function scaledStat(base, level, factor = 1.35) {
  return level <= 0 ? base : base * factor;
}

export function pathLength(waypoints) {
  if (!waypoints || waypoints.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [c0, r0] = waypoints[i];
    const [c1, r1] = waypoints[i + 1];
    len += Math.hypot(c1 - c0, r1 - r0);
  }
  return len;
}

/**
 * Route NPC troops: prefer HQ; if walled off, assault the nearest reachable building.
 * Never invent a teleport path through blocked cells.
 */
export function resolveTroopPath(start, hq, buildings, blocked, cols = MAP.cols, rows = MAP.rows) {
  const toHq = findPath(start, hq, blocked, cols, rows);
  if (toHq) {
    return { waypoints: toHq, mode: "hq", targetId: null };
  }
  let best = null;
  for (const b of buildings) {
    const path = findPath(start, [b.col, b.row], blocked, cols, rows);
    if (!path) continue;
    const len = pathLength(path);
    if (!best || len < best.len) best = { path, building: b, len };
  }
  if (best) {
    return { waypoints: best.path, mode: "assault", targetId: best.building.id };
  }
  return { waypoints: [start], mode: "stuck", targetId: null };
}

/** Sum production income for all production buildings (per cleared attack). */
export function productionPayout(buildings, catalog = BUILDINGS) {
  const out = { gold: 0, wood: 0 };
  for (const b of buildings) {
    const def = catalog[b.kind];
    if (!def || def.role !== "production") continue;
    const mul = b.level >= 1 ? 1.5 : 1;
    if (def.income.gold) out.gold += Math.floor(def.income.gold * mul);
    if (def.income.wood) out.wood += Math.floor(def.income.wood * mul);
  }
  return out;
}

/** Pick a random landing cell. */
export function pickLanding(rng = Math.random) {
  const list = MAP.landing;
  return list[Math.floor(rng() * list.length)] || list[0];
}
