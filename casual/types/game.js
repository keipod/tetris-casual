(() => {
  "use strict";

  const LS_BEST = "types_best_v1";
  const LS_SOUND = "types_sound_v1";
  const TIME_LIMIT_MS = 10000;
  const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

  /** Standard Pokemon type chart (Gen 6+, 18 types). attacker -> { defender: multiplier }.
   * Only non-1x entries are listed; anything omitted is neutral (1x). */
  const TYPE_CHART = {
    normal: { rock: 0.5, steel: 0.5, ghost: 0 },
    fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
    water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
    electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
    grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
    ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
    flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
    bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
    ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
    steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
    fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  };

  const TYPES = [
    { id: "normal", ko: "노말", color: "#A8A878", emoji: "⚪" },
    { id: "fire", ko: "불꽃", color: "#F08030", emoji: "🔥" },
    { id: "water", ko: "물", color: "#6890F0", emoji: "💧" },
    { id: "electric", ko: "전기", color: "#F8D030", emoji: "⚡" },
    { id: "grass", ko: "풀", color: "#78C850", emoji: "🌿" },
    { id: "ice", ko: "얼음", color: "#98D8D8", emoji: "❄️" },
    { id: "fighting", ko: "격투", color: "#C03028", emoji: "👊" },
    { id: "poison", ko: "독", color: "#A040A0", emoji: "☠️" },
    { id: "ground", ko: "땅", color: "#E0C068", emoji: "⛰️" },
    { id: "flying", ko: "비행", color: "#A890F0", emoji: "🌪️" },
    { id: "psychic", ko: "에스퍼", color: "#F85888", emoji: "🔮" },
    { id: "bug", ko: "벌레", color: "#A8B820", emoji: "🐛" },
    { id: "rock", ko: "바위", color: "#B8A038", emoji: "🪨" },
    { id: "ghost", ko: "고스트", color: "#705898", emoji: "👻" },
    { id: "dragon", ko: "드래곤", color: "#7038F8", emoji: "🐉" },
    { id: "dark", ko: "악", color: "#705848", emoji: "🌑" },
    { id: "steel", ko: "강철", color: "#B8B8D0", emoji: "⚙️" },
    { id: "fairy", ko: "페어리", color: "#EE99AC", emoji: "✨" },
  ];
  const TYPE_MAP = new Map(TYPES.map((t) => [t.id, t]));
  const ALL_TYPE_IDS = TYPES.map((t) => t.id);

  /** Static pool: PokeAPI-verified Korean names + types (avoids runtime API dependency). */
  const POOL = [
    { id: 1, nameKo: "이상해씨", types: ["grass", "poison"] },
    { id: 4, nameKo: "파이리", types: ["fire"] },
    { id: 6, nameKo: "리자몽", types: ["fire", "flying"] },
    { id: 7, nameKo: "꼬부기", types: ["water"] },
    { id: 9, nameKo: "거북왕", types: ["water"] },
    { id: 12, nameKo: "버터플", types: ["bug", "flying"] },
    { id: 15, nameKo: "독침붕", types: ["bug", "poison"] },
    { id: 16, nameKo: "구구", types: ["normal", "flying"] },
    { id: 19, nameKo: "꼬렛", types: ["normal"] },
    { id: 25, nameKo: "피카츄", types: ["electric"] },
    { id: 27, nameKo: "모래두지", types: ["ground"] },
    { id: 35, nameKo: "삐삐", types: ["fairy"] },
    { id: 37, nameKo: "식스테일", types: ["fire"] },
    { id: 39, nameKo: "푸린", types: ["normal", "fairy"] },
    { id: 41, nameKo: "주뱃", types: ["poison", "flying"] },
    { id: 46, nameKo: "파라스", types: ["bug", "grass"] },
    { id: 52, nameKo: "나옹", types: ["normal"] },
    { id: 54, nameKo: "고라파덕", types: ["water"] },
    { id: 58, nameKo: "가디", types: ["fire"] },
    { id: 60, nameKo: "발챙이", types: ["water"] },
    { id: 63, nameKo: "캐이시", types: ["psychic"] },
    { id: 66, nameKo: "알통몬", types: ["fighting"] },
    { id: 69, nameKo: "모다피", types: ["grass", "poison"] },
    { id: 74, nameKo: "꼬마돌", types: ["rock", "ground"] },
    { id: 77, nameKo: "포니타", types: ["fire"] },
    { id: 81, nameKo: "코일", types: ["electric", "steel"] },
    { id: 84, nameKo: "두두", types: ["normal", "flying"] },
    { id: 92, nameKo: "고오스", types: ["ghost", "poison"] },
    { id: 95, nameKo: "롱스톤", types: ["rock", "ground"] },
    { id: 100, nameKo: "찌리리공", types: ["electric"] },
    { id: 104, nameKo: "탕구리", types: ["ground"] },
    { id: 109, nameKo: "또가스", types: ["poison"] },
    { id: 113, nameKo: "럭키", types: ["normal"] },
    { id: 116, nameKo: "쏘드라", types: ["water"] },
    { id: 122, nameKo: "마임맨", types: ["psychic", "fairy"] },
    { id: 123, nameKo: "스라크", types: ["bug", "flying"] },
    { id: 124, nameKo: "루주라", types: ["ice", "psychic"] },
    { id: 126, nameKo: "마그마", types: ["fire"] },
    { id: 127, nameKo: "쁘사이저", types: ["bug"] },
    { id: 129, nameKo: "잉어킹", types: ["water"] },
    { id: 131, nameKo: "라프라스", types: ["water", "ice"] },
    { id: 133, nameKo: "이브이", types: ["normal"] },
    { id: 143, nameKo: "잠만보", types: ["normal"] },
    { id: 144, nameKo: "프리져", types: ["ice", "flying"] },
    { id: 147, nameKo: "미뇽", types: ["dragon"] },
    { id: 149, nameKo: "망나뇽", types: ["dragon", "flying"] },
    { id: 150, nameKo: "뮤츠", types: ["psychic"] },
    { id: 197, nameKo: "블래키", types: ["dark"] },
    { id: 200, nameKo: "무우마", types: ["ghost"] },
    { id: 208, nameKo: "강철톤", types: ["steel", "ground"] },
    { id: 227, nameKo: "무장조", types: ["steel", "flying"] },
    { id: 302, nameKo: "깜까미", types: ["dark", "ghost"] },
    { id: 360, nameKo: "마자", types: ["psychic"] },
    { id: 449, nameKo: "히포포타스", types: ["ground"] },
  ];

  function artUrl(id) {
    return `${ART}/${id}.png`;
  }

  function fallbackUrl(id) {
    return `${SPRITE}/${id}.png`;
  }

  /** Multiplier of a single attacking type against a single defending type (1 = neutral). */
  function typeMultiplier(atk, def) {
    const row = TYPE_CHART[atk];
    if (!row || !(def in row)) return 1;
    return row[def];
  }

  /** Combined multiplier of an attacking type against a (possibly dual-type) defender. */
  function effectiveness(atk, defTypes) {
    return (defTypes || []).reduce((acc, def) => acc * typeMultiplier(atk, def), 1);
  }

  /** All attacking types that are super-effective (>1x) against a defender's type list. */
  function weaknessesOf(defTypes) {
    return ALL_TYPE_IDS.filter((atk) => effectiveness(atk, defTypes) > 1);
  }

  function rngFrom(random) {
    const rnd = random || Math.random;
    return {
      next: rnd,
      int(max) { return Math.floor(rnd() * max); },
      pick(arr) { return arr[Math.floor(rnd() * arr.length)]; },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
    };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Build one round: pick 4 attacking type ids to show.
   * Guarantees at least one is super-effective (>1x) against defTypes.
   * The remaining 3 are drawn randomly from the rest, so if multiple real
   * weaknesses exist, more than one shown option may legitimately be correct.
   */
  function buildChoices(defTypes, rng) {
    const weak = weaknessesOf(defTypes);
    if (!weak.length) return null;
    const guaranteed = rng.pick(weak);
    const rest = rng.shuffle(ALL_TYPE_IDS.filter((t) => t !== guaranteed));
    const shown = rng.shuffle([guaranteed, ...rest.slice(0, 3)]);
    const correctSet = new Set(shown.filter((t) => effectiveness(t, defTypes) > 1));
    return { shown, correctSet };
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function selfTest() {
    assert(TYPES.length === 18, "must have exactly 18 types");
    assert(POOL.length >= 40, "pool must have at least 40 species");
    POOL.forEach((p) => {
      assert(p.types.every((t) => TYPE_MAP.has(t)), `${p.nameKo} has unknown type`);
      assert(weaknessesOf(p.types).length > 0, `${p.nameKo} must have at least one weakness`);
    });

    assert(typeMultiplier("fire", "grass") === 2, "fire > grass = 2x");
    assert(typeMultiplier("water", "fire") === 2, "water > fire = 2x");
    assert(typeMultiplier("fire", "water") === 0.5, "fire > water = 0.5x");
    assert(typeMultiplier("electric", "ground") === 0, "electric > ground = 0x (immune)");
    assert(typeMultiplier("ghost", "normal") === 0, "ghost > normal = 0x (immune)");
    assert(typeMultiplier("fighting", "ghost") === 0, "fighting > ghost = 0x (immune)");
    assert(typeMultiplier("normal", "rock") === 0.5, "normal > rock = 0.5x");
    assert(typeMultiplier("dragon", "fairy") === 0, "dragon > fairy = 0x (immune)");

    // Bulbasaur (grass/poison): weak to fire, ice, flying, psychic (each 2x from one side, neutral other).
    const bulbaWeak = new Set(weaknessesOf(["grass", "poison"]));
    ["fire", "ice", "flying", "psychic"].forEach((t) => assert(bulbaWeak.has(t), `bulbasaur must be weak to ${t}`));
    assert(!bulbaWeak.has("water"), "bulbasaur must not be weak to water (resisted by grass)");

    // Steelix (steel/ground): real weaknesses are fire, water, fighting, ground.
    const steelixWeak = new Set(weaknessesOf(["steel", "ground"]));
    ["fire", "water", "fighting", "ground"].forEach((t) => assert(steelixWeak.has(t), `steelix must be weak to ${t}`));
    assert(!steelixWeak.has("ice"), "steelix must not be weak to ice (steel resist cancels ground weakness)");
    assert(!steelixWeak.has("electric"), "steelix must be immune to electric (ground)");
    assert(!steelixWeak.has("poison"), "steelix must be immune to poison (steel)");

    const rng = rngFrom(mulberry32(7));
    for (let i = 0; i < 50; i++) {
      const mon = rng.pick(POOL);
      const round = buildChoices(mon.types, rng);
      assert(round, `round must build for ${mon.nameKo}`);
      assert(round.shown.length === 4, "always exactly 4 options shown");
      assert(new Set(round.shown).size === 4, "4 distinct options shown");
      assert(round.correctSet.size >= 1, "at least one correct option shown");
      round.correctSet.forEach((t) => assert(round.shown.includes(t), "correct types must be among shown"));
    }

    return { ok: true, checked: ["typeChart", "poolIntegrity", "buildChoices"] };
  }

  const api = { TYPES, TYPE_CHART, POOL, typeMultiplier, effectiveness, weaknessesOf, buildChoices, rngFrom, mulberry32, selfTest };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__types = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__t", "1");
      localStorage.removeItem("__t");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const streakEl = document.getElementById("streak");
  const timerBar = document.getElementById("timer-bar");
  const monSprite = document.getElementById("mon-sprite");
  const monSpin = document.getElementById("mon-spin");
  const monName = document.getElementById("mon-name");
  const monTypes = document.getElementById("mon-types");
  const arena = document.getElementById("arena");
  const choicesEl = document.getElementById("choices");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnSound = document.getElementById("btn-sound");
  const fxLayer = document.getElementById("fx-layer");
  const feedbackBanner = document.getElementById("feedback-banner");
  const feedbackTitle = document.getElementById("feedback-title");
  const feedbackDetail = document.getElementById("feedback-detail");
  const choicePanel = document.getElementById("choice-panel");
  const appEl = document.getElementById("app");

  let best = +(storage.getItem(LS_BEST) || 0);
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let score = 0;
  let streak = 0;
  let locked = true;
  let current = null;
  let recentIds = [];
  let timerId = 0;
  let startedAt = 0;
  let timerPaused = false;
  let pausedLeftMs = 0;
  let timeoutHandler = null;
  let advanceTimer = 0;
  const rng = rngFrom();

  const SFX = (() => {
    const play = (role, vol) => { if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol); };
    return {
      ok() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["success", "clear", "combo"], 70, 0.72);
      },
      okBig() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.8);
      },
      bad() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["fail", "failDeep"], 95, 0.75);
      },
      tick() { play("tick"); },
      click() { play("click"); },
    };
  })();

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
  bestEl.textContent = best;
  syncSoundBtn();

  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function setSprite(id) {
    monSpin.hidden = false;
    monSprite.style.opacity = "0.25";
    const url = artUrl(id);
    const fallback = fallbackUrl(id);
    const onOk = () => {
      monSpin.hidden = true;
      monSprite.style.opacity = "1";
    };
    monSprite.onload = onOk;
    monSprite.onerror = () => {
      if (fallback && monSprite.src !== fallback) {
        monSprite.src = fallback;
        return;
      }
      onOk();
    };
    monSprite.src = url;
  }

  function renderTypeBadges(container, typeIds) {
    container.innerHTML = "";
    typeIds.forEach((tid) => {
      const t = TYPE_MAP.get(tid);
      const span = document.createElement("span");
      span.className = "type-badge";
      span.style.setProperty("--tc", t.color);
      span.textContent = `${t.emoji} ${t.ko}`;
      container.appendChild(span);
    });
  }

  function renderChoices(shownTypeIds) {
    choicesEl.innerHTML = "";
    shownTypeIds.forEach((tid) => {
      const t = TYPE_MAP.get(tid);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-choice";
      btn.dataset.type = tid;
      btn.style.setProperty("--tc", t.color);
      btn.innerHTML = `<span class="glyph">${t.emoji}</span><span>${t.ko}</span>`;
      btn.addEventListener("click", () => onPick(tid));
      choicesEl.appendChild(btn);
    });
  }

  function clearFx() {
    if (fxLayer) fxLayer.innerHTML = "";
    if (appEl) appEl.classList.remove("screen-shake");
  }

  function hideFeedback() {
    if (!feedbackBanner) return;
    feedbackBanner.hidden = true;
    feedbackBanner.classList.remove("show", "hide", "is-ok", "is-bad");
    if (choicePanel) choicePanel.classList.remove("is-reveal");
  }

  function burstParticles(ok) {
    if (!fxLayer) return;
    clearFx();
    const flash = document.createElement("div");
    flash.className = `fx-flash ${ok ? "ok" : "bad"}`;
    fxLayer.appendChild(flash);

    if (ok) {
      const ring = document.createElement("div");
      ring.className = "fx-ring";
      fxLayer.appendChild(ring);
      const burst = document.createElement("div");
      burst.className = "fx-burst";
      const colors = ["#fbbf24", "#34d399", "#22d3ee", "#8b5cf6", "#fff"];
      for (let i = 0; i < 22; i++) {
        const p = document.createElement("span");
        p.className = "fx-particle";
        const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.2;
        const dist = 90 + Math.random() * 140;
        p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
        p.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`);
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = `${Math.random() * 0.08}s`;
        burst.appendChild(p);
      }
      fxLayer.appendChild(burst);
    } else if (appEl) {
      appEl.classList.remove("screen-shake");
      void appEl.offsetWidth;
      appEl.classList.add("screen-shake");
    }
  }

  function showFeedback(ok, timedOut, correctLabels) {
    if (!feedbackBanner) return;
    hideFeedback();
    feedbackBanner.classList.add(ok ? "is-ok" : "is-bad");
    if (choicePanel) choicePanel.classList.add("is-reveal");
    if (ok) {
      feedbackTitle.textContent = streak >= 3 ? `연속 ${streak}!` : "효과가 굉장했다!";
      feedbackDetail.textContent = "약점을 정확히 찔렀어요.";
    } else {
      feedbackTitle.textContent = timedOut ? "시간 초과!" : "효과가 별로였다...";
      feedbackDetail.textContent = `정답: ${correctLabels.join(", ")}`;
    }
    feedbackBanner.hidden = false;
    requestAnimationFrame(() => feedbackBanner.classList.add("show"));
  }

  function stopTimer() {
    if (timerId) cancelAnimationFrame(timerId);
    timerId = 0;
  }

  function runTimerTick(now) {
    const left = Math.max(0, TIME_LIMIT_MS - (now - startedAt));
    const p = left / TIME_LIMIT_MS;
    timerBar.style.transform = `scaleX(${p})`;
    if (left <= 0) {
      timerId = 0;
      if (timeoutHandler) timeoutHandler();
      return;
    }
    if (Math.ceil(left / 1000) <= 3) SFX.tick();
    timerId = requestAnimationFrame(runTimerTick);
  }

  function startTimer(onTimeout) {
    stopTimer();
    timerPaused = false;
    timeoutHandler = onTimeout;
    startedAt = performance.now();
    timerId = requestAnimationFrame(runTimerTick);
  }

  function pauseTimerForHelp() {
    if (!timerId || timerPaused) return;
    pausedLeftMs = Math.max(0, TIME_LIMIT_MS - (performance.now() - startedAt));
    stopTimer();
    timerPaused = true;
  }

  function resumeTimerAfterHelp() {
    if (!timerPaused || locked) {
      timerPaused = false;
      return;
    }
    timerPaused = false;
    startedAt = performance.now() - (TIME_LIMIT_MS - pausedLeftMs);
    timerId = requestAnimationFrame(runTimerTick);
  }

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.click();
    pauseTimerForHelp();
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
    resumeTimerAfterHelp();
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

  function updateHud() {
    scoreEl.textContent = String(score);
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best);
  }

  function pickPokemon() {
    const avoid = new Set(recentIds);
    let candidates = POOL.filter((p) => !avoid.has(p.id));
    if (candidates.length === 0) candidates = POOL;
    const mon = rng.pick(candidates);
    recentIds.push(mon.id);
    if (recentIds.length > 8) recentIds.shift();
    return mon;
  }

  function reveal(pickedType, timedOut) {
    locked = true;
    stopTimer();
    if (advanceTimer) clearTimeout(advanceTimer);
    const ok = !timedOut && current.correctSet.has(pickedType);
    arena.classList.add(ok ? "reveal-ok" : "reveal-bad");
    [...choicesEl.children].forEach((btn) => {
      btn.disabled = true;
      if (current.correctSet.has(btn.dataset.type)) btn.classList.add("correct");
      if (!ok && btn.dataset.type === pickedType) btn.classList.add("wrong");
    });
    burstParticles(ok);

    const correctLabels = [...current.correctSet].map((t) => TYPE_MAP.get(t).ko);
    if (ok) {
      streak += 1;
      score += 10 + Math.min(streak - 1, 10) * 2;
      if (streak > best) {
        best = streak;
        storage.setItem(LS_BEST, String(best));
      }
      if (streak >= 3) SFX.okBig();
      else SFX.ok();
    } else {
      streak = 0;
      SFX.bad();
    }
    showFeedback(ok, timedOut, correctLabels);
    updateHud();

    const wait = ok ? 1100 : 1800;
    advanceTimer = setTimeout(() => {
      hideFeedback();
      clearFx();
      showRound();
    }, wait);
  }

  function onPick(typeId) {
    if (locked || !helpOverlay.hidden) return;
    SFX.click();
    reveal(typeId, false);
  }

  function showRound() {
    const mon = pickPokemon();
    const round = buildChoices(mon.types, rng);
    if (!round) {
      showRound();
      return;
    }
    current = round;
    locked = false;
    arena.classList.remove("reveal-ok", "reveal-bad");
    setSprite(mon.id);
    monName.textContent = mon.nameKo;
    renderTypeBadges(monTypes, mon.types);
    renderChoices(round.shown);
    updateHud();
    startTimer(() => {
      if (!locked) reveal(null, true);
    });
  }

  function startGame() {
    hideOverlay();
    score = 0;
    streak = 0;
    recentIds = [];
    updateHud();
    showRound();
  }

  startGame();
})();
