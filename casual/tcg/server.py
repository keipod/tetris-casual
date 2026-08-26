#!/usr/bin/env python3
"""Pokémon TCG server: static files + WebSocket lobby/match."""

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
from urllib.parse import urlsplit, urlparse

import engine

ROOT = Path(__file__).resolve().parents[2]  # repo root
PORT = int(os.environ.get("PORT", "48900"))
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CPU_ID = "cpu"

MAX_FRAME = 64 * 1024
MSG_RATE_LIMIT = 40
MSG_RATE_WINDOW = 10.0
CHALLENGE_TTL = 60.0
ENDED_MATCH_TTL = 300.0
HEARTBEAT_INTERVAL = 25.0

lock = threading.RLock()
clients: dict[str, "WSClient"] = {}  # player_id -> client
rooms: dict[str, dict[str, Any]] = {}  # code -> room
matches: dict[str, dict[str, Any]] = {}  # match_id -> state
challenges: dict[str, dict[str, Any]] = {}  # challenge_id -> {...}
ended_seen: dict[str, float] = {}  # match_id -> first time seen ended


def nick_default() -> str:
    animals = ["피카", "이상", "꼬북", "파이", "이브", "뮤츠", "리자", "거북"]
    return f"{random.choice(animals)}{random.randint(10, 99)}"


class WSClient:
    def __init__(self, handler: "Handler", conn, player_id: str, nick: str):
        self.handler = handler
        self.conn = conn
        self.id = player_id
        self.nick = nick
        self.match_id: str | None = None
        self.alive = True
        self.buf = b""
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
            {"id": c.id, "nick": c.nick, "busy": bool(c.match_id)}
            for c in clients.values()
            if c.alive
        ]
    msg = {"type": "lobby", "players": online}
    with lock:
        targets = list(clients.values())
    for c in targets:
        if c.alive and not c.match_id:
            c.send(msg)


def push_match(state: dict[str, Any], events: list[dict[str, Any]] | None = None) -> None:
    events = events if events is not None else engine.drain_events(state)
    for pid in state["order"]:
        if pid == CPU_ID:
            continue
        with lock:
            client = clients.get(pid)
        if not client:
            continue
        client.send(
            {
                "type": "match",
                "events": events,
                "state": engine.view_for(state, pid),
            }
        )


def run_cpu_if_needed(state: dict[str, Any]) -> None:
    """Drive CPU turns / setup (non-blocking loop with small delays via thread)."""
    def loop():
        while True:
            with lock:
                if state["phase"] == "ended":
                    return
                mid = state["id"]
                if matches.get(mid) is not state:
                    return
                act = None
                pc = state.get("pendingChoice")
                if pc and pc.get("player") == CPU_ID:
                    act = engine.cpu_choose(state, CPU_ID)
                elif state["phase"] == "setup":
                    if not state["setupReady"].get(CPU_ID):
                        act = engine.cpu_choose(state, CPU_ID)
                elif state["phase"] == "playing" and state["turn"] == CPU_ID and not pc:
                    act = engine.cpu_choose(state, CPU_ID)
                if not act:
                    return
                try:
                    engine.apply_action(state, CPU_ID, act)
                    events = engine.drain_events(state)
                except ValueError:
                    return
            push_match(state, events)
            time.sleep(0.45)
            with lock:
                if state["phase"] == "ended":
                    return
                pc2 = state.get("pendingChoice")
                if pc2 and pc2.get("player") == CPU_ID:
                    continue
                if state["phase"] == "setup" and state["setupReady"].get(CPU_ID):
                    if not all(state["setupReady"].get(p) for p in state["order"]):
                        return
                    continue
                if state["phase"] == "playing" and state["turn"] == CPU_ID:
                    continue
                return

    threading.Thread(target=loop, daemon=True).start()


def start_match(p0: str, p1: str) -> dict[str, Any]:
    state = engine.new_match(p0, p1)
    matches[state["id"]] = state
    for pid in (p0, p1):
        if pid == CPU_ID:
            continue
        c = clients.get(pid)
        if c:
            c.match_id = state["id"]
    push_match(state)
    if CPU_ID in state["order"]:
        run_cpu_if_needed(state)
    broadcast_lobby()
    return state


