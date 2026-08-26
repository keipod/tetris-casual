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
      if (!s.equip) s.equip = { weapon: null, armor: null, dress: null };
      if (!s.inventory) s.inventory = [];
      if (s.sin == null) s.sin = 0;
      if (s.weight == null) s.weight = 40;
      if (s.defense == null) s.defense = 0;
      if (s.prince == null) s.prince = 0;
      if (!s.rivals) s.rivals = { rose: 12, lily: 12 };
      if (!s.jobRanks) s.jobRanks = {};
      if (s.delinquentCount == null) s.delinquentCount = 0;
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
    ["weapon", "armor", "dress"].forEach(function (slot) {
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
      Math.floor(effective(state, "stamina") / 4) + Math.floor(effective(state, "magic") / 5) +
      (equipBonuses(state).defense || 0);
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

    // job rank bonus
    if (act.cat === "work") {
      var rank = state.jobRanks[actId] || 0;
      mult *= 1 + rank * 0.08;
    }

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
        state.gold += pay;
        result.deltas.gold = (result.deltas.gold || 0) + pay;
        result.lines.push("수고비로 " + pay + "G를 받았어요.");
        // rank up
        state.jobRanks[actId] = Math.min(4, (state.jobRanks[actId] || 0) + (Math.random() < 0.35 ? 1 : 0));
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
    state.month += 1;
    state.monthCount += 1;
    state.weight = clampNum(state.weight + (state.weight > 55 ? 0 : randInt(0, 1)), 20, 80);
    if (state.month >= 12) {
      state.month = 0;
      state.age += 1;
      state.gold += 120;
      return { birthday: true, pension: 120 };
    }
    return { birthday: false };
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

  function cubeAdvice(state) {
    var tips = [];
    if (state.stress > 60) tips.push("스트레스가 높아요. 휴식이나 펫 돌보기를 넣어 주세요.");
    if (state.gold < 80) tips.push("금고가 얇아요. 알바나 탐험으로 수입을 보완하세요.");
    if (state.sick || state.bedridden) tips.push("몸이 좋지 않아요. 도시 → 진료소를 권합니다.");
    if (state.sin > 15) tips.push("죄업이 쌓였어요. 성당 기부가 도움이 됩니다.");
    if (isFestivalMonth(state)) tips.push("10월은 축제입니다. 자신 있는 종목에 도전하세요.");
    if (effective(state, "sword") < 20 && state.age >= 12) tips.push("검술이 낮으면 탐험이 위험해요. 검술 수업을 추천합니다.");
    if (state.repSocial < 15 && state.age >= 13) tips.push("사교 명성이 낮아요. 무용·예법·왕궁 알현을 노려보세요.");
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
    rivalSnapshot: rivalSnapshot
  };
})();
