/*! 공주 육성 — 확장 이벤트 (일상/파티/전쟁/예술/펫/수업/라이벌/Cube) */
window.PMEvents = (function () {
  "use strict";

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function vignetteFor(actId, state, result) {
    var P = window.PMData.PORTRAIT;
    var pool = [];
    if (actId.indexOf("class_") === 0) {
      pool.push({ speaker: "아라", portrait: P.ara, text: "선생님의 설명이 귀에 쏙쏙 들어와요. 오늘도 한 걸음 성장한 기분이에요." });
      pool.push({ speaker: "큐브", portrait: P.cube, text: "\"기초를 단단히 다지는 자세, 훌륭합니다, 아가씨.\"" });
      pool.push({ speaker: "리아 공주", portrait: P.ria, text: "\"같이 수업 들으니 더 재미있어! 다음에도 나랑 경쟁하자.\"" });
    }
    if (actId.indexOf("job_") === 0) {
      pool.push({ speaker: "아라", portrait: P.ara, text: "손님의 미소가 오늘의 월급보다 더 따뜻하게 느껴져요." });
      pool.push({ speaker: "로즈", portrait: P.rivalRose, text: "\"흥, 나도 여기서 일해 본 적 있어. 네가 더 잘하면… 인정해 줄게.\"" });
    }
    if (actId.indexOf("adv_") === 0) {
      if (result && result.combat && result.combat.win) {
        pool.push({ speaker: "아라", portrait: P.ara, text: "심장이 두근거려요. 두려웠지만, 끝까지 검을 놓지 않았어요." });
      } else {
        pool.push({ speaker: "아라", portrait: P.ara, text: "오늘은 물러나는 것도 용기예요. 다음에 다시 도전할래요." });
      }
    }
    if (actId.indexOf("pet_") === 0) {
      if (actId.indexOf("puppy") !== -1 || actId === "pet_both") {
        pool.push({ speaker: "몽실이", portrait: P.puppy, text: "왕왕! 꼬리가 헬리콥터처럼 돌아가요." });
      }
      if (actId.indexOf("kitten") !== -1 || actId === "pet_both") {
        pool.push({ speaker: "냥이", portrait: P.kitten, text: "골골… 빗질 받는 게 세상에서 제일 좋아요." });
      }
    }
    if (actId.indexOf("free_") === 0) {
      pool.push({ speaker: "아라", portrait: P.ara, text: "바람이 부드럽게 볼을 스쳐요. 쉬는 시간도 성장의 일부예요." });
      pool.push({ speaker: "큐브", portrait: P.cube, text: "\"휴식도 계획입니다. 몸과 마음이 다시 숨을 쉬겠군요.\"" });
    }
    if (!pool.length) pool.push({ speaker: "아라", portrait: P.ara, text: "오늘도 작은 하루가 차곡차곡 쌓여요." });
    return pick(pool);
  }

  function monthlyEvent(state) {
    var P = window.PMData.PORTRAIT;
    var month = state.month;
    var candidates = [];

    candidates.push({
      id: "daily_market", title: "마을의 장날", bg: "fountain",
      steps: [
        { speaker: "아라", portrait: P.ara, text: "장터에 파스텔 천막이 늘어서 있어요. 고소한 빵 냄새가 길을 안내해요." },
        {
          speaker: "상인", portrait: P.ria, text: "\"예쁜 리본 하나 어때요? 아니면 몽실이 간식?\"",
          choices: [
            { label: "리본을 사요 (15G)", needGold: 15, effects: { gold: -15, charisma: 2, refinement: 1 }, nextNote: "리본이 햇살에 반짝여요." },
            { label: "간식을 사요 (10G)", needGold: 10, effects: { gold: -10, puppy: 5, kitten: 5 }, nextNote: "두 친구가 동시에 달려와요!" },
            { label: "그냥 구경만 해요", effects: { sensitivity: 1 }, nextNote: "구경만으로도 마음이 풍성해져요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "party_invite", title: "초대의 편지", bg: "ballroom",
      steps: [
        { speaker: "리아 공주", portrait: P.ria, text: "\"이번 주말, 작은 다과 파티에 와 줄래? 드레스 코드는 별빛!\"" },
        {
          speaker: "아라", portrait: P.ara, text: "초대장의 금박이 손가락에 차갑게 느껴져요. 어떻게 할까요?",
          choices: [
            { label: "기쁘게 참석해요", effects: { charisma: 3, dance: 2, refinement: 2, repSocial: 3, stress: 4 }, nextNote: "파티에서 웃음꽃이 피어요." },
            { label: "정중히 사양하고 집에서 쉬어요", effects: { stress: -8, bond: 1 }, nextNote: "조용한 저녁이 오히려 달콤해요." },
            { label: "요리 선물을 준비해 가요", effects: { cooking: 2, bond: 1, repSocial: 2, stress: 3 }, nextNote: "리아가 케이크를 보고 박수를 쳐요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "war_drill", title: "성벽의 훈련", bg: "festival",
      steps: [
        { speaker: "기사", portrait: P.bear, text: "\"왕국을 지키려면 연습이 필요하지. 오늘은 모의 전투다!\"" },
        {
          speaker: "아라", portrait: P.ara, text: "방패의 무게가 팔을 당기지만, 눈빛은 또렷해요.",
          choices: [
            { label: "앞장서서 돌격해요", effects: { strength: 3, sword: 3, stamina: -2, repFight: 3, stress: 6 }, nextNote: "함성이 성벽에 울려 퍼져요." },
            { label: "후방에서 전술을 짜요", effects: { intelligence: 3, sword: 1, repFight: 2, stress: 4 }, nextNote: "동료들이 귀를 기울여요." },
            { label: "다친 친구를 도와요", effects: { morality: 3, faith: 2, cooking: 1, stress: 3 }, nextNote: "붕대보다 따뜻한 손길이 남아요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "art_night", title: "달빛 스케치", bg: "balcony",
      steps: [
        { speaker: "아라", portrait: P.ara, text: "발코니에 이젤을 세우고, 달빛을 물감에 풀어 넣어요." },
        {
          speaker: "릴리", portrait: P.rivalLily, text: "\"붓질이 꽤 침착하네. 나랑 전시회에서 겨뤄볼래?\"",
          choices: [
            { label: "성을 수채화로", effects: { art: 4, refinement: 2, repArt: 2, stress: 3 }, nextNote: "성벽의 그림자가 캔버스에 남아요." },
            { label: "몽실이의 초상", effects: { art: 3, puppy: 4, sensitivity: 2, repArt: 1 }, nextNote: "꼬리 흔들림까지 담으려다 웃음이 나요." },
            { label: "추상적인 별무리", effects: { art: 3, magic: 2, sensitivity: 3, repArt: 2 }, nextNote: "점들이 별자리를 속삭여요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "pet_trouble", title: "사라진 방울", bg: "garden",
      steps: [
        { speaker: "냥이", portrait: P.kitten, text: "냐아… 목에 달던 방울이 없어요." },
        { speaker: "몽실이", portrait: P.puppy, text: "멍! 정원 쪽으로 코를 킁킁거려요." },
        {
          speaker: "아라", portrait: P.ara, text: "함께 찾아볼까요?",
          choices: [
            { label: "정원부터 살살이", effects: { puppy: 5, kitten: 5, stamina: 1, sensitivity: 1 }, nextNote: "장미덤불 아래 방울이 반짝!" },
            { label: "리아에게 도움", effects: { bond: 1, kitten: 3, repSocial: 1 }, nextNote: "리아가 실마리를 찾아요." },
            { label: "새 방울을 만들어요", effects: { art: 2, kitten: 6, gold: -5 }, nextNote: "수제 방울에 냥이가 골골거려요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "cube_tea", title: "큐브의 티타임", bg: "cube",
      steps: [
        { speaker: "큐브", portrait: P.cube, text: "\"아가씨, 차 한 잔 하시지요. 요즘 페이스를 점검해 보았습니다.\"" },
        {
          speaker: "큐브", portrait: P.cube, text: pick(window.PMEngine.cubeAdvice(state)),
          choices: [
            { label: "조언을 새겨들어요", effects: { intelligence: 1, bond: 1, stress: -3 }, nextNote: "따뜻한 차향이 마음을 정리해 줘요." },
            { label: "오늘은 마음 가는 대로", effects: { sensitivity: 2, stress: -2 }, nextNote: "큐브가 살짝 웃으며 고개를 끄덕여요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "rival_spar", title: "라이벌의 도전장", bg: "meadow",
      steps: [
        { speaker: "로즈", portrait: P.rivalRose, text: "\"잠깐! 검술로 한 판 붙자. 지는 쪽이 디저트 쏘기!\"" },
        {
          speaker: "아라", portrait: P.ara, text: "로즈의 눈이 불타올라요.",
          choices: [
            { label: "정정당당 대련", effects: { sword: 3, strength: 2, stress: 5, repFight: 2 }, nextNote: "땀이 빛나지만 웃음도 함께예요." },
            { label: "미술로 맞대응 제안", effects: { art: 2, charisma: 2, repArt: 1 }, nextNote: "로즈가 투덜대며도 이젤을 받아요." },
            { label: "디저트를 먼저 사 줘요", needGold: 20, effects: { gold: -20, morality: 2, bond: 1, cooking: 1 }, nextNote: "싸움보다 케이크가 먼저예요." }
          ]
        }
      ]
    });

    if (state.age >= 14) {
      candidates.push({
        id: "prince_garden", title: "왕자의 정원 산책", bg: "garden",
        steps: [
          { speaker: "왕자", portrait: P.prince, text: "\"우연히 마주쳤네. 잠깐 꽃길을 같이 걸을래?\"" },
          {
            speaker: "아라", portrait: P.ara, text: "볼이 살짝 뜨거워져요.",
            choices: [
              { label: "기쁘게 함께 걸어요", effects: { prince: 5, charisma: 2, refinement: 1, stress: 2 }, nextNote: "꽃향기보다 대화가 길게 남아요." },
              { label: "정중히 사양해요", effects: { morality: 2, prince: 1 }, nextNote: "왕자가 미소로 이해해 줘요." },
              { label: "펫들을 소개해요", effects: { prince: 3, puppy: 3, kitten: 2, sensitivity: 1 }, nextNote: "왕자가 몽실이 머리를 쓰다듬어요." }
            ]
          }
        ]
      });
    }

    if (month === 9) {
      candidates.push({
        id: "pre_festival", title: "축제 준비의 밤", bg: "dusk",
        steps: [
          { speaker: "아라", portrait: P.ara, text: "가을 축제가 코앞이에요. 등불이 하나씩 켜져요." },
          {
            speaker: "큐브", portrait: P.cube, text: "\"어떤 무대를 고르시든, 저는 기록을 남기겠습니다.\"",
            choices: [
              { label: "검에 기름을 칠해요", effects: { sword: 2, bond: 2 }, nextNote: "칼날이 달빛을 머금어요." },
              { label: "드레스 자락을 손질해요", effects: { dance: 2, refinement: 2, bond: 1 }, nextNote: "자수가 손끝에서 피어나요." },
              { label: "펫들과 일찍 잠들어요", effects: { stress: -6, puppy: 3, kitten: 3, bond: 1 }, nextNote: "따뜻한 숨결이 이불을 채워요." }
            ]
          }
        ]
      });
    }

    if (month >= 11 || month <= 1) {
      candidates.push({
        id: "snow_day", title: "첫눈의 아침", bg: "snow",
        steps: [
          { speaker: "아라", portrait: P.ara, text: "창밖이 하얗게 숨 쉬어요. 성정이 설탕을 뿌린 듯해요." },
          {
            speaker: "몽실이", portrait: P.puppy, text: "왕! 눈밭으로 뛰어가고 싶어 안달이에요.",
            choices: [
              { label: "눈사람을 만들어요", effects: { sensitivity: 2, stamina: 1, stress: -5, puppy: 3 }, nextNote: "당근 코가 살짝 기울어요." },
              { label: "따뜻한 코코아를 타요", effects: { cooking: 2, stress: -8, bond: 2 }, nextNote: "김이 안경에 서려요… 큐브의 안경도." }
            ]
          }
        ]
      });
    }

    if (month >= 2 && month <= 4) {
      candidates.push({
        id: "spring_fair", title: "봄맞이 장터", bg: "spring_fair",
        steps: [
          { speaker: "아라", portrait: P.ara, text: "벚꽃 아래에서 깃발이 흔들려요. 봄 축제의 준비가 한창이에요." },
          {
            speaker: "릴리", portrait: P.rivalLily, text: "\"꽃장식 대결할래? 지는 쪽은 시를 한 수!\"" ,
            choices: [
              { label: "꽃장식에 도전", effects: { art: 3, refinement: 2, repArt: 2 }, nextNote: "화환이 봄바람과 춤춰요." },
              { label: "시를 먼저 써 버려요", effects: { intelligence: 2, sensitivity: 3, repScholar: 1 }, nextNote: "릴리가 박수를 쳐 줘요." }
            ]
          }
        ]
      });
    }

    if (state.puppy >= 50 && state.kitten >= 50) {
      candidates.push({
        id: "pet_parade", title: "귀여움 행진", bg: "meadow",
        steps: [
          { speaker: "몽실이", portrait: P.puppy, text: "왕왕! 꽃길 행진의 선두예요." },
          { speaker: "냥이", portrait: P.kitten, text: "도도하게 뒤따르지만, 걸음은 흥겨워요." },
          {
            speaker: "아라", portrait: P.ara, text: "마을 아이들이 박수를 쳐요!",
            choices: [
              { label: "행진의 주인공", effects: { charisma: 3, puppy: 4, kitten: 4, repSocial: 2 }, nextNote: "오늘따라 꼬리도 깃발 같아요." },
              { label: "조용히 스케치", effects: { art: 3, sensitivity: 2, repArt: 2 }, nextNote: "스케치북에 발자국이 남아요." }
            ]
          }
        ]
      });
    }

    return pick(candidates);
  }

  function festivalIntro(festId) {
    var fest = window.PMData.FESTIVAL[festId];
    var P = window.PMData.PORTRAIT;
    return {
      id: "fest_" + festId,
      title: fest.name,
      bg: fest.bg,
      steps: [
        { speaker: "사회자", portrait: P.ria, text: "가을 축제의 " + fest.name + "가 시작됐어요! 아라 공주의 이름을 불러요." },
        { speaker: "로즈", portrait: P.rivalRose, text: "\"나도 나간다? 최선을 다하자!\"" },
        { speaker: "아라", portrait: P.ara, text: fest.desc + " 심호흡을 하고, 무대 위로 올라가요." }
      ]
    };
  }

  return { vignetteFor: vignetteFor, monthlyEvent: monthlyEvent, seasonalEvent: monthlyEvent, festivalIntro: festivalIntro };
})();
