#!/usr/bin/env python3
"""포켓몬월드 server: static + WebSocket lobby/room (2–4 players)."""

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
from typing import Any
from urllib.parse import urlparse, urlsplit

import engine

ROOT = Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("PORT", "48939"))
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CPU_PREFIX = "cpu"

MAX_FRAME = 64 * 1024
MSG_RATE_LIMIT = 50
MSG_RATE_WINDOW = 10.0
ENDED_MATCH_TTL = 300.0
HEARTBEAT_INTERVAL = 25.0
ROOM_TTL = 1800.0
MAX_SEATS = 4

lock = threading.RLock()
clients: dict[str, "WSClient"] = {}
rooms: dict[str, dict[str, Any]] = {}  # code -> {host, seats:[{id,nick,pokemonId}], created}
matches: dict[str, dict[str, Any]] = {}
ended_seen: dict[str, float] = {}


def nick_default() -> str:
    animals = ["피카", "이상", "꼬북", "파이", "이브", "뮤츠", "리자", "거북"]
    return f"{random.choice(animals)}{random.randint(10, 99)}"


def cpu_id(i: int) -> str:
    return f"{CPU_PREFIX}{i}"


class WSClient:
    def __init__(self, handler: "Handler", conn, player_id: str, nick: str):
        self.handler = handler
        self.conn = conn
        self.id = player_id
        self.nick = nick
        self.match_id: str | None = None
        self.room_code: str | None = None
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


def broadcast_lobby() -> None:
    with lock:
        online = [
            {"id": c.id, "nick": c.nick, "busy": bool(c.match_id or c.room_code)}
            for c in clients.values()
            if c.alive
        ]
        targets = [c for c in clients.values() if c.alive and not c.match_id]
    msg = {"type": "lobby", "players": online}
    for c in targets:
        c.send(msg)


def room_public(code: str, room: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "room",
        "code": code,
        "hostId": room["host"],
        "seats": [
            {"id": s["id"], "nick": s["nick"], "pokemonId": s.get("pokemonId"), "ready": s.get("ready", True)}
            for s in room["seats"]
        ],
        "maxSeats": MAX_SEATS,
    }


def push_room(code: str) -> None:
    with lock:
        room = rooms.get(code)
        if not room:
            return
        msg = room_public(code, room)
        ids = [s["id"] for s in room["seats"]]
    for pid in ids:
        c = clients.get(pid)
        if c and c.alive:
            c.send(msg)


def push_match(state: dict[str, Any], events: list[dict[str, Any]] | None = None) -> None:
    events = events if events is not None else engine.drain_events(state)
    for pid in state["order"]:
        if str(pid).startswith(CPU_PREFIX):
            continue
        with lock:
            client = clients.get(pid)
        if not client:
            continue
        client.send({"type": "match", "events": events, "state": engine.view_for(state, pid)})


def run_cpu_if_needed(state: dict[str, Any]) -> None:
    with lock:
        if state.get("_cpuRunning"):
            return
        if state["phase"] == "ended":
            return
        if not str(state["turn"]).startswith(CPU_PREFIX):
            return
        state["_cpuRunning"] = True

    def loop() -> None:
        try:
            while True:
                with lock:
                    if state["phase"] == "ended":
                        return
                    mid = state["id"]
                    if matches.get(mid) is not state:
                        return
                    turn = state["turn"]
                    if not str(turn).startswith(CPU_PREFIX):
                        return
                    act = engine.cpu_choose(state, turn)
                    if not act:
                        return
                    try:
                        engine.apply_action(state, turn, act)
                        events = engine.drain_events(state)
                    except ValueError:
                        return
                push_match(state, events)
                time.sleep(0.55)
                with lock:
                    if state["phase"] == "ended":
                        return
                    if str(state["turn"]).startswith(CPU_PREFIX):
                        continue
                    return
        finally:
            with lock:
                state["_cpuRunning"] = False

    threading.Thread(target=loop, daemon=True).start()


