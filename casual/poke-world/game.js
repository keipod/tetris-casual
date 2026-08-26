/* 포켓몬월드 — online multiplayer client (WS). */
(function () {
  "use strict";

  const NICK_KEY = "poke_world_nick_v1";
  const POKE_KEY = "poke_world_poke_v1";
  const DEFAULT_WS_PORT = "48939";
  const ART = (dex) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;

  const $ = (id) => document.getElementById(id);
  const screenLobby = $("screen-lobby");
  const screenPlay = $("screen-play");
  const connChip = $("conn-chip");
  const connLabel = $("conn-label");
  const playerList = $("player-list");
  const nickInput = $("nick-input");
  const pokeSelect = $("poke-select");
  const roomBox = $("room-box");
  const roomCodeValue = $("room-code-value");
  const roomSeats = $("room-seats");
  const boardEl = $("board");
  const playerRail = $("player-rail");
  const logStrip = $("log-strip");
  const diceFace = $("dice-face");
  const btnRoll = $("btn-roll");
  const actionHint = $("action-hint");
  const turnChip = $("turn-chip");
  const overlay = $("overlay");
  const overlayCard = $("overlay-card");
  const helpOverlay = $("help-overlay");

  let ws = null;
  let myId = null;
  let myNick = localStorage.getItem(NICK_KEY) || "";
  let catalog = [];
  let itemsCatalog = {};
  let typeKo = {};
  let shopPrices = {};
  let state = null;
  let room = null;
  let overlayMode = null;
  let boardBuilt = false;
  let reconnectTimer = null;

  const TILE_ICO = {
    start: "🏁",
    wild: "🌿",
    item: "🎁",
    event: "🎲",
    gym: "🏅",
    shop: "🏪",
    rest: "💖",
    duel: "⚔️",
  };

  function wsUrl() {
    const override = document.querySelector('meta[name="pw-ws"]')?.content?.trim();
    if (override) return override;
    const wsPort = document.querySelector('meta[name="pw-ws-port"]')?.content?.trim() || DEFAULT_WS_PORT;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    if (location.port && location.port !== wsPort) {
      return `${proto}://${location.hostname}:${wsPort}/ws`;
    }
    if (location.pathname.includes("/casual/poke-world")) {
      return `${proto}://${location.host}/casual/poke-world/ws`;
    }
    return `${proto}://${location.hostname}:${wsPort}/ws`;
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function setConn(mode, label) {
    connChip.className = `conn-chip ${mode}`;
    connLabel.textContent = label;
  }

  function connect() {
    setConn("connecting", "서버 연결 중…");
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      setConn("down", "연결 실패");
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      setConn("ok", "접속됨");
      send({ type: "hello", nick: myNick || undefined });
    };
    ws.onclose = () => {
      setConn("down", "연결 끊김");
      scheduleReconnect();
    };
    ws.onerror = () => setConn("down", "연결 오류");
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      onMessage(msg);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case "welcome":
        myId = msg.id;
        myNick = msg.nick;
        nickInput.value = myNick;
        if (msg.pokemon) {
          catalog = msg.pokemon;
          fillPokeSelect();
        }
        if (msg.items) itemsCatalog = msg.items;
        break;
      case "lobby":
        renderLobby(msg.players || []);
        break;
      case "room":
      case "room_created":
        room = msg;
        showRoom(msg);
        break;
      case "room_closed":
        room = null;
        roomBox.classList.add("hidden");
        toast("방이 닫혔어요");
        break;
      case "match":
        state = msg.state;
        if (state.itemsCatalog) itemsCatalog = state.itemsCatalog;
        if (state.typeKo) typeKo = state.typeKo;
        if (state.shopPrices) shopPrices = state.shopPrices;
        enterPlay();
        renderMatch();
        break;
      case "error":
        toast(msg.message || "오류");
        break;
      case "toast":
        toast(msg.message || "");
        break;
      case "invite":
        showInvite(msg);
        break;
      default:
        break;
    }
  }

  function toast(t) {
    if (!t) return;
    if (logStrip && !screenPlay.classList.contains("hidden")) {
      logStrip.textContent = t;
    }
    let el = $("toast-float");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast-float";
      el.className = "toast-float";
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(el._hide);
    el._hide = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function showInvite(msg) {
    const code = (msg.code || "").toUpperCase();
    if (!code) return;
    showOverlay(
      `<h2>초대</h2>
      <p><strong>${esc(msg.fromNick || "친구")}</strong>님이 방에 초대했어요</p>
      <p class="stat-line">코드 ${esc(code)}</p>
      <div class="room-actions" style="justify-content:center;margin-top:12px;gap:8px;display:flex;flex-wrap:wrap">
        <button type="button" class="btn primary" id="btn-invite-accept">수락</button>
        <button type="button" class="btn ghost" id="btn-invite-decline">거절</button>
      </div>`,
      "invite"
    );
    $("btn-invite-accept").onclick = () => {
      hideOverlay();
      send({
        type: "accept_invite",
        code,
        pokemonId: pokeSelect.value || localStorage.getItem(POKE_KEY) || "bulbasaur",
      });
    };
    $("btn-invite-decline").onclick = () => hideOverlay();
  }

  function fillPokeSelect() {
    const saved = localStorage.getItem(POKE_KEY) || "pikachu";
    pokeSelect.innerHTML = catalog
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === saved ? "selected" : ""}>${esc(p.name)} (${esc((typeKo[p.type] || p.type))})</option>`
      )
      .join("");
  }

  function renderLobby(players) {
    if (!players.length) {
      playerList.innerHTML = `<p class="player-list-empty">접속한 다른 플레이어가 없어요 · 방을 만들어 초대하세요</p>`;
      return;
    }
    playerList.innerHTML = players
      .map((p) => {
        const me = p.id === myId;
        const busy = p.busy ? " · 플레이 중" : "";
        const canInvite = !me && !p.busy && !state && (!room || room.hostId === myId);
        const inviteBtn = canInvite
          ? `<button type="button" class="btn ghost btn-invite" data-invite="${esc(p.id)}">초대</button>`
          : "";
        return `<div class="lobby-row"><strong>${esc(p.nick)}</strong><span>${me ? " (나)" : ""}${busy}</span>${inviteBtn}</div>`;
      })
      .join("");
    playerList.querySelectorAll("[data-invite]").forEach((btn) => {
      btn.onclick = () =>
        send({
          type: "invite",
          targetId: btn.getAttribute("data-invite"),
          pokemonId: pokeSelect.value || localStorage.getItem(POKE_KEY) || "pikachu",
        });
    });
  }

  function showRoom(msg) {
    roomBox.classList.remove("hidden");
    roomCodeValue.textContent = msg.code || "------";
    const seats = msg.seats || [];
    roomSeats.innerHTML = seats
      .map(
        (s, i) =>
          `<div class="lobby-row"><span class="seat-dot" style="background:var(--c${i},#888)"></span>${esc(s.nick)}${s.id === msg.hostId ? " ·방장" : ""}${s.id === myId ? " (나)" : ""}</div>`
      )
      .join("");
    const isHost = msg.hostId === myId;
    $("btn-room-start").disabled = !isHost;
    $("fill-cpu").disabled = !isHost;
    $("target-seats").disabled = !isHost;
  }

  function enterPlay() {
    screenLobby.classList.add("hidden");
    screenPlay.classList.remove("hidden");
    if (!boardBuilt && state?.board) {
      buildBoard(state.board);
      boardBuilt = true;
    }
  }

  function showLobbyScreen() {
    screenPlay.classList.add("hidden");
    screenLobby.classList.remove("hidden");
    hideOverlay();
    state = null;
    boardBuilt = false;
    boardEl.innerHTML = "";
  }

  function tilePos(i, n) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { left: 50 + 42 * Math.cos(t), top: 50 + 42 * Math.sin(t) };
  }

  function shortName(tile) {
    const m = { start: "출발", rest: "센터", duel: "시합", shop: "상점", item: "아이템", event: "사건", gym: "체육관", wild: "풀숲" };
    return m[tile.kind] || tile.name;
  }

  function buildBoard(board) {
    boardEl.innerHTML = "";
    const n = board.length;
    board.forEach((tile, i) => {
      const pos = tilePos(i, n);
      const el = document.createElement("div");
      el.className = `tile kind-${tile.kind}`;
      el.id = `tile-${i}`;
      el.style.left = `${pos.left}%`;
      el.style.top = `${pos.top}%`;
      el.innerHTML = `<span class="tile-ico">${TILE_ICO[tile.kind] || "·"}</span><span>${shortName(tile)}</span>`;
      el.title = `${tile.name} — ${tile.hint || ""}`;
      boardEl.appendChild(el);
    });
    for (let i = 0; i < 4; i++) {
      const m = document.createElement("div");
      m.className = "meeple";
      m.id = `meeple-${i}`;
      m.hidden = true;
      boardEl.appendChild(m);
    }
  }

  function isMyTurn() {
    return state && state.turn === state.you && !state.winnerId;
  }

  function renderMatch() {
    if (!state) return;
    const turnP = state.players.find((p) => p.id === state.turn) || state.players[0];
    const me = state.players.find((p) => p.id === state.you);

    turnChip.textContent = turnP ? `${turnP.nick} 차례` : "";
    if (turnP) turnChip.style.borderBottom = `4px solid ${turnP.color}`;
    diceFace.textContent = state.lastDice ?? "?";

    const canRoll = isMyTurn() && state.phase === "playing" && state.awaitingRoll;
    btnRoll.disabled = !canRoll;
    actionHint.textContent = hintText(turnP);

    document.querySelectorAll(".tile").forEach((el) => el.classList.remove("is-here"));
    state.players.forEach((p) => {
      if (p.eliminated) return;
      const t = document.getElementById(`tile-${p.pos}`);
      if (t) t.classList.add("is-here");
    });

    const n = (state.board || []).length || 24;
    state.players.forEach((p, i) => {
      const m = document.getElementById(`meeple-${i}`);
      if (!m) return;
      if (p.eliminated) {
        m.hidden = true;
        return;
      }
      m.hidden = false;
      m.style.background = p.color;
      const pos = tilePos(p.pos, n);
      const jitter = (i - (state.players.length - 1) / 2) * 3;
      m.style.left = `calc(${pos.left}% + ${jitter}px)`;
      m.style.top = `calc(${pos.top}% + ${8 + i * 2}px)`;
    });
    for (let i = state.players.length; i < 4; i++) {
      const m = document.getElementById(`meeple-${i}`);
      if (m) m.hidden = true;
    }

    playerRail.innerHTML = state.players
      .map((p) => {
        const hpPct = Math.max(0, Math.round((p.mon.hp / p.mon.maxHp) * 100));
        const badges = (p.badges || [])
          .map((b) => `<span class="badge-pip ${b}" title="${typeKo[b] || b}"></span>`)
          .join("");
        const you = p.id === state.you ? " ·나" : "";
        return `<article class="p-card ${p.id === state.turn ? "is-turn" : ""} ${p.eliminated ? "is-out" : ""}">
          <div class="p-head">
            <img src="${ART(p.mon.dex)}" alt="" loading="lazy">
            <div>
              <div class="p-name" style="color:${p.color}">${esc(p.nick)}${you}${p.isCpu ? " ·CPU" : ""}</div>
              <div class="p-stats">${esc(p.mon.name)} · ${typeKo[p.mon.type] || p.mon.type}</div>
            </div>
          </div>
          <div class="p-stats">💰${p.coins} · ⚔${p.mon.atk} · 🛡${p.mon.def} · ${esc(p.mon.abilityName || "")}</div>
          <div class="hp-bar"><i style="width:${hpPct}%"></i></div>
          <div class="badge-row">${badges || "<span class='p-stats'>배지 없음</span>"}</div>
        </article>`;
      })
      .join("");

    logStrip.textContent = (state.log && state.log[0]) || "";
    syncOverlay();
  }

  function hintText(turnP) {
    if (!state) return "";
    if (state.winnerId) return "게임 종료";
    if (!isMyTurn()) return turnP ? `${turnP.nick} 기다리는 중…` : "대기";
    if (state.phase === "battle") return "전투 중";
    if (state.phase === "shop") return "상점";
    if (state.phase === "duel_pick") return "대결 상대 선택";
    if (state.awaitingRoll) return "주사위를 굴리세요";
    return "진행 중";
  }

  function typeMult(atk, def) {
    const chart = {
      fire: { grass: 1.5, water: 0.75, fire: 0.75 },
      water: { fire: 1.5, grass: 0.75, water: 0.75 },
      grass: { water: 1.5, fire: 0.75, grass: 0.75 },
      electric: { water: 1.5, grass: 0.75, electric: 0.75 },
      psychic: { fighting: 1.5, psychic: 0.75 },
      fighting: { psychic: 0.75, fighting: 0.75 },
    };
    return (chart[atk] && chart[atk][def]) || 1;
  }

  function syncOverlay() {
    if (!state) return;
    if (state.phase === "ended") {
      showWin();
      return;
    }
    if (state.phase === "battle") {
      showBattle();
      return;
    }
    if (state.phase === "shop") {
      showShop();
      return;
    }
    if (state.phase === "duel_pick") {
      showDuel();
      return;
    }
    if (overlayMode) hideOverlay();
  }

  function showOverlay(html, mode) {
    overlayMode = mode;
    overlayCard.innerHTML = html;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }

  function hideOverlay() {
    overlayMode = null;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlayCard.innerHTML = "";
  }

  function act(action) {
    send({ type: "action", action });
  }

  function showBattle() {
    const p = state.players.find((x) => x.id === state.turn);
    const b = state.battle;
    if (!p || !b) return;
    const mine = isMyTurn();
    const foe = b.foe;
    const mult = typeMult(p.mon.type, foe.type);
    const multLabel = mult > 1.1 ? "유리!" : mult < 0.9 ? "불리…" : "보통";
    const items = (mine ? p.items : [])
      .map((id) => {
        const it = itemsCatalog[id] || { name: id, desc: "", icon: "📦" };
        return `<button type="button" class="item-btn" data-act='${JSON.stringify({ type: "use_item", itemId: id })}'>${it.icon || ""} ${esc(it.name)}<small>${esc(it.desc || "")}</small></button>`;
      })
      .join("");

    showOverlay(
      `<h2>${b.kind === "gym" ? esc(b.gymName || "체육관") : b.kind === "duel" ? "트레이너 대결" : "야생 배틀"}</h2>
      <p class="stat-line">상성 ${multLabel}</p>
      <div class="battle-grid">
        <div class="battle-mon">
          <img src="${ART(p.mon.dex)}" alt="">
          <div class="name">${esc(p.mon.name)}</div>
          <span class="type-tag ${p.mon.type}">${typeKo[p.mon.type] || p.mon.type}</span>
          <div class="hp-bar"><i style="width:${Math.round((p.mon.hp / p.mon.maxHp) * 100)}%"></i></div>
          <div class="stat-line">HP ${p.mon.hp}/${p.mon.maxHp}</div>
        </div>
        <div class="vs-mark">VS</div>
        <div class="battle-mon">
          <img src="${ART(foe.dex)}" alt="">
          <div class="name">${esc(foe.name)}</div>
          <span class="type-tag ${foe.type}">${typeKo[foe.type] || foe.type}</span>
          <div class="hp-bar"><i style="width:${Math.round((foe.hp / foe.maxHp) * 100)}%"></i></div>
          <div class="stat-line">HP ${foe.hp}/${foe.maxHp}</div>
        </div>
      </div>
      <div class="battle-actions">
        <button type="button" class="btn primary" data-act='{"type":"attack"}' ${mine && b.turn === "player" ? "" : "disabled"}>공격!</button>
        <button type="button" class="btn ghost" data-act='{"type":"flee"}' ${mine && b.canFlee && b.turn === "player" ? "" : "disabled"}>도망</button>
      </div>
      ${mine ? `<div class="item-grid">${items || "<p class='stat-line'>아이템 없음</p>"}</div>` : `<p class="stat-line">${esc(p.nick)}의 전투…</p>`}
      <div class="mini-log">${(b.log || []).slice(0, 5).map((l) => `<div>${esc(l)}</div>`).join("")}</div>`,
      "battle"
    );
  }

  function showShop() {
    const p = state.players.find((x) => x.id === state.turn);
    const mine = isMyTurn();
    const rows = (state.shopOffers || [])
      .map((id) => {
        const it = itemsCatalog[id] || { name: id, desc: "", icon: "📦" };
        const price = shopPrices[id] || 99;
        return `<div class="shop-row">
          <div><strong>${it.icon || ""} ${esc(it.name)}</strong><div class="stat-line">${esc(it.desc || "")}</div></div>
          <button type="button" class="btn ghost" data-act='${JSON.stringify({ type: "shop_buy", itemId: id })}' ${mine && p && p.coins >= price ? "" : "disabled"}>${price}💰</button>
        </div>`;
      })
      .join("");
    showOverlay(
      `<h2>상점</h2>
      <p class="stat-line">${esc(p?.nick || "")} · 코인 ${p?.coins ?? 0}</p>
      <div class="shop-list">${rows}</div>
      <button type="button" class="btn primary" data-act='{"type":"shop_leave"}' ${mine ? "" : "disabled"}>나가기</button>`,
      "shop"
    );
  }

  function showDuel() {
    const mine = isMyTurn();
    const rows = (state.pendingDuel?.candidates || [])
      .map((id) => {
        const o = state.players.find((x) => x.id === id);
        if (!o) return "";
        return `<button type="button" class="btn ghost" data-act='${JSON.stringify({ type: "duel_pick", targetId: id })}' ${mine ? "" : "disabled"}
          style="border-left:6px solid ${o.color}">${esc(o.nick)} · 배지 ${o.badges.length}</button>`;
      })
      .join("");
    showOverlay(
      `<h2>시합장</h2>
      <p>대결할 트레이너를 고르세요</p>
      <div class="duel-list">${rows}</div>
      <button type="button" class="btn primary" data-act='{"type":"duel_skip"}' ${mine ? "" : "disabled"}>패스</button>`,
      "duel"
    );
  }

  function showWin() {
    const w = state.players.find((p) => p.id === state.winnerId);
    showOverlay(
      `<div class="win-banner">
        <h2>우승!</h2>
        ${w ? `<img src="${ART(w.mon.dex)}" alt=""><p><strong>${esc(w.nick)}</strong> 승리!</p>` : ""}
        <button type="button" class="btn primary" id="btn-back-lobby">로비로</button>
      </div>`,
      "win"
    );
  }

  // UI events
  nickInput.value = myNick;
  $("btn-nick-save").onclick = () => {
    myNick = nickInput.value.trim().slice(0, 12);
    localStorage.setItem(NICK_KEY, myNick);
    send({ type: "set_nick", nick: myNick });
  };
  pokeSelect.onchange = () => {
    localStorage.setItem(POKE_KEY, pokeSelect.value);
    if (room) send({ type: "set_pokemon", pokemonId: pokeSelect.value });
  };

  $("btn-room-create").onclick = () =>
    send({ type: "create_room", pokemonId: pokeSelect.value || localStorage.getItem(POKE_KEY) || "pikachu" });
  $("btn-room-join").onclick = () =>
    send({
      type: "join_room",
      code: $("room-code-input").value,
      pokemonId: pokeSelect.value || "bulbasaur",
    });
  $("btn-room-leave").onclick = () => {
    send({ type: "leave_room" });
    room = null;
    roomBox.classList.add("hidden");
  };
  $("btn-room-start").onclick = () =>
    send({
      type: "start_room",
      fillCpu: $("fill-cpu").checked,
      targetSeats: +$("target-seats").value,
    });
  $("btn-cpu").onclick = () =>
    send({
      type: "cpu",
      seats: 3,
      pokemonId: pokeSelect.value || localStorage.getItem(POKE_KEY) || "pikachu",
    });

  btnRoll.onclick = () => {
    diceFace.classList.remove("is-rolling");
    void diceFace.offsetWidth;
    diceFace.classList.add("is-rolling");
    act({ type: "roll" });
  };

  $("btn-quit").onclick = () => {
    if (!confirm("대전에서 나갈까요?")) return;
    send({ type: "leave_match" });
    showLobbyScreen();
  };

  overlay.onclick = (e) => {
    if (e.target.id === "btn-back-lobby") {
      send({ type: "leave_match" });
      showLobbyScreen();
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    try {
      act(JSON.parse(btn.getAttribute("data-act")));
    } catch {
      /* ignore */
    }
  };

  function openHelp() {
    helpOverlay.classList.remove("hidden");
    helpOverlay.setAttribute("aria-hidden", "false");
  }
  function closeHelp() {
    helpOverlay.classList.add("hidden");
    helpOverlay.setAttribute("aria-hidden", "true");
  }
  $("btn-help").onclick = openHelp;
  $("btn-help-play").onclick = openHelp;
  $("btn-help-close").onclick = closeHelp;
  helpOverlay.onclick = (e) => {
    if (e.target === helpOverlay) closeHelp();
  };

  // default type labels before welcome
  typeKo = { fire: "불", water: "물", grass: "풀", electric: "전기", psychic: "에스퍼", fighting: "격투" };
  connect();
})();
