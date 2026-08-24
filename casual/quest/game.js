/**
 * 마을 심부름 — small top-down tilemap errand quest.
 * Map data, entities, and game loop all live in this one file (spec allows it).
 * Tile art is borrowed (read-only) from ../catch2/assets/.
 */

const ASSET_BASE = "../catch2/assets/";

const TILE = 32;
const MAP_W = 20;
const MAP_H = 15;
const MOVE_MS = 150;
const TALK_RANGE = 1; // Chebyshev distance to allow talking

const T = { GRASS: 0, PATH: 1, TALL: 2, WATER: 3, TREE: 4, HOUSE: 5 };

/* ---------------------------------------------------------------- map ---- */

function makeGrid() {
  const g = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.GRASS));
  // Border woods
  for (let x = 0; x < MAP_W; x++) { g[0][x] = T.TREE; g[MAP_H - 1][x] = T.TREE; }
  for (let y = 0; y < MAP_H; y++) { g[y][0] = T.TREE; g[y][MAP_W - 1] = T.TREE; }

  // Main crossroads
  for (let y = 1; y < MAP_H - 1; y++) g[y][9] = T.PATH;
  for (let x = 1; x < MAP_W - 1; x++) g[7][x] = T.PATH;

  // Pond (bottom-left)
  for (let y = 10; y <= 12; y++) {
    for (let x = 2; x <= 4; x++) g[y][x] = T.WATER;
  }

  // Tall-grass patches
  for (let y = 2; y <= 3; y++) {
    for (let x = 2; x <= 4; x++) g[y][x] = T.TALL;
  }
  for (let y = 9; y <= 11; y++) {
    for (let x = 13; x <= 16; x++) g[y][x] = T.TALL;
  }

  // Scattered interior trees (obstacles beyond the border)
  for (const [x, y] of [[12, 3], [6, 9], [17, 11], [16, 3]]) g[y][x] = T.TREE;

  // Buildings (single-tile footprint, drawn oversized)
  g[4][4] = T.HOUSE;   // house A — quest giver's home
  g[3][10] = T.HOUSE;  // house B — decorative
  g[4][15] = T.HOUSE;  // shop building

  return g;
}

const grid = makeGrid();

const buildings = [
  { x: 4, y: 4, kind: "houseCottage" },
  { x: 10, y: 3, kind: "houseBlue" },
  { x: 15, y: 4, kind: "shopBuilding" },
];

function walkable(x, y) {
  const t = grid[y]?.[x];
  if (t === undefined) return false;
  return t !== T.WATER && t !== T.TREE && t !== T.HOUSE;
}

/* ------------------------------------------------------------ entities --- */

const npcs = [
  {
    id: "elder",
    name: "마을 아주머니",
    x: 4, y: 6,
    sprite: "femaleDown",
    quest: "delivery",
  },
  {
    id: "shop",
    name: "상점 아저씨",
    x: 15, y: 6,
    sprite: "shopkeep",
    quest: "delivery-target",
  },
  {
    id: "herbalist",
    name: "약초꾼 소년",
    x: 6, y: 11,
    sprite: "maleDown",
    quest: "herbs",
  },
];

const HERB_SPOTS = [
  { x: 14, y: 9 },
  { x: 16, y: 10 },
  { x: 13, y: 11 },
];

const herbs = HERB_SPOTS.map((p, i) => ({ id: i, x: p.x, y: p.y, taken: false }));

/* --------------------------------------------------------------- state --- */

const quest = {
  delivery: "not_started", // not_started -> assigned -> delivered
  herbs: "locked",         // locked -> available -> active -> ready -> complete
  herbsCollected: 0,
  stars: 0,
};

const player = {
  x: 9, y: 11,
  px: 9, py: 11, // rendered (eased) position
  facing: "down",
  moving: false,
  fromX: 9, fromY: 11, toX: 9, toY: 11, t0: 0,
};

function occupiedByNpc(x, y) {
  return npcs.some((n) => n.x === x && n.y === y);
}

/* -------------------------------------------------------------- assets --- */

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const IMG = {
  grass: loadImage(ASSET_BASE + "tiles/grass.png"),
  path: loadImage(ASSET_BASE + "tiles/path.png"),
  tall: loadImage(ASSET_BASE + "tiles/tallgrass.png"),
  water: loadImage(ASSET_BASE + "tiles/water.png"),
  tree: loadImage(ASSET_BASE + "tiles/tree.png"),
  houseCottage: loadImage(ASSET_BASE + "tiles/house-cottage.png"),
  houseBlue: loadImage(ASSET_BASE + "tiles/house-blue.png"),
  shopBuilding: loadImage(ASSET_BASE + "tiles/shop-building.png"),
  maleDown: loadImage(ASSET_BASE + "characters/male-down.png"),
  maleUp: loadImage(ASSET_BASE + "characters/male-up.png"),
  maleSide: loadImage(ASSET_BASE + "characters/male-side.png"),
  femaleDown: loadImage(ASSET_BASE + "characters/female-down.png"),
  shopkeep: loadImage(ASSET_BASE + "characters/shopkeep.png"),
};

