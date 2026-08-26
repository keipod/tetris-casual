/*! 공주 육성 — UI 컨트롤러 (PM2 Phase 1) */
(function () {
  "use strict";

  var Data = window.PMData;
  var Eng = window.PMEngine;
  var Ev = window.PMEvents;
  if (!Data || !Eng || !Ev) {
    console.error("PM modules missing");
    return;
  }

  var state = null;
  var activeCat = "study";
  var selectedSlot = 0;
  var queue = [];
  var typing = null;

  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    title: $("screen-title"),
    hub: $("screen-hub"),
    stats: $("screen-stats"),
    talk: $("screen-talk"),
    schedule: $("screen-schedule"),
    event: $("screen-event"),
    ending: $("screen-ending")
  };

  function sfx(role) {
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.play) {
      try { CasualSfx.play(role); } catch (_) {}
    }
  }

  /* sound */
  var SOUND_KEY = "story_sound_v1";
  var soundOn = (function () {
    try {
      var v = localStorage.getItem(SOUND_KEY);
      return v === null ? true : v === "1";
    } catch (_) { return true; }
  })();
  if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.setEnabled) CasualSfx.setEnabled(soundOn);
  $("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
  $("btn-sound").addEventListener("click", function () {
    soundOn = !soundOn;
    $("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
    if (typeof CasualSfx !== "undefined" && CasualSfx.setEnabled) CasualSfx.setEnabled(soundOn);
    try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (_) {}
    if (soundOn) sfx("toggle");
  });

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("hidden", k !== name);
    });
  }

  function persist() {
    if (state) Eng.save(state);
  }

  function refreshContinue() {
    var saved = Eng.load();
    $("btn-continue").classList.toggle("hidden", !saved);
  }

  function startNew() {
    state = Data.defaultState();
    state.slots = [null, null, null];
    persist();
    show("hub");
    renderHub();
    toast("아라의 육성이 시작됐어요!");
  }

  function continueGame() {
    var saved = Eng.load();
    if (!saved) return;
    state = saved;
    if (!state.slots) state.slots = [null, null, null];
    show("hub");
    renderHub();
  }

  function renderHub() {
    if (!state) return;
    $("hub-name").textContent = state.name;
    $("hub-age").textContent = state.age + "세";
    $("hub-season").textContent = Data.SEASONS[state.season];
    $("hub-gold").textContent = String(state.gold);
    $("meter-stress").style.width = Eng.clamp(state.stress, 0, 100) + "%";
    $("meter-stamina").style.width = Eng.clamp(state.stamina, 0, 100) + "%";
    var st = [];
    if (state.sick) st.push("아픔");
    if (state.delinquent) st.push("장난기");
    if (state.season === 2) st.push("가을 축제 시즌");
    $("hub-status").textContent = st.length ? st.join(" · ") : "컨디션 좋음";
    var seasonBg = ["garden", "meadow", "dusk", "fireplace"][state.season];
    $("hub-bg").src = Data.BG[seasonBg] || Data.BG.castle;
  }

  function renderStats() {
    var keys = [
      "stamina", "strength", "intelligence", "refinement",
      "charisma", "morality", "faith", "sensitivity", "stress",
      "sword", "art", "dance", "cooking", "magic",
      "repFight", "repArt", "repSocial", "repScholar",
      "bond", "puppy", "kitten", "gold"
    ];
    var grid = $("stats-grid");
    grid.innerHTML = "";
    keys.forEach(function (k) {
      var row = document.createElement("div");
      row.className = "stat-row";
      row.innerHTML = "<span>" + (Data.STAT_LABELS[k] || k) + "</span><b>" + state[k] + "</b>";
      grid.appendChild(row);
    });
    var power = document.createElement("div");
    power.className = "stat-row accent";
    power.innerHTML = "<span>전투력</span><b>" + Eng.combatPower(state) + "</b>";
    grid.appendChild(power);
  }

  function renderSchedule() {
    var isFall = state.season === 2;
    $("sched-label").textContent = Data.SEASONS[state.season] + " · " + state.age + "세";
    $("fest-box").classList.toggle("hidden", !isFall);
    $("slot-row").classList.toggle("hidden", isFall);
    $("cat-tabs").classList.toggle("hidden", isFall);
    $("act-list").classList.toggle("hidden", isFall);
    $("sched-hint").textContent = isFall
      ? "가을에는 축제 행사 하나만 고르면 계절이 진행돼요."
      : "이번 계절 활동 3칸을 채워 주세요.";

    if (isFall) {
      renderFestivalChoices();
      $("btn-run-month").disabled = !state.festPick;
      $("btn-run-month").textContent = "축제 참가";
      return;
    }

    $("btn-run-month").textContent = "계절 진행";
    var row = $("slot-row");
    row.innerHTML = "";
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-btn" + (selectedSlot === idx ? " selected" : "");
        var act = state.slots[idx] ? Data.ACTIVITIES[state.slots[idx]] : null;
        btn.innerHTML = "<em>" + (idx + 1) + "</em><span>" + (act ? act.name : "비어 있음") + "</span>";
        btn.addEventListener("click", function () {
          selectedSlot = idx;
          renderSchedule();
        });
        row.appendChild(btn);
      })(i);
    }

    var tabs = $("cat-tabs");
    tabs.innerHTML = "";
    Data.cats.forEach(function (c) {
      var t = document.createElement("button");
      t.type = "button";
      t.className = "cat-tab" + (activeCat === c.id ? " on" : "");
      t.textContent = c.name;
      t.style.setProperty("--cat", c.color);
      t.addEventListener("click", function () {
        activeCat = c.id;
        renderSchedule();
      });
      tabs.appendChild(t);
    });

    var list = $("act-list");
    list.innerHTML = "";
    Eng.availableActivities(state).filter(function (a) { return a.cat === activeCat; }).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn";
      var cost = a.cost ? a.cost + "G" : (a.gold ? "수입" : "무료");
      b.innerHTML = "<strong>" + a.name + "</strong><span>" + a.desc + "</span><em>" + cost + " · 스트레스 " + a.stress + "</em>";
      b.addEventListener("click", function () {
        if (a.cost && state.gold < a.cost) {
          toast("금화가 부족해요");
          return;
        }
        state.slots[selectedSlot] = a.id;
        selectedSlot = Math.min(2, selectedSlot + 1);
        sfx("click");
        renderSchedule();
      });
      list.appendChild(b);
    });

    var filled = state.slots.every(function (x) { return !!x; });
    $("btn-run-month").disabled = !filled;
  }

  function renderFestivalChoices() {
    var box = $("fest-choices");
    box.innerHTML = "";
    Object.keys(Data.FESTIVAL).forEach(function (id) {
      var f = Data.FESTIVAL[id];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn" + (state.festPick === id ? " picked" : "");
      b.innerHTML = "<strong>" + f.name + "</strong><span>" + f.desc + "</span>";
      b.addEventListener("click", function () {
        state.festPick = id;
        sfx("click");
        renderSchedule();
      });
      box.appendChild(b);
    });
  }

  /* ---------- Event queue runner ---------- */
  function enqueueActivityResults() {
    queue = [];
    state.slots.forEach(function (id) {
      if (!id) return;
      var res = Eng.resolveActivity(state, id);
      var act = Data.ACTIVITIES[id];
      queue.push({
        type: "activity",
        bg: act ? act.bg : "castle",
        res: res,
        vig: Ev.vignetteFor(id, state, res)
      });
    });
    var notes = Eng.updateAilments(state);
    notes.forEach(function (n) {
      queue.push({
        type: "note",
        bg: "fireplace",
        vig: { speaker: "알림", portrait: Data.PORTRAIT.ara, text: n }
      });
    });
    if (Math.random() < 0.85) {
      queue.push({ type: "story", event: Ev.seasonalEvent(state) });
    }
  }

  function enqueueFestival() {
    queue = [];
    var intro = Ev.festivalIntro(state.festPick);
    queue.push({ type: "story", event: intro });
    var res = Eng.resolveFestival(state, state.festPick);
    queue.push({
      type: "festival",
      bg: res.bg,
      res: res,
      vig: {
        speaker: "아라",
        portrait: Data.PORTRAIT.ara,
        text: res.lines.join(" ")
      }
    });
    state.festPick = null;
  }

  function runSeason() {
    if (state.season === 2) {
      if (!state.festPick) return;
      enqueueFestival();
    } else {
      if (!state.slots.every(Boolean)) return;
      enqueueActivityResults();
    }
    show("event");
    playNext();
  }

  function finishSeasonFlow() {
    state.slots = [null, null, null];
    var adv = Eng.advanceSeason(state);
    if (adv.birthday) {
      toast(state.age + "살이 되었어요! 연금 " + adv.pension + "G");
    }
    persist();
    if (Eng.isGameOver(state)) {
      endGame();
      return;
    }
    show("hub");
    renderHub();
  }

  function endGame() {
    var ending = Eng.pickEnding(state);
    show("ending");
    $("ending-title").textContent = ending.title;
    $("ending-text").textContent = ending.text;
    $("ending-bg-img").src = Data.BG[ending.bg] || Data.BG.castle;
    $("ending-bg-img").hidden = false;
    var flags = $("ending-flags");
    flags.innerHTML = "";
    [
      state.age + "세까지 성장",
      "금화 " + state.gold,
      "유대 " + state.bond,
      "전투력 " + Eng.combatPower(state)
    ].forEach(function (t) {
      var s = document.createElement("span");
      s.className = "flag-chip";
      s.textContent = t;
      flags.appendChild(s);
    });
    sfx("fanfare");
    toast(ending.toast);
    Eng.clearSave();
    state = null;
    refreshContinue();
  }

  function setScene(bgKey) {
    var src = Data.BG[bgKey] || Data.BG.castle;
    var img = $("scene-bg-img");
    img.src = src;
    img.hidden = false;
    $("scene-bg").className = "scene-bg scene-fade bg-" + bgKey;
  }

  function typeText(str, onDone) {
    var el = $("dialog-text");
    if (typing) { clearInterval(typing.timer); typing = null; }
    el.textContent = "";
    $("tap-hint").classList.add("show");
    var i = 0;
    var handle = { done: false };
    handle.timer = setInterval(function () {
      i += 1;
      el.textContent = str.slice(0, i);
      if (i >= str.length) {
        clearInterval(handle.timer);
        handle.done = true;
        $("tap-hint").classList.remove("show");
        if (onDone) onDone();
      }
    }, 16);
    typing = handle;
    $("dialog-box").onclick = function () {
      if (typing && !typing.done) {
        clearInterval(typing.timer);
        el.textContent = str;
        typing.done = true;
        $("tap-hint").classList.remove("show");
        if (onDone) onDone();
      }
    };
  }

  function playNext() {
    if (!queue.length) {
      finishSeasonFlow();
      return;
    }
    var item = queue.shift();
    $("choices").innerHTML = "";

    if (item.type === "story") {
      playStoryEvent(item.event, playNext);
      return;
    }

    var bg = item.bg || "castle";
    setScene(bg);
    var vig = item.vig;
    $("portrait-img").src = vig.portrait;
    $("portrait-img").alt = vig.speaker;
    $("speaker-name").textContent = vig.speaker;

    var text = vig.text;
    if (item.res && item.res.lines && item.res.lines.length) {
      text = item.res.lines.join(" ") + " " + vig.text;
    }
    if (item.res && item.res.failed) text = "실패… " + text;

    typeText(text, function () {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = "다음";
      btn.addEventListener("click", function () {
        sfx("click");
        if (item.res && item.res.toast) toast(item.res.toast);
        if (item.type === "festival" && item.res) toast(item.res.placeLabel + " · +" + item.res.gold + "G");
        playNext();
      });
      $("choices").appendChild(btn);
    });
  }

  function playStoryEvent(ev, done) {
    var steps = ev.steps.slice();
    function nextStep() {
      if (!steps.length) {
        done();
        return;
      }
      var step = steps.shift();
      setScene(ev.bg);
      $("portrait-img").src = step.portrait;
      $("speaker-name").textContent = step.speaker;
      $("choices").innerHTML = "";
      typeText(step.text, function () {
        if (step.choices && step.choices.length) {
          step.choices.forEach(function (ch) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "choice-btn";
            b.textContent = ch.label;
            b.addEventListener("click", function () {
              sfx("click");
              if (ch.needGold && state.gold < ch.needGold) {
                toast("금화가 부족해요");
                return;
              }
              Eng.applyEffects(state, ch.effects);
              if (ch.nextNote) {
                steps.unshift({
                  speaker: "아라",
                  portrait: Data.PORTRAIT.ara,
                  text: ch.nextNote
                });
              }
              nextStep();
            });
            $("choices").appendChild(b);
          });
        } else {
          var n = document.createElement("button");
          n.type = "button";
          n.className = "choice-btn";
          n.textContent = "다음";
          n.addEventListener("click", function () { sfx("click"); nextStep(); });
          $("choices").appendChild(n);
        }
      });
    }
    nextStep();
  }

  /* ---------- Wire ---------- */
  $("btn-new").addEventListener("click", function () {
    if (typeof CasualSfx !== "undefined" && CasualSfx.unlock) try { CasualSfx.unlock(); } catch (_) {}
    sfx("click");
    Eng.clearSave();
    startNew();
  });
  $("btn-continue").addEventListener("click", function () {
    sfx("click");
    continueGame();
  });
  $("btn-run-month").addEventListener("click", function () {
    sfx("click");
    runSeason();
  });
  $("btn-ending-title").addEventListener("click", function () {
    sfx("click");
    show("title");
    refreshContinue();
  });

  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () {
      var go = el.getAttribute("data-go");
      sfx("click");
      if (go === "title") {
        persist();
        show("title");
        refreshContinue();
        return;
      }
      if (go === "hub") {
        show("hub");
        renderHub();
        return;
      }
      if (go === "stats") {
        show("stats");
        renderStats();
        return;
      }
      if (go === "talk") {
        show("talk");
        $("talk-result").textContent = "";
        return;
      }
      if (go === "schedule") {
        selectedSlot = 0;
        show("schedule");
        renderSchedule();
      }
    });
  });

  $("btn-talk-chat").addEventListener("click", function () {
    state.bond = Eng.clamp(state.bond + 2, 0, 999);
    state.stress = Eng.clamp(state.stress - 3, 0, 100);
    $("talk-result").textContent = "아라가 환하게 웃어요. 유대 +2, 스트레스 −3";
    persist();
    sfx("click");
  });
  $("btn-talk-money").addEventListener("click", function () {
    var r = Eng.pocketMoney(state, 20);
    $("talk-result").textContent = r.msg;
    if (r.ok) persist();
    sfx("click");
  });
  $("btn-talk-scold").addEventListener("click", function () {
    var r = Eng.scold(state);
    $("talk-result").textContent = r.msg;
    if (r.ok) persist();
    sfx("click");
  });

  refreshContinue();
  show("title");
})();
