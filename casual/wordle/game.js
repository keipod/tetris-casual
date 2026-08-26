(() => {
  "use strict";

  /* ── 한글 자모 테이블 ──────────────────────────────────────
     초성 19 / 중성 21 / 종성 27(0번 = 받침 없음)
     조합: code = 0xAC00 + 초*588 + 중*28 + 종                        */
  const CHOS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const JUNGS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const JONGS = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

  const CHO_INDEX = {};
  [...CHOS].forEach((c, i) => { CHO_INDEX[c] = i; });
  const JUNG_INDEX = {};
  [...JUNGS].forEach((c, i) => { JUNG_INDEX[c] = i; });
  const JONG_INDEX = {};
  [...JONGS].forEach((c, i) => { JONG_INDEX[c] = i + 1; });

  // 종성 인덱스(1~27)를 구성 자음으로 분해 (분리·역조합·물리키보드용)
  const JONG_PARTS = [
    "ㄱ", "ㄱㄱ", "ㄱㅅ", "ㄴ", "ㄴㅈ", "ㄴㅎ", "ㄷ", "ㄹ", "ㄹㄱ", "ㄹㅁ", "ㄹㅂ",
    "ㄹㅅ", "ㄹㅌ", "ㄹㅍ", "ㄹㅎ", "ㅁ", "ㅂ", "ㅂㅅ", "ㅅ", "ㅅㅅ", "ㅇ", "ㅈ",
    "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
  ];

  // 겹받침 조합: (현재 받침 첫 자음 + 새 자음) → 새 종성 인덱스
  const COMPOUND = {};
  [[1, "ㄱ", 2], [1, "ㅅ", 3], [4, "ㅈ", 5], [4, "ㅎ", 6], [8, "ㄱ", 9],
   [8, "ㅁ", 10], [8, "ㅂ", 11], [8, "ㅅ", 12], [8, "ㅌ", 13], [8, "ㅍ", 14],
   [8, "ㅎ", 15], [17, "ㅅ", 18]]
    .forEach(([a, b, r]) => { COMPOUND[JONG_PARTS[a - 1] + b] = r; });

  function compose(cho, jung, jong) {
    return String.fromCharCode(0xac00 + cho * 588 + jung * 28 + (jong || 0));
  }

  function decompose(s) {
    const base = s.charCodeAt(0) - 0xac00;
    if (base < 0 || base > 11171) return null;
    return { cho: Math.floor(base / 588), jung: Math.floor(base / 28) % 21, jong: base % 28 };
  }

  // 타일 문자열 → 판정용 자모 배열 (완성 음절은 초/중/종, 낱자모는 그 문자 자체)
  function jamosOf(s) {
    const d = s.length === 1 ? decompose(s) : null;
    if (!d) return [s];
    const out = [CHOS[d.cho], JUNGS[d.jung]];
    if (d.jong) out.push(JONGS[d.jong - 1]);
    return out;
  }

  /* ── 미니 IME ──────────────────────────────────────────────
     버퍼 상태: empty | cho(낱자음) | vow(낱모음) | syl(조합 중인 음절)
     모든 입력 직전 스냅샷을 스택에 쌓아 Backspace로 한 단계씩 되돌린다
     (받침 제거 → 중성 제거 → 삭제 체인이 스냅샷 복원으로 정확히 성립)  */
  function imeNew() {
    return { row: [], buf: { t: "empty" }, undo: [] };
  }

  function bufStr(b) {
    if (b.t === "cho") return CHOS[b.c];
    if (b.t === "vow") return JUNGS[b.v];
    if (b.t === "syl") return compose(b.c, b.v, b.j);
    return "";
  }

  function slotCount(st) {
    return st.row.length + (st.buf.t === "empty" ? 0 : 1);
  }

  function imeCommit(st) {
    st.row.push(bufStr(st.buf));
    st.buf = { t: "empty" };
  }

  function imeInput(st, ch) {
    st.undo.push({ len: st.row.length, buf: { ...st.buf } });
    if (JUNG_INDEX[ch] !== undefined) {
      const v = JUNG_INDEX[ch];
      switch (st.buf.t) {
        case "empty": st.buf = { t: "vow", v }; break;
        case "cho": st.buf = { t: "syl", c: st.buf.c, v, j: 0 }; break;
        case "vow": st.buf = { t: "vow", v }; break;
        case "syl": {
          if (st.buf.j === 0) {
            imeCommit(st);
            st.buf = { t: "vow", v };
          } else {
            // 모음 앞에서 받침 분리: 말+ㅣ → 마|리, 닯+ㅐ → 달|새
            const parts = JONG_PARTS[st.buf.j - 1];
            if (parts.length === 1) {
              st.buf.j = 0;
              imeCommit(st);
              st.buf = { t: "syl", c: CHO_INDEX[parts], v, j: 0 };
            } else {
              st.buf.j = JONG_INDEX[parts[0]];
              imeCommit(st);
              st.buf = { t: "syl", c: CHO_INDEX[parts[1]], v, j: 0 };
            }
          }
          break;
        }
      }
    } else {
      const c = CHO_INDEX[ch];
      switch (st.buf.t) {
        case "empty":
        case "cho": st.buf = { t: "cho", c }; break;
        case "vow": imeCommit(st); st.buf = { t: "cho", c }; break;
        case "syl": {
          if (st.buf.j === 0) {
            const j = JONG_INDEX[ch];
            if (j) st.buf.j = j;
            else { imeCommit(st); st.buf = { t: "cho", c }; } // ㄸㅃㅉ 등 받침 불가
          } else {
            const cur = JONG_PARTS[st.buf.j - 1];
            const comp = COMPOUND[cur + ch];
            if (comp) st.buf.j = comp;
            else { imeCommit(st); st.buf = { t: "cho", c }; }
          }
          break;
        }
      }
    }
    if (slotCount(st) > 5) {
      const u = st.undo.pop();
      st.buf = u.buf;
      st.row.length = u.len;
      return false;
    }
    return true;
  }

  function imeBackspace(st) {
    if (st.undo.length) {
      const u = st.undo.pop();
      st.buf = { ...u.buf };
      st.row.length = u.len;
      return true;
    }
    if (st.row.length) {
      st.row.pop();
      return true;
    }
    return false;
  }

  function imeText(st) {
    return st.row.join("") + bufStr(st.buf);
  }

  // 정답의 표준 자모열(무음 ㅇ 포함)을 IME에 통과시켜 왕복 검증
  function streamOf(word) {
    const out = [];
    for (const ch of word) {
      const d = decompose(ch);
      out.push(CHOS[d.cho], JUNGS[d.jung]);
      if (d.jong) for (const p of JONG_PARTS[d.jong - 1]) out.push(p);
    }
    return out;
  }

  function simulateType(word) {
    const st = imeNew();
    for (const ch of streamOf(word)) imeInput(st, ch);
    return imeText(st);
  }

  /* ── 정답 목록 ─────────────────────────────────────────────
     온스크린 자판(ㅂㅈㄷㄱㅅㅛ/ㅕㅑㅐㅔㅣ/ㅁㄴㅇㄹㅎㅗ/ㅓㅏㅜ)으로
     직접 입력 가능한 다섯 글자 단어만 수록했다.
     사전 확인은 하지 않으며, 어떤 다섯 글자든 제출할 수 있다.       */
  const ANSWERS = [
    // 음식
    "소고기무국", "소머리국밥", "오이소박이", "전자레인지", "단무지김밥",
    "오징어순대", "다시마국수", "고사리나물", "호박고구마", "순두부백반",
    "가자미구이", "골뱅이국수", "나물비빔밥", "김밥도시락",
    "오징어젓갈", "우거지국밥", "시래기국밥", "순대국밥집", "누룽지국물", "도라지나물", "말린고사리", "말린시래기", "메밀막국수",
    "비빔막국수", "물만두국물",
    // 학교 · 놀이
    "학교운동장", "동네운동장", "말하기시험", "수학문제집", "국어문제집",
    "영어문제집", "학교종소리", "새벽종소리", "장난감상자", "장난감정리",
    "인형놀이방", "백설공주님", "이야기시간", "학교문구점", "모래성놀이",
    "기억력시험", "집중력시험", "색종이접기", "학교신문사",
    "열람실자리", "열람실이용", "낙서지우기", "우리말놀이", "우리말시간",
    "시낭송하기", "이야기짓기", "이야기결말", "지난이야기", "인사나누기",
    // 사물 · 생활
    "진주목걸이", "서랍정리함", "신발정리함", "옷장정리함", "문구정리함",
    "종이비행기", "곰돌이인형", "장난감가게", "옷갈아입기", "머리말리기",
    "만가닥버섯",
    // 자연 · 동물
    "장수잠자리", "개구리소리", "종달새노래", "빗방울소리", "복숭아나무",
    "아기고양이", "바다거북이", "너도밤나무", "상수리나무", "감나무열매",
    "갈매기무리", "잠자리날개", "공사장소리", "개구리무리", "무지개다리",
    // 사람 · 일상
    "할머니손맛", "할머니집밥", "강아지목줄", "강아지간식", "고양이간식",
    "고양이목욕", "강아지목욕", "고양이낮잠", "강아지낮잠",
    "아기자장가", "자장가노래", "달리기시합", "소망매달기", "소망비행기",
    "비행기놀이", "비행기여행", "여행준비물", "길고양이밥", "아기강아지",
    "아기병아리",   ];

  /* ── 판정: 두 패스 복제글자 처리 ───────────────────────────
     1패스: 음절 전체가 같으면 초록.
     2패스: 초록이 아닌 정답 칸들의 자모를 개수 풀에 넣고,
            추측 칸의 자모(초·중·종)를 순서대로 소비하며 하나라도
            남아 있으면 노랑. 타일은 통째로 한 색으로 칠한다.        */
  function evaluate(guess, answer) {
    const res = Array(5).fill("absent");
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) res[i] = "correct";
    }
    const pool = new Map();
    for (let i = 0; i < 5; i++) {
      if (res[i] === "correct") continue;
      for (const j of jamosOf(answer[i])) pool.set(j, (pool.get(j) || 0) + 1);
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === "correct") continue;
      let hit = false;
      for (const j of jamosOf(guess[i])) {
        const n = pool.get(j) || 0;
        if (n > 0) { pool.set(j, n - 1); hit = true; }
      }
      res[i] = hit ? "present" : "absent";
    }
    return res;
  }

  const api = {
    ANSWERS, compose, decompose, jamosOf, evaluate, simulateType,
    imeNew, imeInput, imeBackspace, imeText, bufStr, slotCount, streamOf,
  };
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__wordle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  const LS_SOUND = "wordle_sound_v1";
  const LS_PLAYED = "wordle.played";
  const LS_WINS = "wordle.wins";
  const LS_STREAK = "wordle.streak";
  const LS_BEST = "wordle.best";
  const LS_DIST = "wordle.dist";
  const ROWS = 6;
  const COLS = 5;
  const STAGGER_MS = 300;
  const FLIP_MS = 520;

  const storage = (() => {
    try {
      localStorage.setItem("__w", "1");
      localStorage.removeItem("__w");
      return localStorage;
    } catch (_) {
      return { getItem: () => null, setItem: () => {} };
    }
  })();

  const board = document.getElementById("board");
  const pad = document.getElementById("pad");
  const toastEl = document.getElementById("toast");
  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlay-card");
  const helpOverlay = document.getElementById("help-overlay");
  const btnHelp = document.getElementById("btn-help");
  const btnHelpClose = document.getElementById("btn-help-close");
  const btnStats = document.getElementById("btn-stats");
  const btnSound = document.getElementById("btn-sound");

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let answer = "";
  let st = imeNew();
  let rowIdx = 0;
  let locked = false;
  let over = false;
  let history = [];
  let pool = [];
  let pending = [];

  const SFX = {
    tap() { if (soundOn && window.CasualSfx) window.CasualSfx.play("tap", 0.45); },
    click() { if (soundOn && window.CasualSfx) window.CasualSfx.play("click", 0.55); },
    slide() { if (soundOn && window.CasualSfx) window.CasualSfx.play("slide", 0.5); },
    warn() { if (soundOn && window.CasualSfx) window.CasualSfx.play("warn", 0.6); },
    win() { if (soundOn && window.CasualSfx) window.CasualSfx.playSeq(["success", "clear", "level", "fanfare"], 85, 0.75); },
    lose() { if (soundOn && window.CasualSfx) window.CasualSfx.play("lose", 0.65); },
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function later(fn, ms) {
    pending.push(setTimeout(fn, ms));
  }

  function clearPending() {
    pending.forEach(clearTimeout);
    pending = [];
  }

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => { toastEl.hidden = true; }, 220);
    }, 1600);
  }

  function readStats() {
    return {
      played: +(storage.getItem(LS_PLAYED) || 0),
      wins: +(storage.getItem(LS_WINS) || 0),
      streak: +(storage.getItem(LS_STREAK) || 0),
      best: +(storage.getItem(LS_BEST) || 0),
      dist: JSON.parse(storage.getItem(LS_DIST) || "[0,0,0,0,0,0]"),
    };
  }

  function writeStats(s) {
    storage.setItem(LS_PLAYED, String(s.played));
    storage.setItem(LS_WINS, String(s.wins));
    storage.setItem(LS_STREAK, String(s.streak));
    storage.setItem(LS_BEST, String(s.best));
    storage.setItem(LS_DIST, JSON.stringify(s.dist));
  }

  function buildBoard() {
    board.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "row";
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        row.appendChild(tile);
      }
      board.appendChild(row);
    }
  }

  const KEY_ROWS = [
    ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅅ", "ㅛ"],
    ["ㅕ", "ㅑ", "ㅐ", "ㅔ", "ㅣ"],
    ["ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅎ", "ㅗ"],
    ["ㅓ", "ㅏ", "ㅜ", "⌫", "↵"],
  ];

  function buildPad() {
    pad.innerHTML = "";
    KEY_ROWS.forEach((keys) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      keys.forEach((k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "key";
        b.dataset.key = k;
        b.textContent = k;
        if (k === "⌫") { b.classList.add("wide", "back"); b.setAttribute("aria-label", "지우기"); }
        if (k === "↵") { b.classList.add("wide", "enter"); b.setAttribute("aria-label", "제출"); }
        b.addEventListener("click", () => onKey(k));
        rowEl.appendChild(b);
      });
      pad.appendChild(rowEl);
    });
  }

  function keyEl(k) {
    return pad.querySelector(`.key[data-key="${k}"]`);
  }

  function renderCurrent(popLast) {
    const rowEl = board.children[rowIdx];
    if (!rowEl) return;
    const tiles = rowEl.children;
    for (let i = 0; i < COLS; i++) {
      const tile = tiles[i];
      let text = "";
      if (i < st.row.length) text = st.row[i];
      else if (i === st.row.length && st.buf.t !== "empty") text = bufStr(st.buf);
      tile.textContent = text;
      tile.classList.toggle("filled", text.length > 0);
      tile.classList.toggle("active", i === st.row.length && !over && !locked);
      if (popLast && text && i === slotCount(st) - 1) {
        tile.style.animationName = "none";
        void tile.offsetWidth;
        tile.style.animationName = "";
      }
    }
  }

  function onKey(k) {
    if (locked || over || !helpOverlay.hidden || !overlay.hidden) return;
    if (k === "↵") { submit(); return; }
    if (k === "⌫") {
      if (imeBackspace(st)) { SFX.tap(); renderCurrent(); }
      return;
    }
    if (imeInput(st, k)) { SFX.tap(); renderCurrent(true); }
  }

  function warnIncomplete() {
    SFX.warn();
    toast("다섯 글자를 완성하세요");
    const rowEl = board.children[rowIdx];
    if (rowEl) {
      rowEl.classList.remove("shake");
      void rowEl.offsetWidth;
      rowEl.classList.add("shake");
    }
  }

  function submit() {
    if (slotCount(st) < 5 || st.buf.t !== "empty") { warnIncomplete(); return; }
    const guess = st.row.join("");
    locked = true;
    renderCurrent();
    SFX.click();
    const colors = evaluate(guess, answer);
    history.push({ guess, colors });
    revealRow(colors, () => afterReveal(guess, colors));
  }

  const COLOR_CLASS = { correct: "correct", present: "present", absent: "absent" };

  function revealRow(colors, done) {
    const rowEl = board.children[rowIdx];
    const tiles = rowEl.children;
    for (let i = 0; i < COLS; i++) {
      later(() => {
        tiles[i].classList.add("reveal");
        SFX.slide();
      }, i * STAGGER_MS);
      later(() => tiles[i].classList.add(COLOR_CLASS[colors[i]]), i * STAGGER_MS + FLIP_MS / 2);
    }
    later(done, COLS * STAGGER_MS + FLIP_MS);
  }

  function updateKeyColors(guess, colors) {
    const rank = { absent: 0, present: 1, correct: 2 };
    for (let i = 0; i < COLS; i++) {
      for (const jamo of jamosOf(guess[i])) {
        const el = keyEl(jamo);
        if (!el) continue;
        const cur = el.dataset.state || "absent";
        if (rank[colors[i]] > rank[cur]) {
          el.dataset.state = colors[i];
          el.classList.remove("k-absent", "k-present", "k-correct");
          el.classList.add(`k-${colors[i]}`);
        }
      }
    }
  }

  function resetKeyColors() {
    pad.querySelectorAll(".key").forEach((el) => {
      delete el.dataset.state;
      el.classList.remove("k-absent", "k-present", "k-correct");
    });
  }

  function afterReveal(guess, colors) {
    updateKeyColors(guess, colors);
    const won = guess === answer;
    if (won) {
      over = true;
      jumpRow(rowIdx);
      recordResult(true, rowIdx + 1);
      SFX.win();
      later(() => showResult(true), 1100);
    } else if (rowIdx === ROWS - 1) {
      over = true;
      recordResult(false, 0);
      SFX.lose();
      later(() => showResult(false), 800);
    } else {
      rowIdx += 1;
      st = imeNew();
      locked = false;
      renderCurrent();
    }
  }

  function jumpRow(idx) {
    const tiles = board.children[idx].children;
    for (let i = 0; i < COLS; i++) {
      later(() => {
        tiles[i].classList.add("jump");
        tiles[i].addEventListener("animationend", () => tiles[i].classList.remove("jump"), { once: true });
      }, i * 90);
    }
  }

  function recordResult(win, attempts) {
    const s = readStats();
    s.played += 1;
    if (win) {
      s.wins += 1;
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
      s.dist[attempts - 1] += 1;
    } else {
      s.streak = 0;
    }
    writeStats(s);
  }

  function emojiGrid() {
    return history.map((h) => h.colors.map((c) => ({ correct: "🟩", present: "🟨", absent: "⬜" }[c])).join("")).join("\n");
  }

  async function copyResult() {
    const last = history[history.length - 1];
    const tries = last ? last.colors.filter((c) => c === "correct").length === COLS ? history.length : "X" : "X";
    const text = `워들 ${tries}/${ROWS}\n${emojiGrid()}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("복사됨!");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("복사됨!");
      } catch (_2) {
        toast("복사에 실패했어요");
      }
      ta.remove();
    }
  }

  function statChipsHtml(s) {
    const rate = s.played ? Math.round((s.wins / s.played) * 100) : 0;
    return `
      <div class="stat-chips">
        <span class="stat-chip"><span class="stat-num">${s.played}</span><span class="stat-label">플레이</span></span>
        <span class="stat-chip"><span class="stat-num">${rate}%</span><span class="stat-label">승률</span></span>
        <span class="stat-chip"><span class="stat-num">${s.streak}</span><span class="stat-label">연속</span></span>
        <span class="stat-chip"><span class="stat-num">${s.best}</span><span class="stat-label">최고</span></span>
      </div>`;
  }

  function distHtml(s, currentAttempts) {
    const max = Math.max(...s.dist, 1);
    const rows = [];
    for (let i = 0; i < ROWS; i++) {
      const isCur = currentAttempts === i + 1;
      rows.push(`
        <div class="dist-row${isCur ? " is-current" : ""}">
          <span class="dist-label">${i + 1}</span>
          <span class="dist-track"><span class="dist-fill" style="width:${Math.max((s.dist[i] / max) * 100, s.dist[i] ? 12 : 0)}%">${s.dist[i] || ""}</span></span>
          <span class="dist-count">${s.dist[i]}</span>
        </div>`);
    }
    return `<div class="dist">${rows.join("")}</div>`;
  }

  function showResult(win) {
    const s = readStats();
    const title = win ? "🎉 정답!" : "😢 아쉬워요";
    const answerLine = win ? "" : `<p class="answer-line">정답<b>${answer}</b></p>`;
    const attempts = win ? history.length : 0;
    overlayCard.innerHTML = `
      <h2>${title}</h2>
      ${answerLine}
      ${statChipsHtml(s)}
      <p class="answer-line" style="font-size:13px!important;margin-bottom:8px!important">시도 횟수 분포</p>
      ${distHtml(s, attempts)}
      <div class="btn-row">
        <button type="button" class="ghost" id="btn-copy">결과 복사</button>
        <button type="button" id="btn-again">새 게임</button>
      </div>`;
    overlay.hidden = false;
    document.getElementById("btn-copy").onclick = () => { SFX.click(); copyResult(); };
    document.getElementById("btn-again").onclick = () => { SFX.click(); newGame(); };
  }

  function showStatsOnly() {
    const s = readStats();
    overlayCard.innerHTML = `
      <h2>📊 통계</h2>
      ${statChipsHtml(s)}
      <p class="answer-line" style="font-size:13px!important;margin-bottom:8px!important">시도 횟수 분포</p>
      ${distHtml(s, 0)}
      <div class="btn-row">
        <button type="button" id="btn-close-stats">닫기</button>
      </div>`;
    overlay.hidden = false;
    document.getElementById("btn-close-stats").onclick = () => { SFX.click(); overlay.hidden = true; };
  }

  function pickAnswer() {
    if (!pool.length) pool = shuffle(ANSWERS);
    return pool.pop();
  }

  function newGame() {
    clearPending();
    answer = pickAnswer();
    st = imeNew();
    rowIdx = 0;
    locked = false;
    over = false;
    history = [];
    buildBoard();
    resetKeyColors();
    overlay.hidden = true;
    renderCurrent();
  }

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
  btnHelpClose.addEventListener("click", () => { SFX.click(); closeHelp(); });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  btnStats.addEventListener("click", () => { SFX.click(); showStatsOnly(); });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !over) overlay.hidden = true;
  });

  const DUBEOLSIK = {
    q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
    a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
    z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  };

  document.addEventListener("keydown", (e) => {
    if (!helpOverlay.hidden) {
      if (e.key === "Escape") closeHelp();
      return;
    }
    if (!overlay.hidden) {
      if (e.key === "Escape" && !over) overlay.hidden = true;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter") { e.preventDefault(); onKey("↵"); return; }
    if (e.key === "Backspace") { e.preventDefault(); onKey("⌫"); return; }
    if (e.key.length !== 1) return;
    const ch = e.key;
    if (/[가-힣]/.test(ch)) {
      const d = decompose(ch);
      if (!d) return;
      const seq = [CHOS[d.cho], JUNGS[d.jung]];
      if (d.jong) for (const p of JONG_PARTS[d.jong - 1]) seq.push(p);
      for (const jamo of seq) {
        if (imeInput(st, jamo)) renderCurrent();
      }
      SFX.tap();
      return;
    }
    if (CHO_INDEX[ch] !== undefined || JUNG_INDEX[ch] !== undefined) { onKey(ch); return; }
    const mapped = DUBEOLSIK[ch.toLowerCase()];
    if (mapped) onKey(mapped);
  });

  buildPad();
  newGame();
})();