function tileImg(t) {
  if (t === T.GRASS) return IMG.grass;
  if (t === T.PATH || t === T.HOUSE) return IMG.path;
  if (t === T.TALL) return IMG.tall;
  if (t === T.WATER) return IMG.water;
  if (t === T.TREE) return IMG.tree;
  return IMG.grass;
}

/* ------------------------------------------------------------- dialogue -- */

function npcLines(npc) {
  if (npc.id === "elder") {
    if (quest.delivery === "not_started") {
      return {
        lines: [
          "어머, 마을에 새 얼굴이네!",
          "부탁이 있는데... 상점 아저씨한테 물약 좀 전해줄 수 있을까?",
          "물약을 챙겼어요. 상점으로 가 보세요!",
        ],
        onDone: () => setDelivery("assigned"),
      };
    }
    if (quest.delivery === "assigned") {
      return { lines: ["상점 아저씨가 저기 오른쪽에 있어요. 물약 좀 전해줘요!"] };
    }
    if (quest.herbs === "locked") {
      return {
        lines: ["물약 전달 고마워요! 마을 일 도와줘서 정말 든든하네."],
        onDone: () => { quest.herbs = "available"; },
      };
    }
    return { lines: ["요즘 마을이 참 평화롭네요. 다 당신 덕분이에요."] };
  }

  if (npc.id === "shop") {
    if (quest.delivery === "assigned") {
      return {
        lines: ["오, 이게 그 물약이군요! 감사합니다.", "자, 이건 답례예요. ⭐"],
        onDone: () => setDelivery("delivered"),
      };
    }
    if (quest.delivery === "not_started") {
      return { lines: ["어서 오세요! 마을 잡화점입니다."] };
    }
    return { lines: ["물약 덕분에 장사가 잘 돼요. 고마워요!"] };
  }

  if (npc.id === "herbalist") {
    if (quest.herbs === "locked") {
      return { lines: ["지금은 좀 바빠요. 다른 일부터 도와주고 오실래요?"] };
    }
    if (quest.herbs === "available") {
      return {
        lines: [
          "저기 풀숲에 반짝이는 약초 3개가 있어요.",
          "그것 좀 모아다 줄 수 있을까요?",
        ],
        onDone: () => { quest.herbs = "active"; },
      };
    }
    if (quest.herbs === "active") {
      return { lines: [`약초를 ${quest.herbsCollected}/3개 모았어요. 풀숲을 찾아보세요!`] };
    }
    if (quest.herbs === "ready") {
      return {
        lines: ["오, 약초 3개 다 모았네요! 정말 고마워요.", "이건 작은 답례예요. ⭐"],
        onDone: () => { quest.herbs = "complete"; quest.stars += 1; updateHud(); maybeShowFinaleToast(); },
      };
    }
    return { lines: ["약초 덕분에 마을이 활기를 찾았어요. 고마워요!"] };
  }

  return { lines: ["..."] };
}

function setDelivery(stage) {
  quest.delivery = stage;
  if (stage === "delivered") {
    quest.stars += 1;
    updateHud();
    maybeShowFinaleToast();
  }
}

function maybeShowFinaleToast() {
  if (quest.delivery === "delivered" && quest.stars >= 1 && quest.herbs !== "complete") {
    showToast("물약 배달 완료! ⭐ 이장님께 다시 가보세요.");
  }
  if (quest.herbs === "complete" && quest.delivery === "delivered") {
    showToast("🎉 마을 심부름을 모두 완료했어요!");
  }
}

/* --------------------------------------------------------------- input --- */

const keys = new Set();
let heldDirBtn = null;
let dialogOpen = false;
let activeDialogue = null; // { lines, idx, onDone }
let activeNpc = null;

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    keys.add(e.key);
  }
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    onTalkPressed();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

function heldDirection() {
  if (heldDirBtn === "up" || keys.has("ArrowUp")) return [0, -1, "up"];
  if (heldDirBtn === "down" || keys.has("ArrowDown")) return [0, 1, "down"];
  if (heldDirBtn === "left" || keys.has("ArrowLeft")) return [-1, 0, "left"];
  if (heldDirBtn === "right" || keys.has("ArrowRight")) return [1, 0, "right"];
  return null;
}

