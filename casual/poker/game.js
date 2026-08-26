(() => {
  "use strict";

  const LS_SOUND = "poker.sound";
  const storage = (window.CasualSafeStorage && CasualSafeStorage.get()) || {
    getItem: () => null,
    setItem: () => {},
  };
  const SUIT_CH = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const RANK_CH = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10" };

  const el = {
    screenGame: document.getElementById("screen-game"),
    status: document.getElementById("status-text"),
    handInfo: document.getElementById("hand-info"),
    community: document.getElementById("community"),
    potAmount: document.getElementById("pot-amount"),
    seatsLayer: document.getElementById("seats-layer"),
    myHole: document.getElementById("my-hole"),
    actionBar: document.getElementById("action-bar"),
    btnFold: document.getElementById("btn-fold"),
    btnCheck: document.getElementById("btn-check"),
    btnCall: document.getElementById("btn-call"),
    btnRaise: document.getElementById("btn-raise"),
    btnAllin: document.getElementById("btn-allin"),
    slider: document.getElementById("raise-slider"),
    raiseAmt: document.getElementById("raise-amt"),
    hostStartBox: document.getElementById("host-start-box"),
    btnHostStart: document.getElementById("btn-host-start"),
    rankToast: document.getElementById("rank-toast"),
    btnSound: document.getElementById("btn-sound-lobby"),
  };

  let view = null;
  let renderedKey = "";
  let syncTimer = null;

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }

  function rankLabel(card) {
    return card.rank || RANK_CH[card.r] || String(card.r);
  }
  function suitLabel(card) {
    const su = card.suit || card.s;
    return SUIT_CH[su] || su || "";
  }
  function isRed(card) {
    const su = card.suit || card.s;
    return su === "h" || su === "d";
  }
  function cardEl(card, red, delay) {
    const div = document.createElement("div");
    div.className = "pcard" + (isRed(card) ? " red" : "");
    div.style.animationDelay = `${delay}ms`;
    div.innerHTML = `<span class="rank">${rankLabel(card)}</span><span class="suit-big">${suitLabel(card)}</span>`;
    return div;
  }
  function miniEl(card) {
    const sp = document.createElement("span");
    sp.className = "mini" + (isRed(card) ? " red" : "");
    sp.textContent = rankLabel(card);
    return sp;
  }

  function renderSeats() {
    el.seatsLayer.innerHTML = "";
    for (const s of view.seats) {
      const box = document.createElement("div");
      box.className = "seat-box" +
        (s.pid === view.toActPid && view.phase !== "between" && view.phase !== "ended" ? " turn-glow" : "") +
        (s.folded ? " folded" : "");
      const name = document.createElement("span");
      name.className = "seat-name";
      name.textContent = (s.isBot ? "🤖 " : "") + (s.nick || `참가자${s.seat + 1}`) + (s.pid === mp.id ? "(나)" : "");
      const tags = document.createElement("span");
      tags.className = "seat-tags";
      if (s.isDealer) {
        const d = document.createElement("span");
        d.className = "dealer-btn";
        d.textContent = "D";
        tags.appendChild(d);
      }
      if (s.allin) {
        const ai = document.createElement("span");
        ai.className = "tag-allin";
        ai.textContent = "올인";
        tags.appendChild(ai);
      }
      if (s.out) {
        const o = document.createElement("span");
        o.className = "tag-out";
        o.textContent = "탈락";
        tags.appendChild(o);
      }
      const chips = document.createElement("span");
      chips.className = "seat-chips";
      chips.textContent = fmt(s.chips);
      box.appendChild(name);
      box.appendChild(chips);
      box.appendChild(tags);

      const cards = document.createElement("div");
      cards.className = "seat-cards";
      if (s.cards) for (const c of s.cards) cards.appendChild(miniEl(c));
      else if (!s.folded && !s.out && view.phase !== "waiting" && view.phase !== "between") {
        for (let i = 0; i < 2; i++) {
          const back = document.createElement("span");
          back.className = "mini";
          back.style.background = "linear-gradient(160deg,#5a1e22,#2c1013)";
          back.textContent = "";
          cards.appendChild(back);
        }
      }
      const row2 = document.createElement("div");
      row2.style.cssText = "grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;";
      row2.appendChild(cards);
      if (s.betThisStreet > 0) {
        const bet = document.createElement("span");
        bet.className = "seat-chips";
        bet.style.fontSize = "11px";
        bet.textContent = `벳 ${fmt(s.betThisStreet)}`;
        row2.appendChild(bet);
      }
      box.appendChild(row2);
      el.seatsLayer.appendChild(box);
    }
  }

  function renderCommunity() {
    const key = JSON.stringify(view.community) + view.phase;
    if (key === renderedKey) return;
    renderedKey = key;
    el.community.innerHTML = "";
    view.community.forEach((c, i) => {
      el.community.appendChild(cardEl(c, c.suit === "h" || c.suit === "d", i * 130));
    });
  }

  let holeKey = "";
  function renderMyHole() {
    const key = JSON.stringify(view.yourHole || []);
    if (key === holeKey) return;
    holeKey = key;
    el.myHole.innerHTML = "";
    if (view.yourHole) {
      view.yourHole.forEach((c, i) => {
        el.myHole.appendChild(cardEl(c, isRed(c), i * 140));
      });
    }
  }

  function updateActions() {
    const myTurn = view.yourTurn;
    el.actionBar.classList.toggle("locked", !myTurn);
    el.btnCheck.hidden = view.toCall > 0;
    el.btnCall.hidden = view.toCall <= 0;
    if (view.toCall > 0) el.btnCall.textContent = `콜 ${fmt(Math.min(view.toCall, view.myChips))}`;
    const minTo = Math.min(view.minRaiseTo || view.bb * 2, view.myChips + view.myStreetBet);
    el.slider.min = String(minTo);
    el.slider.max = String(view.myChips + view.myStreetBet);
    if (+el.slider.value < minTo) el.slider.value = String(minTo);
    el.raiseAmt.textContent = fmt(el.slider.value);
    void myTurn;
  }

  function updateHud() {
    if (!view) return;
    el.potAmount.textContent = fmt(view.pot);
    el.handInfo.textContent = `H ${view.handsPlayed}`;
    el.hostStartBox.hidden = !(view.phase === "waiting" && view.youAreHost);

    const streetName = { preflop: "프리플랍", flop: "플랍", turn: "턴", river: "리버" }[view.phase] || "";
    if (view.phase === "waiting") el.status.textContent = "방장 시작 대기…";
    else if (view.phase === "between") el.status.textContent = "다음 핸드 준비…";
    else if (view.phase === "ended") el.status.textContent = "게임 종료";
    else if (view.yourTurn) el.status.textContent = `${streetName} · 당신 차례`;
    else el.status.textContent = `${streetName} · 대기 중…`;

    renderCommunity();
    renderSeats();
    renderMyHole();
    updateActions();
  }

  function showRankToast(text) {
    el.rankToast.textContent = text;
    el.rankToast.hidden = false;
    setTimeout(() => { el.rankToast.hidden = true; }, 1900);
  }

  function handleEvents(events) {
    let pendingRanks = null;
    for (const ev of events) {
      if (ev.type === "action") {
        if (ev.t === "fold") sfx("failDeep");
        else if (ev.t === "raise" || ev.t === "bet") sfx("power");
        else if (ev.t === "allin") sfx("bomb");
        else if (ev.t === "call") sfx("pickup");
        else sfx(ev.pid === mp.id ? "mouseUp" : "click");
        if (ev.allin && ev.pid === mp.id) mp.toast("올인!");
      } else if (ev.type === "street") {
        setTimeout(() => sfx("swap"), 100);
      } else if (ev.type === "show_cards") {
        sfx("special");
      } else if (ev.type === "showdown_result") {
        pendingRanks = ev.names;
      } else if (ev.type === "pot_award") {
        setTimeout(() => {
          const mine = (ev.winners || []).some((w) => w.pid === mp.id);
          sfx(mine ? "fanfare" : "clickAlt");
          const w0 = (ev.winners || [])[0];
          showRankToast(w0 && w0.handName ? `${w0.handName}!` : ev.byFold ? "모두 폴드" : "승자 확정");
          if (pendingRanks && pendingRanks[mp.id]) {
            setTimeout(() => showRankToast(`내 족보: ${pendingRanks[mp.id]}`), 2100);
          }
        }, 500);
      } else if (ev.type === "table_end") {
        mp.toast("게임이 종료되었습니다");
      }
    }
  }

  const mp = window.MPClient.create({
    cpuButton: false,
    tableMode: true,
    onState(state) {
      view = state;
      updateHud();
      startSyncPolling();
    },
    onLobbyReturn() {
      view = null;
      stopSyncPolling();
      renderedKey = "";
    },
  });

  function startSyncPolling() {
    stopSyncPolling();
    syncTimer = setInterval(() => {
      if (view && view.seated && view.phase !== "waiting" && view.phase !== "ended") mp.sync();
      else stopSyncPolling();
    }, 850);
  }
  function stopSyncPolling() {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  }

  el.btnFold.addEventListener("click", () => { if (view?.yourTurn) mp.action({ t: "fold" }); });
  el.btnCheck.addEventListener("click", () => { if (view?.yourTurn) mp.action({ t: "check" }); });
  el.btnCall.addEventListener("click", () => { if (view?.yourTurn) mp.action({ t: "call" }); });
  el.btnAllin.addEventListener("click", () => { if (view?.yourTurn) mp.action({ t: "allin" }); });
  el.btnRaise.addEventListener("click", () => {
    if (view?.yourTurn) mp.action({ t: "raise", to: parseInt(el.slider.value, 10) });
  });
  el.slider.addEventListener("input", () => {
    el.raiseAmt.textContent = fmt(el.slider.value);
  });

  el.btnHostStart.addEventListener("click", () => mp.tableStart());

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();
})();
