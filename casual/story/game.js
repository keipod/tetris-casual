/*! 공주 이야기 — 멀티 스토리 비주얼 노벨 엔진 */
(function () {
  "use strict";

  var DATA = window.PrincessStories;
  if (!DATA) {
    console.error("stories.js missing");
    return;
  }

  var ENDINGS_KEY = "story_endings_v2";
  var SOUND_KEY = "story_sound_v1";

  var activeStory = null;
  var flags = {};
  var currentId = null;
  var typing = null;

  var $ = function (id) { return document.getElementById(id); };
  var screenTitle = $("screen-title");
  var screenPick = $("screen-pick");
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
  var endingStoryLabel = $("ending-story-label");

  var btnStart = $("btn-start");
  var btnReplay = $("btn-replay");
  var btnTitle = $("btn-title");
  var btnPickBack = $("btn-pick-back");
  var btnSound = $("btn-sound");
  var storyListEl = $("story-list");
  var endingsCountEl = $("endings-count");
  var endingsTotalEl = $("endings-total");
  var toastEl = $("toast");
  var titleCoverImg = $("title-cover-img");

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

  /* ---------- Endings persistence (per story) ---------- */
  function loadSeenMap() {
    try {
      var raw = localStorage.getItem(ENDINGS_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch (_) { return {}; }
  }
  function saveSeenEnding(storyId, endingId) {
    var map = loadSeenMap();
    if (!map[storyId]) map[storyId] = [];
    if (map[storyId].indexOf(endingId) === -1) {
      map[storyId].push(endingId);
      try { localStorage.setItem(ENDINGS_KEY, JSON.stringify(map)); } catch (_) {}
    }
    return map;
  }
  function totalSeenCount() {
    var map = loadSeenMap();
    var n = 0;
    Object.keys(map).forEach(function (k) {
      n += Array.isArray(map[k]) ? map[k].length : 0;
    });
    return n;
  }
  function totalEndingSlots() {
    return DATA.list.reduce(function (sum, s) { return sum + s.endingTotal; }, 0);
  }
  function renderHubProgress() {
    endingsCountEl.textContent = String(totalSeenCount());
    if (endingsTotalEl) endingsTotalEl.textContent = String(totalEndingSlots());
  }

  function seenFor(storyId) {
    var map = loadSeenMap();
    return Array.isArray(map[storyId]) ? map[storyId] : [];
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
    var speed = 18;
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

  /* ---------- Background ---------- */
  function setScene(target, targetImg, bgName, bgImgSrc) {
    target.className = "scene-bg";
    if (bgName) target.classList.add("bg-" + bgName);
    target.classList.remove("scene-fade");
    void target.offsetWidth;
    target.classList.add("scene-fade");
    if (bgImgSrc) {
      targetImg.src = bgImgSrc;
      targetImg.hidden = false;
    } else {
      targetImg.hidden = true;
      targetImg.removeAttribute("src");
    }
  }

  function resolveField(field, fallback) {
    return typeof field === "function" ? field(flags) : (field != null ? field : fallback);
  }

  function applyEffect(effect) {
    if (!effect) return;
    Object.keys(effect).forEach(function (k) { flags[k] = effect[k]; });
  }

  function renderNode(id) {
    currentId = id;
    var node = activeStory.nodes[id];
    if (!node) {
      console.error("missing node", id);
      return;
    }
    setScene(sceneBg, sceneBgImg, node.bg, node.bgImg);

    var portraitSrc = resolveField(node.portrait, null);
    var name = resolveField(node.name, "아라 공주");
    var text = resolveField(node.text, "");

    if (portraitSrc) {
      portraitImg.src = portraitSrc;
      portraitImg.hidden = false;
    } else {
      portraitImg.hidden = true;
    }
    portraitImg.alt = name;
    speakerName.textContent = name;
    choicesEl.innerHTML = "";
    tapHint.classList.add("show");

    var frame = document.querySelector(".portrait-frame");
    if (frame) {
      frame.style.animation = "none";
      void frame.offsetWidth;
      frame.style.animation = "";
    }

    typeText(dialogText, text, function () {
      renderChoices(node.choices);
    });
  }

  function renderChoices(choices) {
    choicesEl.innerHTML = "";
    (choices || []).forEach(function (choice) {
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
    var endingId = activeStory.resolveEnding(flags);
    var ending = activeStory.endings[endingId];
    if (!ending) {
      endingId = Object.keys(activeStory.endings)[0];
      ending = activeStory.endings[endingId];
    }
    saveSeenEnding(activeStory.id, endingId);
    renderHubProgress();

    screenGame.classList.add("hidden");
    screenEnding.classList.remove("hidden");

    setScene(endingBg, endingBgImg, ending.bg, ending.bgImg);
    if (endingStoryLabel) endingStoryLabel.textContent = activeStory.title;
    endingTitle.textContent = ending.title;
    endingText.textContent = resolveField(ending.text, "");

    endingFlags.innerHTML = "";
    (activeStory.flagLabels(flags) || []).forEach(function (label) {
      var chip = document.createElement("span");
      chip.className = "flag-chip";
      chip.textContent = label;
      endingFlags.appendChild(chip);
    });

    sfx("fanfare");
    showToast(ending.toast || "엔딩에 도달했어요!");
  }

  function resetStory() {
    flags = Object.assign({}, activeStory.defaultFlags);
    currentId = activeStory.start;
  }

  /* ---------- Screens ---------- */
  function goTitle() {
    screenEnding.classList.add("hidden");
    screenGame.classList.add("hidden");
    screenPick.classList.add("hidden");
    screenTitle.classList.remove("hidden");
    renderHubProgress();
  }

  function goPick() {
    screenTitle.classList.add("hidden");
    screenEnding.classList.add("hidden");
    screenGame.classList.add("hidden");
    screenPick.classList.remove("hidden");
    renderStoryCards();
  }

  function goGame() {
    screenTitle.classList.add("hidden");
    screenPick.classList.add("hidden");
    screenEnding.classList.add("hidden");
    screenGame.classList.remove("hidden");
    renderNode(currentId);
  }

  function renderStoryCards() {
    storyListEl.innerHTML = "";
    DATA.list.forEach(function (story) {
      var seen = seenFor(story.id);
      var card = document.createElement("button");
      card.type = "button";
      card.className = "story-card";
      card.innerHTML =
        '<span class="story-card-cover" style="background-image:url(\'' + story.cover + '\')"></span>' +
        '<span class="story-card-body">' +
          '<span class="story-card-title">' + story.title + "</span>" +
          '<span class="story-card-sub">' + story.subtitle + "</span>" +
          '<span class="story-card-desc">' + story.desc + "</span>" +
          '<span class="story-card-progress">결말 ' + seen.length + " / " + story.endingTotal + "</span>" +
        "</span>";
      card.addEventListener("click", function () {
        sfx("click");
        activeStory = story;
        resetStory();
        goGame();
      });
      storyListEl.appendChild(card);
    });
  }

  btnStart.addEventListener("click", function () {
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.unlock) {
      try { CasualSfx.unlock(); } catch (_) {}
    }
    sfx("click");
    goPick();
  });

  btnPickBack.addEventListener("click", function () {
    sfx("click");
    goTitle();
  });

  btnReplay.addEventListener("click", function () {
    sfx("click");
    resetStory();
    goGame();
  });

  btnTitle.addEventListener("click", function () {
    sfx("click");
    goPick();
  });

  if (titleCoverImg && DATA.list[0]) {
    titleCoverImg.src = DATA.list[0].cover;
  }

  renderHubProgress();
})();