const dpad = document.getElementById("dpad");
dpad.querySelectorAll(".dpad-btn").forEach((btn) => {
  const dir = btn.dataset.dir;
  const start = (e) => { e.preventDefault(); heldDirBtn = dir; };
  const end = (e) => { e.preventDefault(); if (heldDirBtn === dir) heldDirBtn = null; };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointerleave", end);
  btn.addEventListener("pointercancel", end);
});

document.getElementById("talk-btn").addEventListener("click", onTalkPressed);
document.getElementById("dialog-next").addEventListener("click", advanceDialogue);

// Swipe support on the stage for mobile movement
const stage = document.getElementById("stage");
let touchStart = null;
stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".dpad") || e.target.closest(".talk-btn") || e.target.closest(".dialog-box")) return;
  touchStart = { x: e.clientX, y: e.clientY };
});
stage.addEventListener("pointerup", (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 18) return; // treat as tap, not swipe
  if (absX > absY) trySwipeStep(dx > 0 ? 1 : -1, 0);
  else trySwipeStep(0, dy > 0 ? 1 : -1);
});

function trySwipeStep(dx, dy) {
  if (dialogOpen) return;
  beginStep(dx, dy);
}

/* ------------------------------------------------------------ movement --- */

function beginStep(dx, dy) {
  if (player.moving) return false;
  if (dx < 0) player.facing = "left";
  else if (dx > 0) player.facing = "right";
  else if (dy < 0) player.facing = "up";
  else if (dy > 0) player.facing = "down";
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (!walkable(nx, ny)) return false;
  if (occupiedByNpc(nx, ny)) return false;
  player.moving = true;
  player.fromX = player.x;
  player.fromY = player.y;
  player.toX = nx;
  player.toY = ny;
  player.t0 = performance.now();
  player.x = nx;
  player.y = ny;
  return true;
}

function updatePlayer(now) {
  if (!player.moving) {
    player.px = player.x;
    player.py = player.y;
    return;
  }
  const u = Math.min(1, (now - player.t0) / MOVE_MS);
  const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  player.px = player.fromX + (player.toX - player.fromX) * ease;
  player.py = player.fromY + (player.toY - player.fromY) * ease;
  if (u >= 1) {
    player.moving = false;
    player.px = player.x;
    player.py = player.y;
    onArrive(player.x, player.y);
  }
}

function onArrive(x, y) {
  if (quest.herbs === "active") {
    const herb = herbs.find((h) => !h.taken && h.x === x && h.y === y);
    if (herb) {
      herb.taken = true;
      quest.herbsCollected += 1;
      if (quest.herbsCollected >= 3) {
        quest.herbs = "ready";
        showToast("약초 3개를 모두 모았어요! 약초꾼에게 돌아가세요.");
      } else {
        showToast(`약초를 모았어요! (${quest.herbsCollected}/3)`);
      }
      updateHud();
    }
  }
}

/* ------------------------------------------------------------- dialogue -- */

const dialogBox = document.getElementById("dialog-box");
const dialogName = document.getElementById("dialog-name");
const dialogText = document.getElementById("dialog-text");
const talkPrompt = document.getElementById("talk-prompt");
const talkBtn = document.getElementById("talk-btn");

