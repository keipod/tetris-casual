/*! mp_client.js — shared multiplayer lobby client for casual games.
 *  Expects <meta name="mp-ws-port" content="PORT"> and #screen-lobby markup
 *  (standard IDs below). Game code supplies hooks via MPClient.create(). */
(function (root) {
  "use strict";

  const NICK_KEY = "mp.nick";

  function $(id) { return document.getElementById(id); }

  function create(opts) {
    const cfg = Object.assign({
      cpuButton: true,
      tableMode: false,
      onMatchStart: () => {},
      onState: () => {},
      onEvents: () => {},
      onLobbyReturn: () => {},
      onTableClosed: () => {},
      themeClass: "",
    }, opts);

    const meta = document.querySelector('meta[name="mp-ws-port"]');
    const port = meta ? meta.content : location.port;
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    let ws = null;
    let myId = null;
    let myNick = localStorage.getItem(NICK_KEY) || "";
    let pendingChallengeTo = null;
    let reconnectTimer = null;
    let closedByUs = false;

    const el = {
      screenLobby: $("screen-lobby"),
      screenGame: $("screen-game"),
      nickInput: $("nick-input"),
      nickSave: $("nick-save"),
      btnCpu: $("btn-cpu"),
      btnRoom: $("btn-room"),
      playerList: $("player-list"),
      playerCount: $("player-count"),
      roomDialog: $("room-dialog"),
      roomCodeInput: $("room-code-input"),
      roomJoinBtn: $("room-join-btn"),
      roomCreateBtn: $("room-create-btn"),
      roomCloseBtn: $("room-close-btn"),
      roomCreatedBox: $("room-created-box"),
      roomCreatedCode: $("room-created-code"),
      toast: $("toast"),
      modalChallenge: $("modal-challenge"),
      chalText: $("chal-text"),
      chalAccept: $("chal-accept"),
      chalDecline: $("chal-decline"),
      waiting: $("waiting-overlay"),
      waitingText: $("waiting-text"),
    };

    function toast(msg, isErr) {
      if (!el.toast) return;
      el.toast.textContent = msg;
      el.toast.classList.toggle("is-err", !!isErr);
      el.toast.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(() => el.toast.classList.remove("show"), 2200);
    }

    function connect() {
      closedByUs = false;
      try { ws && ws.close(); } catch (_) {}
      ws = new WebSocket(`${scheme}//${location.hostname}:${port}/ws`);
      ws.onopen = () => {
        send({ type: "hello", nick: myNick });
        if (el.waiting && el.waiting.hidden === false && !inMatch()) hideWaiting();
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        handle(msg);
      };
      ws.onclose = () => {
        if (closedByUs) return;
        toast("연결 끊김 · 재접속 중…", true);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1500);
      };
    }

    function send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    }

    function inMatch() {
      return el.screenGame && !el.screenGame.hidden;
    }

    function handle(msg) {
      switch (msg.type) {
        case "welcome":
          myId = msg.id;
          myNick = msg.nick;
          if (el.nickInput) el.nickInput.value = myNick;
          break;
        case "lobby":
          renderPlayers(msg.players || []);
          break;
        case "tables":
          renderTables(msg.tables || []);
          if (cfg.onTables) cfg.onTables(msg.tables || []);
          break;
        case "challenge": {
          if (el.modalChallenge) {
            el.chalText.textContent = `${msg.fromNick}님이 대전을 신청했습니다`;
            el.modalChallenge.hidden = false;
            el.chalAccept.onclick = () => {
              el.modalChallenge.hidden = true;
              send({ type: "challenge_respond", id: msg.id, accept: true });
            };
            el.chalDecline.onclick = () => {
              el.modalChallenge.hidden = true;
              send({ type: "challenge_respond", id: msg.id, accept: false });
            };
            setTimeout(() => { if (!el.modalChallenge.hidden) el.modalChallenge.hidden = true; }, 20000);
          } else {
            send({ type: "challenge_respond", id: msg.id, accept: true });
          }
          break;
        }
        case "challenge_sent":
          showWaiting(`${(msg.toNick || "상대")}의 응답 대기 중…`);
          break;
        case "challenge_declined":
          hideWaiting();
          toast(`${msg.by}님이 거절했습니다`, true);
          break;
        case "room_created":
          if (el.roomCreatedBox) {
            el.roomCreatedBox.hidden = false;
            el.roomCreatedCode.textContent = msg.code;
          }
          showWaiting(`방 코드 ${msg.code} · 상대 입장 대기 중…`);
          break;
        case "table_created":
          enterGame(msg.state);
          break;
        case "table_joined":
          break;
        case "table_closed":
          if (inMatch()) {
            exitToLobby();
            toast("테이블이 종료되었습니다");
          }
          cfg.onTableClosed();
          break;
        case "match":
          if (msg.events && msg.events.length) cfg.onEvents(msg.events);
          if (!inMatch()) enterGame(msg.state);
          else cfg.onState(msg.state);
          if (msg.state && msg.state.phase === "ended") {
            setTimeout(() => {}, 0);
          }
          break;
        case "error":
          hideWaiting();
          toast(msg.message || "오류", true);
          break;
      }
    }

    function renderPlayers(players) {
      if (!el.playerList) return;
      el.playerCount.textContent = String(players.length);
      el.playerList.innerHTML = "";
      players.forEach((p) => {
        const li = document.createElement("li");
        const isMe = p.id === myId;
        li.className = `player-row${p.busy ? " is-busy" : ""}${isMe ? " is-me" : ""}`;
        li.innerHTML = `
          <span class="player-dot" aria-hidden="true"></span>
          <span class="player-nick">${escapeHtml(p.nick)}${isMe ? " (나)" : ""}</span>`;
        if (!isMe && !p.busy) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn-challenge";
          btn.textContent = "대전 신청";
          btn.addEventListener("click", () => {
            pendingChallengeTo = p.id;
            send({ type: "challenge", targetId: p.id });
          });
          li.appendChild(btn);
        }
        el.playerList.appendChild(li);
      });
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[c]));
    }

    function renderTables(tables) {
      const list = $("table-list");
      if (!list) return;
      list.innerHTML = "";
      if (!tables.length) {
        const li = document.createElement("li");
        li.className = "table-row-empty";
        li.textContent = "열린 테이블이 없습니다 · 직접 만들어 보세요";
        list.appendChild(li);
        return;
      }
      tables.forEach((t) => {
        const li = document.createElement("li");
        li.className = "table-row";
        li.innerHTML = `<span class="table-code">${escapeHtml(t.code)}</span>
          <span class="table-seats">${t.seats}/${t.max}석${t.playing ? " · 진행중" : ""}</span>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-challenge";
        btn.textContent = "입장";
        btn.disabled = t.playing || t.seats >= t.max;
        btn.addEventListener("click", () => send({ type: "table_join", code: t.code }));
        li.appendChild(btn);
        list.appendChild(li);
      });
    }

    function showWaiting(text) {
      if (!el.waiting) return;
      el.waitingText.textContent = text;
      el.waiting.hidden = false;
    }

    function hideWaiting() {
      if (el.waiting) el.waiting.hidden = true;
      if (el.roomCreatedBox) el.roomCreatedBox.hidden = true;
    }

    function enterGame(state) {
      hideWaiting();
      el.screenLobby.hidden = true;
      el.screenGame.hidden = false;
      cfg.onMatchStart(state);
      cfg.onState(state);
    }

    function exitToLobby() {
      el.screenGame.hidden = true;
      el.screenLobby.hidden = false;
      cfg.onLobbyReturn();
    }

    function bindUI() {
      if (el.nickSave) {
        el.nickSave.addEventListener("click", () => {
          const v = (el.nickInput.value || "").trim().slice(0, 12);
          if (!v) { toast("닉네임을 입력하세요", true); return; }
          myNick = v;
          localStorage.setItem(NICK_KEY, v);
          send({ type: "set_nick", nick: v });
          toast("닉네임 변경 완료");
        });
      }
      if (el.btnCpu) {
        el.btnCpu.addEventListener("click", () => send({ type: "cpu" }));
        if (!cfg.cpuButton) el.btnCpu.hidden = true;
      }
      if (el.btnRoom) {
        el.btnRoom.addEventListener("click", () => {
          el.roomDialog.hidden = false;
          el.roomCodeInput.focus();
        });
      }
      if (el.roomCloseBtn) {
        el.roomCloseBtn.addEventListener("click", () => { el.roomDialog.hidden = true; });
      }
      if (el.roomJoinBtn) {
        el.roomJoinBtn.addEventListener("click", joinByCode);
        el.roomCodeInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") joinByCode();
        });
      }
      if (el.roomCreateBtn) {
        el.roomCreateBtn.addEventListener("click", () => {
          if (cfg.tableMode) send({ type: "table_create", opts: {} });
          else send({ type: "create_room" });
          el.roomDialog.hidden = true;
        });
      }
      if (el.waiting) {
        const cancel = $("waiting-cancel");
        if (cancel) {
          cancel.addEventListener("click", () => {
            hideWaiting();
            if (pendingChallengeTo) {
              pendingChallengeTo = null;
              toast("대전 신청을 취소했어도 상대가 수락하면 시작됩니다");
            }
            send({ type: "leave_match" });
          });
        }
      }
      document.querySelectorAll("[data-mp-exit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          send({ type: "leave_match" });
          exitToLobby();
        });
      });
      window.addEventListener("beforeunload", () => {
        closedByUs = true;
        try { ws && ws.close(); } catch (_) {}
      });
    }

    function joinByCode() {
      const code = (el.roomCodeInput.value || "").toUpperCase().trim();
      if (!code) { toast("방 코드를 입력하세요", true); return; }
      if (cfg.tableMode) send({ type: "table_join", code });
      else send({ type: "join_room", code });
      el.roomDialog.hidden = true;
    }

    bindUI();
    if (el.nickInput && myNick) el.nickInput.value = myNick;
    connect();

    return {
      get id() { return myId; },
      get nick() { return myNick; },
      send,
      action: (a) => send({ type: "action", action: a }),
      sync: () => send({ type: "sync" }),
      leave: () => send({ type: "leave_match" }),
      forfeit: () => send({ type: "forfeit" }),
      tableCreate: (opts2) => send({ type: "table_create", opts: opts2 || {} }),
      tableJoin: (code) => send({ type: "table_join", code }),
      tableList: () => send({ type: "table_list" }),
      tableStart: () => send({ type: "table_start" }),
      tableLeave: () => send({ type: "table_leave" }),
      toast,
      showWaiting,
      hideWaiting,
      exitToLobby,
      reconnect: connect,
    };
  }

  root.MPClient = { create };
})(typeof window !== "undefined" ? window : globalThis);
