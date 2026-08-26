/*! 공주 육성 — 이벤트 VN 스크립트 (일상/파티/전쟁/예술/펫/수업) */
window.PMEvents = (function () {
  "use strict";

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** 활동 결과에 붙는 짧은 비네트 */
  function vignetteFor(actId, state, result) {
    var P = window.PMData.PORTRAIT;
    var pool = [];

    if (actId.indexOf("class_") === 0) {
      pool.push({
        speaker: "아라", portrait: P.ara,
        text: "선생님의 설명이 귀에 쏙쏙 들어와요. 오늘도 한 걸음 성장한 기분이에요."
      });
      pool.push({
        speaker: "리아 공주", portrait: P.ria,
        text: "\"같이 수업 들으니 더 재미있어! 다음에도 나랑 경쟁하자.\""
      });
    }
    if (actId.indexOf("job_") === 0) {
      pool.push({
        speaker: "아라", portrait: P.ara,
        text: "손님의 미소가 오늘의 월급보다 더 따뜻하게 느껴져요."
      });
    }
    if (actId.indexOf("adv_") === 0) {
      if (result && result.combat && result.combat.win) {
        pool.push({
          speaker: "아라", portrait: P.ara,
          text: "심장이 두근거려요. 두려웠지만, 끝까지 검을 놓지 않았어요."
        });
      } else {
        pool.push({
          speaker: "아라", portrait: P.ara,
          text: "오늘은 물러나는 것도 용기예요. 다음에 다시 도전할래요."
        });
      }
    }
    if (actId.indexOf("pet_") === 0) {
      if (actId.indexOf("puppy") !== -1 || actId === "pet_both") {
        pool.push({
          speaker: "몽실이", portrait: P.puppy,
          text: "왕왕! 꼬리가 헬리콥터처럼 돌아가요. 아라와 뛰는 시간이 제일 좋아요해요."
        });
      }
      if (actId.indexOf("kitten") !== -1 || actId === "pet_both") {
        pool.push({
          speaker: "냥이", portrait: P.kitten,
          text: "골골… 무릎 위에서 눈을 가늘게 감아요. 빗질 받는 게 세상에서 제일 좋아요한가 봐요."
        });
      }
    }
    if (actId.indexOf("free_") === 0) {
      pool.push({
        speaker: "아라", portrait: P.ara,
        text: "바람이 부드럽게 볼을 스쳐요. 쉬는 시간도 성장의 일부예요."
      });
    }

    if (!pool.length) {
      pool.push({
        speaker: "아라", portrait: P.ara,
        text: "오늘도 작은 하루가 차곡차곡 쌓여요."
      });
    }
    return pick(pool);
  }

  /** 계절 종료 시 랜덤 대형 이벤트 (선택지 포함 가능) */
  function seasonalEvent(state) {
    var P = window.PMData.PORTRAIT;
    var BG = window.PMData.BG;
    var season = window.PMData.SEASONS[state.season];
    var candidates = [];

    candidates.push({
      id: "daily_market",
      title: "마을의 장날",
      bg: "fountain",
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
      id: "party_invite",
      title: "초대의 편지",
      bg: "ballroom",
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
      id: "war_drill",
      title: "성벽의 훈련",
      bg: "festival",
      steps: [
        { speaker: "기사", portrait: P.bear, text: "\"왕국을 지키려면 연습이 필요하지. 오늘은 모의 전투다!\"" },
        {
          speaker: "아라", portrait: P.ara, text: "방패의 무게가 팔을 당기지만, 눈빛은 또렷해요.",
          choices: [
            { label: "앞장서서 돌격해요", effects: { strength: 3, sword: 3, stamina: -2, repFight: 3, stress: 6 }, nextNote: "함성이 성벽에 울려 퍼져요." },
            { label: "후방에서 전술을 짜요", effects: { intelligence: 3, sword: 1, repFight: 2, stress: 4 }, nextNote: "지휘봉 없이도 동료들이 귀를 기울여요." },
            { label: "의무병처럼 다친 친구를 도와요", effects: { morality: 3, faith: 2, cooking: 1, stress: 3 }, nextNote: "붕대보다 따뜻한 손길이 남아요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "art_night",
      title: "달빛 스케치",
      bg: "balcony",
      steps: [
        { speaker: "아라", portrait: P.ara, text: "발코니에 이젤을 세우고, 달빛을 물감에 풀어 넣어요." },
        {
          speaker: "아라", portrait: P.ara, text: "무엇을 그릴까요?",
          choices: [
            { label: "성을 수채화로", effects: { art: 4, refinement: 2, repArt: 2, stress: 3 }, nextNote: "성벽의 그림자가 캔버스에 남아요." },
            { label: "몽실이의 초상", effects: { art: 3, puppy: 4, sensitivity: 2, repArt: 1 }, nextNote: "꼬리 흔들림까지 담으려다 웃음이 나요." },
            { label: "추상적인 별무리", effects: { art: 3, magic: 2, sensitivity: 3, repArt: 2 }, nextNote: "점들이 별자리를 속삭여요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "pet_trouble",
      title: "사라진 방울",
      bg: "garden",
      steps: [
        { speaker: "냥이", portrait: P.kitten, text: "냐아… 목에 달던 방울이 없어요. 초조한 눈이 아리를 올려다봐요." },
        { speaker: "몽실이", portrait: P.puppy, text: "멍! 정원 쪽으로 코를 킁킁거려요." },
        {
          speaker: "아라", portrait: P.ara, text: "함께 찾아볼까요?",
          choices: [
            { label: "정원부터 살살이 찾아요", effects: { puppy: 5, kitten: 5, stamina: 1, sensitivity: 1 }, nextNote: "장미덤불 아래 방울이 반짝!" },
            { label: "리아에게 도움을 청해요", effects: { bond: 1, kitten: 3, repSocial: 1 }, nextNote: "리아의 날카로운 눈이 실마리를 찾아요." },
            { label: "새 방울을 만들어 줘요", effects: { art: 2, kitten: 6, gold: -5 }, nextNote: "수제 방울에 냥이가 골골거려요." }
          ]
        }
      ]
    });

    candidates.push({
      id: "rainy_study",
      title: "비 오는 독서",
      bg: "rainy",
      steps: [
        { speaker: "아라", portrait: P.ara, text: "창문에 빗줄기가 그어요. 무릎 위 책이 포근한 등불이 되어 줘요." },
        {
          speaker: "아라", portrait: P.ara, text: "어떤 책을 펼칠까요?",
          choices: [
            { label: "모험 소설", effects: { intelligence: 2, sword: 1, sensitivity: 1 }, nextNote: "페이지 속 검이 반짝여요." },
            { label: "시와 별자리", effects: { faith: 2, magic: 1, sensitivity: 2 }, nextNote: "빗소리와 운율이 겹쳐요." },
            { label: "요리책", effects: { cooking: 3, intelligence: 1 }, nextNote: "배에서 꼬르륵, 웃음이 나요." }
          ]
        }
      ]
    });

    if (season === "가을") {
      candidates.push({
        id: "pre_festival",
        title: "축제 준비의 밤",
        bg: "dusk",
        steps: [
          { speaker: "아라", portrait: P.ara, text: "가을 축제가 다가와요. 등불이 하나씩 켜지고, 가슴이 두근거려요." },
          {
            speaker: "아버지", portrait: P.ria, text: "\"네가 원하는 무대로 서렴. 나는 항상 응원할게.\"",
            choices: [
              { label: "검에 기름을 칠해요", effects: { sword: 2, bond: 2 }, nextNote: "칼날이 달빛을 머금어요." },
              { label: "드레스 자락을 손질해요", effects: { dance: 2, refinement: 2, bond: 1 }, nextNote: "자수가 손끝에서 피어나요." },
              { label: "펫들과 일찍 잠들어요", effects: { stress: -6, puppy: 3, kitten: 3, bond: 1 }, nextNote: "따뜻한 숨결이 이불을 채워요." }
            ]
          }
        ]
      });
    }

    if (state.puppy >= 50 && state.kitten >= 50) {
      candidates.push({
        id: "pet_parade",
        title: "귀여움 행진",
        bg: "meadow",
        steps: [
          { speaker: "몽실이", portrait: P.puppy, text: "왕왕! 꽃길 행진의 선두예요." },
          { speaker: "냥이", portrait: P.kitten, text: "도도하게 뒤따르지만, 걸음은 흥겨워요." },
          {
            speaker: "아라", portrait: P.ara, text: "마을 아이들이 박수를 쳐요!",
            choices: [
              { label: "함께 행진의 주인공이 돼요", effects: { charisma: 3, puppy: 4, kitten: 4, repSocial: 2 }, nextNote: "오늘따라 꼬리도 깃발 같아요." },
              { label: "조용히 스케치해요", effects: { art: 3, sensitivity: 2, repArt: 2 }, nextNote: "스케치북에 발자국이 남아요." }
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
        { speaker: "아라", portrait: P.ara, text: fest.desc + " 심호흡을 하고, 무대 위로 올라가요." }
      ]
    };
  }

  return {
    vignetteFor: vignetteFor,
    seasonalEvent: seasonalEvent,
    festivalIntro: festivalIntro
  };
})();