function nearbyNpc() {
  let best = null;
  let bestD = Infinity;
  for (const n of npcs) {
    const d = Math.max(Math.abs(n.x - player.x), Math.abs(n.y - player.y));
    if (d <= TALK_RANGE && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

function onTalkPressed() {
  if (dialogOpen) { advanceDialogue(); return; }
  const npc = nearbyNpc();
  if (!npc) return;
  startDialogue(npc);
}

function startDialogue(npc) {
  const d = npcLines(npc);
  activeNpc = npc;
  activeDialogue = { lines: d.lines, idx: 0, onDone: d.onDone };
  dialogOpen = true;
  dialogBox.hidden = false;
  talkPrompt.hidden = true;
  dialogName.textContent = npc.name;
  dialogText.textContent = activeDialogue.lines[0];
}

function advanceDialogue() {
  if (!activeDialogue) return;
  activeDialogue.idx += 1;
  if (activeDialogue.idx < activeDialogue.lines.length) {
    dialogText.textContent = activeDialogue.lines[activeDialogue.idx];
    return;
  }
  const onDone = activeDialogue.onDone;
  dialogOpen = false;
  dialogBox.hidden = true;
  activeDialogue = null;
  activeNpc = null;
  if (onDone) onDone();
  updateHud();
}

/* ------------------------------------------------------------------ hud -- */

const starCountEl = document.getElementById("star-count");
const questHintEl = document.getElementById("quest-hint");
const toastEl = document.getElementById("toast");
let toastTimer = null;

function updateHud() {
  starCountEl.textContent = String(quest.stars);
  questHintEl.textContent = hintText();
}

function hintText() {
  if (quest.delivery === "not_started") return "마을 아주머니(왼쪽 위 집)와 이야기해 보세요.";
  if (quest.delivery === "assigned") return "물약을 상점 아저씨(오른쪽)에게 전해 주세요.";
  if (quest.herbs === "locked") return "마을 아주머니에게 돌아가 이야기해 보세요.";
  if (quest.herbs === "available") return "약초꾼 소년(왼쪽 아래)을 만나 보세요.";
  if (quest.herbs === "active") return `풀숲에서 약초를 모으세요! (${quest.herbsCollected}/3)`;
  if (quest.herbs === "ready") return "약초꾼 소년에게 돌아가 약초를 전해 주세요.";
  return "🎉 모든 심부름을 완료했어요! 마을을 자유롭게 둘러보세요.";
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

/* --------------------------------------------------------------- render -- */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

function drawTile(x, y) {
  const t = grid[y][x];
  const img = tileImg(t);
  const dx = x * TILE;
  const dy = y * TILE;
  if (img.complete) ctx.drawImage(img, dx, dy, TILE + 0.5, TILE + 0.5);
  ctx.imageSmoothingEnabled = true;
}

function drawBuilding(b) {
  const img = IMG[b.kind];
  const dx = b.x * TILE - TILE * 0.35;
  const dy = b.y * TILE - TILE * 1.1;
  const dw = TILE * 1.7;
  const dh = TILE * 1.9;
  if (img && img.complete) ctx.drawImage(img, dx, dy, dw, dh);
}

function drawHerb(h) {
  if (h.taken) return;
  const cx = h.x * TILE + TILE / 2;
  const cy = h.y * TILE + TILE / 2;
  const bob = Math.sin(performance.now() / 260 + h.id) * 3;
  ctx.font = `${TILE * 0.6}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✿", cx, cy + bob);
}

function drawNpc(n) {
  const img = IMG[n.sprite];
  const dw = TILE * 1.25;
  const dh = TILE * 1.5;
  const dx = n.x * TILE + TILE / 2 - dw / 2;
  const dy = n.y * TILE + TILE - dh;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(dx + dw / 2, n.y * TILE + TILE * 0.92, dw * 0.26, dh * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  if (img && img.complete) ctx.drawImage(img, dx, dy, dw, dh);

  const inRange = Math.max(Math.abs(n.x - player.x), Math.abs(n.y - player.y)) <= TALK_RANGE;
  ctx.font = `800 11px "Noto Sans KR", sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = inRange ? "rgba(230,120,20,0.85)" : "rgba(20,40,10,0.55)";
  ctx.fillStyle = "#fff8d0";
  ctx.strokeText(n.name, dx + dw / 2, dy - 4);
  ctx.fillText(n.name, dx + dw / 2, dy - 4);
}

function drawPlayer() {
  let img = IMG.maleDown;
  let flip = false;
  if (player.facing === "up") img = IMG.maleUp;
  else if (player.facing === "left") { img = IMG.maleSide; flip = true; }
  else if (player.facing === "right") img = IMG.maleSide;

  const dw = TILE * 1.3;
  const dh = TILE * 1.55;
  const cx = player.px * TILE + TILE / 2;
  const footY = player.py * TILE + TILE;

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, footY - TILE * 0.06, dw * 0.28, dh * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, footY - dh);
  if (flip) ctx.scale(-1, 1);
  if (img && img.complete) ctx.drawImage(img, -dw / 2, 0, dw, dh);
  ctx.restore();
}

function render(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) drawTile(x, y);
  }

  for (const h of herbs) drawHerb(h);

  // y-sort buildings, npcs, player for correct overlap
  const sprites = [
    ...buildings.map((b) => ({ kind: "building", y: b.y + 1, ref: b })),
    ...npcs.map((n) => ({ kind: "npc", y: n.y, ref: n })),
    { kind: "player", y: player.py },
  ].sort((a, b) => a.y - b.y);

  for (const s of sprites) {
    if (s.kind === "building") drawBuilding(s.ref);
    else if (s.kind === "npc") drawNpc(s.ref);
    else drawPlayer();
  }
}

/* --------------------------------------------------------------- loop --- */

function tick() {
  const now = performance.now();
  if (!dialogOpen) {
    const dir = heldDirection();
    if (dir && !player.moving) beginStep(dir[0], dir[1]);
  }
  updatePlayer(now);

  const npc = dialogOpen ? null : nearbyNpc();
  talkPrompt.hidden = !npc;
  talkBtn.classList.toggle("is-active", !!npc);

  render(now);
  requestAnimationFrame(tick);
}

updateHud();
requestAnimationFrame(tick);
