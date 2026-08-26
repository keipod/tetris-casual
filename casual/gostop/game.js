(() => {
  "use strict";

  const LS_SOUND = "gostop.sound";
  const storage = (window.CasualSafeStorage && CasualSafeStorage.get()) || {
    getItem: () => null,
    setItem: () => {},
  };

  const MONTH_ART = {
    1: { glyph: "☀️", bg: "#e8e0cc", label: "솔" },
    2: { glyph: "🐦", bg: "#e3ddc9", label: "매" },
    3: { glyph: "🌸", bg: "#f0dfe4", label: "벚" },
    4: { glyph: "🌿", bg: "#dfe6cd", label: "등" },
    5: { glyph: "🌾", bg: "#e6e2c8", label: "홍" },
    6: { glyph: "🦋", bg: "#dde4e8", label: "모란" },
    7: { glyph: "🍃", bg: "#e0e8cf", label: "홍시" },
    8: { glyph: "⛰️", bg: "#dbe4df", label: "공산" },
    9: { glyph: "🌼", bg: "#eee7cb", label: "국화" },
    10: { glyph: "🍁", bg: "#ecdcc8", label: "단풍" },
    11: { glyph: "🍂", bg: "#e4ddd2", label: "오동" },
    12: { glyph: "🌧️", bg: "#d5dae0", label: "비" },
  };
  const KIND_TAG = {
    bright: { text: "광", color: "#c0392b" },
    "rain-bright": { text: "비광", color: "#7d3c98" },
    "ribbon-red": { text: "홍단", color: "#c0392b" },
    "ribbon-blue": { text: "청단", color: "#2471a3" },
    "ribbon-grass": { text: "초단", color: "#1e8449" },
    "rain-ribbon": { text: "비단", color: "#7d3c98" },
    animal: { text: "동물", color: "#7d6608" },
    plain: { text: "피", color: "#5d4037" },
    plain2: { text: "쌍피", color: "#5d4037" },
    "rain-plain": { text: "비피", color: "#455a64" },
  };

  const el = {
    screenGame: document.getElementById("screen-game"),
    status: document.getElementById("status-text"),
    deckCount: document.getElementById("deck-count"),
    meScore: document.getElementById("me-score"),
    oppScore: document.getElementById("opp-score"),
    meDetail: document.getElementById("me-detail"),
    oppDetail: document.getElementById("opp-detail"),
    goIndicator: document.getElementById("go-indicator"),
    monthGrid: document.getElementById("month-grid"),
    handRow: document.getElementById("hand-row"),
    gostopModal: document.getElementById("gostop-modal"),
    gostopTitle: document.getElementById("gostop-title"),
    gostopSub: document.getElementById("gostop-sub"),
    btnGo: document.getElementById("btn-go"),
    btnStop: document.getElementById("btn-stop"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
  };

  let view = null;
  let selectedCard = null;
  let lastRenderKey = "";

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function drawCard(canvas, month, kind) {
    canvas.width = 116;
    canvas.height = 168;
    const c = canvas.getContext("2d");
    const art = MONTH_ART[month] || { glyph: "?", bg: "#ddd", label: "" };
    const tag = KIND_TAG[kind] || { text: "", color: "#333" };

    c.fillStyle = art.bg;
    c.fillRect(0, 0, 116, 168);
    const g = c.createLinearGradient(0, 0, 116, 168);
    g.addColorStop(0, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(120,80,40,0.10)");
    c.fillStyle = g;
    c.fillRect(0, 0, 116, 168);
    c.strokeStyle = "rgba(90,55,30,0.4)";
    c.lineWidth = 2;
    c.strokeRect(3, 3, 110, 162);

    if (kind.includes("bright")) {
      c.fillStyle = "rgba(212, 160, 40, 0.22)";
      c.fillRect(3, 3, 110, 162);
      c.strokeStyle = "rgba(192, 57, 43, 0.65)";
      c.lineWidth = 3;
      c.strokeRect(5, 5, 106, 158);
    }

    c.font = "700 11px 'Noto Sans KR'";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = tag.color;
    c.fillText(tag.text, 8, 13);

    c.font = `${kind === "animal" ? 44 : 52}px serif`;
    c.textAlign = "center";
    c.fillText(art.glyph, 58, 92);

    c.font = "600 10px 'Noto Sans KR'";
    c.fillStyle = "rgba(70,50,30,0.6)";
    c.fillText(art.label, 58, 152);
  }

  function cardEl(card, playable) {
    const wrap = document.createElement("div");
    wrap.className = "hcard" + (playable ? " playable" : "");
    wrap.dataset.cardId = card.id;
    const inner = document.createElement("div");
    inner.className = "hcard-inner";
    const face = document.createElement("div");
    face.className = "hface";
    const cv = document.createElement("canvas");
    drawCard(cv, card.month, card.kind);
    face.appendChild(cv);
    inner.appendChild(face);
    wrap.appendChild(inner);
    return wrap;
  }

  function renderField() {
    el.monthGrid.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const slot = document.createElement("div");
      slot.className = "month-slot";
      slot.dataset.month = String(m);
      const lbl = document.createElement("span");
      lbl.className = "slot-label";
      lbl.textContent = String(m);
      slot.appendChild(lbl);
      for (const card of view.field) {
        if (card.month !== m) continue;
        slot.appendChild(cardEl(card, false));
      }
      el.monthGrid.appendChild(slot);
    }
  }

  function renderHand() {
    el.handRow.innerHTML = "";
    for (const card of view.handCards) {
      const node = cardEl(card, view.yourTurn && view.phase === "playing");
      if (selectedCard === card.id) node.classList.add("selected");
      node.addEventListener("click", () => onHandCard(card.id));
      el.handRow.appendChild(node);
    }
  }

  function renderScores() {
    const prevMe = parseInt(el.meScore.textContent, 10) || 0;
    el.meScore.textContent = `${view.yourScore}점`;
    if (view.yourScore > prevMe) {
      el.meScore.classList.remove("glowing");
      void el.meScore.offsetWidth;
      el.meScore.classList.add("glowing");
    }
    el.oppScore.textContent = `${view.oppScore}점`;
    el.meDetail.textContent =
      `피${view.yourDetail.plains} · 끗${view.yourDetail.animals} · 광${view.yourDetail.brights} · 띠${view.yourDetail.ribbons}`;
    el.oppDetail.textContent = `잡은 패 ${view.oppTakenCount}장`;
    el.goIndicator.textContent = view.goCount > 0 ? `GO ×${view.goCount}` : "";
    el.deckCount.textContent = `덱 ${view.deckCount}`;
  }

  function renderAll() {
    if (!view) return;
    renderField();
    renderHand();
    renderScores();
  }

  function updateHud() {
    if (!view) return;
    el.gostopModal.hidden = !(view.phase === "gostop" && view.yourChoice);
    if (view.phase === "gostop" && view.yourChoice) {
      el.gostopTitle.textContent = `${view.yourScore}점 도달!`;
      el.gostopSub.textContent = view.goCount > 0
        ? `스톱하면 ${view.yourScore + view.goCount}점 승리`
        : "스톱하면 즉시 승리 · 고하면 1점 보너스";
      sfx("special");
    }
    el.resultOverlay.hidden = true;
    if (view.phase === "ended") {
      const iWon = view.winner != null && view.winner === mp.id;
      el.status.textContent = iWon ? "승리!" : "패배";
      el.resultTitle.textContent = view.winner == null ? "무승부" : iWon ? "승리!" : "패배";
      el.resultSub.textContent = iWon
        ? `최종 ${view.finalScore ?? view.yourScore}점`
        : "아쉽네요";
      el.resultOverlay.hidden = false;
    } else if (view.phase === "gostop") {
      el.status.textContent = view.yourChoice ? "고 / 스톱 선택" : "상대가 고·스톱 중…";
    } else {
      el.status.textContent = view.yourTurn ? "당신 차례 · 손패를 누르세요" : "상대 차례…";
    }
  }

  function onHandCard(cardId) {
    if (!view || !view.yourTurn || view.phase !== "playing") return;
    selectedCard = cardId;
    mp.action({ t: "play", card: cardId });
    sfx("swap");
    renderAll();
  }

  function flyCapture(cardIds) {
    const grid = el.monthGrid.getBoundingClientRect();
    for (const id of cardIds.slice(0, 4)) {
      const ghost = document.createElement("div");
      ghost.className = "hcard fly-card is-back";
      ghost.innerHTML = '<div class="hcard-inner"><div class="hface"></div><div class="hback"></div></div>';
      ghost.style.left = `${grid.width / 2 + grid.left - 29}px`;
      ghost.style.top = `${grid.top + 20}px`;
      document.body.appendChild(ghost);
      requestAnimationFrame(() => {
        const hr = el.handRow.getBoundingClientRect();
        ghost.style.transform = `translate(${Math.random() * 120 - 60}px, ${hr.bottom - grid.top}px) scale(0.4) rotate(${Math.random() * 60 - 30}deg)`;
        ghost.style.opacity = "0.15";
      });
      setTimeout(() => ghost.remove(), 560);
    }
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "play") {
        sfx(ev.pid === mp.id ? "swap" : "hoverMid");
      } else if (ev.type === "capture") {
        setTimeout(() => {
          flyCapture([...ev.cards, ev.played]);
          sfx(ev.mode === "triple" ? "combo" : "pickup");
        }, 160);
      } else if (ev.type === "flip") {
        if (ev.card) sfx("slide");
      } else if (ev.type === "gostop_offer") {
        sfx("level");
      } else if (ev.type === "go") {
        mp.toast(`${ev.pid === mp.id ? "내가" : "상대가"} GO! (${ev.goCount}번째)`);
        sfx(ev.pid === mp.id ? "power" : "warn");
      } else if (ev.type === "win") {
        const iWon = ev.winner != null && ev.winner === mp.id;
        setTimeout(() => sfx(iWon ? "fanfare" : "lose"), 300);
      } else if (ev.type === "forfeit") {
        mp.toast(view && ev.winner === mp.id ? "상대 기권 · 승리!" : "기권했습니다");
      }
    }
  }

  const mp = window.MPClient.create({
    cpuButton: true,
    onState(state) {
      view = state;
      if (state.phase !== "playing" || !state.yourTurn) selectedCard = null;
      renderAll();
      updateHud();
    },
    onEvents(events) { handleEvents(events); },
    onLobbyReturn() { view = null; selectedCard = null; },
  });

  el.btnGo.addEventListener("click", () => {
    if (view && view.yourChoice) {
      mp.action({ t: "go" });
      el.gostopModal.hidden = true;
    }
  });
  el.btnStop.addEventListener("click", () => {
    if (view && view.yourChoice) {
      mp.action({ t: "stop" });
      el.gostopModal.hidden = true;
    }
  });

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();
})();
