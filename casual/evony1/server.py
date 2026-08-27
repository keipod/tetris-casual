#!/usr/bin/env python3
"""Evony Age I — static files + WebSocket game server."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import sys
import threading
import time
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import engine
from store import Store

PORT = int(os.environ.get("PORT", "48951"))
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 256 * 1024
MSG_RATE_LIMIT = 80
MSG_RATE_WINDOW = 10.0

store = Store()
lock = threading.RLock()
clients: dict[str, "WSClient"] = {}  # device_id -> client (last connection)


class WSClient:
    def __init__(self, conn, device_id: str):
        self.conn = conn
        self.device_id = device_id
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

    def close(self) -> None:
        self.alive = False
        try:
            self.conn.close()
        except OSError:
            pass


def read_frame(conn) -> tuple[int, bytes] | None:
    try:
        hdr = conn.recv(2)
        if len(hdr) < 2:
            return None
        opcode = hdr[0] & 0x0F
        masked = (hdr[1] & 0x80) != 0
        length = hdr[1] & 0x7F
        if length == 126:
            ext = conn.recv(2)
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = conn.recv(8)
            length = struct.unpack("!Q", ext)[0]
        if length > MAX_FRAME:
            return None
        mask = conn.recv(4) if masked else b""
        data = b""
        while len(data) < length:
            chunk = conn.recv(length - len(data))
            if not chunk:
                return None
            data += chunk
        if masked:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        return opcode, data
    except OSError:
        return None


def broadcast_chat(entry: dict[str, Any]) -> None:
    msg = {"type": "chat", "entry": entry}
    with lock:
        targets = [c for c in clients.values() if c.alive]
    for c in targets:
        c.send(msg)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/ws", "/casual/evony1/ws"):
            self._ws_handshake()
            return
        if parsed.path in ("/", "/index.html", "/casual/evony1/", "/casual/evony1/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def _ws_handshake(self) -> None:
        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(400)
            return
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        conn = self.connection
        device_id = "anon"
        client = WSClient(conn, device_id)
        try:
            while client.alive:
                frame = read_frame(conn)
                if frame is None:
                    break
                opcode, data = frame
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    client._send_frame(0xA, data)
                    continue
                if opcode != 0x1:
                    continue
                now = time.time()
                client.msg_times.append(now)
                while client.msg_times and now - client.msg_times[0] > MSG_RATE_WINDOW:
                    client.msg_times.popleft()
                if len(client.msg_times) > MSG_RATE_LIMIT:
                    client.send({"type": "error", "error": "rate limited"})
                    continue
                try:
                    msg = json.loads(data.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    client.send({"type": "error", "error": "bad json"})
                    continue
                if not isinstance(msg, dict):
                    continue
                typ = msg.get("type")
                if typ == "hello":
                    device_id = str(msg.get("device_id") or "").strip()[:64]
                    if len(device_id) < 8:
                        client.send({"type": "error", "error": "device_id required"})
                        continue
                    client.device_id = device_id
                    with lock:
                        old = clients.get(device_id)
                        if old and old is not client:
                            old.close()
                        clients[device_id] = client
                if not client.device_id or client.device_id == "anon":
                    client.send({"type": "error", "error": "send hello first"})
                    continue
                with lock:
                    result = engine.handle_action(store, client.device_id, msg)
                if typ == "chat" and result.get("ok"):
                    chat = store.recent_chat(1)
                    if chat:
                        broadcast_chat(chat[-1])
                out: dict[str, Any] = {"type": "result", "ok": result.get("ok", False)}
                if result.get("error"):
                    out["error"] = result["error"]
                if result.get("prize"):
                    out["prize"] = result["prize"]
                if result.get("snapshot"):
                    out["type"] = "snapshot"
                    out["snapshot"] = result["snapshot"]
                client.send(out)
        finally:
            with lock:
                if clients.get(client.device_id) is client:
                    del clients[client.device_id]
            client.close()


def tick_loop() -> None:
    while True:
        try:
            with lock:
                engine.tick(store)
        except Exception as exc:  # noqa: BLE001 — keep server alive
            sys.stderr.write(f"tick error: {exc}\n")
        time.sleep(2.0)


def main() -> None:
    engine.ensure_map(store)
    threading.Thread(target=tick_loop, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    sys.stderr.write(f"Evony Age I on http://127.0.0.1:{PORT}/ (ws /ws)\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
