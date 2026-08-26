(() => {
  "use strict";

  const PASS = "1234";
  const LS_SAVE = "mc.save.v1";
  const LS_SOUND = "mc.sound";
  // 암호는 매 방문마다 요구 (sessionStorage로 탭 세션만 유지)
  const SS_UNLOCK = "mc.unlock.session";

  const storage = (() => {
    try {
      localStorage.setItem("__mc", "1");
      localStorage.removeItem("__mc");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    }
  })();

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let state = null;
  let sceneQueue = [];
  let sceneIdx = 0;
  let awaitingChoice = false;

  const $ = (id) => document.getElementById(id);
  const screens = {
    gate: $("screen-gate"),
    title: $("screen-title"),
    cast: $("screen-cast"),
    hub: $("screen-hub"),
    status: $("screen-status"),
    scene: $("screen-scene"),
    ending: $("screen-ending"),
  };

  function sfx(r) {
    if (!soundOn || !window.CasualSfx) return;
    CasualSfx.play(r);
  }

  function show(name) {
    Object.values(screens).forEach((el) => el.classList.add("hidden"));
    screens[name].classList.remove("hidden");
  }

  function blankState() {
    const aff = {};
    Object.keys(window.MC_HEROINES).forEach((id) => { aff[id] = 0; });
    return {
      day: 1,
      slot: "morning",
      energy: 100,
      money: 20,
      int: 10,
      ath: 10,
      cha: 10,
      aff,
      flags: {},
      seen: {},
      place: "dorm",
    };
  }

  function applyEffects(fx) {
    if (!fx) return;
    if (fx.aff) {
      Object.entries(fx.aff).forEach(([k, v]) => {
        state.aff[k] = Math.max(0, Math.min(100, (state.aff[k] || 0) + v));
      });
    }
    ["int", "ath", "cha", "money", "energy"].forEach((k) => {
      if (fx[k] != null) state[k] = Math.max(0, (state[k] || 0) + fx[k]);
    });
    if (fx.flag) state.flags[fx.flag] = true;
    if (fx.flag2) state.flags[fx.flag2] = true;
    if (fx.unflag) delete state.flags[fx.unflag];
  }

  function slotName(id) {
    const s = window.MC_SLOTS.find((x) => x.id === id);
    return s ? s.name : id;
  }

  function advanceTime() {
    const cur = window.MC_SLOTS.find((x) => x.id === state.slot);
    if (cur && cur.next) state.slot = cur.next;
    else sleepToNextDay();
  }

  function sleepToNextDay() {
    state.day += 1;
    state.slot = "morning";
    state.energy = Math.min(100, state.energy + 55);
    if (state.day > window.MC_MAX_DAY) {
      finishGame();
      return true;
    }
    return false;
  }

  function save() {
    storage.setItem(LS_SAVE, JSON.stringify(state));
    sfx("success");
  }

  function load() {
    try {
      const raw = storage.getItem(LS_SAVE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function setBg(el, placeId) {
    const url = `assets/bg/${placeId || "dorm"}.png`;
    el.style.backgroundImage = `linear-gradient(180deg,rgba(10,4,16,.15),rgba(10,4,16,.55)),url("${url}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  }

  function renderCast() {
    const list = $("cast-list");
    list.innerHTML = "";
    Object.values(window.MC_HEROINES).forEach((h) => {
      const card = document.createElement("article");
      card.className = "cast-card";
      card.innerHTML = `
        <img src="${h.portrait}" alt="${h.name}" onerror="this.style.opacity=.3">
        <div>
          <h3 style="color:${h.color}">${h.name}</h3>
          <div class="meta">${h.age}세 · ${h.title}</div>
          <p>${h.blurb}</p>
          <p class="meta">${h.tag}</p>
        </div>`;
      list.appendChild(card);
    });
  }

  function renderHub() {
    $("hub-day").textContent = `Day ${state.day} · ${slotName(state.slot)}`;
    $("hub-stats").innerHTML = `
      <span class="chip">⚡${state.energy}</span>
      <span class="chip">₩${state.money}</span>
      <span class="chip">학력 ${state.int}</span>
      <span class="chip">체력 ${state.ath}</span>
      <span class="chip">매력 ${state.cha}</span>`;
    $("hub-aff").innerHTML = Object.values(window.MC_HEROINES)
      .map((h) => `<span class="chip" style="border:1px solid ${h.color}55">${h.name} ${state.aff[h.id] || 0}</span>`)
      .join("");

    const grid = $("place-grid");
    grid.innerHTML = "";
    const places = window.MC_PLACES.slice();
    if (state.day >= 19) {
      places.push({ id: "festival", name: "축제광장", icon: "🎊", slots: ["evening", "night"] });
    }
    places.forEach((p) => {
      const okSlot = !p.slots || p.slots.includes(state.slot);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "place-btn";
      btn.disabled = !okSlot || state.energy < 5;
      btn.innerHTML = `<span class="ico">${p.icon}</span><span>${p.name}</span>`;
      btn.onclick = () => visitPlace(p);
      grid.appendChild(btn);
    });
    $("btn-sleep").hidden = state.slot !== "night";
    if (state.day >= 20) {
      $("hub-hint").textContent = "축제 시즌입니다. 축제광장에서 고백 이벤트를 놓치지 마세요.";
    } else {
      $("hub-hint").textContent = "갈 곳을 고르세요. 한 장소 = 시간 한 칸.";
    }
  }

  function renderStatus() {
    const body = $("status-body");
    const rows = Object.values(window.MC_HEROINES)
      .map((h) => {
        const a = state.aff[h.id] || 0;
        return `<div class="status-card">
          <img class="aff-face" src="${h.portrait}" alt="" onerror="this.style.opacity=.3">
          <div>
            <strong style="color:${h.color}">${h.name}</strong>
            <div class="meta">${h.age}세 · 호감 ${a}/100</div>
            <div style="height:6px;background:#2a1538;border-radius:99px;margin-top:6px">
              <div style="height:100%;width:${a}%;background:${h.color};border-radius:99px"></div>
            </div>
          </div>
        </div>`;
      })
      .join("");
    body.innerHTML = `<div class="status-card" style="grid-template-columns:1fr"><div>
      <p>Day ${state.day}/${window.MC_MAX_DAY} · ${slotName(state.slot)}</p>
      <p class="meta">학력 ${state.int} · 체력 ${state.ath} · 매력 ${state.cha} · 돈 ${state.money} · 기력 ${state.energy}</p>
    </div></div>${rows}`;
  }

  function pickEvent(placeId) {
    const candidates = (window.MC_EVENTS || []).filter((ev) => {
      if (ev.place && ev.place !== placeId) return false;
      if (ev.slots && !ev.slots.includes(state.slot)) return false;
      if (ev.once && state.seen[ev.id]) return false;
      if (ev.when && !ev.when(state)) return false;
      return true;
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.weight || 1) - (a.weight || 1) || Math.random() - 0.5);
    const top = candidates.slice(0, Math.min(3, candidates.length));
    const sum = top.reduce((n, e) => n + (e.weight || 1), 0);
    let r = Math.random() * sum;
    for (const e of top) {
      r -= e.weight || 1;
      if (r <= 0) return e;
    }
    return top[0];
  }

  function freeScene(place) {
    if (place.rest) {
      return [
        { who: null, text: "기숙사에서 숨을 고른다. 창밖의 캠퍼스 야경이 흐른다." },
        {
          choices: [
            { label: "일찍 잔다 (다음날)", effects: { energy: 40, _sleep: true } },
            { label: "잠깐만 쉰다", effects: { energy: 15 } },
          ],
        },
      ];
    }
    const acts = [
      { label: "공부한다 (+학력)", effects: { int: 4, energy: -12 } },
      { label: "운동·산책 (+체력)", effects: { ath: 4, energy: -12 } },
      { label: "사람 관찰 (+매력)", effects: { cha: 4, energy: -10 } },
    ];
    return [
      { who: null, text: `${place.name}에 도착했다. 특별한 만남은 없지만, 시간을 쓸 수 있다.` },
      { choices: acts },
    ];
  }

  function visitPlace(place) {
    if (state.energy < 5) return;
    state.place = place.id;
    state.energy -= 5;
    const ev = pickEvent(place.id);
    if (ev) {
      if (ev.once) state.seen[ev.id] = true;
      startScene(ev.scene, place.id);
    } else {
      startScene(freeScene(place), place.id);
    }
  }

  function clearChoices() {
    const box = $("scene-choices");
    box.innerHTML = "";
    box.hidden = true;
    awaitingChoice = false;
  }

  function startScene(scene, placeId) {
    sceneQueue = scene.slice();
    sceneIdx = 0;
    clearChoices();
    $("btn-next").hidden = false;
    setBg($("scene-bg"), placeId || state.place);
    show("scene");
    paintStep();
  }

  function paintStep() {
    if (sceneIdx >= sceneQueue.length) {
      clearChoices();
      endScene();
      return;
    }
    const step = sceneQueue[sceneIdx];
    if (step.choices) {
      awaitingChoice = true;
      $("btn-next").hidden = true;
      $("scene-who").textContent = "";
      $("scene-text").textContent = "어떻게 할까?";
      $("scene-text").classList.remove("adult-mark");
      $("scene-portrait").hidden = true;
      const box = $("scene-choices");
      box.innerHTML = "";
      box.hidden = false;
      step.choices.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "choice-btn";
        b.textContent = c.label;
        b.onclick = () => {
          sfx("click");
          applyEffects(c.effects);
          if (c.effects && c.effects._sleep) {
            clearChoices();
            show("hub");
            if (!sleepToNextDay()) renderHub();
            return;
          }
          clearChoices();
          $("btn-next").hidden = false;
          sceneIdx += 1;
          paintStep();
        };
        box.appendChild(b);
      });
      return;
    }

    clearChoices();
    $("btn-next").hidden = false;
    if (step.bg) setBg($("scene-bg"), step.bg);
    const who = step.who ? window.MC_HEROINES[step.who] : null;
    $("scene-who").textContent = who ? `${who.name} (${who.age})` : "";
    $("scene-text").textContent = step.text || "";
    $("scene-text").classList.toggle("adult-mark", !!step.adult);
    const portrait = $("scene-portrait");
    const img = step.img || (who ? who.portrait : "");
    portrait.onerror = null;
    if (img) {
      const isCg = /\/cg\//.test(img);
      portrait.classList.toggle("is-cg", isCg);
      if (isCg && who) {
        portrait.onerror = () => {
          portrait.onerror = null;
          portrait.classList.remove("is-cg");
          portrait.src = who.portrait;
        };
      }
      portrait.src = img;
      portrait.hidden = false;
    } else {
      portrait.classList.remove("is-cg");
      portrait.removeAttribute("src");
      portrait.hidden = true;
    }
  }

  function endScene() {
    save();
    advanceTime();
    if (state.day > window.MC_MAX_DAY) return;
    show("hub");
    renderHub();
  }

  function endingTier(h, topVal) {
    if (!h) return "solo";
    const routed = state.flags["route_" + h.id];
    const hotel = state.flags[h.id + "_hotel"] || state.flags[h.id + "_morning"];
    const fest = state.flags["fest_" + h.id];
    if (routed && topVal >= 85 && (hotel || fest)) return "true";
    if (routed && topVal >= 70) return "good";
    if (topVal >= 60) return "normal";
    return "solo";
  }

  function finishGame() {
    const ranked = Object.entries(state.aff).sort((a, b) => b[1] - a[1]);
    const [topId, topVal] = ranked[0] || [null, 0];
    const h = topId ? window.MC_HEROINES[topId] : null;
    const tier = endingTier(h, topVal);
    const card = $("ending-card");
    const texts = {
      true: h
        ? `【진 엔딩】 축제와 그 이후의 밤까지, ${h.name}(${h.age})과/와 선택한 미래가 겹친다. 호감 ${topVal}. 성인 두 사람의 계절이 다음 학기로 이어진다.`
        : "",
      good: h
        ? `【해피 엔딩】 ${h.name}(${h.age})이/가 당신의 이름을 부른다. 아직 다 말하지 못한 밤이 남았지만, 방향은 같다. 호감 ${topVal}.`
        : "",
      normal: h
        ? `【노멀 엔딩】 ${h.name}과/와 가까워졌지만, 고백은 반쯤 열린 문에서 멈췄다. 호감 ${topVal}.`
        : "",
      solo: "【솔로 엔딩】 축제는 끝났고, 기숙사 짐만 남았다. 다음 학기의 밤을 위해 문을 닫는다.",
    };
    card.innerHTML = `
      ${h && tier !== "solo" ? `<img src="${h.portrait}" alt="" onerror="this.style.opacity=.3">` : ""}
      <h2>${tier === "solo" ? "솔로 엔딩" : h.name + " 엔딩"}</h2>
      <p>${texts[tier]}</p>
      <button type="button" class="btn-primary" id="btn-end-title">타이틀로</button>`;
    show("ending");
    sfx(tier === "solo" ? "lose" : "win");
    $("btn-end-title").onclick = () => {
      storage.removeItem(LS_SAVE);
      show("title");
      refreshContinue();
    };
  }

  function refreshContinue() {
    $("btn-continue").hidden = !load();
  }

  function unlockOk() {
    try { sessionStorage.setItem(SS_UNLOCK, "1"); } catch (_) {}
    show("title");
    refreshContinue();
    renderCast();
    if (window.CasualSfx) CasualSfx.unlock();
    sfx("success");
  }

  // —— wire ——
  $("btn-gate").onclick = () => {
    const v = ($("gate-input").value || "").trim();
    if (v === PASS) {
      $("gate-err").hidden = true;
      unlockOk();
    } else {
      $("gate-err").hidden = false;
      sfx("fail");
    }
  };
  $("gate-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-gate").click();
  });

  $("btn-new").onclick = () => {
    state = blankState();
    save();
    show("hub");
    renderHub();
    sfx("click");
  };
  $("btn-continue").onclick = () => {
    state = load();
    if (!state) return;
    show("hub");
    renderHub();
  };
  $("btn-cast").onclick = () => { show("cast"); };
  $("btn-cast-back").onclick = () => { show("title"); };
  const soundBtn = $("btn-sound-title");
  if (soundBtn) {
    soundBtn.onclick = () => {
      soundOn = !soundOn;
      storage.setItem(LS_SOUND, soundOn ? "1" : "0");
      if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
      soundBtn.textContent = soundOn ? "소리 켜짐" : "소리 꺼짐";
      sfx("toggle");
    };
    soundBtn.textContent = soundOn ? "소리 켜짐" : "소리 꺼짐";
  }
  $("btn-status").onclick = () => { renderStatus(); show("status"); };
  $("btn-status-back").onclick = () => { show("hub"); renderHub(); };
  $("btn-save").onclick = () => { save(); alert("저장했습니다."); };
  $("btn-sleep").onclick = () => {
    if (!sleepToNextDay()) {
      renderHub();
      sfx("click");
    }
  };
  $("btn-next").onclick = () => {
    if (awaitingChoice) return;
    sfx("tick");
    sceneIdx += 1;
    paintStep();
  };

  function maybePreviewCg() {
    try {
      const q = new URLSearchParams(location.search);
      const name = q.get("cg");
      if (!name) return false;
      const who = name.split("_")[0];
      const h = window.MC_HEROINES[who] ? who : "gaeun";
      startScene(
        [{
          who: h,
          text: "19+ CG 미리보기 · " + name,
          adult: true,
          img: "assets/cg/" + name + ".png",
          bg: q.get("bg") || "hotel",
        }],
        q.get("bg") || "hotel",
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  // boot — 탭 세션마다 암호
  let unlocked = false;
  try { unlocked = sessionStorage.getItem(SS_UNLOCK) === "1"; } catch (_) {}
  if (unlocked) {
    show("title");
    refreshContinue();
    renderCast();
    maybePreviewCg();
  } else {
    show("gate");
  }
})();