def start_match_from_room(code: str, fill_cpu: bool = False) -> dict[str, Any] | None:
    room = rooms.pop(code, None)
    if not room:
        return None
    seats = list(room["seats"])
    while fill_cpu and len(seats) < 2:
        i = len(seats)
        seats.append(
            {
                "id": cpu_id(i),
                "nick": f"CPU{i+1}",
                "pokemonId": engine.POKEMON[i % len(engine.POKEMON)]["id"],
                "isCpu": True,
            }
        )
    if fill_cpu and len(seats) < MAX_SEATS and len(seats) >= 1:
        # optional: host can request fill to N — handled by caller
        pass
    if len(seats) < 2:
        rooms[code] = room
        return None

    specs = []
    for i, s in enumerate(seats):
        specs.append(
            {
                "id": s["id"],
                "nick": s["nick"],
                "pokemonId": s.get("pokemonId") or engine.POKEMON[i % len(engine.POKEMON)]["id"],
                "isCpu": bool(s.get("isCpu") or str(s["id"]).startswith(CPU_PREFIX)),
            }
        )
    state = engine.new_match(specs)
    matches[state["id"]] = state
    for s in seats:
        if str(s["id"]).startswith(CPU_PREFIX):
            continue
        c = clients.get(s["id"])
        if c:
            c.match_id = state["id"]
            c.room_code = None
    push_match(state)
    if any(str(pid).startswith(CPU_PREFIX) for pid in state["order"]):
        run_cpu_if_needed(state)
    broadcast_lobby()
    return state


def start_cpu_practice(host_id: str, seats: int = 3, pokemon_id: str = "pikachu") -> dict[str, Any]:
    seats = max(2, min(4, seats))
    host = clients.get(host_id)
    nick = host.nick if host else nick_default()
    if pokemon_id not in engine.POKE_BY_ID:
        pokemon_id = "pikachu"
    specs = [
        {
            "id": host_id,
            "nick": nick,
            "pokemonId": pokemon_id,
            "isCpu": False,
        }
    ]
    for i in range(1, seats):
        specs.append(
            {
                "id": cpu_id(i),
                "nick": f"CPU{i}",
                "pokemonId": engine.POKEMON[i % len(engine.POKEMON)]["id"],
                "isCpu": True,
            }
        )
    state = engine.new_match(specs)
    matches[state["id"]] = state
    if host:
        host.match_id = state["id"]
        host.room_code = None
    push_match(state)
    run_cpu_if_needed(state)
    broadcast_lobby()
    return state


def leave_room(client: WSClient) -> None:
    code = client.room_code
    if not code:
        return
    room = rooms.get(code)
    client.room_code = None
    if not room:
        return
    room["seats"] = [s for s in room["seats"] if s["id"] != client.id]
    if not room["seats"] or room["host"] == client.id:
        rooms.pop(code, None)
        for s in room["seats"]:
            c = clients.get(s["id"])
            if c:
                c.room_code = None
                c.send({"type": "room_closed"})
    else:
        push_room(code)


