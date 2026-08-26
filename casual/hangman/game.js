(() => {
  "use strict";

  const LS_BEST = "hangman.beststreak";
  const LS_WINS = "hangman.wins";
  const LS_SOUND = "hangman_sound_v1";
  const MAX_MISSES = 7;

  const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
  const JONG = [
    null, "ㄱ", "ㄲ", ["ㄱ", "ㅅ"], "ㄴ", ["ㄴ", "ㅈ"], ["ㄴ", "ㅎ"], "ㄷ",
    "ㄹ", ["ㄹ", "ㄱ"], ["ㄹ", "ㅁ"], ["ㄹ", "ㅂ"], ["ㄹ", "ㅅ"], ["ㄹ", "ㅌ"], ["ㄹ", "ㅍ"], ["ㄹ", "ㅎ"],
    "ㅁ", "ㅂ", ["ㅂ", "ㅅ"], "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
  ];

  function decompose(ch) {
    const base = ch.charCodeAt(0) - 0xac00;
    if (base < 0 || base > 11171) return [ch];
    const jong = base % 28;
    const jung = ((base / 28) | 0) % 21;
    const cho = (base / 588) | 0;
    const out = [CHO[cho], JUNG[jung]];
    const jongs = JONG[jong];
    if (jongs) out.push(...jongs);
    return out;
  }

  const CATS = {
    animal: { label: "동물", icon: "🦁" },
    food: { label: "과일·음식", icon: "🍉" },
    country: { label: "나라", icon: "🌍" },
    sports: { label: "스포츠", icon: "⚽" },
    job: { label: "직업", icon: "👮" },
    thing: { label: "사물", icon: "🔧" },
  };

  const WORDS = [
    { c: "animal", w: "기린", h: "긴 목을 가진 초식동물" },
    { c: "animal", w: "코끼리", h: "코가 긴 육지 최대 동물" },
    { c: "animal", w: "호랑이", h: "숲의 왕이라 불리는 큰 맹수" },
    { c: "animal", w: "고래", h: "바다에 사는 가장 큰 동물" },
    { c: "animal", w: "다람쥐", h: "도토리를 좋아하는 귀여운 동물" },
    { c: "animal", w: "판다", h: "대나무를 먹는 흑백 곰" },
    { c: "animal", w: "펭귄", h: "남극에서 뒤뚱거리는 새" },
    { c: "animal", w: "원숭이", h: "나무타기의 달인" },
    { c: "animal", w: "하마", h: "입이 제일 큰 물가 동물" },
    { c: "animal", w: "낙타", h: "등에 혹이 있는 사막의 배" },
    { c: "animal", w: "사슴", h: "숲속에 사는 뿔 달린 동물" },
    { c: "animal", w: "두더지", h: "땅속에 굴을 파고 사는 동물" },
    { c: "animal", w: "거북이", h: "집을 등에 지고 느리게 가는 동물" },
    { c: "animal", w: "악어", h: "큰 강가의 무서운 파충류" },
    { c: "animal", w: "캥거루", h: "배에 주머니가 있는 호주 동물" },
    { c: "animal", w: "표범", h: "점박이 무늬의 빠른 맹수" },
    { c: "animal", w: "얼룩말", h: "줄무늬 옷을 입은 말" },
    { c: "animal", w: "참새", h: "처마 밑에서 노래하는 작은 새" },
    { c: "animal", w: "올빼미", h: "밤에 활동하는 둥근 얼굴의 새" },
    { c: "animal", w: "두꺼비", h: "여름밤에 우는 몸집 큰 개구리 친구" },

    { c: "food", w: "수박", h: "여름을 대표하는 과일" },
    { c: "food", w: "딸기", h: "겉에 씨가 촘촘한 붉은 과일" },
    { c: "food", w: "포도", h: "한 송이에 알알이 모인 과일" },
    { c: "food", w: "복숭아", h: "솜털이 돋아난 여름 과일" },
    { c: "food", w: "바나나", h: "껍질을 까서 먹는 길쭉한 과일" },
    { c: "food", w: "오렌지", h: "비타민이 가득한 주황빛 과일" },
    { c: "food", w: "체리", h: "줄기가 달린 작고 붉은 과일" },
    { c: "food", w: "감자", h: "땅속에서 자라는 둥근 채소" },
    { c: "food", w: "고구마", h: "껍질은 보랏빛 속은 노란 간식" },
    { c: "food", w: "김치", h: "한국 식탁의 대표 발효 음식" },
    { c: "food", w: "떡볶이", h: "매콤달콤한 대표 분식" },
    { c: "food", w: "삼겹살", h: "세 겹으로 된 돼지고기 구이" },
    { c: "food", w: "자장면", h: "검은 소스를 비벼 먹는 면 요리" },
    { c: "food", w: "치킨", h: "바삭하게 튀긴 닭 요리" },
    { c: "food", w: "피자", h: "치즈를 듬뿍 올려 구운 빵 요리" },
    { c: "food", w: "도넛", h: "가운데 구멍이 뚫린 과자 빵" },
    { c: "food", w: "햄버거", h: "빵 사이에 고기를 끼운 음식" },
    { c: "food", w: "주먹밥", h: "손으로 꾹꾹 뭉친 밥" },
    { c: "food", w: "미역국", h: "생일에 먹는 검은 국" },
    { c: "food", w: "라면", h: "삼 분이면 끓는 면 요리" },

    { c: "country", w: "한국", h: "김치와 한복의 나라" },
    { c: "country", w: "일본", h: "벚꽃과 후지산의 나라" },
    { c: "country", w: "중국", h: "만리장성이 있는 나라" },
    { c: "country", w: "미국", h: "자유의 여신상이 서 있는 나라" },
    { c: "country", w: "프랑스", h: "에펠탑이 있는 나라" },
    { c: "country", w: "이탈리아", h: "피자와 파스타의 고향" },
    { c: "country", w: "독일", h: "맥주와 소시지로 유명한 나라" },
    { c: "country", w: "브라질", h: "축구와 삼바의 나라" },
    { c: "country", w: "이집트", h: "사막 위 피라미드의 나라" },
    { c: "country", w: "인도", h: "타지마할이 있는 나라" },
    { c: "country", w: "러시아", h: "세계에서 가장 넓은 나라" },
    { c: "country", w: "캐나다", h: "단풍잎이 국기에 그려진 나라" },
    { c: "country", w: "호주", h: "캥거루와 코알라의 나라" },
    { c: "country", w: "스페인", h: "투우와 플라멩코의 나라" },
    { c: "country", w: "그리스", h: "올림픽이 시작된 나라" },
    { c: "country", w: "스위스", h: "알프스와 시계의 나라" },
    { c: "country", w: "멕시코", h: "타코와 고추의 나라" },
    { c: "country", w: "베트남", h: "쌀국수로 유명한 나라" },
    { c: "country", w: "태국", h: "방콕이 수도인 나라" },
    { c: "country", w: "터키", h: "두 대륙을 잇는 다리 나라" },

    { c: "sports", w: "축구", h: "발로 공을 차는 운동" },
    { c: "sports", w: "야구", h: "방망이와 글러브의 운동" },
    { c: "sports", w: "농구", h: "골대에 공을 넣는 운동" },
    { c: "sports", w: "배구", h: "네트 너머로 공을 넘기는 운동" },
    { c: "sports", w: "탁구", h: "작은 공과 라켓의 운동" },
    { c: "sports", w: "테니스", h: "노란 공을 라켓으로 치는 운동" },
    { c: "sports", w: "골프", h: "홀인원을 노리는 운동" },
    { c: "sports", w: "수영", h: "물에서 팔다리로 헤엄치는 운동" },
    { c: "sports", w: "마라톤", h: "긴 거리를 달리는 육상 경기" },
    { c: "sports", w: "스키", h: "눈 위에서 판을 신고 타는 운동" },
    { c: "sports", w: "스케이트", h: "얼음 위를 미끄러지듯 타는 운동" },
    { c: "sports", w: "태권도", h: "발차기가 강한 우리 무술" },
    { c: "sports", w: "유도", h: "상대를 메다 던지는 무술" },
    { c: "sports", w: "복싱", h: "글러브를 끼고 주먹으로 겨루는 운동" },
    { c: "sports", w: "사이클", h: "자전거를 타고 겨루는 경기" },
    { c: "sports", w: "서핑", h: "파도 위에서 판을 타는 운동" },
    { c: "sports", w: "클라이밍", h: "암벽을 오르는 운동" },
    { c: "sports", w: "요가", h: "호흡과 자세로 하는 운동" },
    { c: "sports", w: "줄넘기", h: "줄을 뛰며 하는 놀이 운동" },
    { c: "sports", w: "승마", h: "말을 타고 겨루는 운동" },

    { c: "job", w: "의사", h: "병원에서 환자를 진료하는 사람" },
    { c: "job", w: "선생님", h: "학교에서 학생을 가르치는 사람" },
    { c: "job", w: "경찰", h: "범인을 잡아 치안을 지키는 사람" },
    { c: "job", w: "소방관", h: "불을 끄는 용감한 사람" },
    { c: "job", w: "요리사", h: "맛있는 음식을 만드는 사람" },
    { c: "job", w: "화가", h: "그림을 그리는 사람" },
    { c: "job", w: "가수", h: "무대에서 노래하는 사람" },
    { c: "job", w: "배우", h: "영화에서 연기하는 사람" },
    { c: "job", w: "파일럿", h: "비행기를 조종하는 사람" },
    { c: "job", w: "간호사", h: "환자를 돌보는 병원 직업" },
    { c: "job", w: "변호사", h: "법정에서 변론하는 사람" },
    { c: "job", w: "판사", h: "법정에서 판결을 내리는 사람" },
    { c: "job", w: "농부", h: "논과 밭에서 곡식을 기르는 사람" },
    { c: "job", w: "어부", h: "배를 띄워 고기를 잡는 사람" },
    { c: "job", w: "목수", h: "나무를 다루어 집을 짓는 사람" },
    { c: "job", w: "미용사", h: "머리를 예쁘게 해 주는 사람" },
    { c: "job", w: "우체부", h: "편지와 소포를 배달하는 사람" },
    { c: "job", w: "과학자", h: "연구로 세상을 발견하는 사람" },
    { c: "job", w: "군인", h: "나라를 지키는 사람" },
    { c: "job", w: "승무원", h: "비행기 안에서 승객을 돌보는 사람" },

    { c: "thing", w: "우산", h: "비를 막아 주는 접는 물건" },
    { c: "thing", w: "시계", h: "시간을 알려 주는 물건" },
    { c: "thing", w: "안경", h: "잘 보게 해 주는 물건" },
    { c: "thing", w: "가방", h: "책과 물건을 넣어 메는 물건" },
    { c: "thing", w: "신발", h: "발을 보호하고 신는 물건" },
    { c: "thing", w: "모자", h: "머리에 쓰는 물건" },
    { c: "thing", w: "장갑", h: "손을 따뜻하게 해 주는 물건" },
    { c: "thing", w: "목도리", h: "목에 두르는 따뜻한 물건" },
    { c: "thing", w: "우체통", h: "편지를 넣는 빨간 통" },
    { c: "thing", w: "자전거", h: "두 바퀴로 달리는 탈것" },
    { c: "thing", w: "자동차", h: "바퀴 넷으로 달리는 탈것" },
    { c: "thing", w: "비행기", h: "하늘을 나는 큰 탈것" },
    { c: "thing", w: "기차", h: "선로 위를 달리는 긴 탈것" },
    { c: "thing", w: "로켓", h: "우주로 날아가는 탈것" },
    { c: "thing", w: "연필", h: "나무 심으로 글씨를 쓰는 도구" },
    { c: "thing", w: "지우개", h: "연필 글씨를 지우는 물건" },
    { c: "thing", w: "가위", h: "종이를 자르는 도구" },
    { c: "thing", w: "풍선", h: "바람을 넣으면 둥실 뜨는 물건" },
    { c: "thing", w: "거울", h: "내 모습을 비추는 물건" },
    { c: "thing", w: "열쇠", h: "잠긴 문을 여는 물건" },
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const api = { decompose, CHO, JUNG, JONG, WORDS, CATS, shuffle };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__hangman = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const storage = (() => {
    try {
      localStorage.setItem("__m", "1");
      localStorage.removeItem("__m");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const streakEl = document.getElementById("streak");
  const bestEl = document.getElementById("best");
  const winsEl = document.getElementById("wins");
  const btnSkip = document.getElementById("btn-skip");
  const catBadge = document.getElementById("cat-badge");
  const hintText = document.getElementById("hint-text");
  const gallowsSvg = document.getElementById("gallows");
  const chancesEl = document.getElementById("chances");
  const answerRow = document.getElementById("answer-row");
  const keysConEl = document.getElementById("keys-consonants");
  const keysVowEl = document.getElementById("keys-vowels");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const helpOverlay = document.getElementById("help-overlay");
  const btnSound = document.getElementById("btn-sound");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let entry = null;
  let syls = [];
  let guessed = new Set();
  let misses = 0;
  let locked = false;
  let streak = 0;
  let wins = parseInt(storage.getItem(LS_WINS), 10) || 0;
  let best = parseInt(storage.getItem(LS_BEST), 10) || 0;

  const SFX = {
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.5); },
    correct() { if (soundOn && window.CasualSfx) window.CasualSfx.play("success", 0.6); },
    wrong() { if (soundOn && window.CasualSfx) window.CasualSfx.play("fail", 0.55); },
    win() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "fanfare"], 90, 0.75); },
    lose() { if (soundOn && window.CasualSfx) window.CasualSfx.play("lose", 0.65); },
  };

  function syncSoundBtn() {
    btnSound.classList.toggle("muted", !soundOn);
  }

  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.setItem(LS_SOUND, soundOn ? "1" : "0");
    syncSoundBtn();
    if (window.CasualSfx) {
      window.CasualSfx.setEnabled(soundOn);
      if (soundOn) { window.CasualSfx.unlock(); SFX.click(); }
    }
  });

  if (window.CasualSfx) window.CasualSfx.setEnabled(soundOn);
  syncSoundBtn();

  window.addEventListener("pointerdown", () => {
    if (window.CasualSfx) window.CasualSfx.unlock();
  }, { once: true });

  function updateHud() {
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best);
    winsEl.textContent = String(wins);
  }

  function makeGroup(container, jamos) {
    container.innerHTML = jamos.map((j) =>
      `<button type="button" class="key" data-jamo="${j}" aria-label="${j}">${j}</button>`
    ).join("");
    container.querySelectorAll(".key").forEach((btn) => {
      btn.addEventListener("click", () => onKey(btn));
    });
  }

  function resetKeyboard() {
    document.querySelectorAll(".key").forEach((b) => {
      b.disabled = false;
      b.classList.remove("is-hit", "is-miss");
    });
  }

  function onKey(btn) {
    if (locked || btn.disabled || !helpOverlay.hidden) return;
    const jamo = btn.dataset.jamo;
    btn.disabled = true;
    guessed.add(jamo);
    const hit = syls.some((s) => !s.revealed && s.jamos.includes(jamo));
    if (hit) {
      btn.classList.add("is-hit");
      SFX.correct();
      updateAnswer(false);
      if (syls.every((s) => s.revealed)) endRound(true);
    } else {
      btn.classList.add("is-miss");
      misses += 1;
      updateChances();
      drawNextParts();
      SFX.wrong();
      if (misses >= MAX_MISSES) endRound(false);
    }
  }

  function updateAnswer(force) {
    answerRow.innerHTML = syls.map((s) => {
      const done = s.jamos.every((j) => guessed.has(j));
      if (done && !s.revealed) { s.revealed = true; s.just = true; }
      else if (force && !s.revealed) { s.revealed = true; s.forced = true; }
      if (!s.revealed) return '<span class="syl blank"></span>';
      const cls = s.just ? "syl pop" : s.forced ? "syl force" : "syl";
      return `<span class="${cls}">${s.ch}</span>`;
    }).join("");
    syls.forEach((s) => { s.just = false; });
  }

  function updateChances() {
    chancesEl.innerHTML = Array.from({ length: MAX_MISSES }, (_, i) =>
      `<i class="dot${i < misses ? " used" : ""}"></i>`
    ).join("");
  }

  function drawNextParts() {
    let delay = 0;
    gallowsSvg.querySelectorAll(".part:not(.drawn)").forEach((p) => {
      if (+p.dataset.stage <= misses) {
        setTimeout(() => p.classList.add("drawn"), delay);
        delay += 260;
      }
    });
  }

  function confetti() {
    const holder = document.createElement("div");
    holder.className = "confetti";
    const colors = ["#ff8a5b", "#ffcf5c", "#4fd8c4", "#ff6b6b", "#fff3e2"];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.background = colors[i % colors.length];
      s.style.setProperty("--dx", (Math.random() * 80 - 40).toFixed(0) + "px");
      s.style.setProperty("--rot", (Math.random() * 720 - 360).toFixed(0) + "deg");
      s.style.animationDuration = (1.6 + Math.random() * 1.2).toFixed(2) + "s";
      s.style.animationDelay = (Math.random() * 0.4).toFixed(2) + "s";
      holder.appendChild(s);
    }
    document.body.appendChild(holder);
    setTimeout(() => holder.remove(), 3400);
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  }

  function endRound(win) {
    locked = true;
    if (win) {
      streak += 1;
      wins += 1;
      if (streak > best) best = streak;
      storage.setItem(LS_BEST, String(best));
      storage.setItem(LS_WINS, String(wins));
      updateHud();
      SFX.win();
      confetti();
      setTimeout(() => showResult(true), 950);
    } else {
      streak = 0;
      updateHud();
      SFX.lose();
      updateAnswer(true);
      setTimeout(() => showResult(false), 950);
    }
  }

  function showResult(win) {
    if (win) {
      overlayCard.innerHTML = `
        <h2>정답!</h2>
        ${streak >= 2 ? `<span class="new-best">🔥 ${streak}연속 정답!</span>` : ""}
        <div class="answer-word">${entry.w}</div>
        <div class="result-row">
          <div class="result-item"><span class="result-num">${streak}</span><span class="result-label">연속</span></div>
          <div class="result-item"><span class="result-num">${best}</span><span class="result-label">최고연속</span></div>
          <div class="result-item"><span class="result-num">${wins}</span><span class="result-label">승리</span></div>
        </div>
        <button type="button" class="retry" id="btn-next">다음 단어</button>
      `;
      document.getElementById("btn-next").onclick = () => {
        SFX.click();
        newRound();
      };
    } else {
      overlayCard.innerHTML = `
        <h2>아쉬워요!</h2>
        <p>인형이 완성되었어요. 정답은...</p>
        <div class="answer-word">${entry.w}</div>
        <p>연속 기록이 초기화되었어요. 다시 도전해보세요!</p>
        <button type="button" class="retry" id="btn-retry">재도전</button>
      `;
      document.getElementById("btn-retry").onclick = () => {
        SFX.click();
        newRound();
      };
    }
    overlay.hidden = false;
  }

  const queue = [];
  let lastWord = "";

  function nextEntry() {
    if (!queue.length) {
      queue.push(...shuffle(WORDS));
      if (lastWord && queue[0].w === lastWord) {
        const k = 1 + Math.floor(Math.random() * (queue.length - 1));
        [queue[0], queue[k]] = [queue[k], queue[0]];
      }
    }
    const e = queue.shift();
    lastWord = e.w;
    return e;
  }

  function newRound() {
    entry = nextEntry();
    syls = [...entry.w].map((ch) => ({ ch, jamos: decompose(ch), revealed: false, just: false, forced: false }));
    guessed = new Set();
    misses = 0;
    locked = false;
    overlay.hidden = true;
    const cat = CATS[entry.c];
    catBadge.textContent = `${cat.icon} ${cat.label}`;
    hintText.textContent = entry.h;
    gallowsSvg.querySelectorAll(".part").forEach((p) => p.classList.remove("drawn"));
    resetKeyboard();
    updateChances();
    answerRow.innerHTML = "";
    updateAnswer(false);
    updateHud();
  }

  btnSkip.addEventListener("click", () => {
    if (locked) return;
    SFX.click();
    streak = 0;
    updateHud();
    toast("포기! 연속 기록 초기화");
    newRound();
  });

  function openHelp() {
    if (!helpOverlay.hidden) return;
    SFX.click();
    helpOverlay.hidden = false;
    btnHelpClose.focus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
  }

  btnHelp.addEventListener("click", openHelp);
  btnHelpClose.addEventListener("click", () => {
    SFX.click();
    closeHelp();
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  makeGroup(keysConEl, CHO);
  makeGroup(keysVowEl, JUNG);
  newRound();
})();
