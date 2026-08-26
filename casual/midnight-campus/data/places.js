/** 미드나잇 캠퍼스 — 장소·시간 정의 */
window.MC_PLACES = [
  { id: "dorm", name: "기숙사", icon: "🛏️", slots: ["morning", "afternoon", "evening", "night"], rest: true },
  { id: "lecture", name: "강의동", icon: "📚", slots: ["morning", "afternoon"] },
  { id: "library", name: "도서관", icon: "📖", slots: ["morning", "afternoon", "evening"] },
  { id: "cafeteria", name: "학생식당", icon: "🍱", slots: ["morning", "afternoon", "evening"] },
  { id: "gym", name: "체육관", icon: "🏃", slots: ["afternoon", "evening"] },
  { id: "cafe", name: "캠퍼스 카페", icon: "☕", slots: ["afternoon", "evening", "night"] },
  { id: "rooftop", name: "옥상", icon: "🌙", slots: ["evening", "night"] },
  { id: "station", name: "역 앞", icon: "🚉", slots: ["evening", "night"] },
  { id: "park", name: "캠퍼스 공원", icon: "🌸", slots: ["morning", "afternoon", "evening"] },
  { id: "lab", name: "연구실", icon: "🔬", slots: ["afternoon", "evening", "night"] },
  { id: "council", name: "학생회실", icon: "📋", slots: ["afternoon", "evening"] },
  { id: "music", name: "연습실", icon: "🎹", slots: ["afternoon", "evening", "night"] },
];

window.MC_SLOTS = [
  { id: "morning", name: "아침", next: "afternoon" },
  { id: "afternoon", name: "오후", next: "evening" },
  { id: "evening", name: "저녁", next: "night" },
  { id: "night", name: "밤", next: null },
];

window.MC_MAX_DAY = 21;
