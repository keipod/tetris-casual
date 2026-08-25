import {
  STARTERS, WILD_POOL, fetchSpecies, makeBattler, calcDamage, typeEffect,
  effectivenessText, catchChance, combatPower, cardEffectivePower, typeChipsHtml,
  TYPE_KO, TYPE_COLOR,
} from "./poke.js";
import {
  T, MAP_W, MAP_H, ENCOUNTER_RATE,
  PATCH_COOLDOWN_STEPS, PATCH_SOFT_COOLDOWN,
  buildMap, buildWildSpawns, createPlayerState, beginStep, updatePlayer,
  drawOverworld, heldDirection, nearbyShopNpc, updateWilds, wildAt,
  maintainWildPopulation, maintainFieldLoot,
} from "./overworld.js";
import { AudioFx } from "./audio.js";
import { runCatchScene } from "./catchscene.js";
import { runCardDuel } from "./cardscene.js";

/** Lazy-load Three.js battle — keeps overworld playable if vendor/three is missing. */
async function loadBattle3D() {
  const mod = await import("./battle3d.js");
  return mod.Battle3D;
}

const LS = "catch2_save_v1";
const LS_SOUND = "catch2_sound";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const storage = (() => {
  try {
    localStorage.setItem("__c2", "1");
    localStorage.removeItem("__c2");
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
})();

function emptySave(spawnX = Math.floor(MAP_W / 2), spawnY = Math.floor(MAP_H * 0.72)) {
  return {
    gender: null,
    party: [],
    box: [],
    balls: 10,
    fireballs: 0,
    money: 120,
    px: spawnX,
    py: spawnY,
    facing: "down",
    patchCooldown: {}, // patchId -> steps remaining
    collectedBalls: {}, // ballId -> true (legacy; dynamic loot no longer permanent)
  };
}

function loadSave() {
  try {
    const raw = JSON.parse(storage.getItem(LS) || "null");
    if (!raw || typeof raw !== "object") return emptySave();
    return {
      ...emptySave(),
      ...raw,
      party: raw.party || [],
      box: raw.box || [],
      patchCooldown: raw.patchCooldown || {},
      collectedBalls: raw.collectedBalls || {},
      money: typeof raw.money === "number" ? raw.money : 120,
      fireballs: typeof raw.fireballs === "number" ? raw.fireballs : 0,
    };
  } catch {
    return emptySave();
  }
}

function saveGame(s) {
  storage.setItem(LS, JSON.stringify(s));
}

const app = {
  save: loadSave(),
  sound: storage.getItem(LS_SOUND) !== "0",
  mode: "boot",
  map: [],
  patchId: [],
  shops: [],
  patchMeta: [],
  buildings: [],
  npcs: [],
  ballPickups: [],
  fieldLoot: [],
  wilds: [],
  wildCtrl: { nextId: 1, nextAt: 0 },
  lootCtrl: { nextId: 1, nextAt: 0 },
  activeWildId: null,
  spawnX: 0,
  spawnY: 0,
  player: null,
  cam: { x: 0, y: 0, ready: false },
  keys: new Set(),
  holdDir: null,
  battle: null,
  battle3d: null,
  wildInfo: null,
  tiles: {},
  flashEl: null,
  pendingEncounter: false,
  stepsSinceEncounter: 0,
};

const fieldCanvas = document.getElementById("field-canvas");
const fieldCtx = fieldCanvas.getContext("2d");
const battleLayer = document.getElementById("battle-layer");
const battleCanvas = document.getElementById("battle-canvas");
const battleUi = document.getElementById("battle-ui");
const battleFlash = document.getElementById("battle-flash");
const battleFx = document.getElementById("battle-fx");
const catchLayer = document.getElementById("catch-layer");
const catchCanvas = document.getElementById("catch-canvas");
const edgePad = document.getElementById("edge-pad");
const fieldToast = document.getElementById("field-toast");
const overlay = document.getElementById("overlay");
const dock = document.getElementById("dock");
const btnSound = document.getElementById("btn-sound");
const btnParty = document.getElementById("btn-party");
const btnDex = document.getElementById("btn-dex");
const btnHelp = document.getElementById("btn-help");
const btnReset = document.getElementById("btn-reset");

function vibrate(p) {
  if (!app.sound) return;
  try { navigator.vibrate?.(p); } catch { /* ignore */ }
}

function syncSoundBtn() {
  btnSound?.classList.toggle("muted", !app.sound);
  btnSound?.setAttribute("aria-pressed", app.sound ? "true" : "false");
  btnSound.textContent = app.sound ? "소리" : "음소거";
}

function syncSavePos() {
  if (!app.player) return;
  app.save.px = app.player.tx;
  app.save.py = app.player.ty;
  app.save.facing = app.player.facing;
  saveGame(app.save);
}

async function loadStaticAssets() {
  const pairs = [
    ["grass", "assets/tiles/grass.png", false],
    ["tall", "assets/tiles/tallgrass.png", false],
    ["path", "assets/tiles/path.png", false],
    ["water", "assets/tiles/water.png", false],
    ["tree", "assets/tiles/tree.png", true],
    ["houseCottage", "assets/tiles/house-cottage.png", false],
    ["houseBlue", "assets/tiles/house-blue.png", false],
    ["houseInn", "assets/tiles/house-inn.png", false],
    ["shopBuilding", "assets/tiles/shop-building.png", false],
    ["shopkeep", "assets/characters/shopkeep.png", true],
    ["pokeball", "assets/ui/pokeball.png", false],
    ["coin", "assets/ui/coin.png", true],
    ["fireball", "assets/ui/fireball.png", true],
    ["meadow", "assets/battle/meadow.png", false],
    // Photoreal-face trainers: already alpha-processed — do NOT punchBlack (destroys dark hair)
    ["maleOw", "assets/characters/male-overworld.png", false],
    ["femaleOw", "assets/characters/female-overworld.png", false],
    ["maleBack", "assets/characters/male-back.png", true],
    ["femaleBack", "assets/characters/female-back.png", true],
    ["maleWalk", "assets/characters/male-walk.png", false],
    ["femaleWalk", "assets/characters/female-walk.png", false],
    ["maleDown", "assets/characters/male-down.png", false],
    ["maleSide", "assets/characters/male-side.png", false],
    ["maleUp", "assets/characters/male-up.png", true],
    ["femaleDown", "assets/characters/female-down.png", false],
    ["femaleSide", "assets/characters/female-side.png", false],
    ["femaleUp", "assets/characters/female-up.png", true],
  ];
  await Promise.all(pairs.map(([k, src, punch]) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      if (!punch) {
        app.tiles[k] = img;
        res();
        return;
      }
      const punched = punchBlack(img);
      if (punched.complete && punched.naturalWidth) {
        app.tiles[k] = punched;
        res();
      } else {
        punched.onload = () => { app.tiles[k] = punched; res(); };
        punched.onerror = () => { app.tiles[k] = img; res(); };
      }
    };
    img.onerror = () => { app.tiles[k] = null; res(); };
    img.src = src;
  })));
}

/** Make near-black background transparent for generated sprites. */
function punchBlack(img) {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
      const lum = (r + g + b) / 3;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 22 && spread < 18) px[i + 3] = 0;
      else if (lum < 40 && spread < 24) px[i + 3] = Math.floor(px[i + 3] * 0.2);
    }
    ctx.putImageData(data, 0, 0);
    const out = new Image();
    out.src = c.toDataURL("image/png");
    return out;
  } catch {
    return img;
  }
}