def handle_message(client: WSClient, msg: dict[str, Any]) -> None:
    typ = msg.get("type")
    with lock:
        if typ == "hello":
            nick = (msg.get("nick") or "").strip()[:12] or nick_default()
            client.nick = nick
            client.send({"type": "welcome", "id": client.id, "nick": client.nick})
            broadcast_lobby()
            return

        if typ == "set_nick":
            nick = (msg.get("nick") or "").strip()[:12]
            if nick:
                client.nick = nick
                client.send({"type": "welcome", "id": client.id, "nick": client.nick})
                broadcast_lobby()
            return

        if typ == "challenge":
            target = msg.get("targetId")
            if not target or target == client.id:
                client.send({"type": "error", "message": "잘못된 상대"})
                return
            other = clients.get(target)
            if not other or not other.alive or other.match_id:
                client.send({"type": "error", "message": "상대를 찾을 수 없거나 대전 중"})
                return
            if client.match_id:
                client.send({"type": "error", "message": "이미 대전 중"})
                return
            cid = uuid.uuid4().hex[:8]
            challenges[cid] = {"from": client.id, "to": target, "at": time.time()}
            other.send({"type": "challenge", "id": cid, "fromId": client.id, "fromNick": client.nick})
            client.send({"type": "challenge_sent", "id": cid, "toId": target})
            return

        if typ == "challenge_respond":
            cid = msg.get("id")
            accept = bool(msg.get("accept"))
            ch = challenges.pop(cid, None)
            if not ch or ch["to"] != client.id:
                client.send({"type": "error", "message": "만료된 신청"})
                return
            fr = clients.get(ch["from"])
            if not fr or not fr.alive:
                client.send({"type": "error", "message": "상대가 나갔습니다"})
                return
            if not accept:
                fr.send({"type": "challenge_declined", "by": client.nick})
                return
            start_match(ch["from"], client.id)
            return

        if typ == "create_room":
            code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
            rooms[code] = {"host": client.id, "guest": None, "created": time.time()}
            client.send({"type": "room_created", "code": code})
            return

        if typ == "join_room":
            code = (msg.get("code") or "").upper().strip()
            room = rooms.get(code)
            if not room:
                client.send({"type": "error", "message": "방을 찾을 수 없습니다"})
                return
            if room["host"] == client.id:
                client.send({"type": "error", "message": "이미 방장입니다"})
                return
            host = clients.get(room["host"])
            if not host or not host.alive or host.match_id or client.match_id:
                client.send({"type": "error", "message": "입장할 수 없습니다"})
                return
            rooms.pop(code, None)
            start_match(room["host"], client.id)
            return

        if typ == "cpu":
            if client.match_id:
                st = matches.get(client.match_id)
                if st and st["phase"] != "ended":
                    client.send({"type": "error", "message": "이미 대전 중"})
                    return
                if st:
                    _clear_match(st)
                else:
                    client.match_id = None
            start_match(client.id, CPU_ID)
            return

        if typ == "sync":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                client.send(
                    {
                        "type": "match",
                        "events": [],
                        "state": engine.view_for(state, client.id),
                    }
                )
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
            if CPU_ID in state["order"] and state["phase"] != "ended":
                run_cpu_if_needed(state)
            # Keep ended matches until leave_match so late clicks don't see "대전 없음"
            return

        if typ == "forfeit":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                engine.forfeit(state, client.id)
                events = engine.drain_events(state)
                push_match(state, events)
                _clear_match(state)
            return

        if typ == "leave_match":
            mid = client.match_id
            if mid and mid in matches:
                state = matches[mid]
                if state["phase"] != "ended":
                    engine.forfeit(state, client.id)
                    events = engine.drain_events(state)
                    push_match(state, events)
                _clear_match(state)
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


def reap_stale() -> None:
    now = time.time()
    with lock:
        stale_ch = [cid for cid, ch in challenges.items() if now - ch["at"] > CHALLENGE_TTL]
        for cid in stale_ch:
            challenges.pop(cid, None)
        ended = [
            state
            for mid, state in matches.items()
            if state["phase"] == "ended"
            and now - ended_seen.setdefault(mid, now) > ENDED_MATCH_TTL
        ]
        for state in ended:
            ended_seen.pop(state["id"], None)
        targets = [c for c in clients.values() if c.alive]
    for state in ended:
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
        # cancel rooms hosted
        dead_rooms = [k for k, r in rooms.items() if r["host"] == client.id]
        for k in dead_rooms:
            rooms.pop(k, None)
        dead_ch = [k for k, c in challenges.items() if c["from"] == client.id or c["to"] == client.id]
        for k in dead_ch:
            challenges.pop(k, None)
        mid = client.match_id
        if mid and mid in matches:
            state = matches[mid]
            if state["phase"] != "ended":
                engine.forfeit(state, client.id)
                events = engine.drain_events(state)
                push_match(state, events)
            _clear_match(state)
    broadcast_lobby()


def read_ws_frames(client: WSClient) -> None:
    conn = client.conn
    # Idle clients still receive match pushes; don't kill the socket on read idle.
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
            if opcode == 0x9:  # ping → pong
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
        if parsed.path in ("/ws", "/casual/tcg/ws"):
            self._upgrade_ws()
            return
        if parsed.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/casual/tcg/")
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
        # hello deferred until client sends hello
        read_ws_frames(client)

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        origin_host = urlsplit(origin).netloc
        if not origin_host:
            return True
        allowed = os.environ.get("WS_ALLOWED_ORIGINS", "").strip()
        if allowed:
            return any(origin_host == o.strip() or origin_host.endswith("." + o.strip()) for o in allowed.split(",") if o.strip())
        return origin_host == self.headers.get("Host", "")


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
    print(f"▶  포켓몬 카드대전  http://{host}:{PORT}/casual/tcg/")
    print(f"   ws → /ws")
    server.serve_forever()


if __name__ == "__main__":
    main()
