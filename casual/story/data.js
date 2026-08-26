/*! 공주 육성 — PM2 최종 데이터 (10→18 · 12개월 · 상점 · 장비 · 라이벌) */
window.PMData = (function () {
  "use strict";

  var BG = {
    castle: "assets/bg/castle.png", garden: "assets/bg/garden.png", forest: "assets/bg/forest.png",
    meadow: "assets/bg/meadow.png", dressroom: "assets/bg/dressroom.png", kitchen: "assets/bg/kitchen.png",
    library: "assets/bg/library.png", tower: "assets/bg/tower.png", fountain: "assets/bg/fountain.png",
    dusk: "assets/bg/dusk.png", ballroom: "assets/bg/ballroom.png", heart: "assets/bg/heart.png",
    wander: "assets/bg/wander.png", balcony: "assets/bg/balcony.png", fireplace: "assets/bg/fireplace.png",
    parlor: "assets/bg/parlor.png", attic: "assets/bg/attic.png", greenhouse: "assets/bg/greenhouse.png",
    candle: "assets/bg/candle_tea.png", rain: "assets/bg/rain_garden.png", rainy: "assets/bg/rainy_window.png",
    lantern: "assets/bg/lantern_path.png", firefly: "assets/bg/firefly.png", mushroom: "assets/bg/mushroom.png",
    festival: "assets/bg/festival.png", wish: "assets/bg/wish_tree.png", stream: "assets/bg/stream.png",
    gazebo: "assets/bg/music_gazebo.png",
    city: "assets/bg/city.png", armory: "assets/bg/shop_armory.png", tailor: "assets/bg/shop_tailor.png",
    restaurant: "assets/bg/shop_restaurant.png", itemshop: "assets/bg/shop_items.png",
    church: "assets/bg/church.png", clinic: "assets/bg/clinic.png", palace: "assets/bg/palace.png",
    cube: "assets/bg/cube_room.png", snow: "assets/bg/snow.png", spring_fair: "assets/bg/spring_fair.png",
    desert: "assets/bg/desert.png", lake: "assets/bg/lake.png", glacier: "assets/bg/glacier.png",
    farm: "assets/bg/farm.png", salon: "assets/bg/salon.png", dojo: "assets/bg/dojo.png",
    birthday: "assets/bg/birthday.png", diet: "assets/bg/diet_kitchen.png",
    camp: "assets/bg/errantry_camp.png", ending_gate: "assets/bg/ending_gate.png",
    study: "assets/bg/study_hall.png", harbor: "assets/bg/harbor.png",
    market: "assets/bg/market.png", observatory: "assets/bg/observatory.png"
  };

  var PORTRAIT = {
    ara: "assets/portraits/princess1.jpg", ria: "assets/portraits/princess2.jpg",
    araTeen: "assets/portraits/ara_teen.png",
    puppy: "assets/portraits/puppy.png", kitten: "assets/portraits/kitten.png",
    bear: "assets/portraits/bear.png", sheep: "assets/portraits/sheep.png",
    cube: "assets/portraits/cube.png", rivalRose: "assets/portraits/rival_rose.png",
    rivalLily: "assets/portraits/rival_lily.png", prince: "assets/portraits/prince.png",
    father: "assets/portraits/father.png", teacher: "assets/portraits/teacher.png",
    merchant: "assets/portraits/merchant.png"
  };

  var MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  var FESTIVAL_MONTH = 9; // October (0-based)
  var START_AGE = 10;
  var END_AGE = 18;

  var STAT_LABELS = {
    stamina: "체력", strength: "힘", intelligence: "지력", refinement: "품위",
    charisma: "매력", morality: "도덕", faith: "신앙", sensitivity: "감성",
    stress: "스트레스", sin: "죄업", sword: "검술", art: "미술", dance: "무용",
    cooking: "요리", magic: "마법",
    repFight: "무예 명성", repArt: "예술 명성", repSocial: "사교 명성", repScholar: "학문 명성",
    bond: "아버지 유대", puppy: "몽실이", kitten: "냥이", gold: "금화",
    weight: "체중", height: "키", fist: "격투", poetry: "시", science: "과학", cubeLove: "큐브 신뢰"
  };

  var BLOOD = {
    O: { label: "O형", monthly: {} },
    A: { label: "A형", monthly: { morality: 1, stress: 1 } },
    B: { label: "B형", monthly: { stress: -1 } },
    AB: { label: "AB형", monthly: { sensitivity: 1 } }
  };

  var DIETS = {
    normal: { id: "normal", name: "보통 식사", cost: 25, desc: "균형 잡힌 식사", effects: { weight: 0, stamina: 0 } },
    robust: { id: "robust", name: "든든한 식사", cost: 55, desc: "체력↑ · 체중↑", effects: { weight: 1, stamina: 3 } },
    light: { id: "light", name: "가벼운 식사", cost: 12, desc: "체중 유지 · 체력 약간↓", effects: { weight: 0, stamina: -1, stress: -1 } },
    slim: { id: "slim", name: "다이어트", cost: 8, desc: "체중↓ · 체력↓", effects: { weight: -2, stamina: -3 } }
  };

  var ACTIVITIES = {
    class_sword: { id: "class_sword", cat: "study", name: "검술 수업", desc: "기사 도장에서 기본기를 배워요.", cost: 40, bg: "forest", stress: 8, effects: { strength: 3, sword: 4, stamina: 2, refinement: -1, repFight: 2 } },
    class_art: { id: "class_art", cat: "study", name: "미술 수업", desc: "수채화와 스케치를 배워요.", cost: 35, bg: "library", stress: 5, effects: { art: 5, sensitivity: 2, intelligence: 1, refinement: 2, repArt: 2 } },
    class_dance: { id: "class_dance", cat: "study", name: "무용 수업", desc: "사교 댄스와 예법을 익혀요.", cost: 35, bg: "ballroom", stress: 6, effects: { dance: 5, charisma: 3, refinement: 2, stamina: 1, repSocial: 2 } },
    class_cook: { id: "class_cook", cat: "study", name: "요리 수업", desc: "달콤한 디저트부터 정찬까지.", cost: 30, bg: "kitchen", stress: 4, effects: { cooking: 5, morality: 1, sensitivity: 1, stamina: 1 } },
    class_magic: { id: "class_magic", cat: "study", name: "마법 수업", desc: "기초 마법과 별자리를 배워요.", cost: 45, bg: "tower", stress: 7, effects: { magic: 5, intelligence: 3, faith: 2, sensitivity: 1, repScholar: 2 } },
    class_letters: { id: "class_letters", cat: "study", name: "문학과 역사", desc: "도서관에서 책을 펼쳐요.", cost: 25, bg: "library", stress: 4, effects: { intelligence: 4, refinement: 2, morality: 1, repScholar: 2 } },
    class_etiquette: { id: "class_etiquette", cat: "study", name: "예법 수업", desc: "궁중 예절과 말씨를 다듬어요.", cost: 30, bg: "parlor", stress: 5, effects: { refinement: 4, morality: 2, charisma: 1, repSocial: 1 } },
    class_theology: { id: "class_theology", cat: "study", name: "신학 수업", desc: "예배당에서 경건함을 배워요.", cost: 30, minAge: 12, bg: "church", stress: 4, effects: { faith: 5, morality: 3, sin: -2, refinement: 1 } },
    class_strategy: { id: "class_strategy", cat: "study", name: "병법 수업", desc: "전술과 지도를 공부해요.", cost: 50, minAge: 13, bg: "palace", stress: 7, effects: { intelligence: 4, sword: 2, strength: 1, repFight: 2, repScholar: 1 } },
    class_kungfu: { id: "class_kungfu", cat: "study", name: "격투 수업", desc: "도장에서 주먹을 단련해요.", cost: 28, bg: "dojo", stress: 7, effects: { fist: 5, strength: 3, stamina: 2, defense: 2, refinement: -1, repFight: 2 } },
    class_poetry: { id: "class_poetry", cat: "study", name: "시와 작문", desc: "감성을 시로 풀어내요.", cost: 28, bg: "library", stress: 3, effects: { poetry: 5, sensitivity: 3, intelligence: 2, refinement: 2, repArt: 1 } },
    class_science: { id: "class_science", cat: "study", name: "자연 과학", desc: "별과 식물을 관찰해요.", cost: 40, minAge: 12, bg: "greenhouse", stress: 5, effects: { science: 5, intelligence: 4, magic: 1, repScholar: 2 } },

    job_house: { id: "job_house", cat: "work", name: "가사 돕기", desc: "큐브와 함께 성을 청소해요. (무급)", bg: "cube", stress: 3, gold: [0, 0], effects: { cooking: 2, morality: 2, refinement: 1, bond: 2, cubeLove: 2 } },
    job_farm: { id: "job_farm", cat: "work", name: "농장 일손", desc: "밀밭에서 땀을 거둬요.", bg: "farm", stress: 9, gold: [35, 60], effects: { stamina: 3, strength: 2, refinement: -2, cooking: 1 } },
    job_babysit: { id: "job_babysit", cat: "work", name: "아이 돌보기", desc: "마을 아이를 돌봐요.", bg: "parlor", stress: 5, gold: [18, 32], effects: { morality: 2, charisma: 1, sensitivity: 1, cooking: 1 } },
    job_salon: { id: "job_salon", cat: "work", name: "미용실 조수", desc: "리본과 머리를 손질해요.", minAge: 12, bg: "salon", stress: 5, gold: [32, 58], effects: { charisma: 3, art: 1, refinement: 1, repSocial: 1 } },
    job_hunter: { id: "job_hunter", cat: "work", name: "수렵 도우미", desc: "숲 가장자리에서 안전하게 도와요.", minAge: 14, bg: "forest", stress: 10, gold: [45, 80], effects: { strength: 2, stamina: 2, morality: -1, sin: 1, sword: 1 } },

    job_bakery: { id: "job_bakery", cat: "work", name: "빵집 도우미", desc: "오븐 앞에서 반죽을 도와요.", bg: "kitchen", stress: 6, gold: [25, 45], effects: { cooking: 2, stamina: 1, strength: 1, refinement: -1 } },
    job_garden: { id: "job_garden", cat: "work", name: "정원 가꾸기", desc: "꽃밭에 물을 주고 잡초를 뽑아요.", bg: "garden", stress: 5, gold: [20, 35], effects: { stamina: 2, strength: 1, sensitivity: 1, faith: 1 } },
    job_library: { id: "job_library", cat: "work", name: "도서관 사서", desc: "책을 정리하고 손님을 안내해요.", bg: "library", stress: 4, gold: [22, 40], effects: { intelligence: 2, refinement: 1, morality: 1 } },
    job_boutique: { id: "job_boutique", cat: "work", name: "옷가게 점원", desc: "드레스를 권하고 리본을 고쳐요.", minAge: 11, bg: "dressroom", stress: 5, gold: [30, 55], effects: { charisma: 2, refinement: 2, art: 1, repSocial: 1 } },
    job_inn: { id: "job_inn", cat: "work", name: "여관 심부름", desc: "손님 짐을 나르고 심부름을 해요.", minAge: 12, bg: "fireplace", stress: 8, gold: [40, 70], effects: { stamina: 2, strength: 2, morality: -1, refinement: -1 } },
    job_church: { id: "job_church", cat: "work", name: "성당 봉사", desc: "성당 청소와 봉사 활동을 해요.", minAge: 12, bg: "church", stress: 3, gold: [15, 30], effects: { faith: 3, morality: 2, sin: -1, bond: 1 } },
    job_palace: { id: "job_palace", cat: "work", name: "궁정 시녀", desc: "궁에서 잔심부름을 해요.", minAge: 14, bg: "palace", stress: 7, gold: [55, 90], effects: { refinement: 3, charisma: 2, repSocial: 3 } },
    job_tutor: { id: "job_tutor", cat: "work", name: "어린이 과외", desc: "마을 아이에게 글자를 알려요.", minAge: 15, bg: "library", stress: 5, gold: [50, 85], effects: { intelligence: 2, morality: 2, repScholar: 2 } },

    adv_forest: { id: "adv_forest", cat: "adventure", name: "숲 탐험", desc: "울창한 숲길을 모험해요.", bg: "forest", stress: 10, gold: [0, 50], effects: { stamina: 2, strength: 2, sword: 1, morality: -1 }, tags: ["combat"], combat: 28 },
    adv_meadow: { id: "adv_meadow", cat: "adventure", name: "초원 산책 모험", desc: "꽃밭 너머 작은 위험을 마주해요.", bg: "meadow", stress: 7, gold: [0, 30], effects: { stamina: 1, sensitivity: 2, faith: 1 }, tags: ["combat"], combat: 18 },
    adv_stream: { id: "adv_stream", cat: "adventure", name: "시냇가 탐사", desc: "반짝이는 물을 따라가요.", minAge: 11, bg: "stream", stress: 8, gold: [5, 40], effects: { magic: 1, intelligence: 1, stamina: 1 }, tags: ["combat"], combat: 22 },
    adv_cave: { id: "adv_cave", cat: "adventure", name: "동굴 탐사", desc: "어두운 동굴을 손전등처럼 마법으로 밝혀요.", minAge: 13, bg: "mushroom", stress: 12, gold: [10, 80], effects: { magic: 2, strength: 2, stamina: -1, sin: 1 }, tags: ["combat"], combat: 40 },
    adv_ruins: { id: "adv_ruins", cat: "adventure", name: "고대 유적", desc: "잊힌 유적에서 지혜를 찾아요.", minAge: 15, bg: "lantern", stress: 14, gold: [20, 100], effects: { intelligence: 3, magic: 2, repScholar: 2, sin: 1 }, tags: ["combat"], combat: 48 },
    adv_lake: { id: "adv_lake", cat: "adventure", name: "호수 원정", desc: "호숫가를 며칠간 탐험해요.", minAge: 11, bg: "lake", stress: 11, tags: ["errantry"], zone: "lake", steps: 3 },
    adv_desert: { id: "adv_desert", cat: "adventure", name: "사막 원정", desc: "모래길을 따라 모험해요.", minAge: 13, bg: "desert", stress: 13, tags: ["errantry"], zone: "desert", steps: 3 },
    adv_glacier: { id: "adv_glacier", cat: "adventure", name: "빙하 원정", desc: "얼음 협곡을 건너요.", minAge: 15, bg: "glacier", stress: 15, tags: ["errantry"], zone: "glacier", steps: 4 },
    adv_forest_long: { id: "adv_forest_long", cat: "adventure", name: "숲 장거리 원정", desc: "숲 깊숙이 며칠을 머물러요.", minAge: 12, bg: "forest", stress: 12, tags: ["errantry"], zone: "forest", steps: 3 },
    adv_harbor: { id: "adv_harbor", cat: "adventure", name: "항구 원정", desc: "부두와 창고를 며칠간 탐험해요.", minAge: 12, bg: "harbor", stress: 11, tags: ["errantry"], zone: "harbor", steps: 3 },

    free_rest: { id: "free_rest", cat: "free", name: "집에서 쉬기", desc: "벽난로 앞에서 낮잠을 자요.", bg: "fireplace", stress: -18, effects: { stamina: 2, bond: 1 } },
    free_market: { id: "free_market", cat: "free", name: "시장 구경", desc: "장터를 돌며 분위기를 즐겨요.", cost: 10, bg: "market", stress: -14, effects: { charisma: 1, sensitivity: 1, refinement: 1 } },
    free_observatory: { id: "free_observatory", cat: "free", name: "천문대 나들이", desc: "별을 보며 마음을 가라앉혀요.", cost: 20, minAge: 12, bg: "observatory", stress: -16, effects: { intelligence: 2, magic: 1, science: 1, sensitivity: 1 } },
    free_spend: { id: "free_spend", cat: "free", name: "용돈 놀이", desc: "시내에서 가볍게 놀며 스트레스를 풀어요.", cost: 25, bg: "city", stress: -20, effects: { charisma: 1, sensitivity: 1 } },
    free_sea: { id: "free_sea", cat: "free", name: "바다 휴가", desc: "여름 바다로 떠나요.", cost: 60, bg: "lake", stress: -24, effects: { bond: 5, stamina: 2, charisma: 2, weight: -1 }, months: [5, 6, 7] },
    free_mountain: { id: "free_mountain", cat: "free", name: "산 휴가", desc: "선선한 산에서 쉬어요.", cost: 55, bg: "wander", stress: -22, effects: { bond: 5, faith: 2, sensitivity: 2, weight: -1 }, months: [8, 9, 10] },
    free_park: { id: "free_park", cat: "free", name: "공원 나들이", desc: "분수 광장을 걸어요.", bg: "fountain", stress: -12, effects: { sensitivity: 1, charisma: 1, bond: 1 } },
    free_talk: { id: "free_talk", cat: "free", name: "아버지와 대화", desc: "오늘 하루를 이야기해요.", bg: "parlor", stress: -10, effects: { bond: 4, morality: 1, faith: 1 } },
    free_vacation: { id: "free_vacation", cat: "free", name: "짧은 여행", desc: "바다 또는 산으로 떠나요.", cost: 50, bg: "wander", stress: -22, effects: { bond: 5, stamina: 2, sensitivity: 2, charisma: 1, weight: -1 } },
    free_snow: { id: "free_snow", cat: "free", name: "눈사람 만들기", desc: "첫눈과 함께 놀아요.", bg: "snow", stress: -14, effects: { sensitivity: 2, stamina: 1, puppy: 2, kitten: 1 }, months: [11, 0, 1] },

    pet_puppy: { id: "pet_puppy", cat: "pet", name: "몽실이 산책", desc: "강아지와 정원·초원을 뛰어요.", bg: "meadow", stress: -6, effects: { puppy: 12, stamina: 1, sensitivity: 1, bond: 1 } },
    pet_kitten: { id: "pet_kitten", cat: "pet", name: "냥이 돌보기", desc: "빗질하고 창가에서 함께 쉬어요.", bg: "rainy", stress: -8, effects: { kitten: 12, refinement: 1, sensitivity: 2 } },
    pet_both: { id: "pet_both", cat: "pet", name: "반려동물 파티", desc: "몽실이와 냥이에게 간식을 줘요.", cost: 15, bg: "heart", stress: -5, effects: { puppy: 8, kitten: 8, charisma: 1, cooking: 1 } }
  };

  var ITEMS = {
    wooden_sword: { id: "wooden_sword", shop: "armory", slot: "weapon", name: "나무 검", desc: "연습용 나무 검", cost: 60, icon: "assets/ui/sword_icon.png", bonuses: { sword: 3, strength: 1 } },
    steel_sword: { id: "steel_sword", shop: "armory", slot: "weapon", name: "강철 검", desc: "빛나는 강철 검", cost: 180, minAge: 13, icon: "assets/ui/sword_icon.png", bonuses: { sword: 8, strength: 3, repFight: 1 } },
    leather_guard: { id: "leather_guard", shop: "armory", slot: "armor", name: "가죽 가드", desc: "가벼운 보호구", cost: 70, bonuses: { stamina: 3, defense: 2 } },
    leather_helm: { id: "leather_helm", shop: "armory", slot: "helm", name: "가죽 투구", desc: "머리를 지켜 줘요", cost: 55, icon: "assets/ui/helm_icon.png", bonuses: { defense: 2, stamina: 1 } },
    iron_helm: { id: "iron_helm", shop: "armory", slot: "helm", name: "철 투구", desc: "단단한 투구", cost: 150, minAge: 13, icon: "assets/ui/helm_icon.png", bonuses: { defense: 5, stamina: 2, refinement: -1 } },
    knight_mail: { id: "knight_mail", shop: "armory", slot: "armor", name: "견습 사슬갑", desc: "가벼운 사슬 갑옷", cost: 200, minAge: 14, bonuses: { stamina: 6, defense: 5, refinement: -1 } },
    day_dress: { id: "day_dress", shop: "tailor", slot: "dress", name: "나들이 원피스", desc: "산뜻한 일상복", cost: 50, icon: "assets/ui/dress_icon.png", bonuses: { charisma: 2, refinement: 1 } },
    star_dress: { id: "star_dress", shop: "tailor", slot: "dress", name: "별빛 드레스", desc: "파티용 반짝이 드레스", cost: 160, minAge: 12, icon: "assets/ui/dress_icon.png", bonuses: { charisma: 6, dance: 3, refinement: 3, repSocial: 2 } },
    scholar_robe: { id: "scholar_robe", shop: "tailor", slot: "dress", name: "학자 로브", desc: "지적인 로브", cost: 140, minAge: 13, bonuses: { intelligence: 4, magic: 2, refinement: 2, repScholar: 2 } },
    berry_cake: { id: "berry_cake", shop: "restaurant", slot: "consumable", name: "베리 케이크", desc: "달콤한 회복 케이크", cost: 25, icon: "assets/ui/cake_icon.png", use: { stress: -10, stamina: 3, weight: 1 } },
    herbal_tea: { id: "herbal_tea", shop: "restaurant", slot: "consumable", name: "허브티", desc: "마음을 가라앉히는 차", cost: 20, use: { stress: -12, faith: 1 } },
    feast: { id: "feast", shop: "restaurant", slot: "consumable", name: "든든한 정식", desc: "체력을 채워 주는 식사", cost: 35, use: { stamina: 8, stress: -4, weight: 2 } },
    mint_tonic: { id: "mint_tonic", shop: "items", slot: "consumable", name: "민트 토닉", desc: "가벼운 회복 물약", cost: 40, icon: "assets/ui/potion_icon.png", use: { stamina: 5, stress: -6 } },
    focus_candy: { id: "focus_candy", shop: "items", slot: "consumable", name: "집중 사탕", desc: "머리를 맑게 해요", cost: 30, use: { intelligence: 2, stress: 2 } },
    charm_ribbon: { id: "charm_ribbon", shop: "items", slot: "consumable", name: "매력 리본", desc: "잠깐 매력이 올라요", cost: 45, use: { charisma: 3 } }
  };

  var SHOPS = [
    { id: "armory", name: "무기점", bg: "armory", desc: "검과 갑옷을 사요." },
    { id: "tailor", name: "옷가게", bg: "tailor", desc: "드레스와 로브를 맞춰요." },
    { id: "restaurant", name: "식당", bg: "restaurant", desc: "맛있는 음식으로 회복해요." },
    { id: "items", name: "잡화점", bg: "itemshop", desc: "물약과 잡화를 사요." },
    { id: "church", name: "성당", bg: "church", desc: "기부하면 죄업이 줄어요.", special: "donate" },
    { id: "clinic", name: "진료소", bg: "clinic", desc: "몸이 아플 때 치료받아요.", special: "heal" },
    { id: "palace", name: "왕궁", bg: "palace", desc: "한 달에 한 번 알현해요.", special: "palace" }
  ];

  var FESTIVAL = {
    combat: { id: "combat", name: "기사 시합", desc: "가을 축제의 무예 대회에 나가요.", bg: "festival", skill: "sword", stat: "strength", rep: "repFight", toast: "시합의 함성이 울려 퍼져요!" },
    dance: { id: "dance", name: "별빛 무도회", desc: "파티에서 춤으로 마음을 전해요.", bg: "ballroom", skill: "dance", stat: "charisma", rep: "repSocial", toast: "무도회가 반짝여요!" },
    art: { id: "art", name: "미술 전시회", desc: "그림을 걸어 심사를 받아요.", bg: "library", skill: "art", stat: "sensitivity", rep: "repArt", toast: "작품이 조명을 받아요!" },
    cook: { id: "cook", name: "요리 대회", desc: "심사를 위한 요리를 선보여요.", bg: "kitchen", skill: "cooking", stat: "refinement", rep: "repSocial", toast: "향긋한 시식 시간!" }
  };

  var RIVALS = [
    { id: "rose", name: "로즈", portrait: "rivalRose", focus: ["sword", "strength", "repFight"], line: "검으로는 내가 위야!" },
    { id: "lily", name: "릴리", portrait: "rivalLily", focus: ["art", "dance", "charisma"], line: "우아함은 연습의 결과야." }
  ];

  var ENDINGS = [
    { id: "queen", title: "미래의 여왕", need: function (s) { return s.repSocial >= 55 && s.refinement >= 55 && s.charisma >= 50 && s.morality >= 40 && s.sin < 20; }, text: "궁정의 모두가 아라를 미래의 여왕으로 바라봐요. 품위와 매력, 단단한 도덕이 왕관을 닮아 있어요.", bg: "palace", toast: "여왕의 길을 열었어요!" },
    { id: "general", title: "왕국 장군", need: function (s) { return s.repFight >= 60 && s.sword >= 55 && s.strength >= 50 && s.intelligence >= 35; }, text: "전장을 지휘하는 장군이 되었어요. 병법과 용기가 왕국의 방패가 되었죠.", bg: "festival", toast: "장군의 깃발을 올렸어요!" },
    { id: "knight", title: "왕국 기사", need: function (s) { return s.repFight >= 45 && s.sword >= 45 && s.strength >= 42; }, text: "검과 용기로 왕국을 지키는 기사가 되었어요.", bg: "festival", toast: "기사의 맹세를 세웠어요!" },
    { id: "mage", title: "별의 대마법사", need: function (s) { return s.magic >= 55 && s.intelligence >= 50 && s.faith >= 30; }, text: "탑 꼭대기에서 별을 읽는 대마법사가 되었어요.", bg: "tower", toast: "마법의 정점에 섰어요!" },
    { id: "artist", title: "왕실 화가", need: function (s) { return s.repArt >= 50 && s.art >= 50 && s.sensitivity >= 40; }, text: "아라의 그림이 성 복도에 걸려요. 감성이 사람들의 마음을 물들여요.", bg: "library", toast: "예술가로 인정받았어요!" },
    { id: "dancer", title: "궁중 무희", need: function (s) { return s.dance >= 50 && s.charisma >= 48 && s.repSocial >= 40; }, text: "무도회의 중심에서 아라가 춤을 춰요.", bg: "gazebo", toast: "무희로 빛나요!" },
    { id: "chef", title: "궁중 요리장", need: function (s) { return s.cooking >= 55 && s.refinement >= 30; }, text: "연회 테이블을 책임지는 요리장이 되었어요.", bg: "kitchen", toast: "요리의 달인이 되었어요!" },
    { id: "scholar", title: "왕실 학자", need: function (s) { return s.repScholar >= 50 && s.intelligence >= 55; }, text: "도서관의 가장 깊은 서가까지 아라의 손길이 닿아요.", bg: "library", toast: "학자의 영예를 얻었어요!" },
    { id: "priest", title: "성당의 수녀", need: function (s) { return s.faith >= 55 && s.morality >= 50 && s.sin < 10; }, text: "성스러운 빛 아래에서 사람들을 위로하는 삶을 골랐어요.", bg: "church", toast: "신앙의 길을 걸어요!" },
    { id: "bride", title: "왕자와의 결혼", need: function (s) { return (s.engaged || s.prince >= 40) && s.prince >= 35 && s.charisma >= 40 && s.refinement >= 40 && s.morality >= 30; }, text: "왕자와 손을 잡고 새로운 아침을 맞아요. 사랑도 하나의 엔딩이에요.", bg: "ballroom", toast: "왕자와 맺어졌어요!" },
    { id: "war_hero", title: "전장의 수호자", need: function (s) { return (s.yearFlags && s.yearFlags.warSeen) && s.repFight >= 50 && s.sword >= 45 && s.strength >= 40; }, text: "소란스러운 해에도 왕국을 지킨 아라예요. 방패가 된 용기가 역사에 남아요.", bg: "festival", toast: "수호자의 영예를 얻었어요!" },
    { id: "cube_ending", title: "큐브와 함께하는 나날", need: function (s) { return s.cubeLove >= 45 && s.bond >= 40 && s.morality >= 35; }, text: "왕관보다 차 한 잔. 큐브와 아버지는 아라의 평온한 일상을 지켜 줘요.", bg: "cube", toast: "큐브와의 유대를 완성했어요!" },
    { id: "maid", title: "궁정 메이드장", need: function (s) { return (s.jobRanks.job_palace || 0) >= 2 && s.refinement >= 40 && s.cooking >= 30 && s.repSocial >= 25; }, text: "궁정 살림의 중심이 된 아라예요. 예법과 손끝이 모두의 신뢰를 받아요.", bg: "palace", toast: "메이드장의 열쇠를 받았어요!" },
    { id: "farmer", title: "목가적 농장주", need: function (s) { return (s.jobRanks.job_farm || 0) >= 2 && s.stamina >= 45 && s.cooking >= 25; }, text: "밀향 가득한 농장에서 아라가 손을 흔들어요. 소박하지만 풍요로운 결말이에요.", bg: "farm", toast: "농장의 주인이 되었어요!" },
    { id: "innkeeper", title: "따뜻한 여관 주인", need: function (s) { return (s.jobRanks.job_inn || 0) >= 2 && s.cooking >= 35 && s.charisma >= 30; }, text: "여행객들이 아라의 여관을 찾아요. 난로와 스프 냄새가 길을 안내하죠.", bg: "fireplace", toast: "여관의 간판을 걸었어요!" },
    { id: "researcher", title: "왕립 연구원", need: function (s) { return (s.science || 0) >= 40 && s.intelligence >= 50 && s.repScholar >= 35; }, text: "실험실과 온실을 오가며 왕국의 궁금증을 풀어 주는 연구원이 되었어요.", bg: "greenhouse", toast: "연구원의 가운을 입었어요!" },
    { id: "poet", title: "궁중 시인", need: function (s) { return (s.poetry || 0) >= 45 && s.sensitivity >= 40 && s.repArt >= 30; }, text: "아라의 시가 연회장에 울려 퍼져요. 말없이도 마음이 전해져요.", bg: "balcony", toast: "시인의 깃펜을 들었어요!" },
    { id: "fighter", title: "격투 챔피언", need: function (s) { return (s.fist || 0) >= 50 && s.strength >= 45 && s.repFight >= 40; }, text: "도장의 챔피언이 된 아라예요. 주먹보다 더 강한 건 연습의 땀이에요.", bg: "dojo", toast: "격투 챔피언이 되었어요!" },
    { id: "dark", title: "장난꾸러기 여왕(?)", need: function (s) { return s.sin >= 40 && s.charisma >= 35; }, text: "규칙보다는 자유! 그래도 사람들은 아라를 웃으며 따르네요. 살짝 위험한 결말이에요.", bg: "city", toast: "어둠(?)의 공주 엔딩" },
    { id: "petlover", title: "동물들의 수호자", need: function (s) { return s.puppy >= 80 && s.kitten >= 80 && s.sensitivity >= 35; }, text: "몽실이와 냥이, 숲의 친구들이 아라 곁을 지켜요.", bg: "heart", toast: "동물들과의 유대를 완성했어요!" },
    { id: "adventurer", title: "전설의 모험가", need: function (s) { return s.repFight >= 35 && s.magic >= 30 && s.stamina >= 45 && (((s.festivalWins && s.festivalWins.combat) || 0) >= 1 || (s.errantryWins || 0) >= 3); }, text: "지도에 없는 길까지 발을 내딛는 모험가가 되었어요.", bg: "lantern", toast: "모험가의 길을 떠났어요!" },
    { id: "navigator", title: "항구의 항해사", need: function (s) { return (s.errantryWins || 0) >= 2 && s.stamina >= 40 && s.intelligence >= 35; }, text: "뱃사람들과 손을 맞잡고 항로를 여는 항해사가 되었어요.", bg: "harbor", toast: "항구의 항해사가 되었어요!" },
    { id: "stargazer", title: "별지기", need: function (s) { return (s.science || 0) >= 35 && s.magic >= 30 && s.intelligence >= 45; }, text: "관측 돔에서 별의 지도를 그리는 별지기가 되었어요.", bg: "observatory", toast: "별지기의 망원경을 받았어요!" },
    { id: "delinquent", title: "골목의 대장", need: function (s) { return s.sin >= 35 || (s.delinquentCount >= 6 && s.morality < 20); }, text: "규칙은 잘 안 지키지만, 친구들은 아라를 따르네요. 조금 거친 결말이에요.", bg: "city", toast: "말썽꾸러기 엔딩…" },
    { id: "free", title: "자유로운 여행자", need: function () { return true; }, text: "정해진 왕관 대신 바람과 길을 고른 아라예요. 아버지의 미소는 따뜻해요.", bg: "wander", toast: "자유로운 결말에 도달했어요!" }
  ];

  var ERRANTRY = {
    forest: { name: "깊은 숲", bg: "forest", diff: 24 },
    lake: { name: "호숫가", bg: "lake", diff: 26 },
    desert: { name: "사막", bg: "desert", diff: 34 },
    glacier: { name: "빙하", bg: "glacier", diff: 42 },
    harbor: { name: "항구", bg: "harbor", diff: 30 }
  };

  function defaultState(opts) {
    opts = opts || {};
    return {
      name: opts.name || "아라",
      blood: opts.blood || "O",
      birthdayMonth: opts.birthdayMonth != null ? opts.birthdayMonth : 2,
      fatherBirthdayMonth: opts.fatherBirthdayMonth != null ? opts.fatherBirthdayMonth : 5,
      diet: "normal",
      age: START_AGE,
      month: 2,
      gold: 280,
      bond: 20,
      prince: 0,
      cubeLove: 5,
      height: 130,
      stamina: 32, strength: 16, intelligence: 18, refinement: 16,
      charisma: 18, morality: 22, faith: 16, sensitivity: 16,
      stress: 5, sin: 0, weight: 40, defense: 0,
      sword: 5, fist: 3, art: 5, dance: 5, cooking: 8, magic: 3, poetry: 3, science: 3,
      repFight: 0, repArt: 0, repSocial: 5, repScholar: 0,
      puppy: 10, kitten: 10,
      sick: false, bedridden: false, delinquent: false, runaway: false, inLove: false,
      delinquentCount: 0,
      slots: [null, null, null],
      festPick: null,
      festivalWins: {},
      inventory: [],
      equip: { weapon: null, armor: null, dress: null, helm: null },
      palaceUsedMonth: -1,
      jobRanks: {},
      classRanks: {},
      yearFlags: { war: false, harvest: false },
      engaged: false,
      monthCount: 0,
      rivals: { rose: 12, lily: 12 },
      errantryWins: 0
    };
  }

  return {
    BG: BG, PORTRAIT: PORTRAIT, MONTHS: MONTHS, FESTIVAL_MONTH: FESTIVAL_MONTH,
    START_AGE: START_AGE, END_AGE: END_AGE, STAT_LABELS: STAT_LABELS,
    BLOOD: BLOOD, DIETS: DIETS, ERRANTRY: ERRANTRY,
    ACTIVITIES: ACTIVITIES, ITEMS: ITEMS, SHOPS: SHOPS, FESTIVAL: FESTIVAL,
    RIVALS: RIVALS, ENDINGS: ENDINGS, defaultState: defaultState,
    cats: [
      { id: "study", name: "수업", color: "#7c6ad8" },
      { id: "work", name: "알바", color: "#e0913a" },
      { id: "adventure", name: "탐험", color: "#3aa86a" },
      { id: "free", name: "휴식", color: "#5aa0d8" },
      { id: "pet", name: "반려동물", color: "#e078a8" }
    ]
  };
})();
