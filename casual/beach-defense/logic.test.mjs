// casual/beach-defense/logic.test.mjs
import assert from "node:assert/strict";
import {
  canPlace,
  screenToIso,
  isoToScreen,
  moveAlongPath,
  upgradeCost,
  upgradeCosts,
  scaledStat,
  terrainAt,
  findPath,
  productionPayout,
  resolveTroopPath,
  pathLength,
  waveSpec,
  ENEMIES,
  T,
  MAP,
  BUILDINGS,
} from "./logic.js";

assert.equal(canPlace(5, 1, new Set(), MAP.cols, MAP.rows), true);
assert.equal(canPlace(5, 1, new Set(["5,1"]), MAP.cols, MAP.rows), false);
assert.equal(canPlace(-1, 0, new Set(), MAP.cols, MAP.rows), false);
assert.equal(terrainAt(3, 0), T.FOREST);
assert.equal(canPlace(3, 0, new Set(), MAP.cols, MAP.rows), false);
assert.equal(terrainAt(6, 13), T.BEACH);
assert.equal(canPlace(6, 13, new Set(), MAP.cols, MAP.rows), false);
assert.equal(canPlace(MAP.hq[0], MAP.hq[1], new Set(), MAP.cols, MAP.rows), false);

// Boom Beach framing: bottom-left beach, inland grass, open L/C/R approaches
{
  let water = 0;
  let land = 0;
  let beach = 0;
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      const t = terrainAt(c, r);
      if (t === T.WATER) water++;
      else land++;
      if (t === T.BEACH) beach++;
    }
  }
  assert.ok(land > water, `land=${land} water=${water}`);
  assert.ok(beach >= 20, `beach=${beach}`);
  assert.ok(MAP.cols >= 16 && MAP.rows >= 16);
  assert.ok(MAP.pier && MAP.pier.length >= 3, "stone pier on the right");
  // Attackers can approach from left / center / right of the shore
  const left = MAP.landing.find(([c]) => c <= 5);
  const mid = MAP.landing.find(([c]) => c >= 7 && c <= 9);
  const right = MAP.landing.find(([c]) => c >= 10);
  assert.ok(left && findPath(left, MAP.hq, new Set()), `left ${left}`);
  assert.ok(mid && findPath(mid, MAP.hq, new Set()), `mid ${mid}`);
  assert.ok(right && findPath(right, MAP.hq, new Set()), `right ${right}`);
  // HQ sits inland (smaller row) vs beach landings (larger row) → beach toward bottom
  assert.ok(MAP.hq[1] < MAP.landing[0][1]);
}

const p = isoToScreen(3, 4, 100, 50);
const back = screenToIso(p.x, p.y, 100, 50);
assert.equal(back.col, 3);
assert.equal(back.row, 4);

const CELL_TEST = 64;
for (const [col, row] of [[3, 4], [0, 0], [5, 2]]) {
  const center = isoToScreen(col, row, 100, 50, CELL_TEST);
  for (const [ndx, ndy] of [[CELL_TEST * 0.2, 0], [-CELL_TEST * 0.2, 0], [0, CELL_TEST * 0.1]]) {
    const hit = screenToIso(center.x + ndx, center.y + ndy, 100, 50, CELL_TEST);
    assert.equal(hit.col, col);
    assert.equal(hit.row, row);
  }
}

const mid = moveAlongPath(0, [[0, 0], [2, 0]]);
assert.equal(mid.done, false);
assert.equal(moveAlongPath(999, [[0, 0], [2, 0]]).done, true);

assert.equal(upgradeCost(80), 60);
assert.deepEqual(upgradeCosts(80), { gold: 60, wood: 16 });
assert.equal(scaledStat(10, 1), 13.5);

// A*: empty island path from beach to HQ
const path = findPath(MAP.landing[0], MAP.hq, new Set());
assert.ok(path && path.length >= 2);
assert.deepEqual(path[0], MAP.landing[0]);
assert.deepEqual(path[path.length - 1], MAP.hq);

// Blocked cell forces detour or still reaches HQ
const blocked = new Set(["5,3", "6,3", "4,3"]);
const path2 = findPath(MAP.landing[1], MAP.hq, blocked);
assert.ok(path2 && path2.length >= 2);
assert.ok(!path2.some(([c, r]) => blocked.has(`${c},${r}`)));

const pay = productionPayout([
  { kind: "residence", level: 0 },
  { kind: "sawmill", level: 1 },
]);
assert.equal(pay.gold, 25 + Math.floor(5 * 1.5));
assert.equal(pay.wood, Math.floor(15 * 1.5));

assert.equal(BUILDINGS.mg.role, "defense");
assert.equal(BUILDINGS.residence.role, "production");
assert.ok(BUILDINGS.mg.hp > 0);
assert.ok(ENEMIES.rifle.attack > 0);

const w0 = waveSpec(0);
assert.equal(w0.kind, "rifle");
assert.equal(w0.count, 5);

// Mid-island seal cuts HQ path; troops must assault wall buildings
const wallBuildings = [];
const wallBlocked = new Set();
for (let r = 0; r < MAP.rows; r++) {
  for (let c = 0; c < MAP.cols; c++) {
    const s = c + r;
    if (s < 12 || s > 15) continue;
    const t = terrainAt(c, r);
    if (t !== T.GRASS && t !== T.BEACH) continue;
    wallBuildings.push({ id: wallBuildings.length + 1, col: c, row: r });
    wallBlocked.add(`${c},${r}`);
  }
}
assert.equal(findPath(MAP.landing[0], MAP.hq, wallBlocked), null);

const assault = resolveTroopPath(MAP.landing[0], MAP.hq, wallBuildings, wallBlocked);
assert.equal(assault.mode, "assault");
assert.ok(assault.targetId != null);
assert.ok(assault.waypoints.length >= 2);
const assaulted = wallBuildings.find((b) => b.id === assault.targetId);
assert.deepEqual(assault.waypoints[assault.waypoints.length - 1], [assaulted.col, assaulted.row]);

const open = resolveTroopPath(MAP.landing[0], MAP.hq, wallBuildings, new Set());
assert.equal(open.mode, "hq");
assert.equal(open.targetId, null);
assert.ok(pathLength(open.waypoints) > 0);

const fullBlock = new Set();
for (let r = 0; r < MAP.rows; r++) {
  for (let c = 0; c < MAP.cols; c++) {
    if (terrainAt(c, r) === T.GRASS && !(c === MAP.hq[0] && r === MAP.hq[1])) {
      fullBlock.add(`${c},${r}`);
    }
  }
}
const stuck = resolveTroopPath(MAP.landing[0], MAP.hq, [], fullBlock);
assert.equal(stuck.mode, "stuck");

console.log("logic.test.mjs OK");
