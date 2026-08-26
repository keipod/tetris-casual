/**
 * 시나리오 이벤트 — 전원 성인(21+) 합의 로맨스.
 * scene: {who,text,bg?,adult?} | {choices:[{label,effects,next?}]}
 * effects: {aff:{id:n}, int,ath,cha,money,energy,flag,unflag,ending?}
 */
(function () {
  "use strict";

  function line(who, text, extra) {
    return Object.assign({ who: who || null, text }, extra || {});
  }
  function choices(list) {
    return { choices: list };
  }

  const E = [];

  // —— 한가은 (도서관) ——
  E.push({
    id: "gaeun_meet",
    place: "library",
    once: true,
    weight: 20,
    when: (s) => !s.flags.gaeun_met,
    scene: [
      line(null, "서가 사이에서 책이 미끄러진다. 무릎을 굽힌 여학생이 페이지를 줍는다."),
      line("gaeun", "…죄송해요. 제가 너무 높이 꽂아 둬서."),
      line(null, "안경 너머로 시선을 피한다. 명찰에는 ‘한가은 · 문예창작 2’."),
      choices([
        { label: "같이 꽂아 줄게요", effects: { aff: { gaeun: 8 }, flag: "gaeun_met" } },
        { label: "무슨 책이에요?", effects: { aff: { gaeun: 5 }, int: 1, flag: "gaeun_met" } },
        { label: "지나가기만 한다", effects: { flag: "gaeun_met", aff: { gaeun: 1 } } },
      ]),
      line("gaeun", "…고마워요. 여기, 자주 오나요?"),
    ],
  });

  E.push({
    id: "gaeun_poem",
    place: "library",
    once: true,
    weight: 12,
    when: (s) => s.flags.gaeun_met && (s.aff.gaeun || 0) >= 15 && !s.flags.gaeun_poem,
    scene: [
      line("gaeun", "이 구절… 누가 읽어도 자기 이야기 같다고 하겠죠."),
      line(null, "그녀가 내민 노트에는 아직 잉크가 젖어 있다."),
      choices([
        { label: "솔직해서 좋아요", effects: { aff: { gaeun: 10 }, flag: "gaeun_poem" } },
        { label: "조금 고쳐 볼까요?", effects: { aff: { gaeun: 6 }, int: 2, flag: "gaeun_poem" } },
      ]),
      line("gaeun", "당신한테만… 보여준 거예요. 이상하죠?"),
    ],
  });

  E.push({
    id: "gaeun_rain",
    place: "cafe",
    once: true,
    weight: 14,
    when: (s) => (s.aff.gaeun || 0) >= 35 && !s.flags.gaeun_rain,
    scene: [
      line(null, "빗소리가 유리창을 두드린다. 가은이 젖은 어깨를 닦으며 웃는다."),
      line("gaeun", "우산 없이 뛰었어요. 바보 같죠."),
      choices([
        { label: "수건 갖다줄게요", effects: { aff: { gaeun: 12 }, flag: "gaeun_rain" } },
        { label: "같이 젖은 셈 치죠", effects: { aff: { gaeun: 14 }, cha: 1, flag: "gaeun_rain" } },
      ]),
      line("gaeun", "…따뜻하네요. 말보다."),
    ],
  });

  E.push({
    id: "gaeun_date",
    place: "park",
    once: true,
    weight: 16,
    when: (s) => (s.aff.gaeun || 0) >= 50 && !s.flags.gaeun_date,
    scene: [
      line("gaeun", "산책… 하자고 한 건 처음이에요. 둘이서."),
      line(null, "벚꽃 향이 섞인 바람이 머리카락을 올린다. 그녀는 스물한 살의 봄을 고르는 중이다."),
      choices([
        { label: "손 잡아도 될까", effects: { aff: { gaeun: 15 }, flag: "gaeun_date" } },
        { label: "벤치에 앉아 이야기", effects: { aff: { gaeun: 12 }, flag: "gaeun_date" } },
      ]),
      line("gaeun", "졸업 전에… 당신 문장으로 남고 싶어요."),
    ],
  });

  E.push({
    id: "gaeun_intimate",
    place: "dorm",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.gaeun || 0) >= 70 && s.flags.gaeun_date && !s.flags.gaeun_intimate,
    scene: [
      line(null, "기숙사 복도는 고요하다. 가은이 초인종 대신 문자로 ‘문 열어줘’를 보낸다.", { adult: true, img: window.MC_CG("gaeun", "seduce") }),
      line("gaeun", "나… 스물한 살이야. 아이 취급하지 마. 오늘은 어른으로 있고 싶어.", { adult: true, img: window.MC_CG("gaeun", "seduce") }),
      line(null, "그녀가 먼저 입술을 맞춘다. 서툰 숨과 책 냄새, 따뜻한 살결이 겹친다.", { adult: true, img: window.MC_CG("gaeun", "nude") }),
      choices([
        {
          label: "천천히, 네가 원하는 만큼",
          effects: { aff: { gaeun: 20 }, flag: "gaeun_intimate", flag2: "route_gaeun" },
        },
        {
          label: "오늘은 안아주기만",
          effects: { aff: { gaeun: 12 }, flag: "gaeun_intimate" },
        },
      ]),
      line("gaeun", "…당신 심장 소리, 산문보다 정확하네.", { adult: true, bg: "hotel", img: window.MC_CG("gaeun", "sex") }),
      line(null, "이불 속에서 서로의 이름을 속삭인다. 합의된 밤, 성인 두 사람의 거리.", { adult: true, img: window.MC_CG("gaeun", "oral") }),
    ],
  });

  // —— 박소율 ——
  E.push({
    id: "soyul_meet",
    place: "gym",
    once: true,
    weight: 20,
    when: (s) => !s.flags.soyul_met,
    scene: [
      line("soyul", "야, 패스! …아, 외부인? 미안, 반사적으로."),
      line(null, "땀에 젖은 헤어밴드. 박소율, 체육과 3학년 · 22세."),
      choices([
        { label: "한 판 붙자", effects: { aff: { soyul: 8 }, ath: 2, flag: "soyul_met" } },
        { label: "물 좀 줄까", effects: { aff: { soyul: 10 }, flag: "soyul_met" } },
      ]),
      line("soyul", "오, 괜찮은데? 내일도 와. 주장 허락이야."),
    ],
  });

  E.push({
    id: "soyul_loss",
    place: "gym",
    once: true,
    weight: 12,
    when: (s) => s.flags.soyul_met && (s.aff.soyul || 0) >= 20 && !s.flags.soyul_loss,
    scene: [
      line("soyul", "졌어. 진짜. …웃지 마."),
      line(null, "그녀가 코트에 주저앉는다. 승부욕이 무너진 자리는 의외로 부드럽다."),
      choices([
        { label: "다음엔 이긴다 믿어", effects: { aff: { soyul: 12 }, flag: "soyul_loss" } },
        { label: "아이스크림 사줄게", effects: { aff: { soyul: 14 }, money: -3, flag: "soyul_loss" } },
      ]),
      line("soyul", "너한테 약한 거, 팀에선 비밀이다?"),
    ],
  });

  E.push({
    id: "soyul_rooftop",
    place: "rooftop",
    once: true,
    weight: 14,
    when: (s) => (s.aff.soyul || 0) >= 45 && !s.flags.soyul_roof,
    scene: [
      line("soyul", "운동 끝나면 여기 와. 바람 맞으면 머리가 맑아지거든."),
      choices([
        { label: "어깨에 기대도 돼?", effects: { aff: { soyul: 15 }, flag: "soyul_roof" } },
        { label: "같이 스트레칭", effects: { aff: { soyul: 10 }, ath: 2, flag: "soyul_roof" } },
      ]),
      line("soyul", "…너, 내 시즌에 들어온 이적생 같다."),
    ],
  });

  E.push({
    id: "soyul_intimate",
    place: "dorm",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.soyul || 0) >= 70 && s.flags.soyul_roof && !s.flags.soyul_intimate,
    scene: [
      line("soyul", "샤워하고 왔어. 문 잠가. 오늘은… 훈련 아니야.", { adult: true, img: window.MC_CG("soyul", "seduce") }),
      line(null, "운동으로 단단해진 몸과, 의외로 떨리는 숨. 스물두 살의 확고한 선택.", { adult: true, img: window.MC_CG("soyul", "nude") }),
      choices([
        {
          label: "원하는 페이스로 맞춰줄게",
          effects: { aff: { soyul: 20 }, flag: "soyul_intimate", flag2: "route_soyul" },
        },
        { label: "키스만 나누고 쉬자", effects: { aff: { soyul: 12 }, flag: "soyul_intimate" } },
      ]),
      line("soyul", "하아… 너한테 지는 건, 경기보다 좋다.", { adult: true, bg: "hotel", img: window.MC_CG("soyul", "sex") }),
    ],
  });

  // —— 정유하 ——
  E.push({
    id: "yuha_meet",
    place: "cafe",
    once: true,
    weight: 20,
    when: (s) => !s.flags.yuha_met,
    scene: [
      line("yuha", "주문은요— 어, 손님 옷에 물감. 제가 스쳤나 봐요. 미안!"),
      line(null, "앞치마에 아크릴이 묻은 정유하. 조형예술 2학년, 21세."),
      choices([
        { label: "작품의 일부라 치죠", effects: { aff: { yuha: 10 }, cha: 1, flag: "yuha_met" } },
        { label: "닦아줄게요", effects: { aff: { yuha: 8 }, flag: "yuha_met" } },
      ]),
      line("yuha", "야간 알바 끝나면 옥상에서 스케치해요. 몰래 와도 돼요."),
    ],
  });

  E.push({
    id: "yuha_sketch",
    place: "rooftop",
    once: true,
    weight: 13,
    when: (s) => s.flags.yuha_met && (s.aff.yuha || 0) >= 25 && !s.flags.yuha_sketch,
    scene: [
      line("yuha", "움직이지 마. …됐어. 당신 눈빛이 제일 어려워."),
      choices([
        { label: "나를 어떻게 그렸어?", effects: { aff: { yuha: 12 }, flag: "yuha_sketch" } },
        { label: "나도 너를 그리고 싶어", effects: { aff: { yuha: 15 }, cha: 2, flag: "yuha_sketch" } },
      ]),
      line("yuha", "전시회에 내기엔… 너무 사적인데."),
    ],
  });

  E.push({
    id: "yuha_intimate",
    place: "cafe",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.yuha || 0) >= 70 && s.flags.yuha_sketch && !s.flags.yuha_intimate,
    scene: [
      line(null, "마감 후 카페. 조명을 낮춘 구석, 캔버스와 이불이 겹친 비밀 공간.", { adult: true, img: window.MC_CG("yuha", "seduce") }),
      line("yuha", "모델료 대신… 키스로 받을게. 성인끼리의 계약이야.", { adult: true, img: window.MC_CG("yuha", "nude") }),
      choices([
        {
          label: "계약 성립",
          effects: { aff: { yuha: 20 }, flag: "yuha_intimate", flag2: "route_yuha" },
        },
        { label: "오늘은 스케치만", effects: { aff: { yuha: 10 }, flag: "yuha_intimate" } },
      ]),
      line(null, "물감 냄새와 체온. 서로의 윤곽을 손가락으로 고친다.", { adult: true, bg: "hotel", img: window.MC_CG("yuha", "sex") }),
    ],
  });

  // —— 최시은 ——
  E.push({
    id: "sieun_meet",
    place: "lab",
    once: true,
    weight: 18,
    when: (s) => !s.flags.sieun_met,
    scene: [
      line("sieun", "학부생은 출입 제한이에요. …조교 최시은입니다. 용건만 말하세요."),
      line(null, "랩코트 아래 단정한 셔츠. 석사 1년, 스물세 살."),
      choices([
        { label: "논문 자료 열람 부탁", effects: { aff: { sieun: 6 }, int: 2, flag: "sieun_met" } },
        { label: "야식 두고 갈게요", effects: { aff: { sieun: 10 }, flag: "sieun_met" } },
      ]),
      line("sieun", "…감사 인사만. 길지는 말아요."),
    ],
  });

  E.push({
    id: "sieun_overwork",
    place: "lab",
    slots: ["night"],
    once: true,
    weight: 14,
    when: (s) => s.flags.sieun_met && (s.aff.sieun || 0) >= 30 && !s.flags.sieun_over,
    scene: [
      line("sieun", "시계가 잘못됐나. 또 새벽이네."),
      choices([
        { label: "집에 데려다줄게요", effects: { aff: { sieun: 14 }, flag: "sieun_over" } },
        { label: "같이 정리하고 끝냅시다", effects: { aff: { sieun: 12 }, int: 2, flag: "sieun_over" } },
      ]),
      line("sieun", "당신은… 데이터처럼 예측이 안 되네요."),
    ],
  });

  E.push({
    id: "sieun_wine",
    place: "cafe",
    once: true,
    weight: 12,
    when: (s) => (s.aff.sieun || 0) >= 55 && !s.flags.sieun_wine,
    scene: [
      line("sieun", "오늘은 실험 말고 와인. 성인이니까, 괜찮죠?"),
      choices([
        { label: "건배 — 당신에게", effects: { aff: { sieun: 16 }, flag: "sieun_wine" } },
        { label: "취하면 책임질게요", effects: { aff: { sieun: 14 }, cha: 1, flag: "sieun_wine" } },
      ]),
      line("sieun", "연구실에선 못 하던 말… 여기선 해도 되나 봐요."),
    ],
  });

  E.push({
    id: "sieun_intimate",
    place: "lab",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.sieun || 0) >= 72 && s.flags.sieun_wine && !s.flags.sieun_intimate,
    scene: [
      line("sieun", "문 잠갔어요. 카메라는 끕니다. 이건… 논문에 안 적어요.", { adult: true, img: window.MC_CG("sieun", "seduce") }),
      line(null, "차가운 모니터 빛 아래, 스물세 살의 손가락이 넥타이를 푼다.", { adult: true, img: window.MC_CG("sieun", "nude") }),
      choices([
        {
          label: "서로를 실험하지 말자 — 느끼자",
          effects: { aff: { sieun: 22 }, flag: "sieun_intimate", flag2: "route_sieun" },
        },
        { label: "입맞춤으로 끝내자", effects: { aff: { sieun: 12 }, flag: "sieun_intimate" } },
      ]),
      line("sieun", "가설은… 당신과 있으면 숨이 가빠진다는 거.", { adult: true, bg: "hotel", img: window.MC_CG("sieun", "sex") }),
    ],
  });

  // —— 윤채린 ——
  E.push({
    id: "chaerin_meet",
    place: "council",
    once: true,
    weight: 18,
    when: (s) => !s.flags.chaerin_met,
    scene: [
      line("chaerin", "축제 부스 신청서, 글씨 이게 뭐야. 다시 써."),
      line(null, "학생회 배지. 윤채린, 경영 2학년 · 21세. 말끝이 날카롭다."),
      choices([
        { label: "당장 고쳐 올게", effects: { aff: { chaerin: 6 }, flag: "chaerin_met" } },
        { label: "같이 고칩시다, 간부님", effects: { aff: { chaerin: 9 }, cha: 1, flag: "chaerin_met" } },
      ]),
      line("chaerin", "…비꼬지 마. 이름은 채린이야."),
    ],
  });

  E.push({
    id: "chaerin_crack",
    place: "council",
    once: true,
    weight: 13,
    when: (s) => s.flags.chaerin_met && (s.aff.chaerin || 0) >= 28 && !s.flags.chaerin_crack,
    scene: [
      line(null, "야근 조명 아래, 스케줄러가 떨린다. 눈가가 붉다."),
      line("chaerin", "완벽한 척하는 거, 피곤해. …너한테만."),
      choices([
        { label: "완벽 안 해도 돼", effects: { aff: { chaerin: 16 }, flag: "chaerin_crack" } },
        { label: "내가 절반 맡을게", effects: { aff: { chaerin: 14 }, flag: "chaerin_crack" } },
      ]),
      line("chaerin", "싫으면 거절해. …거절 안 할 거지?"),
    ],
  });

  E.push({
    id: "chaerin_intimate",
    place: "council",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.chaerin || 0) >= 70 && s.flags.chaerin_crack && !s.flags.chaerin_intimate,
    scene: [
      line("chaerin", "회의 끝. 코드 뽑아. 오늘은 안건이 너야.", { adult: true, img: window.MC_CG("chaerin", "seduce") }),
      line(null, "책상 모서리에 앉은 스물한 살. 가시 같은 키스가 이내 무너진다.", { adult: true, img: window.MC_CG("chaerin", "nude") }),
      choices([
        {
          label: "네 페이스에 맞출게",
          effects: { aff: { chaerin: 20 }, flag: "chaerin_intimate", flag2: "route_chaerin" },
        },
        { label: "선만 지키며 안아준다", effects: { aff: { chaerin: 11 }, flag: "chaerin_intimate" } },
      ]),
      line("chaerin", "계획에 없던 변수… 최곤데.", { adult: true, bg: "hotel", img: window.MC_CG("chaerin", "sex") }),
    ],
  });

  // —— 레이나 ——
  E.push({
    id: "reina_meet",
    place: "music",
    once: true,
    weight: 18,
    when: (s) => !s.flags.reina_met,
    scene: [
      line(null, "연습실 문틈으로 재즈 프레이즈.  Pedal이 멈춘다."),
      line("reina", "Oh— 들어와도 돼. 나는 레이나. 교환학생, 스물둘."),
      choices([
        { label: "연주 더 들려줘", effects: { aff: { reina: 10 }, flag: "reina_met" } },
        { label: "박수", effects: { aff: { reina: 7 }, cha: 1, flag: "reina_met" } },
      ]),
      line("reina", "한국어 연습할 상대 구했는데… 운이 좋네."),
    ],
  });

  E.push({
    id: "reina_station",
    place: "station",
    slots: ["night"],
    once: true,
    weight: 14,
    when: (s) => s.flags.reina_met && (s.aff.reina || 0) >= 32 && !s.flags.reina_station,
    scene: [
      line("reina", "막차 놓치면 호텔이야. …농담. 기숙사 쪽이야."),
      choices([
        { label: "같이 기다리자", effects: { aff: { reina: 14 }, flag: "reina_station" } },
        { label: "택시 태워줄게", effects: { aff: { reina: 12 }, money: -8, flag: "reina_station" } },
      ]),
      line("reina", "귀국 전까지의 밤을, 너랑 나누고 싶어."),
    ],
  });

  E.push({
    id: "reina_intimate",
    place: "music",
    slots: ["night"],
    once: true,
    adult: true,
    weight: 25,
    when: (s) => (s.aff.reina || 0) >= 70 && s.flags.reina_station && !s.flags.reina_intimate,
    scene: [
      line("reina", "건반 덮을게. 오늘은 네 숨소리로 연주하자.", { adult: true, img: window.MC_CG("reina", "seduce") }),
      line(null, "방음벽 안의 열기. 스물두 살의 입술이 귀 끝에 닿는다.", { adult: true, img: window.MC_CG("reina", "nude") }),
      choices([
        {
          label: "마지막 계절을 가득 채우자",
          effects: { aff: { reina: 22 }, flag: "reina_intimate", flag2: "route_reina" },
        },
        { label: "천천히 키스만", effects: { aff: { reina: 12 }, flag: "reina_intimate" } },
      ]),
      line("reina", "번역 필요 없는 밤이네.", { adult: true, bg: "hotel", img: window.MC_CG("reina", "sex") }),
    ],
  });

  E.push({
    id: "gaeun_secret",
    place: "library",
    slots: ["evening"],
    once: true,
    weight: 11,
    when: (s) => (s.aff.gaeun || 0) >= 42 && s.flags.gaeun_poem && !s.flags.gaeun_secret,
    scene: [
      line("gaeun", "사실은… 공모전 원고를 당신 이야기처럼 쓰고 있어요."),
      line(null, "그녀는 스물한 살의 비밀을 페이지 가장자리에 접어 둔다."),
      choices([
        { label: "영감이 되어줄게", effects: { aff: { gaeun: 14 }, flag: "gaeun_secret" } },
        { label: "이름은 바꿔 줘", effects: { aff: { gaeun: 8 }, flag: "gaeun_secret" } },
      ]),
      line("gaeun", "엔딩은… 아직 정하지 못했어요."),
    ],
  });

  E.push({
    id: "soyul_injury",
    place: "cafeteria",
    once: true,
    weight: 11,
    when: (s) => (s.aff.soyul || 0) >= 38 && s.flags.soyul_loss && !s.flags.soyul_inj,
    scene: [
      line("soyul", "발목 삐었어. 주장인데 벤치행이라니."),
      choices([
        { label: "재활 코치 해줄게", effects: { aff: { soyul: 13 }, ath: 1, flag: "soyul_inj" } },
        { label: "이길 때까지 기다릴게", effects: { aff: { soyul: 15 }, flag: "soyul_inj" } },
      ]),
      line("soyul", "너 없으면 벤치가 더 길어질 뻔했다."),
    ],
  });

  E.push({
    id: "yuha_exhibit",
    place: "park",
    once: true,
    weight: 11,
    when: (s) => (s.aff.yuha || 0) >= 40 && s.flags.yuha_sketch && !s.flags.yuha_ex,
    scene: [
      line("yuha", "학과 전시회에 너를 넣을까 말까. 초상화인데… 눈이 너무 솔직해서."),
      choices([
        { label: "당당히 걸어", effects: { aff: { yuha: 14 }, cha: 1, flag: "yuha_ex" } },
        { label: "우리만의 버전으로", effects: { aff: { yuha: 16 }, flag: "yuha_ex" } },
      ]),
      line("yuha", "좋아요. 당신 전용 에디션."),
    ],
  });

  E.push({
    id: "sieun_mentor",
    place: "library",
    once: true,
    weight: 10,
    when: (s) => (s.aff.sieun || 0) >= 40 && s.flags.sieun_over && !s.flags.sieun_mentor,
    scene: [
      line("sieun", "학부 세미나 조교로 불러도 될까요. 보수는… 저녁 식사 정도로."),
      choices([
        { label: "영광이죠", effects: { aff: { sieun: 12 }, int: 3, flag: "sieun_mentor" } },
        { label: "식사부터 먼저", effects: { aff: { sieun: 15 }, flag: "sieun_mentor" } },
      ]),
      line("sieun", "스물셋의 제안은, 의외로 진지해요."),
    ],
  });

  E.push({
    id: "chaerin_rival",
    place: "lecture",
    once: true,
    weight: 10,
    when: (s) => (s.aff.chaerin || 0) >= 36 && s.flags.chaerin_crack && !s.flags.chaerin_rival,
    scene: [
      line("chaerin", "조별과제 점수, 너 때문에 깎일 뻔했어. …근데 발표는 너가 제일 낫더라."),
      choices([
        { label: "칭찬으로 들을게", effects: { aff: { chaerin: 12 }, cha: 2, flag: "chaerin_rival" } },
        { label: "같이 1등 하자", effects: { aff: { chaerin: 14 }, flag: "chaerin_rival" } },
      ]),
      line("chaerin", "라이벌 겸… 파트너. 복잡한 직함이야."),
    ],
  });

  E.push({
    id: "reina_song",
    place: "rooftop",
    once: true,
    weight: 11,
    when: (s) => (s.aff.reina || 0) >= 45 && s.flags.reina_station && !s.flags.reina_song,
    scene: [
      line("reina", "네 이름 넣은 데모 만들었어. 한국어 발음 연습용이기도 하고."),
      choices([
        { label: "한 소절 불러줘", effects: { aff: { reina: 15 }, flag: "reina_song" } },
        { label: "귀국 전에 라이브 하자", effects: { aff: { reina: 17 }, cha: 1, flag: "reina_song" } },
      ]),
      line("reina", "이 캠퍼스의 BGM은, 당분간 너야."),
    ],
  });

  // —— 공통/경쟁 ——
  E.push({
    id: "jealous_cafe",
    place: "cafe",
    once: true,
    weight: 8,
    when: (s) => {
      const top = Object.entries(s.aff || {}).sort((a, b) => b[1] - a[1]);
      return top.length >= 2 && top[0][1] >= 40 && top[1][1] >= 25 && !s.flags.jealous;
    },
    scene: [
      line(null, "카페 창가. 두 시선이 동시에 당신을 찾는다. 공기가 팽팽하다."),
      line(null, "누구의 이름을 먼저 부를지가, 앞으로의 계절을 가른다."),
      choices([
        { label: "둘 다 소중한 사람이야", effects: { cha: 2, flag: "jealous", aff: { gaeun: -2, soyul: -2, yuha: -2, sieun: -2, chaerin: -2, reina: -2 } } },
        { label: "지금은 혼자 있고 싶어", effects: { flag: "jealous" } },
      ]),
    ],
  });

  E.push({
    id: "festival_invite",
    place: "festival",
    once: true,
    weight: 30,
    when: (s) => s.day >= 19 && !s.flags.fest_talk,
    scene: [
      line(null, "축제가 코앞이다. 초청장이 여러 장 꽂힌다 — 손글씨마다 다른 향."),
      line(null, "졸업 전 마지막 밤. 누구와 불꽃 아래 설지는, 당신의 선택이다."),
      choices([{ label: "초청장을 모은다", effects: { flag: "fest_talk" } }]),
    ],
  });

  // 랜덤 소이벤트
  E.push({
    id: "random_study",
    place: "lecture",
    weight: 4,
    when: () => Math.random() < 0.45,
    scene: [
      line(null, "강의가 의외로 재미있다. 필기가 늘어난다."),
      choices([{ label: "집중한다", effects: { int: 3, energy: -8 } }]),
    ],
  });

  E.push({
    id: "random_parttime",
    place: "cafeteria",
    weight: 3,
    when: (s) => (s.money || 0) < 40,
    scene: [
      line(null, "식당 아르바이트 급구 공고. 한 타임 가능할까."),
      choices([
        { label: "일한다 (+돈)", effects: { money: 12, energy: -15, ath: 1 } },
        { label: "패스", effects: {} },
      ]),
    ],
  });

  window.MC_EVENTS = E;
})();
