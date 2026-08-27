/* Evony Age I i18n — EN default, KO optional */
(function (global) {
  const STR = {
    en: {
      lobby_sub: "Choose a server and raise your empire",
      server_open: "Open · Classic Age I",
      nick: "Lord name",
      quests: "Quests",
      reports: "Reports",
      wheel: "Fortune",
      reset: "Reset",
      reset_confirm: "Delete this lord and start over?",
      connected: "Connected to Server 1",
      gold: "Gold",
      food: "Food",
      wood: "Wood",
      stone: "Stone",
      iron: "Iron",
      pop: "Population",
      build: "Build / Upgrade",
      troops: "Train Troops",
      research: "Research",
      mail: "Mail / Reports",
      empty_queue: "No active queues",
      select_tile: "Tap a tile / building",
      attack: "Attack",
      scout: "Scout",
    },
    ko: {
      lobby_sub: "서버를 선택하고 제국을 키우세요",
      server_open: "개방 · 클래식 Age I",
      nick: "영주 이름",
      quests: "퀘스트",
      reports: "보고서",
      wheel: "행운의 바퀴",
      reset: "리셋",
      reset_confirm: "이 영주를 삭제하고 다시 시작할까요?",
      connected: "Server 1 접속됨",
      gold: "금",
      food: "식량",
      wood: "목재",
      stone: "석재",
      iron: "철",
      pop: "인구",
      build: "건설 / 업그레이드",
      troops: "병력 훈련",
      research: "연구",
      mail: "우편 / 보고서",
      empty_queue: "진행 중인 큐 없음",
      select_tile: "타일·건물을 탭하세요",
      attack: "공격",
      scout: "정찰",
    },
  };

  let lang = "en";
  try {
    lang = (global.SafeStorage && SafeStorage.getItem("evony1_lang")) || localStorage.getItem("evony1_lang") || "en";
  } catch (_) {}
  if (lang !== "ko") lang = "en";

  function t(key) {
    return (STR[lang] && STR[lang][key]) || STR.en[key] || key;
  }

  function setLang(next) {
    lang = next === "ko" ? "ko" : "en";
    try {
      if (global.SafeStorage) SafeStorage.setItem("evony1_lang", lang);
      else localStorage.setItem("evony1_lang", lang);
    } catch (_) {}
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  function toggle() {
    setLang(lang === "en" ? "ko" : "en");
  }

  global.EvonyI18n = { t, setLang, toggle, get lang() { return lang; } };
})(window);
