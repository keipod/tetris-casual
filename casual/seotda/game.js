(() => {
  "use strict";

  const LS_SOUND = "seotda.sound";
  const storage = (window.CasualSafeStorage && CasualSafeStorage.get()) || {
    getItem: () => null,
    setItem: () => {},
  };

  const MOTIFS = {
    1: { glyph: "🌲", label: "솔", color: "#3d5c3a" },
    2: { glyph: "🐦", label: "매", color: "#4a4238" },
    3: { glyph: "🌸", label: "벚", color: "#b04a6a" },
    4: { glyph: "🌿", label: "등", color: "#55603c" },
    5: { glyph: "🌾", label: "홍", color: "#9a4a3a" },
    6: { glyph: "🦋", label: "모란", color: "#7a4a7a" },
    7: { glyph: "🍃", label: "홍시", color: "#5c6e42" },
    8: { glyph: "⛰️", label: "공산", color: "#3a5a72" },
    9: { glyph: "🌼", label: "국화", color: "#8a7434" },
    10: { glyph: "🍁", label: "단풍", color: "#a0522d" },
  };
  const BRIGHT_MONTHS = new Set([3, 8]);

  const el = {
    screenGame: document.getElementById("screen-game"),
    status: document.getElementById("status-text"),
    potDisplay: document.getElementById("pot-display"),
    potAmount: document.getElementById("pot-amount"),
    myCards: document.getElementById("my-cards"),
    oppCards: document.getElementById("opp-cards"),
    myRank: document.getElementById("my-rank"),
    oppRank: document.getElementById("opp-rank"),
    myChips: document.getElementById("my-chips"),
    oppChips: document.getElementById("opp-chips"),
    betPanel: document.getElementById("bet-panel"),
    btnCall: document.getElementById("btn-call"),
    btnRaise: document.getElementById("btn-raise"),
    btnFold: document.getElementById("btn-fold"),
    rankBanner: document.getElementById("rank-banner"),
    rankBannerText: document.getElementById("rank-banner-text"),
    resultOverlay: document.getElementById("result-overlay"),
    resultTitle: document.getElementById("result-title"),
    resultSub: document.getElementById("result-sub"),
    btnSound: document.getElementById("btn-sound-lobby"),
  };

  let view = null;
  let dealtAnimDone = false;
  let lastHandKey = "";

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  function sfx(name) {
    if (soundOn && window.CasualSfx) CasualSfx.play(name);
  }
  function syncSoundBtn() { el.btnSound.textContent = soundOn ? "🔊" : "🔇"; }

  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }

  function drawCardFace(canvas, month, slot) {
    canvas.width = 152;
    canvas.height = 216;
    const c = canvas.getContext("2d");
    const motif = MOTIFS[month] || { glyph: "?", label: "", color: "#666" };

    const g = c.createLinearGradient(0, 0, 152, 216);
    g.addColorStop(0, "#f8eed6");
    g.addColorStop(1, "#ecdcb8");
    c.fillStyle = g;
    c.fillRect(0, 0, 152, 216);
    c.strokeStyle = "rgba(90,60,20,0.35)";
    c.lineWidth = 2;
    c.strokeRect(4, 4, 144, 208);

    if (BRIGHT_MONTHS.has(month)) {
      c.fillStyle = "rgba(212, 160, 40, 0.16)";
      c.fillRect(4, 4, 144, 208);
    }

    c.font = "800 30px 'Noto Sans KR'";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(month), 76, 44);
    c.font = "600 15px 'Noto Sans KR'";
    c.fillStyle = motif.color;
    c.fillText(motif.label, 76, 74);

    c.font = "64px serif";
    c.fillText(motif.glyph, 76, 148);

    c.font = "700 13px 'Noto Sans KR'";
    c.fillStyle = "rgba(80,50,20,0.55)";
    c.fillText(slot === 1 ? "●" : "○", 76, 194);
  }

  function cardEl(month, slot, faceDown, delay) {
    const wrap = document.createElement("div");
    wrap.className = "hcard dealing" + (faceDown ? " is-back" : "");
    wrap.style.animationDelay = `${delay}ms`;
    const inner = document.createElement("div");
    inner.className = "hcard-inner";
    const face = document.createElement("div");
    face.className = "hface";
    const cv = document.createElement("canvas");
    drawCardFace(cv, month, slot);
    face.appendChild(cv);
    const back = document.createElement("div");
    back.className = "hback";
    inner.appendChild(face);
    inner.appendChild(back);
    wrap.appendChild(inner);
    return wrap;
  }

  function renderTable() {
    if (!view) return;
    el.potAmount.textContent = fmt(view.pot);
    el.myChips.textContent = fmt(view.chips[mp.id]) + " 칩";
    el.oppChips.textContent = fmt(Object.values(view.chips).find((v, i) =>
      Object.keys(view.chips)[i] !== mp.id) || 0) + " 칩";
    el.myRank.textContent = view.yourRank || "";
    el.oppRank.textContent = view.oppRank && view.phase === "ended" ? view.oppRank : "";
    el.btnRaise.textContent = `레이즈 ${fmt(Math.min(view.minRaiseTo, (view.chips[mp.id] || 0) + (view.invested[mp.id] || 0)))}`;

    const myKey = JSON.stringify(view.yourHand) + view.phase;
    if (myKey !== lastHandKey || !dealtAnimDone) {
      lastHandKey = myKey;
      el.myCards.innerHTML = "";
      el.oppCards.innerHTML = "";
      view.yourHand.forEach(([m, s], i) => {
        el.myCards.appendChild(cardEl(m, s, false, 120 + i * 160));
      });
      if (view.oppHand) {
        view.oppHand.forEach(([m, s], i) => {
          el.oppCards.appendChild(cardEl(m, s, false, 200 + i * 200));
        });
      } else {
        for (let i = 0; i < view.oppHandCount; i++) {
          el.oppCards.appendChild(cardEl(1, 0, true, 200 + i * 180));
        }
      }
      dealtAnimDone = true;
    }
  }

  function updateHud() {
    if (!view) return;
    el.betPanel.classList.toggle("locked", !view.yourTurn || view.phase !== "betting");
    el.btnCall.disabled = view.currentBet === 0;
    const need = Math.max(0, (view.currentBet || 0) - (view.invested[mp.id] || 0));
    el.btnCall.textContent = need > 0 ? `콜 ${fmt(need)}` : "콜";
    el.btnRaise.disabled = !view.canRaise || view.currentBet === 0 ||
      view.chips[mp.id] + (view.invested[mp.id] || 0) <= view.currentBet;

    if (view.phase === "ended") {
      const iWon = view.winner != null && view.winner === mp.id;
      el.status.textContent = iWon ? "승리!" : "패배";
      el.resultTitle.textContent = iWon ? "승리!" : "패배";
      el.resultSub.textContent = view.resultText || "";
      el.resultOverlay.hidden = false;
    } else {
      el.resultOverlay.hidden = true;
      if (!dealtAnimDone) {
        el.status.textContent = "카드를 나누는 중…";
      } else {
        el.status.textContent = view.yourTurn
          ? (view.currentBet > 0 ? "콜 · 레이즈 · 다이" : "첫 베팅을 하세요")
          : "상대 차례…";
      }
    }
    void el.potDisplay;
  }

  function flyChip(fromEl, toEl) {
    const chip = document.createElement("div");
    chip.className = "chip-fly c500";
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    chip.style.left = `${fr.left + fr.width / 2}px`;
    chip.style.top = `${fr.top + fr.height / 2}px`;
    document.body.appendChild(chip);
    requestAnimationFrame(() => {
      chip.style.transition = "all 0.45s cubic-bezier(0.3, -0.4, 0.6, 1.2)";
      chip.style.left = `${tr.left + tr.width / 2}px`;
      chip.style.top = `${tr.top + tr.height / 2}px`;
      chip.style.opacity = "0.15";
    });
    setTimeout(() => chip.remove(), 520);
  }

  function showRankBanner(text) {
    el.rankBannerText.textContent = text;
    el.rankBanner.hidden = false;
    setTimeout(() => { el.rankBanner.hidden = true; }, 1500);
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "bet") {
        sfx(ev.amount >= 1000 ? "power" : "toggle");
        flyChip(el.betPanel, el.potAmount);
      } else if (ev.type === "call") {
        sfx("pickup");
        flyChip(el.betPanel, el.potAmount);
      } else if (ev.type === "raise") {
        sfx("power");
        flyChip(el.betPanel, el.potAmount);
      } else if (ev.type === "allin") {
        sfx("bomb");
        flyChip(el.betPanel, el.potAmount);
      } else if (ev.type === "fold") {
        sfx("failDeep");
        mp.toast(`${ev.pid === mp.id ? "내가" : "상대가"} 다이했습니다`);
      } else if (ev.type === "showdown") {
        setTimeout(() => {
          sfx("special");
          showRankBanner(ev.handName);
        }, 650);
        setTimeout(() => {
          const iWon = ev.winner === mp.id;
          sfx(iWon ? "fanfare" : "lose");
          confettiBurst(iWon);
        }, 1400);
      }
    }
  }

  function confettiBurst(win) {
    if (!win) return;
    const n = 60;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.style.cssText = `position:fixed;left:${50 + (Math.random() * 40 - 20)}vw;top:38vh;` +
        `width:${5 + Math.random() * 7}px;height:${8 + Math.random() * 8}px;z-index:75;` +
        `background:${["#f6cd88", "#ffd94a", "#fff", "#e0a458"][i % 4]};` +
        `border-radius:2px;pointer-events:none;transition:transform 1.6s ease-out,opacity 1.6s;`;
      document.body.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform =
          `translate(${Math.random() * 320 - 160}px, ${window.innerHeight * 0.62}px) rotate(${Math.random() * 720 - 360}deg)`;
        p.style.opacity = "0";
      });
      setTimeout(() => p.remove(), 1700);
    }
  }

  const mp = window.MPClient.create({
    cpuButton: true,
    onState(state) {
      view = state;
      renderTable();
      updateHud();
    },
    onEvents(events) { handleEvents(events); },
    onLobbyReturn() { view = null; dealtAnimDone = false; lastHandKey = ""; },
  });

  el.betPanel.addEventListener("click", (e) => {
    const chipBtn = e.target.closest("[data-bet]");
    if (!chipBtn || !view || !view.yourTurn) return;
    const v = chipBtn.dataset.bet;
    if (v === "allin") {
      mp.action({ t: "allin" });
    } else if (view.currentBet === 0) {
      mp.action({ t: "bet", amount: parseInt(v, 10) });
    }
  });

  el.btnCall.addEventListener("click", () => {
    if (view && view.yourTurn && view.currentBet > 0) mp.action({ t: "call" });
  });
  el.btnRaise.addEventListener("click", () => {
    if (view && view.yourTurn && view.currentBet > 0 && view.canRaise) {
      mp.action({ t: "raise", amount: view.minRaiseTo });
    }
  });
  el.btnFold.addEventListener("click", () => {
    if (view && view.yourTurn && window.confirm("다이하시겠습니까?")) mp.action({ t: "fold" });
  });

  el.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  });
  syncSoundBtn();
})();
