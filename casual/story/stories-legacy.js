/*! 공주 이야기 — 스토리 데이터 (3편) */
window.PrincessStories = (function () {
  "use strict";

  var P_ARA = "assets/portraits/princess1.jpg";
  var P_RIA = "assets/portraits/princess2.jpg";
  var IMG_PUPPY = "assets/portraits/puppy.png";
  var IMG_BEAR = "assets/portraits/bear.png";
  var IMG_KITTEN = "assets/portraits/kitten.png";
  var IMG_SHEEP = "assets/portraits/sheep.png";

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
    rainy_window: "assets/bg/rainy_window.png",
    parlor: "assets/bg/parlor.png",
    attic: "assets/bg/attic.png",
    greenhouse: "assets/bg/greenhouse.png",
    candle_tea: "assets/bg/candle_tea.png",
    rain_garden: "assets/bg/rain_garden.png",
    lantern_path: "assets/bg/lantern_path.png",
    firefly: "assets/bg/firefly.png",
    mushroom: "assets/bg/mushroom.png",
    festival: "assets/bg/festival.png",
    wish_tree: "assets/bg/wish_tree.png",
    stream: "assets/bg/stream.png",
    music_gazebo: "assets/bg/music_gazebo.png"
  };

  function node(bgKey, portrait, name, text, choices) {
    return {
      bg: bgKey,
      bgImg: BG[bgKey],
      portrait: portrait,
      name: name,
      text: text,
      choices: choices
    };
  }

  /* ========== 1. 별빛 정원의 하루 ========== */
  var starlight = {
    id: "starlight",
    title: "별빛 정원의 하루",
    subtitle: "특별한 저녁 파티까지",
    desc: "아라 공주가 되어 아침부터 별빛 파티까지 하루를 꾸려요.",
    cover: BG.castle,
    endingTotal: 5,
    start: "n1",
    nodes: {
      n1: node("castle", P_ARA, "아라 공주",
        "포근한 아침 햇살이 커튼 사이로 스며들어요. 오늘 저녁엔 정원에서 작은 별빛 파티가 열리는 특별한 날이에요. 아침 시간, 무엇부터 해볼까요?",
        [
          { label: "이슬 맺힌 정원을 산책해요", next: "n2_garden", effect: { outfit: "adventure" } },
          { label: "옷장에서 드레스를 골라봐요", next: "n2_dress", effect: { outfit: "elegant" } },
          { label: "달콤한 간식을 만들어요", next: "n2_kitchen", effect: { outfit: "cozy" } },
          { label: "도서관에서 책을 펴봐요", next: "n2_library", effect: { outfit: "cozy", mood: "dreamy" } }
        ]),
      n2_garden: node("garden", P_ARA, "아라 공주",
        "이슬이 맺힌 꽃길을 따라 걷다 보니, 산울타리 틈에 낀 작은 강아지가 낑낑거리고 있어요.",
        [
          { label: "강아지를 꺼내주고 함께 놀아요", next: "n3_meadow", effect: { animal: "puppy", mood: "warm" } },
          { label: "신비한 발자국을 따라가요", next: "n3_forest", effect: { mood: "brave" } },
          { label: "분수 광장으로 발길을 돌려요", next: "n3_fountain", effect: { mood: "cheerful" } }
        ]),
      n3_meadow: node("meadow", IMG_PUPPY, "몽실이 (강아지)",
        "몽실이가 꼬리를 흔들며 아라 공주의 손등을 폴짝폴짝 핥아요. 오늘 하루 종일 곁을 졸졸 따라다니고 싶은 눈치예요!",
        [
          { label: "좋아, 오늘은 몽실이와 함께 다닐래", next: "n4_tower", effect: { mood: "cheerful", companion: "puppy" } },
          { label: "저녁 준비 전 몽실이를 다독이고 성으로 가요", next: "n4_dusk", effect: { mood: "dreamy" } }
        ]),
      n3_forest: node("forest", P_ARA, "아라 공주",
        "발자국을 따라가니 오래된 나무 아래에서, 작은 곰돌이가 꿀단지를 놓치고 울상을 짓고 있어요.",
        [
          { label: "곰돌이를 도와 함께 꿀단지를 찾아줘요", next: "n4_tower", effect: { animal: "bear", mood: "warm", companion: "bear" } },
          { label: "곰돌이에게 인사만 하고 숲 안쪽을 탐험해요", next: "n4_tower", effect: { mood: "brave" } }
        ]),
      n3_fountain: node("fountain", P_ARA, "아라 공주",
        "분수 물결이 반짝여요. 물방울 사이로 작은 양 한 마리가 목을 축이고 있어요. 고개를 들어 아라를 바라보네요.",
        [
          { label: "양에게 꽃을 건네며 친구가 돼요", next: "n4_tower", effect: { animal: "sheep", mood: "warm", companion: "sheep" } },
          { label: "분수 소리에 귀를 기울이며 쉬어요", next: "n4_dusk", effect: { mood: "dreamy" } }
        ]),
      n2_dress: node("dressroom", P_ARA, "아라 공주",
        "옷장 문을 여니 별빛처럼 반짝이는 드레스들이 가득해요. 마침 놀러 온 리아 공주가 옷장을 함께 구경해요.",
        [
          { label: "화려한 별빛 드레스를 입어봐요", next: "n3_dress2", effect: { mood: "dreamy", dress: "star" } },
          { label: "가볍고 편안한 산책용 원피스를 골라요", next: "n3_dress2", effect: { mood: "cheerful", dress: "soft" } },
          { label: "리아에게 어울리는 리본을 골라 줘요", next: "n3_dress2", effect: { mood: "warm", dress: "gift" } }
        ]),
      n3_dress2: node("dressroom", P_RIA, "리아 공주",
        "\"우와, 오늘 정말 잘 어울려! 저녁 파티에서 제일 반짝일 것 같아.\" 리아가 눈을 반짝이며 웃어요.",
        [
          { label: "고마워! 오늘 저녁이 정말 기대돼", next: "n4_dusk", effect: { mood: "cheerful" } },
          { label: "리아와 함께 탑 발코니에 올라가 봐요", next: "n4_tower", effect: { mood: "warm" } }
        ]),
      n2_kitchen: node("kitchen", P_ARA, "아라 공주",
        "달콤한 냄새를 맡았는지, 작은 곰돌이 한 마리가 부엌 창문으로 코를 빼꼼 내밀어요.",
        [
          { label: "곰돌이에게 갓 구운 쿠키를 나눠줘요", next: "n3_kitchen2", effect: { animal: "bear", mood: "warm", companion: "bear" } },
          { label: "혼자 조용히 티타임을 준비해요", next: "n3_kitchen2", effect: { mood: "dreamy" } },
          { label: "파티용 케이크에 별 장식을 올려요", next: "n3_kitchen2", effect: { mood: "cheerful", treat: "cake" } }
        ]),
      n3_kitchen2: {
        bg: "kitchen", bgImg: BG.kitchen,
        portrait: function (f) { return f.animal === "bear" ? IMG_BEAR : P_ARA; },
        name: function (f) { return f.animal === "bear" ? "곰돌이" : "아라 공주"; },
        text: function (f) {
          if (f.animal === "bear") return "곰돌이가 쿠키 부스러기를 얼굴 가득 묻힌 채 활짝 웃어요. 오늘 하루 종일 곁에 있고 싶어 하는 눈치예요.";
          if (f.treat === "cake") return "별사탕이 반짝이는 케이크가 완성됐어요. 창밖으로 노을이 예쁘게 물들기 시작해요.";
          return "따뜻한 차 한 잔의 향기가 부엌 가득 퍼져요. 창밖으로 노을이 예쁘게 물들기 시작해요.";
        },
        choices: [
          { label: "탑 발코니에서 하늘을 바라봐요", next: "n4_tower", effect: {} },
          { label: "이제 저녁 파티 준비를 하러 가요", next: "n4_dusk", effect: {} }
        ]
      },
      n2_library: node("library", P_ARA, "아라 공주",
        "오래된 동화책 사이로 작은 쪽지가 떨어져 있어요. \"별이 가장 밝을 때, 발코니에서 소원을 빌어요.\"",
        [
          { label: "쪽지를 따라 탑 발코니로 가요", next: "n4_tower", effect: { mood: "dreamy", clue: "wish" } },
          { label: "책을 끝까지 읽고 난 뒤 정원으로 가요", next: "n4_dusk", effect: { mood: "dreamy" } },
          { label: "리아에게 쪽지를 보여 주러 가요", next: "n3_lib_ria", effect: { mood: "warm" } }
        ]),
      n3_lib_ria: node("library", P_RIA, "리아 공주",
        "\"소원 쪽지라니… 오늘 밤 꼭 같이 빌자!\" 리아가 책을 덮으며 손을 꼭 잡아요.",
        [
          { label: "좋아, 함께 발코니로 가요", next: "n4_tower", effect: { companion: "ria", clue: "wish" } },
          { label: "먼저 파티장부터 둘러보러 가요", next: "n4_dusk", effect: { companion: "ria" } }
        ]),
      n4_tower: {
        bg: "tower", bgImg: BG.tower,
        portrait: function (f) {
          if (f.companion === "puppy") return IMG_PUPPY;
          if (f.companion === "bear") return IMG_BEAR;
          if (f.companion === "sheep") return IMG_SHEEP;
          if (f.companion === "ria") return P_RIA;
          return P_ARA;
        },
        name: function (f) {
          if (f.companion === "puppy") return "몽실이";
          if (f.companion === "bear") return "곰돌이";
          if (f.companion === "sheep") return "구름이 (양)";
          if (f.companion === "ria") return "리아 공주";
          return "아라 공주";
        },
        text: function (f) {
          if (f.clue === "wish") return "바람결에 리본이 날려요. 하늘이 서서히 보랏빛으로 물들고, 첫 별이 반짝이기 시작해요. 소원을 빌기에 딱 좋은 시간이에요.";
          if (f.companion === "puppy") return "몽실이가 난간에 앞발을 올리고 하늘을 봐요. 저 멀리 파티 준비가 시작되는 소리가 들려요.";
          return "탑 발코니에서 내려다보니 정원에 등불이 하나씩 켜지기 시작해요. 별빛 파티가 가까워졌어요.";
        },
        choices: [
          { label: "첫 별에게 소원을 살며시 빌어요", next: "n5_party", effect: { wish: true, mood: "dreamy" } },
          { label: "종소리를 따라 파티장으로 내려가요", next: "n5_party", effect: {} }
        ]
      },
      n4_dusk: node("dusk", P_ARA, "아라 공주",
        "은은한 종소리가 정원 가득 울려 퍼져요. 드디어 별빛 정원 파티가 시작될 시간, 아라 공주는 오늘 하루를 떠올리며 미소 지어요.",
        [
          { label: "가장 좋아하는 모습 그대로, 자신 있게 걸어가요", next: "ENDING", effect: {} },
          { label: "한 번 더 매무새를 가다듬고 조심스레 들어가요", next: "ENDING", effect: { mood: "dreamy" } },
          { label: "잠깐, 벽난로 방에서 숨을 고르고 가요", next: "n5_fire", effect: { mood: "cozy" } }
        ]),
      n5_party: node("dusk", P_ARA, "아라 공주",
        "정원 입구에 이르자 음악과 웃음소리가 반겨 줘요. 오늘 하루가 작은 별들처럼 마음에 남아 있어요.",
        [
          { label: "파티장 한가운데로 들어가요", next: "ENDING", effect: {} },
          { label: "정원 가장자리를 천천히 걸어요", next: "ENDING", effect: { prefer: "wander" } },
          { label: "발코니로 다시 올라가 별을 봐요", next: "ENDING", effect: { prefer: "star" } }
        ]),
      n5_fire: node("fireplace", P_ARA, "아라 공주",
        "따뜻한 벽난로 앞에서 마음이 차분해져요. 파티 소리도 멀리서 포근하게 들리고, 오늘은 ‘나답게’ 보내도 괜찮다는 생각이 들어요.",
        [
          { label: "이대로 포근한 밤을 보내요", next: "ENDING", effect: { prefer: "cozy" } },
          { label: "기운을 차려 파티장으로 가요", next: "ENDING", effect: {} }
        ])
    },
    endings: {
      ball: {
        title: "반짝이는 별빛 무도회",
        bg: "ballroom", bgImg: BG.ballroom,
        text: "샹들리에 불빛 아래, 아라 공주는 별빛 드레스 자락을 살랑이며 무도회장 한가운데로 걸어 들어가요. 오늘 밤엔 성 전체가 그녀를 위해 반짝이는 것 같아요.",
        toast: "별빛 무도회의 주인공이 되었어요!"
      },
      heart: {
        title: "다정한 마음의 정원",
        bg: "heart", bgImg: BG.heart,
        text: function (f) {
          if (f.animal === "puppy") return "몽실이가 신나게 앞장서며 파티장까지 함께 걸어요. 사람들보다 몽실이의 재롱이 오늘 파티의 주인공이 된 것 같아요.";
          if (f.animal === "sheep") return "구름이(양)가 풀밭에서 폴짝이며 아라의 나란히 걸어요. 부드러운 울음소리가 오늘의 자장가처럼 들려요.";
          return "작은 곰돌이가 아라 공주의 손을 꼭 잡고 파티장에 들어서요. 함께 나눠 먹은 쿠키 냄새가 아직도 달콤하게 남아 있어요.";
        },
        toast: "다정한 친구와 함께하는 밤이 되었어요!"
      },
      wander: {
        title: "노을 정원의 산책자",
        bg: "wander", bgImg: BG.wander,
        text: "아라 공주는 화려한 파티장 대신, 노을이 물든 정원을 천천히 한 바퀴 걸어요. 저 멀리 들려오는 파티 소리를 배경음악 삼아, 오늘 하루의 자유로움을 마음껏 만끽해요.",
        toast: "나만의 자유로운 하루를 만끽했어요!"
      },
      star: {
        title: "첫별의 소원",
        bg: "balcony", bgImg: BG.balcony,
        text: "발코니에 홀로 서서 첫별에게 빌었던 소원이, 밤하늘 가득 잔잔한 빛으로 답해 오는 것 같아요. 파티의 환호보다 더 따뜻한 고요함이 마음을 감싸요.",
        toast: "첫별에게 소원을 전했어요!"
      },
      cozy: {
        title: "벽난로의 포근한 밤",
        bg: "fireplace", bgImg: BG.fireplace,
        text: "파티의 화려한 빛 대신, 벽난로 불꽃과 달콤한 코코아가 오늘을 완성해 줘요. 아라 공주는 이 고요함이 또 다른 종류의 축하임을 알아요.",
        toast: "포근한 나만의 밤을 보냈어요!"
      }
    },
    resolveEnding: function (f) {
      if (f.prefer === "cozy") return "cozy";
      if (f.prefer === "star" || f.wish) return "star";
      if (f.prefer === "wander") return "wander";
      if (f.animal && f.animal !== "none") return "heart";
      if (f.outfit === "elegant" || f.dress === "star") return "ball";
      return "wander";
    },
    flagLabels: function (f) {
      var OUTFIT = { elegant: "우아한 드레스", adventure: "활동적인 차림", cozy: "포근한 차림" };
      var MOOD = { cheerful: "발랄한 마음", dreamy: "몽환적인 마음", warm: "다정한 마음", brave: "용감한 마음", cozy: "포근한 마음" };
      var ANIMAL = { puppy: "몽실이", bear: "곰돌이", sheep: "구름이", none: "혼자" };
      return [OUTFIT[f.outfit] || "차림", MOOD[f.mood] || "마음", ANIMAL[f.animal] || "혼자"];
    },
    defaultFlags: { outfit: "cozy", mood: "cheerful", animal: "none" }
  };

  /* ========== 2. 비 오는 날의 다과회 ========== */
  var rainy = {
    id: "rainy",
    title: "비 오는 날의 다과회",
    subtitle: "빗소리와 따뜻한 차",
    desc: "갑자기 내린 비 속에서, 다과회와 작은 보물찾기를 즐겨요.",
    cover: BG.rainy_window,
    endingTotal: 3,
    start: "r1",
    nodes: {
      r1: node("rainy_window", P_ARA, "아라 공주",
        "창문에 빗방울이 또르르 흘러내려요. 오늘 야외 산책은 어려울 것 같지만, 실내에서 할 수 있는 특별한 일이 분명 있어요.",
        [
          { label: "응접실에서 다과회를 준비해요", next: "r2_parlor", effect: { plan: "tea" } },
          { label: "다락방에서 옛 보물을 찾아요", next: "r2_attic", effect: { plan: "treasure" } },
          { label: "온실로 가서 빗소리를 들어요", next: "r2_green", effect: { plan: "green" } }
        ]),
      r2_parlor: node("parlor", P_ARA, "아라 공주",
        "레이스 테이블보 위에 파스텔 다기와 마카롱을 올려요. 초인종이 울리더니 리아가 우산을 털며 들어와요.",
        [
          { label: "리아와 함께 차를 따라 마셔요", next: "r3_tea", effect: { guest: "ria", mood: "warm" } },
          { label: "창가 자리에서 빗소리를 감상해요", next: "r3_tea", effect: { mood: "dreamy" } },
          { label: "깜짝 케이크를 더 구우러 가요", next: "r3_bake", effect: { mood: "cheerful", treat: true } }
        ]),
      r3_bake: node("kitchen", P_ARA, "아라 공주",
        "비 오는 날의 오븐 열기가 유난히 포근해요. 갓 구운 케이크 향에 작은 고양이도 살금살금 다가와요.",
        [
          { label: "고양이에게 따뜻한 우유를 줘요", next: "r3_tea", effect: { animal: "kitten", mood: "warm" } },
          { label: "케이크를 들고 응접실로 돌아가요", next: "r3_tea", effect: { treat: true } }
        ]),
      r3_tea: {
        bg: "candle_tea", bgImg: BG.candle_tea,
        portrait: function (f) {
          if (f.animal === "kitten") return IMG_KITTEN;
          if (f.guest === "ria") return P_RIA;
          return P_ARA;
        },
        name: function (f) {
          if (f.animal === "kitten") return "냥이";
          if (f.guest === "ria") return "리아 공주";
          return "아라 공주";
        },
        text: function (f) {
          if (f.animal === "kitten") return "냥이가 무릎 위에 올라앉아 골골거리며, 빗소리와 촛불이 하루를 감싸 안아요.";
          if (f.guest === "ria") return "리아가 속삭여요. \"비 오는 날이 이렇게 달콤할 줄 몰랐어.\" 두 사람의 웃음이 찻잔만큼 따뜻해요.";
          return "홀로 마시는 차 한 잔이 생각보다 더 다정해요. 빗소리가 부드러운 자장가처럼 들려요.";
        },
        choices: [
          { label: "비가 그칠 때까지 이 자리를 지켜요", next: "ENDING", effect: { prefer: "candle" } },
          { label: "비가 잦아들면 정원 산책을 나가요", next: "r4_rain", effect: {} }
        ]
      },
      r2_attic: node("attic", P_ARA, "아라 공주",
        "다락방 먼지 속에 반짝이는 상자가 있어요. 뚜껑을 열자 어린 시절의 리본과 작은 음악 상자가 나타나요.",
        [
          { label: "음악 상자를 켜고 멜로디를 들어요", next: "r3_attic2", effect: { mood: "dreamy", find: "music" } },
          { label: "리본을 모아 리아에게 선물할 준비를 해요", next: "r3_attic2", effect: { mood: "warm", find: "ribbon" } }
        ]),
      r3_attic2: node("attic", P_RIA, "리아 공주",
        "\"이걸 찾았다고? 우리 어릴 때 같이 숨겼던 거잖아!\" 리아가 눈을 크게 뜨고 웃어요.",
        [
          { label: "함께 응접실로 내려가 차를 마셔요", next: "r3_tea", effect: { guest: "ria" } },
          { label: "음악 상자를 들고 온실로 가요", next: "r2_green", effect: { find: "music" } }
        ]),
      r2_green: node("greenhouse", P_ARA, "아라 공주",
        "유리 지붕에 떨어지는 빗소리가 음악처럼 울려요. 싱싱한 잎사귀 사이로 따뜻한 습기가 감돌아요.",
        [
          { label: "난초 사이에 앉아 책을 읽어요", next: "r4_rain", effect: { mood: "dreamy", place: "green" } },
          { label: "리아를 불러 함께 빗소리를 들어요", next: "r3_green2", effect: { mood: "warm" } }
        ]),
      r3_green2: node("greenhouse", P_RIA, "리아 공주",
        "\"온실이 우산보다 더 아늑하다니.\" 리아가 빗방울을 손가락으로 따라가며 속삭여요.",
        [
          { label: "함께 차 한잔 하러 응접실로 가요", next: "r3_tea", effect: { guest: "ria" } },
          { label: "비가 그친 정원으로 함께 나가요", next: "r4_rain", effect: { guest: "ria" } }
        ]),
      r4_rain: node("rain_garden", P_ARA, "아라 공주",
        "빗물이 고인 정원에 하늘이 비쳐요. 잎사귀가 반짝이고, 멀리 옅은 무지개가 살며시 걸려 있어요.",
        [
          { label: "무지개를 바라보며 하루를 마무리해요", next: "ENDING", effect: { prefer: "garden" } },
          { label: "다시 따뜻한 실내로 돌아가요", next: "ENDING", effect: { prefer: "candle" } }
        ])
    },
    endings: {
      candle: {
        title: "촛불 다과의 오후",
        bg: "candle_tea", bgImg: BG.candle_tea,
        text: "빗소리와 촛불, 달콤한 차 향기가 아라의 친구들의 하루를 포근하게 감싸 안아요. 바깥세상은 촉촉하고, 마음속은 따뜻해요.",
        toast: "빗속의 다과회를 완성했어요!"
      },
      garden: {
        title: "비 갠 정원의 무지개",
        bg: "rain_garden", bgImg: BG.rain_garden,
        text: "촉촉한 정원에서 무지개를 올려다보며, 비 오는 날도 모험이 될 수 있음을 알아요. 신발 끝의 물방울이 보석처럼 반짝여요.",
        toast: "비 갠 정원을 거닐었어요!"
      },
      treasure: {
        title: "다락방의 보물",
        bg: "attic", bgImg: BG.attic,
        text: "어린 시절의 음악 상자와 리본이 오늘의 선물이 되었어요. 빗소리 속에서 추억이 다시 노래해요.",
        toast: "다락방의 보물을 되찾았어요!"
      }
    },
    resolveEnding: function (f) {
      if (f.prefer === "garden") return "garden";
      if (f.find === "music" || f.find === "ribbon") return "treasure";
      return "candle";
    },
    flagLabels: function (f) {
      var PLAN = { tea: "다과회", treasure: "보물찾기", green: "온실 나들이" };
      var MOOD = { cheerful: "발랄", dreamy: "몽환", warm: "다정" };
      var WHO = { ria: "리아와 함께", kitten: "냥이와 함께" };
      var labels = [PLAN[f.plan] || "실내 하루", MOOD[f.mood] || "마음"];
      if (f.guest === "ria") labels.push(WHO.ria);
      else if (f.animal === "kitten") labels.push(WHO.kitten);
      else labels.push("나만의 시간");
      return labels;
    },
    defaultFlags: { plan: "tea", mood: "cheerful", animal: "none" }
  };

  /* ========== 3. 숲속 반딧불 축제 ========== */
  var firefly = {
    id: "firefly",
    title: "숲속 반딧불 축제",
    subtitle: "반짝이는 여름밤",
    desc: "등불을 따라 숲으로 들어가, 반딧불 축제에서 소원을 빌어요.",
    cover: BG.firefly,
    endingTotal: 4,
    start: "f1",
    nodes: {
      f1: node("lantern_path", P_ARA, "아라 공주",
        "해가 기울자 숲길 양쪽에 등불이 켜져요. 오늘 밤은 일 년에 한 번뿐인 반딧불 축제예요. 어디로 먼저 가볼까요?",
        [
          { label: "반딧불이 모이는 초원으로 가요", next: "f2_meadow", effect: { path: "meadow" } },
          { label: "버섯 요정의 원을 찾아가요", next: "f2_mush", effect: { path: "mushroom" } },
          { label: "시냇물 징검다리를 건너요", next: "f2_stream", effect: { path: "stream" } }
        ]),
      f2_meadow: node("firefly", P_ARA, "아라 공주",
        "풀잎 사이로 연초록 불빛이 숨 쉬듯 깜빡여요. 작은 강아지 몽실이가 불빛을 쫓아 폴짝거려요.",
        [
          { label: "몽실이와 함께 불빛을 따라가요", next: "f3_fest", effect: { animal: "puppy", mood: "cheerful" } },
          { label: "가만히 앉아 반딧불을 눈에 담아요", next: "f3_fest", effect: { mood: "dreamy" } }
        ]),
      f2_mush: node("mushroom", P_ARA, "아라 공주",
        "달빛 아래 파스텔 버섯들이 둥그렇게 서 있어요. 가운데에 작은 양피지 쪽지가 놓여 있어요. \"소원은 소나무에서.\"",
        [
          { label: "쪽지를 챙겨 축제장으로 가요", next: "f3_fest", effect: { clue: "wish", mood: "dreamy" } },
          { label: "버섯 원 안에서 잠시 춤을 춰 봐요", next: "f3_fest", effect: { mood: "cheerful", dance: true } }
        ]),
      f2_stream: node("stream", P_ARA, "아라 공주",
        "물 위에 뜬 등불이 천천히 흘러가요. 징검돌 너머에서 리아가 손을 흔들어요.",
        [
          { label: "리아와 손을 잡고 건너요", next: "f3_fest", effect: { companion: "ria", mood: "warm" } },
          { label: "등불 하나를 물에 띄워 보내요", next: "f3_fest", effect: { mood: "dreamy", lantern: true } }
        ]),
      f3_fest: {
        bg: "festival", bgImg: BG.festival,
        portrait: function (f) {
          if (f.animal === "puppy") return IMG_PUPPY;
          if (f.companion === "ria") return P_RIA;
          return P_ARA;
        },
        name: function (f) {
          if (f.animal === "puppy") return "몽실이";
          if (f.companion === "ria") return "리아 공주";
          return "아라 공주";
        },
        text: function (f) {
          if (f.animal === "puppy") return "축제 무대 앞에서 몽실이가 꼬리를 헬리콥터처럼 돌려요. 음악이 시작되고, 숲이 한꺼번에 반짝여요.";
          if (f.companion === "ria") return "리아가 속삭여요. \"오늘 밤 소원은 뭐야?\" 무대 위 꽃다발이 두 사람을 비춰요.";
          return "축제 무대에 꽃장식이 걸려 있고, 숲 전체가 숨을 고르듯 조용해졌다가 환호로 깨어나요.";
        },
        choices: [
          { label: "무대에서 다 함께 춤을 춰요", next: "f4_dance", effect: { prefer: "dance" } },
          { label: "소원 나무로 조용히 걸어가요", next: "f4_wish", effect: { prefer: "wish" } },
          { label: "음악이 흐르는 정자로 가요", next: "f4_gazebo", effect: { prefer: "music" } }
        ]
      },
      f4_dance: node("festival", P_ARA, "아라 공주",
        "발맞춰 춤을 추자 반딧불이 리듬에 맞춰 피어오르는 것 같아요. 오늘 밤은 발끝까지 반짝여요.",
        [
          { label: "마지막 곡까지 춤을 춰요", next: "ENDING", effect: { prefer: "dance" } },
          { label: "숨을 고르며 소원 나무로 가요", next: "f4_wish", effect: {} }
        ]),
      f4_wish: node("wish_tree", P_ARA, "아라 공주",
        "리본과 쪽지가 가득한 소원 나무 아래, 바람이 나뭇잎을 간질여요. 마음을 담아 작은 쪽지를 걸 시간이에요.",
        [
          { label: "친구와 행복을 비는 쪽지를 걸어요", next: "ENDING", effect: { prefer: "wish", mood: "warm" } },
          { label: "용기를 비는 쪽지를 걸어요", next: "ENDING", effect: { prefer: "wish", mood: "brave" } }
        ]),
      f4_gazebo: node("music_gazebo", P_RIA, "리아 공주",
        "정자 아래에서 잔잔한 선율이 흘러요. \"이런 밤이 영원하면 좋겠어.\" 리아의 목소리가 음악에 섞여요.",
        [
          { label: "음악에 기대어 밤을 보내요", next: "ENDING", effect: { prefer: "music" } },
          { label: "함께 소원 나무에도 가 봐요", next: "f4_wish", effect: { companion: "ria" } }
        ])
    },
    endings: {
      dance: {
        title: "반딧불 무도회",
        bg: "festival", bgImg: BG.festival,
        text: "숲속 무대에서 아라 공주와 친구들이 밤이 새도록 춤을 춰요. 반딧불이 조명 대신 하늘을 수놓아요.",
        toast: "반딧불 축제에서 춤을 췄어요!"
      },
      wish: {
        title: "소원 나무의 밤",
        bg: "wish_tree", bgImg: BG.wish_tree,
        text: "쪽지가 걸린 나뭇가지가 달빛에 흔들려요. 아라의 소원이 숲의 바람과 함께 멀리 날아가는 것만 같아요.",
        toast: "소원 나무에 마음을 걸었어요!"
      },
      music: {
        title: "정자의 밤음악회",
        bg: "music_gazebo", bgImg: BG.music_gazebo,
        text: "정자 아래 잔잔한 선율과 리아의 웃음이 오늘 밤을 완성해요. 축제의 함성보다 더 오래 남을 멜로디예요.",
        toast: "정자에서 밤음악을 들었어요!"
      },
      firefly: {
        title: "초원의 반딧불",
        bg: "firefly", bgImg: BG.firefly,
        text: "초원 한가운데 앉아 수많은 불빛을 바라봐요. 말은 없어도, 이 반짝임이 충분한 축복이에요.",
        toast: "반딧불 초원을 마음에 담았어요!"
      }
    },
    resolveEnding: function (f) {
      if (f.prefer === "dance" || f.dance) return "dance";
      if (f.prefer === "music") return "music";
      if (f.prefer === "wish" || f.clue === "wish") return "wish";
      if (f.path === "meadow" && f.mood === "dreamy") return "firefly";
      return "dance";
    },
    flagLabels: function (f) {
      var PATH = { meadow: "반딧불 초원", mushroom: "버섯의 원", stream: "등불 시냇물" };
      var MOOD = { cheerful: "발랄", dreamy: "몽환", warm: "다정", brave: "용기" };
      var WHO = { puppy: "몽실이와", ria: "리아와", alone: "홀로" };
      var who = f.animal === "puppy" ? WHO.puppy : (f.companion === "ria" ? WHO.ria : WHO.alone);
      return [PATH[f.path] || "숲길", MOOD[f.mood] || "마음", who];
    },
    defaultFlags: { path: "meadow", mood: "cheerful", animal: "none" }
  };

  return {
    list: [starlight, rainy, firefly],
    byId: { starlight: starlight, rainy: rainy, firefly: firefly },
    BG: BG
  };
})();