def handle_message(client: WSClient, msg: dict[str, Any]) -> None:
    typ = msg.get("type")
    with lock:
        if typ == "hello":
            nick = (msg.get("nick") or "").strip()[:12] or nick_default()
            client.nick = nick
            client.send(
                {
                    "type": "welcome",
                    "id": client.id,
                    "nick": client.nick,
                    "pokemon": engine.POKEMON,
                    "items": engine.ITEMS,
                }
            )
            broadcast_lobby()
            return

        if typ == "set_nick":
            nick = (msg.get("nick") or "").strip()[:12]
            if nick:
                client.nick = nick
                client.send({"type": "welcome", "id": client.id, "nick": client.nick, "pokemon": engine.POKEMON, "items": engine.ITEMS})
                if client.room_code and client.room_code in rooms:
                    for s in rooms[client.room_code]["seats"]:
                        if s["id"] == client.id:
                            s["nick"] = nick
                    push_room(client.room_code)
                broadcast_lobby()
            return

        if typ == "create_room":
            if client.match_id or client.room_code:
                client.send({"type": "error", "message": "이미 방/대전 중"})
                return
            code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
            poke = (msg.get("pokemonId") or "pikachu").strip()
            if poke not in engine.POKE_BY_ID:
                poke = "pikachu"
            rooms[code] = {
                "host": client.id,
                "seats": [{"id": client.id, "nick": client.nick, "pokemonId": poke, "ready": True}],
                "created": time.time(),
            }
            client.room_code = code
            client.send(room_public(code, rooms[code]))
            broadcast_lobby()
            return

        if typ == "join_room":
            code = (msg.get("code") or "").upper().strip()
            room = rooms.get(code)
            if not room:
                client.send({"type": "error", "message": "방을 찾을 수 없습니다"})
                return
            if client.match_id or client.room_code:
                client.send({"type": "error", "message": "이미 방/대전 중"})
                return
            if any(s["id"] == client.id for s in room["seats"]):
                client.send({"type": "error", "message": "이미 입장함"})
                return
            if len(room["seats"]) >= MAX_SEATS:
                client.send({"type": "error", "message": "방이 가득 찼습니다 (최대 4명)"})
                return
            poke = (msg.get("pokemonId") or "bulbasaur").strip()
            if poke not in engine.POKE_BY_ID:
                poke = engine.POKEMON[len(room["seats"]) % len(engine.POKEMON)]["id"]
            room["seats"].append({"id": client.id, "nick": client.nick, "pokemonId": poke, "ready": True})
            client.room_code = code
            push_room(code)
            broadcast_lobby()
            return

        if typ == "set_pokemon":
            code = client.room_code
            if not code or code not in rooms:
                return
            poke = (msg.get("pokemonId") or "").strip()
            if poke not in engine.POKE_BY_ID:
                client.send({"type": "error", "message": "잘못된 포켓몬"})
                return
            for s in rooms[code]["seats"]:
                if s["id"] == client.id:
                    s["pokemonId"] = poke
            push_room(code)
            return

        if typ == "leave_room":
            leave_room(client)
            broadcast_lobby()
            return

        if typ == "start_room":
            code = client.room_code
            if not code or code not in rooms:
                client.send({"type": "error", "message": "방이 없어요"})
                return
            room = rooms[code]
            if room["host"] != client.id:
                client.send({"type": "error", "message": "방장만 시작할 수 있어요"})
                return
            fill = bool(msg.get("fillCpu"))
            target = int(msg.get("targetSeats") or len(room["seats"]))
            target = max(len(room["seats"]), min(MAX_SEATS, target))
            if fill:
                i = 0
                while len(room["seats"]) < target:
                    room["seats"].append(
                        {
                            "id": cpu_id(10 + i),
                            "nick": f"CPU{len(room['seats'])+1}",
                            "pokemonId": engine.POKEMON[len(room["seats"]) % len(engine.POKEMON)]["id"],
                            "isCpu": True,
                        }
                    )
                    i += 1
            if len(room["seats"]) < 2:
                client.send({"type": "error", "message": "최소 2명이 필요해요 (CPU 채우기 가능)"})
                return
            start_match_from_room(code, fill_cpu=False)
            return

        if typ == "cpu":
            if client.match_id:
                client.send({"type": "error", "message": "이미 대전 중"})
                return
            if client.room_code:
                leave_room(client)
            seats = int(msg.get("seats") or 3)
            poke = (msg.get("pokemonId") or "pikachu").strip()
            if poke not in engine.POKE_BY_ID:
                poke = "pikachu"
            start_cpu_practice(client.id, seats, poke)
            return

        if typ == "sync":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                client.send({"type": "match", "events": [], "state": engine.view_for(state, client.id)})
            return

        if typ == "action":
            mid = client.match_id
            if not mid or mid not in matches:
                client.send({"type": "error", "message": "진행 중인 대전 없음"})
                return
            state = matches[mid]
            if state["phase"] == "ended":
                client.send({"type": "error", "message": "match ended"})
                return
            try:
                engine.apply_action(state, client.id, msg.get("action") or {})
                events = engine.drain_events(state)
            except ValueError as exc:
                client.send({"type": "error", "message": str(exc)})
                return
            push_match(state, events)
            if any(str(pid).startswith(CPU_PREFIX) for pid in state["order"]) and state["phase"] != "ended":
                run_cpu_if_needed(state)
            return

        if typ == "forfeit":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                engine.forfeit(state, client.id)
                events = engine.drain_events(state)
                push_match(state, events)
                if state["phase"] == "ended":
                    _clear_match_later(state)
            return

        if typ == "invite":
            target_id = (msg.get("targetId") or "").strip()
            target = clients.get(target_id)
            if not target or not target.alive or target_id == client.id:
                client.send({"type": "error", "message": "초대할 상대가 없어요"})
                return
            if client.match_id or target.match_id:
                client.send({"type": "error", "message": "대전 중에는 초대할 수 없어요"})
                return
            if target.room_code:
                client.send({"type": "error", "message": "상대가 이미 다른 방에 있어요"})
                return
            code = client.room_code
            if not code or code not in rooms:
                poke = (msg.get("pokemonId") or "pikachu").strip()
                if poke not in engine.POKE_BY_ID:
                    poke = "pikachu"
                code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
                rooms[code] = {
                    "host": client.id,
                    "seats": [{"id": client.id, "nick": client.nick, "pokemonId": poke, "ready": True}],
                    "created": time.time(),
                }
                client.room_code = code
                client.send(room_public(code, rooms[code]))
                broadcast_lobby()
            room = rooms[code]
            if room["host"] != client.id:
                client.send({"type": "error", "message": "방장만 초대할 수 있어요"})
                return
            if any(s["id"] == target.id for s in room["seats"]):
                client.send({"type": "error", "message": "이미 같은 방이에요"})
                return
            if len(room["seats"]) >= MAX_SEATS:
                client.send({"type": "error", "message": "방이 가득 찼습니다 (최대 4명)"})
                return
            target.send(
                {
                    "type": "invite",
                    "code": code,
                    "fromId": client.id,
                    "fromNick": client.nick,
                }
            )
            client.send({"type": "toast", "message": f"{target.nick}에게 초대를 보냈어요"})
            return

        if typ == "accept_invite":
            handle_message(
                client,
                {
                    "type": "join_room",
                    "code": msg.get("code"),
                    "pokemonId": msg.get("pokemonId"),
                },
            )
            return

        if typ == "leave_match":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                if state["phase"] != "ended":
                    engine.forfeit(state, client.id)
                    events = engine.drain_events(state)
                    push_match(state, events)
                client.match_id = None
                humans_left = [
                    pid
                    for pid in state["order"]
                    if not str(pid).startswith(CPU_PREFIX)
                    and (c := clients.get(pid)) is not None
                    and c.match_id == mid
                ]
                if state["phase"] == "ended":
                    _clear_match_later(state)
                elif not humans_left:
                    _clear_match(state)
            else:
                client.match_id = None
            broadcast_lobby()
            return


