const assert = require("assert");
const C = require("./combat.js");

function rngSeq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

{
  const w = C.createWorld({ gold: 200, spawnTimer: 999 });
  const a = C.trySpawnAlly(w, 0);
  assert.ok(a.ok);
  assert.equal(w.gold, 150);
  const deny = C.trySpawnAlly(w, 0);
  assert.equal(deny.reason, "cooldown");
}

{
  const w = C.createWorld({ gold: 10, spawnTimer: 999 });
  assert.equal(C.trySpawnAlly(w, 3).reason, "gold");
}

{
  const w = C.createWorld({ gold: 500, spawnTimer: 999 });
  const you = C.spawnFromDef(w, C.ALLIES[2], 1, 400);
  const foe = C.spawnFromDef(w, C.ENEMIES[0], -1, 430);
  you.atkCd = 0;
  const hp = foe.hp;
  C.tick(w, 0.05, () => 0);
  assert.ok(foe.hp < hp || !w.units.includes(foe), "melee should deal damage");
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 999, income: 0 });
  const pika = C.spawnFromDef(w, C.ALLIES[3], 1, 300);
  const foe = C.spawnFromDef(w, C.ENEMIES[0], -1, 410);
  pika.atkCd = 0;
  C.tick(w, 0.05, () => 0);
  assert.ok(foe.hp < foe.maxHp, "ranged pikachu should hit at ~110px");
  assert.ok(Math.abs(pika.x - 300) < 2, "ranged unit should stand still while firing");
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 999, income: 0 });
  const you = C.spawnFromDef(w, C.ALLIES[2], 1, 880);
  you.atk = 800;
  you.range = 80;
  you.atkCd = 0;
  for (let i = 0; i < 40; i++) C.tick(w, 0.2, () => 0);
  assert.equal(w.result, "win");
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 999, income: 0 });
  const foe = C.spawnFromDef(w, C.BOSS, -1, 120);
  foe.atk = 800;
  foe.range = 90;
  foe.atkCd = 0;
  for (let i = 0; i < 40; i++) C.tick(w, 0.2, () => 0);
  assert.equal(w.result, "lose");
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 0.01, income: 0 });
  C.tick(w, 0.05, rngSeq([0]));
  assert.ok(w.units.some((u) => u.side === -1), "enemy wave should spawn");
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 9, income: 0 });
  w.elapsed = 71.9;
  C.tick(w, 0.2, () => 0);
  assert.ok(w.bossSpawned);
  assert.ok(w.units.some((u) => u.boss));
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 999, income: 20 });
  C.tick(w, 1, () => 0);
  assert.ok(w.gold >= 20);
}

{
  const w = C.createWorld({ gold: 0, spawnTimer: 999, income: 0 });
  const foe = C.spawnFromDef(w, C.ENEMIES[0], -1, 400);
  foe.hp = 1;
  const you = C.spawnFromDef(w, C.ALLIES[2], 1, 380);
  you.atkCd = 0;
  you.atk = 20;
  C.tick(w, 0.05, () => 0);
  assert.ok(w.gold >= foe.reward);
}

console.log("verify-combat: ok");
