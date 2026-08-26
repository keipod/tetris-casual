#!/usr/bin/env python3
"""Shared multiplayer WebSocket framework for casual games (tcg-server pattern).

Duel mode  — 1:1 lobby identical to casual/tcg: online list, challenge,
             room codes, optional CPU opponent. Engine contract:
               new_match(p0, p1) -> state          ("cpu" allowed as p1)
               apply_action(state, pid, action)    raises ValueError on illegal
               view_for(state, pid) -> dict        per-player safe view
               drain_events(state) -> list[dict]   consumed once per push
               forfeit(state, pid) -> None
               cpu_should_act(state) -> bool       (optional, enables CPU)
               cpu_choose(state, "cpu") -> action  (optional)

Table mode — N-seat rooms (baccarat/poker style). Module contract:
               MAX_SEATS: int, MIN_SEATS: int
               new_table(host_id, host_nick, opts) -> state
               join(state, pid, nick) -> None      raises ValueError if full
               start(state) -> None                host starts (or auto)
               can_start(state) -> bool
               leave(state, pid) -> None
               ended(state) -> bool
               apply_action / view_for / drain_events / forfeit as above

Usage (game server.py):
    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "casual" / "assets"))
    import engine, mp_server
    mp_server.run_duel(title="…", port=48944, entry="/casual/x/", engine=engine)
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import random
import signal
import struct
import threading
import time
import uuid
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit, urlparse

ROOT = Path(__file__).resolve().parents[2]
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CPU_ID = "cpu"

MAX_FRAME = 64 * 1024
MSG_RATE_LIMIT = 40
MSG_RATE_WINDOW = 10.0
CHALLENGE_TTL = 60.0
ENDED_TTL = 300.0
HEARTBEAT_INTERVAL = 25.0

lock = threading.RLock()


def nick_default() -> str:
    animals = ["호랑이", "토끼", "여우", "곰", "두루미", "까치", "도깨비", "해태"]
    return f"{random.choice(animals)}{random.randint(10, 99)}"


class WSClient:
    def __init__(self, conn, player_id: str, nick: str):
        self.conn = conn
        self.id = player_id
        self.nick = nick
        self.match_id: str | None = None
        self.alive = True
        self.send_lock = threading.Lock()
        self.msg_times: deque[float] = deque()

    def _send_frame(self, opcode: int, payload: bytes) -> bool:
        if not self.alive:
            return False
        header = bytearray([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header.append(n)
        elif n < 65536:
            header.append(126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", n))
        try:
            with self.send_lock:
                self.conn.sendall(header + payload)
            return True
        except OSError:
            self.alive = False
            return False

    def send(self, obj: dict[str, Any]) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send_frame(0x1, data)

    def ping(self) -> bool:
        return self._send_frame(0x9, b"")

    def close(self) -> None:
        self.alive = False
        try:
            self.conn.close()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Shared app state (one instance per process)
# ---------------------------------------------------------------------------

class App:
    def __init__(self, *, mode: str, engine_mod: Any):
        self.mode = mode
        self.eng = engine_mod
        self.clients: dict[str, WSClient] = {}
        self.rooms: dict[str, dict[str, Any]] = {}
        self.matches: dict[str, dict[str, Any]] = {}
        self.challenges: dict[str, dict[str, Any]] = {}
        self.tables: dict[str, dict[str, Any]] = {}
        self.ended_seen: dict[str, float] = {}

    def broadcast_lobby(self) -> None:
        with lock:
            online = [
                {"id": c.id, "nick": c.nick, "busy": bool(c.match_id)}
                for c in self.clients.values()
                if c.alive
            ]
            targets = [c for c in self.clients.values() if c.alive and not c.match_id]
        msg = {"type": "lobby", "players": online}
        for c in targets:
            c.send(msg)

    def broadcast_tables(self) -> None:
        if self.mode != "table":
            return
        with lock:
            rows = []
            for code, st in self.tables.items():
                seats = self.eng.table_seats(st)
                rows.append({
                    "code": code,
                    "seats": seats,
                    "max": getattr(self.eng, "MAX_SEATS", 6),
                    "playing": bool(self.eng.table_running(st)),
                })
            targets = [c for c in self.clients.values() if c.alive]
        for c in targets:
            c.send({"type": "tables", "tables": rows})

    def push_state(self, state: dict[str, Any], events: list[dict[str, Any]] | None = None) -> None:
        events = events if events is not None else self.eng.drain_events(state)
        for pid in state["order"]:
            if pid == CPU_ID:
                continue
            with lock:
                client = self.clients.get(pid)
            if client:
                client.send({
                    "type": "match",
                    "events": events,
                    "state": self.eng.view_for(state, pid),
                })

    def clear_match(self, state: dict[str, Any]) -> None:
        mid = state["id"]
        self.matches.pop(mid, None)
        self.ended_seen.pop(mid, None)
        for pid in state["order"]:
            c = self.clients.get(pid)
            if c:
                c.match_id = None
                if self.mode == "table":
                    c.send({"type": "table_closed"})
        self.broadcast_lobby()
        self.broadcast_tables()

    def start_match(self, p0: str, p1: str) -> None:
        state = self.eng.new_match(p0, p1)
        self.matches[state["id"]] = state
        for pid in (p0, p1):
            if pid == CPU_ID:
                continue
            c = self.clients.get(pid)
            if c:
                c.match_id = state["id"]
        self.push_state(state)
        self.run_cpu_if_needed(state)
        self.broadcast_lobby()

    def run_cpu_if_needed(self, state: dict[str, Any]) -> None:
        if not hasattr(self.eng, "cpu_choose") or not hasattr(self.eng, "cpu_should_act"):
            return
        app = self

        def loop():
            while True:
                with lock:
                    if state["phase"] == "ended" or app.matches.get(state["id"]) is not state:
                        return
                    if not app.eng.cpu_should_act(state):
                        return
                    try:
                        act = app.eng.cpu_choose(state, CPU_ID)
                        app.eng.apply_action(state, CPU_ID, act)
                        events = app.eng.drain_events(state)
                    except ValueError:
                        return
                app.push_state(state, events)
                time.sleep(0.5)

        threading.Thread(target=loop, daemon=True).start()


APP: App | None = None



def handle_message(client: WSClient, msg: dict[str, Any]) -> None:
    app = APP
    assert app is not None
    typ = msg.get("type")
    with lock:
        if typ == "hello":
            nick = (msg.get("nick") or "").strip()[:12] or nick_default()
            client.nick = nick
            client.send({"type": "welcome", "id": client.id, "nick": client.nick})
            app.broadcast_lobby()
            app.broadcast_tables()
            return

        if typ == "set_nick":
            nick = (msg.get("nick") or "").strip()[:12]
            if nick:
                client.nick = nick
                client.send({"type": "welcome", "id": client.id, "nick": client.nick})
                app.broadcast_lobby()
                app.broadcast_tables()
            return

        if typ == "challenge":
            target = msg.get("targetId")
            if not target or target == client.id:
                client.send({"type": "error", "message": "잘못된 상대"})
                return
            other = app.clients.get(target)
            if not other or not other.alive or other.match_id:
                client.send({"type": "error", "message": "상대를 찾을 수 없거나 대전 중"})
                return
            if client.match_id:
                client.send({"type": "error", "message": "이미 대전 중"})
                return
            cid = uuid.uuid4().hex[:8]
            app.challenges[cid] = {"from": client.id, "to": target, "at": time.time()}
            other.send({"type": "challenge", "id": cid, "fromId": client.id, "fromNick": client.nick})
            client.send({"type": "challenge_sent", "id": cid, "toId": target})
            return

        if typ == "challenge_respond":
            cid = msg.get("id")
            accept = bool(msg.get("accept"))
            ch = app.challenges.pop(cid, None)
            if not ch or ch["to"] != client.id:
                client.send({"type": "error", "message": "만료된 신청"})
                return
            fr = app.clients.get(ch["from"])
            if not fr or not fr.alive:
                client.send({"type": "error", "message": "상대가 나갔습니다"})
                return
            if not accept:
                fr.send({"type": "challenge_declined", "by": client.nick})
                return
            _exit_table_if_any(client)
            app.start_match(ch["from"], client.id)
            return

        if typ == "create_room":
            code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
            app.rooms[code] = {"host": client.id, "created": time.time()}
            client.send({"type": "room_created", "code": code})
            return

        if typ == "join_room":
            code = (msg.get("code") or "").upper().strip()
            room = app.rooms.get(code)
            if not room:
                client.send({"type": "error", "message": "방을 찾을 수 없습니다"})
                return
            if room["host"] == client.id:
                client.send({"type": "error", "message": "이미 방장입니다"})
                return
            host = app.clients.get(room["host"])
            if not host or not host.alive or host.match_id or client.match_id:
                client.send({"type": "error", "message": "입장할 수 없습니다"})
                return
            app.rooms.pop(code, None)
            _exit_table_if_any(client)
            app.start_match(room["host"], client.id)
            return

        if typ == "cpu":
            if not hasattr(app.eng, "cpu_choose"):
                client.send({"type": "error", "message": "CPU 대국 미지원"})
                return
            if client.match_id:
                st = app.matches.get(client.match_id)
                if st and st["phase"] != "ended":
                    client.send({"type": "error", "message": "이미 대전 중"})
                    return
                if st:
                    app.clear_match(st)
                else:
                    client.match_id = None
            _exit_table_if_any(client)
            app.start_match(client.id, CPU_ID)
            return

        if typ == "sync":
            mid = client.match_id
            if mid and mid in app.matches:
                state = app.matches[mid]
                changed = False
                if app.mode == "table" and hasattr(app.eng, "maybe_tick"):
                    changed = app.eng.maybe_tick(state)
                    if changed and not state["order"]:
                        app.clear_match(state)
                        return
                client.send({
                    "type": "match",
                    "events": app.eng.drain_events(state) if changed else [],
                    "state": app.eng.view_for(state, client.id),
                })
            return

        if typ == "action":
            mid = client.match_id
            if not mid or mid not in app.matches:
                client.send({"type": "error", "message": "진행 중인 대전 없음"})
                return
            state = app.matches[mid]
            if state["phase"] == "ended":
                client.send({"type": "error", "message": "match ended"})
                return
            try:
                app.eng.apply_action(state, client.id, msg.get("action") or {})
                events = app.eng.drain_events(state)
            except ValueError as exc:
                client.send({"type": "error", "message": str(exc)})
                return
            if app.mode == "table":
                guard = 0
                while guard < 80:
                    try:
                        progressed = app.eng.bot_tick(state)
                    except Exception:
                        break
                    if not progressed or state.get("phase") in ("between", "ended"):
                        break
                    events += app.eng.drain_events(state)
                    guard += 1
                push_table(state)
                return
            app.push_state(state, events)
            app.run_cpu_if_needed(state)
            return

        if typ == "leave_match":
            if app.mode == "table":
                leave_table(client)
                return
            mid = client.match_id
            if mid and mid in app.matches:
                state = app.matches[mid]
                if state["phase"] != "ended":
                    app.eng.forfeit(state, client.id)
                    app.push_state(state, app.eng.drain_events(state))
                app.clear_match(state)
            client.match_id = None
            app.broadcast_lobby()
            return

        if typ == "table_create":
            if app.mode != "table":
                client.send({"type": "error", "message": "지원하지 않는 기능"})
                return
            if client.match_id:
                client.send({"type": "error", "message": "이미 테이블에 앉아 있습니다"})
                return
            _exit_table_if_any(client)
            code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=5))
            try:
                state = app.eng.new_table(client.id, client.nick, msg.get("opts") or {})
            except ValueError as exc:
                client.send({"type": "error", "message": str(exc)})
                return
            app.tables[code] = state
            app.matches[state["id"]] = state
            client.match_id = state["id"]
            client.send({"type": "table_created", "code": code, "state": app.eng.view_for(state, client.id)})
            app.broadcast_tables()
            return

        if typ == "table_list":
            app.broadcast_tables()
            client.send({"type": "tables_refreshed"})
            return

        if typ == "table_join":
            if app.mode != "table":
                client.send({"type": "error", "message": "지원하지 않는 기능"})
                return
            code = (msg.get("code") or "").upper().strip()
            state = app.tables.get(code)
            if not state:
                client.send({"type": "error", "message": "테이블을 찾을 수 없습니다"})
                return
            if client.match_id:
                client.send({"type": "error", "message": "이미 테이블에 앉아 있습니다"})
                return
            try:
                app.eng.join(state, client.id, client.nick)
            except ValueError as exc:
                client.send({"type": "error", "message": str(exc)})
                return
            client.match_id = state["id"]
            push_table(state)
            client.send({"type": "table_joined", "code": code})
            app.broadcast_tables()
            return

        if typ == "table_start":
            state = _state_of(client)
            if not state:
                client.send({"type": "error", "message": "테이블 없음"})
                return
            try:
                app.eng.start(state, client.id)
            except ValueError as exc:
                client.send({"type": "error", "message": str(exc)})
                return
            if hasattr(app.eng, "bot_tick"):
                guard = 0
                while guard < 80:
                    try:
                        progressed = app.eng.bot_tick(state)
                    except Exception:
                        break
                    if not progressed or state.get("phase") in ("between", "ended"):
                        break
                    app.eng.drain_events(state)
                    guard += 1
            push_table(state)
            return

        if typ == "table_leave":
            leave_table(client)
            return


def _state_of(client: WSClient) -> dict[str, Any] | None:
    app = APP
    assert app is not None
    mid = client.match_id
    return app.matches.get(mid) if mid else None


def push_table(state: dict[str, Any]) -> None:
    app = APP
    assert app is not None
    events = app.eng.drain_events(state)
    for pid in state["order"]:
        with lock:
            client = app.clients.get(pid)
        if client:
            client.send({"type": "match", "events": events, "state": app.eng.view_for(state, pid)})


def _exit_table_if_any(client: WSClient) -> None:
    app = APP
    assert app is not None
    state = _state_of(client)
    if state and app.mode == "table" and not app.eng.ended(state):
        try:
            app.eng.leave(state, client.id)
        except ValueError:
            pass
        push_table(state)
        if not state["order"]:
            for code, st in list(app.tables.items()):
                if st is state:
                    app.tables.pop(code)


def leave_table(client: WSClient) -> None:
    app = APP
    assert app is not None
    state = _state_of(client)
    if state:
        _exit_table_if_any(client)
        client.match_id = None
        app.broadcast_lobby()
        app.broadcast_tables()



def reap_stale(app: App) -> None:
    now = time.time()
    with lock:
        stale_ch = [cid for cid, ch in app.challenges.items() if now - ch["at"] > CHALLENGE_TTL]
        for cid in stale_ch:
            app.challenges.pop(cid, None)
        dead_rooms = [k for k, r in app.rooms.items()
                      if not app.clients.get(r["host"]) or not app.clients[r["host"]].alive]
        for k in dead_rooms:
            app.rooms.pop(k, None)
        ended = [st for mid, st in app.matches.items()
                 if app.eng.ended(st) and now - app.ended_seen.setdefault(mid, now) > ENDED_TTL]
        for st in ended:
            app.ended_seen.pop(st["id"], None)
        empty_tables = []
        if app.mode == "table":
            empty_tables = [st for code, st in app.tables.items() if not st["order"]]
            for st in empty_tables:
                for code, s2 in list(app.tables.items()):
                    if s2 is st:
                        app.tables.pop(code)
        targets = [c for c in app.clients.values() if c.alive]
    for st in ended + empty_tables:
        app.clear_match(st)
    for c in targets:
        if not c.ping():
            on_disconnect(app, c)


def heartbeat_loop(app: App) -> None:
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            reap_stale(app)
        except Exception as exc:
            print(f"heartbeat error: {exc!r}", flush=True)


def on_disconnect(app: App, client: WSClient) -> None:
    with lock:
        app.clients.pop(client.id, None)
        dead_rooms = [k for k, r in app.rooms.items() if r["host"] == client.id]
        for k in dead_rooms:
            app.rooms.pop(k, None)
        dead_ch = [k for k, c in app.challenges.items() if c["from"] == client.id or c["to"] == client.id]
        for k in dead_ch:
            app.challenges.pop(k, None)
    state = _state_of(client)
    if state:
        if app.mode == "duel":
            if not app.eng.ended(state):
                app.eng.forfeit(state, client.id)
                app.push_state(state, app.eng.drain_events(state))
            app.clear_match(state)
        else:
            try:
                app.eng.leave(state, client.id)
            except ValueError:
                pass
            push_table(state)
            alive_codes = [code for code, st in app.tables.items() if st is state]
            if not state["order"]:
                for code in alive_codes:
                    app.tables.pop(code, None)
                app.clear_match(state)
    client.match_id = None
    app.broadcast_lobby()
    app.broadcast_tables()



def read_ws_frames(app: App, client: WSClient) -> None:
    conn = client.conn
    conn.settimeout(None)
    while client.alive:
        try:
            hdr = _recv_exact(conn, 2)
            if not hdr:
                break
            b1, b2 = hdr[0], hdr[1]
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", _recv_exact(conn, 2))[0]
            elif length == 127:
                length = struct.unpack("!Q", _recv_exact(conn, 8))[0]
            if length > MAX_FRAME:
                break
            mask = _recv_exact(conn, 4) if masked else b""
            payload = _recv_exact(conn, length) if length else b""
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                break
            if opcode == 0x9:
                if not client._send_frame(0xA, payload):
                    break
                continue
            if opcode != 0x1:
                continue
            now = time.time()
            times = client.msg_times
            while times and now - times[0] > MSG_RATE_WINDOW:
                times.popleft()
            if len(times) >= MSG_RATE_LIMIT:
                break
            times.append(now)
            try:
                msg = json.loads(payload.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            handle_message(client, msg)
        except (OSError, struct.error):
            break
    on_disconnect(app, client)
    client.close()


def _recv_exact(conn, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            return b""
        buf += chunk
    return buf


def run_duel(*, title: str, port: int, entry: str, engine_mod: Any, ws_paths: tuple[str, ...] = ("/ws",)) -> None:
    global APP
    APP = App(mode="duel", engine_mod=engine_mod)
    _serve(title=title, port=port, entry=entry, ws_paths=ws_paths)


def run_table(*, title: str, port: int, entry: str, game_mod: Any, ws_paths: tuple[str, ...] = ("/ws",)) -> None:
    global APP
    APP = App(mode="table", engine_mod=game_mod)
    _serve(title=title, port=port, entry=entry, ws_paths=ws_paths)


def _serve(*, title: str, port: int, entry: str, ws_paths: tuple[str, ...]) -> None:
    app = APP
    assert app is not None

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def log_message(self, fmt: str, *args) -> None:
            pass

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path in ws_paths:
                self._upgrade_ws()
                return
            if parsed.path in ("/", "/index.html"):
                self.send_response(302)
                self.send_header("Location", entry)
                self.end_headers()
                return
            super().do_GET()

        def _upgrade_ws(self) -> None:
            key = self.headers.get("Sec-WebSocket-Key")
            if not key:
                self.send_error(400, "Missing Sec-WebSocket-Key")
                return
            if not self._origin_allowed():
                self.send_error(403, "Origin not allowed")
                return
            accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
            self.send_response(101, "Switching Protocols")
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()
            pid = uuid.uuid4().hex[:10]
            client = WSClient(self.connection, pid, nick_default())
            with lock:
                app.clients[pid] = client
            read_ws_frames(app, client)

        def _origin_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            if not origin:
                return True
            origin_host = urlsplit(origin).netloc
            if not origin_host:
                return True
            allowed = os.environ.get("WS_ALLOWED_ORIGINS", "").strip()
            if allowed:
                return any(origin_host == o.strip() or origin_host.endswith("." + o.strip())
                           for o in allowed.split(",") if o.strip())
            host = self.headers.get("Host", "")
            if origin_host == host:
                return True
            origin_name = origin_host.rsplit(":", 1)[0].lower().strip("[]")
            host_name = host.rsplit(":", 1)[0].lower().strip("[]")
            if origin_name and origin_name == host_name:
                return True
            local = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
            return origin_name in local and host_name in local

    host = "0.0.0.0"
    server = ThreadingHTTPServer((host, port), Handler)

    def _shutdown(signum, frame):
        with lock:
            cs = list(app.clients.values())
        for c in cs:
            c.close()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)
    threading.Thread(target=heartbeat_loop, args=(app,), daemon=True).start()
    print(f"▶  {title}  http://{host}:{port}{entry}")
    print(f"   ws → {', '.join(ws_paths)}")
    server.serve_forever()
