(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NICK_KEY = "pokeTennis.nick.v1";
  const SOUND_KEY = "pokeTennis.sound";
  const WS_PORT = 48938;
  const WS_PATH = "/casual/poke-tennis/ws";
  const WIN_SCORE = 5;

  const W = 100;
  const H = 160;
  const BALL_R = 2.6;
  const PADDLE_W = 26;
  const PADDLE_Y_YOU = 149;
  const PADDLE_Y_OPP = 11;
  const REACH = 14;
  const SERVE_DELAY = 0.9;

  const canvas = $("game-canvas");
  const ctx = canvas.getContext("2d");
  const stageWrap = document.querySelector(".stage-wrap");
  const overlay = $("overlay");
  const overlayCard = $("overlay-card");
  const spriteYou = $("sprite-you");
  const spriteCpu = $("sprite-cpu");

  let dpr = 1;
  let view = { w: 300, h: 480, scale: 1, ox: 0, oy: 0 };
  let flip = false;

  function resize() {
    const r = stageWrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const scale = Math.min(r.width / W, r.height / H);
    view = {
      w: r.width,
      h: r.height,
      scale,
      ox: (r.width - W * scale) / 2,
      oy: (r.height - H * scale) / 2,
    };
  }
  window.addEventListener("resize", resize);

  const sx = (x) => (flip ? W - x : x);
  const sy = (y) => (flip ? H - y : y);
  const px = (x) => view.ox + sx(x) * view.scale;
  const py = (y) => view.oy + sy(y) * view.scale;
  const pu = (u) => u * view.scale;

  function buildWsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsPort = String(WS_PORT);
    if (location.port === wsPort) return `${proto}://${location.host}/ws`;
    if (!location.port && location.protocol === "https:") {
      return `${proto}://${location.host}${WS_PATH}`;
    }
    return `${proto}://${location.hostname}:${wsPort}/ws`;
  }

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  let myNick = store.get(NICK_KEY, "") || (() => {
    const animals = ["피카", "이상", "꼬북", "파이", "이브", "뮤츠", "리자", "거북"];
    return `${animals[Math.floor(Math.random() * animals.length)]}${Math.floor(Math.random() * 90 + 10)}`;
  })();

  let soundOn = store.get(SOUND_KEY, "1") !== "0";
  document.body.classList.toggle("muted", !soundOn);

  const sounds = {};
  function playSound(name) {
    if (!soundOn) return;
    try {
      if (!sounds[name]) sounds[name] = new Audio(`assets/audio/${name}.mp3`);
      sounds[name].currentTime = 0;
      sounds[name].play().catch(() => {});
    } catch { /* autoplay guard */ }
  }

  $("btn-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    store.set(SOUND_KEY, soundOn ? "1" : "0");
    document.body.classList.toggle("muted", !soundOn);
  });

  let toastTimer = 0;
  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  stageWrap.appendChild(toastEl);
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }


  const G = {
    mode: null,
    running: false,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0 },
    padYou: { x: W / 2, vx: 0, target: W / 2 },
    padOpp: { x: W / 2, vx: 0, target: W / 2 },
    swingYou: false,
    swingOpp: false,
    score: { you: 0, opp: 0 },
    serving: true,
    serveToYou: true,
    serveT: 0,
    banner: null,
    ended: false,
    winner: null,
    rally: 0,
  };

  const ai = { err: 0, lastThink: 0 };

  const net = {
    ws: null,
    connected: false,
    myId: null,
    role: null,
    peerNick: "",
    players: [],
    pendingChallenge: null,
    lastSend: 0,
    lastInputSent: 0,
    seq: 0,
    prevState: null,
    curState: null,
    curTime: 0,
  };

  function resetMatch() {
    G.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0 };
    G.padYou = { x: W / 2, vx: 0, target: W / 2 };
    G.padOpp = { x: W / 2, vx: 0, target: W / 2 };
    G.swingYou = false;
    G.swingOpp = false;
    G.score = { you: 0, opp: 0 };
    G.serveToYou = Math.random() < 0.5;
    G.serving = true;
    G.serveT = SERVE_DELAY;
    G.banner = null;
    G.ended = false;
    G.winner = null;
    G.rally = 0;
    updateScoreBar();
  }

  function updateScoreBar() {
    $("score-you").textContent = G.score.you;
    $("score-cpu").textContent = G.score.opp;
  }


  function launchServe() {
    const dir = G.serveToYou ? 1 : -1;
    G.ball.x = W / 2 + (Math.random() * 20 - 10);
    G.ball.y = H / 2;
    const ang = (Math.random() * 0.5 - 0.25);
    const sp = 30;
    G.ball.vx = Math.sin(ang) * sp;
    G.ball.vy = dir * Math.cos(ang) * sp;
    G.ball.spin = 0;
    G.serving = false;
    G.rally = 0;
  }

  function tryHit(paddle, py, swinging, movingDown) {
    const b = G.ball;
    const towardPaddle = movingDown ? b.vy > 0 : b.vy < 0;
    if (!towardPaddle) return false;
    const dy = Math.abs(b.y - py);
    if (dy > REACH) return false;
    const dx = b.x - paddle.x;
    if (Math.abs(dx) > PADDLE_W / 2 + BALL_R) return false;
    if (!swinging) return false;
    const speed = Math.hypot(b.vx, b.vy);
    const newSpeed = Math.min(speed * 1.06 + 1.2, 64);
    let nvx = (dx / (PADDLE_W / 2)) * 16 + paddle.vx * 0.22;
    nvx = Math.max(-42, Math.min(42, nvx));
    b.vx = nvx;
    b.vy = (movingDown ? -1 : 1) * Math.sqrt(Math.max(newSpeed * newSpeed - nvx * nvx, (newSpeed * 0.55) ** 2));
    G.rally += 1;
    playSound("hit");
    return true;
  }

  function stepPhysics(dt) {
    const b = G.ball;

    if (G.serving) {
      G.serveT -= dt;
      if (G.serveT <= 0 && !(G.mode === "online" && net.role === "guest")) launchServe();
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin += (b.vx * dt) / BALL_R;

    if (b.x < 3 + BALL_R && b.vx < 0) { b.x = 3 + BALL_R; b.vx = -b.vx; }
    if (b.x > W - 3 - BALL_R && b.vx > 0) { b.x = W - 3 - BALL_R; b.vx = -b.vx; }

    tryHit(G.padYou, PADDLE_Y_YOU, G.swingYou, true);
    tryHit(G.padOpp, PADDLE_Y_OPP, G.swingOpp, false);

    if (b.y < -BALL_R * 1.5 || b.y > H + BALL_R * 1.5) {
      const youScored = b.y < 0;
      if (G.mode === "online" && net.role === "guest") return;
      scorePoint(youScored ? "you" : "opp");
    }
  }

  function scorePoint(side) {
    G.score[side] += 1;
    G.serveToYou = side === "you";
    updateScoreBar();
    playSound("point");
    G.banner = { text: side === "you" ? "득점!" : "실점!", t: 1.1 };
    if (G.score[side] >= WIN_SCORE) {
      G.ended = true;
      G.winner = side;
      playSound(side === "you" ? "win" : "lose");
      setTimeout(() => showResult(), 900);
      return;
    }
    G.serving = true;
    G.serveT = SERVE_DELAY + 0.7;
    resetBallHold();
  }

  function resetBallHold() {
    G.ball.x = W / 2;
    G.ball.y = H / 2;
    G.ball.vx = 0;
    G.ball.vy = 0;
  }

  function movePad(pad, target, dt, maxV) {
    const prev = pad.x;
    const diff = target - pad.x;
    const step = maxV * dt;
    pad.x += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
    pad.x = Math.max(PADDLE_W / 2 + 2, Math.min(W - PADDLE_W / 2 - 2, pad.x));
    pad.vx = (pad.x - prev) / Math.max(dt, 1e-4);
  }

  function stepAI(dt, now) {
    const b = G.ball;
    if (G.serving) {
      movePad(G.padOpp, W / 2, dt, 30);
      return;
    }
    const approaching = b.vy < 0;
    let predicted = b.x + (b.vx / Math.abs(b.vy || 1)) * (b.y - PADDLE_Y_OPP);
    predicted = foldPredict(predicted);
    if (now - ai.lastThink > 0.55) {
      ai.lastThink = now;
      ai.err = (Math.random() * 12 - 6) * (1 + G.rally * 0.03);
    }
    const target = approaching ? predicted + ai.err : W / 2;
    const maxV = 26 + (G.score.you + G.score.opp) * 1.6;
    movePad(G.padOpp, target, dt, maxV);
    const near = Math.abs(b.x - G.padOpp.x) < PADDLE_W / 2 + 4 && b.y < PADDLE_Y_OPP + REACH + 4;
    G.swingOpp = approaching && near;
  }

  function foldPredict(x) {
    const lo = 3 + BALL_R;
    const hi = W - 3 - BALL_R;
    const span = hi - lo;
    let v = (x - lo) % (2 * span);
    if (v < 0) v += 2 * span;
    return v > span ? hi - (v - span) : lo + v;
  }


  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    drawNet();
    drawRacket(G.padOpp, PADDLE_Y_OPP, G.swingOpp, now, -1);
    drawRacket(G.padYou, PADDLE_Y_YOU, G.swingYou, now, 1);
    drawBall();

    placeSprite(spriteCpu, G.padOpp.x, PADDLE_Y_OPP);
    placeSprite(spriteYou, G.padYou.x, PADDLE_Y_YOU);
    spriteYou.classList.toggle("poke-swing", G.swingYou);
    spriteCpu.classList.toggle("poke-swing", G.swingOpp);

    drawTexts();
  }

  function drawNet() {
    const ny = py(H / 2);
    const h = pu(9);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(0, ny - h / 2, view.w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1;
    ctx.setLineDash([pu(2.4), pu(2.4)]);
    ctx.beginPath();
    ctx.moveTo(0, ny - h / 2 + 1);
    ctx.lineTo(view.w, ny - h / 2 + 1);
    ctx.moveTo(0, ny + h / 2 - 1);
    ctx.lineTo(view.w, ny + h / 2 - 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRacket(pad, worldY, swinging, now, facing) {
    const cx = px(pad.x);
    const cy = py(worldY + facing * 6.5);
    const r = pu(8.2);
    const swingPhase = swinging ? Math.sin(now * 0.028) * 0.85 : 0.35 * facing;
    const tilt = (-0.45 + swingPhase) * (flip ? -1 : 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.strokeStyle = "#c95d2c";
    ctx.lineWidth = pu(1.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = pu(0.5);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 2.6) * r, -r * 1.15);
      ctx.lineTo((i / 2.6) * r, r * 1.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, (i / 2.6) * r * 1.3);
      ctx.lineTo(r * 0.85, (i / 2.6) * r * 1.3);
      ctx.stroke();
    }
    ctx.strokeStyle = "#a34a20";
    ctx.lineWidth = pu(2);
    ctx.beginPath();
    ctx.moveTo(0, r * 1.3);
    ctx.lineTo(0, pu(15));
    ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    if (G.serving) return;
    const b = G.ball;
    const bx = px(b.x);
    const by = py(b.y);
    const r = pu(BALL_R + 0.9);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(b.spin);
    ctx.fillStyle = "#d8f24a";
    ctx.strokeStyle = "rgba(90,110,20,0.7)";
    ctx.lineWidth = pu(0.5);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = pu(0.9);
    ctx.beginPath();
    ctx.arc(-r * 1.15, 0, r * 0.95, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 1.15, 0, r * 0.95, Math.PI * 0.58, Math.PI * 1.42);
    ctx.stroke();
    ctx.restore();
  }

  function drawTexts() {
    ctx.textAlign = "center";
    if (G.serving && !G.ended) {
      ctx.font = `700 ${pu(9)}px Fredoka, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText("준비...", px(W / 2), py(H / 2 - 14));
    }
    if (G.banner && G.banner.t > 0) {
      ctx.font = `700 ${pu(12)}px Fredoka, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(G.banner.text, px(W / 2), py(H / 2));
    }
  }

  function placeSprite(img, wx, wy) {
    const size = view.h * 0.13;
    const left = px(wx) - size / 2;
    const top = py(wy) + (flip ? -size * 0.72 : size * 0.08);
    img.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }


  let pointerActive = false;

  function pointerToCourt(e) {
    const r = canvas.getBoundingClientRect();
    const cxp = e.clientX - r.left;
    const cyp = e.clientY - r.top;
    let wx = (cxp - view.ox) / view.scale;
    let wy = (cyp - view.oy) / view.scale;
    if (flip) { wx = W - wx; wy = H - wy; }
    return { wx, wy };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!G.running || G.ended) return;
    const { wy } = pointerToCourt(e);
    const myHalfBottom = flip ? wy < H / 2 : wy > H / 2;
    if (!myHalfBottom) return;
    pointerActive = true;
    G.swingYou = true;
    canvas.setPointerCapture(e.pointerId);
    handlePointerMove(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointerActive) return;
    handlePointerMove(e);
  });
  const endPointer = () => {
    pointerActive = false;
    G.swingYou = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  function handlePointerMove(e) {
    const { wx } = pointerToCourt(e);
    G.padYou.target = Math.max(PADDLE_W / 2 + 2, Math.min(W - PADDLE_W / 2 - 2, wx));
  }


  function wsConnect(onOpen) {
    if (net.ws && net.ws.readyState <= 1) {
      if (onOpen) onOpen();
      return;
    }
    try {
      net.ws = new WebSocket(buildWsUrl());
    } catch {
      toast("서버에 연결할 수 없습니다");
      return;
    }
    net.ws.onopen = () => {
      net.connected = true;
      send({ type: "hello", nick: myNick });
      if (onOpen) onOpen();
    };
    net.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleServerMsg(msg);
    };
    net.ws.onclose = () => {
      net.connected = false;
      net.players = [];
      if (net.role && G.running && !G.ended) {
        toast("연결이 끊겼습니다");
        exitToMenu();
      } else if (!overlay.hidden === false || currentPanel === "online") {
        setStatus("연결 끊김 · 다시 시도해 주세요");
      }
    };
    net.ws.onerror = () => {};
  }

  function send(obj) {
    if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj));
  }

  function setStatus(text) {
    const el = document.getElementById("net-status");
    if (el) el.textContent = text || "";
  }

  function handleServerMsg(msg) {
    switch (msg.type) {
      case "welcome":
        net.myId = msg.id;
        break;
      case "lobby":
        net.players = msg.players || [];
        renderLobby();
        break;
      case "challenge":
        showChallengeModal(msg.fromNick, msg.id);
        break;
      case "challenge_sent":
        setStatus("신청했습니다 · 상대 수락 대기 중...");
        break;
      case "challenge_declined":
        setStatus(`${msg.by} 님이 거절했습니다`);
        break;
      case "room_created":
        setStatus(`방 코드: ${msg.code} · 상대 입장 대기`);
        break;
      case "error":
        setStatus(msg.message || "오류");
        break;
      case "match":
        enterOnlineMatch(msg);
        break;
      case "peer_input":
        applyPeerInput(msg);
        break;
      case "state":
        applyHostState(msg);
        break;
      case "peer_left":
        if (G.running && !G.ended) {
          toast("상대가 나갔습니다");
          exitToMenu();
        }
        break;
    }
  }

  function enterOnlineMatch(msg) {
    net.role = msg.role;
    net.peerNick = msg.peerNick || "";
    flip = msg.role === "guest";
    spriteYou.src = flip ? "assets/poke-cpu.gif" : "assets/poke-you.gif";
    spriteCpu.src = flip ? "assets/poke-you.gif" : "assets/poke-cpu.gif";
    hideOverlay();
    resetMatch();
    G.mode = "online";
    G.running = true;
    if (msg.role === "host") {
      net.seq = 0;
      setIntervalHostBroadcast(true);
    }
    toast(`${net.peerNick} 님과 대전 시작! (${msg.role === "host" ? "홈" : "게스트"})`);
  }

  let hostBroadcastTimer = null;
  function setIntervalHostBroadcast(enable) {
    if (hostBroadcastTimer) { clearInterval(hostBroadcastTimer); hostBroadcastTimer = null; }
    if (enable) hostBroadcastTimer = setInterval(broadcastState, 45);
  }

  function broadcastState() {
    if (!G.running || net.role !== "host") return;
    send({
      type: "state",
      seq: ++net.seq,
      ball: { x: +G.ball.x.toFixed(2), y: +G.ball.y.toFixed(2), vx: +G.ball.vx.toFixed(2), vy: +G.ball.vy.toFixed(2) },
      pHost: { x: +G.padYou.x.toFixed(2), swing: G.swingYou },
      pGuest: { x: +G.padOpp.x.toFixed(2), swing: G.swingOpp },
      score: G.score,
      serving: G.serving,
      ended: G.ended,
      winner: G.winner,
    });
  }

  function applyPeerInput(msg) {
    G.padOpp.target = Math.max(PADDLE_W / 2 + 2, Math.min(W - PADDLE_W / 2 - 2, msg.x * W));
    G.swingOpp = !!msg.swing;
  }

  function applyHostState(msg) {
    net.prevState = net.curState;
    net.curState = msg;
    net.curTime = performance.now();
    if (msg.ended && !G.ended) {
      G.ended = true;
      G.winner = msg.winner;
      const iWon = (msg.winner === "guest") === (net.role === "guest");
      playSound(iWon ? "win" : "lose");
      updateScoreBar();
      setTimeout(() => showResult(), 900);
    }
  }

  function guestRenderFromStates(now) {
    const cur = net.curState;
    if (!cur) return;
    const prev = net.prevState || cur;
    const dtms = 45;
    const alpha = Math.min((now - net.curTime) / dtms, 1.6);
    const lerp = (a, b) => a + (b - a) * Math.min(alpha, 1);

    G.padOpp.x = lerp(prev.pGuest?.x ?? cur.pGuest.x, cur.pGuest.x);
    G.padYou.x = lerp(prev.pHost?.x ?? cur.pHost.x, cur.pHost.x);
    G.swingOpp = !!cur.pGuest.swing;
    G.swingYou = !!cur.pHost.swing;
    G.ball.x = lerp(prev.ball?.x ?? cur.ball.x, cur.ball.x);
    G.ball.y = lerp(prev.ball?.y ?? cur.ball.y, cur.ball.y);
    G.ball.spin += 0.2;
    G.score.you = net.role === "host" ? cur.score.host : cur.score.guest;
    G.score.opp = net.role === "host" ? cur.score.guest : cur.score.host;
    updateScoreBar();
    G.serving = cur.serving;
  }

  function sendGuestInput(now) {
    if (net.role !== "guest" || !G.running || G.ended) return;
    if (now - net.lastInputSent < 33) return;
    net.lastInputSent = now;
    send({ type: "input", x: +(G.padYou.target / W).toFixed(3), vy: +G.padYou.vx.toFixed(1), swing: G.swingYou });
  }

  function leaveOnline() {
    send({ type: "leave_match" });
    net.role = null;
    setIntervalHostBroadcast(false);
    flip = false;
    spriteYou.src = "assets/poke-you.gif";
    spriteCpu.src = "assets/poke-cpu.gif";
  }

  window.addEventListener("pagehide", () => {
    if (net.role) send({ type: "leave_match" });
  });


  let currentPanel = "main";

  function showOverlay(html) {
    overlayCard.innerHTML = html;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function showMainMenu() {
    currentPanel = "main";
    showOverlay(`
      <h1 class="menu-title">포켓몬 테니스</h1>
      <p class="menu-sub">드래그하며 랠리! 5점 선승제</p>
      <div class="nick-row">
        <input id="nick-input" maxlength="12" value="${escapeHtml(myNick)}" placeholder="닉네임" aria-label="닉네임">
      </div>
      <button class="btn green" id="btn-cpu">연습 (vs CPU)</button>
      <button class="btn blue" id="btn-online">온라인 대전</button>
    `);
    $("btn-cpu").addEventListener("click", startCpuGame);
    $("btn-online").addEventListener("click", () => {
      myNick = ($("nick-input").value || "").trim().slice(0, 12) || myNick;
      store.set(NICK_KEY, myNick);
      showOnlinePanel();
    });
  }

  function showOnlinePanel() {
    currentPanel = "online";
    showOverlay(`
      <h1 class="menu-title" style="font-size:22px">온라인 대전</h1>
      <div class="section-label">접속자</div>
      <div class="player-list" id="player-list"><div class="status-line">연결 중...</div></div>
      <div class="section-label">방 코드</div>
      <div class="code-row">
        <input id="code-input" maxlength="6" placeholder="CODE" aria-label="방 코드">
        <button class="row-btn" id="btn-join">입장</button>
      </div>
      <button class="btn gray" id="btn-create" style="margin-top:8px">방 코드 만들기</button>
      <button class="btn ghost" id="btn-back">← 돌아가기</button>
      <div class="status-line" id="net-status"></div>
    `);
    $("btn-create").addEventListener("click", () => send({ type: "create_room" }));
    $("btn-join").addEventListener("click", () => {
      const code = ($("code-input").value || "").trim().toUpperCase();
      if (code.length !== 6) { setStatus("6자리 코드를 입력하세요"); return; }
      send({ type: "join_room", code });
    });
    $("btn-back").addEventListener("click", () => {
      if (net.ws) { net.ws.onclose = null; net.ws.close(); net.ws = null; net.connected = false; }
      showMainMenu();
    });
    wsConnect();
  }

  function renderLobby() {
    if (currentPanel !== "online") return;
    const list = $("player-list");
    if (!list) return;
    const others = net.players.filter((p) => p.id !== net.myId);
    if (!others.length) {
      list.innerHTML = `<div class="status-line">접속자가 없습니다 · 친구에게 URL을 공유하세요</div>`;
      return;
    }
    list.innerHTML = "";
    others.forEach((p) => {
      const row = document.createElement("div");
      row.className = `player-row${p.busy ? " busy" : ""}`;
      row.innerHTML = `
        <span><span class="dot"></span>${escapeHtml(p.nick)}</span>
        <button class="row-btn" ${p.busy ? "disabled" : ""}>대결 신청</button>`;
      row.querySelector(".row-btn").addEventListener("click", () => {
        send({ type: "challenge", targetId: p.id });
      });
      list.appendChild(row);
    });
  }

  function showChallengeModal(fromNick, cid) {
    if (currentPanel !== "online") return;
    const wrap = document.createElement("div");
    wrap.className = "challenge-card";
    wrap.innerHTML = `
      <p style="font-weight:700;margin:6px 0">${escapeHtml(fromNick)} 님의 대결 신청!</p>
      <button class="btn green" data-a="ok">수락</button>
      <button class="btn ghost" data-a="no">거절</button>`;
    wrap.querySelector('[data-a="ok"]').addEventListener("click", () => {
      send({ type: "challenge_respond", id: cid, accept: true });
      wrap.remove();
    });
    wrap.querySelector('[data-a="no"]').addEventListener("click", () => {
      send({ type: "challenge_respond", id: cid, accept: false });
      wrap.remove();
    });
    overlayCard.appendChild(wrap);
  }

  function startCpuGame() {
    myNick = ($("nick-input")?.value || "").trim().slice(0, 12) || myNick;
    store.set(NICK_KEY, myNick);
    hideOverlay();
    flip = false;
    spriteYou.src = "assets/poke-you.gif";
    spriteCpu.src = "assets/poke-cpu.gif";
    resetMatch();
    G.mode = "cpu";
    G.running = true;
  }

  function showResult() {
    if (!G.running) return;
    const won = G.winner === "you" || (G.mode === "online" && ((G.winner === "host") === (net.role === "host")));
    const label = G.mode === "online" ? (won ? net.peerNick : myNick) : (won ? myNick : "CPU");
    showOverlay(`
      <div class="result-emoji">${won ? "🏆" : "🎾"}</div>
      <div class="big-msg">${won ? "승리!" : "패배..."}</div>
      <p class="menu-sub">${escapeHtml(label)} ${G.score.you} : ${G.score.opp}</p>
      ${G.mode === "cpu"
        ? `<button class="btn green" id="btn-again">다시하기</button>`
        : `<button class="btn green" id="btn-again">로비로</button>`}
    `);
    $("btn-again").addEventListener("click", () => {
      if (G.mode === "cpu") {
        startCpuGame();
      } else {
        leaveOnline();
        exitToMenu();
      }
    });
  }

  function exitToMenu() {
    G.running = false;
    G.mode = null;
    setIntervalHostBroadcast(false);
    if (net.role) leaveOnline();
    showMainMenu();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }


  let lastT = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (G.banner && G.banner.t > 0) G.banner.t -= dt;

    if (G.running && !G.ended) {
      movePad(G.padYou, G.padYou.target, dt, 120);
      if (G.mode === "cpu") {
        stepAI(dt, now / 1000);
        stepPhysics(dt);
      } else if (G.mode === "online" && net.role === "host") {
        stepPhysics(dt);
        broadcastThrottled();
      } else if (G.mode === "online" && net.role === "guest") {
        guestRenderFromStates(now);
        sendGuestInput(now);
      }
    }
    draw(now);
  }

  let lastBroadcast = 0;
  function broadcastThrottled() {
    const now = performance.now();
    if (now - lastBroadcast >= 45) {
      lastBroadcast = now;
      broadcastState();
    }
  }

  resize();
  showMainMenu();
  requestAnimationFrame(frame);
})();
