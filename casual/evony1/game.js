/* Evony Age I client */
(function () {
  const PORT_META = document.querySelector('meta[name="mp-ws-port"]');
  const WS_PORT = (PORT_META && PORT_META.content) || "48951";
  const storage = window.SafeStorage || {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  };

  function deviceId() {
    let id = storage.getItem("evony1_device_id");
    if (!id || id.length < 8) {
      id = "ev1_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      storage.setItem("evony1_device_id", id);
    }
    return id;
  }

  const state = {
    view: "town",
    snapshot: null,
    cityIndex: 0,
    selected: null,
    ws: null,
    connected: false,
  };

  const els = {
    lobby: document.getElementById("screen-lobby"),
    game: document.getElementById("screen-game"),
    nick: document.getElementById("nick-input"),
    server1: document.getElementById("btn-server1"),
    lang: document.getElementById("btn-lang"),
    canvas: document.getElementById("stage"),
    hint: document.getElementById("canvas-hint"),
    res: document.getElementById("res-list"),
    queues: document.getElementById("queues"),
    chatLog: document.getElementById("chat-log"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    status: document.getElementById("status-msg"),
    clock: document.getElementById("server-clock"),
    lordTitle: document.getElementById("lord-title"),
    lordNick: document.getElementById("lord-nick"),
    cityName: document.getElementById("city-name"),
    cityCoord: document.getElementById("city-coord"),
    ticker: document.getElementById("ticker"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modal-title"),
    modalBody: document.getElementById("modal-body"),
    modalClose: document.getElementById("modal-close"),
  };

  els.nick.value = storage.getItem("evony1_nick") || "";

  EvonyI18n.setLang(EvonyI18n.lang);

  function setStatus(msg, ok) {
    els.status.textContent = msg || "";
    els.status.style.color = ok === false ? "#8b1a1a" : "#2f5d3a";
  }

  function wsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    // When served from hub (different port), connect to game server port
    const host = location.hostname || "127.0.0.1";
    if (String(location.port) === String(WS_PORT) || !location.port) {
      return proto + "//" + host + (location.port ? ":" + location.port : "") + "/ws";
    }
    return proto + "//" + host + ":" + WS_PORT + "/ws";
  }

  function send(obj) {
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify(obj));
  }

  function connect() {
    const nick = (els.nick.value || "").trim() || "Lord";
    storage.setItem("evony1_nick", nick);
    const url = wsUrl();
    setStatus("Connecting…");
    const ws = new WebSocket(url);
    state.ws = ws;
    ws.onopen = () => {
      state.connected = true;
      send({ type: "hello", device_id: deviceId(), nick: nick });
      setStatus(EvonyI18n.t("connected"), true);
    };
    ws.onclose = () => {
      state.connected = false;
      setStatus("Disconnected — retrying…", false);
      setTimeout(connect, 2000);
    };
    ws.onerror = () => setStatus("Socket error", false);
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg.type === "snapshot" && msg.snapshot) {
        applySnapshot(msg.snapshot);
      } else if (msg.type === "result") {
        if (!msg.ok) setStatus(msg.error || "Failed", false);
        else if (msg.prize) setStatus("Fortune: " + JSON.stringify(msg.prize), true);
        if (msg.snapshot) applySnapshot(msg.snapshot);
      } else if (msg.type === "error") {
        setStatus(msg.error || "Error", false);
      } else if (msg.type === "chat" && msg.entry) {
        appendChat(msg.entry);
      }
    };
  }

  function applySnapshot(snap) {
    state.snapshot = snap;
    const lord = snap.lord;
    const city = snap.cities[state.cityIndex] || snap.cities[0];
    els.lordTitle.textContent = lord.title;
    els.lordNick.textContent = lord.nick;
    els.cityName.textContent = city.name;
    els.cityCoord.textContent = "(" + city.x + "," + city.y + ")";
    const prod = snap.prod_hourly || {};
    const rows = [
      ["gold", EvonyI18n.t("gold"), city.gold, prod.gold],
      ["food", EvonyI18n.t("food"), city.food, prod.food],
      ["wood", EvonyI18n.t("wood"), city.wood, prod.wood],
      ["stone", EvonyI18n.t("stone"), city.stone, prod.stone],
      ["iron", EvonyI18n.t("iron"), city.iron, prod.iron],
      ["pop", EvonyI18n.t("pop"), city.population, null],
    ];
    els.res.innerHTML = rows
      .map(([k, label, v, ph]) => {
        const extra = ph != null ? ` <small>(${ph >= 0 ? "+" : ""}${Math.round(ph)}/h)</small>` : "";
        return `<li><span>${label}</span><strong>${Math.floor(v)}${extra}</strong></li>`;
      })
      .join("");
    const qParts = [];
    if (city.build_queue) {
      const left = Math.max(0, Math.ceil(city.build_queue.complete_at - snap.server_time));
      qParts.push(`Build ${city.build_queue.type} L${city.build_queue.to_level} · ${left}s`);
    }
    if (city.train_queue) {
      const left = Math.max(0, Math.ceil(city.train_queue.complete_at - snap.server_time));
      qParts.push(`Train ${city.train_queue.count} ${city.train_queue.troop} · ${left}s`);
    }
    if (city.research_queue) {
      const left = Math.max(0, Math.ceil(city.research_queue.complete_at - snap.server_time));
      qParts.push(`Research ${city.research_queue.tech} L${city.research_queue.to_level} · ${left}s`);
    }
    (snap.marches || []).forEach((m) => {
      qParts.push(`${m.action} → (${m.to_x},${m.to_y}) [${m.status}]`);
    });
    els.queues.textContent = qParts.length ? qParts.join(" · ") : EvonyI18n.t("empty_queue");
    els.chatLog.innerHTML = (snap.chat || [])
      .map((c) => `<li><strong>${escapeHtml(c.nick)}</strong>: ${escapeHtml(c.text)}</li>`)
      .join("");
    els.ticker.textContent =
      "Server 1 · lords " + (snap.online || 1) + " · honor " + lord.honor + " · " + (new Date(snap.server_time * 1000)).toLocaleTimeString();
    updateHint();
    EvonyRender.render(els.canvas, state);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function appendChat(entry) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(entry.nick)}</strong>: ${escapeHtml(entry.text)}`;
    els.chatLog.appendChild(li);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function updateHint() {
    const sel = state.selected;
    if (!sel) {
      els.hint.textContent = EvonyI18n.t("select_tile");
      return;
    }
    if (sel.kind === "building") {
      els.hint.textContent = sel.building
        ? sel.building.type + " L" + sel.building.level + " — tap Build panel to upgrade"
        : "Empty plot " + sel.slot;
    } else if (sel.kind === "field") {
      els.hint.textContent = sel.field
        ? sel.field.type + " L" + sel.field.level
        : "Empty field slot " + sel.slot;
    } else if (sel.kind === "map") {
      els.hint.textContent = "Tile (" + sel.x + "," + sel.y + ") — Scout / Attack from Troops panel";
    }
  }

  function showModal(title, html) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.modal.hidden = false;
  }
  function hideModal() {
    els.modal.hidden = true;
  }

  function city() {
    return state.snapshot && state.snapshot.cities[state.cityIndex];
  }

  function openBuildPanel() {
    const c = city();
    if (!c) return;
    const cat = state.snapshot.catalog.buildings;
    const fieldCat = state.snapshot.catalog.fields;
    let html = "<ul class='modal-list'>";
    if (state.view === "city") {
      Object.keys(fieldCat).forEach((ftype) => {
        const existing = state.selected && state.selected.field;
        const label = existing && existing.type === ftype
          ? `Upgrade ${ftype} → L${existing.level + 1}`
          : `Build ${ftype}`;
        html += `<li><span>${label}</span><button type="button" data-act="field" data-ft="${ftype}">Go</button></li>`;
      });
    } else {
      if (state.selected && state.selected.building) {
        const b = state.selected.building;
        html += `<li><span>Upgrade ${b.type} → L${b.level + 1}</span><button type="button" data-act="up-b" data-id="${b.id}" data-bt="${b.type}">Go</button></li>`;
      }
      Object.keys(cat).forEach((bt) => {
        html += `<li><span>Build ${cat[bt].name}</span><button type="button" data-act="new-b" data-bt="${bt}">Go</button></li>`;
      });
    }
    html += "</ul>";
    showModal(EvonyI18n.t("build"), html);
    els.modalBody.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        if (act === "field") {
          const payload = {
            type: "build",
            city_id: c.id,
            kind: "field",
            build_type: btn.getAttribute("data-ft"),
          };
          if (state.selected && state.selected.field) payload.field_id = state.selected.field.id;
          else payload.slot = (state.selected && state.selected.slot) || c.fields.length;
          send(payload);
        } else if (act === "up-b") {
          send({
            type: "build",
            city_id: c.id,
            kind: "building",
            build_type: btn.getAttribute("data-bt"),
            building_id: btn.getAttribute("data-id"),
          });
        } else if (act === "new-b") {
          send({
            type: "build",
            city_id: c.id,
            kind: "building",
            build_type: btn.getAttribute("data-bt"),
            slot: (state.selected && state.selected.slot != null) ? state.selected.slot : c.buildings.length,
          });
        }
        hideModal();
      });
    });
  }

  function openTroopsPanel() {
    const c = city();
    if (!c) return;
    const troops = state.snapshot.catalog.troops;
    let html = "<p>Owned: " +
      Object.keys(c.troops)
        .filter((k) => c.troops[k] > 0)
        .map((k) => k + "×" + c.troops[k])
        .join(", ") +
      "</p><ul class='modal-list'>";
    Object.keys(troops).forEach((tid) => {
      html += `<li><span>${troops[tid].name}</span><button type="button" data-train="${tid}">Train 5</button></li>`;
    });
    if (state.view === "map" && state.selected && state.selected.kind === "map") {
      html += `<li><span>${EvonyI18n.t("scout")} (${state.selected.x},${state.selected.y})</span><button type="button" data-march="scout">Go</button></li>`;
      html += `<li><span>${EvonyI18n.t("attack")} 20 warriors</span><button type="button" data-march="attack">Go</button></li>`;
    }
    html += "</ul>";
    showModal(EvonyI18n.t("troops"), html);
    els.modalBody.querySelectorAll("[data-train]").forEach((btn) => {
      btn.addEventListener("click", () => {
        send({ type: "train", city_id: c.id, troop: btn.getAttribute("data-train"), count: 5 });
        hideModal();
      });
    });
    els.modalBody.querySelectorAll("[data-march]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-march");
        const troopsSend = action === "scout" ? { scout: Math.min(1, c.troops.scout || 0) } : { warrior: Math.min(20, c.troops.warrior || 0) };
        send({
          type: "march",
          city_id: c.id,
          action: action,
          x: state.selected.x,
          y: state.selected.y,
          troops: troopsSend,
        });
        hideModal();
      });
    });
  }

  function openResearchPanel() {
    const c = city();
    if (!c) return;
    const research = state.snapshot.lord.research;
    const cat = state.snapshot.catalog.research;
    let html = "<ul class='modal-list'>";
    Object.keys(cat).forEach((key) => {
      const lv = research[key] || 0;
      html += `<li><span>${cat[key].name} L${lv}</span><button type="button" data-tech="${key}">Research</button></li>`;
    });
    html += "</ul>";
    showModal(EvonyI18n.t("research"), html);
    els.modalBody.querySelectorAll("[data-tech]").forEach((btn) => {
      btn.addEventListener("click", () => {
        send({ type: "research", city_id: c.id, tech: btn.getAttribute("data-tech") });
        hideModal();
      });
    });
  }

  function openQuests() {
    const lord = state.snapshot.lord;
    const quests = state.snapshot.catalog.quests;
    let html = "<ul class='modal-list'>";
    quests.forEach((q) => {
      const st = (lord.quests || {})[q.id] || {};
      const status = st.claimed ? "claimed" : st.done ? "done" : "open";
      html += `<li><span>${q.title} — ${status}<br><small>${q.desc}</small></span>`;
      if (st.done && !st.claimed) {
        html += `<button type="button" data-qid="${q.id}">Claim</button>`;
      }
      html += "</li>";
    });
    html += "</ul>";
    showModal(EvonyI18n.t("quests"), html);
    els.modalBody.querySelectorAll("[data-qid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        send({ type: "claim_quest", quest_id: btn.getAttribute("data-qid") });
        hideModal();
      });
    });
  }

  function openReports() {
    const reports = state.snapshot.reports || [];
    let html = "<ul class='modal-list'>";
    reports.forEach((r) => {
      html += `<li><span><strong>${escapeHtml(r.title)}</strong><br><small>${escapeHtml(r.body)}</small></span></li>`;
    });
    if (!reports.length) html += "<li>No reports yet</li>";
    html += "</ul>";
    showModal(EvonyI18n.t("reports"), html);
  }

  // events
  els.server1.addEventListener("click", () => {
    els.lobby.hidden = true;
    els.game.hidden = false;
    connect();
    requestAnimationFrame(loop);
  });

  els.lang.addEventListener("click", () => EvonyI18n.toggle());

  document.querySelectorAll(".view-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".view-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.view = tab.getAttribute("data-view");
      state.selected = null;
      if (state.view === "map" && state.snapshot) {
        const c = city();
        send({ type: "map_query", x: c.x, y: c.y, w: 11, h: 11 });
      }
      updateHint();
      EvonyRender.render(els.canvas, state);
    });
  });

  els.canvas.addEventListener("pointerdown", (e) => {
    const hit = EvonyRender.hitTest(els.canvas, state, e.clientX, e.clientY);
    state.selected = hit;
    updateHint();
    EvonyRender.render(els.canvas, state);
  });

  document.querySelectorAll(".icon-btn[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-panel");
      if (p === "build") openBuildPanel();
      else if (p === "troops") openTroopsPanel();
      else if (p === "research") openResearchPanel();
      else if (p === "mail") openReports();
    });
  });

  document.getElementById("btn-quests").addEventListener("click", openQuests);
  document.getElementById("btn-reports").addEventListener("click", openReports);
  document.getElementById("btn-wheel").addEventListener("click", () => send({ type: "spin_wheel" }));
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm(EvonyI18n.t("reset_confirm"))) return;
    send({ type: "reset_account", nick: els.nick.value || "Lord" });
  });
  els.modalClose.addEventListener("click", hideModal);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) hideModal();
  });

  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    send({ type: "chat", text: text });
    els.chatInput.value = "";
  });

  function loop() {
    if (!els.game.hidden) {
      if (state.snapshot) {
        const t = state.snapshot.server_time + (Date.now() / 1000 - (state._snapAt || Date.now() / 1000));
        // refresh clock from last snapshot time roughly
        els.clock.textContent = new Date().toLocaleTimeString();
        EvonyRender.render(els.canvas, state);
      }
      requestAnimationFrame(loop);
    }
  }

  // poll ping to refresh queues
  setInterval(() => {
    if (state.connected) send({ type: "ping" });
  }, 5000);

  window.addEventListener("resize", () => EvonyRender.render(els.canvas, state));
})();
