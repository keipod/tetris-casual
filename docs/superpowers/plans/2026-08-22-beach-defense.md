# Beach Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Boom Beach–style single-map wave tower defense at `casual/beach-defense/` with isometric Canvas 2.5D, airouter-baked assets, and hub/port wiring.

**Architecture:** Pure game logic (path, placement, combat numbers) lives in small modules testable under Node. `game.js` owns the Canvas loop, UI wiring, and sprites. Assets are baked offline via `tools/generate_assets.py` into `assets/`; placeholders keep the game playable without airouter.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules, no bundler), Canvas 2D, optional `casual/assets/sfx-bank.js`, Python 3 + urllib for airouter bake (`t2i_z_image_turbo_v1`).

**Spec:** `docs/superpowers/specs/2026-08-22-beach-defense-design.md`

## Global Constraints

- Path: `casual/beach-defense/` only for game code; hub + `ports.json` for discovery
- One map, one session, waves 10 (within spec 8–12)
- Defense kinds: `mg` | `cannon` | `mortar`; enemies: `rifle` | `brute` | `tank`
- Isometric Canvas 2.5D only — no Three.js
- No runtime airouter; bake offline; placeholders if bake fails
- Korean UI copy; hub card title `비치 디펜스`
- Mobile touch placement required
- Do not commit unless the user explicitly asks (user rule overrides harness auto-commit)
- Do not touch unrelated dirty/untracked files in the working tree

## File map

| File | Responsibility |
|------|----------------|
| `casual/beach-defense/logic.js` | Pure: grid/iso math, path walk, canPlace, damage ticks (Node-testable) |
| `casual/beach-defense/game.js` | Loop, state, render, input, waves, UI |
| `casual/beach-defense/index.html` | Shell, dock, overlays |
| `casual/beach-defense/style.css` | Boom Beach bright tropical HUD |
| `casual/beach-defense/PRD.md` | Short agent-facing summary synced to spec |
| `casual/beach-defense/tools/generate_assets.py` | airouter t2i bake |
| `casual/beach-defense/assets/*` | Sprites (+ placeholders) |
| `casual/beach-defense/logic.test.mjs` | Node asserts for pure logic |
| `casual/index.html` | Hub card |
| `ports.json` | Port entry |

---

### Task 1: Scaffold + pure placement/path logic

**Files:**
- Create: `casual/beach-defense/logic.js`
- Create: `casual/beach-defense/logic.test.mjs`
- Create: `casual/beach-defense/PRD.md`

**Interfaces:**
- Produces:
  - `export const CELL = 64`
  - `export function isoToScreen(col, row, originX, originY, cell = CELL) → {x,y}`
  - `export function screenToIso(x, y, originX, originY, cell = CELL) → {col, row}` (floored)
  - `export function pathCells(waypoints: [number, number][]) → Set<string>` keys `"c,r"`
  - `export function canPlace(col, row, occupied: Set<string>, path: Set<string>, cols, rows) → boolean`
  - `export function moveAlongPath(dist, waypoints, cell = CELL) → {x,y,done:boolean}` world-ish grid coords along polyline (dist in cell units)
  - `export const MAP = { cols: 10, rows: 12, startGold: 150, startHp: 20, waves: 10, prep: 6, path: [[0,10],[1,10],…] }` — path from left beach toward HQ near top-right grass

- [ ] **Step 1: Write failing tests**

```js
// casual/beach-defense/logic.test.mjs
import assert from "node:assert/strict";
import {
  canPlace,
  pathCells,
  screenToIso,
  isoToScreen,
  moveAlongPath,
  MAP,
} from "./logic.js";

const path = pathCells(MAP.path);
assert.equal(canPlace(MAP.path[0][0], MAP.path[0][1], new Set(), path, MAP.cols, MAP.rows), false);
assert.equal(canPlace(2, 2, new Set(), path, MAP.cols, MAP.rows), true);
assert.equal(canPlace(2, 2, new Set(["2,2"]), path, MAP.cols, MAP.rows), false);
assert.equal(canPlace(-1, 0, new Set(), path, MAP.cols, MAP.rows), false);

const p = isoToScreen(3, 4, 100, 50);
const back = screenToIso(p.x, p.y, 100, 50);
assert.equal(back.col, 3);
assert.equal(back.row, 4);

const mid = moveAlongPath(0, MAP.path);
assert.equal(mid.done, false);
const end = moveAlongPath(9999, MAP.path);
assert.equal(end.done, true);
console.log("logic.test.mjs OK");
```

- [ ] **Step 2: Run test — expect fail**

