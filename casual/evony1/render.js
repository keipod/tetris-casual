/* Isometric canvas renderer for TOWN / CITY / MAP */
(function (global) {
  const COLORS = {
    grass: "#3d6b2f",
    grass2: "#4a7a38",
    road: "#8b7355",
    wall: "#6a6258",
    water: "#2a5a8a",
    forest: "#2a4a20",
    hill: "#7a6a4a",
    npc: "#8a3030",
    city: "#c9a227",
    building: "#d4b888",
    field: "#c4a060",
    select: "#ffe08a",
  };

  function iso(x, y, tw, th) {
    return { x: (x - y) * (tw / 2), y: (x + y) * (th / 2) };
  }

  function drawDiamond(ctx, x, y, tw, th, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y - th / 2);
    ctx.lineTo(x + tw / 2, y);
    ctx.lineTo(x, y + th / 2);
    ctx.lineTo(x - tw / 2, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function render(canvas, state) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 480;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const view = state.view || "town";
    const snap = state.snapshot;
    if (!snap || !snap.cities || !snap.cities.length) {
      ctx.fillStyle = "#1a2a14";
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#c9a227";
      ctx.font = "16px Cinzel, serif";
      ctx.fillText("Loading…", 24, 40);
      return;
    }
    const city = snap.cities[state.cityIndex || 0];

    if (view === "map") {
      drawMap(ctx, cssW, cssH, snap, state);
    } else if (view === "city") {
      drawCityFields(ctx, cssW, cssH, city, state);
    } else {
      drawTown(ctx, cssW, cssH, city, state);
    }
  }

  function drawTown(ctx, w, h, city, state) {
    const cols = 5;
    const rows = 4;
    const tw = 72;
    const th = 36;
    const ox = w / 2;
    const oy = h * 0.22;
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, w, h);
    // ground grid
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = iso(x, y, tw, th);
        const fill = (x + y) % 2 ? COLORS.grass : COLORS.grass2;
        drawDiamond(ctx, ox + p.x, oy + p.y, tw, th, fill, "rgba(0,0,0,0.15)");
      }
    }
    // buildings by slot
    const bySlot = {};
    (city.buildings || []).forEach((b) => {
      bySlot[b.slot] = b;
    });
    for (let slot = 0; slot < cols * rows; slot++) {
      const x = slot % cols;
      const y = Math.floor(slot / cols);
      const p = iso(x, y, tw, th);
      const b = bySlot[slot];
      const selected = state.selected && state.selected.kind === "building" && state.selected.slot === slot;
      if (b) {
        drawBuilding(ctx, ox + p.x, oy + p.y - 8, b, selected);
      } else {
        // empty plot
        ctx.fillStyle = selected ? COLORS.select : "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(ox + p.x, oy + p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.fillStyle = "#fff";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("+", ox + p.x, oy + p.y + 3);
        }
      }
    }
    // construction smoke
    if (city.build_queue && city.build_queue.kind === "building") {
      ctx.fillStyle = "rgba(200,200,200,0.5)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("🔨 constructing…", 12, h - 16);
    }
  }

  function drawBuilding(ctx, x, y, b, selected) {
    const w = 40;
    const h = 28;
    ctx.fillStyle = selected ? COLORS.select : COLORS.building;
    ctx.strokeStyle = "#5a3f24";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + w / 2, y - h + 8);
    ctx.lineTo(x + w / 2, y + 8);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x - w / 2, y + 8);
    ctx.lineTo(x - w / 2, y - h + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // roof
    ctx.fillStyle = b.type === "town_hall" ? COLORS.city : "#8b4513";
    ctx.beginPath();
    ctx.moveTo(x, y - h - 10);
    ctx.lineTo(x + w / 2, y - h + 8);
    ctx.lineTo(x - w / 2, y - h + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("L" + b.level, x, y + 4);
    ctx.fillStyle = selected ? "#1a1208" : "#3a2818";
    ctx.font = "9px sans-serif";
    const label = (b.type || "").replace(/_/g, " ").slice(0, 10);
    ctx.fillText(label, x, y + 28);
  }

  function drawCityFields(ctx, w, h, city, state) {
    ctx.fillStyle = "#2a4a1a";
    ctx.fillRect(0, 0, w, h);
    const tw = 64;
    const th = 32;
    const ox = w / 2;
    const oy = h * 0.18;
    const fields = city.fields || [];
    const maxPlots = 12;
    for (let i = 0; i < maxPlots; i++) {
      const x = i % 4;
      const y = Math.floor(i / 4);
      const p = iso(x, y, tw, th);
      const f = fields.find((fl) => fl.slot === i) || fields[i];
      const selected = state.selected && state.selected.kind === "field" && state.selected.slot === i;
      drawDiamond(
        ctx,
        ox + p.x,
        oy + p.y,
        tw,
        th,
        selected ? COLORS.select : f ? COLORS.field : COLORS.grass2,
        "rgba(0,0,0,0.2)"
      );
      if (f) {
        ctx.fillStyle = "#1a1208";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(f.type + " L" + f.level, ox + p.x, oy + p.y + 4);
      } else if (selected) {
        ctx.fillStyle = "#1a1208";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+ field", ox + p.x, oy + p.y + 4);
      }
    }
    // wall ring hint
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = "#efe0c0";
    ctx.font = "12px Cinzel, serif";
    ctx.textAlign = "left";
    ctx.fillText("CITY · Wall L" + (city.wall_level || 0), 24, 36);
  }

  function drawMap(ctx, w, h, snap, state) {
    ctx.fillStyle = "#0a1820";
    ctx.fillRect(0, 0, w, h);
    const win = snap.map_window || { tiles: [], x: 0, y: 0, w: 11, h: 11 };
    const tiles = win.tiles || [];
    const tw = Math.min(36, Math.floor((w - 40) / Math.max(1, win.w)));
    const th = tw / 2;
    const ox = w / 2;
    const oy = 40;
    const byKey = {};
    tiles.forEach((t) => {
      byKey[t.x + "," + t.y] = t;
    });
    for (let j = 0; j < win.h; j++) {
      for (let i = 0; i < win.w; i++) {
        const gx = win.x + i;
        const gy = win.y + j;
        const t = byKey[gx + "," + gy];
        const p = iso(i, j, tw, th);
        let fill = COLORS.grass;
        if (!t) fill = "#1a2a20";
        else if (t.terrain === "lake" || t.terrain === "river") fill = COLORS.water;
        else if (t.terrain === "forest") fill = COLORS.forest;
        else if (t.terrain === "hill") fill = COLORS.hill;
        else if (t.terrain === "npc") fill = COLORS.npc;
        else if (t.terrain === "player_city") fill = COLORS.city;
        const selected =
          state.selected &&
          state.selected.kind === "map" &&
          state.selected.x === gx &&
          state.selected.y === gy;
        drawDiamond(ctx, ox + p.x, oy + p.y, tw, th, selected ? COLORS.select : fill, "rgba(0,0,0,0.25)");
        if (t && t.npc_level) {
          ctx.fillStyle = "#fff";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("N" + t.npc_level, ox + p.x, oy + p.y + 3);
        }
        if (t && t.terrain === "player_city") {
          ctx.fillStyle = "#1a1208";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("★", ox + p.x, oy + p.y + 3);
        }
      }
    }
    // marches
    (snap.marches || []).forEach((m) => {
      ctx.strokeStyle = "#ffe08a";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const a = iso(m.from_x - win.x, m.from_y - win.y, tw, th);
      const b = iso(m.to_x - win.x, m.to_y - win.y, tw, th);
      ctx.moveTo(ox + a.x, oy + a.y);
      ctx.lineTo(ox + b.x, oy + b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.fillStyle = "#efe0c0";
    ctx.font = "12px Cinzel, serif";
    ctx.textAlign = "left";
    ctx.fillText("MAP · (" + win.x + "," + win.y + ")", 16, 24);
  }

  function hitTest(canvas, state, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const view = state.view || "town";
    const snap = state.snapshot;
    if (!snap || !snap.cities) return null;
    const city = snap.cities[state.cityIndex || 0];

    function nearestIso(cols, rows, tw, th, ox, oy) {
      let best = null;
      let bestD = 9999;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const p = iso(x, y, tw, th);
          const dx = mx - (ox + p.x);
          const dy = my - (oy + p.y);
          const d = dx * dx + dy * dy;
          if (d < bestD && d < (tw * tw)) {
            bestD = d;
            best = { x, y, slot: y * cols + x };
          }
        }
      }
      return best;
    }

    if (view === "town") {
      const hit = nearestIso(5, 4, 72, 36, w / 2, h * 0.22);
      if (!hit) return null;
      const b = (city.buildings || []).find((bb) => bb.slot === hit.slot);
      return { kind: "building", slot: hit.slot, building: b || null };
    }
    if (view === "city") {
      const hit = nearestIso(4, 3, 64, 32, w / 2, h * 0.18);
      if (!hit) return null;
      const f = (city.fields || []).find((ff) => ff.slot === hit.slot) || (city.fields || [])[hit.slot];
      return { kind: "field", slot: hit.slot, field: f || null };
    }
    if (view === "map") {
      const win = snap.map_window;
      const tw = Math.min(36, Math.floor((w - 40) / Math.max(1, win.w)));
      const th = tw / 2;
      const hit = nearestIso(win.w, win.h, tw, th, w / 2, 40);
      if (!hit) return null;
      return { kind: "map", x: win.x + hit.x, y: win.y + hit.y };
    }
    return null;
  }

  global.EvonyRender = { render, hitTest };
})(window);