def _clear_match(state: dict[str, Any]) -> None:
    mid = state["id"]
    matches.pop(mid, None)
    ended_seen.pop(mid, None)
    for pid in state["order"]:
        c = clients.get(pid)
        if c:
            c.match_id = None
    broadcast_lobby()


def _clear_match_later(state: dict[str, Any]) -> None:
    ended_seen.setdefault(state["id"], time.time())


def reap_stale() -> None:
    now = time.time()
    with lock:
        stale_rooms = [k for k, r in rooms.items() if now - r["created"] > ROOM_TTL]
        for k in stale_rooms:
            rooms.pop(k, None)
        ended = [
            state
            for mid, state in matches.items()
            if state["phase"] == "ended" and now - ended_seen.setdefault(mid, now) > ENDED_MATCH_TTL
        ]
        targets = [c for c in clients.values() if c.alive]
    for state in ended:
        with lock:
            _clear_match(state)
    for c in targets:
        if c.alive and not c.ping():
            on_disconnect(c)


def heartbeat_loop() -> None:
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            reap_stale()
        except Exception as exc:
            print(f"heartbeat error: {exc!r}", flush=True)


def on_disconnect(client: WSClient) -> None:
    with lock:
        clients.pop(client.id, None)
        leave_room(client)
        mid = client.match_id
        if mid and mid in matches:
            state = matches[mid]
            if state["phase"] != "ended":
                engine.forfeit(state, client.id)
                events = engine.drain_events(state)
                push_match(state, events)
            if state["phase"] == "ended" or all(
                str(pid).startswith(CPU_PREFIX) or not clients.get(pid) for pid in state["order"]
            ):
                _clear_match(state)
    broadcast_lobby()


def read_ws_frames(client: WSClient) -> None:
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
    on_disconnect(client)
    client.close()


def _recv_exact(conn, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            return b""
        buf += chunk
    return buf


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        pass

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/ws", "/casual/poke-world/ws"):
            self._upgrade_ws()
            return
        if parsed.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/casual/poke-world/")
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
        client = WSClient(self, self.connection, pid, nick_default())
        with lock:
            clients[pid] = client
        read_ws_frames(client)

    def _origin_allowed(self) -> bool:
        """Allow same-host hub→game port (e.g. :48888 page → :48939 /ws)."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        origin_host = urlsplit(origin).netloc
        if not origin_host:
            return True
        allowed = os.environ.get("WS_ALLOWED_ORIGINS", "").strip()
        if allowed:
            return any(
                origin_host == o.strip() or origin_host.endswith("." + o.strip())
                for o in allowed.split(",")
                if o.strip()
            )
        host = self.headers.get("Host", "")
        if origin_host == host:
            return True
        origin_name = origin_host.rsplit(":", 1)[0].lower().strip("[]")
        host_name = host.rsplit(":", 1)[0].lower().strip("[]")
        if origin_name and origin_name == host_name:
            return True
        local = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
        return origin_name in local and host_name in local


def main() -> None:
    host = "0.0.0.0"
    server = ThreadingHTTPServer((host, PORT), Handler)

    def _shutdown(signum, frame):
        with lock:
            cs = list(clients.values())
        for c in cs:
            c.close()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    print(f"▶  포켓몬월드  http://{host}:{PORT}/casual/poke-world/")
    print(f"   ws → /ws  (최대 4인 방)")
    server.serve_forever()


if __name__ == "__main__":
    main()
