/*! 공주 육성 — 시뮬레이션 엔진 */
window.PMEngine = (function () {
  "use strict";

  var D = function () { return window.PMData; };
  var SAVE_KEY = "princess_maker_v1";

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s.age !== "number") return null;
      return s;
    } catch (_) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  function applyEffects(state, effects, mult) {
    mult = mult == null ? 1 : mult;
    Object.keys(effects || {}).forEach(function (k) {
      var delta = Math.round(effects[k] * mult);
      if (state[k] == null) state[k] = 0;
      var hi = k === "gold" ? 99999 : (k === "stress" ? 100 : 999);
      state[k] = clamp(state[k] + delta, 0, hi);
    });
  }

  function availableActivities(state) {
    var acts = D().ACTIVITIES;
    return Object.keys(acts).map(function (k) { return acts[k]; }).filter(function (a) {
      return !a.minAge || state.age >= a.minAge;
    });
  }

  function combatPower(state) {
    return state.strength + state.sword + Math.floor(state.stamina / 4) + Math.floor(state.magic / 5);
  }

  function resolveActivity(state, actId) {
    var act = D().ACTIVITIES[actId];
    if (!act) return { ok: false, msg: "알 수 없는 활동" };

    var result = {
      ok: true,
      actId: actId,
      name: act.name,
      bg: act.bg,
      lines: [],
      deltas: {},
      failed: false,
      combat: null
    };

    if (act.cost && state.gold < act.cost) {
      return { ok: false, msg: "금화가 부족해요 (" + act.cost + "G 필요)" };
    }

    if (state.sick && act.cat !== "free") {
      result.failed = true;
      result.lines.push("몸이 아파서 제대로 할 수 없었어요…");
      state.stress = clamp(state.stress + 3, 0, 100);
      return result;
    }

    if (state.delinquent && Math.random() < 0.35 && act.cat !== "free" && act.cat !== "pet") {
      result.failed = true;
      result.lines.push("마음속이 복잡해서 도중에 딴짓을 해버렸어요.");
      state.stress = clamp(state.stress + 2, 0, 100);
      state.morality = clamp(state.morality - 1, 0, 999);
      return result;
    }

    if (act.cost) {
      state.gold -= act.cost;
      result.deltas.gold = (result.deltas.gold || 0) - act.cost;
      result.lines.push("수업비 " + act.cost + "G를 냈어요.");
    }

    var mult = 1;
    if (state.stress > 70) mult = 0.6;
    else if (state.stress > 50) mult = 0.8;

    if (act.tags && act.tags.indexOf("combat") !== -1) {
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
        state.repFight = clamp(state.repFight + 2, 0, 999);
      } else {
        result.failed = true;
        result.lines.push("힘이 모자라 후퇴했어요… (전투력 " + roll + "/" + diff + ")");
        state.stamina = clamp(state.stamina - 3, 0, 999);
        state.stress = clamp(state.stress + 6, 0, 100);
        result.deltas.stamina = -3;
      }
    } else {
      applyEffects(state, act.effects, mult);
      Object.keys(act.effects || {}).forEach(function (k) {
        result.deltas[k] = (result.deltas[k] || 0) + Math.round(act.effects[k] * mult);
      });
      if (act.gold) {
        var pay = randInt(act.gold[0], act.gold[1]);
        if (mult < 1) pay = Math.floor(pay * mult);
        state.gold += pay;
        result.deltas.gold = (result.deltas.gold || 0) + pay;
        result.lines.push("수고비로 " + pay + "G를 받았어요.");
      }
      result.lines.push(act.desc);
    }

    var stressDelta = act.stress || 0;
    if (stressDelta < 0 && state.sick) stressDelta = Math.floor(stressDelta * 0.5);
    state.stress = clamp(state.stress + stressDelta, 0, 100);
    result.deltas.stress = (result.deltas.stress || 0) + stressDelta;

    if (mult < 1 && !result.failed) {
      result.lines.push("피곤해서 효과가 조금 줄었어요.");
    }

    return result;
  }

  function updateAilments(state) {
    var notes = [];
    if (state.stress > state.stamina && !state.sick) {
      state.sick = true;
      notes.push("스트레스가 쌓여 몸이 아파졌어요.");
    } else if (state.stress < state.stamina * 0.5 && state.sick) {
      state.sick = false;
      notes.push("몸이 한결 나아졌어요.");
    }

    var moralGuard = Math.max(state.morality, state.faith);
    if (state.stress > moralGuard && !state.delinquent) {
      state.delinquent = true;
      notes.push("마음이 흐트러져 장난기가 늘었어요.");
    } else if (state.stress < moralGuard * 0.6 && state.delinquent) {
      state.delinquent = false;
      notes.push("다시 차분한 마음으로 돌아왔어요.");
    }
    return notes;
  }

  function resolveFestival(state, festId) {
    var fest = D().FESTIVAL[festId];
    if (!fest) return { ok: false, msg: "잘못된 행사" };
    var score = state[fest.skill] + state[fest.stat] + Math.floor(state.repSocial / 4) + randInt(-4, 6);
    var place = score >= 70 ? 1 : score >= 45 ? 2 : score >= 25 ? 3 : 4;
    var goldPrize = [0, 120, 70, 35, 10][place];
    state.gold += goldPrize;
    state[fest.rep] = clamp((state[fest.rep] || 0) + (5 - place) * 4, 0, 999);
    state[fest.skill] = clamp(state[fest.skill] + (5 - place), 0, 999);
    state.stress = clamp(state.stress + 8, 0, 100);
    state.festivalWins[festId] = Math.max(state.festivalWins[festId] || 0, place === 1 ? 1 : 0);
    var placeLabel = ["", "우승", "준우승", "입상", "참가"][place];
    return {
      ok: true,
      festId: festId,
      name: fest.name,
      bg: fest.bg,
      score: score,
      place: place,
      placeLabel: placeLabel,
      gold: goldPrize,
      toast: fest.toast,
      lines: [
        fest.desc,
        "심사 점수 " + score + "점 → " + placeLabel + "!",
        goldPrize ? ("상금 " + goldPrize + "G를 받았어요.") : "경험만으로도 충분해요."
      ]
    };
  }

  function advanceSeason(state) {
    state.season += 1;
    state.monthCount += 1;
    if (state.season >= 4) {
      state.season = 0;
      state.age += 1;
      state.yearIndex += 1;
      state.gold += 80;
      return { birthday: true, pension: 80 };
    }
    return { birthday: false };
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
    if (!state.delinquent) return { ok: false, msg: "지금은 야단칠 일이 없어요." };
    state.stress = clamp(state.stress - 8, 0, 100);
    state.morality = clamp(state.morality + 2, 0, 999);
    state.bond = clamp(state.bond - 2, 0, 999);
    if (state.stress < Math.max(state.morality, state.faith)) state.delinquent = false;
    return { ok: true, msg: "엄하게 타일렀어요. 스트레스가 조금 줄었어요." };
  }

  function pocketMoney(state, amount) {
    amount = amount || 20;
    if (state.gold < amount) return { ok: false, msg: "용돈으로 줄 금화가 부족해요." };
    state.gold -= amount;
    state.bond = clamp(state.bond + 3, 0, 999);
    state.stress = clamp(state.stress - 4, 0, 100);
    state.charisma = clamp(state.charisma + 1, 0, 999);
    return { ok: true, msg: "용돈 " + amount + "G를 건넸어요. 유대가 깊어졌어요." };
  }

  return {
    SAVE_KEY: SAVE_KEY,
    clamp: clamp,
    randInt: randInt,
    clone: clone,
    load: load,
    save: save,
    clearSave: clearSave,
    availableActivities: availableActivities,
    resolveActivity: resolveActivity,
    resolveFestival: resolveFestival,
    updateAilments: updateAilments,
    advanceSeason: advanceSeason,
    isGameOver: isGameOver,
    pickEnding: pickEnding,
    scold: scold,
    pocketMoney: pocketMoney,
    combatPower: combatPower,
    applyEffects: applyEffects
  };
})();
