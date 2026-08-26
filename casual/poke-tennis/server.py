#!/usr/bin/env python3
"""Pokemon Tennis multiplayer relay: static files + WebSocket lobby/relay.

No game simulation here. Host client is authoritative for physics and
streams state frames; guest streams inputs. Server only relays between
the matched pair and manages lobby/challenge/room lifecycle.
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
from typing import Any
from urllib.parse import urlsplit, urlparse

ROOT = Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("PORT", "48938"))
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

MAX_FRAME = 64 * 1024
MSG_RATE_LIMIT = 900
MSG_RATE_WINDOW = 10.0
CHALLENGE_TTL = 60.0
HEARTBEAT_INTERVAL = 25.0

lock = threading.RLock()
clients: dict[str, "WSClient"] = {}
rooms: dict[str, dict[str, Any]] = {}
challenges: dict[str, dict[str, Any]] = {}


def nick_default() -> str:
    animals = ["피카", "이상", "꼬북", "파이", "이브", "뮤츠", "리자", "거북"]
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


def peer_of(client: WSClient) -> WSClient | None:
    with lock:
        mid = client.match_id
        match = matches.get(mid) if mid else None
    if not match:
        return None
    other_id = match["p1"] if match["p0"] == client.id else match["p0"]
    return clients.get(other_id)


matches: dict[str, dict[str, Any]] = {}


def start_match(p_host: str, p_guest: str) -> dict[str, Any]:
    state = {"id": uuid.uuid4().hex[:10], "p0": p_host, "p1": p_guest}
    with lock:
        matches[state["id"]] = state
    for pid, role in ((p_host, "host"), (p_guest, "guest")):
        c = clients.get(pid)
        if not c:
            continue
        c.match_id = state["id"]
        peer = clients.get(p_guest if role == "host" else p_host)
        c.send(
            {
                "type": "match",
                "role": role,
                "peerNick": peer.nick if peer else "?",
            }
        )
    broadcast_lobby()
    return state


def clear_match(state: dict[str, Any], leaver_id: str | None = None) -> None:
    with lock:
        matches.pop(state["id"], None)
    for pid in (state["p0"], state["p1"]):
        c = clients.get(pid)
        if not c:
            continue
        c.match_id = None
        if leaver_id and pid != leaver_id:
            c.send({"type": "peer_left"})
    broadcast_lobby()


def leave_current(client: WSClient) -> None:
    mid = client.match_id
    if not mid:
        return
    state = matches.get(mid)
    if state:
        clear_match(state, leaver_id=client.id)
    client.match_id = None


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
            if not other or not other.alive or other.match_id or client.match_id:
                client.send({"type": "error", "message": "상대를 찾을 수 없거나 대전 중"})
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
            if not fr or not fr.alive or fr.match_id:
                client.send({"type": "error", "message": "상대가 나갔습니다"})
                return
            if not accept:
                fr.send({"type": "challenge_declined", "by": client.nick})
                return
            start_match(ch["from"], client.id)
            return

        if typ == "create_room":
            code = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
            rooms[code] = {"host": client.id, "created": time.time()}
            client.send({"type": "room_created", "code": code})
            return

        if typ == "join_room":
            code = (msg.get("code") or "").upper().strip()
            room = rooms.pop(code, None)
            if not room or room["host"] == client.id:
                client.send({"type": "error", "message": "방을 찾을 수 없습니다"})
                return
            host = clients.get(room["host"])
            if not host or not host.alive or host.match_id or client.match_id:
                client.send({"type": "error", "message": "입장할 수 없습니다"})
                return
            start_match(room["host"], client.id)
            return

        if typ == "input":
            peer = peer_of(client)
            if peer:
                peer.send({"type": "peer_input", **{k: msg.get(k) for k in ("x", "vy", "swing")}})
            return

        if typ == "state":
            peer = peer_of(client)
            if peer:
                peer.send(msg)
            return

        if typ == "forfeit" or typ == "leave_match":
            leave_current(client)
            broadcast_lobby()
            return


def reap_stale(now: float) -> None:
    with lock:
        stale = [cid for cid, ch in challenges.items() if now - ch["at"] > CHALLENGE_TTL]
        for cid in stale:
            challenges.pop(cid, None)
        stale_rooms = [k for k, r in rooms.items() if now - r["created"] > 1800]
        for k in stale_rooms:
            rooms.pop(k, None)
        targets = [c for c in clients.values() if c.alive]
    for c in targets:
        if c.alive and not c.ping():
            on_disconnect(c)


def heartbeat_loop() -> None:
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            reap_stale(time.time())
        except Exception as exc:
            print(f"heartbeat error: {exc!r}", flush=True)


def on_disconnect(client: WSClient) -> None:
    with lock:
        clients.pop(client.id, None)
        dead_rooms = [k for k, r in rooms.items() if r["host"] == client.id]
        for k in dead_rooms:
            rooms.pop(k, None)
        dead_ch = [k for k, c in challenges.items() if c["from"] == client.id or c["to"] == client.id]
        for k in dead_ch:
            challenges.pop(k, None)
    leave_current(client)
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
        if parsed.path in ("/ws", "/casual/poke-tennis/ws"):
            self._upgrade_ws()
            return
        if parsed.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/casual/poke-tennis/")
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
            clients[pid] = client
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
    print(f"▶  포켓몬 테니스  http://{host}:{PORT}/casual/poke-tennis/")
    print(f"   ws → /ws")
    server.serve_forever()


if __name__ == "__main__":
    main()
