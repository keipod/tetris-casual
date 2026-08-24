(() => {
  "use strict";

  const LS_BEST = "silhouette_best_v1";
  const LS_SOUND = "silhouette_sound_v1";
  const SET_SIZE = 10;
  const TIME_LIMIT_MS = 10000;
  const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  const SPRITE_FALLBACK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

  /** Static id -> Korean name map (gen1 classics). Baked in for offline resilience; only art is fetched. */
  const POOL = [
    { id: 1, ko: "이상해씨" },
    { id: 4, ko: "파이리" },
    { id: 6, ko: "리자몽" },
    { id: 7, ko: "꼬부기" },
    { id: 9, ko: "거북왕" },
    { id: 12, ko: "버터플" },
    { id: 15, ko: "독침붕" },
    { id: 16, ko: "구구" },
    { id: 19, ko: "꼬렛" },
    { id: 21, ko: "깨비참" },
    { id: 25, ko: "피카츄" },
    { id: 26, ko: "라이츄" },
    { id: 31, ko: "니드퀸" },
    { id: 34, ko: "니드킹" },
    { id: 35, ko: "삐삐" },
    { id: 37, ko: "식스테일" },
    { id: 39, ko: "푸린" },
    { id: 43, ko: "뚜벅쵸" },
    { id: 50, ko: "디그다" },
    { id: 52, ko: "나옹" },
    { id: 54, ko: "고라파덕" },
    { id: 56, ko: "망키" },
    { id: 58, ko: "가디" },
    { id: 60, ko: "발챙이" },
    { id: 63, ko: "캐이시" },
    { id: 66, ko: "알통몬" },
    { id: 74, ko: "꼬마돌" },
    { id: 77, ko: "포니타" },
    { id: 79, ko: "야돈" },
    { id: 81, ko: "코일" },
    { id: 83, ko: "파오리" },
    { id: 88, ko: "질퍽이" },
    { id: 90, ko: "셀러" },
    { id: 92, ko: "고오스" },
    { id: 95, ko: "롱스톤" },
    { id: 98, ko: "크랩" },
    { id: 100, ko: "찌리리공" },
    { id: 104, ko: "탕구리" },
    { id: 105, ko: "텅구리" },
    { id: 109, ko: "또가스" },
    { id: 113, ko: "럭키" },
    { id: 115, ko: "캥카" },
    { id: 116, ko: "쏘드라" },
    { id: 120, ko: "별가사리" },
    { id: 122, ko: "마임맨" },
    { id: 128, ko: "켄타로스" },
    { id: 129, ko: "잉어킹" },
    { id: 130, ko: "갸라도스" },
    { id: 131, ko: "라프라스" },
    { id: 132, ko: "메타몽" },
    { id: 133, ko: "이브이" },
    { id: 142, ko: "프테라" },
    { id: 143, ko: "잠만보" },
    { id: 144, ko: "프리져" },
    { id: 145, ko: "썬더" },
    { id: 146, ko: "파이어" },
    { id: 147, ko: "미뇽" },
    { id: 149, ko: "망나뇽" },
    { id: 150, ko: "뮤츠" },
    { id: 151, ko: "뮤" },
  ];

  function artUrl(id) { return `${ART}/${id}.png`; }
  function fallbackUrl(id) { return `${SPRITE_FALLBACK}/${id}.png`; }

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

  function rngFrom(random) {
    const rnd = random || Math.random;
    return {
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

  /** Pure: 1 correct + 3 unique distractors from pool, shuffled. */
  function buildChoices(pool, correctMon, rng) {
    const others = pool.filter((p) => p.id !== correctMon.id);
    const distractors = rng.shuffle(others).slice(0, 3);
    return rng.shuffle([correctMon, ...distractors]);
  }

  /** Pure: pick `size` unique questions from pool, each with 4 choices. */
  function buildRound(pool, rng, size) {
    const chosen = rng.shuffle(pool).slice(0, size);
    return chosen.map((mon) => ({ mon, choices: buildChoices(pool, mon, rng) }));
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function selfTest() {
    const rng = rngFrom(mulberry32(7));
    assert(POOL.length >= 40 && POOL.length <= 60, "pool size within 40-60");
    const names = new Set(POOL.map((p) => p.ko));
    assert(names.size === POOL.length, "no duplicate korean names in pool");
    const ids = new Set(POOL.map((p) => p.id));
    assert(ids.size === POOL.length, "no duplicate ids in pool");

    const round = buildRound(POOL, rng, SET_SIZE);
    assert(round.length === SET_SIZE, "round has SET_SIZE questions");
    const seen = new Set();
    round.forEach((q) => {
      assert(q.choices.length === 4, "4 choices per question");
      const cids = new Set(q.choices.map((c) => c.id));
      assert(cids.size === 4, "choices are unique");
      assert(q.choices.some((c) => c.id === q.mon.id), "correct choice present");
      assert(!seen.has(q.mon.id), "question monsters are unique within a round");
      seen.add(q.mon.id);
    });
    return { ok: true, checked: ["pool", "buildChoices", "buildRound"] };
  }

  const api = { POOL, artUrl, fallbackUrl, buildChoices, buildRound, rngFrom, mulberry32, selfTest };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__silhouette = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__s", "1");
      localStorage.removeItem("__s");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const streakEl = document.getElementById("streak");
  const qIndexEl = document.getElementById("q-index");
  const timerBar = document.getElementById("timer-bar");
  const timerNum = document.getElementById("timer-num");
  const monImg = document.getElementById("mon-img");
  const imgSpin = document.getElementById("img-spin");
  const monName = document.getElementById("mon-name");
  const promptEl = document.getElementById("prompt");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnSound = document.getElementById("btn-sound");
  const choiceBtns = [...document.querySelectorAll(".choice-btn")];
  const fxLayer = document.getElementById("fx-layer");
  const feedbackBanner = document.getElementById("feedback-banner");
  const feedbackTitle = document.getElementById("feedback-title");
  const feedbackGain = document.getElementById("feedback-gain");
  const appEl = document.getElementById("app");

  let best = +(storage.getItem(LS_BEST) || 0);
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let score = 0;
  let streak = 0;
  let round = [];
  let qIndex = 0;
  let locked = true;
  let timerId = 0;
  let startedAt = 0;
  let timerPaused = false;
  let pausedLeftMs = 0;
  let advanceTimer = 0;

  const SFX = (() => {
    const play = (role, vol) => { if (soundOn && window.CasualSfx) window.CasualSfx.play(role, vol); };
    window.addEventListener("pointerdown", () => {
      if (window.CasualSfx) window.CasualSfx.unlock();
    }, { once: true });
    return {
      ok() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["success", "clear"], 70, 0.75);
      },
      okBig() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["success", "clear", "combo"], 80, 0.8);
      },
      bad() {
        if (!soundOn || !window.CasualSfx) return;
        window.CasualSfx.playSeq(["fail", "failDeep"], 90, 0.75);
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

  function setImage(url, fallback) {
    imgSpin.hidden = false;
    monImg.style.opacity = "0.25";
    const onOk = () => {
      imgSpin.hidden = true;
      monImg.style.opacity = "1";
    };
    monImg.onload = onOk;
    monImg.onerror = () => {
      if (fallback && monImg.src !== fallback) {
        monImg.src = fallback;
        return;
      }
      onOk();
    };
    monImg.src = url;
  }

  function clearFx() {
    if (fxLayer) fxLayer.innerHTML = "";
    if (appEl) appEl.classList.remove("screen-shake");
  }

  function flash(ok) {
    if (!fxLayer) return;
    clearFx();
    const f = document.createElement("div");
    f.className = `fx-flash ${ok ? "ok" : "bad"}`;
    fxLayer.appendChild(f);
    if (!ok && appEl) {
      appEl.classList.remove("screen-shake");
      void appEl.offsetWidth;
      appEl.classList.add("screen-shake");
    }
  }

  function hideFeedback() {
    if (!feedbackBanner) return;
    feedbackBanner.hidden = true;
    feedbackBanner.classList.remove("show", "hide", "is-ok", "is-bad");
    if (feedbackGain) {
      feedbackGain.hidden = true;
      feedbackGain.textContent = "";
    }
  }

  function showFeedback(ok, correctName, timedOut, gained) {
    if (!feedbackBanner) return;
    hideFeedback();
    feedbackBanner.classList.add(ok ? "is-ok" : "is-bad");
    if (ok) {
      feedbackTitle.textContent = streak >= 3 ? `연속 ${streak}회 정답!` : "정답이에요!";
      if (feedbackGain && gained > 0) {
        feedbackGain.hidden = false;
        feedbackGain.textContent = `+${gained}`;
      }
    } else {
      feedbackTitle.textContent = timedOut ? `시간 초과! 정답은 ${correctName}` : `아쉬워요! 정답은 ${correctName}`;
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
    const sec = Math.ceil(left / 1000);
    if (timerNum.textContent !== String(sec)) {
      timerNum.textContent = String(sec);
      if (sec <= 3 && sec > 0) SFX.tick();
    }
    if (left <= 0) {
      timerId = 0;
      if (!locked) reveal(round[qIndex], null, true);
      return;
    }
    timerId = requestAnimationFrame(runTimerTick);
  }

  function startTimer() {
    stopTimer();
    timerPaused = false;
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

  function remainingBonus() {
    const base = timerPaused
      ? pausedLeftMs
      : Math.max(0, TIME_LIMIT_MS - (performance.now() - startedAt));
    return Math.ceil(base / 1000) * 6;
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best);
    qIndexEl.textContent = `${Math.min(qIndex + 1, SET_SIZE)} / ${SET_SIZE}`;
  }

  function finishRound() {
    if (score > best) {
      best = score;
      storage.setItem(LS_BEST, String(best));
    }
    updateHud();
    showOverlay(`
      <h2>세트 완료</h2>
      <div class="big">${score}</div>
      <p>최고 ${best} · 연속 정답이 이어질수록 보너스가 커져요.</p>
      <button type="button" class="retry" id="btn-again">다시 하기</button>
    `);
    document.getElementById("btn-again").onclick = () => startRound();
  }

  function paintQuestion(q) {
    hideFeedback();
    clearFx();
    monName.hidden = true;
    monName.textContent = "";
    monImg.classList.remove("revealed");
    promptEl.hidden = false;
    setImage(artUrl(q.mon.id), fallbackUrl(q.mon.id));
    choiceBtns.forEach((btn, i) => {
      const choice = q.choices[i];
      btn.textContent = choice.ko;
      btn.dataset.id = String(choice.id);
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
    });
  }

  function reveal(q, pickedId, timedOut) {
    locked = true;
    stopTimer();
    if (advanceTimer) clearTimeout(advanceTimer);
    const ok = !timedOut && pickedId === q.mon.id;

    monImg.classList.add("revealed");
    monName.hidden = false;
    monName.textContent = q.mon.ko;
    promptEl.hidden = true;

    choiceBtns.forEach((btn) => {
      btn.disabled = true;
      if (+btn.dataset.id === q.mon.id) btn.classList.add("correct");
      if (!ok && +btn.dataset.id === pickedId) btn.classList.add("wrong");
    });

    flash(ok);

    let gained = 0;
    if (ok) {
      streak += 1;
      gained = 100 + (streak - 1) * 20 + remainingBonus();
      score += gained;
      if (streak >= 3) SFX.okBig();
      else SFX.ok();
    } else {
      streak = 0;
      SFX.bad();
    }
    showFeedback(ok, q.mon.ko, timedOut, gained);
    updateHud();

    const wait = ok ? 1500 : 2200;
    advanceTimer = setTimeout(() => {
      hideFeedback();
      clearFx();
      qIndex += 1;
      if (qIndex >= round.length) finishRound();
      else showCurrent();
    }, wait);
  }

  function showCurrent() {
    const q = round[qIndex];
    locked = false;
    updateHud();
    paintQuestion(q);
    startTimer();
  }

  choiceBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (locked || !helpOverlay.hidden) return;
      SFX.click();
      reveal(round[qIndex], +btn.dataset.id, false);
    });
  });

  function startRound() {
    hideOverlay();
    locked = true;
    score = 0;
    streak = 0;
    qIndex = 0;
    updateHud();
    const rng = rngFrom();
    round = buildRound(POOL, rng, SET_SIZE);
    showCurrent();
  }

  startRound();
})();