```bash
node casual/beach-defense/logic.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `./logic.js`

- [ ] **Step 3: Implement `logic.js`**

```js
export const CELL = 64;

export const MAP = {
  cols: 10,
  rows: 12,
  startGold: 150,
  startHp: 20,
  waves: 10,
  prep: 6,
  // Beach (bottom-left) → HQ (top-right area). Adjust cells so path stays in-bounds.
  path: [
    [0, 10], [1, 10], [2, 10], [3, 10], [3, 9], [3, 8], [3, 7],
    [4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4],
    [7, 4], [8, 4], [8, 3], [8, 2], [8, 1],
  ],
  hq: [8, 1],
};

export function isoToScreen(col, row, originX, originY, cell = CELL) {
  return {
    x: originX + (col - row) * (cell / 2),
    y: originY + (col + row) * (cell / 4),
  };
}

export function screenToIso(x, y, originX, originY, cell = CELL) {
  const dx = x - originX;
  const dy = y - originY;
  const col = Math.floor(dx / (cell / 2) / 2 + dy / (cell / 4) / 2);
  const row = Math.floor(dy / (cell / 4) / 2 - dx / (cell / 2) / 2);
  return { col, row };
}

export function pathCells(waypoints) {
  const set = new Set();
  for (const [c, r] of waypoints) set.add(`${c},${r}`);
  return set;
}

export function canPlace(col, row, occupied, path, cols, rows) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  const key = `${col},${row}`;
  if (path.has(key) || occupied.has(key)) return false;
  return true;
}

