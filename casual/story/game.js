/*! 공주 육성 — UI (PM2 Final) */
(function () {
  "use strict";

  var Data = window.PMData;
  var Eng = window.PMEngine;
  var Ev = window.PMEvents;
  var Media = window.PMMedia;
  if (!Data || !Eng || !Ev) { console.error("PM modules missing"); return; }

  var state = null;
  var activeCat = "study";
  var selectedSlot = 0;
  var activeShop = null;
  var queue = [];
  var typing = null;

  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    title: $("screen-title"), create: $("screen-create"), hub: $("screen-hub"),
    profile: $("screen-profile"), stats: $("screen-stats"),
    talk: $("screen-talk"), cube: $("screen-cube"), city: $("screen-city"),
    bag: $("screen-bag"), schedule: $("screen-schedule"), event: $("screen-event"),
    ending: $("screen-ending")
  };

  function sfx(role) {
    if (typeof CasualSfx !== "undefined" && CasualSfx && CasualSfx.play) {
      try { CasualSfx.play(role); } catch (_) {}
    }
  }

  var SOUND_KEY = "story_sound_v1";
  var soundOn = (function () {
    try { var v = localStorage.getItem(SOUND_KEY); return v === null ? true : v === "1"; }
    catch (_) { return true; }
  })();
  if (typeof CasualSfx !== "undefined" && CasualSfx.setEnabled) CasualSfx.setEnabled(soundOn);
  $("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
  $("btn-sound").addEventListener("click", function () {
    soundOn = !soundOn;
    $("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
    if (typeof CasualSfx !== "undefined" && CasualSfx.setEnabled) CasualSfx.setEnabled(soundOn);
    if (Media && Media.setEnabled) Media.setEnabled(soundOn);
    try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (_) {}
    if (soundOn) sfx("toggle");
  });
  if (Media && Media.setEnabled) Media.setEnabled(soundOn);

  function playTitleMedia() {
    var v = $("title-video");
    if (v) {
      v.style.display = "";
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.style.display = "none"; });
    }
    if (Media) Media.play("title");
  }

  function stopTitleMedia() {
    var v = $("title-video");
    if (v) try { v.pause(); } catch (_) {}
  }

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

  function persist() { if (state) Eng.save(state); }

  function refreshContinue() {
    $("btn-continue").classList.toggle("hidden", !Eng.load());
  }

  function startNew() {
    show("create");
    var sel = $("create-bday");
    if (sel && !sel.options.length) {
      Data.MONTHS.forEach(function (m, i) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = m;
        if (i === 2) o.selected = true;
        sel.appendChild(o);
      });
    }
    if (Media) Media.play("title");
  }

  function confirmCreate() {
    var name = ($("create-name").value || "아라").trim().slice(0, 8) || "아라";
    var blood = $("create-blood").value || "O";
    var bday = parseInt($("create-bday").value, 10);
    if (isNaN(bday)) bday = 2;
    state = Data.defaultState({ name: name, blood: blood, birthdayMonth: bday });
    state.slots = [null, null, null];
    persist();
    stopTitleMedia();
    show("hub");
    renderHub();
    if (Media) Media.play("hub");
    toast(name + "의 육성이 시작됐어요! (10→18세)");
  }

  function continueGame() {
    var saved = Eng.load();
    if (!saved) return;
    state = saved;
    if (!state.slots) state.slots = [null, null, null];
    stopTitleMedia();
    show("hub");
    renderHub();
    if (Media) Media.play("hub");
  }

  function monthBg() {
    var m = state.month;
    if (m === 9) return "dusk";
    if (m >= 11 || m <= 1) return "snow";
    if (m >= 2 && m <= 4) return "garden";
    if (m >= 5 && m <= 7) return "meadow";
    return "fireplace";
  }

  function renderHub() {
    if (!state) return;
    $("hub-name").textContent = state.name;
    $("hub-age").textContent = state.age + "세";
    $("hub-season").textContent = Data.MONTHS[state.month];
    $("hub-gold").textContent = String(state.gold);
    $("meter-stress").style.width = Eng.clamp(state.stress, 0, 100) + "%";
    $("meter-stamina").style.width = Eng.clamp(Math.min(100, state.stamina), 0, 100) + "%";
    var st = [];
    if (state.bedridden) st.push("와병");
    else if (state.sick) st.push("아픔");
    if (state.delinquent) st.push("장난기");
    if (state.runaway) st.push("가출중");
    if (state.inLove) st.push("연모");
    if (state.engaged) st.push("약혼");
    if (state.yearFlags && state.yearFlags.war) st.push("전쟁기운");
    if (state.yearFlags && state.yearFlags.harvest) st.push("풍년");
    if (Eng.isFestivalMonth(state)) st.push("추수 축제");
    $("hub-status").textContent = st.length ? st.join(" · ") : "컨디션 좋음 · 전투력 " + Eng.combatPower(state);
    $("hub-bg").src = Data.BG[monthBg()] || Data.BG.castle;
    $("hub-portrait").src = (state.age >= 14 && Data.PORTRAIT.araTeen) ? Data.PORTRAIT.araTeen : Data.PORTRAIT.ara;
  }

  function renderStats() {
    var keys = [
      "stamina", "strength", "intelligence", "refinement", "charisma", "morality", "faith", "sensitivity",
      "stress", "sin", "weight", "height", "sword", "fist", "art", "dance", "cooking", "magic", "poetry", "science",
      "repFight", "repArt", "repSocial", "repScholar", "bond", "prince", "cubeLove", "puppy", "kitten", "gold"
    ];
    var grid = $("stats-grid");
    grid.innerHTML = "";
    keys.forEach(function (k) {
      var row = document.createElement("div");
      row.className = "stat-row";
      var eff = Eng.effective(state, k);
      var base = state[k] || 0;
      var label = base !== eff ? base + "→" + eff : String(base);
      row.innerHTML = "<span>" + (Data.STAT_LABELS[k] || k) + "</span><b>" + label + "</b>";
      grid.appendChild(row);
    });
    var power = document.createElement("div");
    power.className = "stat-row accent";
    power.innerHTML = "<span>전투력</span><b>" + Eng.combatPower(state) + "</b>";
    grid.appendChild(power);

    var rl = $("rival-list");
    rl.innerHTML = "";
    Eng.rivalSnapshot(state).forEach(function (r) {
      var d = document.createElement("div");
      d.className = "rival-card";
      d.innerHTML = '<img src="' + (Data.PORTRAIT[r.portrait] || "") + '" alt=""><div><strong>' +
        r.name + "</strong><span>" + r.line + "</span><em>성장세 " + r.score + "</em></div>";
      rl.appendChild(d);
    });
  }

  function renderCube() {
    var ul = $("cube-tips");
    ul.innerHTML = "";
    $("cube-love").textContent = "큐브 신뢰 " + (state.cubeLove || 0);
    $("cube-msg").textContent = "";
    Eng.cubeAdvice(state).forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function renderCity() {
    $("shop-detail").classList.add("hidden");
    $("shop-list").classList.remove("hidden");
    var list = $("shop-list");
    list.innerHTML = "";
    Data.SHOPS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn";
      b.innerHTML = "<strong>" + s.name + "</strong><span>" + s.desc + "</span>";
      b.addEventListener("click", function () {
        openShop(s.id);
      });
      list.appendChild(b);
    });
  }

  function openShop(shopId) {
    activeShop = Data.SHOPS.filter(function (s) { return s.id === shopId; })[0];
    if (!activeShop) return;
    $("shop-list").classList.add("hidden");
    $("shop-detail").classList.remove("hidden");
    $("shop-title").textContent = activeShop.name;
    $("shop-desc").textContent = activeShop.desc;
    $("shop-msg").textContent = "";
    var box = $("shop-items");
    box.innerHTML = "";

    if (activeShop.special === "donate") {
      [30, 60, 100].forEach(function (amt) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "act-btn";
        b.innerHTML = "<strong>" + amt + "G 기부</strong><span>죄업을 낮추고 신앙을 올려요</span>";
        b.addEventListener("click", function () {
          var r = Eng.donate(state, amt);
          $("shop-msg").textContent = r.msg;
          if (r.ok) { persist(); renderHub(); }
          sfx("click");
        });
        box.appendChild(b);
      });
      return;
    }
    if (activeShop.special === "heal") {
      var hb = document.createElement("button");
      hb.type = "button";
      hb.className = "act-btn";
      hb.innerHTML = "<strong>치료받기</strong><span>아픔/와병을 치료해요</span>";
      hb.addEventListener("click", function () {
        var r = Eng.healClinic(state);
        $("shop-msg").textContent = r.msg;
        if (r.ok) { persist(); renderHub(); }
        sfx("click");
      });
      box.appendChild(hb);
      return;
    }
    if (activeShop.special === "palace") {
      var pb = document.createElement("button");
      pb.type = "button";
      pb.className = "act-btn";
      pb.innerHTML = "<strong>알현하기</strong><span>한 달에 한 번 · 사교와 왕자 호감</span>";
      pb.addEventListener("click", function () {
        var r = Eng.visitPalace(state);
        $("shop-msg").textContent = r.msg;
        if (r.ok) { persist(); renderHub(); }
        sfx("click");
      });
      box.appendChild(pb);
      return;
    }

    Eng.shopItems(shopId, state).forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn";
      b.innerHTML = "<strong>" + it.name + " · " + it.cost + "G</strong><span>" + it.desc + "</span>";
      b.addEventListener("click", function () {
        var r = Eng.buyItem(state, it.id);
        $("shop-msg").textContent = r.msg;
        if (r.ok) { persist(); renderHub(); toast(r.msg); }
        sfx("click");
      });
      box.appendChild(b);
    });
  }

  function renderBag() {
    var eq = $("equip-view");
    var slots = [
      ["weapon", "무기"], ["armor", "갑옷"], ["helm", "투구"], ["dress", "옷"]
    ];
    eq.innerHTML = "";
    slots.forEach(function (pair) {
      var id = state.equip[pair[0]];
      var it = id ? Data.ITEMS[id] : null;
      var div = document.createElement("div");
      div.className = "equip-slot";
      div.innerHTML = "<em>" + pair[1] + "</em><strong>" + (it ? it.name : "없음") + "</strong>";
      if (it) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-text";
        btn.textContent = "해제";
        btn.addEventListener("click", function () {
          var r = Eng.unequip(state, pair[0]);
          $("bag-msg").textContent = r.msg;
          if (r.ok) { persist(); renderBag(); renderHub(); toast(r.msg); }
          sfx("click");
        });
        div.appendChild(btn);
      }
      eq.appendChild(div);
    });

    var bag = $("bag-list");
    bag.innerHTML = "";
    $("bag-msg").textContent = "";
    if (!state.inventory.length) {
      bag.innerHTML = '<p class="panel-desc">소비 아이템이 없어요.</p>';
      return;
    }
    state.inventory.forEach(function (id, idx) {
      var it = Data.ITEMS[id];
      if (!it) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn";
      var action = it.slot === "consumable" ? "탭하여 사용" : "탭하여 재장착";
      b.innerHTML = "<strong>" + it.name + "</strong><span>" + it.desc + " · " + action + "</span>";
      b.addEventListener("click", function () {
        if (it.slot === "consumable") {
          var r = Eng.useConsumable(state, idx);
          $("bag-msg").textContent = r.msg;
          if (r.ok) { persist(); renderBag(); renderHub(); }
        } else {
          state.inventory.splice(idx, 1);
          var prev = state.equip[it.slot];
          if (prev) state.inventory.push(prev);
          state.equip[it.slot] = id;
          $("bag-msg").textContent = it.name + "을(를) 장착했어요.";
          persist();
          renderBag();
          renderHub();
          toast($("bag-msg").textContent);
        }
        sfx("click");
      });
      bag.appendChild(b);
    });
  }

  function renderProfile() {
    var blood = Eng.bloodLabel(state);
    var diet = Eng.dietLabel(state);
    var portrait = state.age >= 14 && Data.PORTRAIT.araTeen ? Data.PORTRAIT.araTeen : Data.PORTRAIT.ara;
    $("hub-portrait").src = portrait;
    $("profile-summary").innerHTML = [
      ["이름", state.name],
      ["나이", state.age + "세"],
      ["키", (state.height || 130) + "cm"],
      ["체중", (state.weight || 40) + "kg"],
      ["혈액형", blood],
      ["식단", diet],
      ["생일", Data.MONTHS[state.birthdayMonth != null ? state.birthdayMonth : 2]],
      ["큐브 신뢰", String(state.cubeLove || 0)],
      ["원정 완수", String(state.errantryWins || 0)],
      ["전투력", String(Eng.combatPower(state))]
    ].map(function (row) {
      return '<div class="profile-chip"><em>' + row[0] + "</em><strong>" + row[1] + "</strong></div>";
    }).join("");

    var list = $("diet-list");
    list.innerHTML = "";
    $("profile-msg").textContent = "";
    Object.keys(Data.DIETS).forEach(function (id) {
      var d = Data.DIETS[id];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn" + (state.diet === id ? " on" : "");
      b.innerHTML = "<strong>" + d.name + " · " + d.cost + "G/월</strong><span>" + d.desc + "</span>";
      b.addEventListener("click", function () {
        var r = Eng.setDiet(state, id);
        $("profile-msg").textContent = r.msg;
        if (r.ok) { persist(); renderProfile(); toast(r.msg); }
        sfx("click");
      });
      list.appendChild(b);
    });
  }

  function renderSchedule() {
    var isFest = Eng.isFestivalMonth(state);
    $("sched-label").textContent = Data.MONTHS[state.month] + " · " + state.age + "세";
    $("fest-box").classList.toggle("hidden", !isFest);
    $("slot-row").classList.toggle("hidden", isFest);
    $("cat-tabs").classList.toggle("hidden", isFest);
    $("act-list").classList.toggle("hidden", isFest);
    $("sched-hint").textContent = isFest
      ? "10월은 추수 축제입니다. 행사 하나만 고르세요."
      : (state.runaway ? "가출 중이라 스케줄이 제한돼요." : "이번 달 활동 3칸을 채워 주세요.");

    if (isFest) {
      renderFestivalChoices();
      $("btn-run-month").disabled = !state.festPick;
      $("btn-run-month").textContent = "축제 참가";
      return;
    }

    $("btn-run-month").textContent = "이달 진행";
    var row = $("slot-row");
    row.innerHTML = "";
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-btn" + (selectedSlot === idx ? " selected" : "");
        var act = state.slots[idx] ? Data.ACTIVITIES[state.slots[idx]] : null;
        btn.innerHTML = "<em>" + (idx + 1) + "</em><span>" + (act ? act.name : "비어 있음") + "</span>";
        btn.addEventListener("click", function () { selectedSlot = idx; renderSchedule(); });
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
      t.addEventListener("click", function () { activeCat = c.id; renderSchedule(); });
      tabs.appendChild(t);
    });

    var list = $("act-list");
    list.innerHTML = "";
    Eng.availableActivities(state).filter(function (a) { return a.cat === activeCat; }).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act-btn";
      var cost = a.cost ? a.cost + "G" : (a.gold ? "수입" : "무료");
      var rank = "";
      if (a.cat === "work" && state.jobRanks[a.id]) rank = " · 알바 숙련 " + state.jobRanks[a.id];
      if (a.cat === "study" && state.classRanks && state.classRanks[a.id]) rank = " · 수업 숙련 " + state.classRanks[a.id];
      b.innerHTML = "<strong>" + a.name + "</strong><span>" + a.desc + "</span><em>" + cost + " · 스트레스 " + a.stress + rank + "</em>";
      b.addEventListener("click", function () {
        if (a.cost && state.gold < a.cost) { toast("금화가 부족해요"); return; }
        state.slots[selectedSlot] = a.id;
        selectedSlot = Math.min(2, selectedSlot + 1);
        sfx("click");
        renderSchedule();
      });
      list.appendChild(b);
    });

    $("btn-run-month").disabled = !state.slots.every(Boolean) || !!state.runaway;
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

  function enqueueMonth() {
    queue = [];
    if (state.runaway) {
      queue.push({
        type: "note", bg: "wander",
        vig: { speaker: "큐브", portrait: Data.PORTRAIT.cube, text: "아가씨를 찾아 헤매는 한 달이었어요… 명성이 조금 줄었습니다." }
      });
      Eng.updateAilments(state).forEach(function (n) {
        queue.push({ type: "note", bg: "fireplace", vig: { speaker: "알림", portrait: Data.PORTRAIT.ara, text: n } });
      });
      return;
    }
    state.slots.forEach(function (id) {
      if (!id) return;
      var act = Data.ACTIVITIES[id];
      if (act && act.cat === "adventure" && Media) Media.play("adventure");
      var res = Eng.resolveActivity(state, id);
      if (!res.ok) {
        queue.push({ type: "note", bg: "fireplace", vig: { speaker: "알림", portrait: Data.PORTRAIT.ara, text: res.msg || "활동을 할 수 없어요." } });
        return;
      }
      if (res.needsErrantry && res.errantry) {
        queue.push({ type: "errantry", bg: res.bg || "camp", session: res.errantry, res: res });
        return;
      }
      queue.push({ type: "activity", bg: res.bg || (act ? act.bg : "castle"), res: res, vig: Ev.vignetteFor(id, state, res) });
    });
    Eng.updateAilments(state).forEach(function (n) {
      queue.push({ type: "note", bg: "fireplace", vig: { speaker: "알림", portrait: Data.PORTRAIT.ara, text: n } });
    });
    if (Math.random() < 0.9) queue.push({ type: "story", event: Ev.monthlyEvent(state) });
  }

  function enqueueFestival() {
    queue = [];
    if (Media) Media.play("festival");
    queue.push({ type: "story", event: Ev.festivalIntro(state.festPick) });
    var res = Eng.resolveFestival(state, state.festPick);
    queue.push({
      type: "festival", bg: res.bg, res: res,
      vig: { speaker: "아라", portrait: Data.PORTRAIT.ara, text: res.lines.join(" ") }
    });
    state.festPick = null;
  }

  function runMonth() {
    if (Eng.isFestivalMonth(state)) {
      if (!state.festPick) return;
      enqueueFestival();
    } else {
      if (!state.slots.every(Boolean) && !state.runaway) return;
      enqueueMonth();
    }
    show("event");
    playNext();
  }

  function finishMonthFlow() {
    state.slots = [null, null, null];
    var adv = Eng.advanceMonth(state);
    if (adv.notes && adv.notes.length) toast(adv.notes[0]);

    var vignettes = [];
    if (adv.birthdayParty) {
      vignettes.push({
        type: "note", bg: "birthday",
        vig: {
          speaker: adv.fatherCake ? "큐브" : "아버지",
          portrait: adv.fatherCake ? Data.PORTRAIT.cube : (Data.PORTRAIT.father || Data.PORTRAIT.ara),
          text: adv.fatherCake
            ? "생일 축하해요, " + state.name + "! 케이크와 차를 준비했어요."
            : state.name + "의 생일을 축하해요. 올해에도 건강하게 자라 주렴."
        }
      });
    }
    if (adv.yearEvent === "war") {
      vignettes.push({
        type: "note", bg: "festival",
        vig: {
          speaker: "기사", portrait: Data.PORTRAIT.bear,
          text: "국경에 소식이 분주해요. 올해는 무예와 원정이 특히 중요하답니다."
        }
      });
    }
    if (adv.yearEvent === "harvest") {
      vignettes.push({
        type: "note", bg: "farm",
        vig: {
          speaker: "상인", portrait: Data.PORTRAIT.merchant || Data.PORTRAIT.ria,
          text: "풍년이에요! 장터가 활기차고, 일손도 넉넉히 찾는다오."
        }
      });
    }
    if (adv.engagement) {
      vignettes.push({
        type: "note", bg: "ballroom",
        vig: {
          speaker: "왕자", portrait: Data.PORTRAIT.prince,
          text: state.name + "… 언젠가 손을 잡고 싶다고, 진지하게 전해 왔어요. 약혼의 이야기가 시작됐어요."
        }
      });
    }

    if (vignettes.length) {
      queue = vignettes;
      show("event");
      playNextBirthdayThenHub(adv);
      return;
    }
    if (adv.birthday) toast(state.age + "살이 되었어요! 연금 +" + adv.pension + "G");
    persist();
    if (Eng.isGameOver(state)) { endGame(); return; }
    show("hub");
    renderHub();
    if (Media) Media.play("hub");
  }

  function playNextBirthdayThenHub(adv) {
    if (!queue.length) {
      if (adv.birthday) toast(state.age + "살이 되었어요! 연금 +" + adv.pension + "G");
      persist();
      if (Eng.isGameOver(state)) { endGame(); return; }
      show("hub");
      renderHub();
      if (Media) Media.play("hub");
      return;
    }
    var item = queue.shift();
    setScene(item.bg || "birthday");
    $("portrait-img").src = item.vig.portrait;
    $("speaker-name").textContent = item.vig.speaker;
    $("choices").innerHTML = "";
    typeText(item.vig.text, function () {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = "다음";
      btn.addEventListener("click", function () {
        sfx("click");
        playNextBirthdayThenHub(adv);
      });
      $("choices").appendChild(btn);
    });
  }

  function endGame() {
    var ending = Eng.pickEnding(state);
    show("ending");
    if (Media) Media.play("ending");
    var ev = $("ending-video");
    if (ev) {
      var p = ev.play();
      if (p && p.catch) p.catch(function () {});
    }
    $("ending-title").textContent = ending.title;
    $("ending-text").textContent = ending.text;
    $("ending-bg-img").src = Data.BG[ending.bg] || Data.BG.ending_gate || Data.BG.castle;
    $("ending-bg-img").hidden = !!ev;
    var flags = $("ending-flags");
    flags.innerHTML = "";
    [state.age + "세", "금화 " + state.gold, "유대 " + state.bond, "전투력 " + Eng.combatPower(state), "왕자호감 " + state.prince]
      .forEach(function (t) {
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
    $("scene-bg-img").src = src;
    $("scene-bg-img").hidden = false;
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
    }, 12);
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
    if (!queue.length) { finishMonthFlow(); return; }
    var item = queue.shift();
    $("choices").innerHTML = "";
    if (item.type === "story") { playStoryEvent(item.event, playNext); return; }
    if (item.type === "errantry") { playErrantry(item); return; }

    setScene(item.bg || "castle");
    var vig = item.vig;
    $("portrait-img").src = vig.portrait;
    $("speaker-name").textContent = vig.speaker;
    var text = vig.text;
    if (item.res && item.res.lines && item.res.lines.length) text = item.res.lines.join(" ") + " " + vig.text;
    if (item.res && item.res.failed) text = "실패… " + text;

    typeText(text, function () {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = "다음";
      btn.addEventListener("click", function () {
        sfx("click");
        if (item.type === "festival" && item.res) toast(item.res.placeLabel + " · +" + item.res.gold + "G");
        playNext();
      });
      $("choices").appendChild(btn);
    });
  }

  function playErrantry(item) {
    var session = item.session;
    if (Media) Media.play("adventure");
    setScene(session.bg || item.bg || "camp");
    $("portrait-img").src = Data.PORTRAIT.ara;
    $("speaker-name").textContent = session.zoneName || "원정";

    function showStep(intro) {
      $("choices").innerHTML = "";
      var prompt = Eng.errantryPrompt(session);
      typeText(intro || prompt, function () {
        [
          ["fight", "싸운다"],
          ["talk", "말한다"],
          ["search", "찾는다"],
          ["flee", "도망친다"]
        ].forEach(function (pair) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "choice-btn";
          b.textContent = pair[1];
          b.addEventListener("click", function () {
            sfx("click");
            var r = Eng.playErrantryStep(state, session, pair[0]);
            if (!r.ok) { toast(r.msg || "실패"); return; }
            persist();
            $("choices").innerHTML = "";
            typeText(r.line, function () {
              if (r.done) {
                var n = document.createElement("button");
                n.type = "button";
                n.className = "choice-btn";
                n.textContent = r.cleared ? "원정 완료" : "귀환";
                n.addEventListener("click", function () {
                  sfx(r.cleared ? "success" : "click");
                  toast(r.cleared ? "원정 성공!" : "원정 중단");
                  playNext();
                });
                $("choices").appendChild(n);
              } else {
                showStep(r.prompt);
              }
            });
          });
          $("choices").appendChild(b);
        });
      });
    }

    var open = (item.res && item.res.lines && item.res.lines[0]) || (session.zoneName + " 원정을 시작해요.");
    showStep(open + " " + Eng.errantryPrompt(session));
  }

  function playStoryEvent(ev, done) {
    var steps = ev.steps.slice();
    function nextStep() {
      if (!steps.length) { done(); return; }
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
              if (ch.needGold && state.gold < ch.needGold) { toast("금화가 부족해요"); return; }
              Eng.applyEffects(state, ch.effects);
              if (ch.nextNote) {
                steps.unshift({ speaker: "아라", portrait: Data.PORTRAIT.ara, text: ch.nextNote });
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

  $("btn-new").addEventListener("click", function () {
    if (typeof CasualSfx !== "undefined" && CasualSfx.unlock) try { CasualSfx.unlock(); } catch (_) {}
    if (Media && Media.unlock) Media.unlock();
    sfx("click");
    Eng.clearSave();
    startNew();
  });
  $("btn-create-go").addEventListener("click", function () {
    sfx("click");
    confirmCreate();
  });
  $("btn-continue").addEventListener("click", function () {
    if (typeof CasualSfx !== "undefined" && CasualSfx.unlock) try { CasualSfx.unlock(); } catch (_) {}
    if (Media && Media.unlock) Media.unlock();
    sfx("click");
    continueGame();
  });
  $("btn-run-month").addEventListener("click", function () { sfx("click"); runMonth(); });
  $("btn-ending-title").addEventListener("click", function () {
    sfx("click");
    var ev = $("ending-video");
    if (ev) try { ev.pause(); } catch (_) {}
    show("title");
    playTitleMedia();
    refreshContinue();
  });
  $("btn-shop-back").addEventListener("click", function () { sfx("click"); renderCity(); });

  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () {
      var go = el.getAttribute("data-go");
      sfx("click");
      if (go === "title") {
        persist();
        show("title");
        playTitleMedia();
        refreshContinue();
        return;
      }
      if (go === "hub") { show("hub"); renderHub(); if (Media) Media.play("hub"); return; }
      if (go === "profile") { show("profile"); renderProfile(); return; }
      if (go === "stats") { show("stats"); renderStats(); return; }
      if (go === "talk") { show("talk"); $("talk-result").textContent = ""; return; }
      if (go === "cube") { show("cube"); renderCube(); return; }
      if (go === "city") { show("city"); renderCity(); return; }
      if (go === "bag") { show("bag"); renderBag(); return; }
      if (go === "schedule") { selectedSlot = 0; show("schedule"); renderSchedule(); }
    });
  });

  $("btn-talk-chat").addEventListener("click", function () {
    state.bond = Eng.clamp(state.bond + 2, 0, 999);
    state.stress = Eng.clamp(state.stress - 3, 0, 100);
    state.cubeLove = Eng.clamp((state.cubeLove || 0) + 1, 0, 999);
    $("talk-result").textContent = "아라가 환하게 웃어요. 유대 +2, 스트레스 −3";
    persist(); sfx("click");
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

  function cubeAct(fn) {
    var r = fn(state);
    $("cube-msg").textContent = r.msg;
    if (r.ok) { persist(); renderCube(); renderHub(); toast(r.msg); }
    sfx("click");
  }
  $("btn-cube-tea").addEventListener("click", function () { cubeAct(Eng.cubeTea); });
  $("btn-cube-gift").addEventListener("click", function () { cubeAct(Eng.cubeGift); });
  $("btn-cube-praise").addEventListener("click", function () { cubeAct(Eng.cubePraise); });

  refreshContinue();
  show("title");
  playTitleMedia();
})();
