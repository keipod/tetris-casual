(() => {
  "use strict";

  const LS_SOUND = "baccarat.sound";
  const storage = (window.CasualSafeStorage && CasualSafeStorage.get()) || {
    getItem: () => null,
    setItem: () => {},
  };

  const el = {
    screenGame: document.getElementById("screen-game"),
    status: document.getElementById("status-text"),
    roundInfo: document.getElementById("round-info"),
    roadmap: document.getElementById("roadmap"),
    playerCards: document.getElementById("player-cards"),
    bankerCards: document.getElementById("banker-cards"),
    playerTotal: document.getElementById("player-total"),
    bankerTotal: document.getElementById("banker-total"),
    myChips: document.getElementById("my-chips"),
    betP: document.getElementById("bet-P"),
    betB: document.getElementById("bet-B"),
    betT: document.getElementById("bet-T"),
    chipTray: document.getElementById("chip-tray"),
    timerWrap: document.getElementById("timer-wrap"),
    timerArc: document.getElementById("timer-arc"),
    timerNum: document.getElementById("timer-num"),
    seatsBar: document.getElementById("seats-bar"),
    hostStartBox: document.getElementById("host-start-box"),
    btnHostStart: document.getElementById("btn-host-start"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
  };

  let view = null;
  let renderedHandsKey = "";
  let lastWinnerShown = null;
  let syncTimer = null;

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }

  function cardEl(card, delay) {
    const div = document.createElement("div");
    div.className = "pcard" + (card.suit === "♥" || card.suit === "♦" ? " red" : "");
    div.style.animationDelay = `${delay}ms`;
    div.innerHTML = `<span class="rank">${card.rank}</span><span class="suit-top">${card.suit}</span><span class="suit-big">${card.suit}</span>`;
    return div;
  }

  function renderHands() {
    if (!view) return;
    const key = JSON.stringify([view.playerHand, view.bankerHand, view.phase]);
    if (key === renderedHandsKey) return;
    renderedHandsKey = key;
    el.playerCards.innerHTML = "";
    el.bankerCards.innerHTML = "";
    view.playerHand.forEach((c, i) => el.playerCards.appendChild(cardEl(c, i * 260)));
    view.bankerHand.forEach((c, i) => el.bankerCards.appendChild(cardEl(c, 130 + i * 260)));

    const showTotals = view.phase !== "betting" && view.phase !== "waiting";
    setTotal(el.playerTotal, showTotals ? view.pTotal : null);
    setTotal(el.bankerTotal, showTotals ? view.bTotal : null);
    void view.playerHandCount; void view.bankerHandCount;
  }

  function setTotal(node, val) {
    if (val == null || Number.isNaN(val)) { node.classList.remove("show"); return; }
    node.textContent = String(val);
    node.classList.add("show");
  }

  function renderRoadmap() {
    el.roadmap.innerHTML = "";
    for (const r of view.roadmap || []) {
      const bead = document.createElement("span");
      bead.className = `bead ${r}`;
      bead.textContent = r;
      el.roadmap.appendChild(bead);
    }
  }

  function renderSeats() {
    el.seatsBar.innerHTML = "";
    for (const s of view.seats || []) {
      const box = document.createElement("span");
      box.className = "seat-chipbox";
      let deltaTxt = "";
      if (s.lastResult != null && s.lastResult !== 0) {
        deltaTxt = `<span class="${s.lastResult > 0 ? "delta-pos" : "delta-neg"}">(${s.lastResult > 0 ? "+" : ""}${fmt(s.lastResult)})</span>`;
      }
      const totalBet = Object.values(s.bets || {}).reduce((a, b) => a + b, 0);
      box.innerHTML = `<b>${s.pid === mp.id ? "나" : `참가자${(s.seat || 0) + 1}`}</b> ${fmt(s.chips)} ${deltaTxt}${totalBet ? ` · 배팅 ${fmt(totalBet)}` : ""}`;
      el.seatsBar.appendChild(box);
    }
  }

  function updateHud() {
    if (!view) return;
    el.myChips.textContent = `${fmt(view.myChips)} 칩`;
    el.betP.textContent = view.myBets.PLAYER ? fmt(view.myBets.PLAYER) : "";
    el.betB.textContent = view.myBets.BANKER ? fmt(view.myBets.BANKER) : "";
    el.betT.textContent = view.myBets.TIE ? fmt(view.myBets.TIE) : "";
    el.roundInfo.textContent = `R ${view.round}/${view.maxRounds}`;

    const betting = view.phase === "betting";
    el.chipTray.classList.toggle("locked", !betting);
    el.timerWrap.hidden = !betting;

    el.hostStartBox.hidden = !(view.phase === "waiting" && view.youAreHost);

    if (view.phase === "waiting") {
      el.status.textContent = view.canStart ? "시작 대기 중" : "방장 시작 대기…";
    } else if (betting) {
      el.status.textContent = "베팅하세요!";
    } else if (view.phase === "dealing") {
      el.status.textContent = "딜링…";
    } else if (view.phase === "between") {
      el.status.textContent = view.winner ? "정산 중…" : "다음 라운드 준비…";
    } else if (view.phase === "ended") {
      el.status.textContent = "게임 종료";
    }

    renderRoadmap();
    renderSeats();
  }

  let lastTick = 0;
  function tickTimer(now) {
    requestAnimationFrame(tickTimer);
    if (!view || view.phase !== "betting" || !view.deadlineMs) return;
    if (now - lastTick < 100) return;
    lastTick = now;
    const remain = Math.max(0, view.deadlineMs - Date.now());
    const remainSec = remain / 1000;
    el.timerNum.textContent = String(Math.ceil(remainSec));
    const frac = Math.max(0, Math.min(1, remainSec / 12));
    el.timerArc.style.strokeDashoffset = String(97.4 * (1 - frac));
    el.timerArc.setAttribute("stroke", frac > 0.35 ? "url(#tgrad)" : "#ff6a4d");
    if (remainSec <= 3.05 && Math.abs(remainSec - Math.round(remainSec)) < 0.06) sfx("tick");
  }
  requestAnimationFrame(tickTimer);

  function flashResult(spot) {
    const colors = { PLAYER: "rgba(58,145,220,0.5)", BANKER: "rgba(230,90,70,0.5)", TIE: "rgba(70,200,110,0.5)" };
    const div = document.createElement("div");
    div.className = "result-flash";
    div.style.background = `radial-gradient(circle at 50% 42%, ${colors[spot] || "rgba(255,255,255,0.3)"}, transparent 65%)`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1050);

    el.resultTitle.textContent = spot === "TIE" ? "TIE" : `${spot} WIN`;
    el.resultSub.textContent = `P ${view.pTotal} : ${view.bTotal} B`;
    el.resultOverlay.hidden = false;
    setTimeout(() => { el.resultOverlay.hidden = true; }, 1800);
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "bet") {
        sfx(ev.amount >= 1000 ? "power" : "pickup");
        if (ev.pid === mp.id) mp.toast(`${ev.spot}에 ${fmt(ev.amount)} 베팅`);
      } else if (ev.type === "deal_card") {
        setTimeout(() => sfx(ev.idx === 2 ? "special" : "swap"), ev.idx * 240);
      } else if (ev.type === "result") {
        const iWon = (ev.payouts || []).some((p) => p.pid === mp.id && p.delta > 0);
        setTimeout(() => {
          flashResult(ev.spot);
          sfx(iWon ? "fanfare" : ev.payouts?.some((p) => p.pid === mp.id) ? "failDeep" : "clickAlt");
          document.querySelectorAll(".zone").forEach((z) => z.classList.remove("win-glow"));
          const zone = document.querySelector(`.zone-${ev.spot[0].toLowerCase()}`);
          if (zone) zone.classList.add("win-glow");
        }, 700);
      } else if (ev.type === "table_end") {
        mp.toast("게임이 종료되었습니다");
      } else if (ev.type === "joined" && view) {
        sfx("spawn");
      } else if (ev.type === "busted" && ev.pid === mp.id) {
        mp.toast("파산! 다음 게임까지 관전합니다", true);
      }
    }
    if (view) { renderedHandsKey = ""; renderHands(); updateHud(); }
  }

  const mp = window.MPClient.create({
    cpuButton: false,
    tableMode: true,
    onTables() {},
    onState(state) {
      view = state;
      renderHands();
      updateHud();
      if (state.phase === "betting" || state.phase === "between") startSyncPolling();
    },
    onLobbyReturn() {
      view = null;
      stopSyncPolling();
      renderedHandsKey = "";
      lastWinnerShown = null;
    },
  });

  function startSyncPolling() {
    stopSyncPolling();
    syncTimer = setInterval(() => {
      if (view && (view.phase === "betting" || view.phase === "between")) mp.sync();
      else stopSyncPolling();
    }, 900);
  }
  function stopSyncPolling() {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  }

  el.chipTray.addEventListener("click", (e) => {
    const zone = e.target.closest("[data-spot]");
    if (!zone || !view || view.phase !== "betting") return;
    const amt = parseInt(el.chipTray.dataset.selectedChip || "100", 10);
    mp.action({ t: "bet", spot: zone.dataset.spot, amount: amt });
  });

  document.querySelectorAll(".chip-row [data-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.chipTray.dataset.selectedChip = btn.dataset.chip;
      document.querySelectorAll(".chip-row .chip").forEach((c) => c.style.outline = "");
      btn.style.outline = "3px solid var(--gold-strong)";
      sfx("mouseDown");
    });
  });
  el.chipTray.dataset.selectedChip = "100";

  el.btnHostStart.addEventListener("click", () => mp.tableStart());

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();
})();
