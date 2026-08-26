(() => {
  "use strict";

  const WORDS = [
    "사과", "바나나", "학교", "친구", "게임", "하늘", "바다", "고양이", "강아지", "커피",
    "도서", "음악", "운동", "점심", "저녁", "아침", "버스", "기차", "비행기", "컴퓨터",
    "hello", "world", "game", "type", "fast", "score", "combo", "rush", "pixel", "casual",
    "행복", "웃음", "도전", "승리", "기록", "연습", "집중", "속도", "정확", "완료",
  ];
  const LS_BEST = "typing.best", LS_SOUND = "typing.sound";
  const storage = (() => {
    try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const sky = document.getElementById("sky");
  const input = document.getElementById("type-input");
  const el = {
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    lives: document.getElementById("lives"),
    best: document.getElementById("best"),
    start: document.getElementById("btn-start"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
  };

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let best = Number(storage.getItem(LS_BEST) || 0) || 0;
  let playing = false, score = 0, combo = 0, lives = 3;
  let words = [], spawnAcc = 0, lastTs = 0, speed = 40;

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }
  function hud() {
    el.score.textContent = String(score);
    el.combo.textContent = String(combo);
    el.lives.textContent = String(lives);
    el.best.textContent = String(best);
  }

  function spawn() {
    const text = WORDS[Math.floor(Math.random() * WORDS.length)];
    const node = document.createElement("div");
    node.className = "word";
    node.textContent = text;
    const x = 12 + Math.random() * 76;
    node.style.left = x + "%";
    node.style.top = "0px";
    sky.appendChild(node);
    words.push({ text, node, y: 0, x, speed: speed * (0.85 + Math.random() * 0.35) });
  }

  function clearWords() {
    words.forEach((w) => w.node.remove());
    words = [];
    sky.innerHTML = "";
  }

  function end() {
    playing = false;
    el.start.textContent = "시작";
    if (score > best) { best = score; storage.setItem(LS_BEST, String(best)); }
    hud();
    sfx("lose");
    el.card.innerHTML = `<h2>게임 오버</h2><p>점수 ${score} · 최고 ${best}</p><button type="button" class="retry" id="btn-retry">다시 하기</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; start(); };
  }

  function tryMatch() {
    if (!playing) return;
    const v = input.value.trim();
    if (!v) return;
    const idx = words.findIndex((w) => w.text === v);
    if (idx < 0) {
      combo = 0; hud(); sfx("fail"); input.select();
      return;
    }
    const w = words[idx];
    w.node.remove();
    words.splice(idx, 1);
    combo += 1;
    score += 10 + Math.min(combo, 10) * 2;
    speed = Math.min(120, speed + 1.5);
    input.value = "";
    hud();
    sfx("success");
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (playing) {
      spawnAcc += dt;
      const gap = Math.max(0.7, 2.2 - score / 200);
      if (spawnAcc >= gap) { spawnAcc = 0; spawn(); }
      const h = sky.clientHeight;
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        w.y += w.speed * dt;
        w.node.style.top = w.y + "px";
        if (w.y + 28 >= h) {
          w.node.remove();
          words.splice(i, 1);
          lives -= 1; combo = 0; hud(); sfx("warn");
          if (lives <= 0) end();
        }
      }
      const typed = input.value.trim();
      words.forEach((w) => w.node.classList.toggle("active", typed && w.text.startsWith(typed)));
    }
    requestAnimationFrame(loop);
  }

  function start() {
    clearWords();
    score = 0; combo = 0; lives = 3; speed = 40; spawnAcc = 1.5;
    playing = true;
    el.start.textContent = "재시작";
    el.overlay.hidden = true;
    input.value = "";
    input.focus();
    hud();
    sfx("click");
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); tryMatch(); }
  });
  input.addEventListener("input", () => {
    if (!playing) return;
    const v = input.value.trim();
    if (words.some((w) => w.text === v)) tryMatch();
  });
  el.start.onclick = start;
  el.btnHelp.onclick = () => { el.help.hidden = false; };
  el.btnHelpClose.onclick = () => { el.help.hidden = true; };
  el.btnSound.onclick = () => {
    soundOn = !soundOn; storage.setItem(LS_SOUND, soundOn ? "1" : "0"); syncSound();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  };

  hud();
  syncSound();
  requestAnimationFrame(loop);
})();
