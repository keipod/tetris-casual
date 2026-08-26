/**
 * 추가 시나리오 — 위기·여운·축제 고백·공통 비트
 * (events.js 뒤에 로드)
 */
(function () {
  "use strict";
  const E = window.MC_EVENTS;
  if (!E) return;

  function line(who, text, extra) {
    return Object.assign({ who: who || null, text }, extra || {});
  }
  function choices(list) {
    return { choices: list };
  }

  // —— Day milestones ——
  E.push({
    id: "day7_midterm",
    place: "lecture",
    once: true,
    weight: 22,
    when: (s) => s.day >= 7 && s.day <= 9 && !s.flags.day7,
    scene: [
      line(null, "중간고사 주간. 복도에서 한숨과 에너지드링크 냄새가 뒤섞인다."),
      choices([
        { label: "도서관으로 직행 (+학력)", effects: { int: 6, energy: -10, flag: "day7" } },
        { label: "같이 공부할 사람 찾는다 (+매력)", effects: { cha: 4, flag: "day7" } },
        { label: "체력으로 버틴다 (+체력)", effects: { ath: 5, energy: -8, flag: "day7" } },
      ]),
      line(null, "시험은 결국 혼자 치르지만, 그 전후의 밤이 관계를 바꾼다."),
    ],
  });

  E.push({
    id: "day14_break",
    place: "park",
    once: true,
    weight: 20,
    when: (s) => s.day >= 14 && s.day <= 16 && !s.flags.day14,
    scene: [
      line(null, "학기 중반의 짧은 휴식. 누가 먼저 메시지를 보낼지 저울질하는 오후."),
      choices([
        { label: "가은에게 안부를", effects: { aff: { gaeun: 8 }, flag: "day14" } },
        { label: "소율에게 운동 제안", effects: { aff: { soyul: 8 }, flag: "day14" } },
        { label: "유하에게 전시 소식", effects: { aff: { yuha: 8 }, flag: "day14" } },
        { label: "시은에게 논문 응원", effects: { aff: { sieun: 8 }, flag: "day14" } },
        { label: "채린에게 축제 도움", effects: { aff: { chaerin: 8 }, flag: "day14" } },
        { label: "레이나에게 데모 요청", effects: { aff: { reina: 8 }, flag: "day14" } },
      ]),
    ],
  });

  // —— Aftermath / deepen intimate ——
  E.push({
    id: "gaeun_morning",
    place: "cafeteria",
    slots: ["morning"],
    once: true,
    weight: 18,
    when: (s) => s.flags.gaeun_intimate && !s.flags.gaeun_morning,
    scene: [
      line("gaeun", "…어제 일은, 소설에 안 넣을게요. 우리만의 초고로 둘래요."),
      line(null, "스물한 살이 건네는 따뜻한 우유. 손가락이 잠깐 겹친다."),
      choices([
        { label: "계속 쓰고 싶은 이야기다", effects: { aff: { gaeun: 12 }, flag: "gaeun_morning", flag2: "route_gaeun" } },
        { label: "부담 갖지 마", effects: { aff: { gaeun: 6 }, flag: "gaeun_morning" } },
      ]),
    ],
  });

  E.push({
    id: "soyul_morning",
    place: "gym",
    slots: ["morning", "afternoon"],
    once: true,
    weight: 18,
    when: (s) => s.flags.soyul_intimate && !s.flags.soyul_morning,
    scene: [
      line("soyul", "몸풀기 전에 말할게. 너랑 있으면 심박이 워밍업을 건너뛰어."),
      choices([
        { label: "오늘도 파트너로", effects: { aff: { soyul: 12 }, ath: 2, flag: "soyul_morning", flag2: "route_soyul" } },
        { label: "비밀로 둘까?", effects: { aff: { soyul: 8 }, flag: "soyul_morning" } },
      ]),
      line("soyul", "비밀은 싫고, 자랑은 아직 일러. 그 중간."),
    ],
  });

  E.push({
    id: "yuha_morning",
    place: "cafe",
    once: true,
    weight: 18,
    when: (s) => s.flags.yuha_intimate && !s.flags.yuha_morning,
    scene: [
      line("yuha", "캔버스에 네 쇄골 라인을 남겼어. 전시 금지작."),
      choices([
        { label: "나만 보게 해줘", effects: { aff: { yuha: 12 }, flag: "yuha_morning", flag2: "route_yuha" } },
        { label: "언젠가 공개해도", effects: { aff: { yuha: 9 }, cha: 1, flag: "yuha_morning" } },
      ]),
    ],
  });

  E.push({
    id: "sieun_morning",
    place: "lab",
    once: true,
    weight: 18,
    when: (s) => s.flags.sieun_intimate && !s.flags.sieun_morning,
    scene: [
      line("sieun", "재현 실험은 불필요해요. 한 번으로 유의했습니다."),
      line(null, "스물세 살의 귀가 살짝 붉다. 데이터보다 솔직하다."),
      choices([
        { label: "추가 실험 신청", effects: { aff: { sieun: 14 }, flag: "sieun_morning", flag2: "route_sieun" } },
        { label: "논문에 집중하자", effects: { aff: { sieun: 7 }, int: 2, flag: "sieun_morning" } },
      ]),
    ],
  });

  E.push({
    id: "chaerin_morning",
    place: "council",
    once: true,
    weight: 18,
    when: (s) => s.flags.chaerin_intimate && !s.flags.chaerin_morning,
    scene: [
      line("chaerin", "스케줄러에 ‘너’라고만 적혀 있어. 보안 위반이지."),
      choices([
        { label: "공식 일정으로 올려", effects: { aff: { chaerin: 13 }, flag: "chaerin_morning", flag2: "route_chaerin" } },
        { label: "비공개로 남기자", effects: { aff: { chaerin: 10 }, flag: "chaerin_morning" } },
      ]),
    ],
  });

  E.push({
    id: "reina_morning",
    place: "music",
    once: true,
    weight: 18,
    when: (s) => s.flags.reina_intimate && !s.flags.reina_morning,
    scene: [
      line("reina", "귀국 티켓이 확정됐어. …그래서 더, 지금이 중요해."),
      choices([
        { label: "거리와 상관없이 이어가자", effects: { aff: { reina: 14 }, flag: "reina_morning", flag2: "route_reina" } },
        { label: "남은 날을 밀도 있게", effects: { aff: { reina: 12 }, flag: "reina_morning", flag2: "route_reina" } },
      ]),
      line("reina", "좋아. 이 계절의 코러스는 너야."),
    ],
  });

  // —— Crisis beats ——
  E.push({
    id: "gaeun_block",
    place: "library",
    once: true,
    weight: 15,
    when: (s) => (s.aff.gaeun || 0) >= 55 && s.flags.gaeun_date && !s.flags.gaeun_intimate && !s.flags.gaeun_block,
    scene: [
      line("gaeun", "당신 옆에 다른 이름이 보이면… 저는 책을 덮을지도 몰라요."),
      choices([
        { label: "네 이야기만 읽을게", effects: { aff: { gaeun: 10 }, flag: "gaeun_block" } },
        { label: "조금 시간이 필요해", effects: { aff: { gaeun: -4 }, flag: "gaeun_block" } },
      ]),
    ],
  });

  E.push({
    id: "soyul_block",
    place: "gym",
    once: true,
    weight: 14,
    when: (s) => (s.aff.soyul || 0) >= 55 && s.flags.soyul_roof && !s.flags.soyul_intimate && !s.flags.soyul_block,
    scene: [
      line("soyul", "애매한 패스 싫어. 사귈 거야, 말 거야."),
      choices([
        { label: "사귀자", effects: { aff: { soyul: 14 }, flag: "soyul_block", flag2: "soyul_dating" } },
        { label: "지금은 준비 운동", effects: { aff: { soyul: 4 }, flag: "soyul_block" } },
      ]),
    ],
  });

  E.push({
    id: "chaerin_block",
    place: "cafeteria",
    once: true,
    weight: 14,
    when: (s) => (s.aff.chaerin || 0) >= 55 && s.flags.chaerin_crack && !s.flags.chaerin_intimate && !s.flags.chaerin_block,
    scene: [
      line("chaerin", "학생회 커플 스캔들 싫거든. 들키면 네가 수습해."),
      choices([
        { label: "들켜도 책임질게", effects: { aff: { chaerin: 12 }, flag: "chaerin_block" } },
        { label: "비밀 연애로", effects: { aff: { chaerin: 10 }, flag: "chaerin_block" } },
      ]),
    ],
  });

  // —— Festival confessions (day 20–21) ——
  function fest(id, name, needFlag, routeFlag) {
    E.push({
      id: "fest_" + id,
      place: "festival",
      once: true,
      weight: 40,
      when: (s) =>
        s.day >= 20 &&
        (s.aff[id] || 0) >= 65 &&
        s.flags[needFlag] &&
        !s.flags["fest_" + id],
      scene: [
        line(null, "폭죽이 밤하늘을 가른다. " + name + "이/가 전설의 은행나무 앞에서 기다린다."),
        line(id, "여기… 졸업 전에 고백하면 이루어진단 나무야. 미신이어도 좋아."),
        choices([
          {
            label: "네가 내 대답이다",
            effects: { aff: { [id]: 20 }, flag: "fest_" + id, flag2: routeFlag },
          },
          {
            label: "아직 확신이…",
            effects: { aff: { [id]: -8 }, flag: "fest_" + id },
          },
        ]),
        line(id, "알겠어. 이 밤의 온도는… 기록해 둘게."),
      ],
    });
  }
  fest("gaeun", "한가은", "gaeun_date", "route_gaeun");
  fest("soyul", "박소율", "soyul_roof", "route_soyul");
  fest("yuha", "정유하", "yuha_sketch", "route_yuha");
  fest("sieun", "최시은", "sieun_wine", "route_sieun");
  fest("chaerin", "윤채린", "chaerin_crack", "route_chaerin");
  fest("reina", "레이나", "reina_station", "route_reina");

  // —— Second adult scenes (hotel date) ——
  E.push({
    id: "gaeun_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 20,
    when: (s) => s.flags.gaeun_intimate && (s.aff.gaeun || 0) >= 85 && s.money >= 15 && !s.flags.gaeun_hotel,
    scene: [
      line("gaeun", "역 앞 호텔… 창피하지만, 기숙사보다 우리만의 문장이에요.", { adult: true, img: window.MC_CG("gaeun", "seduce") }),
      choices([
        {
          label: "방을 잡는다 (-₩15)",
          effects: { money: -15, aff: { gaeun: 18 }, flag: "gaeun_hotel", flag2: "route_gaeun" },
        },
        { label: "오늘은 돌아가자", effects: { aff: { gaeun: 5 }, flag: "gaeun_hotel" } },
      ]),
      line(null, "커튼을 닫은 뒤, 서로를 천천히 읽는다. 성인 두 사람의 합의된 밤.", { adult: true, bg: "hotel", img: window.MC_CG("gaeun", "oral") }),
      line("gaeun", "…다음 장도, 같이 써 줄래요?", { adult: true, img: window.MC_CG("gaeun", "sex") }),
    ],
  });

  E.push({
    id: "sieun_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 18,
    when: (s) => s.flags.sieun_intimate && (s.aff.sieun || 0) >= 85 && s.money >= 15 && !s.flags.sieun_hotel,
    scene: [
      line("sieun", "학회 출장용으로 잡아 둔 방이에요. 빈방이 아까워서… 핑계죠.", { adult: true, img: window.MC_CG("sieun", "seduce") }),
      choices([
        {
          label: "핑계라도 고맙다 (-₩15)",
          effects: { money: -15, aff: { sieun: 18 }, flag: "sieun_hotel", flag2: "route_sieun" },
        },
        { label: "연구실로 돌아가자", effects: { aff: { sieun: 4 }, flag: "sieun_hotel" } },
      ]),
      line("sieun", "가설은 이미 기각. 당신은 변수 아니라 상수예요.", { adult: true, bg: "hotel", img: window.MC_CG("sieun", "oral") }),
      line(null, "모니터 대신 체온. 스물세 살의 실험은 재현 가능하다.", { adult: true, img: window.MC_CG("sieun", "sex") }),
    ],
  });

  E.push({
    id: "reina_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 18,
    when: (s) => s.flags.reina_intimate && (s.aff.reina || 0) >= 85 && s.money >= 15 && !s.flags.reina_hotel,
    scene: [
      line("reina", "막차 놓친 척할래? 귀국 전 마지막 앙코르.", { adult: true, img: window.MC_CG("reina", "seduce") }),
      choices([
        {
          label: "앙코르 받자 (-₩15)",
          effects: { money: -15, aff: { reina: 20 }, flag: "reina_hotel", flag2: "route_reina" },
        },
        { label: "기숙사로", effects: { aff: { reina: 5 }, flag: "reina_hotel" } },
      ]),
      line(null, "도시 네온이 창에 어른거린다. 언어를 건너뛴 손짓만 남는다.", { adult: true, bg: "hotel", img: window.MC_CG("reina", "oral") }),
      line("reina", "번역기 꺼. 몸만 남기자.", { adult: true, img: window.MC_CG("reina", "sex") }),
    ],
  });

  E.push({
    id: "soyul_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 18,
    when: (s) => s.flags.soyul_intimate && (s.aff.soyul || 0) >= 85 && s.money >= 15 && !s.flags.soyul_hotel,
    scene: [
      line("soyul", "운동 끝나고 샤워할 곳. 기숙사 공용보다 호텔이 낫지.", { adult: true, img: window.MC_CG("soyul", "seduce") }),
      choices([
        { label: "체크인한다 (-₩15)", effects: { money: -15, aff: { soyul: 18 }, flag: "soyul_hotel", flag2: "route_soyul" } },
        { label: "오늘은 스쿼트만", effects: { aff: { soyul: 4 }, flag: "soyul_hotel" } },
      ]),
      line(null, "젖은 머리카락, 더 젖은 숨. 스물두 살의 페이스는 전력질주.", { adult: true, bg: "hotel", img: window.MC_CG("soyul", "oral") }),
      line("soyul", "하아… 세트 추가. 반칙 허용.", { adult: true, img: window.MC_CG("soyul", "sex") }),
    ],
  });

  E.push({
    id: "yuha_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 18,
    when: (s) => s.flags.yuha_intimate && (s.aff.yuha || 0) >= 85 && s.money >= 15 && !s.flags.yuha_hotel,
    scene: [
      line("yuha", "캔버스 말고 흰 시트 위에서 그리고 싶어. 모델은 나.", { adult: true, img: window.MC_CG("yuha", "seduce") }),
      choices([
        { label: "방을 연다 (-₩15)", effects: { money: -15, aff: { yuha: 18 }, flag: "yuha_hotel", flag2: "route_yuha" } },
        { label: "스케치북으로 돌아가자", effects: { aff: { yuha: 5 }, flag: "yuha_hotel" } },
      ]),
      line(null, "물감 대신 침. 스물한 살의 누드는 전시 금지작.", { adult: true, bg: "hotel", img: window.MC_CG("yuha", "nude") }),
      line("yuha", "서명 대신 키스. 중첩 레이어.", { adult: true, img: window.MC_CG("yuha", "sex") }),
    ],
  });

  E.push({
    id: "chaerin_hotel",
    place: "station",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 18,
    when: (s) => s.flags.chaerin_intimate && (s.aff.chaerin || 0) >= 85 && s.money >= 15 && !s.flags.chaerin_hotel,
    scene: [
      line("chaerin", "학생회 법인카드는 안 돼. 네 카드로 잡아. 오늘 안건은 비공개.", { adult: true, img: window.MC_CG("chaerin", "seduce") }),
      choices([
        { label: "결제한다 (-₩15)", effects: { money: -15, aff: { chaerin: 18 }, flag: "chaerin_hotel", flag2: "route_chaerin" } },
        { label: "회의 종료", effects: { aff: { chaerin: 4 }, flag: "chaerin_hotel" } },
      ]),
      line(null, "블레이저가 바닥으로 진다. 스물한 살의 일정표가 하얗게 비워진다.", { adult: true, bg: "hotel", img: window.MC_CG("chaerin", "oral") }),
      line("chaerin", "다음 안건… 한 번 더.", { adult: true, img: window.MC_CG("chaerin", "sex") }),
    ],
  });

  function roughEvent(id, place, open, mid, close) {
    E.push({
      id: id + "_rough",
      place: place,
      slots: ["night"],
      once: true,
      adult: true,
      weight: 16,
      when: (s) =>
        s.flags[id + "_intimate"] &&
        (s.aff[id] || 0) >= 80 &&
        !s.flags[id + "_rough"],
      scene: [
        line(id, open, { adult: true, img: window.MC_CG(id, "seduce") }),
        choices([
          {
            label: "거칠게, 네가 원하는 대로",
            effects: { aff: { [id]: 16 }, flag: id + "_rough" },
          },
          {
            label: "천천히 하자",
            effects: { aff: { [id]: 8 }, flag: id + "_rough" },
          },
        ]),
        line(null, mid, { adult: true, bg: "hotel", img: window.MC_CG(id, "rough") }),
        line(id, close, { adult: true, img: window.MC_CG(id, "sex") }),
      ],
    });
  }
  roughEvent(
    "gaeun", "dorm",
    "오늘은… 소설처럼 잡아줘. 스물한 살이 허락하는 과격함이야.",
    "손목이 베개 위로 고정된다. 숨이 문장보다 짧아진다.",
    "…엔딩은, 당신이 정해요."
  );
  roughEvent(
    "soyul", "gym",
    "반칙 한 번 허용. 벽에 밀어붙여. 난 스물둘이야, 부서지지 않아.",
    "락커 문에 등이 닿는다. 땀과 숨이 뒤섞인다.",
    "하… 이 세트, 기록으로 남긴다."
  );
  roughEvent(
    "yuha", "cafe",
    "이젤을 치워. 나를 캔버스처럼 눌러줘. 성인 계약, 조항 추가.",
    "카페 테이블 모서리. 물감 대신 손톱 자국.",
    "이 구도… 다시 그려야겠어. 더 가까이."
  );
  roughEvent(
    "sieun", "lab",
    "가설: 통제를 풀면 더 정확하다. 스물셋의 실험, 강도 올려요.",
    "실험대에 허리가 눌린다. 모니터 빛 아래의 거친 호흡.",
    "유의수준… 이미 넘었어요."
  );
  roughEvent(
    "chaerin", "council",
    "오늘은 내가 의자야. 아니, 네가 밀어. 코드는 뽑았어.",
    "책상 위 서류가 흩어진다. 가시 돋친 입술이 이빨로 변한다.",
    "회의록엔 남기지 마. 몸에는 남겨."
  );
  roughEvent(
    "reina", "music",
    "포르테. 페달 밟고 거칠게. 스물둘의 마지막 계절이니까.",
    "피아노 덮개에 등이 닿는다. 건반 대신 신음.",
    "앙코르… 더 세게."
  );

  // phone / dorm morning tips
  E.push({
    id: "dorm_phone",
    place: "dorm",
    slots: ["morning"],
    weight: 6,
    when: (s) => s.day > 2 && Math.random() < 0.35,
    scene: [
      line(null, "잠금 화면에 알림이 쌓여 있다."),
      choices([
        { label: "가은의 짧은 시", effects: { aff: { gaeun: 3 } } },
        { label: "소율의 아침 런 인증", effects: { aff: { soyul: 3 } } },
        { label: "유하의 팔레트 셀카", effects: { aff: { yuha: 3 } } },
        { label: "시은의 논문 링크", effects: { aff: { sieun: 3 }, int: 1 } },
        { label: "채린의 일정 리마인드", effects: { aff: { chaerin: 3 } } },
        { label: "레이나의 보이스 메모", effects: { aff: { reina: 3 } } },
      ]),
    ],
  });
})();
