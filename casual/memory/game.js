(() => {
  "use strict";

  const LS_BEST = "memory_best_v1";
  const LS_SOUND = "memory_sound_v1";
  const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  const FLIP_MS = 450;
  const MISMATCH_VIEW_MS = 900;

  const POOL = [
    { id: 1, ko: "이상해씨" },
    { id: 4, ko: "파이리" },
    { id: 7, ko: "꼬부기" },
    { id: 25, ko: "피카츄" },
    { id: 26, ko: "라이츄" },
    { id: 39, ko: "푸린" },
    { id: 52, ko: "나옹" },
    { id: 54, ko: "고라파덕" },
    { id: 58, ko: "브케인" },
    { id: 60, ko: "발챙이" },
    { id: 66, ko: "근육몬" },
    { id: 74, ko: "꼬마돌" },
    { id: 92, ko: "고오스" },
    { id: 104, ko: "탕구리" },
    { id: 113, ko: "럭키" },
    { id: 131, ko: "라프라스" },
    { id: 133, ko: "이브이" },
    { id: 143, ko: "잠만보" },
    { id: 147, ko: "미뇽" },
    { id: 150, ko: "뮤츠" },
  ];

  function artUrl(id) {
    return `${ART}/${id}.png`;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildDeck(pairCount) {
    const chosen = shuffle(POOL).slice(0, pairCount);
    const pairs = [];
    chosen.forEach((p) => {
      pairs.push({ id: p.id, ko: p.ko });
      pairs.push({ id: p.id, ko: p.ko });
    });
    return shuffle(pairs).map((p, i) => ({ id: p.id, ko: p.ko, key: i, flipped: false, matched: false }));
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  const api = { buildDeck, artUrl, fmtTime, shuffle };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__memory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const movesEl = document.getElementById("moves");
  const timerEl = document.getElementById("timer");
  const bestEl = document.getElementById("best");
  const board = document.getElementById("board");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const btnNormal = document.getElementById("btn-normal");
  const btnHard = document.getElementById("btn-hard");
  const btnNew = document.getElementById("btn-new");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let mode = "normal";
  let totalPairs = 6;
  let deck = [];
  let flippedIdx = [];
  let locked = false;
  let moves = 0;
  let matchedPairs = 0;
  let timerHandle = 0;
  let elapsedMs = 0;
  let startTs = 0;

  const SFX = {
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
    flip() { if (soundOn && window.CasualSfx) window.CasualSfx.play("tap", 0.55); },
    match() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "clear"], 70, 0.7); },
    mismatch() { if (soundOn && window.CasualSfx) window.CasualSfx.play("fail", 0.55); },
    win() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.75); },
  };

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) { window.CasualSfx.unlock(); SFX.click(); }
    }
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  function readBest() {
    try {
      return JSON.parse(storage.getItem(LS_BEST) || "{}");
    } catch (_) {
      return {};
    }
  }

  function writeBest(rec) {
    storage.setItem(LS_BEST, JSON.stringify(rec));
  }

  function updateBestChip() {
    const rec = readBest();
    const cur = rec[mode];
    bestEl.textContent = cur ? String(cur.moves) : "–";
  }

  function updateHud() {
    movesEl.textContent = String(moves);
  }

  function cardEl(idx) {
    return board.querySelector(`.card[data-idx="${idx}"]`);
  }

  function cardTemplate(card, idx) {
    return `<button type="button" class="card" data-idx="${idx}" aria-label="포켓몬 카드 뒤집기">
      <div class="card-inner">
        <div class="card-face card-back"><div class="pokeball" aria-hidden="true"></div></div>
        <div class="card-face card-front"><img loading="lazy" src="${artUrl(card.id)}" alt="${card.ko}"></div>
      </div>
    </button>`;
  }

  function renderBoard() {
    board.dataset.mode = mode;
    board.innerHTML = deck.map((c, i) => cardTemplate(c, i)).join("");
    board.querySelectorAll(".card").forEach((el) => el.addEventListener("click", onCardClick));
  }

  function onCardClick(e) {
    if (!helpOverlay.hidden) return;
    const idx = +e.currentTarget.dataset.idx;
    const card = deck[idx];
    if (locked || card.matched || card.flipped) return;
    if (flippedIdx.length >= 2) return;
    flipCard(idx);
  }

  function flipCard(idx) {
    const card = deck[idx];
    card.flipped = true;
    cardEl(idx).classList.add("flipped");
    SFX.flip();
    startTimerIfNeeded();
    flippedIdx.push(idx);
    if (flippedIdx.length === 2) {
      moves += 1;
      updateHud();
      locked = true;
      const [a, b] = flippedIdx;
      if (deck[a].id === deck[b].id) {
        handleMatch(a, b);
      } else {
        handleMismatch(a, b);
      }
    }
  }

  function handleMatch(a, b) {
    deck[a].matched = true;
    deck[b].matched = true;
    matchedPairs += 1;
    cardEl(a).classList.add("matched");
    cardEl(b).classList.add("matched");
    SFX.match();
    flippedIdx = [];
    locked = false;
    if (matchedPairs === totalPairs) finishGame();
  }

  function handleMismatch(a, b) {
    // Wait for the second card's flip transition before shake/SFX,
    // so the player sees both faces first.
    setTimeout(() => {
      const elA = cardEl(a);
      const elB = cardEl(b);
      if (!elA || !elB) {
        flippedIdx = [];
        locked = false;
        return;
      }
      SFX.mismatch();
      elA.classList.add("mismatch");
      elB.classList.add("mismatch");
      setTimeout(() => {
        deck[a].flipped = false;
        deck[b].flipped = false;
        const aEl = cardEl(a);
        const bEl = cardEl(b);
        if (aEl) aEl.classList.remove("flipped", "mismatch");
        if (bEl) bEl.classList.remove("flipped", "mismatch");
        flippedIdx = [];
        locked = false;
      }, MISMATCH_VIEW_MS);
    }, FLIP_MS);
  }

  function startTimerIfNeeded() {
    if (timerHandle) return;
    startTs = performance.now() - elapsedMs;
    timerHandle = setInterval(() => {
      elapsedMs = performance.now() - startTs;
      timerEl.textContent = fmtTime(elapsedMs);
    }, 250);
  }

  function stopTimer() {
    clearInterval(timerHandle);
    timerHandle = 0;
  }

  function finishGame() {
    stopTimer();
    SFX.win();
    const rec = readBest();
    const cur = rec[mode];
    const timeSec = Math.floor(elapsedMs / 1000);
    let isNew = false;
    if (!cur || moves < cur.moves || (moves === cur.moves && timeSec < cur.time)) {
      rec[mode] = { moves, time: timeSec };
      writeBest(rec);
      isNew = true;
    }
    updateBestChip();
    showResult(isNew, timeSec);
  }

  function showResult(isNew, timeSec) {
    overlayCard.innerHTML = `
      <h2>${mode === "hard" ? "어려움" : "보통"} 모드 완료!</h2>
      ${isNew ? '<span class="new-best">🏆 최고 기록 달성!</span>' : ""}
      <div class="result-row">
        <div class="result-item"><span class="result-num">${moves}</span><span class="result-label">이동</span></div>
        <div class="result-item"><span class="result-num">${fmtTime(elapsedMs)}</span><span class="result-label">시간</span></div>
      </div>
      <p>같은 모드로 다시 도전하거나 목록으로 돌아가세요.</p>
      <button type="button" class="retry" id="btn-again">다시 하기</button>
    `;
    overlay.hidden = false;
    document.getElementById("btn-again").onclick = () => {
      SFX.click();
      newGame(mode);
    };
  }

  function setModeButtons() {
    btnNormal.classList.toggle("is-active", mode === "normal");
    btnHard.classList.toggle("is-active", mode === "hard");
  }

  function newGame(nextMode) {
    mode = nextMode || mode;
    totalPairs = mode === "hard" ? 8 : 6;
    deck = buildDeck(totalPairs);
    matchedPairs = 0;
    moves = 0;
    flippedIdx = [];
    locked = false;
    stopTimer();
    elapsedMs = 0;
    timerEl.textContent = "00:00";
    overlay.hidden = true;
    updateHud();
    updateBestChip();
    setModeButtons();
    renderBoard();
  }

  btnNormal.addEventListener("click", () => {
    if (mode === "normal") return;
    SFX.click();
    newGame("normal");
  });

  btnHard.addEventListener("click", () => {
    if (mode === "hard") return;
    SFX.click();
    newGame("hard");
  });

  btnNew.addEventListener("click", () => {
    SFX.click();
    newGame(mode);
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.click();
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
  }

  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => {
    SFX.click();
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  newGame("normal");
})();