function resizeField() {
  const stage = fieldCanvas.parentElement;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  fieldCanvas.width = Math.floor(w * devicePixelRatio);
  fieldCanvas.height = Math.floor(h * devicePixelRatio);
  fieldCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function drawField(now = performance.now()) {
  if (!app.player || !app.map.length) return;
  const stage = fieldCanvas.parentElement;
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const tx = Math.round(app.player.tx ?? app.player.x);
  const ty = Math.round(app.player.ty ?? app.player.y);
  const bubbleNpc = app.mode === "field" ? nearbyShopNpc(app.npcs, tx, ty) : null;
  drawOverworld(fieldCtx, {
    map: app.map,
    tiles: app.tiles,
    player: app.player,
    gender: app.save.gender || "male",
    vw,
    vh,
    now,
    camSmooth: app.cam,
    buildings: app.buildings,
    npcs: app.npcs,
    bubbleNpc,
    ballPickups: app.ballPickups,
    fieldLoot: app.fieldLoot,
    wilds: app.wilds,
  });
}

function tryStep(dx, dy) {
  if (app.mode !== "field" || !app.player || app.pendingEncounter) return;
  const now = performance.now();
  if (!beginStep(app.player, app.map, dx, dy, now)) return;
  AudioFx.step();
  syncSavePos();
}

function tickPatchCooldowns() {
  const cd = app.save.patchCooldown || {};
  let changed = false;
  for (const k of Object.keys(cd)) {
    cd[k] -= 1;
    if (cd[k] <= 0) {
      delete cd[k];
      changed = true;
    } else changed = true;
  }
  app.save.patchCooldown = cd;
  if (changed) saveGame(app.save);
}

function markPatchCooldown(tileX, tileY) {
  const pid = app.patchId[tileY]?.[tileX] || 0;
  if (!pid) return;
  if (!app.save.patchCooldown) app.save.patchCooldown = {};
  app.save.patchCooldown[pid] = Math.max(app.save.patchCooldown[pid] || 0, PATCH_COOLDOWN_STEPS);
  // Soft cooldown on nearby patches (by patchMeta centers)
  const meta = app.patchMeta.find((p) => p.id === pid);
  if (meta) {
    const cx = meta.x0 + meta.w / 2;
    const cy = meta.y0 + meta.h / 2;
    for (const p of app.patchMeta) {
      if (p.id === pid) continue;
      const px = p.x0 + p.w / 2;
      const py = p.y0 + p.h / 2;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < 22) {
        app.save.patchCooldown[p.id] = Math.max(
          app.save.patchCooldown[p.id] || 0,
          PATCH_SOFT_COOLDOWN,
        );
      }
    }
  }
  saveGame(app.save);
}

function patchOnCooldown(tileX, tileY) {
  const pid = app.patchId[tileY]?.[tileX] || 0;
  if (!pid) return false;
  return (app.save.patchCooldown?.[pid] || 0) > 0;
}

function encounterRateAt(tileX, tileY) {
  // Pity: after many safe tall-grass steps, slightly raise rate
  const pity = Math.min(0.1, app.stepsSinceEncounter * 0.002);
  return ENCOUNTER_RATE + pity;
}

function onTileArrived(tileX, tileY) {
  syncSavePos();
  tickPatchCooldowns();
  const tile = app.map[tileY][tileX];

  // Collect field loot (ball / coin / fireball)
  const li = app.fieldLoot.findIndex((b) => b.x === tileX && b.y === tileY);
  if (li >= 0) {
    const item = app.fieldLoot[li];
    app.fieldLoot.splice(li, 1);
    app.ballPickups = app.fieldLoot.filter((p) => p.kind === "ball");
    if (item.kind === "ball") {
      if (!app.save.collectedBalls) app.save.collectedBalls = {};
      app.save.collectedBalls[item.id] = true;
      app.save.balls += item.n || 1;
      saveGame(app.save);
      AudioFx.pickup();
      vibrate(12);
      showFieldToast(`몬스터볼 ×${item.n || 1} 획득! (보유 ${app.save.balls})`);
    } else if (item.kind === "coin") {
      const amt = item.amount || 15;
      earnMoney(amt);
      AudioFx.pickup();
      vibrate(10);
      showFieldToast(`금화 +${amt}원!`);
    } else if (item.kind === "fireball") {
      app.save.fireballs = (app.save.fireballs || 0) + (item.n || 1);
      saveGame(app.save);
      AudioFx.pickup();
      vibrate(14);
      showFieldToast(`파이어볼 ×${item.n || 1}! (보유 ${app.save.fireballs})`);
    }
  }

  // Contact a roaming wild Pokémon
  const hit = wildAt(app.wilds, tileX, tileY);
  if (hit) {
    startEncounterFromWild(hit);
    return;
  }

  if (tile === T.SHOP) {
    openShop();
    return;
  }

  // Tall grass no longer random-encounters — wilds are visible on the map
  if (tile === T.TALL) {
    app.stepsSinceEncounter += 1;
  }
}

function showFieldToast(text) {
  if (!fieldToast) return;
  fieldToast.hidden = false;
  fieldToast.textContent = text;
  fieldToast.classList.remove("show");
  void fieldToast.offsetWidth;
  clearTimeout(showFieldToast._t);
  showFieldToast._t = setTimeout(() => {
    fieldToast.hidden = true;
  }, 2200);
}

function setEdgePadEnabled(on) {
  if (!edgePad) return;
  edgePad.classList.toggle("hidden", !on);
}

function pollMovement() {
  if (app.mode !== "field" || !app.player || app.player.moving || app.pendingEncounter) return;
  const dir = heldDirection(app.keys, app.holdDir);
  if (dir) tryStep(dir[0], dir[1]);
}


async function startEncounter() {
  // Debug / force — spawn a random field encounter without a map wild
  await startEncounterFromWild(null);
}

async function startEncounterFromWild(wild) {
  app.mode = "encounter";
  setEdgePadEnabled(false);
  app.pendingEncounter = true;
  app.activeWildId = wild?.id ?? null;
  flashScreen();
  vibrate([30, 40, 30]);
  AudioFx.encounter();
  const id = wild?.speciesId ?? WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
  const level = wild?.level ?? (3 + Math.floor(Math.random() * 5));
  try {
    app.wildInfo = makeBattler(await fetchSpecies(id), level);
  } catch (e) {
    console.warn(e);
    app.pendingEncounter = false;
    app.activeWildId = null;
    setEdgePadEnabled(true);
    app.mode = "field";
    showPanel(`<h2>통신 오류</h2><p>포켓몬 정보를 불러오지 못했어요.</p>
      <button class="btn primary" type="button" id="ok">확인</button>`);
    document.getElementById("ok").onclick = () => { hidePanel(); app.mode = "field"; app.pendingEncounter = false; setEdgePadEnabled(true); };
    return;
  }
  AudioFx.cry(app.wildInfo.id);
  const w = app.wildInfo;
  const hasCards = ownedCards().length > 0;
  const hasBalls = app.save.balls > 0;
  showPanel(`
    <h2 class="hero-title">야생의 <span class="mon-name">${esc(w.ko)}</span>가 나타났다!</h2>
    <p><span class="lv-badge">Lv.${w.level}</span> ${typeChipsHtml(w.types)}</p>
    <img src="${esc(w.front)}" alt="" width="96" height="96" style="display:block;margin:0 auto 12px">
    <div class="stack">
      <button class="btn primary" type="button" id="pick-battle">배틀</button>
      <button class="btn pink" type="button" id="pick-card" ${hasCards ? "" : "disabled aria-disabled=\"true\""}>카드 승부</button>
      <button class="btn ball" type="button" id="pick-catch" ${hasBalls ? "" : "disabled aria-disabled=\"true\""}>몬스터볼로 잡기 ×${app.save.balls}</button>
      <button class="btn ghost" type="button" id="pick-run">도망친다</button>
    </div>
  `);
  document.getElementById("pick-battle").onclick = () => {
    AudioFx.ui();
    hidePanel();
    beginBattle().catch((err) => {
      console.error(err);
      showPanel(`<h2>전투 오류</h2><p>${esc(err?.message || err)}</p>
        <button class="btn primary" id="ok" type="button">필드로</button>`);
      document.getElementById("ok").onclick = () => { hidePanel(); endBattleScene(); };
    });
  };
  const pickCard = document.getElementById("pick-card");
  pickCard.onclick = () => {
    if (!ownedCards().length || pickCard.disabled) return;
    AudioFx.ui();
    hidePanel();
    beginCard();
  };
  const pickCatch = document.getElementById("pick-catch");
  pickCatch.onclick = () => {
    if (app.save.balls <= 0 || pickCatch.disabled) return;
    AudioFx.ui();
    hidePanel();
    startFieldCatch();
  };
  document.getElementById("pick-run").onclick = () => {
    AudioFx.fleeOk();
    hidePanel();
    fleeActiveWild();
    app.mode = "field";
    app.pendingEncounter = false;
    setEdgePadEnabled(true);
    drawField();
  };
}

/** Remove the overworld wild after catch / faint. */
function consumeActiveWild() {
  if (app.activeWildId == null) return;
  app.wilds = app.wilds.filter((w) => w.id !== app.activeWildId);
  app.activeWildId = null;
}

