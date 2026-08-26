(() => {
  "use strict";

  const PUZZLES = {
    easy: [
      { p: "956327008080651709001008006609800100008002304040100800260730080510000000803204675", s: "956327418482651739731498526629843157178562394345179862264735981517986243893214675" },
      { p: "427100006831760020956002700170005034060080900084900062018543209500006000000201008", s: "427158396831769425956432781179625834265384917384917562618543279592876143743291658" },
      { p: "000506007097003240034790050469030070051060380003050460945300000318605794200900000", s: "182546937597813246634792851469238175751469382823157469945371628318625794276984513" },
    ],
    medium: [
      { p: "208040150001075090305160780034700021006000000080400009003290800000000400040010000", s: "278349156461875293395162784934786521756921348182453679513294867829637415647518932" },
      { p: "207304050010000002003060100006400090500200006100896470370100809000030020020009000", s: "267314958415987632893562147786453291549271386132896475374125869951638724628749513" },
      { p: "250031800007090124164000005000800000003000500500064390040008000001040000398270000", s: "259431867837695124164782935916853742483927516572164398645318279721549683398276451" },
    ],
    hard: [
      { p: "000004000970000000601078000000400060080700930490620080060030120300060040007000300", s: "532194678978256413641378259713489562286715934495623781864937125329561847157842396" },
      { p: "000020000003000080685000030004007001000180000071090003900278000000300000700040059", s: "197823546243965187685714932824537691369182475571496823956278314412359768738641259" },
      { p: "010800090000000003056090087000240000000008000290100060632001400000070009040300000", s: "417853296928716543356492187863249751174568932295137864632981475581674329749325618" },
    ],
  };
  const LS_SOUND = "sudoku.sound";
  const storage = (() => {
    try { localStorage.setItem("__su", "1"); localStorage.removeItem("__su"); return localStorage; }
    catch (_) { return { getItem: () => null, setItem: () => {} }; }
  })();

  const gridEl = document.getElementById("grid");
  const el = {
    timer: document.getElementById("timer"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    card: document.getElementById("overlay-card"),
    help: document.getElementById("help-overlay"),
    btnSound: document.getElementById("btn-sound"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    btnNew: document.getElementById("btn-new"),
    btnNote: document.getElementById("btn-note"),
    btnHint: document.getElementById("btn-hint"),
  };

  let soundOn = storage.getItem(LS_SOUND) !== "0";
  let diff = "easy", given = [], values = [], notes = [], solution = [];
  let selected = 0, noteMode = false, seconds = 0, timerId = null, won = false;

  function sfx(r) { if (soundOn && window.CasualSfx) CasualSfx.play(r); }
  function syncSound() {
    el.btnSound.classList.toggle("muted", !soundOn);
    if (window.CasualSfx) CasualSfx.setEnabled(soundOn);
  }
  function bestKey() { return "sudoku.best." + diff; }
  function fmt(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function conflicts(idx, n) {
    if (!n) return false;
    const r = Math.floor(idx / 9), c = idx % 9;
    for (let i = 0; i < 9; i++) {
      if (i !== c && values[r * 9 + i] === n) return true;
      if (i !== r && values[i * 9 + c] === n) return true;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        const j = rr * 9 + cc;
        if (j !== idx && values[j] === n) return true;
      }
    }
    return false;
  }

  function render() {
    const selVal = values[selected];
    gridEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      if (given[i]) btn.classList.add("given");
      if (i === selected) btn.classList.add("selected");
      if (selVal && values[i] === selVal) btn.classList.add("same");
      if (values[i] && conflicts(i, values[i])) btn.classList.add("conflict");
      if (values[i]) btn.textContent = String(values[i]);
      else if (notes[i] && notes[i].size) {
        const n = document.createElement("div");
        n.className = "notes";
        for (let k = 1; k <= 9; k++) {
          const s = document.createElement("span");
          s.textContent = notes[i].has(k) ? String(k) : "";
          n.appendChild(s);
        }
        btn.appendChild(n);
      }
      btn.addEventListener("click", () => { selected = i; render(); sfx("tick"); });
      gridEl.appendChild(btn);
    }
  }

  function checkWin() {
    if (values.some((v) => !v)) return false;
    for (let i = 0; i < 81; i++) if (conflicts(i, values[i])) return false;
    return true;
  }

  function onWin() {
    won = true;
    clearInterval(timerId);
    const prev = Number(storage.getItem(bestKey()) || 0) || 0;
    if (!prev || seconds < prev) storage.setItem(bestKey(), String(seconds));
    el.best.textContent = fmt(Number(storage.getItem(bestKey())));
    sfx("win");
    el.card.innerHTML = `<h2>완료!</h2><p>시간 ${fmt(seconds)}</p><button type="button" class="retry" id="btn-retry">새 퍼즐</button>`;
    el.overlay.hidden = false;
    document.getElementById("btn-retry").onclick = () => { el.overlay.hidden = true; start(); };
  }

  function put(n) {
    if (won || given[selected]) return;
    if (noteMode && n) {
      if (!notes[selected]) notes[selected] = new Set();
      if (notes[selected].has(n)) notes[selected].delete(n);
      else notes[selected].add(n);
      values[selected] = 0;
      sfx("click");
      render();
      return;
    }
    values[selected] = n;
    notes[selected] = new Set();
    sfx(n && conflicts(selected, n) ? "fail" : "click");
    render();
    if (checkWin()) onWin();
  }

  function hint() {
    if (won) return;
    for (let i = 0; i < 81; i++) {
      if (!values[i] && solution[i]) {
        selected = i;
        values[i] = solution[i];
        notes[i] = new Set();
        sfx("special");
        render();
        if (checkWin()) onWin();
        return;
      }
    }
  }

  function start() {
    const list = PUZZLES[diff];
    const pick = list[Math.floor(Math.random() * list.length)];
    given = pick.p.split("").map((ch) => Number(ch));
    values = given.slice();
    solution = pick.s.split("").map((ch) => Number(ch));
    notes = Array.from({ length: 81 }, () => new Set());
    selected = given.findIndex((v) => !v);
    if (selected < 0) selected = 0;
    won = false;
    seconds = 0;
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (won) return;
      seconds++;
      el.timer.textContent = fmt(seconds);
    }, 1000);
    el.timer.textContent = "0:00";
    const b = Number(storage.getItem(bestKey()) || 0) || 0;
    el.best.textContent = b ? fmt(b) : "–";
    el.overlay.hidden = true;
    render();
  }

  document.querySelectorAll(".num[data-n]").forEach((b) => {
    b.addEventListener("click", () => put(Number(b.dataset.n)));
  });
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      diff = b.dataset.diff;
      start();
    });
  });
  el.btnNote.onclick = () => {
    noteMode = !noteMode;
    el.btnNote.classList.toggle("is-on", noteMode);
    sfx("toggle");
  };
  el.btnHint.onclick = hint;
  el.btnNew.onclick = () => { sfx("click"); start(); };
  el.btnHelp.onclick = () => { el.help.hidden = false; };
  el.btnHelpClose.onclick = () => { el.help.hidden = true; };
  el.btnSound.onclick = () => {
    soundOn = !soundOn; storage.setItem(LS_SOUND, soundOn ? "1" : "0"); syncSound();
    if (soundOn && window.CasualSfx) CasualSfx.unlock();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "9") put(Number(e.key));
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") put(0);
  });

  syncSound();
  start();
})();
