#!/usr/bin/env python3
"""Two-client relay smoke test for poke-tennis server. Run with server on TEST_PORT."""

import base64
import hashlib
import json
import os
import socket
import struct
import sys
import time

PORT = int(os.environ.get("TEST_PORT", "48999"))
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class Ws:
    def __init__(self, name):
        self.name = name
        self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("handshake EOF")
            resp += chunk
        assert b"101" in resp.split(b"\r\n")[0], f"{name}: no upgrade: {resp[:120]!r}"
        expected = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        assert expected.encode() in resp, "bad accept key"

    def send(self, obj):
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        else:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", n))
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + mask + masked)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def recv_msgs(self, want=1, timeout=5.0):
        self.sock.settimeout(timeout)
        msgs = []
        buf = b""
        while len(msgs) < want:
            try:
                chunk = self.sock.recv(4096)
            except socket.timeout:
                break
            if not chunk:
                break
            buf += chunk
            while True:
                if len(buf) < 2:
                    break
                opcode = buf[0] & 0x0F
                masked = (buf[1] & 0x80) != 0
                ln = buf[1] & 0x7F
                off = 2
                if ln == 126:
                    if len(buf) < 4:
                        break
                    ln = struct.unpack("!H", buf[2:4])[0]
                    off = 4
                elif ln == 127:
                    if len(buf) < 10:
                        break
                    ln = struct.unpack("!Q", buf[2:10])[0]
                    off = 10
                mask = buf[off : off + 4] if masked else b""
                if masked:
                    off += 4
                if len(buf) < off + ln:
                    break
                payload = buf[off : off + ln]
                if masked:
                    payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                buf = buf[off + ln :]
                if opcode != 0x1:
                    continue
                msgs.append(json.loads(payload.decode()))
        return msgs


def by_type(msgs, typ):
    return next((m for m in msgs if m.get("type") == typ), None)


def main():
    print(f"connecting to 127.0.0.1:{PORT} ...")
    a = Ws("host")
    b = Ws("guest")
    a.send({"type": "hello", "nick": "호스트"})
    b.send({"type": "hello", "nick": "게스트"})
    time.sleep(0.6)
    a.recv_msgs(want=99, timeout=1)
    b.recv_msgs(want=99, timeout=1)

    a.send({"type": "create_room"})
    created = by_type(a.recv_msgs(want=1, timeout=2), "room_created")
    assert created, "no room_created"
    code = created["code"]

    b.send({"type": "join_room", "code": code})
    match_a = by_type(a.recv_msgs(want=1, timeout=3), "match")
    match_b = by_type(b.recv_msgs(want=1, timeout=3), "match")
    assert match_a and match_a["role"] == "host", f"host role wrong: {ma}"
    assert match_b and match_b["role"] == "guest", f"guest role wrong: {mb}"
    print(f"match ok: host={match_a['peerNick']} guest={match_b['peerNick']}")

    b.send({"type": "input", "x": 0.42, "vy": 12.0, "swing": True})
    got = by_type(a.recv_msgs(want=1, timeout=3), "peer_input")
    assert got and abs(got["x"] - 0.42) < 1e-6, f"relay broken: {got}"
    print("guest input → host peer_input ok")

    state = {"type": "state", "seq": 1, "ball": {"x": 50, "y": 80, "vx": 1, "vy": -2},
             "pHost": {"x": 50}, "pGuest": {"x": 40}, "score": {"host": 0, "guest": 0}}
    a.send(state)
    got = by_type(b.recv_msgs(want=1, timeout=3), "state")
    assert got and got["seq"] == 1, f"state relay broken: {got}"
    print("host state → guest ok")

    a.close()
    left = by_type(b.recv_msgs(want=1, timeout=5), "peer_left")
    assert left, "peer_left missing after host disconnect"
    print("disconnect → peer_left ok")

    b.close()
    print("ALL TENNIS RELAY TESTS PASSED")


if __name__ == "__main__":
    sys.exit(main())
