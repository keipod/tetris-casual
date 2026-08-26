/* 포켓몬월드 — Mario-style world map canvas (840×1020 logical). */
(function (global) {
  "use strict";

  const W = 840;
  const H = 1020;
  const KIND_VIS = {
    start: { fill: "#f4d35e", label: "START", icon: "🏁", block: "gold", sprite: "start" },
    wild: { fill: "#5cb85c", label: "풀숲", icon: "🌿", block: "pipe", sprite: "pipe" },
    item: { fill: "#f0a500", label: "?", icon: "?", block: "question", sprite: "question" },
    event: { fill: "#c77dff", label: "!", icon: "!", block: "note", sprite: "note" },
    gym: { fill: "#e85d4c", label: "GYM", icon: "🏰", block: "castle", sprite: "castle" },
    shop: { fill: "#4ecdc4", label: "SHOP", icon: "🏪", block: "brick", sprite: "shop" },
    rest: { fill: "#ff8fab", label: "♥", icon: "💖", block: "heart", sprite: "heart" },
    duel: { fill: "#ff6b35", label: "VS", icon: "⚔️", block: "spike", sprite: "vs" },
  };

  const ASSET_URLS = {
    bg: "assets/bg/world.png",
    tiles: {
      brick: "assets/tiles/brick.png",
      question: "assets/tiles/question.png",
      pipe: "assets/tiles/pipe.png",
      castle: "assets/tiles/castle.png",
      heart: "assets/tiles/heart.png",
      note: "assets/tiles/note.png",
      vs: "assets/tiles/vs.png",
      start: "assets/tiles/start.png",
      shop: "assets/tiles/shop.png",
    },
    deco: {
      cloud: "assets/deco/cloud.png",
      tree: "assets/deco/tree.png",
      bush: "assets/deco/bush.png",
      coin: "assets/deco/coin.png",
      hill: "assets/deco/hill.png",
    },
  };

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src + (src.includes("?") ? "&" : "?") + "v=20260826bake";
    });
  }

  async function loadAssets() {
    const bag = { bg: null, tiles: {}, deco: {} };
    bag.bg = await loadImage(ASSET_URLS.bg);
    await Promise.all(
      Object.entries(ASSET_URLS.tiles).map(async ([k, url]) => {
        bag.tiles[k] = await loadImage(url);
      })
    );
    await Promise.all(
      Object.entries(ASSET_URLS.deco).map(async ([k, url]) => {
        bag.deco[k] = await loadImage(url);
      })
    );
    return bag;
  }

  function drawSprite(ctx, img, x, y, size) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    const s = size;
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    return true;
  }

  function tileCenters(n) {
    const padX = 88;
    const padY = 130;
    const left = padX;
    const right = W - padX;
    const top = padY;
    const bottom = H - 160;
    const pathLen = 2 * ((right - left) + (bottom - top));
    const pts = [];
    for (let i = 0; i < n; i++) {
      // start at bottom-left corner going clockwise: up left side? 
      // START at bottom center-left: begin at bottom-left, go right along bottom... Mario often start bottom.
      // Index 0 at bottom-left, clockwise: bottom→left→top→right? 
      // Clockwise from bottom-left: up the left side first.
      const d = (i / n) * pathLen;
      const w = right - left;
      const h = bottom - top;
      let x, y, edge;
      if (d < h) {
        // left side bottom→top
        x = left;
        y = bottom - d;
        edge = "left";
      } else if (d < h + w) {
        // top left→right
        x = left + (d - h);
        y = top;
        edge = "top";
      } else if (d < h + w + h) {
        // right top→bottom
        x = right;
        y = top + (d - h - w);
        edge = "right";
      } else {
        // bottom right→left
        x = right - (d - h - w - h);
        y = bottom;
        edge = "bottom";
      }
      pts.push({ x, y, edge });
    }
    return pts;
  }

  function drawCloud(ctx, x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 22 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 48 * s, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 24 * s, y + 6 * s, 16 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHill(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - h, x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.35, y - h * 0.35, w * 0.12, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBrick(ctx, x, y, size, tone) {
    const s = size;
    ctx.fillStyle = tone || "#c84c0c";
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    ctx.strokeStyle = "rgba(255,200,120,0.35)";
    ctx.beginPath();
    ctx.moveTo(x - s / 2, y);
    ctx.lineTo(x + s / 2, y);
    ctx.moveTo(x, y - s / 2);
    ctx.lineTo(x, y);
    ctx.stroke();
    // rivets
    ctx.fillStyle = "#5a2a08";
    const r = 2.2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx * (s * 0.28), y + dy * (s * 0.28), r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawQuestion(ctx, x, y, size) {
    const s = size;
    const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
    g.addColorStop(0, "#ffd447");
    g.addColorStop(1, "#e89a12");
    ctx.fillStyle = g;
    roundRect(ctx, x - s / 2, y - s / 2, s, s, 6);
    ctx.fill();
    ctx.strokeStyle = "#a86a00";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff8dc";
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
      ctx.fillRect(x + dx * s * 0.32 - 3, y + dy * s * 0.32 - 3, 6, 6);
    });
    ctx.fillStyle = "#8b4513";
    ctx.font = `bold ${Math.floor(s * 0.55)}px "Jua", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x, y + 2);
  }

  function drawPipe(ctx, x, y, size) {
    const s = size;
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(x - s * 0.28, y - s * 0.1, s * 0.56, s * 0.55);
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(x - s * 0.38, y - s * 0.42, s * 0.76, s * 0.32);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x - s * 0.32, y - s * 0.38, s * 0.12, s * 0.24);
    ctx.strokeStyle = "#1e8449";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - s * 0.38, y - s * 0.42, s * 0.76, s * 0.32);
  }

  function drawCastle(ctx, x, y, size) {
    const s = size;
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(x - s * 0.35, y - s * 0.1, s * 0.7, s * 0.5);
    ctx.fillStyle = "#95a5a6";
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(x + i * s * 0.28 - s * 0.1, y - s * 0.45, s * 0.2, s * 0.35);
    }
    ctx.fillStyle = "#e74c3c";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.12, y - s * 0.45);
    ctx.lineTo(x, y - s * 0.62);
    ctx.lineTo(x + s * 0.12, y - s * 0.45);
    ctx.fill();
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(x - s * 0.1, y + s * 0.05, s * 0.2, s * 0.35);
  }

  function drawHeartBlock(ctx, x, y, size) {
    drawBrick(ctx, x, y, size, "#ff8fab");
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.floor(size * 0.45)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♥", x, y + 1);
  }

  function drawNoteBlock(ctx, x, y, size) {
    const g = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
    g.addColorStop(0, "#e0aaff");
    g.addColorStop(1, "#9b5de5");
    ctx.fillStyle = g;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(size * 0.5)}px "Jua", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y + 2);
  }

  function drawSpikeBlock(ctx, x, y, size) {
    drawBrick(ctx, x, y, size, "#ff6b35");
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(size * 0.4)}px "Jua", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VS", x, y + 1);
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

  function drawTileBlock(ctx, kind, x, y, size, highlight, assets) {
    const vis = KIND_VIS[kind] || KIND_VIS.wild;
    const key = vis.sprite;
    const sprite = assets?.tiles?.[key];
    if (!drawSprite(ctx, sprite, x, y, size)) {
      switch (vis.block) {
        case "question":
          drawQuestion(ctx, x, y, size);
          break;
        case "pipe":
          drawPipe(ctx, x, y, size);
          break;
        case "castle":
          drawCastle(ctx, x, y, size);
          break;
        case "heart":
          drawHeartBlock(ctx, x, y, size);
          break;
        case "note":
          drawNoteBlock(ctx, x, y, size);
          break;
        case "spike":
          drawSpikeBlock(ctx, x, y, size);
          break;
        case "gold":
          drawBrick(ctx, x, y, size, "#f4d35e");
          ctx.fillStyle = "#5a3a00";
          ctx.font = `bold ${Math.floor(size * 0.28)}px "Jua", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("START", x, y + 1);
          break;
        default:
          drawBrick(ctx, x, y, size, vis.fill);
          break;
      }
    }
    if (highlight) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ffe566";
      ctx.shadowBlur = 12;
      ctx.strokeRect(x - size / 2 - 4, y - size / 2 - 4, size + 8, size + 8);
      ctx.shadowBlur = 0;
    }
  }

  function drawMeeple(ctx, x, y, color, idx) {
    // Mario-ish mushroom / walker
    ctx.save();
    ctx.translate(x + (idx - 1.5) * 10, y - 28);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 4, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(-3, 3, 1.6, 0, Math.PI * 2);
    ctx.arc(3, 3, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTree(ctx, x, y, s) {
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(x - 4 * s, y - 8 * s, 8 * s, 22 * s);
    ctx.fillStyle = "#2ecc71";
    ctx.beginPath();
    ctx.arc(x, y - 18 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(x - 12 * s, y - 8 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 12 * s, y - 8 * s, 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#27ae60";
    ctx.beginPath();
    ctx.arc(x, y - 16 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBush(ctx, x, y, s) {
    ctx.fillStyle = "#3d9e4a";
    ctx.beginPath();
    ctx.arc(x - 10 * s, y, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 10 * s, y, 12 * s, 0, Math.PI * 2);
    ctx.arc(x, y - 6 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(x - 4 * s, y - 8 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoin(ctx, x, y, s) {
    ctx.fillStyle = "#f4d35e";
    ctx.beginPath();
    ctx.ellipse(x, y, 8 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#c9a227";
    ctx.font = `bold ${Math.floor(10 * s)}px "Jua", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, y + 1);
  }

  function createWorld(canvas) {
    const ctx = canvas.getContext("2d");
    let centers = tileCenters(24);
    let anim = 0;
    let assets = { bg: null, tiles: {}, deco: {} };
    loadAssets().then((bag) => {
      assets = bag;
    });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || W;
      const scale = cssW / W;
      const cssH = H * scale;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawBackground() {
      if (assets.bg && assets.bg.naturalWidth) {
        ctx.drawImage(assets.bg, 0, 0, W, H);
        // soft vignette so path stays readable
        const vig = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 520);
        vig.addColorStop(0, "rgba(255,255,255,0)");
        vig.addColorStop(1, "rgba(20,60,30,0.12)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      } else {
        const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
        sky.addColorStop(0, "#5ec8f0");
        sky.addColorStop(0.55, "#8ed8f8");
        sky.addColorStop(1, "#b8e8ff");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ffe566";
        ctx.beginPath();
        ctx.arc(700, 90, 48, 0, Math.PI * 2);
        ctx.fill();
        drawCloud(ctx, 80 + Math.sin(anim * 0.01) * 8, 70, 1.1);
        drawCloud(ctx, 280, 110, 0.85);
        drawCloud(ctx, 520, 60, 1.3);
        drawHill(ctx, -20, H * 0.62, 320, 120, "#3d9e4a");
        drawHill(ctx, 220, H * 0.64, 400, 140, "#2f8f3d");
        drawHill(ctx, 520, H * 0.63, 360, 110, "#3d9e4a");
        const groundY = H * 0.68;
        ctx.fillStyle = "#6bcB3c";
        ctx.fillRect(0, groundY, W, H - groundY);
        ctx.fillStyle = "#c47a3a";
        ctx.fillRect(0, H - 90, W, 90);
        const plat = { x: 50, y: 100, w: W - 100, h: H - 280 };
        ctx.fillStyle = "#8B5A2B";
        roundRect(ctx, plat.x, plat.y + plat.h - 24, plat.w, 48, 16);
        ctx.fill();
        ctx.fillStyle = "#5aad32";
        roundRect(ctx, plat.x, plat.y, plat.w, plat.h, 20);
        ctx.fill();
      }

      // deco overlays (sprites with procedural fallback)
      const cloudImg = assets.deco.cloud;
      if (!drawSprite(ctx, cloudImg, 120 + Math.sin(anim * 0.01) * 8, 80, 110)) {
        drawCloud(ctx, 80 + Math.sin(anim * 0.01) * 8, 70, 1.1);
      }
      if (!drawSprite(ctx, cloudImg, 520, 70, 130)) drawCloud(ctx, 520, 60, 1.3);
      if (!drawSprite(ctx, assets.deco.tree, 70, H - 120, 100)) drawTree(ctx, 60, H - 100, 1.1);
      if (!drawSprite(ctx, assets.deco.tree, 770, H - 125, 110)) drawTree(ctx, 780, H - 105, 1.2);
      if (!drawSprite(ctx, assets.deco.bush, 340, H - 70, 70)) drawBush(ctx, 340, H - 55, 1);
      if (!drawSprite(ctx, assets.deco.bush, 560, H - 72, 76)) drawBush(ctx, 560, H - 58, 1.15);
      const cyCoin = H - 160 + Math.sin(anim * 0.08) * 4;
      if (!drawSprite(ctx, assets.deco.coin, 420, cyCoin, 36)) drawCoin(ctx, 420, cyCoin, 1.2);
      if (!drawSprite(ctx, assets.deco.coin, 460, cyCoin - 8, 32)) drawCoin(ctx, 455, cyCoin - 8, 1);
      if (!drawSprite(ctx, assets.tiles.pipe, 120, H - 130, 70)) {
        drawPipe(ctx, 120, H - 130, 56);
      }
      if (!drawSprite(ctx, assets.tiles.pipe, 720, H - 140, 78)) drawPipe(ctx, 720, H - 140, 64);
      if (!drawSprite(ctx, assets.tiles.brick, 220, H - 70, 40)) drawBrick(ctx, 200, H - 70, 36, "#c84c0c");
      if (!drawSprite(ctx, assets.tiles.question, 400, H - 110, 44)) drawQuestion(ctx, 400, H - 110, 40);
      if (!drawSprite(ctx, assets.tiles.brick, 444, H - 110, 44)) drawBrick(ctx, 440, H - 110, 40, "#c84c0c");
      if (!drawSprite(ctx, assets.tiles.question, 488, H - 110, 44)) drawQuestion(ctx, 480, H - 110, 40);

      ctx.fillStyle = "rgba(30,50,20,0.55)";
      roundRect(ctx, W / 2 - 120, 28, 240, 44, 12);
      ctx.fill();
      ctx.fillStyle = "#fff8dc";
      ctx.font = '700 22px "Jua", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("POKÉ WORLD", W / 2, 50);
    }

    function drawPathRails() {
      // wooden track under tiles
      if (centers.length < 2) return;
      ctx.strokeStyle = "#6b3f1d";
      ctx.lineWidth = 28;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      centers.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = "#d4a574";
      ctx.lineWidth = 18;
      ctx.stroke();
      // dashed center
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function render(view) {
      anim++;
      const board = (view && view.board) || [];
      const n = board.length || 24;
      centers = tileCenters(n);
      drawBackground();
      drawPathRails();

      const occupied = new Set();
      (view?.players || []).forEach((p) => {
        if (!p.eliminated) occupied.add(p.pos);
      });

      const tileSize = 64;
      board.forEach((tile, i) => {
        const c = centers[i];
        if (!c) return;
        drawTileBlock(ctx, tile.kind, c.x, c.y, tileSize, occupied.has(i), assets);
        // tiny label under
        ctx.fillStyle = "rgba(20,40,15,0.75)";
        ctx.font = '600 11px "Noto Sans KR", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText((tile.name || "").slice(0, 6), c.x, c.y + tileSize / 2 + 14);
      });

      // meeples
      (view?.players || []).forEach((p, idx) => {
        if (p.eliminated) return;
        const c = centers[p.pos];
        if (!c) return;
        drawMeeple(ctx, c.x, c.y, p.color || "#e85d4c", idx);
      });

      // center plaza decorations — mini Mario course
      const cx = W / 2;
      const cy = H / 2 - 20;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundRect(ctx, cx - 130, cy - 110, 260, 200, 24);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,80,40,0.35)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10, 100, 70, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!drawSprite(ctx, assets.tiles.castle, cx - 55, cy - 30, 90)) drawCastle(ctx, cx - 55, cy - 30, 78);
      if (!drawSprite(ctx, assets.tiles.pipe, cx + 60, cy + 5, 70)) drawPipe(ctx, cx + 60, cy + 5, 58);
      if (!drawSprite(ctx, assets.tiles.question, cx + 10, cy + 55, 48)) drawQuestion(ctx, cx + 10, cy + 55, 40);
      if (!drawSprite(ctx, assets.tiles.brick, cx - 20, cy + 55, 42)) drawBrick(ctx, cx - 20, cy + 55, 36, "#c84c0c");
      if (!drawSprite(ctx, assets.tiles.brick, cx - 56, cy + 55, 42)) drawBrick(ctx, cx - 56, cy + 55, 36, "#c84c0c");
      const bob = Math.sin(anim * 0.1) * 5;
      if (!drawSprite(ctx, assets.deco.coin, cx - 90, cy - 40 + bob, 34)) drawCoin(ctx, cx - 90, cy - 40 + bob, 1.3);
      if (!drawSprite(ctx, assets.deco.coin, cx + 95, cy - 50 + bob, 30)) drawCoin(ctx, cx + 95, cy - 50 + bob, 1.1);
      if (!drawSprite(ctx, assets.deco.bush, cx - 100, cy + 70, 64)) drawBush(ctx, cx - 100, cy + 70, 1.1);
      if (!drawSprite(ctx, assets.deco.bush, cx + 105, cy + 72, 60)) drawBush(ctx, cx + 105, cy + 72, 1);
      if (!drawSprite(ctx, assets.deco.tree, cx - 5, cy - 70, 72)) drawTree(ctx, cx - 5, cy - 70, 0.85);

      if (!drawSprite(ctx, assets.tiles.castle, 150, 180, 58)) drawCastle(ctx, 150, 180, 50);
      if (!drawSprite(ctx, assets.tiles.pipe, W - 150, 190, 56)) drawPipe(ctx, W - 150, 190, 48);
      if (!drawSprite(ctx, assets.tiles.question, 160, H - 220, 42)) drawQuestion(ctx, 160, H - 220, 36);
      if (!drawSprite(ctx, assets.tiles.brick, W - 170, H - 210, 40)) drawBrick(ctx, W - 170, H - 210, 34, "#c84c0c");
      if (!drawSprite(ctx, assets.deco.tree, W - 200, 220, 70)) drawTree(ctx, W - 200, 220, 0.9);
    }

    function getTileScreenPos(index, canvasEl) {
      const c = centers[index];
      if (!c || !canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const scale = rect.width / W;
      return { x: c.x * scale, y: c.y * scale, scale };
    }

    resize();
    return { render, resize, getTileScreenPos, W, H };
  }

  global.PokeWorldMap = { createWorld, W, H, tileCenters, KIND_VIS, loadAssets };
})(typeof window !== "undefined" ? window : globalThis);
