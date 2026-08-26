/*! 공주 육성 — PM2 최종 엔진 */
window.PMEngine = (function () {
  "use strict";

  var D = function () { return window.PMData; };
  var SAVE_KEY = "princess_maker_v2";

  function clampNum(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(v) || 0));
  }

  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        // migrate v1 lightly
        raw = localStorage.getItem("princess_maker_v1");
        if (!raw) return null;
      }
      var s = JSON.parse(raw);
      if (!s || typeof s.age !== "number") return null;
      if (s.month == null && s.season != null) s.month = s.season * 3;
      if (!s.equip) s.equip = { weapon: null, armor: null, dress: null, helm: null };
      if (s.equip.helm === undefined) s.equip.helm = null;
      if (!s.inventory) s.inventory = [];
      if (s.sin == null) s.sin = 0;
      if (s.weight == null) s.weight = 40;
      if (s.defense == null) s.defense = 0;
      if (s.prince == null) s.prince = 0;
      if (!s.rivals) s.rivals = { rose: 12, lily: 12 };
      if (!s.jobRanks) s.jobRanks = {};
      if (!s.classRanks) s.classRanks = {};
      if (!s.yearFlags) s.yearFlags = {};
      if (s.engaged == null) s.engaged = false;
      if (s.delinquentCount == null) s.delinquentCount = 0;
      if (!s.blood) s.blood = "O";
      if (!s.diet) s.diet = "normal";
      if (s.cubeLove == null) s.cubeLove = 5;
      if (s.height == null) s.height = 130 + Math.max(0, (s.age || 10) - 10) * 4;
      if (s.fist == null) s.fist = 3;
      if (s.poetry == null) s.poetry = 3;
      if (s.science == null) s.science = 3;
      if (s.errantryWins == null) s.errantryWins = 0;
      if (s.birthdayMonth == null) s.birthdayMonth = 2;
      if (s.fatherBirthdayMonth == null) s.fatherBirthdayMonth = 5;
      return s;
    } catch (_) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem("princess_maker_v1");
    } catch (_) {}
  }

  function applyEffects(state, effects, mult) {
    mult = mult == null ? 1 : mult;
    Object.keys(effects || {}).forEach(function (k) {
      var delta = Math.round(effects[k] * mult);
      if (state[k] == null) state[k] = 0;
      var hi = 999;
      if (k === "gold") hi = 99999;
      if (k === "stress") hi = 100;
      if (k === "weight") hi = 80;
      state[k] = clampNum(state[k] + delta, k === "gold" || k === "sin" ? 0 : 0, hi);
    });
  }

  function equipBonuses(state) {
    var sum = {};
    ["weapon", "armor", "dress", "helm"].forEach(function (slot) {
      var id = state.equip && state.equip[slot];
      if (!id || !D().ITEMS[id]) return;
      var b = D().ITEMS[id].bonuses || {};
      Object.keys(b).forEach(function (k) {
        sum[k] = (sum[k] || 0) + b[k];
      });
    });
    return sum;
  }

  function effective(state, key) {
    var b = equipBonuses(state);
    return (state[key] || 0) + (b[key] || 0);
  }

  function combatPower(state) {
    return effective(state, "strength") + effective(state, "sword") +
      Math.floor(effective(state, "fist") / 2) +
      Math.floor(effective(state, "stamina") / 4) + Math.floor(effective(state, "magic") / 5) +
      (equipBonuses(state).defense || 0);
  }

  function setDiet(state, dietId) {
    var diet = D().DIETS[dietId];
    if (!diet) return { ok: false, msg: "없는 식단이에요." };
    state.diet = dietId;
    return { ok: true, msg: diet.name + "으로 바꿨어요." };
  }

  function dietLabel(state) {
    var d = D().DIETS[state.diet || "normal"];
    return d ? d.name : "보통 식사";
  }

  function bloodLabel(state) {
    var b = D().BLOOD[state.blood || "O"];
    return b ? b.label : "O형";
  }

  function availableActivities(state) {
    var acts = D().ACTIVITIES;
    return Object.keys(acts).map(function (k) { return acts[k]; }).filter(function (a) {
      if (a.minAge && state.age < a.minAge) return false;
      if (a.months && a.months.indexOf(state.month) === -1) return false;
      return true;
    });
  }

  function shopItems(shopId, state) {
    return Object.keys(D().ITEMS).map(function (k) { return D().ITEMS[k]; }).filter(function (it) {
      return it.shop === shopId && (!it.minAge || state.age >= it.minAge);
    });
  }

  function buyItem(state, itemId) {
    var it = D().ITEMS[itemId];
    if (!it) return { ok: false, msg: "없는 상품이에요." };
    if (it.minAge && state.age < it.minAge) return { ok: false, msg: "아직 어려서 살 수 없어요." };
    if (state.gold < it.cost) return { ok: false, msg: "금화가 부족해요." };
    state.gold -= it.cost;
    if (it.slot === "consumable") {
      state.inventory.push(itemId);
      return { ok: true, msg: it.name + "을(를) 가방에 넣었어요." };
    }
    // equipable: auto-equip, old goes to inventory as unequipped sell-back skip
    var prev = state.equip[it.slot];
    if (prev) state.inventory.push(prev);
    state.equip[it.slot] = itemId;
    return { ok: true, msg: it.name + "을(를) 장착했어요!" };
  }

  function useConsumable(state, index) {
    var id = state.inventory[index];
    var it = D().ITEMS[id];
    if (!it || it.slot !== "consumable") return { ok: false, msg: "사용할 수 없어요." };
    applyEffects(state, it.use || {});
    state.inventory.splice(index, 1);
    return { ok: true, msg: it.name + "을(를) 사용했어요." };
  }

  function donate(state, amount) {
    amount = amount || 30;
    if (state.gold < amount) return { ok: false, msg: "기부할 금화가 부족해요." };
    state.gold -= amount;
    state.sin = clampNum(state.sin - Math.ceil(amount / 15), 0, 999);
    state.faith = clampNum(state.faith + 2, 0, 999);
    state.morality = clampNum(state.morality + 1, 0, 999);
    return { ok: true, msg: amount + "G를 기부했어요. 마음이 가벼워져요." };
  }

  function healClinic(state) {
    if (!state.sick && !state.bedridden) return { ok: false, msg: "지금은 아프지 않아요." };
    var cost = state.bedridden ? 80 : 45;
    if (state.gold < cost) return { ok: false, msg: "치료비 " + cost + "G가 필요해요." };
    state.gold -= cost;
    state.sick = false;
    state.bedridden = false;
    state.stress = clampNum(state.stress - 15, 0, 100);
    state.stamina = clampNum(state.stamina + 5, 0, 999);
    return { ok: true, msg: "진료소에서 몸을 돌봤어요. (−" + cost + "G)" };
  }

  function visitPalace(state) {
    if (state.palaceUsedMonth === state.monthCount) {
      return { ok: false, msg: "이번 달에는 이미 왕궁에 갔어요." };
    }
    state.palaceUsedMonth = state.monthCount;
    var gain = 1 + Math.floor(effective(state, "refinement") / 20) + Math.floor(effective(state, "charisma") / 25);
    state.repSocial = clampNum(state.repSocial + gain, 0, 999);
    state.prince = clampNum(state.prince + (effective(state, "charisma") > 35 ? 2 : 0) + (effective(state, "refinement") > 40 ? 1 : 0), 0, 999);
    state.stress = clampNum(state.stress + 3, 0, 100);
    return {
      ok: true,
      msg: "왕궁에서 인사드렸어요. 사교 명성 +" + gain + (state.prince ? " · 왕자 호감 " + state.prince : "")
    };
  }

  function resolveActivity(state, actId) {
    var act = D().ACTIVITIES[actId];
    if (!act) return { ok: false, msg: "알 수 없는 활동" };

    var result = { ok: true, actId: actId, name: act.name, bg: act.bg, lines: [], deltas: {}, failed: false, combat: null };

    if (state.runaway) {
      result.failed = true;
      result.lines.push("이번 달은 가출 중이라 활동을 할 수 없어요…");
      return result;
    }
    if (state.bedridden && act.cat !== "free") {
      result.failed = true;
      result.lines.push("자리에 누워 있어 아무것도 할 수 없어요.");
      return result;
    }
    if (act.cost && state.gold < act.cost) {
      return { ok: false, msg: "금화가 부족해요 (" + act.cost + "G 필요)" };
    }
    if (state.sick && act.cat !== "free" && act.cat !== "pet") {
      result.failed = true;
      result.lines.push("몸이 아파서 제대로 할 수 없었어요…");
      state.stress = clampNum(state.stress + 3, 0, 100);
      return result;
    }
    if (state.delinquent && Math.random() < 0.32 && act.cat !== "free" && act.cat !== "pet") {
      result.failed = true;
      result.lines.push("장난기가 발동해 도중에 딴짓을 해버렸어요.");
      state.stress = clampNum(state.stress + 2, 0, 100);
      state.morality = clampNum(state.morality - 1, 0, 999);
      state.delinquentCount += 1;
      return result;
    }
    if (state.inLove && Math.random() < 0.2 && (act.cat === "study" || act.cat === "work")) {
      result.lines.push("연모에 빠져 집중이 흐트러졌어요…");
      // continue with reduced mult
    }

    if (act.cost) {
      state.gold -= act.cost;
      result.deltas.gold = -act.cost;
      result.lines.push("비용 " + act.cost + "G를 냈어요.");
    }

    var mult = 1;
    if (state.stress > 70) mult = 0.55;
    else if (state.stress > 50) mult = 0.75;
    if (state.inLove) mult *= 0.9;

    // job / class rank bonus
    if (act.cat === "work") {
      var rank = state.jobRanks[actId] || 0;
      mult *= 1 + rank * 0.08;
    }
    if (act.cat === "study") {
      var crank = state.classRanks[actId] || 0;
      mult *= 1 + crank * 0.07;
    }
    // special year modifiers
    if (state.yearFlags && state.yearFlags.war) {
      if (act.cat === "adventure" || (act.tags && act.tags.indexOf("combat") !== -1)) mult *= 1.12;
      if (act.cat === "study" && actId.indexOf("sword") === -1 && actId.indexOf("kungfu") === -1 && actId.indexOf("strategy") === -1) mult *= 0.92;
    }
    if (state.yearFlags && state.yearFlags.harvest) {
      if (act.cat === "work") mult *= 1.15;
      if (act.cat === "free" || act.cat === "pet") mult *= 1.05;
    }

    if (act.tags && act.tags.indexOf("errantry") !== -1) {
      var session = beginErrantry(state, act);
      result.needsErrantry = true;
      result.errantry = session;
      result.bg = session.bg;
      result.lines.push(session.zoneName + " 원정을 떠났어요. 구간마다 선택을 해요.");
      // stress paid upfront for the journey
      var stressDelta0 = act.stress || 0;
      state.stress = clampNum(state.stress + stressDelta0, 0, 100);
      result.deltas.stress = (result.deltas.stress || 0) + stressDelta0;
      Object.keys(state.rivals || {}).forEach(function (rid) {
        state.rivals[rid] = clampNum(state.rivals[rid] + randInt(0, 2), 0, 999);
      });
      return result;
    } else if (act.tags && act.tags.indexOf("combat") !== -1) {
      var power = combatPower(state);
      var diff = act.combat || 20;
      var roll = power + randInt(-5, 8);
      var win = roll >= diff;
      result.combat = { power: power, diff: diff, roll: roll, win: win };
      if (win) {
        result.lines.push("모험에서 위험을 이겨냈어요! (전투력 " + roll + "/" + diff + ")");
        applyEffects(state, act.effects, mult);
        Object.keys(act.effects || {}).forEach(function (k) {
          result.deltas[k] = (result.deltas[k] || 0) + Math.round(act.effects[k] * mult);
        });
        if (act.gold) {
          var g = randInt(act.gold[0], act.gold[1]);
          state.gold += g;
          result.deltas.gold = (result.deltas.gold || 0) + g;
          if (g) result.lines.push("전리품으로 " + g + "G를 얻었어요.");
        }
        state.repFight = clampNum(state.repFight + 2, 0, 999);
      } else {
        result.failed = true;
        result.lines.push("힘이 모자라 후퇴했어요… (전투력 " + roll + "/" + diff + ")");
        state.stamina = clampNum(state.stamina - 3, 0, 999);
        state.stress = clampNum(state.stress + 6, 0, 100);
        result.deltas.stamina = -3;
      }
    } else {
      applyEffects(state, act.effects, mult);
      Object.keys(act.effects || {}).forEach(function (k) {
        result.deltas[k] = (result.deltas[k] || 0) + Math.round(act.effects[k] * mult);
      });
      if (act.gold) {
        var pay = randInt(act.gold[0], act.gold[1]);
        var rank2 = state.jobRanks[actId] || 0;
        pay = Math.floor(pay * mult * (1 + rank2 * 0.12));
        // unpaid house work still "pays" 0
        state.gold += pay;
        result.deltas.gold = (result.deltas.gold || 0) + pay;
        if (pay > 0) result.lines.push("수고비로 " + pay + "G를 받았어요.");
        else result.lines.push("보수는 없지만 손이 익숙해져요.");
        var prevJob = state.jobRanks[actId] || 0;
        if (Math.random() < 0.38 && prevJob < 4) {
          state.jobRanks[actId] = prevJob + 1;
          result.lines.push("알바 숙련도가 " + (prevJob + 1) + "단계로 올랐어요!");
          result.rankUp = { type: "job", id: actId, level: prevJob + 1 };
        }
      }
      if (act.cat === "study" && !result.failed) {
        if (!state.classRanks) state.classRanks = {};
        var prevClass = state.classRanks[actId] || 0;
        if (Math.random() < 0.4 && prevClass < 4) {
          state.classRanks[actId] = prevClass + 1;
          result.lines.push("수업 숙련도가 " + (prevClass + 1) + "단계로 올랐어요!");
          result.rankUp = { type: "class", id: actId, level: prevClass + 1 };
          // small mastery perk
          state.intelligence = clampNum(state.intelligence + 1, 0, 999);
          result.deltas.intelligence = (result.deltas.intelligence || 0) + 1;
        }
      }
      result.lines.push(act.desc);
    }

    var stressDelta = act.stress || 0;
    if (stressDelta < 0 && state.sick) stressDelta = Math.floor(stressDelta * 0.5);
    state.stress = clampNum(state.stress + stressDelta, 0, 100);
    result.deltas.stress = (result.deltas.stress || 0) + stressDelta;
    if (mult < 1 && !result.failed) result.lines.push("컨디션 때문에 효과가 줄었어요.");

    // rival growth nudge
    Object.keys(state.rivals || {}).forEach(function (rid) {
      state.rivals[rid] = clampNum(state.rivals[rid] + randInt(0, 2), 0, 999);
    });

    return result;
  }

  function beginErrantry(state, act) {
    var zone = (D().ERRANTRY && D().ERRANTRY[act.zone]) || { name: act.name, bg: act.bg, diff: 28 };
    var steps = Math.max(2, act.steps || 3);
    return {
      actId: act.id,
      zoneId: act.zone,
      zoneName: zone.name,
      bg: zone.bg || act.bg || "camp",
      baseDiff: zone.diff || 28,
      stepIndex: 0,
      totalSteps: steps,
      goldTotal: 0,
      deltas: {},
      log: [],
      done: false,
      cleared: false,
      aborted: false
    };
  }

  function errantryPrompt(session) {
    var n = session.stepIndex + 1;
    var flavors = [
      "길이 좁아지고 수풀이 흔들려요. 무언가가 있어요.",
      "안개가 걷히며 낯선 실루엣이 나타나요.",
      "발밑에서 돌이 굴러떨어지고, 숨소리가 들려요.",
      "작은 불빛과 함께 누군가의 인기척이 나요."
    ];
    return n + "/" + session.totalSteps + "구간 · " + flavors[session.stepIndex % flavors.length];
  }

  function finalizeErrantryRewards(state, session) {
    if (session._finalized) return;
    session._finalized = true;
    if (session.goldTotal) {
      state.gold += session.goldTotal;
      session.deltas.gold = (session.deltas.gold || 0) + session.goldTotal;
      session.log.push("원정 수입 " + session.goldTotal + "G");
    }
    if (session.cleared) {
      state.errantryWins = (state.errantryWins || 0) + 1;
      state.stamina = clampNum(state.stamina + 2, 0, 999);
      state.repFight = clampNum(state.repFight + 2, 0, 999);
      session.deltas.repFight = (session.deltas.repFight || 0) + 2;
    }
  }

  function playErrantryStep(state, session, choice) {
    if (!session || session.done) return { ok: false, msg: "원정이 끝났어요." };
    var stepDiff = session.baseDiff + session.stepIndex * 4;
    var n = session.stepIndex + 1;
    var line = "";
    var ok = true;

    if (choice === "flee") {
      session.aborted = true;
      session.done = true;
      session.cleared = false;
      state.stress = clampNum(state.stress + 2, 0, 100);
      session.deltas.stress = (session.deltas.stress || 0) + 2;
      line = n + "구간: 도망쳐 돌아왔어요. 그래도 살아 있어요.";
      session.log.push(line);
      finalizeErrantryRewards(state, session);
      return { ok: true, line: line, done: true, cleared: false, prompt: null };
    }

    if (choice === "fight") {
      var roll = combatPower(state) + randInt(-6, 10) + Math.floor(effective(state, "fist") / 3);
      if (roll >= stepDiff) {
        line = n + "구간: 싸워서 이겼어요! (" + roll + "/" + stepDiff + ")";
        state.repFight = clampNum(state.repFight + 1, 0, 999);
        session.deltas.repFight = (session.deltas.repFight || 0) + 1;
        session.goldTotal += randInt(8, 22 + session.stepIndex * 6);
      } else {
        ok = false;
        line = n + "구간: 전투에서 밀려 후퇴했어요… (" + roll + "/" + stepDiff + ")";
        state.stamina = clampNum(state.stamina - 4, 0, 999);
        state.stress = clampNum(state.stress + 5, 0, 100);
        session.deltas.stamina = (session.deltas.stamina || 0) - 4;
        session.deltas.stress = (session.deltas.stress || 0) + 5;
        session.done = true;
        session.cleared = false;
        session.aborted = true;
      }
    } else if (choice === "talk") {
      var charm = effective(state, "charisma") + effective(state, "refinement") + randInt(-4, 8);
      if (charm >= stepDiff - 6) {
        line = n + "구간: 말로 풀어냈어요.";
        state.repSocial = clampNum(state.repSocial + 1, 0, 999);
        state.sensitivity = clampNum(state.sensitivity + 1, 0, 999);
        session.deltas.repSocial = (session.deltas.repSocial || 0) + 1;
        session.goldTotal += randInt(4, 14);
      } else {
        ok = false;
        line = n + "구간: 말이 통하지 않아 돌아왔어요…";
        state.stress = clampNum(state.stress + 3, 0, 100);
        session.deltas.stress = (session.deltas.stress || 0) + 3;
        session.done = true;
        session.cleared = false;
        session.aborted = true;
      }
    } else if (choice === "search") {
      var wit = effective(state, "intelligence") + effective(state, "magic") + randInt(-5, 8);
      if (wit >= stepDiff - 8) {
        line = n + "구간: 숨겨진 보물을 찾았어요!";
        session.goldTotal += randInt(15, 40 + session.stepIndex * 8);
        state.intelligence = clampNum(state.intelligence + 1, 0, 999);
        session.deltas.intelligence = (session.deltas.intelligence || 0) + 1;
      } else {
        ok = false;
        line = n + "구간: 함정에 걸려 상처만 입고 돌아왔어요…";
        state.stamina = clampNum(state.stamina - 3, 0, 999);
        state.stress = clampNum(state.stress + 4, 0, 100);
        session.deltas.stamina = (session.deltas.stamina || 0) - 3;
        session.deltas.stress = (session.deltas.stress || 0) + 4;
        session.done = true;
        session.cleared = false;
        session.aborted = true;
      }
    } else {
      return { ok: false, msg: "잘못된 선택이에요." };
    }

    session.log.push(line);
    if (!session.done) {
      session.stepIndex += 1;
      if (session.stepIndex >= session.totalSteps) {
        session.done = true;
        session.cleared = true;
        line += " 원정을 완수했어요!";
        session.log[session.log.length - 1] = line;
      }
    }
    if (session.done) finalizeErrantryRewards(state, session);
    return {
      ok: true,
      line: line,
      stepOk: ok,
      done: session.done,
      cleared: session.cleared,
      prompt: session.done ? null : errantryPrompt(session)
    };
  }

  function resolveErrantry(state, act) {
    var session = beginErrantry(state, act);
    while (!session.done) {
      var roll = Math.random();
      var choice = roll < 0.4 ? "fight" : roll < 0.7 ? "talk" : "search";
      playErrantryStep(state, session, choice);
    }
    return {
      cleared: session.cleared,
      bg: session.bg,
      encounters: session.log.map(function (t, i) { return { step: i + 1, text: t, ok: true }; }),
      summaryLines: session.log.slice(),
      deltas: session.deltas
    };
  }

  function unequip(state, slot) {
    if (!state.equip || !state.equip[slot]) return { ok: false, msg: "비어 있는 칸이에요." };
    var id = state.equip[slot];
    state.equip[slot] = null;
    state.inventory.push(id);
    var it = D().ITEMS[id];
    return { ok: true, msg: (it ? it.name : id) + "을(를) 가방으로 옮겼어요." };
  }

  function updateAilments(state) {
    var notes = [];
    if (state.stress > state.stamina) {
      if (!state.sick) {
        state.sick = true;
        notes.push("스트레스가 쌓여 몸이 아파졌어요.");
      } else if (state.stress > state.stamina + 25 && !state.bedridden) {
        state.bedridden = true;
        notes.push("병세가 깊어져 자리에 누웠어요. 진료소에 가 보세요.");
      }
    } else if (state.stress < state.stamina * 0.45) {
      if (state.bedridden || state.sick) notes.push("몸이 한결 나아졌어요.");
      state.sick = false;
      state.bedridden = false;
    }

    var moralGuard = Math.max(state.morality, state.faith);
    if (state.stress > moralGuard && !state.delinquent) {
      state.delinquent = true;
      notes.push("마음이 흐트러져 장난기가 늘었어요.");
    } else if (state.stress < moralGuard * 0.55 && state.delinquent) {
      state.delinquent = false;
      notes.push("다시 차분한 마음으로 돌아왔어요.");
    }

    // runaway (sensitivity peak)
    if (!state.runaway && state.sensitivity >= 50 && state.sensitivity >= state.charisma &&
        state.sensitivity >= state.intelligence && Math.random() < 0.08) {
      state.runaway = true;
      ["repFight", "repArt", "repSocial", "repScholar"].forEach(function (k) {
        state[k] = clampNum(state[k] - 3, 0, 999);
      });
      notes.push("감성이 넘쳐 잠시 가출해 버렸어요… 이번 달은 쉬게 둬야 해요.");
    } else if (state.runaway) {
      state.runaway = false;
      state.stress = clampNum(state.stress - 8, 0, 100);
      notes.push("아라가 집으로 돌아왔어요.");
    }

    // in love (age 14+)
    if (state.age >= 14 && !state.inLove && state.charisma >= 45 && state.charisma >= state.morality && Math.random() < 0.1) {
      state.inLove = true;
      notes.push("누군가에게 설레는 마음이 생겼어요.");
    } else if (state.inLove && Math.random() < 0.2) {
      state.inLove = false;
      notes.push("설렘이 잔잔한 우정으로 가라앉았어요.");
    }

    return notes;
  }

  function resolveFestival(state, festId) {
    var fest = D().FESTIVAL[festId];
    if (!fest) return { ok: false, msg: "잘못된 행사" };
    var score = effective(state, fest.skill) + effective(state, fest.stat) +
      Math.floor(effective(state, "repSocial") / 4) + randInt(-4, 6);
    // rival contest
    var rivalScore = 30 + state.age * 2 + randInt(0, 25);
    var place = score >= 75 ? 1 : score >= 50 ? 2 : score >= 28 ? 3 : 4;
    if (score < rivalScore && place === 1) place = 2;
    var goldPrize = [0, 150, 80, 40, 12][place];
    state.gold += goldPrize;
    state[fest.rep] = clampNum((state[fest.rep] || 0) + (5 - place) * 5, 0, 999);
    state[fest.skill] = clampNum(state[fest.skill] + (5 - place), 0, 999);
    state.stress = clampNum(state.stress + 8, 0, 100);
    if (place === 1) state.festivalWins[festId] = (state.festivalWins[festId] || 0) + 1;
    var placeLabel = ["", "우승", "준우승", "입상", "참가"][place];
    return {
      ok: true, festId: festId, name: fest.name, bg: fest.bg, score: score, rivalScore: rivalScore,
      place: place, placeLabel: placeLabel, gold: goldPrize, toast: fest.toast,
      lines: [
        fest.desc,
        "내 점수 " + score + " · 라이벌 " + rivalScore + " → " + placeLabel + "!",
        goldPrize ? ("상금 " + goldPrize + "G를 받았어요.") : "경험만으로도 충분해요."
      ]
    };
  }

  function advanceMonth(state) {
    var notes = [];
    var diet = D().DIETS[state.diet || "normal"] || D().DIETS.normal;
    if (diet) {
      if (state.gold >= diet.cost) {
        state.gold -= diet.cost;
        applyEffects(state, diet.effects || {});
        notes.push(diet.name + " (−" + diet.cost + "G)");
      } else {
        state.stress = clampNum(state.stress + 4, 0, 100);
        state.stamina = clampNum(state.stamina - 2, 0, 999);
        notes.push("식비를 못 내 배고파졌어요…");
      }
    }
    var blood = D().BLOOD[state.blood || "O"];
    if (blood && blood.monthly) applyEffects(state, blood.monthly);

    // height growth (cm per month, slows with age)
    var growth = state.age < 14 ? randInt(0, 1) : state.age < 16 ? (Math.random() < 0.55 ? 1 : 0) : (Math.random() < 0.25 ? 1 : 0);
    state.height = clampNum((state.height || 130) + growth, 120, 175);

    var birthdayParty = false;
    var fatherCake = false;
    if (state.month === (state.birthdayMonth != null ? state.birthdayMonth : 2)) {
      birthdayParty = true;
      state.bond = clampNum(state.bond + 3, 0, 999);
      state.stress = clampNum(state.stress - 6, 0, 100);
      if ((state.cubeLove || 0) >= 20 || state.bond >= 35) {
        fatherCake = true;
        state.cubeLove = clampNum((state.cubeLove || 0) + 2, 0, 999);
        state.bond = clampNum(state.bond + 2, 0, 999);
        notes.push("생일 케이크와 큐브의 축하가 있었어요!");
      } else {
        notes.push("아라의 생일을 작게 축하했어요.");
      }
    }
    if (state.month === (state.fatherBirthdayMonth != null ? state.fatherBirthdayMonth : 5)) {
      state.bond = clampNum(state.bond + 4, 0, 999);
      state.cubeLove = clampNum((state.cubeLove || 0) + 1, 0, 999);
      notes.push("아버지 생일에 마음을 전했어요.");
    }

    state.month += 1;
    state.monthCount += 1;
    state.weight = clampNum(state.weight + (state.diet === "robust" ? 1 : state.diet === "slim" ? -1 : (state.weight > 55 ? 0 : randInt(0, 1))), 20, 80);
    var out = { birthday: false, notes: notes, birthdayParty: birthdayParty, fatherCake: fatherCake, yearEvent: null, engagement: false };
    if (state.month >= 12) {
      state.month = 0;
      state.age += 1;
      state.gold += 120;
      out.birthday = true;
      out.pension = 120;
      // roll special year flavor for the new age year
      var seenWar = !!(state.yearFlags && state.yearFlags.warSeen);
      state.yearFlags = { war: false, harvest: false, warSeen: seenWar };
      if (state.age === 14 || state.age === 16) {
        state.yearFlags.war = true;
        state.yearFlags.warSeen = true;
        out.yearEvent = "war";
        notes.push("올해는 국경이 소란스럽습니다. 무예 활동이 빛나요.");
      } else if (state.age === 12 || state.age === 15 || Math.random() < 0.22) {
        state.yearFlags.harvest = true;
        out.yearEvent = "harvest";
        notes.push("풍년의 해예요. 알바 수입과 휴식이 풍성해져요.");
      }
    }
    // engagement check (calendar month end)
    if (!state.engaged && state.age >= 15 && (state.prince || 0) >= 28 && state.refinement >= 30 && state.charisma >= 30) {
      if (Math.random() < 0.18 || state.prince >= 40) {
        state.engaged = true;
        state.prince = clampNum(state.prince + 5, 0, 999);
        out.engagement = true;
        notes.push("왕자와 약혼 이야기가 오갔어요…");
      }
    }
    out.notes = notes;
    return out;
  }

  function isFestivalMonth(state) {
    return state.month === D().FESTIVAL_MONTH;
  }

  function isGameOver(state) {
    return state.age >= D().END_AGE;
  }

  function pickEnding(state) {
    var list = D().ENDINGS;
    for (var i = 0; i < list.length; i++) {
      if (list[i].need(state)) return list[i];
    }
    return list[list.length - 1];
  }

  function scold(state) {
    if (!state.delinquent && !state.inLove) return { ok: false, msg: "지금은 야단칠 일이 없어요." };
    state.stress = clampNum(state.stress - 8, 0, 100);
    state.morality = clampNum(state.morality + 2, 0, 999);
    state.bond = clampNum(state.bond - 2, 0, 999);
    if (state.stress < Math.max(state.morality, state.faith)) state.delinquent = false;
    if (state.inLove && state.bond > 25) state.inLove = false;
    return { ok: true, msg: "엄하게 타일렀어요. 스트레스가 조금 줄었어요." };
  }

  function pocketMoney(state, amount) {
    amount = amount || 20;
    if (state.gold < amount) return { ok: false, msg: "용돈으로 줄 금화가 부족해요." };
    state.gold -= amount;
    state.bond = clampNum(state.bond + 3, 0, 999);
    state.stress = clampNum(state.stress - 4, 0, 100);
    state.charisma = clampNum(state.charisma + 1, 0, 999);
    return { ok: true, msg: "용돈 " + amount + "G를 건넸어요. 유대가 깊어졌어요." };
  }

  function cubeTea(state) {
    state.stress = clampNum(state.stress - 6, 0, 100);
    state.cubeLove = clampNum((state.cubeLove || 0) + 2, 0, 999);
    state.bond = clampNum(state.bond + 1, 0, 999);
    return { ok: true, msg: "큐브와 차를 마셨어요. 스트레스 −6 · 큐브 신뢰 +2" };
  }

  function cubeGift(state) {
    var cost = 25;
    if (state.gold < cost) return { ok: false, msg: "선물할 금화가 부족해요." };
    state.gold -= cost;
    state.cubeLove = clampNum((state.cubeLove || 0) + 4, 0, 999);
    state.refinement = clampNum(state.refinement + 1, 0, 999);
    return { ok: true, msg: "큐브에게 작은 선물을 드렸어요. (−25G · 신뢰 +4)" };
  }

  function cubePraise(state) {
    state.cubeLove = clampNum((state.cubeLove || 0) + 1, 0, 999);
    state.morality = clampNum(state.morality + 1, 0, 999);
    state.stress = clampNum(state.stress - 2, 0, 100);
    return { ok: true, msg: "큐브의 노고를 칭찬했어요. 신뢰 +1" };
  }

  function cubeAdvice(state) {
    var tips = [];
    if (state.stress > 60) tips.push("스트레스가 높아요. 휴식이나 펫 돌보기를 넣어 주세요.");
    if (state.gold < 80) tips.push("금고가 얇아요. 알바나 탐험으로 수입을 보완하세요.");
    if (state.sick || state.bedridden) tips.push("몸이 좋지 않아요. 도시 → 진료소를 권합니다.");
    if (state.sin > 15) tips.push("죄업이 쌓였어요. 성당 기부가 도움이 됩니다.");
    if (isFestivalMonth(state)) tips.push("10월은 축제입니다. 자신 있는 종목에 도전하세요.");
    if (effective(state, "sword") < 20 && state.age >= 12) tips.push("검술이 낮으면 탐험이 위험해요. 검술 수업을 추천합니다.");
    if (state.repSocial < 15 && state.age >= 13) tips.push("사교 명성이 낮아요. 무용·예법·왕궁 알현을 노려보세요.");
    if ((state.fist || 0) < 15 && state.age >= 12) tips.push("격투 수업으로 전투력을 보완할 수 있어요.");
    if (state.diet === "slim" && state.stamina < 28) tips.push("다이어트 식단 중이에요. 체력이 너무 낮아지지 않게 주의하세요.");
    if ((state.errantryWins || 0) === 0 && state.age >= 12) tips.push("호수·사막 원정은 여러 구간을 넘는 긴 모험입니다.");
    if (state.yearFlags && state.yearFlags.war) tips.push("전쟁기운의 해입니다. 검술·병법·원정이 유리해요.");
    if (state.yearFlags && state.yearFlags.harvest) tips.push("풍년입니다. 알바와 휴식으로 기운을 돋우세요.");
    if (state.engaged) tips.push("약혼 중입니다. 품위와 매력을 유지하면 결혼 엔딩에 가까워져요.");
    if ((state.cubeLove || 0) < 20) tips.push("저와 차·대화로 신뢰를 쌓으면 생일과 엔딩에 도움이 됩니다.");
    if (!tips.length) {
      var focuses = [
        { k: "repFight", t: "무예 루트: 검술·탐험·시합" },
        { k: "repArt", t: "예술 루트: 미술·감성·전시회" },
        { k: "repSocial", t: "사교 루트: 무용·드레스·무도회" },
        { k: "repScholar", t: "학문 루트: 문학·마법·유적" }
      ];
      focuses.sort(function (a, b) { return (state[b.k] || 0) - (state[a.k] || 0); });
      tips.push("현재 성장세는 「" + focuses[0].t + "」 쪽에 가깝습니다.");
      tips.push("장비는 도시에서, 조언은 언제든 제게 물어보세요.");
    }
    return tips;
  }

  function rivalSnapshot(state) {
    return D().RIVALS.map(function (r) {
      var score = state.rivals[r.id] || 0;
      r.focus.forEach(function (f) { score += Math.floor(effective(state, f) * 0.15); });
      return { id: r.id, name: r.name, portrait: r.portrait, line: r.line, score: score, mine: effective(state, r.focus[0]) };
    });
  }

  return {
    SAVE_KEY: SAVE_KEY,
    clamp: clampNum,
    randInt: randInt,
    load: load,
    save: save,
    clearSave: clearSave,
    applyEffects: applyEffects,
    availableActivities: availableActivities,
    resolveActivity: resolveActivity,
    resolveFestival: resolveFestival,
    updateAilments: updateAilments,
    advanceMonth: advanceMonth,
    isFestivalMonth: isFestivalMonth,
    isGameOver: isGameOver,
    pickEnding: pickEnding,
    scold: scold,
    pocketMoney: pocketMoney,
    combatPower: combatPower,
    effective: effective,
    equipBonuses: equipBonuses,
    shopItems: shopItems,
    buyItem: buyItem,
    useConsumable: useConsumable,
    donate: donate,
    healClinic: healClinic,
    visitPalace: visitPalace,
    cubeAdvice: cubeAdvice,
    rivalSnapshot: rivalSnapshot,
    setDiet: setDiet,
    dietLabel: dietLabel,
    bloodLabel: bloodLabel,
    resolveErrantry: resolveErrantry,
    beginErrantry: beginErrantry,
    playErrantryStep: playErrantryStep,
    errantryPrompt: errantryPrompt,
    unequip: unequip,
    cubeTea: cubeTea,
    cubeGift: cubeGift,
    cubePraise: cubePraise
  };
})();
