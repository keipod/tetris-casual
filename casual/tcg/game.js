/* 포켓몬 카드대전 — Hearthstone-lite drag UX. No build step. */
(function () {
  "use strict";

  const NICK_KEY = "tcg_nick_v1";
  const SOUND_KEY = "tcg_sound_v1";
  const STREAK_KEY = "tcg_win_streak_v1";
  const DEFAULT_WS_PORT = "48904";

  function artUrl(dex) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
  }

  function buildWsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const override = document.querySelector('meta[name="tcg-ws"]')?.content?.trim();
    if (override) return override;
    const wsPort = document.querySelector('meta[name="tcg-ws-port"]')?.content?.trim() || DEFAULT_WS_PORT;
    if (location.port === wsPort) return `${proto}://${location.host}/ws`;
    if (!location.port && location.protocol === "https:") {
      return `${proto}://${location.host}/casual/tcg/ws`;
    }
    return `${proto}://${location.hostname}:${wsPort}/ws`;
  }

  const $ = (id) => document.getElementById(id);

  const screenLobby = $("screen-lobby");
  const screenMatch = $("screen-match");
  const nickInput = $("nick-input");
  const btnNickSave = $("btn-nick-save");
  const playerList = $("player-list");
  const btnRoomCreate = $("btn-room-create");
  const roomCodeInput = $("room-code-input");
  const btnRoomJoin = $("btn-room-join");
  const roomCodeBox = $("room-code-box");
  const roomCodeValue = $("room-code-value");
  const btnRoomCopy = $("btn-room-copy");
  const btnCpu = $("btn-cpu");
  const btnSoundLobby = $("btn-sound-lobby");
  const btnSoundMatch = $("btn-sound-match");
  const btnLeave = $("btn-leave");
  const vsMeName = $("vs-me-name");
  const vsOppName = $("vs-opp-name");
  const oppHandEl = $("opp-hand");
  const oppBench = $("opp-bench");
  const oppActive = $("opp-active");
  const prizeOpp = $("prize-opp");
  const prizeMe = $("prize-me");
  const turnCount = $("turn-count");
  const turnWhose = $("turn-whose");
  const readyTrack = $("ready-track");
  const readyMe = $("ready-me");
  const readyOpp = $("ready-opp");
  const btnEndTurn = $("btn-end-turn");
  const myActive = $("my-active");
  const myBench = $("my-bench");
  const actionBar = $("action-bar");
  const btnReady = $("btn-ready");
  const btnAttack = $("btn-attack");
  const itemDock = $("item-dock");
  const itemSlots = $("item-slots");
  const oppItemCount = $("opp-item-count");
  const shieldChip = $("shield-chip");
  const bonusChip = $("bonus-chip");
  const fieldModChip = $("field-mod-chip");
  const overlayDiscover = $("overlay-discover");
  const discoverOptions = $("discover-options");
  const resultStreak = $("result-streak");
  const resultStats = $("result-stats");
  const connChip = $("conn-chip");
  const connLabel = $("conn-label");
  const actionHint = $("action-hint");
  const myHand = $("my-hand");
  const overlayChallenge = $("overlay-challenge");
  const overlayHowto = $("overlay-howto");
  const btnHelpLobby = $("btn-help-lobby");
  const btnHelpMatch = $("btn-help-match");
  const btnHowtoClose = $("btn-howto-close");
  const btnHowtoOk = $("btn-howto-ok");
  const challengeMsg = $("challenge-msg");
  const btnChallengeAccept = $("btn-challenge-accept");
  const btnChallengeDecline = $("btn-challenge-decline");
  const overlayGameover = $("overlay-gameover");
  const resultTitle = $("result-title");
  const resultMsg = $("result-msg");
  const btnResultLobby = $("btn-result-lobby");
  const toastStack = $("toast-stack");
  const tableEl = document.querySelector(".table");
  const dragLayer = $("drag-layer");
  const dragGhost = $("drag-ghost");
  const dragArrow = $("drag-arrow");

  let soundOn = localStorage.getItem(SOUND_KEY) !== "0";
  let myNick = localStorage.getItem(NICK_KEY) || "";
  let ws = null;
  let reconnectTimer = null;
  let myId = null;
  let lobbyPlayers = [];
  let incomingChallenge = null;
  let pendingChallengeOut = null;
  let state = null;
  let busy = false;
  let sel = { mode: null };
  let lastGameOverInfo = null;
  let drag = null;
  let endTurnArmed = false;
  let endTurnTimer = null;
  let suppressClickUntil = 0;

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    showToast("서버에 연결되지 않았어요. 잠시 후 다시 시도하세요");
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) connect();
    return false;
  }

  function canAct() {
    return !!(state && state.phase !== "ended" && !busy);
  }

  function pendingDiscover() {
    const pc = state && state.pendingChoice;
    return !!(pc && pc.type === "discover_item" && pc.player === state.you && Array.isArray(pc.options));
  }

  function sendAction(action) {
    if (!canAct()) return false;
    if (pendingDiscover() && action.type !== "choose_discover") {
      showToast("아이템을 먼저 고르세요");
      return false;
    }
    return send({ type: "action", action });
  }

  function getStreak() {
    try { return parseInt(localStorage.getItem(STREAK_KEY) || "0", 10) || 0; } catch (e) { return 0; }
  }
  function setStreak(n) {
    try { localStorage.setItem(STREAK_KEY, String(Math.max(0, n))); } catch (e) { /* ignore */ }
  }

  function sfx(name) {
    if (soundOn && window.TCGFx) window.TCGFx.playSfx(name);
  }

  function setConn(mode) {
    if (!connChip) return;
    connChip.classList.remove("online", "offline", "connecting");
    if (mode === "online") {
      connChip.classList.add("online");
      connLabel.textContent = "서버 연결됨";
    } else if (mode === "offline") {
      connChip.classList.add("offline");
      connLabel.textContent = "서버 연결 안 됨 · 자동 재시도 중";
    } else {
      connChip.classList.add("connecting");
      connLabel.textContent = "서버 연결 중…";
    }
    [btnCpu, btnRoomCreate, btnRoomJoin].forEach((b) => { b.disabled = mode !== "online"; });
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    setConn("connecting");
    try {
      ws = new WebSocket(buildWsUrl());
    } catch (err) {
      showToast("웹소켓을 열 수 없습니다");
      scheduleReconnect();
      return;
    }
    ws.addEventListener("open", () => send({ type: "hello", nick: myNick }));
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handleMessage(msg);
    });
    ws.addEventListener("close", () => {
      setConn("offline");
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      if (!myId) {
        setConn("offline");
        showToast("카드대전 서버에 연결 중…");
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (screenMatch && !screenMatch.classList.contains("hidden") && state && state.phase !== "ended") {
      showToast("연결이 끊어졌습니다");
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case "welcome": return onWelcome(msg);
      case "lobby": return onLobby(msg);
      case "challenge": return onChallengeIncoming(msg);
      case "challenge_sent": return onChallengeSent(msg);
      case "challenge_declined": return onChallengeDeclined(msg);
      case "room_created": return onRoomCreated(msg);
      case "match": return onMatch(msg);
      case "error": return onErrorMsg(msg);
      default: return;
    }
  }

  function onWelcome(msg) {
    myId = msg.id;
    myNick = msg.nick;
    localStorage.setItem(NICK_KEY, myNick);
    nickInput.value = myNick;
    vsMeName.textContent = myNick;
    setConn("online");
  }

  function onLobby(msg) {
    lobbyPlayers = msg.players || [];
    renderPlayerList();
  }

  function onChallengeIncoming(msg) {
    incomingChallenge = msg;
    challengeMsg.textContent = `${msg.fromNick}님이 대전을 신청했습니다`;
    overlayChallenge.classList.remove("hidden");
    sfx("turn");
  }

  function onChallengeSent(msg) {
    pendingChallengeOut = msg;
    showToast("대전 신청을 보냈습니다");
    renderPlayerList();
  }

  function onChallengeDeclined(msg) {
    pendingChallengeOut = null;
    showToast(`${msg.by || "상대"}님이 거절했습니다`);
    renderPlayerList();
  }

  function onRoomCreated(msg) {
    roomCodeValue.textContent = msg.code;
    roomCodeBox.classList.remove("hidden");
  }

  function onErrorMsg(msg) {
    const raw = String(msg.message || "");
    const KO = {
      "진행 중인 대전 없음": "대전이 끝났어요. 로비로 돌아갈게요.",
      "match ended": "이미 끝난 대전이에요.",
      "not your turn": "지금은 상대 턴이에요.",
      "need active pokemon": "먼저 기본 포켓몬을 배치하세요.",
      "bench full": "벤치가 가득 찼어요.",
      "cannot attack now": "이번 턴 공격은 끝났어요 (마비·이미 공격)",
      "already retreated": "이번 턴에 이미 교체했어요.",
      "already used item this turn": "아이템은 턴당 1번만 쓸 수 있어요",
      "already shielded": "이미 연막이 걸려 있어요",
      "item not found": "쓸 수 있는 아이템이 없어요",
      "choose item first": "아이템을 먼저 고르세요",
      "waiting for opponent choice": "상대가 아이템을 고르는 중이에요",
      "deck empty": "덱이 비어 있어요",
      "already full hp": "이미 체력이 가득해요",
      "이미 대전 중": "이미 다른 대전 중이에요.",
    };
    showToast(KO[raw] || raw || "오류가 발생했습니다");
    sfx("error");
    if (raw === "진행 중인 대전 없음" || raw === "match ended") {
      overlayGameover.classList.add("hidden");
      state = null;
      showScreen("lobby");
    }
  }

  function onMatch(msg) {
    pendingChallengeOut = null;
    roomCodeBox.classList.add("hidden");
    showScreen("match");
    endDragVisual();
    state = msg.state;
    sel = { mode: null };
    endTurnArmed = false;
    lastGameOverInfo = (msg.events || []).find((e) => e.type === "game_over") || null;
    vsMeName.textContent = myNick || "나";
    const opp = oppId();
    const oppInfo = lobbyPlayers.find((p) => p.id === opp);
    vsOppName.textContent = opp === "cpu" ? "CPU" : (oppInfo ? oppInfo.nick : "상대");
    busy = true;
    render();
    const done = () => {
      busy = false;
      render();
      checkGameOver();
    };
    Promise.resolve()
      .then(() => window.TCGFx.queue(msg.events || [], state, { getCardEl, refresh: render, sfx }))
      .catch(() => {})
      .then(done);
  }

  function loadNick() { nickInput.value = myNick; }

  function saveNick() {
    const v = nickInput.value.trim().slice(0, 12);
    if (!v) return;
    myNick = v;
    localStorage.setItem(NICK_KEY, v);
    send({ type: "set_nick", nick: v });
    showToast("닉네임을 저장했습니다");
  }

  function renderPlayerList() {
    if (!screenMatch.classList.contains("hidden")) return;
    const others = lobbyPlayers.filter((p) => p.id !== myId);
    if (!others.length) {
      playerList.innerHTML = '<p class="player-list-empty">접속한 다른 플레이어가 없어요</p>';
      return;
    }
    playerList.innerHTML = "";
    others.forEach((p) => {
      const row = document.createElement("div");
      row.className = "player-row";
      const dot = document.createElement("span");
      dot.className = "player-dot" + (p.busy ? " busy" : "");
      const nick = document.createElement("span");
      nick.className = "player-nick";
      nick.textContent = p.nick;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost";
      const alreadyPending = pendingChallengeOut && pendingChallengeOut.toId === p.id;
      btn.textContent = p.busy ? "대전 중" : alreadyPending ? "신청함" : "대전 신청";
      btn.disabled = p.busy || !!pendingChallengeOut;
      btn.addEventListener("click", () => send({ type: "challenge", targetId: p.id }));
      row.append(dot, nick, btn);
      playerList.appendChild(row);
    });
  }

  function showScreen(name) {
    screenLobby.classList.toggle("hidden", name !== "lobby");
    screenMatch.classList.toggle("hidden", name !== "match");
    document.getElementById("app").classList.toggle("in-match", name === "match");
    if (name === "lobby") renderPlayerList();
  }

  let lastToastText = "";
  let lastToastAt = 0;
  function showToast(text) {
    const now = Date.now();
    if (text === lastToastText && now - lastToastAt < 1500) return;
    lastToastText = text;
    lastToastAt = now;
    while (toastStack.children.length >= 3) toastStack.firstChild.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function oppId() {
    if (!state) return null;
    return state.order.find((id) => id !== state.you);
  }

  function fieldMons(side) {
    return [side.active, ...side.bench].filter(Boolean);
  }

  function clearSelection() { sel = { mode: null }; }

  function getCardEl(uid) {
    if (!uid) return null;
    return document.querySelector(`.card[data-uid="${uid}"]`);
  }

  function youSide() {
    return state && state.players[state.you];
  }

  function isMyTurn() {
    return !!(state && state.phase === "playing" && state.turn === state.you);
  }

  // ================= rendering =================
  function render() {
    if (!state) return;
    renderCenterStrip();
    renderOpp();
    renderMine();
    renderItems();
    renderDiscover();
    renderHand();
    renderActionBar();
    // Mid-drag remounts destroy the source card; never leave a stuck ghost.
    if (drag && drag.srcEl && !document.body.contains(drag.srcEl)) endDragVisual();
    updateDropHighlights();
    [tableEl, actionBar, myHand].forEach((el) => {
      if (el) el.classList.toggle("busy-lock", busy || (state && state.phase === "ended"));
    });
  }

  function renderCenterStrip() {
    const you = youSide();
    const opp = state.players[oppId()];
    renderPrizeTrack(prizeMe, you.prize);
    renderPrizeTrack(prizeOpp, opp.prize);

    if (state.phase === "setup") {
      turnCount.textContent = "준비";
      turnWhose.textContent = "포켓몬 배치";
      turnWhose.classList.remove("mine");
      readyTrack.classList.remove("hidden");
      readyMe.classList.toggle("ok", !!state.setupReady[state.you]);
      readyOpp.classList.toggle("ok", !!state.setupReady[oppId()]);
      btnEndTurn.hidden = true;
      btnEndTurn.classList.remove("armed");
      return;
    }

    readyTrack.classList.add("hidden");
    turnCount.textContent = "턴 " + (Math.floor(state.turnCount / 2) + 1);
    const mine = isMyTurn();
    turnWhose.textContent = mine ? "내 턴" : "상대 턴";
    turnWhose.classList.toggle("mine", mine);
    btnEndTurn.hidden = !mine;
    btnEndTurn.disabled = busy;
    btnEndTurn.classList.toggle("armed", endTurnArmed);
    btnEndTurn.textContent = endTurnArmed ? "한 번 더 눌러 확정" : "턴 종료";
  }

  function renderPrizeTrack(container, count) {
    container.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const g = document.createElement("span");
      g.className = "prize-gem" + (i < count ? " filled" : "");
      container.appendChild(g);
    }
  }

  function emptySlotEl(dropKind) {
    const d = document.createElement("div");
    d.className = "slot-empty";
    if (dropKind) d.dataset.drop = dropKind;
    return d;
  }

  const TYPE_LABEL = {
    grass: "풀", fire: "불", water: "물", lightning: "전", psychic: "에",
    fighting: "격", darkness: "악", metal: "강", dragon: "용", colorless: "무",
  };

  const EFFECT_LABEL = { drain: "흡혈", paralyze: "마비", recoil: "반동" };

  function buildCardEl(card, status) {
    const el = document.createElement("div");
    if (!card || card.hidden) {
      el.className = "card card-back";
      return el;
    }
    const stage = card.stage || "basic";
    el.className = "card" + (card.justPlayed ? " just-played" : "") + (stage !== "basic" ? " stage-evo" : "");
    el.dataset.uid = card.uid;
    el.dataset.type = card.type;
    el.dataset.stage = stage;
    if (status && status.shielded) el.classList.add("status-shield");
    if (status && status.paralyzed) el.classList.add("status-para");

    const frame = document.createElement("div");
    frame.className = "card-frame";

    const foil = document.createElement("div");
    foil.className = "card-foil";
    foil.setAttribute("aria-hidden", "true");

    const typeBadge = document.createElement("span");
    typeBadge.className = "card-type-badge";
    typeBadge.dataset.type = card.type;
    typeBadge.textContent = TYPE_LABEL[card.type] || "?";
    typeBadge.title = card.type;

    const head = document.createElement("div");
    head.className = "card-head";
    const nameEl = document.createElement("span");
    nameEl.className = "card-name";
    nameEl.textContent = card.name;
    const hpEl = document.createElement("span");
    hpEl.className = "card-hp";
    hpEl.innerHTML = `<em>HP</em>${card.hp}`;
    head.append(nameEl, hpEl);

    const art = document.createElement("div");
    art.className = "card-art";
    const img = document.createElement("img");
    img.src = artUrl(card.dex);
    img.alt = card.name;
    img.loading = "lazy";
    img.draggable = false;
    img.addEventListener("error", () => { img.style.display = "none"; });
    art.appendChild(img);

    if (stage !== "basic") {
      const stageTag = document.createElement("span");
      stageTag.className = "card-stage-tag";
      stageTag.textContent = "진화";
      art.appendChild(stageTag);
    }
    if (status && status.shielded) {
      const st = document.createElement("span");
      st.className = "card-status-tag shield";
      st.textContent = "연막";
      art.appendChild(st);
    }
    if (status && status.paralyzed) {
      const st = document.createElement("span");
      st.className = "card-status-tag para";
      st.textContent = "마비";
      art.appendChild(st);
    }

    const atk = card.attack || (card.attacks && card.attacks[0]);
    const atkRow = document.createElement("div");
    atkRow.className = "card-atk";
    if (atk) {
      const an = document.createElement("span");
      an.className = "card-atk-name";
      an.textContent = atk.name;
      const ad = document.createElement("span");
      ad.className = "card-atk-dmg";
      ad.textContent = atk.damage;
      atkRow.append(an, ad);
      if (atk.effect && EFFECT_LABEL[atk.effect]) {
        const ef = document.createElement("span");
        ef.className = "card-effect-badge";
        ef.dataset.effect = atk.effect;
        ef.textContent = EFFECT_LABEL[atk.effect];
        ef.title = EFFECT_LABEL[atk.effect];
        atkRow.appendChild(ef);
      }
    }

    if (card.weakness) {
      const weak = document.createElement("span");
      weak.className = "card-weak";
      weak.dataset.type = card.weakness;
      weak.title = "약점 " + (TYPE_LABEL[card.weakness] || card.weakness);
      weak.textContent = TYPE_LABEL[card.weakness] || "!";
      atkRow.appendChild(weak);
    }

    const hpBar = document.createElement("div");
    hpBar.className = "hp-bar";
    const hpFill = document.createElement("div");
    hpFill.className = "hp-fill";
    const pct = card.maxHp ? Math.max(0, (card.hp / card.maxHp) * 100) : 0;
    hpFill.style.width = pct + "%";
    if (pct <= 30) hpFill.classList.add("low");
    hpBar.appendChild(hpFill);

    frame.append(foil, typeBadge, head, art, atkRow, hpBar);
    el.appendChild(frame);
    return el;
  }

  function renderOpp() {
    const opp = state.players[oppId()];
    const you = youSide();
    oppHandEl.innerHTML = "";
    for (let i = 0; i < opp.handCount; i++) {
      const back = document.createElement("div");
      back.className = "card card-back";
      oppHandEl.appendChild(back);
    }
    oppBench.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement("div");
      slot.className = "bench-slot";
      slot.appendChild(opp.bench[i] ? buildCardEl(opp.bench[i]) : emptySlotEl());
      oppBench.appendChild(slot);
    }
    oppActive.innerHTML = "";
    oppActive.dataset.drop = "attack";
    const cardEl = opp.active
      ? buildCardEl(opp.active, { shielded: !!opp.skipNextAttack, paralyzed: !!opp.paralyzed })
      : emptySlotEl();
    if (opp.active) {
      cardEl.dataset.drop = "attack";
      if (isMyTurn() && you.canAttack && !busy) cardEl.classList.add("attack-target");
    }
    if (isMyTurn() && you.canAttack && !busy) oppActive.classList.add("attack-hot");
    else oppActive.classList.remove("attack-hot");
    oppActive.appendChild(cardEl);
  }

  function renderMine() {
    const you = youSide();
    myBench.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement("div");
      slot.className = "bench-slot";
      slot.dataset.drop = "bench";
      const card = you.bench[i];
      if (card) {
        const el = buildCardEl(card);
        el.dataset.drop = "retreat";
        decorateOwnField(el, card, "bench");
        if (isMyTurn() && you.canRetreat && !busy) el.classList.add("can-swap");
        el.addEventListener("click", () => onOwnFieldClick(card, "bench"));
        bindPointerDrag(el, { kind: "field", card, where: "bench" });
        slot.appendChild(el);
      } else {
        slot.appendChild(emptySlotEl("bench"));
      }
      myBench.appendChild(slot);
    }

    myActive.innerHTML = "";
    myActive.dataset.drop = "active";
    myActive.classList.toggle("shielded", !!(you && you.skipNextAttack));
    if (you.active) {
      const el = buildCardEl(you.active, {
        shielded: !!you.skipNextAttack,
        paralyzed: !!you.paralyzed,
      });
      decorateOwnField(el, you.active, "active");
      if (you.canAttack) el.classList.add("can-attack");
      el.addEventListener("click", () => onOwnFieldClick(you.active, "active"));
      bindPointerDrag(el, { kind: "field", card: you.active, where: "active" });
      myActive.appendChild(el);
    } else {
      myActive.appendChild(emptySlotEl("active"));
    }
  }

  function decorateOwnField(el, card, where) {
    if (busy) return;
    if (sel.mode === "evolve" && sel.evolveTargets && sel.evolveTargets.includes(card.uid)) {
      el.classList.add("target-pick");
    }
  }

  function renderHand() {
    const you = youSide();
    myHand.innerHTML = "";
    you.hand.forEach((card) => {
      if (card.hidden) return;
      const el = buildCardEl(card);
      applyHandClasses(el, card);
      el.addEventListener("click", () => onHandCardClick(card));
      bindPointerDrag(el, { kind: "hand", card });
      myHand.appendChild(el);
    });
  }

  function applyHandClasses(el, card) {
    if (busy) return;
    const you = youSide();
    if (state.phase === "setup") {
      if (!you.active || you.bench.length < 3) el.classList.add("selectable");
      return;
    }
    if (!isMyTurn()) return;
    if (you.bench.length < 3) el.classList.add("selectable");
    const meta = state.catalog[card.cardId] || {};
    if (meta.evolvesFrom) {
      const targets = fieldMons(you).filter((m) => m.cardId === meta.evolvesFrom && !m.justPlayed);
      if (targets.length) el.classList.add("can-evolve");
    }
    if (sel.mode === "evolve" && sel.handUid === card.uid) el.classList.add("selected");
  }

  function renderDiscover() {
    if (!overlayDiscover || !discoverOptions) return;
    const choosing = pendingDiscover() && !busy;
    overlayDiscover.classList.toggle("hidden", !choosing);
    if (!choosing) {
      discoverOptions.innerHTML = "";
      return;
    }
    const opts = state.pendingChoice.options || [];
    discoverOptions.innerHTML = "";
    opts.forEach((o) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "discover-card";
      btn.dataset.itemId = o.itemId;
      btn.innerHTML = `<strong>${o.name}</strong><span>${o.desc || ""}</span>`;
      btn.addEventListener("click", () => {
        if (!canAct()) return;
        sendAction({ type: "choose_discover", uid: o.uid });
      });
      discoverOptions.appendChild(btn);
    });
  }

  function renderItems() {
    if (!itemDock || !itemSlots) return;
    const you = youSide();
    const opp = state.players[oppId()];
    const items = (you && you.items) || [];
    const canUse = !!(you && you.canUseItem && !busy && !pendingDiscover());
    itemSlots.innerHTML = "";

    const hasMine = items.length > 0;
    const oppCount = (opp && opp.itemCount) || 0;
    const shielded = !!(you && you.skipNextAttack);
    const bonus = (you && you.nextAttackBonus) || 0;
    itemDock.hidden = !(hasMine || oppCount || shielded || bonus || (state.fieldModifier && state.fieldModifier.name) || state.phase === "playing");

    items.forEach((it) => {
      if (it.hidden) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-chip" + (canUse ? " usable" : "");
      btn.dataset.itemId = it.itemId;
      btn.title = it.desc || it.name;
      btn.innerHTML = `<span class="item-chip-name">${it.name}</span>`;
      btn.disabled = !canUse;
      btn.addEventListener("click", () => {
        if (!canAct() || !canUse) return;
        sendAction({ type: "use_item", uid: it.uid });
      });
      itemSlots.appendChild(btn);
    });

    if (oppItemCount) {
      if (oppCount > 0) {
        oppItemCount.hidden = false;
        oppItemCount.textContent = `상대 아이템 ${oppCount}`;
      } else {
        oppItemCount.hidden = true;
      }
    }
    if (shieldChip) shieldChip.hidden = !shielded;
    if (bonusChip) {
      if (bonus > 0) {
        bonusChip.hidden = false;
        bonusChip.textContent = `다음 공격 +${bonus}`;
      } else {
        bonusChip.hidden = true;
      }
    }
    if (fieldModChip) {
      const mod = state.fieldModifier;
      if (mod && mod.name) {
        fieldModChip.hidden = false;
        fieldModChip.textContent = mod.name;
        fieldModChip.title = mod.desc || mod.name;
      } else {
        fieldModChip.hidden = true;
      }
    }
  }

  function renderActionBar() {
    btnReady.hidden = true;
    btnAttack.hidden = true;
    actionHint.textContent = "";
    if (state.phase === "setup") {
      renderSetupHint();
      return;
    }
    if (state.phase !== "playing") return;
    if (pendingDiscover()) {
      actionHint.textContent = "아이템 3장 중 하나를 고르세요";
      return;
    }
    if (!isMyTurn()) {
      const pc = state.pendingChoice;
      actionHint.textContent = (pc && pc.player !== state.you)
        ? "상대가 아이템을 고르는 중…"
        : "상대의 턴입니다";
      return;
    }
    const you = youSide();
    if (sel.mode === "evolve") {
      actionHint.textContent = "진화시킬 포켓몬을 탭하세요";
      return;
    }
    const itemHint = you.canUseItem ? " · 아이템 사용 가능" : "";
    if (you.canAttack) {
      btnAttack.hidden = false;
      actionHint.textContent = "공격해도 턴이 안 끝나요 · 드래그/탭으로 공격 후 턴 종료" + itemHint;
    } else if (you.attackedThisTurn) {
      actionHint.textContent = "공격 완료 · 손패·아이템을 더 쓰거나 턴 종료" + itemHint;
    } else if (you.canRetreat) {
      actionHint.textContent = "벤치를 탭하면 교체 · 손패를 필드로" + itemHint;
    } else {
      actionHint.textContent = "손패를 내거나 턴을 종료하세요" + itemHint;
    }
  }

  function renderSetupHint() {
    const you = youSide();
    if (you.active && !state.setupReady[state.you]) btnReady.hidden = false;
    if (!you.active) actionHint.textContent = "손패 카드를 탭하거나 가운데로 드래그하세요";
    else if (you.bench.length < 3) actionHint.textContent = "벤치에 더 배치할 수 있어요 (선택) · 모든 카드 OK";
    else if (!state.setupReady[state.you]) actionHint.textContent = "배틀 시작을 누르면 대전이 시작돼요!";
    else actionHint.textContent = "상대의 준비를 기다리는 중…";
  }

  function updateDropHighlights() {
    document.querySelectorAll(".drop-hot").forEach((el) => el.classList.remove("drop-hot", "drop-attack", "drop-retreat", "drop-play"));
    if (!drag || !drag.validDrops) return;
    drag.validDrops.forEach((d) => {
      const el = resolveDropEl(d);
      if (!el) return;
      el.classList.add("drop-hot");
      if (d.kind === "attack") el.classList.add("drop-attack");
      if (d.kind === "retreat") el.classList.add("drop-retreat");
      if (d.kind === "bench" || d.kind === "active" || d.kind === "evolve") el.classList.add("drop-play");
    });
  }

  function resolveDropEl(d) {
    if (d.kind === "attack") return oppActive;
    if (d.kind === "bench") return myBench;
    if (d.kind === "active") return myActive;
    if (d.kind === "retreat" && d.uid) return getCardEl(d.uid);
    if (d.kind === "evolve" && d.uid) return getCardEl(d.uid);
    return null;
  }

  // ================= interactions =================
  function onHandCardClick(card) {
    if (!canAct() || drag) return;
    if (Date.now() < suppressClickUntil) return;
    if (sel.mode === "retreat") clearSelection();
    const you = youSide();

    if (state.phase === "setup") {
      if (!you.active) {
        sendAction({ type: "setup_active", uid: card.uid });
      } else if (you.bench.length < 3) {
        sendAction({ type: "setup_bench", uid: card.uid });
      } else {
        showToast("벤치가 가득 찼어요");
      }
      return;
    }

    if (!isMyTurn()) { showToast("지금은 낼 수 없어요"); return; }

    if (sel.mode === "evolve" && sel.handUid === card.uid) {
      clearSelection();
      render();
      return;
    }

    // Tap always plays to field. Evolve only via drag onto matching Pokémon.
    if (you.bench.length >= 3) { showToast("벤치가 가득 찼어요"); return; }
    sendAction({ type: "play_basic", uid: card.uid });
  }

  function onOwnFieldClick(card, where) {
    if (!canAct() || drag) return;
    if (Date.now() < suppressClickUntil) return;
    if (!isMyTurn() && state.phase !== "setup") return;

    if (sel.mode === "evolve") {
      if (sel.evolveTargets.includes(card.uid)) {
        sendAction({ type: "evolve", handUid: sel.handUid, targetUid: card.uid });
      }
      clearSelection();
      render();
      return;
    }

    const you = youSide();
    if (where === "bench" && isMyTurn() && you.canRetreat) {
      sendAction({ type: "retreat", benchUid: card.uid });
      return;
    }

    if (where === "active" && isMyTurn() && you.canAttack) {
      showToast("공격 버튼 또는 상대 포켓몬을 탭하세요");
    }
  }

  // Tap opponent active → attack (no drag needed)
  oppActive.addEventListener("click", () => {
    if (!canAct() || !isMyTurn()) return;
    const you = youSide();
    if (you.canAttack) {
      clearSelection();
      sendAction({ type: "attack" });
    } else {
      showToast("공격은 턴당 1번! 공격하면 턴이 넘어가요");
      send({ type: "sync" });
    }
  });

  btnAttack.addEventListener("click", () => {
    if (!canAct() || !isMyTurn()) return;
    const you = youSide();
    if (!you.canAttack) {
      send({ type: "sync" });
      return;
    }
    clearSelection();
    sendAction({ type: "attack" });
  });

  // ================= drag / drop =================
  function bindPointerDrag(el, payload) {
    el.addEventListener("pointerdown", (e) => {
      if (!canAct() || e.button === 2) return;
      if (e.target.closest("button")) return;
      const start = { x: e.clientX, y: e.clientY };
      let started = false;
      const pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (err) { /* ignore */ }

      // Listen on document so pointerup still fires if the source card is
      // destroyed by render() mid-drag, or the pointer leaves the element.
      const onMove = (ev) => {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!started && Math.hypot(dx, dy) < 10) return;
        if (!started) {
          if (!beginDrag(payload, start.x, start.y, el)) {
            cleanup();
            return;
          }
          started = true;
          el.classList.add("dragging-src");
        }
        updateDrag(ev.clientX, ev.clientY);
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pid) return;
        cleanup();
        if (started) {
          finishDrag(ev.clientX, ev.clientY);
          el.classList.remove("dragging-src");
        }
      };

      function cleanup() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        try { el.releasePointerCapture(pid); } catch (err) { /* ignore */ }
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function beginDrag(payload, x, y, srcEl) {
    const you = youSide();
    if (!you) return false;
    const validDrops = [];
    const meta = state.catalog[payload.card.cardId] || {};

    if (payload.kind === "hand") {
      if (state.phase === "setup") {
        if (!you.active) validDrops.push({ kind: "active" });
        else if (you.bench.length < 3) validDrops.push({ kind: "bench" });
        else return false;
      } else if (isMyTurn()) {
        if (you.bench.length < 3) validDrops.push({ kind: "bench" });
        if (meta.evolvesFrom) {
          fieldMons(you)
            .filter((m) => m.cardId === meta.evolvesFrom && !m.justPlayed)
            .forEach((m) => validDrops.push({ kind: "evolve", uid: m.uid }));
        }
        if (!validDrops.length) return false;
      } else return false;
    } else if (payload.kind === "field" && isMyTurn()) {
      if (payload.where === "active") {
        // Drag active onto opponent = attack; onto bench = swap
        if (you.canAttack) validDrops.push({ kind: "attack" });
        if (you.canRetreat) {
          you.bench.forEach((b) => validDrops.push({ kind: "retreat", uid: b.uid }));
        }
      } else if (payload.where === "bench") {
        // Drag bench onto active = swap
        if (you.canRetreat) validDrops.push({ kind: "active" });
      }
      if (!validDrops.length) return false;
    } else {
      return false;
    }

    drag = {
      payload,
      validDrops,
      startX: x,
      startY: y,
      srcEl,
    };
    dragLayer.hidden = false;
    dragGhost.hidden = false;
    dragArrow.hidden = false;
    dragGhost.innerHTML = "";
    const clone = srcEl.cloneNode(true);
    clone.classList.remove("selectable", "can-attack", "can-swap", "selected", "target-pick", "attack-target");
    // Clone inherits running CSS animations; freeze so atk text doesn't look doubled.
    clone.style.animation = "none";
    clone.style.filter = "none";
    dragGhost.appendChild(clone);
    positionGhost(x, y);
    updateDropHighlights();
    sfx("click");
    return true;
  }

  function positionGhost(x, y) {
    const layer = dragLayer.getBoundingClientRect();
    dragGhost.style.left = (x - layer.left) + "px";
    dragGhost.style.top = (y - layer.top) + "px";
  }

  function updateDrag(x, y) {
    if (!drag) return;
    positionGhost(x, y);
    const layer = dragLayer.getBoundingClientRect();
    const x1 = drag.startX - layer.left;
    const y1 = drag.startY - layer.top;
    const x2 = x - layer.left;
    const y2 = y - layer.top;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    dragArrow.style.left = x1 + "px";
    dragArrow.style.top = y1 + "px";
    dragArrow.style.width = Math.max(0, len) + "px";
    dragArrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const over = hitTestDrop(x, y);
    dragArrow.classList.toggle("valid", !!over);
  }

  function hitTestDrop(x, y) {
    if (!drag) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el === dragGhost || dragGhost.contains(el)) continue;
      const dropEl = el.closest("[data-drop], #opp-active, #my-bench, #my-active, .card[data-uid]");
      if (!dropEl) continue;
      for (const d of drag.validDrops) {
        const target = resolveDropEl(d);
        if (!target) continue;
        if (dropEl === target || target.contains(dropEl) || dropEl.contains(target)) return d;
        if (d.uid && dropEl.dataset && dropEl.dataset.uid === d.uid) return d;
      }
    }
    return null;
  }

  function finishDrag(x, y) {
    const hit = hitTestDrop(x, y);
    const payload = drag && drag.payload;
    const moved = drag && Math.hypot(x - drag.startX, y - drag.startY) > 12;
    endDragVisual();
    if (moved) suppressClickUntil = Date.now() + 350;
    if (!hit || !payload) return;

    if (payload.kind === "hand") {
      if (state.phase === "setup") {
        if (hit.kind === "active") sendAction({ type: "setup_active", uid: payload.card.uid });
        else if (hit.kind === "bench") sendAction({ type: "setup_bench", uid: payload.card.uid });
      } else if (hit.kind === "bench") {
        sendAction({ type: "play_basic", uid: payload.card.uid });
      } else if (hit.kind === "evolve") {
        sendAction({ type: "evolve", handUid: payload.card.uid, targetUid: hit.uid });
      }
      return;
    }

    if (payload.kind === "field") {
      if (hit.kind === "attack") sendAction({ type: "attack" });
      else if (hit.kind === "retreat") sendAction({ type: "retreat", benchUid: hit.uid });
      else if (hit.kind === "active" && payload.where === "bench") {
        sendAction({ type: "retreat", benchUid: payload.card.uid });
      }
    }
  }

  function endDragVisual() {
    if (!drag && dragLayer.hidden) return;
    drag = null;
    dragLayer.hidden = true;
    dragGhost.hidden = true;
    dragArrow.hidden = true;
    dragGhost.innerHTML = "";
    dragArrow.style.width = "0px";
    dragArrow.classList.remove("valid");
    document.querySelectorAll(".dragging-src").forEach((el) => el.classList.remove("dragging-src"));
    updateDropHighlights();
  }

  // ================= chrome buttons =================
  btnEndTurn.addEventListener("click", () => {
    if (!canAct() || btnEndTurn.disabled || !isMyTurn()) return;
    const you = youSide();
    if (you.canAttack && !endTurnArmed) {
      endTurnArmed = true;
      render();
      showToast("공격할 수 있어요. 정말 끝내려면 한 번 더 누르세요");
      clearTimeout(endTurnTimer);
      endTurnTimer = setTimeout(() => {
        endTurnArmed = false;
        render();
      }, 2500);
      return;
    }
    endTurnArmed = false;
    clearSelection();
    sendAction({ type: "end_turn" });
  });

  btnReady.addEventListener("click", () => {
    if (!canAct()) return;
    sendAction({ type: "setup_ready" });
  });

  btnLeave.addEventListener("click", () => {
    if (state && state.phase !== "ended") {
      if (!confirm("대전을 포기하고 나가시겠습니까?")) return;
      send({ type: "forfeit" });
    }
    send({ type: "leave_match" });
    state = null;
    showScreen("lobby");
  });

  function checkGameOver() {
    if (!state || state.phase !== "ended") return;
    const win = state.winner === state.you;
    resultTitle.textContent = win ? "승리!" : "패배...";
    resultTitle.classList.toggle("win", win);
    resultTitle.classList.toggle("lose", !win);
    let msg;
    const reason = lastGameOverInfo && lastGameOverInfo.reason;
    if (reason === "forfeit") {
      msg = win ? "상대가 대전을 포기했습니다." : "대전을 포기했습니다.";
    } else if (reason === "no_bench") {
      msg = win ? "상대의 포켓몬이 모두 쓰러졌습니다!" : "벤치가 없어 더 이상 낼 포켓몬이 없습니다.";
    } else {
      msg = win ? "프라이즈 카드를 모두 획득했습니다!" : "상대가 프라이즈 카드를 모두 획득했습니다.";
    }
    resultMsg.textContent = msg;
    let streak = getStreak();
    if (win) streak += 1;
    else streak = 0;
    setStreak(streak);
    if (resultStreak) {
      if (win && streak > 1) {
        resultStreak.hidden = false;
        resultStreak.textContent = `현재 ${streak}연승!`;
      } else if (win) {
        resultStreak.hidden = false;
        resultStreak.textContent = "첫 승리! 연승을 이어가 보세요";
      } else {
        resultStreak.hidden = true;
      }
    }
    if (resultStats) {
      const st = (lastGameOverInfo && lastGameOverInfo.stats && lastGameOverInfo.stats[state.you])
        || (youSide() && youSide().stats)
        || {};
      const dmg = st.damage || 0;
      const kos = st.kos || 0;
      const items = st.itemsUsed || 0;
      if (dmg || kos || items) {
        resultStats.hidden = false;
        resultStats.textContent = `피해 ${dmg} · KO ${kos} · 아이템 ${items}`;
      } else {
        resultStats.hidden = true;
      }
    }
    overlayGameover.classList.remove("hidden");
  }

  btnResultLobby.addEventListener("click", () => {
    overlayGameover.classList.add("hidden");
    send({ type: "leave_match" });
    state = null;
    showScreen("lobby");
  });

  btnChallengeAccept.addEventListener("click", () => {
    if (!incomingChallenge) return;
    send({ type: "challenge_respond", id: incomingChallenge.id, accept: true });
    overlayChallenge.classList.add("hidden");
    incomingChallenge = null;
  });

  btnChallengeDecline.addEventListener("click", () => {
    if (!incomingChallenge) return;
    send({ type: "challenge_respond", id: incomingChallenge.id, accept: false });
    overlayChallenge.classList.add("hidden");
    incomingChallenge = null;
  });

  function openHowto() { overlayHowto.classList.remove("hidden"); }
  function closeHowto() { overlayHowto.classList.add("hidden"); }
  btnHelpLobby.addEventListener("click", openHowto);
  btnHelpMatch.addEventListener("click", openHowto);
  btnHowtoClose.addEventListener("click", closeHowto);
  btnHowtoOk.addEventListener("click", closeHowto);
  overlayHowto.addEventListener("click", (e) => { if (e.target === overlayHowto) closeHowto(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlayHowto.classList.contains("hidden")) closeHowto();
  });

  btnRoomCreate.addEventListener("click", () => send({ type: "create_room" }));
  btnRoomJoin.addEventListener("click", () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) return;
    send({ type: "join_room", code });
  });
  btnRoomCopy.addEventListener("click", () => {
    const code = roomCodeValue.textContent;
    if (navigator.clipboard && code) {
      navigator.clipboard.writeText(code).then(() => showToast("코드를 복사했습니다")).catch(() => {});
    }
  });
  btnCpu.addEventListener("click", () => { send({ type: "cpu" }); });
  btnNickSave.addEventListener("click", saveNick);
  nickInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveNick(); });

  function applySoundButtons() {
    [btnSoundLobby, btnSoundMatch].forEach((b) => b.classList.toggle("muted", !soundOn));
  }
  function toggleSound() {
    soundOn = !soundOn;
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
    applySoundButtons();
  }
  btnSoundLobby.addEventListener("click", toggleSound);
  btnSoundMatch.addEventListener("click", toggleSound);

  function init() {
    loadNick();
    applySoundButtons();
    renderPlayerList();
    connect();
  }

  init();
})();