/** On flee: nudge wild away so we don't instantly re-trigger. */
function fleeActiveWild() {
  if (app.activeWildId == null) return;
  const w = app.wilds.find((x) => x.id === app.activeWildId);
  app.activeWildId = null;
  if (!w || !app.player) return;
  const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0], [1, 1], [-1, 1]];
  for (const [dx, dy] of dirs) {
    const nx = w.tx + dx;
    const ny = w.ty + dy;
    if (!app.map[ny] || app.map[ny][nx] === undefined) continue;
    const t = app.map[ny][nx];
    if (t === T.WATER || t === T.TREE || t === T.HOUSE || t === T.SHOP) continue;
    if (Math.max(Math.abs(nx - w.homeX), Math.abs(ny - w.homeY)) > 8) continue;
    w.tx = nx; w.ty = ny; w.x = nx; w.y = ny;
    w.moving = false;
    break;
  }
}

function flashScreen() {
  if (!app.flashEl) {
    app.flashEl = document.createElement("div");
    app.flashEl.className = "flash";
    fieldCanvas.parentElement.appendChild(app.flashEl);
  }
  app.flashEl.classList.add("on");
  setTimeout(() => app.flashEl.classList.remove("on"), reducedMotion ? 40 : 160);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** Cards usable in 카드 승부 (party + box). */
function ownedCards() {
  const party = Array.isArray(app.save?.party) ? app.save.party : [];
  const box = Array.isArray(app.save?.box) ? app.save.box : [];
  return [...party, ...box];
}

function showPanel(html, panelClass = "") {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="panel ${panelClass}">${html}</div>`;
}

function hidePanel() {
  overlay.hidden = true;
  overlay.innerHTML = "";
}

async function beginBattle() {
  app.mode = "battle";
  setEdgePadEnabled(false);
  dock.classList.add("hidden");
  battleLayer.classList.remove("hidden");
  battleLayer.setAttribute("aria-hidden", "false");
  const ally = hydrateBattler(app.save.party[0]);
  if (!ally || ally.hp <= 0) {
    const alive = app.save.party.findIndex((p) => p.hp > 0);
    if (alive < 0) {
      showPanel(`<h2>싸울 포켓몬이 없어요</h2><button class="btn primary" id="ok" type="button">확인</button>`);
      document.getElementById("ok").onclick = () => { hidePanel(); endBattleScene(); };
      return;
    }
    swapParty(0, alive);
  }
  app.battle = {
    ally: hydrateBattler(app.save.party[0]),
    wild: { ...app.wildInfo },
    log: `야생의 ${app.wildInfo.ko}이(가) 나타났다!`,
    phase: "command",
    balls: app.save.balls,
  };
  let Battle3D;
  try {
    Battle3D = await loadBattle3D();
    app.battle3d = new Battle3D(battleCanvas);
    const g = app.save.gender || "male";
    const trainerSrc = g === "female" ? "assets/characters/female-back.png" : "assets/characters/male-back.png";
    await app.battle3d.loadImages({
      meadow: "assets/battle/meadow.png",
      grass: "assets/tiles/grass.png",
      wild: app.battle.wild.front,
      ally: app.battle.ally.back || app.battle.ally.front,
      trainer: trainerSrc,
    });
    await app.battle3d.start();
  } catch (err) {
    console.error(err);
    app.battle3d?.stop?.();
    app.battle3d = null;
    showPanel(`<h2>전투 엔진 오류</h2><p>전투 화면을 준비하지 못했어요.</p>
      <button class="btn primary" id="ok" type="button">필드로</button>`);
    document.getElementById("ok").onclick = () => { hidePanel(); endBattleScene(); };
    return;
  }
  playFocusIntro();
  syncBattleFlash();
  AudioFx.battleStart();
  AudioFx.cry(app.battle.wild.id);
  renderBattleUi();
}

function hydrateBattler(stored) {
  if (!stored) return null;
  return {
    ...stored,
    moves: stored.moves || [
      { id: "tackle", ko: "몸통박치기", type: "normal", power: 40 },
      { id: "quick-attack", ko: "전광석화", type: "normal", power: 40 },
    ],
  };
}

function playFocusIntro() {
  battleLayer.classList.remove("focus", "focus-in", "focus-done");
  void battleLayer.offsetWidth;
  battleLayer.classList.add("focus-in");
  if (reducedMotion) {
    battleLayer.classList.add("focus", "focus-done");
    return;
  }
  setTimeout(() => battleLayer.classList.add("focus"), 80);
  setTimeout(() => battleLayer.classList.add("focus-done"), 520);
}

function hpPct(mon) {
  return Math.max(0, Math.min(100, (mon.hp / mon.maxHp) * 100));
}

function hpClass(mon) {
  const p = hpPct(mon);
  if (p <= 20) return "crit";
  if (p <= 50) return "low";
  return "";
}

function renderBattleUi() {
  const b = app.battle;
  if (!b) return;
  const { ally, wild } = b;
  battleUi.innerHTML = `
    <div class="hud-row">
      <div class="hp-card enemy">
        <div class="hp-name mon-name">${esc(wild.ko)}</div>
        <div class="hp-meta"><span class="lv-badge">Lv.${wild.level}</span> ${typeChipsHtml(wild.types)}</div>
        <div class="hp-bar"><div class="hp-fill ${hpClass(wild)}" style="width:${hpPct(wild)}%"></div></div>
      </div>
    </div>
    <div class="hud-row">
      <div class="hp-card ally">
        <div class="hp-name mon-name">${esc(ally.ko)}</div>
        <div class="hp-meta"><span class="lv-badge">Lv.${ally.level}</span> HP ${ally.hp}/${ally.maxHp}</div>
        <div class="hp-bar"><div class="hp-fill ${hpClass(ally)}" style="width:${hpPct(ally)}%"></div></div>
      </div>
    </div>
    <div class="log-line">${esc(b.log)}</div>
    <div id="battle-menus"></div>
  `;
  const menus = document.getElementById("battle-menus");
  if (b.phase === "command") {
    menus.innerHTML = `
      <div class="menu-grid">
        <button class="btn primary" type="button" data-act="fight">싸운다</button>
        <button class="btn" type="button" data-act="bag">가방</button>
        <button class="btn" type="button" data-act="pokemon">포켓몬</button>
        <button class="btn ghost" type="button" data-act="run">도망간다</button>
      </div>`;
    menus.querySelectorAll("[data-act]").forEach((el) => {
      el.onclick = () => onCommand(el.dataset.act);
    });
  } else if (b.phase === "moves") {
    menus.innerHTML = `<div class="menu-grid moves">
      ${ally.moves.map((m, i) =>
        `<button class="btn" type="button" data-move="${i}">${esc(m.ko)}<br><small>${TYPE_KO[m.type] || m.type} · ${m.power}</small></button>`
      ).join("")}
      <button class="btn ghost" type="button" data-act="back" style="grid-column:1/-1">뒤로</button>
    </div>`;
    menus.querySelectorAll("[data-move]").forEach((el) => {
      el.onclick = () => playerMove(Number(el.dataset.move));
    });
    menus.querySelector("[data-act=back]").onclick = () => {
      b.phase = "command";
      renderBattleUi();
    };
  } else if (b.phase === "bag") {
    const hasBalls = app.save.balls > 0;
    const hasFire = (app.save.fireballs || 0) > 0;
    menus.innerHTML = `
      <div class="stack">
        <button class="btn primary" type="button" id="use-ball" ${hasBalls ? "" : "disabled aria-disabled=\"true\""}>몬스터볼 ×${app.save.balls}</button>
        <button class="btn" type="button" id="use-fireball" ${hasFire ? "" : "disabled aria-disabled=\"true\""}>파이어볼 ×${app.save.fireballs || 0}</button>
        <button class="btn ghost" type="button" id="bag-back">뒤로</button>
      </div>`;
    const useBallBtn = document.getElementById("use-ball");
    useBallBtn.onclick = () => {
      if (app.save.balls <= 0 || useBallBtn.disabled) return;
      useBall();
    };
    const useFireBtn = document.getElementById("use-fireball");
    useFireBtn.onclick = () => {
      if ((app.save.fireballs || 0) <= 0 || useFireBtn.disabled) return;
      useFireball();
    };
    document.getElementById("bag-back").onclick = () => { b.phase = "command"; renderBattleUi(); };
  } else if (b.phase === "switch") {
    menus.innerHTML = `<div class="stack">
      ${app.save.party.map((p, i) =>
        `<button class="btn ${p.hp <= 0 ? "" : "primary"}" type="button" data-sw="${i}" ${p.hp <= 0 || i === 0 ? "disabled" : ""}>
          ${esc(p.ko)} Lv.${p.level} (${p.hp}/${p.maxHp})
        </button>`
      ).join("")}
      <button class="btn ghost" type="button" id="sw-back">뒤로</button>
    </div>`;
    menus.querySelectorAll("[data-sw]").forEach((el) => {
      el.onclick = () => {
        swapParty(0, Number(el.dataset.sw));
        app.battle.ally = hydrateBattler(app.save.party[0]);
        app.battle.log = `가랏! ${app.battle.ally.ko}!`;
        app.battle.phase = "command";
        saveGame(app.save);
        renderBattleUi();
        wildTurn();
      };
    });
    document.getElementById("sw-back").onclick = () => { b.phase = "command"; renderBattleUi(); };
  }
}

function onCommand(act) {
  const b = app.battle;
  if (act === "fight") { b.phase = "moves"; renderBattleUi(); }
  else if (act === "bag") { b.phase = "bag"; renderBattleUi(); }
  else if (act === "pokemon") { b.phase = "switch"; renderBattleUi(); }
  else if (act === "run") tryRun();
}

function swapParty(a, b) {
  const t = app.save.party[a];
  app.save.party[a] = app.save.party[b];
  app.save.party[b] = t;
}

async function playerMove(idx) {
  const b = app.battle;
  const move = b.ally.moves[idx];
  if (!move || b.phase === "anim") return;
  b.phase = "anim";
  renderBattleUi();
  const stab = b.ally.types.includes(move.type) ? 1.5 : 1;
  const mult = typeEffect(move.type, b.wild.types);
  const dmg = calcDamage({
    level: b.ally.level,
    power: move.power,
    atk: move.type === "normal" || move.type === "fighting" || move.type === "flying"
      || move.type === "poison" || move.type === "ground" || move.type === "rock"
      || move.type === "bug" || move.type === "ghost" || move.type === "steel"
      ? b.ally.atk : b.ally.spa,
    defense: b.wild.def,
    stab,
    typeMult: mult,
  });
  b.log = `${b.ally.ko}의 ${move.ko}!`;
  renderBattleUi();
  AudioFx.cry(b.ally.id);
  await app.battle3d?.playAttack("ally", move.type);
  b.wild.hp = Math.max(0, b.wild.hp - dmg);
  const eff = effectivenessText(mult);
  if (mult >= 2) AudioFx.superEffective();
  else if (mult > 0 && mult <= 0.5) AudioFx.notEffective();
  else AudioFx.hit();
  vibrate(mult >= 2 ? [20, 30, 40] : 20);
  showBattlePop(dmg, false);
  if (eff) showEffBanner(eff);
  syncBattleFlash();
  b.log = `${b.ally.ko}의 ${move.ko}! ${eff}`.trim();
  renderBattleUi();
  await wait(mult >= 2 ? 900 : 650);
  if (b.wild.hp <= 0) {
    await onWildFainted();
    return;
  }
  await wildTurn();
}

async function wildTurn() {
  const b = app.battle;
  if (!b || b.wild.hp <= 0) return;
  b.phase = "anim";
  renderBattleUi();
  const move = b.wild.moves[Math.floor(Math.random() * b.wild.moves.length)];
  const stab = b.wild.types.includes(move.type) ? 1.5 : 1;
  const mult = typeEffect(move.type, b.ally.types);
  const dmg = calcDamage({
    level: b.wild.level,
    power: move.power,
    atk: b.wild.atk,
    defense: b.ally.def,
    stab,
    typeMult: mult,
  });
  b.log = `야생 ${b.wild.ko}의 ${move.ko}!`;
  renderBattleUi();
  AudioFx.cry(b.wild.id);
  await app.battle3d?.playAttack("wild", move.type);
  b.ally.hp = Math.max(0, b.ally.hp - dmg);
  syncAllyToParty();
  const eff = effectivenessText(mult);
  AudioFx.hurt();
  vibrate([15, 30, 15]);
  showBattlePop(dmg, true);
  if (eff) showEffBanner(eff);
  syncBattleFlash();
  b.log = `야생 ${b.wild.ko}의 ${move.ko}! ${eff}`.trim();
  b.phase = "command";
  renderBattleUi();
  if (b.ally.hp <= 0) {
    await wait(500);
    await onAllyFainted();
  }
}

function showBattlePop(dmg, allyHit) {
  if (!battleFx || reducedMotion) return;
  const el = document.createElement("div");
  el.className = "dmg-pop" + (allyHit ? " ally-hit" : "");
  el.textContent = `-${dmg}`;
  battleFx.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function showEffBanner(text) {
  if (!battleFx || !text || reducedMotion) return;
  const el = document.createElement("div");
  el.className = "eff-banner";
  el.textContent = text;
  battleFx.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function syncBattleFlash() {
  if (!battleFlash || syncBattleFlash._running) return;
  syncBattleFlash._running = true;
  const paint = () => {
    if (!app.battle3d || (app.mode !== "battle" && app.mode !== "catch")) {
      battleFlash.style.opacity = "0";
      syncBattleFlash._running = false;
      return;
    }
    const f = app.battle3d.getFlash?.() || 0;
    if (f > 0.05) {
      battleFlash.style.background = app.battle3d.getFlashCss?.() || "rgba(255,255,255,0.4)";
      battleFlash.style.opacity = String(Math.min(0.7, f));
    } else {
      battleFlash.style.opacity = "0";
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}

function syncAllyToParty() {
  const b = app.battle;
  if (!b) return;
  const p = app.save.party[0];
  if (p) {
    p.hp = b.ally.hp;
    p.maxHp = b.ally.maxHp;
  }
  saveGame(app.save);
}

async function onWildFainted() {
  const b = app.battle;
  b.log = `야생 ${b.wild.ko}은(는) 쓰러졌다!`;
  AudioFx.faint();
  AudioFx.win();
  gainExp(b.ally, b.wild);
  const gained = earnMoney(20 + b.wild.level * 10 + Math.floor((b.wild.bst || 300) / 40));
  syncAllyToParty();
  renderBattleUi();
  await wait(900);
  showPanel(`
    <h2 class="hero-title">승리!</h2>
    <p>야생 포켓몬을 쓰러뜨렸어요. <span class="money-gain">+${gained}원</span></p>
    <p>포획하려면 몬스터볼을 쓰세요.</p>
    <button class="btn primary" type="button" id="ok">필드로</button>
  `);
  document.getElementById("ok").onclick = () => { hidePanel(); consumeActiveWild(); endBattleScene(); };
}

async function onAllyFainted() {
  AudioFx.faint();
  const alive = app.save.party.findIndex((p, i) => i > 0 && p.hp > 0);
  if (alive >= 0) {
    app.battle.phase = "switch";
    app.battle.log = `${app.battle.ally.ko}은(는) 기절했다! 다음 포켓몬을 골라주세요.`;
    renderBattleUi();
    return;
  }
  app.battle.log = "더 이상 싸울 수 없다…";
  renderBattleUi();
  await wait(700);
  // heal lightly at loss (casual)
  for (const p of app.save.party) p.hp = Math.max(1, Math.floor(p.maxHp * 0.5));
  app.save.balls = Math.max(0, app.save.balls - 1);
  app.save.px = app.spawnX;
  app.save.py = app.spawnY;
  if (app.player) {
    app.player.tx = app.spawnX;
    app.player.ty = app.spawnY;
    app.player.x = app.spawnX;
    app.player.y = app.spawnY;
    app.player.moving = false;
  }
  app.cam.ready = false;
  saveGame(app.save);
  showPanel(`
    <h2>패배…</h2>
    <p>정신이 아득해졌다. 출발 지점으로 돌아왔다.</p>
    <button class="btn primary" type="button" id="ok">확인</button>
  `);
  document.getElementById("ok").onclick = () => { hidePanel(); endBattleScene(); };
}

function gainExp(ally, wild) {
  const gained = Math.max(1, Math.floor(wild.level * 3 + wild.bst / 40));
  ally.exp = (ally.exp || 0) + gained;
  const need = ally.level * 20;
  if (ally.exp >= need) {
    ally.exp -= need;
    ally.level += 1;
    const ratio = ally.hp / ally.maxHp;
    ally.maxHp += 2;
    ally.hp = Math.max(1, Math.floor(ally.maxHp * ratio));
    ally.atk += 1;
    ally.def += 1;
  }
  const p = app.save.party[0];
  if (p) Object.assign(p, {
    level: ally.level, exp: ally.exp, hp: ally.hp, maxHp: ally.maxHp, atk: ally.atk, def: ally.def,
  });
}

async function useBall() {
  const b = app.battle;
  if (app.save.balls <= 0) {
    b.log = "볼이 없다!";
    b.phase = "command";
    renderBattleUi();
    return;
  }
  b.phase = "anim";
  b.log = `${b.wild.ko}에게 몬스터볼을 던진다!`;
  renderBattleUi();
  battleLayer.classList.add("hidden");

  const result = await runThrowCatch(b.wild, { consumeBall: true });
  if (result.caught) {
    showPanel(`
      <h2>${esc(b.wild.ko)} 포획!</h2>
      <p>${typeChipsHtml(b.wild.types)} · 전투력 ${combatPower(b.wild)}</p>
      <img src="${esc(b.wild.art)}" alt="" width="120" height="120" style="display:block;margin:8px auto">
      <button class="btn primary" type="button" id="ok">계속</button>
    `);
    document.getElementById("ok").onclick = () => { hidePanel(); consumeActiveWild(); endBattleScene(); };
    return;
  }
  battleLayer.classList.remove("hidden");
  app.mode = "battle";
  b.log = "아쉽다! 포켓몬이 볼을 피했다!";
  b.phase = "command";
  renderBattleUi();
  await wait(400);
  await wildTurn();
}

async function useFireball() {
  const b = app.battle;
  if ((app.save.fireballs || 0) <= 0) {
    b.log = "파이어볼이 없다!";
    b.phase = "command";
    renderBattleUi();
    return;
  }
  app.save.fireballs -= 1;
  saveGame(app.save);
  b.phase = "anim";
  b.log = `파이어볼을 던졌다!`;
  renderBattleUi();
  const mult = typeEffect("fire", b.wild.types);
  const dmg = Math.max(8, Math.floor((32 + b.ally.level * 3) * (0.85 + Math.random() * 0.3) * Math.max(0.25, mult)));
  AudioFx.superEffective();
  await app.battle3d?.playAttack("ally", "fire");
  b.wild.hp = Math.max(0, b.wild.hp - dmg);
  const eff = effectivenessText(mult);
  showBattlePop(dmg, false);
  if (eff) showEffBanner(eff);
  syncBattleFlash();
  b.log = `파이어볼! ${eff}`.trim();
  renderBattleUi();
  await wait(700);
  if (b.wild.hp <= 0) {
    await onWildFainted();
    return;
  }
  await wildTurn();
}

/** Encounter menu → catch-1 throw scene (no turn battle). */
async function startFieldCatch() {
  const wild = app.wildInfo;
  if (!wild) return;
  if (app.save.balls <= 0) {
    showFieldToast("몬스터볼이 없어요");
    app.mode = "field";
    app.pendingEncounter = false;
    setEdgePadEnabled(true);
    return;
  }
  setEdgePadEnabled(false);
  dock.classList.add("hidden");
  const result = await runThrowCatch(wild, { consumeBall: true });
  dock.classList.remove("hidden");
  if (result.caught) {
    showPanel(`
      <h2>${esc(wild.ko)} 포획!</h2>
      <p>${typeChipsHtml(wild.types)} · 전투력 ${combatPower(wild)}</p>
      <img src="${esc(wild.art)}" alt="" width="120" height="120" style="display:block;margin:8px auto">
      <button class="btn primary" type="button" id="ok">계속</button>
    `);
    document.getElementById("ok").onclick = () => {
      hidePanel();
      consumeActiveWild();
      app.mode = "field";
      app.pendingEncounter = false;
      setEdgePadEnabled(true);
      drawField();
    };
    return;
  }
  fleeActiveWild();
  app.mode = "field";
  app.pendingEncounter = false;
  setEdgePadEnabled(true);
  if (!result.aborted) showFieldToast("놓쳤다… 야생 포켓몬이 도망갔다");
  drawField();
}

/** Shared catch-1 scene. */
async function runThrowCatch(wild, { consumeBall = true } = {}) {
  if (consumeBall) {
    if (app.save.balls <= 0) return { caught: false, aborted: true };
    app.save.balls -= 1;
    saveGame(app.save);
  }
  catchLayer.classList.remove("hidden");
  catchLayer.setAttribute("aria-hidden", "false");
  app.mode = "catch";

  const prob = catchChance({
    maxHp: wild.maxHp,
    hp: wild.hp,
    catchRate: wild.catchRate,
    ballBonus: 2.2,
  });
  const cp = combatPower(wild);
  // Mild CP soft-nerf only — full-HP field catches were feeling too stingy (~20–35%).
  const strengthPenalty = Math.max(0.78, 1 - (cp - 110) / 520);
  const finalProb = Math.max(0.22, Math.min(0.9, prob * strengthPenalty));

  const { caught } = await runCatchScene({
    canvas: catchCanvas,
    mon: {
      id: wild.id,
      ko: wild.ko,
      front: wild.front,
      art: wild.art,
      level: wild.level,
      bst: wild.bst,
      combatPower: cp,
    },
    catchProb: finalProb,
    reducedMotion,
    sfx: {
      throw: () => AudioFx.catchTry(),
      shake: () => AudioFx.catchShake(),
      catch: () => AudioFx.catchOk(),
      flee: () => AudioFx.catchFail(),
      miss: () => AudioFx.catchMiss(),
      cry: (id) => AudioFx.cry(id),
    },
  });

  catchLayer.classList.add("hidden");
  catchLayer.setAttribute("aria-hidden", "true");
  if (caught) {
    addToPartyOrBox({ ...wild, hp: wild.maxHp });
    earnMoney(18 + (wild.level || 5) * 6);
  }
  return { caught };
}

function addToPartyOrBox(mon) {
  const stored = {
    id: mon.id,
    ko: mon.ko,
    en: mon.en,
    types: mon.types,
    level: mon.level,
    maxHp: mon.maxHp,
    hp: mon.maxHp,
    atk: mon.atk,
    def: mon.def,
    spa: mon.spa,
    spd: mon.spd,
    spe: mon.spe,
    bst: mon.bst,
    catchRate: mon.catchRate,
    moves: mon.moves,
    art: mon.art,
    front: mon.front,
    back: mon.back,
    exp: 0,
  };
  if (app.save.party.length < 6) app.save.party.push(stored);
  else app.save.box.push(stored);
  saveGame(app.save);
}

function tryRun() {
  const b = app.battle;
  const chance = Math.min(0.9, 0.4 + (b.ally.spe - b.wild.spe) / 200);
  if (Math.random() < chance) {
    b.log = "무사히 도망쳤다!";
    AudioFx.fleeOk();
    renderBattleUi();
    setTimeout(() => { fleeActiveWild(); endBattleScene(); }, 600);
  } else {
    b.log = "도망칠 수 없다!";
    AudioFx.fleeFail();
    renderBattleUi();
    setTimeout(() => wildTurn(), 500);
  }
}

function healPartyFull() {
  for (const p of app.save.party) {
    if (p && p.maxHp) p.hp = p.maxHp;
  }
  saveGame(app.save);
}

function endBattleScene() {
  app.battle3d?.stop();
  app.battle3d = null;
  app.battle = null;
  battleLayer.classList.add("hidden");
  battleLayer.classList.remove("focus", "focus-in", "focus-done");
  battleLayer.setAttribute("aria-hidden", "true");
  battleUi.innerHTML = "";
  if (battleFx) battleFx.innerHTML = "";
  if (battleFlash) battleFlash.style.opacity = "0";
  catchLayer?.classList.add("hidden");
  dock.classList.remove("hidden");
  healPartyFull();
  // If we blacked out / left without clearing, nudge the wild away
  if (app.activeWildId != null) fleeActiveWild();
  app.mode = "field";
  app.pendingEncounter = false;
  setEdgePadEnabled(true);
  drawField();
}

async function beginCard() {
  const options = ownedCards();
  if (!options.length) {
    showPanel(`
      <h2>카드가 없어요</h2>
      <p>카드 승부에 낼 포켓몬이 없습니다.</p>
      <button class="btn primary" type="button" id="ok">확인</button>
    `);
    document.getElementById("ok").onclick = () => {
      hidePanel();
      app.mode = "field";
      app.pendingEncounter = false;
      setEdgePadEnabled(true);
    };
    return;
  }
  app.mode = "card";
  setEdgePadEnabled(false);
  hidePanel();
  dock.classList.add("hidden");
  const layer = document.getElementById("card-layer");
  const wild = app.wildInfo;
  const result = await runCardDuel({
    layer,
    hand: options,
    wild,
    reducedMotion,
    sfx: {
      ui: () => AudioFx.ui(),
      whoosh: () => AudioFx.fleeOk(),
      throw: () => AudioFx.catchTry(),
      clash: () => AudioFx.superEffective(),
      win: () => AudioFx.win(),
      lose: () => AudioFx.catchFail(),
      cry: (id) => AudioFx.cry(id),
    },
  });
  dock.classList.remove("hidden");
  if (result.cancelled) {
    app.mode = "field";
    app.pendingEncounter = false;
    setEdgePadEnabled(true);
    drawField();
    return;
  }
  await finishCardDuel(result.card, wild, result.win, result.my, result.theirs);
}

async function finishCardDuel(card, wild, win, my, theirs) {
  const mult = typeEffect(card.types[0], wild.types);
  const foeMult = typeEffect(wild.types[0], card.types);
  const maxScore = Math.max(my, theirs, 1);
  const myPct = Math.round((my / maxScore) * 100);
  const theirPct = Math.round((theirs / maxScore) * 100);
  const myType = card.types?.[0] || "normal";
  const foeType = wild.types?.[0] || "normal";
  let gained = 0;
  if (win) {
    addToPartyOrBox({ ...wild, hp: wild.maxHp });
    gained = earnMoney(22 + (wild.level || 5) * 7);
    AudioFx.catchOk();
    AudioFx.cry(wild.id);
  } else {
    AudioFx.catchFail();
  }
  const stamp = win ? "WIN" : "LOSE";
  showPanel(`
    <div class="cr-burst" aria-hidden="true"></div>
    <div class="cr-ribbon">${win ? "카드 승리" : "카드 패배"}</div>
    <div class="cr-stamp ${win ? "win" : "lose"}" aria-hidden="true">${stamp}</div>
    <div class="cr-duel">
      <div class="cr-side mine ${win ? "winner" : "loser"}">
        <div class="cr-portrait" style="--type:${TYPE_COLOR[myType] || "#888"}">
          <img src="${esc(card.front || card.art)}" alt="">
          <span class="cr-glow"></span>
        </div>
        <strong class="cr-name">${esc(card.ko)}</strong>
        <div class="cr-chips">${typeChipsHtml(card.types)}</div>
        <div class="cr-score" style="--fill:${myPct}%;--type:${TYPE_COLOR[myType] || "#888"}">
          <span class="cr-score-num">${my.toFixed(0)}</span>
          <div class="cr-bar"><i></i></div>
          <small>CP ${combatPower(card)} × ${mult}</small>
        </div>
      </div>
      <div class="cr-vs" aria-hidden="true">VS</div>
      <div class="cr-side foe ${win ? "loser" : "winner"}">
        <div class="cr-portrait" style="--type:${TYPE_COLOR[foeType] || "#888"}">
          <img src="${esc(wild.front || wild.art)}" alt="">
          <span class="cr-glow"></span>
        </div>
        <strong class="cr-name">${esc(wild.ko)}</strong>
        <div class="cr-chips">${typeChipsHtml(wild.types)}</div>
        <div class="cr-score" style="--fill:${theirPct}%;--type:${TYPE_COLOR[foeType] || "#888"}">
          <span class="cr-score-num">${theirs.toFixed(0)}</span>
          <div class="cr-bar"><i></i></div>
          <small>CP ${combatPower(wild)} × ${foeMult}</small>
        </div>
      </div>
    </div>
    <p class="cr-outcome ${win ? "win" : "lose"}">
      ${win
        ? `<span class="cr-catch">포획 성공!</span> <strong>${esc(wild.ko)}</strong>이(가) 파티에 합류했어요`
        : `야생 <strong>${esc(wild.ko)}</strong>이(가) 도망쳤어요…`}
    </p>
    ${win ? `<p class="cr-reward">+${gained}원 · 상성 ${TYPE_KO[myType] || myType} ×${mult}</p>` : `<p class="cr-reward muted">다음엔 상성이 유리한 카드를 내보세요</p>`}
    <button class="btn ${win ? "primary" : "ghost"} cr-ok" type="button" id="ok">${win ? "좋아!" : "확인"}</button>
  `, `card-result ${win ? "is-win" : "is-lose"}`);
  document.getElementById("ok").onclick = () => {
    hidePanel();
    if (win) consumeActiveWild();
    else fleeActiveWild();
    app.mode = "field";
    app.pendingEncounter = false;
    setEdgePadEnabled(true);
    drawField();
  };
}

async function resolveCard(card, wild) {
  // Legacy path — prefer beginCard → runCardDuel
  const multMine = typeEffect(card.types[0], wild.types);
  const multFoe = typeEffect(wild.types[0], card.types);
  let my = combatPower(card) * (multMine === 0 ? 0 : multMine);
  let theirs = combatPower(wild) * (multFoe === 0 ? 0 : multFoe);
  if (my === theirs) my *= 1.01;
  await finishCardDuel(card, wild, my > theirs, my, theirs);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, reducedMotion ? Math.min(ms, 120) : ms));
}

function earnMoney(amount) {
  const n = Math.max(0, Math.floor(amount));
  app.save.money = (app.save.money || 0) + n;
  saveGame(app.save);
  syncMoneyHud();
  return n;
}

function syncMoneyHud() {
  let el = document.getElementById("money-hud");
  if (!el) {
    const actions = document.querySelector(".top-actions");
    if (!actions) return;
    el = document.createElement("span");
    el.id = "money-hud";
    el.className = "money-hud";
    actions.prepend(el);
  }
  el.textContent = `${app.save.money ?? 0}원`;
}

function upgradeCost(mon) {
  return 70 + (mon.level || 5) * 18 + Math.floor((mon.bst || 300) / 25);
}

function upgradeSuccessChance(mon) {
  // Higher level → harder; clamp 28%–72%
  const lv = mon.level || 5;
  return Math.max(0.28, Math.min(0.72, 0.78 - lv * 0.035));
}

function openShop() {
  setEdgePadEnabled(false);
  app.mode = "shop";
  const shop = app.shops.find((s) => s.x === app.player.tx && s.y === app.player.ty);
  const village = shop?.village || "마을";
  const list = app.save.party.map((p, i) => {
    const cost = upgradeCost(p);
    const pct = Math.round(upgradeSuccessChance(p) * 100);
    return `<button class="dex-card-mini shop-card" type="button" data-up="${i}">
      <img src="${esc(p.front || p.art)}" alt="">
      <strong class="mon-name">${esc(p.ko)}</strong>
      <div><span class="lv-badge">Lv.${p.level}</span> CP ${combatPower(p)}</div>
      <div class="shop-meta">강화 ${cost}원 · 성공 ${pct}%</div>
    </button>`;
  }).join("") || "<p>강화할 파티원이 없어요.</p>";

  showPanel(`
    <h2 class="hero-title">${esc(village)} · 강화 상점</h2>
    <p class="stat-line">소지금 <strong class="money">${app.save.money}원</strong></p>
    <p>파티원을 선택하면 일정 확률로 <strong>레벨·스탯 강화</strong>에 성공합니다. 실패하면 돈만 사라져요.</p>
    <div class="card-grid">${list}</div>
    <button class="btn ghost" type="button" id="shop-close" style="margin-top:10px;width:100%">나가기</button>
  `);
  document.getElementById("shop-close").onclick = () => {
    hidePanel();
    app.mode = "field";
    setEdgePadEnabled(true);
  };
  document.querySelectorAll("[data-up]").forEach((el) => {
    el.onclick = () => tryUpgrade(Number(el.dataset.up));
  });
}

function tryUpgrade(index) {
  const mon = app.save.party[index];
  if (!mon) return;
  const cost = upgradeCost(mon);
  if ((app.save.money || 0) < cost) {
    AudioFx.catchMiss();
    showFieldToast("돈이 부족해요");
    return;
  }
  app.save.money -= cost;
  const chance = upgradeSuccessChance(mon);
  const ok = Math.random() < chance;
  if (ok) {
    mon.level += 1;
    mon.maxHp += 3;
    mon.hp = mon.maxHp;
    mon.atk = (mon.atk || 10) + 2;
    mon.def = (mon.def || 10) + 2;
    mon.spa = (mon.spa || 10) + 1;
    mon.spd = (mon.spd || 10) + 1;
    mon.spe = (mon.spe || 10) + 1;
    saveGame(app.save);
    syncMoneyHud();
    AudioFx.catchOk();
    vibrate([12, 20, 12]);
    showPanel(`
      <h2 class="hero-title success-flash">강화 성공!</h2>
      <p><span class="mon-name">${esc(mon.ko)}</span> → <span class="lv-badge">Lv.${mon.level}</span></p>
      <p>공격·방어·체력이 올랐어요. 남은 돈 <strong class="money">${app.save.money}원</strong></p>
      <button class="btn primary" type="button" id="ok">계속</button>
    `);
  } else {
    saveGame(app.save);
    syncMoneyHud();
    AudioFx.catchFail();
    vibrate(30);
    showPanel(`
      <h2 class="hero-title fail-flash">강화 실패…</h2>
      <p><span class="mon-name">${esc(mon.ko)}</span> 강화에 실패했어요.</p>
      <p>${cost}원을 잃었습니다. 남은 돈 <strong class="money">${app.save.money}원</strong></p>
      <button class="btn primary" type="button" id="ok">계속</button>
    `);
  }
  document.getElementById("ok").onclick = () => openShop();
}

function openParty() {
  syncMoneyHud();
  const list = app.save.party.map((p, i) =>
    `<button class="dex-card-mini" type="button" data-party="${i}">
      <img src="${esc(p.front || p.art)}" alt="">
      <strong class="mon-name">${esc(p.ko)}</strong>
      <div><span class="lv-badge">Lv.${p.level}</span> HP ${p.hp}/${p.maxHp}</div>
      ${typeChipsHtml(p.types)}
    </button>`
  ).join("") || "<p>파티가 비어 있어요.</p>";
  showPanel(`
    <h2 class="hero-title">파티</h2>
    <p class="stat-line">볼 <strong>${app.save.balls}</strong> · 파이어볼 <strong>${app.save.fireballs || 0}</strong> · 소지금 <strong class="money">${app.save.money}원</strong></p>
    <p class="hint-inline">카드를 누르면 도감을 볼 수 있어요</p>
    <div class="card-grid">${list}</div>
    <button class="btn primary" type="button" id="ok" style="margin-top:10px;width:100%">닫기</button>
  `);
  document.getElementById("ok").onclick = hidePanel;
  document.querySelectorAll("[data-party]").forEach((el) => {
    el.onclick = () => openDexCard(app.save.party[Number(el.dataset.party)], "party");
  });
}

async function openDexCard(mon, backTo = "party") {
  if (!mon) return;
  let flavor = "";
  try {
    const info = await fetchSpecies(mon.id);
    flavor = info.flavor || "";
  } catch { /* ignore */ }
  const types = typeChipsHtml(mon.types);
  showPanel(`
    <div class="party-dex-card">
      <p class="dex-no">#${String(mon.id).padStart(3, "0")}</p>
      <h2 class="mon-name">${esc(mon.ko)}</h2>
      <p class="dex-en">${esc(mon.en || "")}</p>
      <img src="${esc(mon.art || mon.front)}" alt="" width="160" height="160" style="display:block;margin:8px auto">
      <div>${types}</div>
      <p class="dex-flavor">${esc(flavor || "함께 모험하는 포켓몬.")}</p>
      <div class="dex-stats">
        <span class="lv-badge">Lv.${mon.level}</span>
        <span>HP ${mon.hp}/${mon.maxHp}</span>
        <span>CP ${combatPower(mon)}</span>
      </div>
      <button class="btn primary" type="button" id="dex-back" style="width:100%;margin-top:12px">뒤로</button>
    </div>
  `);
  document.getElementById("dex-back").onclick = () => {
    if (backTo === "dex") openDex();
    else openParty();
  };
}

function openDex() {
  const all = [...app.save.party, ...app.save.box];
  const list = all.map((p, i) =>
    `<button class="dex-card-mini" type="button" data-dex="${i}">
      <img src="${esc(p.art || p.front)}" alt="">
      <strong>${esc(p.ko)}</strong>
      <div>Lv.${p.level} · CP ${combatPower(p)}</div>
      ${typeChipsHtml(p.types)}
    </button>`
  ).join("") || "<p>아직 잡은 포켓몬이 없어요.</p>";
  showPanel(`
    <h2>도감 (${all.length})</h2>
    <div class="card-grid">${list}</div>
    <button class="btn primary" type="button" id="ok" style="margin-top:10px;width:100%">닫기</button>
  `);
  document.getElementById("ok").onclick = hidePanel;
  document.querySelectorAll("[data-dex]").forEach((el) => {
    el.onclick = () => openDexCard(all[Number(el.dataset.dex)], "dex");
  });
}

function openHelp() {
  showPanel(`
    <h2>어떻게 해요?</h2>
    <p>초원을 걷다가 포켓몬을 만나 잡고, 파티를 키우는 게임이에요.</p>
    <div class="help-steps">
      <article class="help-step wide">
        <img src="assets/battle/meadow.png" alt="초원 맵">
        <div>
          <h3>1. 마을·초원을 탐험해요</h3>
          <p>화면 <strong>밖</strong> 방향키(아래·옆)로 이동 · 맵에 보이는 야생 포켓몬에게 다가가 만나요. 길에 있는 <strong>몬스터볼</strong>을 주워요. 店에서 강화!</p>
          <div class="help-keys">
            <span>방향 키패드</span><span>WASD</span><span>화살표</span>
          </div>
        </div>
      </article>
      <article class="help-step">
        <img src="assets/tiles/tallgrass.png" alt="긴 풀">
        <div>
          <h3>2. 보이는 포켓몬에게 다가가요</h3>
          <p>맵을 돌아다니는 야생 포켓몬에게 닿으면 만나요.</p>
        </div>
      </article>
      <article class="help-step">
        <img src="assets/characters/male-down.png" alt="트레이너" style="object-fit:contain;background:#1a2e18">
        <div>
          <h3>3. 만남이 뜨면 고르세요</h3>
          <p><strong>배틀</strong> 또는 <strong>카드 승부</strong> 중 하나를 골라요.</p>
        </div>
      </article>
    </div>
    <div class="help-duo" aria-label="전투 모드 설명">
      <figure>
        <img src="assets/battle/meadow.png" alt="배틀 화면">
        <figcaption>배틀<br>싸운다 · 볼 던지기 · 교체</figcaption>
      </figure>
      <figure>
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png" alt="피카츄 카드 예시">
        <figcaption>카드 승부<br>타입 상성 × 전투력</figcaption>
      </figure>
    </div>
    <div class="help-steps" style="margin-top:12px">
      <article class="help-step">
        <img src="assets/tiles/path.png" alt="길">
        <div>
          <h3>팁</h3>
          <p>길은 안전하고, 물은 못 건너요. 잡은 포켓몬은 <strong>파티</strong>·<strong>도감</strong>에서 볼 수 있어요.</p>
        </div>
      </article>
    </div>
    <button class="btn primary" type="button" id="ok" style="width:100%;margin-top:4px">알겠어요</button>
  `);
  const wrap = overlay.querySelector(".panel");
  if (wrap) wrap.classList.add("help-panel");
  document.getElementById("ok").onclick = hidePanel;
}

function confirmReset() {
  showPanel(`
    <h2>다시 할까요?</h2>
    <p>파티·도감·위치가 모두 지워지고, 성별·스타터부터 다시 시작해요.</p>
    <div class="stack">
      <button class="btn danger" type="button" id="reset-yes">다시하기</button>
      <button class="btn ghost" type="button" id="reset-no">취소</button>
    </div>
  `);
  document.getElementById("reset-yes").onclick = () => { hidePanel(); resetGame(); };
  document.getElementById("reset-no").onclick = hidePanel;
}

async function resetGame() {
  if (app.battle3d) {
    app.battle3d.stop();
    app.battle3d = null;
  }
  app.battle = null;
  app.wildInfo = null;
  app.pendingEncounter = false;
  battleLayer.classList.add("hidden");
  battleLayer.classList.remove("focus", "focus-in", "focus-done");
  battleLayer.setAttribute("aria-hidden", "true");
  battleUi.innerHTML = "";
  dock.classList.remove("hidden");
  hidePanel();

  app.save = emptySave(app.spawnX, app.spawnY);
  storage.removeItem(LS);
  saveGame(app.save);
  app.player = createPlayerState(app.save, app.spawnX, app.spawnY, app.map);
  app.cam.ready = false;
  app.mode = "boot";
  await setupFlow();
  app.player = createPlayerState(app.save, app.spawnX, app.spawnY, app.map);
  app.cam.ready = false;
  app.mode = "field";
  setEdgePadEnabled(true);
  syncSavePos();
  drawField();
}

async function setupFlow() {
  if (app.save.gender && app.save.party.length) {
    app.mode = "field";
    return;
  }
  showPanel(`
    <h2>트레이너를 고르세요</h2>
    <p>참조 사진 기반 픽셀 캐릭터로 모험을 시작해요.</p>
    <div class="gender-pick">
      <button class="pick-card" type="button" data-g="male">
        <img src="assets/characters/male-overworld.png" alt="남자" onerror="this.style.display='none'">
        <strong>남자 트레이너</strong>
      </button>
      <button class="pick-card" type="button" data-g="female">
        <img src="assets/characters/female-overworld.png" alt="여자" onerror="this.style.display='none'">
        <strong>여자 트레이너</strong>
      </button>
    </div>
  `);
  await new Promise((resolve) => {
    overlay.querySelectorAll("[data-g]").forEach((el) => {
      el.onclick = () => {
        app.save.gender = el.dataset.g;
        saveGame(app.save);
        resolve();
      };
    });
  });

  const starters = await Promise.all(STARTERS.map(async (s) => {
    const info = await fetchSpecies(s.id);
    return { ...s, info };
  }));
  showPanel(`
    <h2>첫 포켓몬</h2>
    <p>함께할 스타터를 고르세요.</p>
    <div class="starter-pick">
      ${starters.map((s) => `
        <button class="pick-card" type="button" data-id="${s.id}">
          <img src="${esc(s.info.front)}" alt="">
          <strong>${esc(s.ko)}</strong>
          ${typeChipsHtml(s.info.types)}
        </button>
      `).join("")}
    </div>
  `);
  await new Promise((resolve) => {
    overlay.querySelectorAll("[data-id]").forEach((el) => {
      el.onclick = async () => {
        const id = Number(el.dataset.id);
        const info = await fetchSpecies(id);
        const mon = makeBattler(info, 5);
        app.save.party = [{
          id: mon.id, ko: mon.ko, en: mon.en, types: mon.types, level: mon.level,
          maxHp: mon.maxHp, hp: mon.hp, atk: mon.atk, def: mon.def, spa: mon.spa,
          spd: mon.spd, spe: mon.spe, bst: mon.bst, catchRate: mon.catchRate,
          moves: mon.moves, art: mon.art, front: mon.front, back: mon.back, exp: 0,
        }];
        app.save.balls = 10;
        saveGame(app.save);
        hidePanel();
        resolve();
      };
    });
  });
  app.mode = "field";
}

function bindInput() {
  const dirs = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    if (dirs[e.key]) {
      e.preventDefault();
      app.keys.add(e.key);
      const [dx, dy] = dirs[e.key];
      tryStep(dx, dy);
    }
  });
  window.addEventListener("keyup", (e) => app.keys.delete(e.key));

  const mapDir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function clearDpad() {
    app.holdDir = null;
    edgePad?.querySelectorAll(".dpad-btn.held").forEach((btn) => btn.classList.remove("held"));
  }

  edgePad?.querySelectorAll(".dpad-btn[data-dir]").forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => {
      if (app.mode !== "field") return;
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      AudioFx.unlock();
      app.holdDir = dir;
      edgePad.querySelectorAll(".dpad-btn.held").forEach((b) => b.classList.remove("held"));
      btn.classList.add("held");
      const [dx, dy] = mapDir[dir];
      tryStep(dx, dy);
    };
    const release = (e) => {
      if (btn.hasPointerCapture?.(e.pointerId)) {
        try { btn.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      if (app.holdDir === dir) clearDpad();
      else btn.classList.remove("held");
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", (e) => {
      // Only clear if this button was the active hold and pointer left without capture
      if (!btn.hasPointerCapture?.(e.pointerId) && app.holdDir === dir) clearDpad();
    });
  });

  btnSound.addEventListener("click", () => {
    AudioFx.unlock();
    app.sound = !app.sound;
    storage.setItem(LS_SOUND, app.sound ? "1" : "0");
    AudioFx.setEnabled(app.sound);
    syncSoundBtn();
    if (app.sound) AudioFx.click();
  });
  btnParty.addEventListener("click", () => { AudioFx.unlock(); AudioFx.ui(); openParty(); });
  btnDex.addEventListener("click", () => { AudioFx.unlock(); AudioFx.ui(); openDex(); });
  btnHelp?.addEventListener("click", () => { AudioFx.unlock(); AudioFx.ui(); openHelp(); });
  btnReset?.addEventListener("click", () => { AudioFx.unlock(); AudioFx.ui(); confirmReset(); });

  window.addEventListener("pointerdown", () => {
    AudioFx.unlock();
  }, { once: true });
  window.addEventListener("keydown", () => {
    AudioFx.unlock();
  }, { once: true });
  window.addEventListener("resize", () => {
    resizeField();
    app.cam.ready = false;
    drawField();
    app.battle3d?.resize();
  });
}

function tick(now) {
  if (app.player && (app.mode === "field" || app.mode === "encounter")) {
    const result = updatePlayer(app.player, now);
    if (result.arrived && app.mode === "field") {
      onTileArrived(result.tileX, result.tileY);
    }
    if (app.mode === "field") {
      const pt = { x: app.player.tx, y: app.player.ty };
      updateWilds(app.wilds, app.map, now, pt);
      const spawned = maintainWildPopulation(app.wilds, app.map, WILD_POOL, now, app.wildCtrl, pt);
      if (spawned > 0) loadWildSprites(app.wilds.filter((w) => !w.sprite));
      maintainFieldLoot(app.fieldLoot, app.map, now, app.lootCtrl, pt);
      app.ballPickups = app.fieldLoot.filter((p) => p.kind === "ball");
    }
    pollMovement();
    drawField(now);
  } else if (app.mode === "field") {
    updateWilds(app.wilds, app.map, now, null);
    maintainWildPopulation(app.wilds, app.map, WILD_POOL, now, app.wildCtrl, null);
    maintainFieldLoot(app.fieldLoot, app.map, now, app.lootCtrl, null);
    drawField(now);
  }
  requestAnimationFrame(tick);
}

async function loadWildSprites(wilds) {
  const ids = [...new Set(wilds.map((w) => w.speciesId))];
  await Promise.all(ids.map((id) => new Promise((res) => {
    if (app.tiles[`wild_${id}`]) {
      res();
      return;
    }
    const img = new Image();
    img.onload = () => {
      app.tiles[`wild_${id}`] = img;
      res();
    };
    img.onerror = () => res();
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  })));
  for (const w of wilds) {
    w.sprite = app.tiles[`wild_${w.speciesId}`] || null;
  }
}

async function main() {
  const built = buildMap();
  app.map = built.map;
  app.patchId = built.patchId || [];
  app.shops = built.shops || [];
  app.patchMeta = built.patchMeta || [];
  app.buildings = built.buildings || [];
  app.npcs = built.npcs || [];
  app.fieldLoot = built.fieldLoot || built.ballPickups || [];
  app.ballPickups = app.fieldLoot.filter((p) => p.kind === "ball");
  app.lootCtrl = {
    nextId: app.fieldLoot.reduce((m, p) => Math.max(m, p.id), 0) + 1,
    nextAt: 0,
  };
  app.wilds = buildWildSpawns(app.map, WILD_POOL);
  app.wildCtrl = {
    nextId: app.wilds.reduce((m, w) => Math.max(m, w.id), 0) + 1,
    nextAt: 0,
  };
  app.spawnX = built.spawnX;
  app.spawnY = built.spawnY;
  app.player = createPlayerState(app.save, app.spawnX, app.spawnY, app.map);
  syncSavePos();
  await loadStaticAssets();
  await loadWildSprites(app.wilds);
  resizeField();
  bindInput();
  AudioFx.setEnabled(app.sound);
  syncSoundBtn();
  syncMoneyHud();
  await setupFlow();
  // Re-bind player after gender/starter in case save changed
  app.player = createPlayerState(app.save, app.spawnX, app.spawnY, app.map);
  app.cam.ready = false;
  setEdgePadEnabled(true);
  syncMoneyHud();
  drawField();
  requestAnimationFrame(tick);
  window.__catch2 = {
    save: () => app.save,
    player: () => app.player,
    mapSize: () => ({ w: MAP_W, h: MAP_H }),
    buildings: () => app.buildings,
    npcs: () => app.npcs,
    balls: () => app.ballPickups,
    loot: () => app.fieldLoot,
    wilds: () => app.wilds,
    tileKeys: () => Object.fromEntries(Object.entries(app.tiles).map(([k, v]) => [k, v ? (v.naturalWidth || v.width || 1) : 0])),
    typeEffect,
    calcDamage,
    catchChance,
    combatPower,
    forceEncounter: startEncounter,
  };
}

main().catch((e) => {
  console.error(e);
  showPanel(`<h2>오류</h2><p>${esc(e.message || e)}</p>`);
});
