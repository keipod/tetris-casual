/*! 공주 육성 — 활동·스탯·엔딩 데이터 (PM2 지향 Phase 1) */
window.PMData = (function () {
  "use strict";

  var BG = {
    castle: "assets/bg/castle.png",
    garden: "assets/bg/garden.png",
    forest: "assets/bg/forest.png",
    meadow: "assets/bg/meadow.png",
    dressroom: "assets/bg/dressroom.png",
    kitchen: "assets/bg/kitchen.png",
    library: "assets/bg/library.png",
    tower: "assets/bg/tower.png",
    fountain: "assets/bg/fountain.png",
    dusk: "assets/bg/dusk.png",
    ballroom: "assets/bg/ballroom.png",
    heart: "assets/bg/heart.png",
    wander: "assets/bg/wander.png",
    balcony: "assets/bg/balcony.png",
    fireplace: "assets/bg/fireplace.png",
    parlor: "assets/bg/parlor.png",
    attic: "assets/bg/attic.png",
    greenhouse: "assets/bg/greenhouse.png",
    candle: "assets/bg/candle_tea.png",
    rain: "assets/bg/rain_garden.png",
    rainy: "assets/bg/rainy_window.png",
    lantern: "assets/bg/lantern_path.png",
    firefly: "assets/bg/firefly.png",
    mushroom: "assets/bg/mushroom.png",
    festival: "assets/bg/festival.png",
    wish: "assets/bg/wish_tree.png",
    stream: "assets/bg/stream.png",
    gazebo: "assets/bg/music_gazebo.png"
  };

  var PORTRAIT = {
    ara: "assets/portraits/princess1.jpg",
    ria: "assets/portraits/princess2.jpg",
    puppy: "assets/portraits/puppy.png",
    kitten: "assets/portraits/kitten.png",
    bear: "assets/portraits/bear.png",
    sheep: "assets/portraits/sheep.png"
  };

  var SEASONS = ["봄", "여름", "가을", "겨울"];
  var START_AGE = 10;
  var END_AGE = 14;

  var STAT_LABELS = {
    stamina: "체력", strength: "힘", intelligence: "지력", refinement: "품위",
    charisma: "매력", morality: "도덕", faith: "신앙", sensitivity: "감성",
    stress: "스트레스", sword: "검술", art: "미술", dance: "무용",
    cooking: "요리", magic: "마법",
    repFight: "무예 명성", repArt: "예술 명성", repSocial: "사교 명성", repScholar: "학문 명성",
    bond: "아버지 유대", puppy: "몽실이", kitten: "냥이", gold: "금화"
  };

  /** @type {Record<string, {id:string,cat:string,name:string,desc:string,cost?:number,minAge?:number,bg:string,effects:object,stress:number,gold?:number|number[],tags?:string[]}>} */
  var ACTIVITIES = {
    /* ---- 수업 ---- */
    class_sword: {
      id: "class_sword", cat: "study", name: "검술 수업", desc: "기사 도장에서 기본기를 배워요.",
      cost: 40, bg: "forest", stress: 8,
      effects: { strength: 3, sword: 4, stamina: 2, refinement: -1, repFight: 2 }
    },
    class_art: {
      id: "class_art", cat: "study", name: "미술 수업", desc: "수채화와 스케치를 배워요.",
      cost: 35, bg: "library", stress: 5,
      effects: { art: 5, sensitivity: 2, intelligence: 1, refinement: 2, repArt: 2 }
    },
    class_dance: {
      id: "class_dance", cat: "study", name: "무용 수업", desc: "사교 댄스와 예법을 익혀요.",
      cost: 35, bg: "ballroom", stress: 6,
      effects: { dance: 5, charisma: 3, refinement: 2, stamina: 1, repSocial: 2 }
    },
    class_cook: {
      id: "class_cook", cat: "study", name: "요리 수업", desc: "달콤한 디저트부터 정찬까지.",
      cost: 30, bg: "kitchen", stress: 4,
      effects: { cooking: 5, morality: 1, sensitivity: 1, stamina: 1 }
    },
    class_magic: {
      id: "class_magic", cat: "study", name: "마법 수업", desc: "기초 마법과 별자리를 배워요.",
      cost: 45, bg: "tower", stress: 7,
      effects: { magic: 5, intelligence: 3, faith: 2, sensitivity: 1, repScholar: 2 }
    },
    class_letters: {
      id: "class_letters", cat: "study", name: "문학과 역사", desc: "도서관에서 책을 펼쳐요.",
      cost: 25, bg: "library", stress: 4,
      effects: { intelligence: 4, refinement: 2, morality: 1, repScholar: 2 }
    },
    class_etiquette: {
      id: "class_etiquette", cat: "study", name: "예법 수업", desc: "궁중 예절과 말씨를 다듬어요.",
      cost: 30, bg: "parlor", stress: 5,
      effects: { refinement: 4, morality: 2, charisma: 1, repSocial: 1 }
    },

    /* ---- 알바 ---- */
    job_bakery: {
      id: "job_bakery", cat: "work", name: "빵집 도우미", desc: "오븐 앞에서 반죽을 도와요.",
      bg: "kitchen", stress: 6, gold: [25, 45],
      effects: { cooking: 2, stamina: 1, strength: 1, refinement: -1 }
    },
    job_garden: {
      id: "job_garden", cat: "work", name: "정원 가꾸기", desc: "꽃밭에 물을 주고 잡초를 뽑아요.",
      bg: "garden", stress: 5, gold: [20, 35],
      effects: { stamina: 2, strength: 1, sensitivity: 1, faith: 1 }
    },
    job_library: {
      id: "job_library", cat: "work", name: "도서관 사서", desc: "책을 정리하고 손님을 안내해요.",
      bg: "library", stress: 4, gold: [22, 40],
      effects: { intelligence: 2, refinement: 1, morality: 1 }
    },
    job_boutique: {
      id: "job_boutique", cat: "work", name: "옷가게 점원", desc: "드레스를 권하고 리본을 고쳐요.",
      minAge: 11, bg: "dressroom", stress: 5, gold: [30, 55],
      effects: { charisma: 2, refinement: 2, art: 1, repSocial: 1 }
    },
    job_inn: {
      id: "job_inn", cat: "work", name: "여관 심부름", desc: "손님 짐을 나르고 심부름을 해요.",
      minAge: 12, bg: "fireplace", stress: 8, gold: [40, 70],
      effects: { stamina: 2, strength: 2, morality: -1, refinement: -1 }
    },

    /* ---- 탐험 ---- */
    adv_forest: {
      id: "adv_forest", cat: "adventure", name: "숲 탐험", desc: "울창한 숲길을 모험해요.",
      bg: "forest", stress: 10, gold: [0, 50],
      effects: { stamina: 2, strength: 2, sword: 1, morality: -1 },
      tags: ["combat"], combat: 28
    },
    adv_meadow: {
      id: "adv_meadow", cat: "adventure", name: "초원 산책 모험", desc: "꽃밭 너머 작은 위험을 마주해요.",
      bg: "meadow", stress: 7, gold: [0, 30],
      effects: { stamina: 1, sensitivity: 2, faith: 1 },
      tags: ["combat"], combat: 18
    },
    adv_stream: {
      id: "adv_stream", cat: "adventure", name: "시냇가 탐사", desc: "반짝이는 물을 따라가요.",
      minAge: 11, bg: "stream", stress: 8, gold: [5, 40],
      effects: { magic: 1, intelligence: 1, stamina: 1 },
      tags: ["combat"], combat: 22
    },

    /* ---- 휴식 ---- */
    free_rest: {
      id: "free_rest", cat: "free", name: "집에서 쉬기", desc: "벽난로 앞에서 낮잠을 자요.",
      bg: "fireplace", stress: -18,
      effects: { stamina: 2, bond: 1 }
    },
    free_park: {
      id: "free_park", cat: "free", name: "공원 나들이", desc: "분수 광장을 걸어요.",
      bg: "fountain", stress: -12,
      effects: { sensitivity: 1, charisma: 1, bond: 1 }
    },
    free_talk: {
      id: "free_talk", cat: "free", name: "아버지와 대화", desc: "오늘 하루를 이야기해요.",
      bg: "parlor", stress: -10,
      effects: { bond: 4, morality: 1, faith: 1 }
    },
    free_vacation: {
      id: "free_vacation", cat: "free", name: "짧은 여행", desc: "바다 또는 산으로 떠나요.",
      cost: 50, bg: "wander", stress: -22,
      effects: { bond: 5, stamina: 2, sensitivity: 2, charisma: 1 }
    },

    /* ---- 펫 ---- */
    pet_puppy: {
      id: "pet_puppy", cat: "pet", name: "몽실이 산책", desc: "강아지와 정원·초원을 뛰어요.",
      bg: "meadow", stress: -6,
      effects: { puppy: 12, stamina: 1, sensitivity: 1, bond: 1 }
    },
    pet_kitten: {
      id: "pet_kitten", cat: "pet", name: "냥이 돌보기", desc: "빗질하고 창가에서 함께 쉬어요.",
      bg: "rainy", stress: -8,
      effects: { kitten: 12, refinement: 1, sensitivity: 2 }
    },
    pet_both: {
      id: "pet_both", cat: "pet", name: "반려동물 파티", desc: "몽실이와 냥이에게 간식을 줘요.",
      cost: 15, bg: "heart", stress: -5,
      effects: { puppy: 8, kitten: 8, charisma: 1, cooking: 1 }
    }
  };

  var FESTIVAL = {
    combat: {
      id: "combat", name: "기사 시합", desc: "가을 축제의 무예 대회에 나가요.",
      bg: "festival", skill: "sword", stat: "strength", rep: "repFight",
      toast: "시합의 함성이 울려 퍼져요!"
    },
    dance: {
      id: "dance", name: "별빛 무도회", desc: "파티에서 춤으로 마음을 전해요.",
      bg: "ballroom", skill: "dance", stat: "charisma", rep: "repSocial",
      toast: "무도회가 반짝여요!"
    },
    art: {
      id: "art", name: "미술 전시회", desc: "그림을 걸어 심사를 받아요.",
      bg: "library", skill: "art", stat: "sensitivity", rep: "repArt",
      toast: "작품이 조명을 받아요!"
    },
    cook: {
      id: "cook", name: "요리 대회", desc: "심사를 위한 요리를 선보여요.",
      bg: "kitchen", skill: "cooking", stat: "refinement", rep: "repSocial",
      toast: "향긋한 시식 시간!"
    }
  };

  var ENDINGS = [
    { id: "queen", title: "미래의 여왕", need: function (s) { return s.repSocial >= 40 && s.refinement >= 45 && s.charisma >= 40 && s.morality >= 30; },
      text: "궁정의 모두가 아라를 미래의 여왕으로 바라봐요. 품위와 매력, 단단한 도덕이 왕관을 닮아 있어요.", bg: "ballroom", toast: "여왕의 길을 열었어요!" },
    { id: "knight", title: "왕국 기사", need: function (s) { return s.repFight >= 40 && s.sword >= 40 && s.strength >= 40; },
      text: "검과 용기로 왕국을 지키는 기사가 되었어요. 시합의 함성이 아직도 귀에 남아 있어요.", bg: "festival", toast: "기사의 맹세를 세웠어요!" },
    { id: "mage", title: "별의 마법사", need: function (s) { return s.magic >= 40 && s.intelligence >= 40 && s.faith >= 25; },
      text: "탑 꼭대기에서 별을 읽는 마법사가 되었어요. 지혜와 신앙이 아라의 지팡이를 밝혀요.", bg: "tower", toast: "마법의 길을 걸어요!" },
    { id: "artist", title: "왕실 화가", need: function (s) { return s.repArt >= 40 && s.art >= 42 && s.sensitivity >= 35; },
      text: "아라의 그림이 성 복도에 걸려요. 감성과 손끝의 빛이 사람들의 마음을 물들여요.", bg: "library", toast: "예술가로 인정받았어요!" },
    { id: "chef", title: "궁중 요리사", need: function (s) { return s.cooking >= 45 && s.refinement >= 25; },
      text: "연회 테이블을 책임지는 요리사가 되었어요. 달콤한 냄새가 성의 자랑이 되었죠.", bg: "kitchen", toast: "요리의 달인이 되었어요!" },
    { id: "scholar", title: "왕실 학자", need: function (s) { return s.repScholar >= 40 && s.intelligence >= 45; },
      text: "도서관의 가장 깊은 서가까지 아라의 손길이 닿아요. 왕국이 지혜를 구하러 와요.", bg: "library", toast: "학자의 영예를 얻었어요!" },
    { id: "dancer", title: "축제 무희", need: function (s) { return s.dance >= 42 && s.charisma >= 38 && s.repSocial >= 30; },
      text: "무도회와 축제의 중심에서 아라가 춤을 춰요. 발끝마다 별빛이 따라와요.", bg: "gazebo", toast: "무희로 빛나요!" },
    { id: "petlover", title: "동물들의 친구", need: function (s) { return s.puppy >= 70 && s.kitten >= 70 && s.sensitivity >= 30; },
      text: "몽실이와 냥이, 그리고 숲의 친구들이 아라 곁을 떠나요. 다정함이 최고의 왕관이에요.", bg: "heart", toast: "동물들과의 유대를 완성했어요!" },
    { id: "free", title: "자유로운 여행자", need: function () { return true; },
      text: "정해진 왕관 대신, 바람과 길을 고른 아라예요. 그래도 아버지의 미소는 따뜻해요.", bg: "wander", toast: "자유로운 결말에 도달했어요!" }
  ];

  function defaultState() {
    return {
      name: "아라",
      age: START_AGE,
      yearIndex: 0,
      season: 0,
      gold: 200,
      bond: 20,
      stamina: 30, strength: 15, intelligence: 18, refinement: 16,
      charisma: 18, morality: 20, faith: 15, sensitivity: 16,
      stress: 5,
      sword: 5, art: 5, dance: 5, cooking: 8, magic: 3,
      repFight: 0, repArt: 0, repSocial: 5, repScholar: 0,
      puppy: 10, kitten: 10,
      sick: false, delinquent: false,
      slots: [null, null, null],
      log: [],
      festivalWins: {},
      seenEvents: [],
      monthCount: 0
    };
  }

  return {
    BG: BG,
    PORTRAIT: PORTRAIT,
    SEASONS: SEASONS,
    START_AGE: START_AGE,
    END_AGE: END_AGE,
    STAT_LABELS: STAT_LABELS,
    ACTIVITIES: ACTIVITIES,
    FESTIVAL: FESTIVAL,
    ENDINGS: ENDINGS,
    defaultState: defaultState,
    cats: [
      { id: "study", name: "수업", color: "#7c6ad8" },
      { id: "work", name: "알바", color: "#e0913a" },
      { id: "adventure", name: "탐험", color: "#3aa86a" },
      { id: "free", name: "휴식", color: "#5aa0d8" },
      { id: "pet", name: "반려동물", color: "#e078a8" }
    ]
  };
})();
