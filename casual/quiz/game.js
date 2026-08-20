(() => {
  "use strict";

  const LS_BEST = "quiz_best_v1";
  const LS_SOUND = "quiz_sound_v1";
  const SET_SIZE = 10;
  const TIME_LIMIT_MS = 12000;
  const POKE_API = "https://pokeapi.co/api/v2";
  const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
  const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

  const ROAM_IDS = [1, 4, 7, 39, 52, 54, 133, 143, 172, 175, 183, 194, 252, 255, 258, 280, 311, 312, 387, 390, 393, 417, 427, 447, 506];
  const EASY_NAME_PAIRS = new Set([
    "25:26", "26:25",
    "4:5", "5:4", "5:6", "6:5",
    "1:2", "2:1", "2:3", "3:2",
    "7:8", "8:7", "8:9", "9:8",
  ]);

  const TYPE_FLIP = [
    ["불꽃", "물"], ["물", "불꽃"],
    ["전기", "풀"], ["풀", "전기"],
    ["얼음", "불꽃"],
    ["땅", "하늘"], ["하늘", "땅"],
    ["바다", "산"], ["산", "바다"],
    ["동굴", "초원"], ["초원", "동굴"],
    ["작다", "크다"], ["크다", "작다"],
    ["온순", "난폭"], ["난폭", "온순"],
    ["낮", "밤"], ["밤", "낮"],
  ];

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

  function speciesPool() {
    const set = new Set();
    for (let i = 1; i <= 151; i++) set.add(i);
    ROAM_IDS.forEach((id) => set.add(id));
    return [...set];
  }

  function cleanText(s) {
    return String(s || "")
      .replace(/[\n\f\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickKoName(names) {
    const ko = (names || []).find((n) => n.language && n.language.name === "ko");
    return ko ? cleanText(ko.name) : "";
  }

  function pickFlavor(entries) {
    const ko = (entries || []).filter((e) => e.language && e.language.name === "ko");
    const raw = (ko[0] || (entries || [])[0] || {}).flavor_text || "";
    return cleanText(raw);
  }

  function artUrl(id) {
    return `${ART}/${id}.png`;
  }

  function fallbackUrl(id) {
    return `${SPRITE}/${id}.png`;
  }

  function shareType(a, b) {
    const set = new Set(a.types || []);
    return (b.types || []).some((t) => set.has(t));
  }

  function tooEasyNameSwap(aId, bId) {
    return EASY_NAME_PAIRS.has(`${aId}:${bId}`);
  }

  function corruptNameKo(nameKo, others, rng) {
    const original = nameKo;
    const tries = [];

    if (nameKo.length >= 2) {
      const chars = nameKo.split("");
      const i = rng.int(chars.length);
      const pool = "가나다라마바사아자차카타파하";
      chars[i] = pool[(pool.indexOf(chars[i]) + 1 + rng.int(4)) % pool.length];
      tries.push(chars.join(""));
    }
    if (nameKo.length >= 3) {
      const chars = nameKo.split("");
      const i = Math.min(chars.length - 2, 1 + rng.int(chars.length - 2));
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      tries.push(chars.join(""));
    }
    const mistrans = nameKo
      .replace(/츄/g, "초")
      .replace(/우$/g, "오")
      .replace(/이$/g, "리");
    if (mistrans !== nameKo) tries.push(mistrans);

    const close = others.filter((o) => o.nameKo && o.nameKo !== nameKo && o.nameKo.length > 1);
    if (close.length) tries.push(rng.pick(close).nameKo);

    const hit = tries.find((t) => t && t !== original);
    return hit || `${original}?`;
  }

  function twistFlavor(flavor, otherFlavor, rng) {
    let next = flavor;
    const pairs = rng.shuffle(TYPE_FLIP);
    for (const [from, to] of pairs) {
      if (next.includes(from)) {
        next = next.replace(new RegExp(from, "g"), to);
        break;
      }
    }
    if (next === flavor && otherFlavor && otherFlavor !== flavor) next = otherFlavor;
    if (next === flavor) next = flavor + " 사실은 정반대의 장소에서 산다.";
    return cleanText(next);
  }

  function planCorrupts(count, rng) {
    const axes = ["image", "name", "flavor"];
    const rest = [];
    for (let i = 0; i < count - 3; i++) rest.push(rng.pick(axes));
    return rng.shuffle(axes.concat(rest));
  }

  function pickDecoy(primary, species, rng) {
    const others = species.filter((s) => s.id !== primary.id);
    const typed = others.filter((s) => shareType(primary, s) && !tooEasyNameSwap(primary.id, s.id));
    const pool = typed.length ? typed : others;
    return rng.pick(pool);
  }

  /**
   * Pure question builder. Exactly one of image / nameKo / flavor is fake.
   */
  function buildQuestion(primary, decoy, corrupt, rng) {
    const shown = {
      imageId: primary.id,
      imageUrl: primary.artUrl,
      fallbackUrl: primary.fallbackUrl,
      nameKo: primary.nameKo,
      nameEn: primary.nameEn,
      flavor: primary.flavor,
    };
    if (corrupt === "image") {
      shown.imageId = decoy.id;
      shown.imageUrl = decoy.artUrl;
      shown.fallbackUrl = decoy.fallbackUrl;
    } else if (corrupt === "name") {
      shown.nameKo = corruptNameKo(primary.nameKo, [decoy], rng);
    } else if (corrupt === "flavor") {
      shown.flavor = twistFlavor(primary.flavor, decoy.flavor, rng);
    }
    return {
      corrupt,
      primaryId: primary.id,
      shown,
      truth: {
        imageId: primary.id,
        imageUrl: primary.artUrl,
        fallbackUrl: primary.fallbackUrl,
        nameKo: primary.nameKo,
        nameEn: primary.nameEn,
        flavor: primary.flavor,
      },
    };
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function selfTest() {
    const rng = rngFrom(mulberry32(42));
    const fixtures = [
      { id: 1, nameKo: "이상해씨", nameEn: "bulbasaur", flavor: "등에 씨앗이 있으며 초원에서 산다.", types: ["grass", "poison"], artUrl: artUrl(1), fallbackUrl: fallbackUrl(1) },
      { id: 4, nameKo: "파이리", nameEn: "charmander", flavor: "꼬리의 불꽃이 타오르며 산에서 산다.", types: ["fire"], artUrl: artUrl(4), fallbackUrl: fallbackUrl(4) },
      { id: 7, nameKo: "꼬부기", nameEn: "squirtle", flavor: "등껍질로 몸을 지키며 바다에서 산다.", types: ["water"], artUrl: artUrl(7), fallbackUrl: fallbackUrl(7) },
      { id: 25, nameKo: "피카츄", nameEn: "pikachu", flavor: "볼에 전기가 모여 있다.", types: ["electric"], artUrl: artUrl(25), fallbackUrl: fallbackUrl(25) },
      { id: 26, nameKo: "라이츄", nameEn: "raichu", flavor: "긴 꼬리로 전기를 땅에 흘린다.", types: ["electric"], artUrl: artUrl(26), fallbackUrl: fallbackUrl(26) },
      { id: 39, nameKo: "푸린", nameEn: "jigglypuff", flavor: "자장가를 불러 상대를 잠들게 한다.", types: ["normal", "fairy"], artUrl: artUrl(39), fallbackUrl: fallbackUrl(39) },
    ];

    const results = [];
    const axes = ["image", "name", "flavor"];
    for (const corrupt of axes) {
      const q = buildQuestion(fixtures[0], fixtures[1], corrupt, rng);
      const diffs = [
        q.shown.imageId !== q.truth.imageId,
        q.shown.nameKo !== q.truth.nameKo,
        q.shown.flavor !== q.truth.flavor,
      ].filter(Boolean).length;
      assert(diffs === 1, `corrupt=${corrupt} must change exactly one axis, got ${diffs}`);
      if (corrupt === "image") {
        assert(q.shown.imageId !== q.truth.imageId, "image corrupt must change image id");
        assert(q.shown.imageId !== q.primaryId, "image id must differ from name species when corrupt=image");
        assert(q.shown.nameKo === q.truth.nameKo, "image corrupt keeps name");
        assert(q.shown.flavor === q.truth.flavor, "image corrupt keeps flavor");
      }
      if (corrupt === "name") {
        assert(q.shown.nameKo !== q.truth.nameKo, "name corrupt must change korean name");
        assert(q.shown.imageId === q.primaryId, "name corrupt keeps image");
      }
      if (corrupt === "flavor") {
        assert(q.shown.flavor !== q.truth.flavor, "flavor corrupt must change flavor");
        assert(q.shown.imageId === q.primaryId, "flavor corrupt keeps image");
      }
      results.push(corrupt);
    }

    const messy = pickFlavor([{ language: { name: "ko" }, flavor_text: "첫줄\n둘째줄\f페이지" }]);
    assert(!/[\n\f]/.test(messy), "flavor newlines must be stripped");
    assert(messy === "첫줄 둘째줄 페이지", "flavor whitespace collapse");

    const planned = planCorrupts(10, rng);
    assert(planned.length === 10, "set size 10");
    assert(axes.every((a) => planned.includes(a)), "all three corrupt types appear in a set");
    assert(speciesPool().length >= 40, "pool must have at least 40 species");

    const decoy = pickDecoy(fixtures[3], fixtures, rng);
    assert(decoy.id !== 25, "decoy is another species");

    return { ok: true, checked: results.concat(["cleanText", "planCorrupts", "pool"]) };
  }

  const api = {
    speciesPool,
    cleanText,
    planCorrupts,
    buildQuestion,
    pickDecoy,
    rngFrom,
    mulberry32,
    selfTest,
  };

  const root = typeof window !== "undefined" ? window : globalThis;
  root.__quiz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__q", "1");
      localStorage.removeItem("__q");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const comboEl = document.getElementById("combo");
  const qIndexEl = document.getElementById("q-index");
  const timerBar = document.getElementById("timer-bar");
  const timerNum = document.getElementById("timer-num");
  const sprite = document.getElementById("sprite");
  const spriteWrap = document.querySelector(".sprite-wrap");
  const spriteSpin = document.getElementById("sprite-spin");
  const nameKoEl = document.getElementById("name-ko");
  const nameEnEl = document.getElementById("name-en");
  const flavorEl = document.getElementById("flavor");
  const dex = document.getElementById("dex");
  const stampEl = document.getElementById("stamp");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const btnSound = document.getElementById("btn-sound");
  const choiceBtns = [...document.querySelectorAll(".choice")];

  let best = +(storage.getItem(LS_BEST) || 0);
  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let score = 0;
  let combo = 0;
  let round = [];
  let qIndex = 0;
  let locked = true;
  let timerId = 0;
  let startedAt = 0;
  let cache = new Map();

  const SFX = (() => {
    const clips = {};
    const bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.28;
    bgm.preload = "auto";
    ["ok", "bad", "tick", "click"].forEach((name) => {
      const a = new Audio(`assets/audio/${name}.mp3`);
      a.preload = "auto";
      clips[name] = a;
    });
    let actx;
    const init = () => {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
    };
    const playClip = (name) => {
      const src = clips[name];
      if (!src) return false;
      try {
        const node = src.cloneNode();
        node.volume = 0.7;
        const p = node.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    };
    const tone = (freq, dur, type, vol) => {
      if (!soundOn) return;
      try {
        const a = init();
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
        o.connect(g);
        g.connect(a.destination);
        o.start();
        o.stop(a.currentTime + dur);
      } catch (_) {}
    };
    const syncBgm = () => {
      if (soundOn) {
        const p = bgm.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        bgm.pause();
      }
    };
    window.addEventListener("pointerdown", () => {
      try { init(); } catch (_) {}
      syncBgm();
    }, { once: true });
    return {
      ok() { if (!soundOn) return; if (!playClip("ok")) { tone(523, 0.09, "triangle", 0.08); setTimeout(() => tone(784, 0.12, "triangle", 0.07), 80); } },
      bad() { if (!soundOn) return; if (!playClip("bad")) tone(180, 0.18, "sawtooth", 0.06); },
      tick() { if (!soundOn) return; if (!playClip("tick")) tone(880, 0.04, "square", 0.03); },
      click() { if (!soundOn) return; if (!playClip("click")) tone(420, 0.05, "square", 0.04); },
      syncBgm,
    };
  })();

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
    SFX.syncBgm();
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (soundOn) SFX.ok();
  });

  bestEl.textContent = best;
  syncSoundBtn();

  async function fetchSpecies(id) {
    if (cache.has(id)) return cache.get(id);
    const [poke, species] = await Promise.all([
      fetch(`${POKE_API}/pokemon/${id}`).then((r) => {
        if (!r.ok) throw new Error("poke");
        return r.json();
      }),
      fetch(`${POKE_API}/pokemon-species/${id}`).then((r) => {
        if (!r.ok) throw new Error("species");
        return r.json();
      }),
    ]);
    const rec = {
      id,
      nameKo: pickKoName(species.names) || poke.name,
      nameEn: poke.name,
      flavor: pickFlavor(species.flavor_text_entries),
      types: (poke.types || []).map((t) => t.type.name),
      artUrl: (poke.sprites && poke.sprites.other && poke.sprites.other["official-artwork"] && poke.sprites.other["official-artwork"].front_default) || artUrl(id),
      fallbackUrl: (poke.sprites && poke.sprites.front_default) || fallbackUrl(id),
    };
    cache.set(id, rec);
    return rec;
  }

  async function prefetchIds(ids) {
    await Promise.all(ids.map((id) => fetchSpecies(id)));
  }

  function showOverlay(html) {
    overlayCard.innerHTML = `<img class="mascot" src="assets/mascot.png" alt="">${html}`;
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showError(msg) {
    showOverlay(`
      <h2>도감을 열 수 없어요</h2>
      <p>${msg}</p>
      <button type="button" class="retry" id="btn-retry">다시 시도</button>
    `);
    document.getElementById("btn-retry").onclick = () => startRound();
  }

  function setSprite(url, fallback) {
    spriteSpin.hidden = false;
    sprite.style.opacity = "0.25";
    const onOk = () => {
      spriteSpin.hidden = true;
      sprite.style.opacity = "1";
    };
    sprite.onload = onOk;
    sprite.onerror = () => {
      if (fallback && sprite.src !== fallback) {
        sprite.src = fallback;
        return;
      }
      onOk();
    };
    sprite.src = url;
  }

  function hideStamp() {
    stampEl.hidden = true;
    stampEl.classList.remove("show");
  }

  function showStamp(ok) {
    stampEl.src = ok ? "assets/stamp-ok.png" : "assets/stamp-bad.png";
    stampEl.hidden = false;
    requestAnimationFrame(() => stampEl.classList.add("show"));
  }

  function paintQuestion(q) {
    hideStamp();
    dex.classList.remove("reveal-ok", "reveal-bad");
    nameKoEl.classList.remove("field-fix");
    flavorEl.classList.remove("field-fix");
    spriteWrap.classList.remove("field-fix");
    sprite.classList.toggle("lie", q.corrupt === "image");
    setSprite(q.shown.imageUrl, q.shown.fallbackUrl);
    nameKoEl.textContent = q.shown.nameKo;
    nameEnEl.textContent = q.shown.nameEn;
    flavorEl.textContent = q.shown.flavor;
    choiceBtns.forEach((b) => {
      b.disabled = false;
      b.classList.remove("correct", "wrong");
    });
  }

  function applyTruth(q) {
    setSprite(q.truth.imageUrl, q.truth.fallbackUrl);
    sprite.classList.remove("lie");
    nameKoEl.textContent = q.truth.nameKo;
    nameEnEl.textContent = q.truth.nameEn;
    flavorEl.textContent = q.truth.flavor;
    if (q.corrupt === "name") nameKoEl.classList.add("field-fix");
    if (q.corrupt === "flavor") flavorEl.classList.add("field-fix");
    if (q.corrupt === "image") spriteWrap.classList.add("field-fix");
  }

  function stopTimer() {
    if (timerId) cancelAnimationFrame(timerId);
    timerId = 0;
  }

  function startTimer(onTimeout) {
    stopTimer();
    startedAt = performance.now();
    const tick = (now) => {
      const left = Math.max(0, TIME_LIMIT_MS - (now - startedAt));
      const p = left / TIME_LIMIT_MS;
      timerBar.style.transform = `scaleX(${p})`;
      const sec = Math.ceil(left / 1000);
      if (timerNum.textContent !== String(sec)) {
        timerNum.textContent = String(sec);
        if (sec <= 3 && sec > 0) SFX.tick();
      }
      if (left <= 0) {
        onTimeout();
        return;
      }
      timerId = requestAnimationFrame(tick);
    };
    timerId = requestAnimationFrame(tick);
  }

  function remainingBonus() {
    const left = Math.max(0, TIME_LIMIT_MS - (performance.now() - startedAt));
    return Math.ceil(left / 1000) * 8;
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
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
      <p>최고 ${best} · 콤보는 연속 정답에서 쌓입니다.</p>
      <button type="button" class="retry" id="btn-again">다시 하기</button>
    `);
    document.getElementById("btn-again").onclick = () => startRound();
  }

  function reveal(q, picked, timedOut) {
    locked = true;
    stopTimer();
    const ok = !timedOut && picked === q.corrupt;
    dex.classList.add(ok ? "reveal-ok" : "reveal-bad");
    choiceBtns.forEach((b) => {
      b.disabled = true;
      if (b.dataset.axis === q.corrupt) b.classList.add("correct");
      if (!ok && b.dataset.axis === picked) b.classList.add("wrong");
    });
    applyTruth(q);
    showStamp(ok);
    if (ok) {
      combo += 1;
      const gained = 100 + (combo - 1) * 20 + remainingBonus();
      score += gained;
      SFX.ok();
    } else {
      combo = 0;
      SFX.bad();
    }
    updateHud();
    setTimeout(() => {
      qIndex += 1;
      if (qIndex >= round.length) finishRound();
      else showCurrent();
    }, 1400);
  }

  function showCurrent() {
    const q = round[qIndex];
    locked = false;
    updateHud();
    paintQuestion(q);
    startTimer(() => {
      if (!locked) reveal(q, null, true);
    });
  }

  choiceBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (locked) return;
      SFX.click();
      reveal(round[qIndex], btn.dataset.axis, false);
    });
  });

  async function startRound() {
    hideOverlay();
    locked = true;
    score = 0;
    combo = 0;
    qIndex = 0;
    round = [];
    updateHud();
    showOverlay(`<h2>도감을 펼치는 중</h2><p>알려진 종 기록을 불러옵니다.</p>`);

    const rng = rngFrom();
    const pool = rng.shuffle(speciesPool());
    const primaryIds = pool.slice(0, SET_SIZE);
    const extraIds = pool.slice(SET_SIZE, SET_SIZE + 12);
    try {
      await prefetchIds(primaryIds);
      const missing = extraIds.filter((id) => !cache.has(id));
      if (missing.length) await prefetchIds(missing.slice(0, 8));
      const species = [...cache.values()];
      if (species.length < 8) throw new Error("too few");
      const corrupts = planCorrupts(SET_SIZE, rng);
      round = primaryIds.map((id, i) => {
        const primary = cache.get(id);
        const decoy = pickDecoy(primary, species, rng);
        return buildQuestion(primary, decoy, corrupts[i], rng);
      });
      hideOverlay();
      showCurrent();
    } catch (err) {
      showError("네트워크를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  startRound();
})();
