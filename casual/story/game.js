/*! 공주 이야기: 별빛 정원의 하루 — 짧은 분기형 비주얼 노벨 */
(function () {
  "use strict";

  /* ---------- Assets (only reading from allowed external folders) ---------- */
  var P_ARA = "../dressup/assets/portraits/princess1.jpg";
  var P_RIA = "../dressup/assets/portraits/princess2.jpg";
  var IMG_PUPPY = "../../assets/characters/puppy.png";
  var IMG_BEAR = "../../assets/characters/bear.png";
  var BG_CASTLE = "../dressup/assets/bg/castle_purple.png";
  var BG_BALLROOM = "../dressup/assets/bg/ballroom.png";

  var ENDINGS_KEY = "story_endings_v1";
  var SOUND_KEY = "story_sound_v1";

  /* ---------- Story graph ---------- */
  var NODES = {
    n1: {
      bg: "castle", bgImg: BG_CASTLE,
      portrait: P_ARA, name: "아라 공주",
      text: "포근한 아침 햇살이 커튼 사이로 스며들어요. 오늘 저녁엔 정원에서 작은 별빛 파티가 열리는 특별한 날이에요. 아침 시간, 무엇부터 해볼까요?",
      choices: [
        { label: "이슬 맺힌 정원을 산책해요", next: "n2_garden", effect: { outfit: "adventure" } },
        { label: "옷장에서 드레스를 골라봐요", next: "n2_dress", effect: { outfit: "elegant" } },
        { label: "달콤한 간식을 만들어요", next: "n2_kitchen", effect: { outfit: "cozy" } }
      ]
    },
    n2_garden: {
      bg: "garden",
      portrait: P_ARA, name: "아라 공주",
      text: "이슬이 맺힌 꽃길을 따라 걷다 보니, 산울타리 틈에 낀 작은 강아지가 낑낑거리고 있어요.",
      choices: [
        { label: "얼른 다가가 강아지를 꺼내주고 함께 놀아요", next: "n3_meadow", effect: { animal: "puppy", mood: "warm" } },
        { label: "울타리 너머 이어진 신비한 발자국을 따라가요", next: "n3_forest", effect: { mood: "brave" } }
      ]
    },
    n3_meadow: {
      bg: "garden",
      portrait: IMG_PUPPY, name: "몽실이 (강아지)",
      text: "몽실이가 꼬리를 흔들며 아라 공주의 손등을 폴짝폴짝 핥아요. 오늘 하루 종일 곁을 졸졸 따라다니고 싶은 눈치예요!",
      choices: [
        { label: "좋아, 오늘은 몽실이와 함께 다닐래", next: "n4_party", effect: { mood: "cheerful" } },
        { label: "저녁 준비를 위해 몽실이를 다독이고 성으로 돌아가요", next: "n4_party", effect: { mood: "dreamy" } }
      ]
    },
    n3_forest: {
      bg: "forest",
      portrait: P_ARA, name: "아라 공주",
      text: "발자국을 따라가니 오래된 나무 아래에서, 작은 곰돌이가 꿀단지를 놓치고 울상을 짓고 있어요.",
      choices: [
        { label: "곰돌이를 도와 함께 꿀단지를 찾아줘요", next: "n4_party", effect: { animal: "bear", mood: "warm" } },
        { label: "곰돌이에게 인사만 하고 숲 안쪽을 더 탐험해요", next: "n4_party", effect: { mood: "brave" } }
      ]
    },
    n2_dress: {
      bg: "dressroom",
      portrait: P_ARA, name: "아라 공주",
      text: "옷장 문을 여니 별빛처럼 반짝이는 드레스들이 가득해요. 마침 놀러 온 리아 공주가 옷장을 함께 구경해요.",
      choices: [
        { label: "화려한 별빛 드레스를 입어봐요", next: "n3_dress2", effect: { mood: "dreamy" } },
        { label: "가볍고 편안한 산책용 원피스를 입어봐요", next: "n3_dress2", effect: { mood: "cheerful" } }
      ]
    },
    n3_dress2: {
      bg: "dressroom",
      portrait: P_RIA, name: "리아 공주",
      text: "\"우와, 오늘 정말 잘 어울려! 저녁 파티에서 제일 반짝일 것 같아.\" 리아가 눈을 반짝이며 웃어요.",
      choices: [
        { label: "고마워! 오늘 저녁이 정말 기대돼", next: "n4_party", effect: { mood: "cheerful" } },
        { label: "리아와 함께 준비하며 도란도란 수다를 떨어요", next: "n4_party", effect: { mood: "warm" } }
      ]
    },
    n2_kitchen: {
      bg: "kitchen",
      portrait: P_ARA, name: "아라 공주",
      text: "달콤한 냄새를 맡았는지, 작은 곰돌이 한 마리가 부엌 창문으로 코를 빼꼼 내밀어요.",
      choices: [
        { label: "곰돌이에게 갓 구운 쿠키를 나눠줘요", next: "n3_kitchen2", effect: { animal: "bear", mood: "warm" } },
        { label: "혼자 조용히 티타임을 준비해요", next: "n3_kitchen2", effect: { mood: "dreamy" } }
      ]
    },
    n3_kitchen2: {
      bg: "kitchen",
      portrait: function (f) { return f.animal === "bear" ? IMG_BEAR : P_ARA; },
      name: function (f) { return f.animal === "bear" ? "곰돌이" : "아라 공주"; },
      text: function (f) {
        return f.animal === "bear"
          ? "곰돌이가 쿠키 부스러기를 얼굴 가득 묻힌 채 활짝 웃어요. 오늘 하루 종일 곁에 있고 싶어 하는 눈치예요."
          : "따뜻한 차 한 잔의 향기가 부엌 가득 퍼져요. 창밖으로 노을이 예쁘게 물들기 시작해요.";
      },
      choices: [
        { label: "좋아, 오늘을 특별한 하루로 만들어볼까", next: "n4_party", effect: {} },
        { label: "이제 저녁 파티 준비를 하러 가요", next: "n4_party", effect: {} }
      ]
    },
    n4_party: {
      bg: "dusk",
      portrait: P_ARA, name: "아라 공주",
      text: "은은한 종소리가 정원 가득 울려 퍼져요. 드디어 별빛 정원 파티가 시작될 시간, 아라 공주는 오늘 하루를 떠올리며 미소 지어요.",
      choices: [
        { label: "가장 좋아하는 모습 그대로, 자신 있게 걸어가요", next: "ENDING", effect: {} },
        { label: "한 번 더 매무새를 가다듬고 조심스레 들어가요", next: "ENDING", effect: { mood: "dreamy" } }
      ]
    }
  };

  var ENDINGS = {
    ball: {
      title: "반짝이는 별빛 무도회",
      bg: "ballroom", bgImg: BG_BALLROOM,
      text: "샹들리에 불빛 아래, 아라 공주는 별빛 드레스 자락을 살랑이며 무도회장 한가운데로 걸어 들어가요. 오늘 밤엔 성 전체가 그녀를 위해 반짝이는 것 같아요.",
      toast: "✨ 별빛 무도회의 주인공이 되었어요!"
    },
    heart: {
      title: "다정한 마음의 정원",
      bg: "heart",
      text: function (f) {
        return f.animal === "puppy"
          ? "몽실이가 신나게 앞장서며 파티장까지 함께 걸어요. 사람들보다 몽실이의 재롱이 오늘 파티의 주인공이 된 것 같아요."
          : "작은 곰돌이가 아라 공주의 손을 꼭 잡고 파티장에 들어서요. 함께 나눠 먹은 쿠키 냄새가 아직도 달콤하게 남아 있어요.";
      },
      toast: "💕 다정한 친구와 함께하는 밤이 되었어요!"
    },
    wander: {
      title: "노을 정원의 산책자",
      bg: "wander",
      text: "아라 공주는 화려한 파티장 대신, 노을이 물든 정원을 천천히 한 바퀴 걸어요. 저 멀리 들려오는 파티 소리를 배경음악 삼아, 오늘 하루의 자유로움을 마음껏 만끽해요.",
      toast: "🌿 나만의 자유로운 하루를 만끽했어요!"
    }
  };

  var OUTFIT_LABEL = { elegant: "우아한 드레스", adventure: "활동적인 차림", cozy: "포근한 차림" };
  var MOOD_LABEL = { cheerful: "발랄한 마음", dreamy: "몽환적인 마음", warm: "다정한 마음", brave: "용감한 마음" };
  var ANIMAL_LABEL = { puppy: "몽실이(강아지)", bear: "곰돌이", none: "혼자" };

  function resolveEnding(flags) {
    if (flags.animal !== "none") return "heart";
    if (flags.outfit === "elegant") return "ball";
    return "wander";
  }

  /* ---------- State ---------- */
  var flags = { outfit: "cozy", mood: "cheerful", animal: "none" };
  var currentId = "n1";
  var typing = null; // active typewriter handle

  /* ---------- DOM refs ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var screenTitle = $("screen-title");
  var screenGame = $("screen-game");
  var screenEnding = $("screen-ending");

  var sceneBg = $("scene-bg");
  var sceneBgImg = $("scene-bg-img");
  var portraitImg = $("portrait-img");
  var speakerName = $("speaker-name");
  var dialogText = $("dialog-text");
  var dialogBox = $("dialog-box");
  var tapHint = $("tap-hint");
  var choicesEl = $("choices");

  var endingBg = $("ending-bg");
  var endingBgImg = $("ending-bg-img");
  var endingTitle = $("ending-title");
  var endingText = $("ending-text");
  var endingFlags = $("ending-flags");

  var btnStart = $("btn-start");
  var btnReplay = $("btn-replay");
  var btnTitle = $("btn-title");
  var btnSound = $("btn-sound");
  var endingsCountEl = $("endings-count");
  var endingsDots = $("endings-dots");
  var toastEl = $("toast");

  /* ---------- SFX helpers (optional) ---------- */
  function sfx(role) {
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.play) {
      try { CasualSfx.play(role); } catch (_) {}
    }
  }

  function loadSoundPref() {
    try {
      var v = localStorage.getItem(SOUND_KEY);
      return v === null ? true : v === "1";
    } catch (_) { return true; }
  }
  function saveSoundPref(on) {
    try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch (_) {}
  }

  var soundOn = loadSoundPref();
  if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.setEnabled) {
    CasualSfx.setEnabled(soundOn);
  }
  btnSound.setAttribute("aria-pressed", soundOn ? "true" : "false");

  btnSound.addEventListener("click", function () {
    soundOn = !soundOn;
    btnSound.setAttribute("aria-pressed", soundOn ? "true" : "false");
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.setEnabled) {
      CasualSfx.setEnabled(soundOn);
    }
    saveSoundPref(soundOn);
    if (soundOn) sfx("toggle");
  });

  /* ---------- Endings persistence ---------- */
  function loadSeenEndings() {
    try {
      var raw = localStorage.getItem(ENDINGS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function saveSeenEnding(id) {
    var seen = loadSeenEndings();
    if (seen.indexOf(id) === -1) {
      seen.push(id);
      try { localStorage.setItem(ENDINGS_KEY, JSON.stringify(seen)); } catch (_) {}
    }
    return seen;
  }
  function renderEndingsProgress() {
    var seen = loadSeenEndings();
    endingsCountEl.textContent = String(seen.length);
    var dots = endingsDots.querySelectorAll(".ending-dot");
    dots.forEach(function (dot) {
      var id = dot.getAttribute("data-ending");
      dot.classList.toggle("seen", seen.indexOf(id) !== -1);
    });
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2600);
  }

  /* ---------- Typewriter ---------- */
  function typeText(el, str, onDone) {
    if (typing) { clearInterval(typing.timer); typing = null; }
    el.textContent = "";
    tapHint.classList.remove("show");
    var i = 0;
    var speed = 20;
    var handle = { done: false };
    handle.timer = setInterval(function () {
      i += 1;
      el.textContent = str.slice(0, i);
      if (i >= str.length) {
        clearInterval(handle.timer);
        handle.done = true;
        tapHint.classList.remove("show");
        if (onDone) onDone();
      }
    }, speed);
    typing = handle;

    function skip() {
      if (typing && !typing.done) {
        clearInterval(typing.timer);
        el.textContent = str;
        typing.done = true;
        tapHint.classList.remove("show");
        if (onDone) onDone();
      }
    }
    dialogBox.onclick = skip;
  }

  /* ---------- Background rendering ---------- */
  var BG_CLASSES = ["bg-castle", "bg-garden", "bg-forest", "bg-dressroom", "bg-kitchen", "bg-dusk", "bg-heart", "bg-wander", "bg-ballroom"];

  function setScene(target, targetImg, bgName, bgImgSrc) {
    BG_CLASSES.forEach(function (c) { target.classList.remove(c); });
    target.classList.add("bg-" + bgName);
    if (bgImgSrc) {
      targetImg.src = bgImgSrc;
      targetImg.hidden = false;
    } else {
      targetImg.hidden = true;
      targetImg.removeAttribute("src");
    }
  }

  /* ---------- Story rendering ---------- */
  function resolveField(field, fallback) {
    return typeof field === "function" ? field(flags) : (field || fallback);
  }

  function applyEffect(effect) {
    if (!effect) return;
    Object.keys(effect).forEach(function (k) { flags[k] = effect[k]; });
  }

  function renderNode(id) {
    currentId = id;
    var node = NODES[id];
    setScene(sceneBg, sceneBgImg, node.bg, node.bgImg);

    var portraitSrc = resolveField(node.portrait, P_ARA);
    var name = resolveField(node.name, "아라 공주");
    var text = resolveField(node.text, "");

    portraitImg.src = portraitSrc;
    portraitImg.alt = name;
    speakerName.textContent = name;
    choicesEl.innerHTML = "";
    tapHint.classList.add("show");

    // restart portrait pop animation
    var frame = document.querySelector(".portrait-frame");
    frame.style.animation = "none";
    void frame.offsetWidth;
    frame.style.animation = "";

    typeText(dialogText, text, function () {
      renderChoices(node.choices);
    });
  }

  function renderChoices(choices) {
    choicesEl.innerHTML = "";
    choices.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = choice.label;
      btn.addEventListener("click", function () {
        sfx("click");
        applyEffect(choice.effect);
        if (choice.next === "ENDING") {
          finishStory();
        } else {
          renderNode(choice.next);
        }
      });
      choicesEl.appendChild(btn);
    });
  }

  function finishStory() {
    var endingId = resolveEnding(flags);
    var ending = ENDINGS[endingId];
    saveSeenEnding(endingId);

    screenGame.classList.add("hidden");
    screenEnding.classList.remove("hidden");

    setScene(endingBg, endingBgImg, ending.bg, ending.bgImg);
    endingTitle.textContent = ending.title;
    endingText.textContent = resolveField(ending.text, "");

    endingFlags.innerHTML = "";
    [OUTFIT_LABEL[flags.outfit], MOOD_LABEL[flags.mood], ANIMAL_LABEL[flags.animal]].forEach(function (label) {
      var chip = document.createElement("span");
      chip.className = "flag-chip";
      chip.textContent = label;
      endingFlags.appendChild(chip);
    });

    sfx("fanfare");
    showToast(ending.toast);
  }

  function resetStory() {
    flags = { outfit: "cozy", mood: "cheerful", animal: "none" };
    currentId = "n1";
  }

  /* ---------- Screen transitions ---------- */
  function goTitle() {
    screenEnding.classList.add("hidden");
    screenGame.classList.add("hidden");
    screenTitle.classList.remove("hidden");
    renderEndingsProgress();
  }

  function goGame() {
    screenTitle.classList.add("hidden");
    screenEnding.classList.add("hidden");
    screenGame.classList.remove("hidden");
    renderNode(currentId);
  }

  btnStart.addEventListener("click", function () {
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.unlock) {
      try { CasualSfx.unlock(); } catch (_) {}
    }
    sfx("click");
    resetStory();
    goGame();
  });

  btnReplay.addEventListener("click", function () {
    sfx("click");
    resetStory();
    goGame();
  });

  btnTitle.addEventListener("click", function () {
    sfx("click");
    goTitle();
  });

  /* ---------- Init ---------- */
  renderEndingsProgress();
})();
