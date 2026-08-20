(function (root, factory) {
  const api = factory();
  root.LanesCombat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WORLD_W = 1000;
  const MAX_UNITS = 40;
  const PLAYER_BASE_X = 48;
  const ENEMY_BASE_X = 952;
  const BASE_W = 96;
  const SPAWN_YOU = 118;
  const SPAWN_ENEMY = 882;

  const ALLIES = [
    { key: "pidgey", id: 16, name: "구구", cost: 50, cd: 1.15, hp: 42, atk: 7, range: 10, speed: 62, atkInterval: 0.72, w: 46, h: 46, reward: 0, role: "잡몹" },
    { key: "bulbasaur", id: 1, name: "이상해씨", cost: 90, cd: 2.4, hp: 190, atk: 11, range: 12, speed: 38, atkInterval: 0.95, w: 54, h: 54, reward: 0, role: "탱" },
    { key: "charmander", id: 4, name: "파이리", cost: 95, cd: 2.2, hp: 88, atk: 20, range: 14, speed: 52, atkInterval: 0.78, w: 50, h: 50, reward: 0, role: "딜" },
    { key: "pikachu", id: 25, name: "피카츄", cost: 140, cd: 3.6, hp: 72, atk: 16, range: 132, speed: 48, atkInterval: 0.92, w: 48, h: 48, reward: 0, role: "원거리" },
  ];

  const ENEMIES = [
    { key: "rattata", id: 19, name: "꼬렛", cost: 0, cd: 0, hp: 36, atk: 8, range: 10, speed: 58, atkInterval: 0.78, w: 44, h: 44, reward: 18, role: "잡몹" },
    { key: "zubat", id: 41, name: "주뱃", cost: 0, cd: 0, hp: 48, atk: 10, range: 12, speed: 70, atkInterval: 0.7, w: 48, h: 48, reward: 22, role: "잡몹" },
    { key: "ekans", id: 23, name: "아보", cost: 0, cd: 0, hp: 110, atk: 14, range: 16, speed: 40, atkInterval: 0.88, w: 56, h: 50, reward: 36, role: "탱" },
    { key: "machop", id: 66, name: "알통몬", cost: 0, cd: 0, hp: 95, atk: 22, range: 14, speed: 46, atkInterval: 0.82, w: 52, h: 54, reward: 44, role: "딜" },
  ];

  const BOSS = {
    key: "snorlax", id: 143, name: "잠만보", cost: 0, cd: 0,
    hp: 780, atk: 34, range: 22, speed: 22, atkInterval: 1.15,
    w: 92, h: 88, reward: 120, role: "보스", boss: true,
  };

  function cloneDef(def) {
    return Object.assign({}, def);
  }

  function createBase(side) {
    const you = side === 1;
    return {
      side,
      isBase: true,
      x: you ? PLAYER_BASE_X : ENEMY_BASE_X,
      w: BASE_W,
      h: 120,
      hp: you ? 3000 : 5200,
      maxHp: you ? 3000 : 5200,
      range: 0,
      speed: 0,
    };
  }

  function createWorld(opts) {
    const o = opts || {};
    return {
      units: [],
      nextId: 1,
      gold: o.gold != null ? o.gold : 180,
      elapsed: 0,
      income: o.income != null ? o.income : 12,
      spawnTimer: o.spawnTimer != null ? o.spawnTimer : 3.2,
      bossSpawned: false,
      slotCd: [0, 0, 0, 0],
      result: null,
      bases: {
        player: createBase(1),
        enemy: createBase(-1),
      },
    };
  }

  function surfaceDist(a, b) {
    return Math.abs(a.x - b.x) - a.w / 2 - b.w / 2;
  }

  function inFront(unit, other) {
    return (other.x - unit.x) * unit.side >= -(unit.w + other.w) * 0.55;
  }

  function findTarget(unit, world) {
    const foeBase = unit.side === 1 ? world.bases.enemy : world.bases.player;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (u.hp <= 0 || u.side === unit.side) continue;
      if (!inFront(unit, u)) continue;
      const d = surfaceDist(unit, u);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    const baseD = surfaceDist(unit, foeBase);
    if (!best) return foeBase;
    if (bestD <= unit.range) return best;
    if (baseD < bestD) return foeBase;
    return best;
  }

  function spawnFromDef(world, def, side, x) {
    if (world.units.length >= MAX_UNITS) return null;
    const unit = {
      uid: world.nextId++,
      side,
      defKey: def.key,
      pokeId: def.id,
      name: def.name,
      x: x,
      w: def.w,
      h: def.h,
      hp: def.hp,
      maxHp: def.hp,
      atk: def.atk,
      range: def.range,
      speed: def.speed,
      atkInterval: def.atkInterval,
      atkCd: 0.12,
      reward: def.reward || 0,
      boss: !!def.boss,
      isBase: false,
    };
    world.units.push(unit);
    return unit;
  }

  function trySpawnAlly(world, slotIndex) {
    const def = ALLIES[slotIndex];
    if (!def || world.result) return { ok: false, reason: "closed" };
    if (world.slotCd[slotIndex] > 0) return { ok: false, reason: "cooldown" };
    if (world.gold < def.cost) return { ok: false, reason: "gold" };
    if (world.units.length >= MAX_UNITS) return { ok: false, reason: "cap" };
    world.gold -= def.cost;
    world.slotCd[slotIndex] = def.cd;
    const unit = spawnFromDef(world, def, 1, SPAWN_YOU);
    return { ok: !!unit, unit };
  }

  function spawnInterval(elapsed) {
    return Math.max(0.95, 3.6 - elapsed * 0.014);
  }

  function pickEnemy(elapsed, rng) {
    const r = rng();
    if (elapsed < 18) return r < 0.7 ? ENEMIES[0] : ENEMIES[1];
    if (elapsed < 40) {
      if (r < 0.4) return ENEMIES[0];
      if (r < 0.75) return ENEMIES[1];
      return ENEMIES[2];
    }
    if (r < 0.22) return ENEMIES[0];
    if (r < 0.45) return ENEMIES[1];
    if (r < 0.72) return ENEMIES[2];
    return ENEMIES[3];
  }

  function maybeSpawnEnemy(world, dt, rng) {
    if (world.result) return;
    world.spawnTimer -= dt;
    if (!world.bossSpawned && world.elapsed >= 72) {
      spawnFromDef(world, BOSS, -1, SPAWN_ENEMY);
      world.bossSpawned = true;
      world.spawnTimer = 2.2;
      return;
    }
    if (world.spawnTimer > 0) return;
    world.spawnTimer = spawnInterval(world.elapsed);
    spawnFromDef(world, pickEnemy(world.elapsed, rng), -1, SPAWN_ENEMY);
  }

  function stepUnit(unit, world, dt) {
    if (unit.hp <= 0) return;
    const target = findTarget(unit, world);
    const d = surfaceDist(unit, target);
    if (d <= unit.range) {
      unit.atkCd -= dt;
      if (unit.atkCd <= 0) {
        target.hp -= unit.atk;
        unit.atkCd = unit.atkInterval;
        unit.didHit = true;
        unit.lastHitX = target.x;
        unit.lastHitY = 0;
      }
      return;
    }
    const desired = unit.x + unit.side * unit.speed * dt;
    const stopAt = target.x - unit.side * (target.w / 2 + unit.w / 2 + unit.range);
    unit.x = unit.side === 1 ? Math.min(desired, stopAt) : Math.max(desired, stopAt);
  }

  function reap(world) {
    const keep = [];
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (u.hp > 0) {
        keep.push(u);
      } else if (u.side === -1) {
        world.gold += u.reward;
      }
    }
    world.units = keep;
  }

  function tick(world, dt, rng) {
    if (world.result) return world.result;
    const roll = rng || Math.random;
    world.elapsed += dt;
    world.gold += world.income * dt;
    world.income += dt * 0.22;
    for (let s = 0; s < world.slotCd.length; s++) {
      world.slotCd[s] = Math.max(0, world.slotCd[s] - dt);
    }
    maybeSpawnEnemy(world, dt, roll);
    for (let i = 0; i < world.units.length; i++) {
      stepUnit(world.units[i], world, dt);
    }
    reap(world);
    if (world.bases.enemy.hp <= 0) {
      world.bases.enemy.hp = 0;
      world.result = "win";
    } else if (world.bases.player.hp <= 0) {
      world.bases.player.hp = 0;
      world.result = "lose";
    }
    return world.result;
  }

  return {
    WORLD_W,
    MAX_UNITS,
    ALLIES,
    ENEMIES,
    BOSS,
    cloneDef,
    createWorld,
    createBase,
    surfaceDist,
    findTarget,
    spawnFromDef,
    trySpawnAlly,
    spawnInterval,
    pickEnemy,
    tick,
    SPAWN_YOU,
    SPAWN_ENEMY,
  };
});