/** dist in cell-lengths along polyline of grid centers */
export function moveAlongPath(dist, waypoints, cell = CELL) {
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
```

- [ ] **Step 4: Re-run tests — expect pass**

```bash
node casual/beach-defense/logic.test.mjs
```

Expected: `logic.test.mjs OK`

- [ ] **Step 5: Write `PRD.md`** — one-page Korean summary mirroring the design spec (goal, towers, enemies, bake, out of scope). No need to duplicate every table.

- [ ] **Step 6: Commit only if user asked**; otherwise leave unstaged.

---

### Task 2: HTML/CSS shell (Boom Beach HUD)

**Files:**
- Create: `casual/beach-defense/index.html`
- Create: `casual/beach-defense/style.css`

**Interfaces:**
- Consumes: none yet
- Produces DOM ids: `game-canvas`, `gold`, `wave`, `hp`, `banner`, `btn-pause`, `btn-speed`, `btn-sound`, `btn-help`, `.tower-btn[data-kind]`, `#btn-start-wave`, `#overlay`, `#sheet`, `#help`

- [ ] **Step 1: Create `index.html`**

Structure (mirror tower, tropical copy):
- Topbar: 목록 link `../`, title `비치 디펜스`, help / pause / speed / sound
- Main: `<canvas id="game-canvas">`, `#banner`
- Dock: chips 골드 / 웨이브 / HQ, build buttons `mg` `cannon` `mortar` with cost labels 50/80/100, `#btn-start-wave` 「웨이브 시작」
- Sheet: upgrade / sell / close
- Overlay: start / win / lose cards
- Help dialog: short rules in Korean
- Scripts: `../assets/sfx-bank.js` then `type=module` `game.js` (stub ok until Task 3)

- [ ] **Step 2: Create `style.css`**

CSS variables:
```css
:root {
  --sea: #1aa6b7;
  --sea-deep: #0e7c8a;
  --sand: #f6e2b3;
  --grass: #7bc67e;
  --accent: #ffb347;
  --accent-hot: #ff7a18;
  --ink: #1c3d4a;
  --panel: rgba(255, 250, 235, 0.94);
  --stroke: #1c3d4a;
}
```
- Full-viewport app, safe-area padding
- Dock with thick dark stroke, yellow/orange buttons (not purple, not cream-serif cliché)
- Soft sea-to-sky gradient page background behind canvas

- [ ] **Step 3: Visual check**

```bash
# from repo root — use existing serve if up, else:
python3 -c "import http.server; http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=48905)" 
```
Or open via hub port once Task 5 wires it. Until `game.js` exists, use empty module:

```js
// temporary stub in game.js
console.log("beach-defense shell");
```

Verify: layout readable at 390px width, buttons not clipped.

- [ ] **Step 4: Commit only if user asked.**

---

### Task 3: Core game loop (place, waves, combat, win/lose)

**Files:**
- Create: `casual/beach-defense/game.js`
- Modify: `casual/beach-defense/logic.test.mjs` (add damage helper tests if extracted)

**Interfaces:**
- Consumes: all exports from `logic.js`
- Produces runtime state (internal): `{ gold, hp, waveIndex, phase: 'prep'|'combat'|'won'|'lost', towers[], enemies[], projectiles[], selectedKind, speed }`

Balance constants (lock these unless playtest forces change):

```js
const TOWERS = {
  mg:     { name: "기관총", cost: 50,  range: 2.6, cooldown: 0.28, damage: 6,  splash: 0,    projectile: "bullet", speed: 14 },
  cannon: { name: "대포",   cost: 80,  range: 3.0, cooldown: 1.1,  damage: 32, splash: 0.3,  projectile: "shell",  speed: 9 },
  mortar: { name: "박격포", cost: 100, range: 3.4, cooldown: 1.6,  damage: 18, splash: 1.2,  projectile: "arc",    speed: 6 },
};
const UPGRADE_COST_MULT = 0.75; // upgrade cost = floor(baseCost * mult)
const UPGRADE_STAT = 1.35;      // damage & range *= this once

const ENEMIES = {
  rifle: { name: "보병",   hp: 40,  speed: 1.35, gold: 8,  leak: 1 },
  brute: { name: "돌격병", hp: 28,  speed: 1.9,  gold: 7,  leak: 1 },
  tank:  { name: "탱크",   hp: 140, speed: 0.85, gold: 18, leak: 2 },
};

function waveSpec(i) {
  // i = 0..9
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
```

- [ ] **Step 1: Extend tests for upgrade math (pure)**

Add to `logic.js`:
```js
export function upgradeCost(baseCost, mult = 0.75) {
  return Math.floor(baseCost * mult);
}
export function scaledStat(base, level, factor = 1.35) {
  return level <= 0 ? base : base * factor;
}
```
Assert `upgradeCost(80) === 60`, `scaledStat(10, 1) === 13.5`.

- [ ] **Step 2: Implement `game.js` loop**

Must include:
1. Resize canvas to stage-wrap; compute `originX/Y` so MAP fits
2. Draw order: sea fringe → sand/grass tiles → path tiles → towers → enemies → projectiles → FX → HQ
3. Prep phase: place towers on valid grass; range circle preview; `#btn-start-wave` starts combat
4. Combat: spawn enemies with stagger ~0.55s; `moveAlongPath`; towers acquire nearest in range; fire projectiles; splash for mortar; kill → gold; reach end → HQ `-= leak`, remove enemy
5. Wave clear → prep (or win after wave 10); hp ≤ 0 → lose overlay
6. Pause / speed 1×|2×; sound toggle via sfx-bank if present else no-op
7. Tap existing tower → sheet upgrade (once) / sell (60% refund of spent)
8. Placeholder draw if image missing: colored diamond + label

Placeholder asset paths (load with `Image`, onerror keep null):
`assets/island-bg.png`, `assets/hq.png`, `assets/tower-mg.png`, `assets/tower-cannon.png`, `assets/tower-mortar.png`, `assets/enemy-rifle.png`, `assets/enemy-brute.png`, `assets/enemy-tank.png`, `assets/fx-explosion.png`

- [ ] **Step 3: Manual playtest checklist**

Run server, open `/casual/beach-defense/`:
- [ ] Place all 3 tower kinds; cannot place on path/occupied
- [ ] Start wave; enemies walk path; towers shoot
- [ ] Mortar splash hits clustered enemies
- [ ] Leak damages HQ; force lose by letting all through early
- [ ] Clear / cheat gold if needed to confirm win overlay after wave 10 (or temporarily set `MAP.waves = 2` for smoke, then restore to 10)
- [ ] 390px: dock usable; touch place works

- [ ] **Step 4: Commit only if user asked.**

---

### Task 4: airouter asset bake + wire sprites

**Files:**
- Create: `casual/beach-defense/tools/generate_assets.py`
- Create: `casual/beach-defense/assets/` (png outputs)
- Modify: `game.js` only if filenames differ

**Interfaces:**
- Consumes: airouter `POST {AIROUTER}/v1/images/generations` with model `t2i_z_image_turbo_v1`
- Produces files listed below

- [ ] **Step 1: Write `generate_assets.py`**

Copy request/poll patterns from `casual/tower/tools/generate_assets.py` (images only — skip music unless trivial). Use:

```python
AIROUTER = "http://192.168.223.101:20101"
T2I_MODEL = "t2i_z_image_turbo_v1"
STYLE = (
    "boom beach style, tropical island war game, bright sunny colors, "
    "clean game asset sticker, centered, plain pure white background, no text, no UI"
)
IMAGES = {
    "island-bg.png": ("1024x1024", False, "isometric tropical island map background, turquoise sea, white foam, sandy beach, green grass interior, boom beach vibe, no buildings, no characters, fill frame"),
    "hq.png": ("512x512", True, f"{STYLE}, wooden headquarters with red roof, boom beach HQ, front three-quarter"),
    "tower-mg.png": ("512x512", True, f"{STYLE}, small machine gun nest sandbag turret"),
    "tower-cannon.png": ("512x512", True, f"{STYLE}, small coastal cannon turret"),
    "tower-mortar.png": ("512x512", True, f"{STYLE}, small mortar emplacement"),
    "enemy-rifle.png": ("512x512", True, f"{STYLE}, enemy rifle infantry full body walking"),
    "enemy-brute.png": ("512x512", True, f"{STYLE}, bulky rush trooper full body"),
    "enemy-tank.png": ("512x512", True, f"{STYLE}, small landing tank vehicle"),
    "fx-explosion.png": ("512x512", True, f"{STYLE}, cartoon explosion burst orange yellow smoke"),
    "tile-sand.png": ("512x512", False, "seamless sand texture top-down, warm beige, fill frame"),
    "tile-grass.png": ("512x512", False, "seamless bright tropical grass texture top-down, fill frame"),
    "tile-path.png": ("512x512", False, "seamless packed dirt path texture top-down, fill frame"),
}
```

CLI: `python3 tools/generate_assets.py` from `casual/beach-defense/`, or `--dry-run` to print prompts. On HTTP failure: write a 1×1 PNG or skip and leave placeholders (document in stdout).

- [ ] **Step 2: Run bake**

```bash
cd casual/beach-defense && python3 tools/generate_assets.py
```

If airouter unreachable: generate simple canvas/Pillow placeholders (solid color + filename text) so `assets/` is non-empty, then continue.

- [ ] **Step 3: Verify in browser** — sprites appear; missing ones still fall back to diamonds.

- [ ] **Step 4: Commit only if user asked.**

---

### Task 5: Hub + ports + polish polish

**Files:**
- Modify: `casual/index.html` (add card after tower or skyraid)
- Modify: `ports.json` (new port — use `48905` if free)
- Modify: `casual/beach-defense/style.css` / `game.js` for FX polish (muzzle flash particles, wave foam lines)

- [ ] **Step 1: Add hub card**

```html
<a class="game-card" href="beach-defense/">
  <span class="game-icon" aria-hidden="true">🏝️</span>
  <span class="game-title">비치 디펜스</span>
  <span class="game-desc">섬에 상륙하는 적을 포탑으로 막아요</span>
</a>
```

- [ ] **Step 2: Add `ports.json` entry**

```json
{ "id": "beach-defense", "port": 48905, "entry": "/casual/beach-defense/", "name": "비치 디펜스" }
```

Confirm `48905` unused in the file before writing.

- [ ] **Step 3: Polish**

- Sea edge: animated foam sine along bottom-left beach cells
- On fire: brief yellow circle at muzzle; on hit: expand ring using `fx-explosion` or canvas arc
- Win/lose overlay buttons: 「다시하기」 resets state; 「목록」 → `../`

- [ ] **Step 4: Acceptance pass (spec success criteria)**

1. Hub → 비치 디펜스 opens
2. Full session prep → waves → win or lose
3. 3 towers, 3 enemies, 1 upgrade tier feel distinct
4. Tropical Boom Beach palette readable
5. Touch place on mobile width
6. Works offline without airouter (static assets)

```bash
node casual/beach-defense/logic.test.mjs
# browser: play one win path (waves temporarily 2 for smoke if needed, then restore 10)
```

- [ ] **Step 5: Commit only if user asked.**

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Wave TD loop | 3 |
| One map / 8–12 waves (locked 10) | 1, 3 |
| Iso Canvas 2.5D | 2, 3 |
| Towers mg/cannon/mortar | 3 |
| Enemies rifle/brute/tank | 3 |
| Upgrade 1 tier | 3 |
| Boom Beach visuals | 2, 4, 5 |
| airouter bake | 4 |
| No runtime AI | 4 |
| Hub + ports | 5 |
| Mobile touch | 3, 5 |
| Out of scope excluded | all |

## Placeholder / consistency self-review

- No TBD steps; function names match across tasks (`canPlace`, `moveAlongPath`, tower ids `mg|cannon|mortar`)
- Port `48905` verified against current `ports.json` at plan time (highest used was 48904 for tcg)
