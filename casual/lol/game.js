(() => {
  "use strict";

  /* ======================================================================
   * 1. BALANCE — every gameplay number lives here (mirrored in PRD.md)
   * ==================================================================== */
  const BAL = {
    WORLD_W: 2600,
    WORLD_H: 1800,
    VIEW_H: 820,
    LANE_WIDTH: 235,

    WAVE_INTERVAL: 25,
    FIRST_WAVE_AT: 3,

    CHAMP: {
      hp: 620, hpPerLvl: 92,
      mp: 340, mpPerLvl: 38,
      hpRegen: 2.2, hpRegenPerLvl: 0.4,
      mpRegen: 1.6, mpRegenPerLvl: 0.25,
      ad: 60, adPerLvl: 5,
      aspd: 0.85, aspdPerLvl: 0.03,
      range: 155,
      speed: 215,
      radius: 24,
      maxLvl: 9,
      projSpeed: 560,
    },

    FOUNTAIN_HEAL_HP: 0.13,
    FOUNTAIN_HEAL_MP: 0.11,
    FOUNTAIN_RADIUS: 270,

    MINION: {
      melee: { hp: 240, ad: 24, range: 42, speed: 132, aspd: 1.0, gold: 21, xp: 30, radius: 14 },
      ranged: { hp: 165, ad: 30, range: 195, speed: 132, aspd: 0.9, gold: 25, xp: 32, radius: 13 },
      siege: { hp: 520, ad: 48, range: 245, speed: 116, aspd: 0.75, gold: 48, xp: 60, radius: 18 },
      waveScale: 0.04,
      aggroRange: 230,
      projSpeed: 480,
    },

    TURRET: { hp: 1400, ad: 96, range: 330, aspd: 0.9, gold: 200, radius: 32, projSpeed: 640 },
    NEXUS: { hp: 2800, gold: 300, radius: 42 },

    KILL_GOLD: 300,
    KILL_XP_BASE: 120,
    KILL_XP_PER_LVL: 30,
    TRICKLE_GOLD: 2.0,
    XP_SHARE_RADIUS: 820,
    RESPAWN_BASE: 5,
    RESPAWN_PER_LVL: 2,

    SKILLS: {
      q: { name: "발사", mana: 55, cd: 6, range: 860, width: 46, speed: 640, dmgBase: 70, dmgPerLvl: 14 },
      w: { name: "방어막", mana: 65, cd: 14, shieldBase: 90, shieldPerLvl: 22, dur: 3 },
      e: { name: "돌진", mana: 50, cd: 12, dashRange: 430, dashTime: 0.28, boostPct: 0.35, boostDur: 2 },
      r: { name: "폭발", mana: 100, cd: 60, unlockLvl: 6, radius: 265, castRange: 700, dmgBase: 220, dmgPerLvl: 30 },
    },

    AI: {
      thinkInterval: 0.25,
      retreatHpPct: 0.3,
      returnHpPct: 0.7,
      qCastRange: 800,
      rCastRange: 250,
      engageRange: 340,
      rubberMin: 0.85,
      rubberMax: 1.2,
      rubberFactor: 0.06,
      rubberTick: 3,
    },

    ACQUIRE_RANGE: 280,
    MELEE_MAX_RANGE: 60,
  };

  /* ======================================================================
   * 2. LANE GEOMETRY
   * ==================================================================== */
  const BLUE_NEXUS = { x: 360, y: 1440 };
  const RED_NEXUS = { x: 2240, y: 360 };
  const LANE_DX = RED_NEXUS.x - BLUE_NEXUS.x;
  const LANE_DY = RED_NEXUS.y - BLUE_NEXUS.y;
  const LANE_LEN = Math.hypot(LANE_DX, LANE_DY);
  const LANE_UX = LANE_DX / LANE_LEN;
  const LANE_UY = LANE_DY / LANE_LEN;
  const TURRET_T = [0.17, 0.31];

  function lanePoint(t) {
    return { x: BLUE_NEXUS.x + LANE_DX * t, y: BLUE_NEXUS.y + LANE_DY * t };
  }

  const POS = {
    blueFountain: { x: BLUE_NEXUS.x - LANE_UX * 265, y: BLUE_NEXUS.y - LANE_UY * 265 },
    redFountain: { x: RED_NEXUS.x + LANE_UX * 265, y: RED_NEXUS.y + LANE_UY * 265 },
    blueTurrets: TURRET_T.map(lanePoint),
    redTurrets: TURRET_T.map((t) => lanePoint(1 - t)),
  };

  /* ======================================================================
   * 3. HELPERS
   * ==================================================================== */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  const TREES = (() => {
    const rng = mulberry32(20260825);
    const pts = [];
    let guard = 0;
    while (pts.length < 26 && guard++ < 600) {
      const x = 130 + rng() * (BAL.WORLD_W - 260);
      const y = 130 + rng() * (BAL.WORLD_H - 260);
      if (distToSegment(x, y, BLUE_NEXUS.x, BLUE_NEXUS.y, RED_NEXUS.x, RED_NEXUS.y) < 185) continue;
      if (dist({ x, y }, POS.blueFountain) < 220 || dist({ x, y }, POS.redFountain) < 220) continue;
      if (dist({ x, y }, BLUE_NEXUS) < 230 || dist({ x, y }, RED_NEXUS) < 230) continue;
      if (POS.blueTurrets.concat(POS.redTurrets).some((t) => dist({ x, y }, t) < 190)) continue;
      pts.push({ x, y, s: 0.75 + rng() * 0.55 });
    }
    return pts;
  })();

  /* ======================================================================
   * 4. ASSETS — every image guarded by a canvas-drawn fallback
   * ==================================================================== */
  const ASSET_NAMES = [
    "champ-you", "champ-them",
    "minion-melee-blue", "minion-melee-red", "minion-ranged-blue", "minion-ranged-red",
    "tower-blue", "tower-red", "nexus-blue", "nexus-red", "fountain",
    "coin", "skill-q", "skill-w", "skill-e", "skill-r",
    "terrain-lane", "terrain-grass", "tree-deco",
  ];
  const IMG = {};
  let terrainDirty = true;

  function loadImages() {
    ASSET_NAMES.forEach((name) => {
      const rec = { img: new Image(), ok: false };
      rec.img.onload = () => {
        rec.ok = true;
        if (name === "terrain-grass" || name === "terrain-lane" || name === "tree-deco") terrainDirty = true;
      };
      rec.img.onerror = () => { rec.ok = false; };
      rec.img.src = "assets/" + name + ".png";
      IMG[name] = rec;
    });
  }

  const TEAM_BLUE = "#57a9ff";
  const TEAM_RED = "#ff6d6d";
  const teamColor = (team) => (team === 1 ? TEAM_BLUE : TEAM_RED);

  function fbShape(ctx, key, cx, cy, size) {
    const half = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    switch (key) {
      case "champ-you":
      case "champ-them": {
        const col = key === "champ-you" ? TEAM_BLUE : TEAM_RED;
        ctx.fillStyle = col;
        ctx.strokeStyle = "rgba(8,14,26,0.9)";
        ctx.lineWidth = size * 0.07;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = key === "champ-you" ? "rgba(232,182,76,0.95)" : "rgba(30,20,26,0.85)";
        ctx.beginPath();
        ctx.arc(0, -half * 0.12, half * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "minion-melee-blue":
      case "minion-melee-red": {
        ctx.fillStyle = teamColor(key.endsWith("blue") ? 1 : -1);
        ctx.strokeStyle = "rgba(8,14,26,0.85)";
        ctx.lineWidth = size * 0.09;
        const r = half * 0.62;
        ctx.beginPath();
        ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.4);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "minion-ranged-blue":
      case "minion-ranged-red": {
        ctx.fillStyle = teamColor(key.endsWith("blue") ? 1 : -1);
        ctx.strokeStyle = "rgba(8,14,26,0.85)";
        ctx.lineWidth = size * 0.09;
        ctx.beginPath();
        ctx.moveTo(0, -half * 0.72);
        ctx.lineTo(half * 0.62, half * 0.52);
        ctx.lineTo(-half * 0.62, half * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "tower-blue":
      case "tower-red": {
        const col = key === "tower-blue" ? TEAM_BLUE : TEAM_RED;
        ctx.fillStyle = "#3a4356";
        ctx.strokeStyle = "rgba(8,14,26,0.9)";
        ctx.lineWidth = size * 0.05;
        ctx.beginPath();
        ctx.roundRect(-half * 0.42, -half * 0.95, half * 0.84, half * 1.9, half * 0.12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(i * half * 0.5 - half * 0.14, -half * 1.08, half * 0.28, half * 0.28);
        }
        ctx.beginPath();
        ctx.arc(0, -half * 0.45, half * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "nexus-blue":
      case "nexus-red": {
        const col = key === "nexus-blue" ? TEAM_BLUE : TEAM_RED;
        ctx.fillStyle = col;
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = size * 0.05;
        ctx.beginPath();
        ctx.moveTo(0, -half * 0.9);
        ctx.lineTo(half * 0.62, 0);
        ctx.lineTo(0, half * 0.9);
        ctx.lineTo(-half * 0.62, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(0, -half * 0.4);
        ctx.lineTo(half * 0.26, 0);
        ctx.lineTo(0, half * 0.4);
        ctx.lineTo(-half * 0.26, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "fountain": {
        ctx.strokeStyle = "rgba(232,182,76,0.9)";
        ctx.lineWidth = size * 0.06;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(232,182,76,0.28)";
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.55, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "coin": {
        ctx.fillStyle = "#ffd97a";
        ctx.strokeStyle = "#8a651c";
        ctx.lineWidth = size * 0.08;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#8a651c";
        ctx.font = "bold " + Math.round(size * 0.7) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("G", 0, size * 0.03);
        break;
      }
      case "tree-deco": {
        ctx.fillStyle = "rgba(10,20,14,0.4)";
        ctx.beginPath();
        ctx.ellipse(0, half * 0.7, half * 0.5, half * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2f6b3a";
        ctx.strokeStyle = "rgba(10,24,14,0.9)";
        ctx.lineWidth = size * 0.05;
        for (let i = 0; i < 3; i++) {
          const ty = half * 0.55 - i * half * 0.5;
          const tw = half * (0.72 - i * 0.18);
          ctx.beginPath();
          ctx.moveTo(0, ty - half * 0.62);
          ctx.lineTo(tw, ty);
          ctx.lineTo(-tw, ty);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      default: {
        if (key.startsWith("skill-")) {
          const letter = key.slice(6).toUpperCase();
          ctx.fillStyle = "#16263f";
          ctx.strokeStyle = "#e8b64c";
          ctx.lineWidth = size * 0.06;
          ctx.beginPath();
          ctx.roundRect(-half * 0.86, -half * 0.86, half * 1.72, half * 1.72, half * 0.24);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#ffd97a";
          ctx.font = "bold " + Math.round(size * 0.72) + "px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(letter, 0, size * 0.04);
        } else {
          ctx.fillStyle = "#57a9ff";
          ctx.beginPath();
          ctx.arc(0, 0, half * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  const fbUrlCache = new Map();
  function fbDataUrl(key, px) {
    const size = px || 96;
    const cacheKey = key + "@" + size;
    if (fbUrlCache.has(cacheKey)) return fbUrlCache.get(cacheKey);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    fbShape(c.getContext("2d"), key, size / 2, size / 2, size);
    const url = c.toDataURL("image/png");
    fbUrlCache.set(cacheKey, url);
    return url;
  }

  function bindDomFallbacks(root) {
    (root || document).querySelectorAll("img[data-fb]").forEach((el) => {
      el.addEventListener("error", () => {
        if (el.dataset.fbDone) return;
        el.dataset.fbDone = "1";
        el.src = fbDataUrl(el.dataset.fb, 96);
      });
    });
  }

  /* ======================================================================
   * 5. SOUND — shared CasualSfx bank with spatial + rate gating
   * ==================================================================== */
  const LS_SOUND = "lol_sound";
  const storage = (() => {
    try {
      localStorage.setItem("__l", "1");
      localStorage.removeItem("__l");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();
  let soundOn = storage.getItem(LS_SOUND) !== "0";

  const SFX = (() => {
    const last = Object.create(null);
    const gate = (key, gap) => {
      const now = world ? world.time : 0;
      if (last[key] != null && now - last[key] < gap) return false;
      last[key] = now;
      return true;
    };
    const play = (role, vol) => {
      if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol);
    };
    const audible = (x, y) => {
      if (!world) return false;
      return Math.hypot(x - cam.x - view.w / 2, y - cam.y - BAL.VIEW_H / 2) < 1050;
    };
    return {
      init: () => { if (window.CasualSfx) window.CasualSfx.unlock(); },
      ui: () => play("click", 0.5),
      tick: () => { if (gate("tick", 0.08)) play("clickSoft", 0.35); },
      hit: (x, y) => { if (audible(x, y) && gate("hit", 0.07)) play("hit", 0.38); },
      shoot: (x, y) => { if (audible(x, y) && gate("shoot", 0.06)) play("shoot", 0.3); },
      pickup: () => play("pickup", 0.5),
      spawnWave: () => play("spawn", 0.45),
      warn: () => { if (gate("warn", 1.4)) play("warn", 0.6); },
      fail: () => play("fail", 0.5),
      lock: () => play("lock", 0.55),
      whoosh: () => play("whoosh", 0.55),
      power: () => play("power", 0.55),
      level: () => play("level", 0.6),
      explode: (x, y) => { if (audible(x, y)) play("explode", 0.7); },
      death: (x, y) => { if (audible(x, y)) play("bigHit", 0.6); },
      win: () => { if (window.CasualSfx) window.CasualSfx.playSeq(["clear", "special", "win"], 110); },
      lose: () => play("lose"),
    };
  })();

  /* ======================================================================
   * 6. DOM + GLOBAL STATE
   * ==================================================================== */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stageFrame = document.querySelector(".stage-frame");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const skillsEl = document.getElementById("hud-skills");
  const portraitImg = document.getElementById("portrait-img");
  const lvlBadge = document.getElementById("lvl-badge");
  const barHp = document.getElementById("bar-hp");
  const barMp = document.getElementById("bar-mp");
  const hpText = document.getElementById("hp-text");
  const mpText = document.getElementById("mp-text");
  const respawnBanner = document.getElementById("respawn-banner");
  const respawnTime = document.getElementById("respawn-time");
  const hpYouEl = document.getElementById("hp-you");
  const hpThemEl = document.getElementById("hp-them");
  const goldEl = document.getElementById("gold");
  const csEl = document.getElementById("cs");
  const btnSound = document.getElementById("btn-sound");
  const btnHelp = document.getElementById("btn-help");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnHelpOk = document.getElementById("btn-help-ok");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let world = null;
  let playing = false;
  let helpOpen = false;
  let paused = false;
  let lastTs = 0;
  let pendingAttackMove = false;

  const cam = { x: 0, y: 0 };
  const view = { w: 100, h: BAL.VIEW_H, scale: 1, cssW: 1, cssH: 1 };
  const mouse = { sx: 0, sy: 0 };
  let shakeT = 0;
  let shakeMag = 0;

  const SKILL_ORDER = ["q", "w", "e", "r"];
  const skillEls = {};

  function cursorWorld() {
    return {
      x: cam.x + mouse.sx / view.scale,
      y: cam.y + mouse.sy / view.scale,
    };
  }

  function shake(mag) {
    if (reducedMotion) return;
    shakeMag = Math.max(shakeMag, mag);
    shakeT = 0.32;
  }

  /* ======================================================================
   * 7. WORLD + ENTITY FACTORIES
   * ==================================================================== */
  let uidSeq = 0;

  function createChamp(team, isPlayer) {
    const f = team === 1 ? POS.blueFountain : POS.redFountain;
    const c = {
      uid: ++uidSeq,
      kind: "champ",
      team,
      isPlayer,
      x: f.x,
      y: f.y,
      radius: BAL.CHAMP.radius,
      alive: true,
      facing: team === 1 ? Math.atan2(LANE_UY, LANE_UX) : Math.atan2(-LANE_UY, -LANE_UX),
      level: 1,
      xp: 0,
      gold: 0,
      cs: 0,
      statMul: 1,
      maxHp: 1, hp: 1, maxMp: 1, mp: 1,
      ad: 0, aspd: 0, hpRegen: 0, mpRegen: 0,
      atkCd: 0,
      range: BAL.CHAMP.range,
      speed: BAL.CHAMP.speed,
      shield: 0,
      shieldT: 0,
      boostT: 0,
      hurtT: 0,
      warnT: 0,
      scanCd: 0,
      dash: null,
      moveGoal: null,
      attackTarget: null,
      cds: { q: 0, w: 0, e: 0, r: 0 },
      respawnT: 0,
      state: "push",
      lastDamagedAt: -99,
      aiThinkCd: 0,
      rubberCd: 0,
    };
    setChampStats(c);
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    return c;
  }

  function setChampStats(c) {
    const B = BAL.CHAMP;
    const m = c.statMul || 1;
    const L = c.level - 1;
    const nMaxHp = Math.round((B.hp + B.hpPerLvl * L) * m);
    const nMaxMp = Math.round((B.mp + B.mpPerLvl * L) * m);
    const dHp = nMaxHp - c.maxHp;
    const dMp = nMaxMp - c.maxMp;
    c.maxHp = nMaxHp;
    c.maxMp = nMaxMp;
    if (dHp > 0) c.hp += dHp;
    if (dMp > 0) c.mp += dMp;
    c.hp = Math.min(c.hp, c.maxHp);
    c.mp = Math.min(c.mp, c.maxMp);
    c.ad = (B.ad + B.adPerLvl * L) * m;
    c.aspd = B.aspd + B.aspdPerLvl * L;
    c.hpRegen = B.hpRegen + B.hpRegenPerLvl * L;
    c.mpRegen = B.mpRegen + B.mpRegenPerLvl * L;
  }

  const xpNeed = (level) => 150 + 90 * (level - 1);

  function gainXp(c, amt) {
    if (!c.alive || c.level >= BAL.CHAMP.maxLvl) return;
    c.xp += amt;
    while (c.level < BAL.CHAMP.maxLvl && c.xp >= xpNeed(c.level)) {
      c.xp -= xpNeed(c.level);
      c.level += 1;
      onLevelUp(c);
    }
  }

  function onLevelUp(c) {
    setChampStats(c);
    addFx({ type: "levelup", x: c.x, y: c.y, t: 0, dur: 0.7 });
    if (c.isPlayer) {
      SFX.level();
      addFloater(c.x, c.y - 56, "레벨 업!", "#ffd97a");
    }
  }

  function createMinion(team, type, waveNum, slotIdx, total) {
    const def = BAL.MINION[type];
    const nexus = team === 1 ? BLUE_NEXUS : RED_NEXUS;
    const perpX = -LANE_UY, perpY = LANE_UX;
    const spread = (slotIdx - (total - 1) / 2) * 34;
    const back = type === "siege" ? 70 : 26;
    const mult = 1 + BAL.MINION.waveScale * (waveNum - 1);
    return {
      uid: ++uidSeq,
      kind: "minion",
      mtype: type,
      team,
      x: nexus.x - LANE_UX * back + perpX * spread,
      y: nexus.y - LANE_UY * back + perpY * spread,
      radius: def.radius,
      alive: true,
      facing: team === 1 ? Math.atan2(LANE_UY, LANE_UX) : Math.atan2(-LANE_UY, -LANE_UX),
      hp: Math.round(def.hp * mult),
      maxHp: Math.round(def.hp * mult),
      ad: Math.round(def.ad * mult),
      aspd: def.aspd,
      atkCd: 0,
      range: def.range,
      speed: def.speed,
      gold: def.gold,
      xp: def.xp,
      target: null,
      scanCd: 0,
      moving: true,
      projSpeed: BAL.MINION.projSpeed,
    };
  }

  function createTurret(team, idx) {
    const p = (team === 1 ? POS.blueTurrets : POS.redTurrets)[idx];
    return {
      uid: ++uidSeq,
      kind: "turret",
      team,
      x: p.x,
      y: p.y,
      radius: BAL.TURRET.radius,
      alive: true,
      hp: BAL.TURRET.hp,
      maxHp: BAL.TURRET.hp,
      ad: BAL.TURRET.ad,
      aspd: BAL.TURRET.aspd,
      atkCd: 0,
      range: BAL.TURRET.range,
      target: null,
      projSpeed: BAL.TURRET.projSpeed,
    };
  }

  function createNexus(team) {
    const p = team === 1 ? BLUE_NEXUS : RED_NEXUS;
    return {
      uid: ++uidSeq,
      kind: "nexus",
      team,
      x: p.x,
      y: p.y,
      radius: BAL.NEXUS.radius,
      alive: true,
      hp: BAL.NEXUS.hp,
      maxHp: BAL.NEXUS.hp,
      invuln: true,
      _invMsgT: -99,
    };
  }

  function createWorld() {
    uidSeq = 0;
    const units = [];
    const structures = [];
    const player = createChamp(1, true);
    const aiChamp = createChamp(-1, false);
    units.push(player, aiChamp);
    [1, -1].forEach((team) => {
      for (let i = 0; i < 2; i++) structures.push(createTurret(team, i));
      structures.push(createNexus(team));
    });
    recomputeNexusInvuln(structures);
    const w = {
      time: 0,
      units,
      structures,
      projectiles: [],
      effects: [],
      floaters: [],
      player,
      aiChamp,
      waveNum: 0,
      waveTimer: BAL.FIRST_WAVE_AT,
      over: null,
      overDone: false,
    };
    cam.x = clamp(player.x - view.w / 2, 0, Math.max(0, BAL.WORLD_W - view.w));
    cam.y = clamp(player.y - BAL.VIEW_H / 2, 0, Math.max(0, BAL.WORLD_H - BAL.VIEW_H));
    return w;
  }

  function recomputeNexusInvuln(structures) {
    structures.forEach((s) => {
      if (s.kind !== "nexus") return;
      s.invuln = structures.some((t) => t.kind === "turret" && t.team === s.team && t.alive);
    });
  }

  const fountainOf = (team) => (team === 1 ? POS.blueFountain : POS.redFountain);
  const enemiesOf = (team) =>
    world.units.filter((u) => u.alive && u.team !== team)
      .concat(world.structures.filter((s) => s.alive && !s.invuln && s.team !== team));

  /* ======================================================================
   * 8. FX
   * ==================================================================== */
  function addFx(fx) { world.effects.push(fx); }
  function addFloater(x, y, text, color) { world.floaters.push({ x, y, text, color, t: 0 }); }

  function fxSlash(x, y, ang) {
    if (reducedMotion) return;
    addFx({ type: "slash", x, y, ang, t: 0, dur: 0.18 });
  }
  function fxSpark(x, y, color) {
    if (reducedMotion) return;
    addFx({ type: "spark", x, y, color: color || "#ffe9b0", t: 0, dur: 0.22 });
  }
  function fxBurst(x, y, color) {
    if (reducedMotion) return;
    const parts = [];
    for (let i = 0; i < 10; i++) parts.push({ a: Math.random() * Math.PI * 2, sp: 60 + Math.random() * 130 });
    addFx({ type: "burst", x, y, color, parts, t: 0, dur: 0.45 });
  }
  function fxExplosion(x, y, radius) {
    if (reducedMotion) return;
    const parts = [];
    for (let i = 0; i < 26; i++) parts.push({ a: Math.random() * Math.PI * 2, sp: 120 + Math.random() * 320 });
    addFx({ type: "explosion", x, y, radius, parts, t: 0, dur: 0.55 });
  }
  function fxRing(x, y, radius, color) {
    if (reducedMotion) return;
    addFx({ type: "ring", x, y, radius, color, t: 0, dur: 0.4 });
  }
  function fxPing(x, y, color) {
    if (reducedMotion) return;
    addFx({ type: "ping", x, y, color, t: 0, dur: 0.5 });
  }

  /* ======================================================================
   * 9. COMBAT
   * ==================================================================== */
  function isValidTarget(t) {
    return !!t && t.alive && !(t.kind === "nexus" && t.invuln);
  }

  function performAttack(u, tgt) {
    u.atkCd = 1 / Math.max(0.2, u.aspd);
    u.facing = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    if (u.range > BAL.MELEE_MAX_RANGE) {
      world.projectiles.push({
        kind: "auto",
        owner: u,
        team: u.team,
        x: u.x,
        y: u.y - 8,
        target: tgt,
        speed: u.projSpeed || 520,
        dmg: u.ad,
        heavy: u.kind === "turret",
        dead: false,
      });
      SFX.shoot(u.x, u.y);
    } else {
      dealDamage(u, tgt, u.ad);
      fxSlash(tgt.x, tgt.y, u.facing);
      SFX.hit(tgt.x, tgt.y);
    }
  }

  function dealDamage(src, tgt, amount) {
    if (!tgt || !tgt.alive) return;
    if (tgt.invuln) {
      if (world.time - (tgt._invMsgT || -99) > 1.2) {
        tgt._invMsgT = world.time;
        addFloater(tgt.x, tgt.y - 54, "보호막 중", "#9fd0ff");
      }
      return;
    }
    let dmg = amount;
    if (tgt.shield > 0) {
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      fxSpark(tgt.x, tgt.y - 10, "#dff1ff");
      if (dmg <= 0.01) {
        tgt.lastDamagedAt = world.time;
        return;
      }
    }
    tgt.hp -= dmg;
    tgt.lastDamagedAt = world.time;
    tgt.hurtT = 0.16;
    if (tgt.isPlayer && dmg >= 45) shake(4);
    if (tgt.hp <= 0) {
      tgt.hp = 0;
      die(tgt, src);
    }
  }

  function shareXp(team, x, y, amt) {
    world.units.forEach((c) => {
      if (c.kind === "champ" && c.team === team && c.alive && dist(c, { x, y }) <= BAL.XP_SHARE_RADIUS) {
        gainXp(c, amt);
      }
    });
  }

  function die(u, src) {
    if (!u.alive) return;
    u.alive = false;
    u.target = null;
    u.attackTarget = null;
    u.moveGoal = null;
    const col = teamColor(u.team);
    fxBurst(u.x, u.y, col);

    if (u.kind === "minion") {
      if (src && src.kind === "champ") {
        src.gold += u.gold;
        if (src.isPlayer) {
          src.cs += 1;
          addFloater(u.x, u.y - 30, "+" + u.gold + " G", "#ffd97a");
          SFX.pickup();
        }
      }
      shareXp(u.team === 1 ? -1 : 1, u.x, u.y, u.xp);
      SFX.death(u.x, u.y);
    } else if (u.kind === "champ") {
      champDeath(u, src);
    } else if (u.kind === "turret") {
      const winner = u.team === 1 ? world.aiChamp : world.player;
      winner.gold += BAL.TURRET.gold;
      if (!u.team || u.team === -1) {
        addFloater(u.x, u.y - 60, "포탑 파괴! +" + BAL.TURRET.gold + " G", "#ffd97a");
      }
      recomputeNexusInvuln(world.structures);
      shake(6);
      SFX.explode(u.x, u.y);
    } else if (u.kind === "nexus") {
      world.over = u.team === -1 ? "win" : "lose";
      shake(10);
      SFX.explode(u.x, u.y);
    }
  }

  function champDeath(u, src) {
    const killer = src && src.kind === "champ" ? src : null;
    if (killer) {
      killer.gold += BAL.KILL_GOLD;
      if (killer.isPlayer) addFloater(u.x, u.y - 46, "처치! +" + BAL.KILL_GOLD + " G", "#ffd97a");
    }
    shareXp(u.team === 1 ? -1 : 1, u.x, u.y, BAL.KILL_XP_BASE + BAL.KILL_XP_PER_LVL * u.level);
    u.respawnT = BAL.RESPAWN_BASE + BAL.RESPAWN_PER_LVL * u.level;
    u.shield = 0;
    u.shieldT = 0;
    u.dash = null;
    u.boostT = 0;
    u.cds = { q: 0, w: 0, e: 0, r: 0 };
    if (u.isPlayer) {
      respawnBanner.classList.remove("hidden");
      SFX.death(u.x, u.y);
      shake(7);
    } else {
      SFX.explode(u.x, u.y);
    }
  }

  function reviveChamp(c) {
    const f = fountainOf(c.team);
    c.alive = true;
    c.x = f.x;
    c.y = f.y;
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    c.state = "push";
    fxRing(c.x, c.y, 60, teamColor(c.team));
    SFX.spawnWave();
    if (c.isPlayer) respawnBanner.classList.add("hidden");
  }

  /* ======================================================================
   * 10. PROJECTILES
   * ==================================================================== */
  function updateProjectiles(dt) {
    const list = world.projectiles;
    for (const p of list) {
      if (p.dead) continue;
      if (p.kind === "auto") {
        const t = p.target;
        if (t && t.alive) {
          const ang = Math.atan2(t.y - p.y, t.x - p.x);
          p.vx = Math.cos(ang) * p.speed;
          p.vy = Math.sin(ang) * p.speed;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.traveled = (p.traveled || 0) + p.speed * dt;
        const hitR = t ? t.radius + 8 : 12;
        const reached = !t || !t.alive
          ? p.traveled > 400
          : Math.hypot(t.x - p.x, t.y - p.y) <= hitR;
        if (reached) {
          p.dead = true;
          if (t && t.alive) {
            dealDamage(p.owner, t, p.dmg);
            fxSpark(t.x, t.y - 8, p.heavy ? "#ffb36b" : "#ffe9b0");
            SFX.hit(t.x, t.y);
          }
        } else if (p.traveled > 900) {
          p.dead = true;
        }
      } else if (p.kind === "skill-q") {
        const step = p.speed * dt;
        p.x += p.nx * step;
        p.y += p.ny * step;
        p.traveled += step;
        enemiesOf(p.team).forEach((e) => {
          if (p.dead || p.hitSet.has(e.uid)) return;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= p.width / 2 + e.radius) {
            p.hitSet.add(e.uid);
            dealDamage(p.owner, e, p.dmg);
            fxSpark(e.x, e.y - 8, "#9fe8ff");
            SFX.hit(e.x, e.y);
          }
        });
        if (p.traveled >= p.range) p.dead = true;
      }
    }
    world.projectiles = list.filter((p) => !p.dead);
  }

  /* ======================================================================
   * 11. SKILLS
   * ==================================================================== */
  function tryCast(c, key, aimX, aimY) {
    if (!c.alive || !world || world.over) return false;
    const S = BAL.SKILLS[key];
    if (key === "r" && c.level < S.unlockLvl) {
      if (c.isPlayer) {
        SFX.lock();
        addFloater(c.x, c.y - 52, "Lv." + S.unlockLvl + " 해금", "#ffb0b0");
      }
      return false;
    }
    if ((c.cds[key] || 0) > 0) {
      if (c.isPlayer) SFX.fail();
      return false;
    }
    if (c.mp < S.mana) {
      if (c.isPlayer) {
        SFX.fail();
        addFloater(c.x, c.y - 52, "마나 부족", "#9fc0ff");
      }
      return false;
    }
    c.mp -= S.mana;
    c.cds[key] = S.cd;
    if (key === "q") castQ(c, aimX, aimY);
    else if (key === "w") castW(c);
    else if (key === "e") castE(c, aimX, aimY);
    else if (key === "r") castR(c, aimX, aimY);
    return true;
  }

  function castQ(c, aimX, aimY) {
    const S = BAL.SKILLS.q;
    let dx = aimX - c.x, dy = aimY - c.y;
    let l = Math.hypot(dx, dy);
    if (l < 1) { dx = Math.cos(c.facing); dy = Math.sin(c.facing); l = 1; }
    const nx = dx / l, ny = dy / l;
    c.facing = Math.atan2(ny, nx);
    world.projectiles.push({
      kind: "skill-q",
      owner: c,
      team: c.team,
      x: c.x + nx * 20,
      y: c.y + ny * 20,
      nx, ny,
      speed: S.speed,
      width: S.width,
      range: S.range,
      dmg: S.dmgBase + S.dmgPerLvl * c.level,
      traveled: 0,
      hitSet: new Set(),
      dead: false,
    });
    fxRing(c.x, c.y, 34, "#9fe8ff");
    SFX.shoot(c.x, c.y);
  }

  function castW(c) {
    const S = BAL.SKILLS.w;
    c.shield = S.shieldBase + S.shieldPerLvl * c.level;
    c.shieldT = S.dur;
    fxRing(c.x, c.y, 48, "#dff1ff");
    SFX.power();
  }

  function castE(c, aimX, aimY) {
    const S = BAL.SKILLS.e;
    let dx = aimX - c.x, dy = aimY - c.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) { dx = Math.cos(c.facing); dy = Math.sin(c.facing); }
    else { dx /= l; dy /= l; }
    const d = Math.min(l < 1 ? S.dashRange : l, S.dashRange);
    const tx = clamp(c.x + dx * d, 40, BAL.WORLD_W - 40);
    const ty = clamp(c.y + dy * d, 40, BAL.WORLD_H - 40);
    c.dash = { sx: c.x, sy: c.y, tx, ty, t: 0, dur: S.dashTime };
    c.boostT = S.boostDur;
    c.facing = Math.atan2(dy, dx);
    SFX.whoosh();
  }

  function castR(c, aimX, aimY) {
    const S = BAL.SKILLS.r;
    let dx = aimX - c.x, dy = aimY - c.y;
    const l = Math.hypot(dx, dy);
    const d = Math.min(l, S.castRange);
    const cx = l < 1 ? c.x : c.x + (dx / l) * d;
    const cy = l < 1 ? c.y : c.y + (dy / l) * d;
    const dmg = S.dmgBase + S.dmgPerLvl * c.level;
    fxExplosion(cx, cy, S.radius);
    shake(9);
    SFX.explode(cx, cy);
    enemiesOf(c.team).forEach((e) => {
      if (Math.hypot(e.x - cx, e.y - cy) <= S.radius + e.radius) dealDamage(c, e, dmg);
    });
  }

  /* ======================================================================
   * 12. UNIT UPDATES
   * ==================================================================== */
  function stepToward(u, tx, ty, stepLen) {
    const dx = tx - u.x, dy = ty - u.y;
    const l = Math.hypot(dx, dy);
    if (l <= stepLen || l < 0.001) {
      u.x = tx; u.y = ty;
      return;
    }
    u.x += (dx / l) * stepLen;
    u.y += (dy / l) * stepLen;
    u.facing = Math.atan2(dy, dx);
  }

  function effSpeed(u) {
    return u.speed * (u.boostT > 0 ? 1 + BAL.SKILLS.e.boostPct : 1);
  }

  function nearestEnemyIn(u, range, filter) {
    let best = null, bestD = Infinity;
    enemiesOf(u.team).forEach((e) => {
      if (filter && !filter(e)) return;
      const d = dist(u, e) - e.radius;
      if (d <= range && d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  function acquireForMinion(m) {
    let best = null, bestD = Infinity;
    enemiesOf(m.team).forEach((e) => {
      const prio = e.kind === "champ" ? 90 : 0;
      const d = dist(m, e) - e.radius + prio;
      if (d <= BAL.MINION.aggroRange && d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  function updateChamp(u, dt) {
    u.atkCd -= dt;
    u.scanCd -= dt;
    u.hurtT = Math.max(0, u.hurtT - dt);
    u.warnT = Math.max(0, u.warnT - dt);
    SKILL_ORDER.forEach((k) => { u.cds[k] = Math.max(0, u.cds[k] - dt); });
    if (u.shieldT > 0) {
      u.shieldT -= dt;
      if (u.shieldT <= 0) u.shield = 0;
    }
    u.boostT = Math.max(0, u.boostT - dt);

    if (!u.alive) {
      u.respawnT -= dt;
      if (u.isPlayer) respawnTime.textContent = "부활까지 " + Math.ceil(Math.max(0, u.respawnT)) + "초";
      if (u.respawnT <= 0) reviveChamp(u);
      return;
    }

    if (u.dash) {
      const d = u.dash;
      d.t += dt;
      const p = clamp(d.t / d.dur, 0, 1);
      u.x = lerp(d.sx, d.tx, p);
      u.y = lerp(d.sy, d.ty, p);
      if (reducedMotion !== true && Math.random() < 0.6) {
        addFx({ type: "spark", x: u.x, y: u.y, color: "#bfe0ff", t: 0, dur: 0.2 });
      }
      if (p >= 1) u.dash = null;
      return;
    }

    if (u.attackTarget && !isValidTarget(u.attackTarget)) u.attackTarget = null;
    if (!u.attackTarget && !u.moveGoal && u.isPlayer && u.scanCd <= 0) {
      u.attackTarget = nearestEnemyIn(u, u.range + 24);
      u.scanCd = 0.2;
    }

    if (u.attackTarget) {
      const t = u.attackTarget;
      const gap = dist(u, t) - t.radius - u.radius;
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (gap <= u.range) {
        if (u.atkCd <= 0) performAttack(u, t);
      } else {
        stepToward(u, t.x, t.y, effSpeed(u) * dt);
      }
      return;
    }

    if (u.moveGoal) {
      const g = u.moveGoal;
      if (g.attackMove && u.scanCd <= 0) {
        const found = nearestEnemyIn(u, BAL.ACQUIRE_RANGE);
        u.scanCd = 0.15;
        if (found) u.attackTarget = found;
      }
      if (!u.attackTarget) {
        if (dist(u, g) < 10) {
          if (!g.attackMove) u.moveGoal = null;
        } else {
          stepToward(u, g.x, g.y, effSpeed(u) * dt);
        }
      }
    }
  }

  function updateMinion(m, dt) {
    m.atkCd -= dt;
    m.scanCd -= dt;
    if (m.target && !isValidTarget(m.target)) m.target = null;
    if (m.target && dist(m, m.target) > BAL.MINION.aggroRange * 2.4) m.target = null;
    if (!m.target && m.scanCd <= 0) {
      m.target = acquireForMinion(m);
      m.scanCd = 0.2;
    }
    if (m.target) {
      const t = m.target;
      const gap = dist(m, t) - t.radius - m.radius;
      m.facing = Math.atan2(t.y - m.y, t.x - m.x);
      if (gap <= m.range) {
        if (m.atkCd <= 0) performAttack(m, t);
      } else {
        stepToward(m, t.x, t.y, m.speed * dt);
      }
      return;
    }
    const goal = m.team === 1 ? RED_NEXUS : BLUE_NEXUS;
    stepToward(m, goal.x, goal.y, m.speed * dt);
  }

  function updateTurret(t, dt) {
    if (!t.alive) return;
    t.atkCd -= dt;
    if (t.target && (!t.target.alive || dist(t, t.target) - t.target.radius > t.range)) {
      t.target = null;
    }
    if (!t.target) {
      let best = null, bestD = Infinity;
      world.units.forEach((u) => {
        if (!u.alive || u.team === t.team) return;
        const d = dist(t, u) - u.radius;
        if (d > t.range) return;
        const prio = u.kind === "champ" ? 500 : 0;
        if (d + prio < bestD) { bestD = d + prio; best = u; }
      });
      if (best) t.target = best;
    }
    if (t.target && t.atkCd <= 0) {
      performAttack(t, t.target);
      if (t.target.isPlayer) {
        t.target.warnT = 0.9;
        SFX.warn();
      }
    }
  }

  function separation(dt) {
    const movers = world.units.filter((u) => u.alive && !u.dash);
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        const minD = a.radius + b.radius;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < minD) {
          const push = ((minD - d) / d) * 0.5 * Math.min(1, dt * 12);
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }
    movers.forEach((u) => {
      u.x = clamp(u.x, 30, BAL.WORLD_W - 30);
      u.y = clamp(u.y, 30, BAL.WORLD_H - 30);
    });
  }

  /* ======================================================================
   * 13. ENEMY AI
   * ==================================================================== */
  function frontlinePoint(ai) {
    const dirSign = ai.team === 1 ? 1 : -1;
    const origin = ai.team === 1 ? BLUE_NEXUS : RED_NEXUS;
    let best = null, bestProg = -Infinity;
    world.units.forEach((m) => {
      if (m.kind !== "minion" || !m.alive || m.team !== ai.team) return;
      const prog = ((m.x - origin.x) * LANE_UX + (m.y - origin.y) * LANE_UY) * dirSign;
      if (prog > bestProg) { bestProg = prog; best = m; }
    });
    if (best) {
      const pull = 140;
      return {
        x: clamp(best.x - LANE_UX * pull * dirSign, 80, BAL.WORLD_W - 80),
        y: clamp(best.y - LANE_UY * pull * dirSign, 80, BAL.WORLD_H - 80),
      };
    }
    const hold = ai.team === 1 ? POS.blueTurrets[1] : POS.redTurrets[1];
    return {
      x: clamp(hold.x - LANE_UX * 60 * dirSign, 80, BAL.WORLD_W - 80),
      y: clamp(hold.y - LANE_UY * 60 * dirSign, 80, BAL.WORLD_H - 80),
    };
  }

  function aiThink(ai) {
    const foe = world.player;
    const hpPct = ai.hp / ai.maxHp;

    if (ai.state === "retreat") {
      if (hpPct >= BAL.AI.returnHpPct) {
        ai.state = "push";
      } else {
        const f = fountainOf(ai.team);
        ai.moveGoal = { x: f.x, y: f.y };
        ai.attackTarget = null;
        if (ai.cds.e <= 0 && ai.mp >= BAL.SKILLS.e.mana) {
          const near = nearestEnemyIn(ai, 300);
          if (near) tryCast(ai, "e", f.x, f.y);
        }
        return;
      }
    } else if (hpPct < BAL.AI.retreatHpPct) {
      ai.state = "retreat";
      return;
    }

    ai.moveGoal = frontlinePoint(ai);

    let best = null, bestScore = Infinity;
    enemiesOf(ai.team).forEach((e) => {
      const d = dist(ai, e);
      if (d > BAL.AI.engageRange + e.radius) return;
      const score = e.hp / e.maxHp + (e.kind === "structure" ? 0.35 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    });
    ai.attackTarget = best;

    if (foe.alive) {
      const d = dist(ai, foe);
      if (d <= BAL.AI.qCastRange && ai.cds.q <= 0 && ai.mp >= BAL.SKILLS.q.mana) {
        tryCast(ai, "q", foe.x, foe.y);
      }
      if (ai.level >= BAL.SKILLS.r.unlockLvl && d <= BAL.AI.rCastRange && ai.cds.r <= 0) {
        tryCast(ai, "r", foe.x, foe.y);
      }
      if (hpPct < 0.6 && ai.cds.w <= 0 && ai.mp >= BAL.SKILLS.w.mana && world.time - ai.lastDamagedAt < 2) {
        tryCast(ai, "w", ai.x, ai.y);
      }
      if (ai.cds.e <= 0 && ai.mp >= BAL.SKILLS.e.mana && ai.state === "push"
        && d > ai.range && d < BAL.SKILLS.e.dashRange + 40 && hpPct > 0.5) {
        tryCast(ai, "e", foe.x, foe.y);
      }
    }
  }

  function updateAiRubberband(ai, player) {
    const diff = (player.level + player.gold / 600) - (ai.level + ai.gold / 600);
    ai.statMul = clamp(1 + diff * BAL.AI.rubberFactor, BAL.AI.rubberMin, BAL.AI.rubberMax);
    setChampStats(ai);
  }

  /* ======================================================================
   * 14. WAVES + MAIN TICK
   * ==================================================================== */
  function spawnWave() {
    world.waveNum += 1;
    [1, -1].forEach((team) => {
      const types = ["melee", "melee", "melee", "ranged", "ranged"];
      if (world.waveNum % 3 === 0) types.push("siege");
      types.forEach((type, i) => {
        world.units.push(createMinion(team, type, world.waveNum, i, types.length));
      });
    });
    SFX.spawnWave();
  }

  function tick(dt) {
    world.time += dt;

    world.waveTimer -= dt;
    if (world.waveTimer <= 0) {
      world.waveTimer += BAL.WAVE_INTERVAL;
      spawnWave();
    }

    const player = world.player;
    const ai = world.aiChamp;
    player.gold += BAL.TRICKLE_GOLD * dt;
    ai.gold += BAL.TRICKLE_GOLD * dt;

    ai.aiThinkCd -= dt;
    if (ai.alive && ai.aiThinkCd <= 0) {
      ai.aiThinkCd = BAL.AI.thinkInterval;
      aiThink(ai);
    }
    ai.rubberCd -= dt;
    if (ai.rubberCd <= 0) {
      ai.rubberCd = BAL.AI.rubberTick;
      updateAiRubberband(ai, player);
    }

    world.units.forEach((u) => {
      if (u.kind === "champ") updateChamp(u, dt);
      else updateMinion(u, dt);
    });
    world.structures.forEach((s) => {
      if (s.kind === "turret") updateTurret(s, dt);
    });

    updateProjectiles(dt);
    separation(dt);

    world.units.forEach((u) => {
      if (u.kind !== "champ" || !u.alive) return;
      const f = fountainOf(u.team);
      if (dist(u, f) < BAL.FOUNTAIN_RADIUS) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * BAL.FOUNTAIN_HEAL_HP * dt);
        u.mp = Math.min(u.maxMp, u.mp + u.maxMp * BAL.FOUNTAIN_HEAL_MP * dt);
      } else {
        u.hp = Math.min(u.maxHp, u.hp + u.hpRegen * dt);
        u.mp = Math.min(u.maxMp, u.mp + u.mpRegen * dt);
      }
    });

    world.units = world.units.filter((u) => u.alive || u.kind === "champ");

    for (let i = world.effects.length - 1; i >= 0; i--) {
      const e = world.effects[i];
      e.t += dt;
      if (e.type === "burst" || e.type === "explosion") {
        e.parts.forEach((p) => {
          p.x = (e.x || 0) + Math.cos(p.a) * p.sp * e.t;
          p.y = (e.y || 0) + Math.sin(p.a) * p.sp * e.t;
        });
      }
      if (e.t >= e.dur) world.effects.splice(i, 1);
    }
    for (let i = world.floaters.length - 1; i >= 0; i--) {
      const f = world.floaters[i];
      f.t += dt;
      if (f.t >= 0.95) world.floaters.splice(i, 1);
    }

    shakeT = Math.max(0, shakeT - dt);
  }

  /* ======================================================================
   * 15. RENDERING
   * ==================================================================== */
  const terrainCanvas = document.createElement("canvas");

  function buildTerrain() {
    terrainCanvas.width = BAL.WORLD_W;
    terrainCanvas.height = BAL.WORLD_H;
    const t = terrainCanvas.getContext("2d");
    const rng = mulberry32(777);

    const grass = IMG["terrain-grass"];
    if (grass.ok) {
      t.fillStyle = t.createPattern(grass.img, "repeat");
      t.fillRect(0, 0, BAL.WORLD_W, BAL.WORLD_H);
    } else {
      t.fillStyle = "#2c4a33";
      t.fillRect(0, 0, BAL.WORLD_W, BAL.WORLD_H);
    }
    for (let i = 0; i < 420; i++) {
      t.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
      const s = 20 + rng() * 70;
      t.fillRect(rng() * BAL.WORLD_W, rng() * BAL.WORLD_H, s, s * 0.6);
    }

    t.lineCap = "round";
    t.lineJoin = "round";
    const lanePath = () => {
      t.beginPath();
      t.moveTo(BLUE_NEXUS.x, BLUE_NEXUS.y);
      t.lineTo(RED_NEXUS.x, RED_NEXUS.y);
    };
    const dirt = IMG["terrain-lane"];
    lanePath();
    t.strokeStyle = "rgba(30,24,16,0.85)";
    t.lineWidth = BAL.LANE_WIDTH + 26;
    t.stroke();
    lanePath();
    if (dirt.ok) {
      t.strokeStyle = t.createPattern(dirt.img, "repeat");
    } else {
      t.strokeStyle = "#7a6242";
    }
    t.lineWidth = BAL.LANE_WIDTH;
    t.stroke();
    lanePath();
    t.strokeStyle = "rgba(255,235,200,0.09)";
    t.lineWidth = BAL.LANE_WIDTH * 0.5;
    t.stroke();

    [POS.blueFountain, POS.redFountain].forEach((f) => {
      t.fillStyle = "rgba(52,58,74,0.9)";
      t.beginPath();
      t.arc(f.x, f.y, 96, 0, Math.PI * 2);
      t.fill();
      t.strokeStyle = "rgba(232,182,76,0.35)";
      t.lineWidth = 5;
      t.stroke();
    });

    POS.blueTurrets.concat(POS.redTurrets).forEach((p) => {
      t.fillStyle = "rgba(40,44,56,0.75)";
      t.beginPath();
      t.arc(p.x, p.y, 46, 0, Math.PI * 2);
      t.fill();
    });

    const tree = IMG["tree-deco"];
    TREES.forEach((tr) => {
      const size = 96 * tr.s;
      t.save();
      t.translate(tr.x, tr.y);
      t.fillStyle = "rgba(8,16,10,0.35)";
      t.beginPath();
      t.ellipse(0, size * 0.34, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
      t.fill();
      if (tree.ok) {
        t.drawImage(tree.img, -size / 2, -size / 2, size, size);
      } else {
        fbShape(t, "tree-deco", 0, 0, size);
      }
      t.restore();
    });

    const vg = t.createRadialGradient(
      BAL.WORLD_W / 2, BAL.WORLD_H / 2, Math.min(BAL.WORLD_W, BAL.WORLD_H) * 0.36,
      BAL.WORLD_W / 2, BAL.WORLD_H / 2, Math.max(BAL.WORLD_W, BAL.WORLD_H) * 0.72
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(2,5,10,0.4)");
    t.fillStyle = vg;
    t.fillRect(0, 0, BAL.WORLD_W, BAL.WORLD_H);

    terrainDirty = false;
  }

  function drawSprite(rec, key, x, y, w, h) {
    if (rec && rec.ok) {
      ctx.drawImage(rec.img, x - w / 2, y - h / 2, w, h);
    } else {
      fbShape(ctx, key, x, y, Math.max(w, h));
    }
  }

  function drawBar(x, y, w, frac, color, bgFrac) {
    const h = 6;
    ctx.fillStyle = "rgba(5,9,16,0.8)";
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = "#20304a";
    ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), h);
    if (bgFrac && bgFrac > frac) {
      ctx.fillStyle = "rgba(240,248,255,0.85)";
      ctx.fillRect(x - w / 2 + w * clamp(frac, 0, 1), y, w * (clamp(bgFrac, 0, 1) - frac), h);
    }
  }

  function render(dt) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = stageFrame.clientWidth || 1;
    const cssH = stageFrame.clientHeight || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    view.cssW = cssW;
    view.cssH = cssH;
    view.scale = cssH / BAL.VIEW_H;
    view.w = cssW / view.scale;
    view.h = BAL.VIEW_H;

    const focus = world.player.alive ? world.player : fountainOf(1);
    const targX = clamp(focus.x - view.w / 2, 0, Math.max(0, BAL.WORLD_W - view.w));
    const targY = clamp(focus.y - view.h / 2, 0, Math.max(0, BAL.WORLD_H - view.h));
    const k = Math.min(1, dt * 7);
    cam.x = lerp(cam.x, targX, k);
    cam.y = lerp(cam.y, targY, k);

    if (terrainDirty) buildTerrain();

    let shx = 0, shy = 0;
    if (shakeT > 0) {
      const m = shakeMag * (shakeT / 0.32);
      shx = (Math.random() * 2 - 1) * m;
      shy = (Math.random() * 2 - 1) * m;
      if (shakeT <= 0) shakeMag = 0;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#060b14";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.scale(view.scale, view.scale);
    ctx.translate(-cam.x + shx, -cam.y + shy);

    ctx.drawImage(terrainCanvas, 0, 0);

    [POS.blueFountain, POS.redFountain].forEach((f, i) => {
      const team = i === 0 ? 1 : -1;
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 2.4);
      const grad = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, BAL.FOUNTAIN_RADIUS * 0.8);
      grad.addColorStop(0, team === 1 ? "rgba(87,169,255,0.22)" : "rgba(255,109,109,0.22)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(f.x - BAL.FOUNTAIN_RADIUS, f.y - BAL.FOUNTAIN_RADIUS, BAL.FOUNTAIN_RADIUS * 2, BAL.FOUNTAIN_RADIUS * 2);
      drawSprite(IMG.fountain, "fountain", f.x, f.y, 84 + pulse * 6, 84 + pulse * 6);
    });

    world.structures.forEach((s) => {
      if (s.kind === "turret") {
        ctx.save();
        if (!s.alive) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = "#20242e";
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 6, 40, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }
        ctx.restore();
        if (s.team !== world.player.team) {
          ctx.strokeStyle = "rgba(255,109,109,0.16)";
          ctx.setLineDash([10, 12]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.range, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const w = 64, h = 92;
        ctx.fillStyle = "rgba(5,9,16,0.4)";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 26, 30, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSprite(IMG["tower-" + (s.team === 1 ? "blue" : "red")], "tower-" + (s.team === 1 ? "blue" : "red"), s.x, s.y - 14, w, h);
        drawBar(s.x, s.y - 66, 56, s.hp / s.maxHp, teamColor(s.team));
      } else if (s.kind === "nexus") {
        const w = 88, h = 106;
        ctx.fillStyle = "rgba(5,9,16,0.4)";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 30, 38, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSprite(IMG["nexus-" + (s.team === 1 ? "blue" : "red")], "nexus-" + (s.team === 1 ? "blue" : "red"), s.x, s.y - 16, w, h);
        if (s.invuln && s.alive) {
          ctx.strokeStyle = "rgba(210,230,255," + (0.35 + 0.2 * Math.sin(world.time * 3)) + ")";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(s.x, s.y - 10, 58, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (s.alive) drawBar(s.x, s.y - 78, 64, s.hp / s.maxHp, teamColor(s.team));
      }
    });

    const pt = world.player.attackTarget;
    if (pt && isValidTarget(pt)) {
      ctx.strokeStyle = "rgba(255,90,90,0.85)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y + pt.radius * 0.4, pt.radius + 8 + Math.sin(world.time * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const drawables = world.units.slice().sort((a, b) => a.y - b.y);
    drawables.forEach((u) => {
      const col = teamColor(u.team);
      const isChamp = u.kind === "champ";
      const size = isChamp ? 64 : u.mtype === "siege" ? 44 : u.mtype === "ranged" ? 32 : 34;
      ctx.fillStyle = "rgba(5,9,16,0.38)";
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + u.radius * 0.55, size * 0.34, size * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isChamp) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(u.x, u.y + u.radius * 0.55, u.radius + 5, (u.radius + 5) * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.save();
      if (u.hurtT > 0) ctx.globalAlpha = 0.75;
      let key, rec;
      if (isChamp) {
        key = u.isPlayer ? "champ-you" : "champ-them";
        rec = IMG[key];
      } else {
        key = "minion-" + u.mtype + "-" + (u.team === 1 ? "blue" : "red");
        rec = IMG[key];
      }
      const bob = u.moving !== false && !isChamp ? Math.sin(world.time * 10 + u.uid) * 2 : 0;
      drawSprite(rec, key, u.x, u.y - size * 0.12 + bob, size, size);
      ctx.restore();

      if (u.shield > 0) {
        ctx.strokeStyle = "rgba(225,242,255,0.8)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(u.x, u.y - 6, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (u.warnT > 0) {
        const a = 0.4 + 0.4 * Math.sin(world.time * 16);
        ctx.strokeStyle = "rgba(255,70,70," + a.toFixed(3) + ")";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius + 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      const barW = isChamp ? 56 : 30;
      const barY = u.y - size * 0.72 - 10;
      if (isChamp) {
        drawBar(u.x, barY, barW, u.hp / u.maxHp, u.team === 1 ? "#46d474" : "#ff6d6d",
          u.shield > 0 ? (u.hp + u.shield) / u.maxHp : 0);
        drawBar(u.x, barY + 8, barW * 0.8, u.mp / u.maxMp, "#4aa8f0");
        ctx.fillStyle = "#101d33";
        ctx.strokeStyle = "#e8b64c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(u.x - barW / 2 - 10, barY + 3, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffd97a";
        ctx.font = "700 10px 'Noto Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(u.level), u.x - barW / 2 - 10, barY + 4);
      } else if (u.hp < u.maxHp) {
        drawBar(u.x, barY, barW, u.hp / u.maxHp, col);
      }
    });

    world.projectiles.forEach((p) => {
      const ang = p.kind === "skill-q"
        ? Math.atan2(p.ny, p.nx)
        : Math.atan2(p.vy || 0, p.vx || 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      if (p.kind === "skill-q") {
        ctx.fillStyle = "rgba(159,232,255,0.95)";
        ctx.shadowColor = "#7ad7ff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(-16, -5, 32, 10, 5);
        ctx.fill();
      } else {
        const r = p.heavy ? 7 : 4.5;
        ctx.fillStyle = p.heavy ? "#ffb36b" : p.team === 1 ? "#bfe0ff" : "#ffc4c8";
        ctx.shadowColor = p.heavy ? "#ff8a4a" : "#ffffff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    world.effects.forEach((e) => {
      const pr = e.t / e.dur;
      ctx.save();
      if (e.type === "slash") {
        ctx.translate(e.x, e.y);
        ctx.rotate(e.ang);
        ctx.strokeStyle = "rgba(255,240,200," + (1 - pr).toFixed(3) + ")";
        ctx.lineWidth = 4 * (1 - pr) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, 16 + pr * 14, -0.7, 0.7);
        ctx.stroke();
      } else if (e.type === "spark") {
        ctx.globalAlpha = 1 - pr;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 5 + pr * 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === "burst" || e.type === "explosion") {
        ctx.globalAlpha = 1 - pr;
        ctx.fillStyle = e.type === "explosion" ? "#ffcf8a" : (e.color || "#ffffff");
        e.parts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, e.type === "explosion" ? 5 : 3.4, 0, Math.PI * 2);
          ctx.fill();
        });
        if (e.type === "explosion") {
          ctx.globalAlpha = (1 - pr) * 0.55;
          const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, e.radius * (0.5 + pr * 0.6));
          g.addColorStop(0, "rgba(255,214,140,0.9)");
          g.addColorStop(1, "rgba(255,120,50,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * (0.5 + pr * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.type === "ring" || e.type === "ping") {
        ctx.globalAlpha = 1 - pr;
        ctx.strokeStyle = e.color || "#ffffff";
        ctx.lineWidth = e.type === "ping" ? 2.5 : 3.5;
        const r = e.type === "ping" ? 8 + pr * 30 : (e.radius || 40) * (0.5 + pr * 0.7);
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === "levelup") {
        ctx.globalAlpha = 1 - pr;
        ctx.strokeStyle = "#ffd97a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 10, 20 + pr * 44, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });

    world.floaters.forEach((f) => {
      const pr = f.t / 0.95;
      ctx.save();
      ctx.globalAlpha = 1 - pr * pr;
      ctx.fillStyle = f.color;
      ctx.font = "800 15px 'Noto Sans KR', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.strokeStyle = "rgba(5,9,16,0.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - pr * 30);
      ctx.fillText(f.text, f.x, f.y - pr * 30);
      ctx.restore();
    });

    if (pendingAttackMove) {
      const cw = cursorWorld();
      ctx.strokeStyle = "rgba(255,120,90,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cw.x, cw.y, 12, 0, Math.PI * 2);
      ctx.moveTo(cw.x - 18, cw.y);
      ctx.lineTo(cw.x - 6, cw.y);
      ctx.moveTo(cw.x + 6, cw.y);
      ctx.lineTo(cw.x + 18, cw.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ======================================================================
   * 16. HUD
   * ==================================================================== */
  function buildSkillBar() {
    skillsEl.innerHTML = "";
    SKILL_ORDER.forEach((key) => {
      const S = BAL.SKILLS[key];
      const btn = document.createElement("button");
      btn.className = "skill-slot";
      btn.type = "button";
      btn.setAttribute("aria-label", S.name);
      const img = document.createElement("img");
      img.alt = "";
      img.src = "assets/skill-" + key + ".png";
      img.addEventListener("error", () => {
        if (img.dataset.fbDone) return;
        img.dataset.fbDone = "1";
        img.src = fbDataUrl("skill-" + key, 64);
      });
      btn.appendChild(img);
      btn.insertAdjacentHTML("beforeend",
        '<span class="cd-mask"></span><span class="key">' + key.toUpperCase() + '</span>' +
        '<span class="mana">' + S.mana + '</span><span class="lock-tag">Lv.' +
        (key === "r" ? S.unlockLvl : "") + "</span>");
      btn.addEventListener("click", () => {
        if (!playing || !world || world.over) return;
        const cw = cursorWorld();
        tryCast(world.player, key, cw.x, cw.y);
      });
      skillEls[key] = btn;
      skillsEl.appendChild(btn);
    });
  }

  const hudCache = {};
  function setTextCached(el, val) {
    if (hudCache[el.id] !== val) {
      hudCache[el.id] = val;
      el.textContent = val;
    }
  }

  function updateHud() {
    const p = world.player;
    const bn = world.structures.find((s) => s.kind === "nexus" && s.team === 1);
    const br = world.structures.find((s) => s.kind === "nexus" && s.team === -1);
    setTextCached(hpYouEl, String(Math.max(0, Math.ceil(bn.hp))));
    setTextCached(hpThemEl, String(Math.max(0, Math.ceil(br.hp))));
    setTextCached(goldEl, String(Math.floor(p.gold)));
    setTextCached(csEl, String(p.cs));

    setTextCached(lvlBadge, String(p.level));
    barHp.style.width = clamp((p.hp / p.maxHp) * 100, 0, 100) + "%";
    barMp.style.width = clamp((p.mp / p.maxMp) * 100, 0, 100) + "%";
    setTextCached(hpText, Math.ceil(p.hp) + " / " + p.maxHp);
    setTextCached(mpText, Math.ceil(p.mp) + " / " + p.maxMp);

    SKILL_ORDER.forEach((key) => {
      const S = BAL.SKILLS[key];
      const el = skillEls[key];
      const locked = key === "r" && p.level < S.unlockLvl;
      const cd = p.cds[key] || 0;
      el.querySelector(".cd-mask").style.height = cd > 0 ? (cd / S.cd) * 100 + "%" : "0";
      el.classList.toggle("locked", locked);
      el.classList.toggle("no-mana", !locked && p.mp < S.mana);
    });
  }

  /* ======================================================================
   * 17. OVERLAYS + FLOW
   * ==================================================================== */
  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function titleScreen() {
    playing = false;
    showOverlay(
      "<h1>리그 오브 챔피언</h1>" +
      "<p>미니언 웨이브와 함께 대각선 라인을 밀어 올라<br><b>적 넥서스를 파괴</b>하세요. QWER 스킬과 마지막 타격(CS)이 승부를 가릅니다.</p>" +
      '<button class="btn" type="button" id="btn-start">출전</button>' +
      '<button class="btn btn-ghost" type="button" id="btn-help-title">설명서</button>'
    );
    document.getElementById("btn-start").addEventListener("click", () => {
      SFX.init();
      SFX.ui();
      startGame();
    });
    document.getElementById("btn-help-title").addEventListener("click", () => {
      SFX.ui();
      openHelp();
    });
  }

  function endScreen(result) {
    playing = false;
    const win = result === "win";
    if (win) SFX.win();
    else SFX.lose();
    showOverlay(
      "<h2>" + (win ? "승리" : "패배") + "</h2>" +
      "<p>" + (win ? "적 넥서스를 파괴했습니다!" : "내 넥서스가 무너졌습니다.") + "<br>CS <b>" + world.player.cs +
      "</b> · 골드 <b>" + Math.floor(world.player.gold) + "</b> · 레벨 <b>" + world.player.level + "</b></p>" +
      '<button class="btn" type="button" id="btn-retry">재시작</button>'
    );
    document.getElementById("btn-retry").addEventListener("click", () => {
      SFX.init();
      SFX.ui();
      startGame();
    });
  }

  function startGame() {
    world = createWorld();
    playing = true;
    paused = false;
    lastTs = 0;
    pendingAttackMove = false;
    canvas.classList.remove("aim-attack");
    respawnBanner.classList.add("hidden");
    hideOverlay();
    updateHud();
  }

  function openHelp() {
    helpOpen = true;
    helpOverlay.classList.remove("hidden");
    btnHelpClose.focus();
  }
  function closeHelp() {
    helpOpen = false;
    helpOverlay.classList.add("hidden");
    lastTs = 0;
  }

  /* ======================================================================
   * 18. INPUT
   * ==================================================================== */
  function pickEnemyAt(p) {
    let best = null, bestD = Infinity;
    const consider = (e) => {
      if (!isValidTarget(e)) return;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= e.radius + 16 && d < bestD) { bestD = d; best = e; }
    };
    world.units.forEach((u) => { if (u.team !== 1 && u.alive) consider(u); });
    world.structures.forEach((s) => { if (s.team !== 1 && s.alive) consider(s); });
    return best;
  }

  function issueRightOrder(p) {
    const picked = pickEnemyAt(p);
    const pl = world.player;
    if (picked) {
      pl.attackTarget = picked;
      pl.moveGoal = null;
      fxPing(picked.x, picked.y, "#ff7a6a");
    } else {
      pl.attackTarget = null;
      pl.moveGoal = { x: clamp(p.x, 30, BAL.WORLD_W - 30), y: clamp(p.y, 30, BAL.WORLD_H - 30), attackMove: false };
      fxPing(pl.moveGoal.x, pl.moveGoal.y, "#7ab8ff");
    }
    SFX.tick();
  }

  function issueAttackMove(p) {
    const pl = world.player;
    pl.moveGoal = { x: clamp(p.x, 30, BAL.WORLD_W - 30), y: clamp(p.y, 30, BAL.WORLD_H - 30), attackMove: true };
    pl.attackTarget = null;
    fxPing(pl.moveGoal.x, pl.moveGoal.y, "#ffb36b");
    SFX.tick();
  }

  function stopOrder() {
    const pl = world.player;
    pl.moveGoal = null;
    pl.attackTarget = null;
    SFX.tick();
  }

  function cancelAttackMove() {
    pendingAttackMove = false;
    canvas.classList.remove("aim-attack");
  }

  function bindInput() {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => {
      if (!playing || !world || world.over || helpOpen) return;
      if (e.button === 2) {
        e.preventDefault();
        issueRightOrder(cursorWorld());
      } else if (e.button === 0) {
        if (pendingAttackMove) {
          cancelAttackMove();
          issueAttackMove(cursorWorld());
        }
      } else if (e.button === 1) {
        e.preventDefault();
      }
    });
    window.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.sx = e.clientX - r.left;
      mouse.sy = e.clientY - r.top;
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (helpOpen) closeHelp();
        else if (pendingAttackMove) cancelAttackMove();
        return;
      }
      if (helpOpen || !playing || !world || world.over) return;
      const pl = world.player;
      if (e.code === "KeyQ" || e.code === "KeyW" || e.code === "KeyE" || e.code === "KeyR") {
        if (e.repeat) return;
        const key = e.code.slice(3).toLowerCase();
        const cw = cursorWorld();
        tryCast(pl, key, cw.x, cw.y);
      } else if (e.code === "KeyS") {
        stopOrder();
      } else if (e.code === "KeyA") {
        pendingAttackMove = true;
        canvas.classList.add("aim-attack");
      }
    });

    btnSound.addEventListener("click", () => {
      soundOn = !soundOn;
      storage.setItem(LS_SOUND, soundOn ? "1" : "0");
      syncSoundBtn();
      if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
      if (soundOn) SFX.init();
      SFX.ui();
    });
    btnHelp.addEventListener("click", () => { SFX.ui(); openHelp(); });
    btnHelpClose.addEventListener("click", closeHelp);
    btnHelpOk.addEventListener("click", closeHelp);
    helpOverlay.addEventListener("click", (e) => {
      if (e.target === helpOverlay) closeHelp();
    });

    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      lastTs = 0;
    });
  }

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  /* ======================================================================
   * 19. MAIN LOOP + BOOT
   * ==================================================================== */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!world) return;
    if (helpOpen || paused) {
      lastTs = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    if (playing && !world.over) tick(dt);
    render(dt);
    if (playing) updateHud();
    if (world.over && !world.overDone) {
      world.overDone = true;
      endScreen(world.over);
    }
  }

  loadImages();
  bindDomFallbacks(document);
  buildSkillBar();
  bindInput();
  syncSoundBtn();
  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  world = createWorld();
  titleScreen();
  requestAnimationFrame(loop);
})();
