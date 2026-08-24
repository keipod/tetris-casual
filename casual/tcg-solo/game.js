/* TCG 솔리테어 — 혼자 하는 포켓몬 카드 정리 퍼즐. No build step, no network play. */
(function () {
  "use strict";

  const BEST_KEY = "tcg_solo_best_v1";
  const PAIR_COUNT = 5;
  const LONE_COUNT = 6;
  const ENERGY_BUFFER = 2;

  const PAIR_LINE_POOL = [
    ["bulbasaur", "ivysaur"],
    ["charmander", "charmeleon"],
    ["squirtle", "wartortle"],
    ["pikachu", "raichu"],
    ["abra", "kadabra"],
    ["machop", "machoke"],
    ["eevee", pick(["vaporeon", "jolteon", "flareon"])],
  ];

  const ORPHAN_BASICS = [
    "jigglypuff", "meowth", "psyduck", "growlithe", "geodude", "magnemite",
    "gastly", "onix", "voltorb", "cubone", "horsea", "staryu", "magikarp",
    "dratini", "chikorita", "cyndaquil", "totodile", "houndour", "larvitar",
    "ralts", "aron", "bagon",
  ];

  function artUrl(dex) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const $ = (id) => document.getElementById(id);

  const boardEl = $("board");
  const energyTrackEl = $("energy-track");
  const cardsLeftEl = $("cards-left");
  const bestValueEl = $("best-value");
  const actionEmptyEl = $("action-empty");
  const actionSelectedEl = $("action-selected");
  const actionThumbEl = $("action-thumb");
  const actionNameEl = $("action-name");
  const actionHintEl = $("action-hint");
  const btnRelease = $("btn-release");
  const btnReleaseCost = $("btn-release-cost");
  const toastStack = $("toast-stack");
  const overlayResult = $("overlay-result");
  const resultTitleEl = $("result-title");
  const resultMsgEl = $("result-msg");
  const btnResultAgain = $("btn-result-again");
  const overlayHowto = $("overlay-howto");
  const btnHelp = $("btn-help");
  const btnHowtoClose = $("btn-howto-close");
  const btnHowtoOk = $("btn-howto-ok");
  const btnRestart = $("btn-restart");

  let catalogById = {};
  let board = [];
  let selectedId = null;
  let energy = 0;
  let maxEnergy = 0;
  let totalCount = 0;
  let clearedCount = 0;
  let over = null; // null | 'win' | 'lose'

  function getBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function updateBest(n) {
    const best = getBest();
    if (n > best) {
      try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* private mode: ignore */ }
    }
    bestValueEl.textContent = `${getBest()}장`;
  }

  function isPair(a, b) {
    return a.evolvesFrom === b.id || b.evolvesFrom === a.id;
  }

  function hasPartnerOnBoard(card, cards) {
    return cards.some((o) => o.id !== card.id && isPair(card, o));
  }

  function buildBoard() {
    const chosenPairs = shuffle(PAIR_LINE_POOL).slice(0, PAIR_COUNT);
    const orphanPool = shuffle(ORPHAN_BASICS).slice(0, LONE_COUNT);
    const ids = [];
    chosenPairs.forEach(([a, b]) => ids.push(a, b));
    orphanPool.forEach((id) => ids.push(id));
    return shuffle(ids).map((id) => {
      const c = catalogById[id];
      return {
        id: c.id,
        dex: c.dex,
        name: c.name,
        type: c.type,
        stage: c.stage,
        evolvesFrom: c.evolves_from || null,
        cost: c.stage === "basic" ? 1 : 2,
        cleared: false,
      };
    });
  }

  function computeStartEnergy(cards) {
    const mandatory = cards
      .filter((c) => !hasPartnerOnBoard(c, cards))
      .reduce((sum, c) => sum + c.cost, 0);
    return mandatory + ENERGY_BUFFER;
  }

  function buildCardEl(card) {
    const el = document.createElement("div");
    el.className = "card" + (card.stage !== "basic" ? " is-evo" : "");
    el.dataset.id = card.id;
    el.innerHTML = `
      <span class="card-stage">${card.stage === "basic" ? "기본" : "진화"}</span>
      <div class="card-art-wrap"><img class="card-art" src="${artUrl(card.dex)}" alt="${card.name}" loading="lazy"></div>
      <span class="card-name">${card.name}</span>
      <div class="card-foot">
        <span class="type-dot ${card.type}"></span>
        <span class="card-cost">⚡${card.cost}</span>
      </div>
    `;
    el.addEventListener("click", () => onCardClick(card.id));
    return el;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    board.forEach((card) => {
      if (card.cleared) return;
      boardEl.appendChild(buildCardEl(card));
    });
  }

  function updateSelectionClasses() {
    boardEl.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === selectedId);
    });
  }

  function renderHud() {
    cardsLeftEl.textContent = String(totalCount - clearedCount);
    energyTrackEl.innerHTML = "";
    for (let i = 0; i < maxEnergy; i++) {
      const pip = document.createElement("span");
      pip.className = "energy-pip" + (i < energy ? "" : " spent");
      energyTrackEl.appendChild(pip);
    }
    bestValueEl.textContent = `${getBest()}장`;
  }

  function renderActionBar() {
    const card = selectedId ? board.find((c) => c.id === selectedId) : null;
    if (!card) {
      actionEmptyEl.classList.remove("hidden");
      actionSelectedEl.classList.add("hidden");
      return;
    }
    actionEmptyEl.classList.add("hidden");
    actionSelectedEl.classList.remove("hidden");
    actionThumbEl.src = artUrl(card.dex);
    actionThumbEl.alt = card.name;
    actionNameEl.textContent = card.name;
    actionHintEl.textContent = card.stage === "basic"
      ? "진화 상대를 탭하면 무료예요"
      : "기본 카드를 탭하면 무료예요";
    btnReleaseCost.textContent = `⚡${card.cost}`;
    btnRelease.disabled = energy < card.cost || !!over;
  }

  function animateAndRemove(id, cls) {
    const el = boardEl.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove("selected");
    el.classList.add(cls);
    setTimeout(() => el.remove(), 380);
  }

  function showToast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? ` ${kind}` : "");
    t.textContent = msg;
    toastStack.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  function clearPair(a, b) {
    a.cleared = true;
    b.cleared = true;
    clearedCount += 2;
    animateAndRemove(a.id, "matched");
    animateAndRemove(b.id, "matched");
    const basic = a.stage === "basic" ? a : b;
    const evo = a.stage === "basic" ? b : a;
    showToast(`진화 성공! ${basic.name} → ${evo.name}`, "good");
  }

  function releaseSolo(card) {
    energy -= card.cost;
    card.cleared = true;
    clearedCount += 1;
    animateAndRemove(card.id, "released");
  }

  function onCardClick(id) {
    if (over) return;
    const card = board.find((c) => c.id === id);
    if (!card || card.cleared) return;

    if (selectedId === id) {
      selectedId = null;
    } else if (selectedId === null) {
      selectedId = id;
    } else {
      const a = board.find((c) => c.id === selectedId);
      if (a && isPair(a, card)) {
        clearPair(a, card);
        selectedId = null;
        updateSelectionClasses();
        renderHud();
        renderActionBar();
        checkEnd();
        return;
      }
      selectedId = id;
    }
    updateSelectionClasses();
    renderActionBar();
  }

  function onRelease() {
    if (over) return;
    const card = selectedId ? board.find((c) => c.id === selectedId) : null;
    if (!card) return;
    if (energy < card.cost) {
      btnRelease.classList.add("shake");
      setTimeout(() => btnRelease.classList.remove("shake"), 400);
      return;
    }
    releaseSolo(card);
    selectedId = null;
    updateSelectionClasses();
    renderHud();
    renderActionBar();
    checkEnd();
  }

  function checkEnd() {
    const remaining = board.filter((c) => !c.cleared);
    if (remaining.length === 0) {
      win();
      return;
    }
    const canAfford = remaining.some((c) => c.cost <= energy);
    const canPair = remaining.some((c) => remaining.some((o) => o.id !== c.id && isPair(c, o)));
    if (!canAfford && !canPair) {
      lose();
    }
  }

  function showOverlay(el) { el.classList.remove("hidden"); }
  function hideOverlay(el) { el.classList.add("hidden"); }

  function win() {
    over = "win";
    updateBest(clearedCount);
    resultTitleEl.textContent = "승리!";
    resultTitleEl.className = "result-title win";
    resultMsgEl.textContent = `카드 ${totalCount}장을 모두 치웠어요! 남은 에너지 ${energy}`;
    showOverlay(overlayResult);
  }

  function lose() {
    over = "lose";
    updateBest(clearedCount);
    resultTitleEl.textContent = "패배...";
    resultTitleEl.className = "result-title lose";
    resultMsgEl.textContent = `에너지가 바닥났어요. ${clearedCount}/${totalCount}장을 치웠어요.`;
    showOverlay(overlayResult);
  }

  function startNewGame() {
    over = null;
    selectedId = null;
    clearedCount = 0;
    board = buildBoard();
    totalCount = board.length;
    maxEnergy = computeStartEnergy(board);
    energy = maxEnergy;
    hideOverlay(overlayResult);
    renderBoard();
    renderHud();
    renderActionBar();
  }

  function wireEvents() {
    btnHelp.addEventListener("click", () => showOverlay(overlayHowto));
    btnHowtoClose.addEventListener("click", () => hideOverlay(overlayHowto));
    btnHowtoOk.addEventListener("click", () => hideOverlay(overlayHowto));
    btnRestart.addEventListener("click", startNewGame);
    btnResultAgain.addEventListener("click", startNewGame);
    btnRelease.addEventListener("click", onRelease);
  }

  async function boot() {
    wireEvents();
    bestValueEl.textContent = `${getBest()}장`;
    try {
      const data = await fetch("cards.json").then((r) => r.json());
      catalogById = Object.fromEntries(data.cards.map((c) => [c.id, c]));
      startNewGame();
    } catch (e) {
      boardEl.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:24px 8px;">카드 데이터를 불러오지 못했어요. 새로고침 해보세요.</p>';
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
