/** 동급생 — 장소·시간·학기 정의 (고교 배경, 전원 19+) */
window.DK_PLACES = [
  { id: "home", name: "우리 집", icon: "🏠", slots: ["morning", "afternoon", "evening", "night"], rest: true },
  { id: "classroom", name: "교실", icon: "📚", slots: ["morning", "afternoon"] },
  { id: "gym", name: "체육관", icon: "🏀", slots: ["afternoon", "evening"] },
  { id: "cafeteria", name: "학생식당", icon: "🍱", slots: ["morning", "afternoon", "evening"] },
  { id: "park", name: "학교 앞 공원", icon: "🌳", slots: ["morning", "afternoon", "evening"] },
  { id: "arcade", name: "게임센터", icon: "🕹️", slots: ["evening", "night"] },
  { id: "convenience", name: "편의점 알바", icon: "🏪", slots: ["evening", "night"] },
  { id: "rooftop", name: "학교 옥상", icon: "🌙", slots: ["evening", "night"] },
  { id: "lovehotel", name: "성인 러브텔", icon: "🔞", slots: ["evening", "night"], adult: true },
  { id: "mansion", name: "유나 저택", icon: "🏛️", slots: ["evening", "night"], adult: true },
];

window.DK_SLOTS = [
  { id: "morning", name: "아침", next: "afternoon" },
  { id: "afternoon", name: "점심·오후", next: "evening" },
  { id: "evening", name: "저녁", next: "night" },
  { id: "night", name: "밤", next: null },
];

/** 학기 길이 (일). 마지막 날 문화제 → 엔딩. */
window.DK_MAX_DAY = 14;
/** 문화제가 열리는 날 (>= 이 날부터 festival 장소 노출) */
window.DK_FESTIVAL_DAY = 13;
