#!/usr/bin/env python3
"""Static file server with airouter proxy (avoids browser CORS)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

AIROUTER = os.environ.get("AIROUTER_BASE_URL", "http://192.168.223.101:20101")
ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "48888"))
GAME_ENTRY = os.environ.get("GAME_ENTRY", "/casual/")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _maybe_redirect_root(self) -> bool:
        if self.path not in ("/", "/index.html"):
            return False
        entry = GAME_ENTRY if GAME_ENTRY.startswith("/") else f"/{GAME_ENTRY}"
        if self.path == entry or entry in ("", "/"):
            return False
        self.send_response(302)
        self.send_header("Location", entry)
        self.end_headers()
        return True

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _proxy_allowed(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return (
            host in ("localhost", "127.0.0.1", "::1")
            or host.startswith("192.168.")
            or host.startswith("10.")
            or host.startswith("172.16.")
            or host.endswith(".local")
        )

    def _deny_proxy(self) -> None:
        body = json.dumps({"error": "airouter proxy is local-only"}).encode()
        self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/api/airouter/v1/images/generations":
            if not self._proxy_allowed():
                self._deny_proxy()
                return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            req = urllib.request.Request(
                f"{AIROUTER}/v1/images/generations",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    payload = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                    self._cors()
                    self.end_headers()
                    self.wfile.write(payload)
            except urllib.error.HTTPError as exc:
                err_body = exc.read()
                self.send_response(exc.code)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.end_headers()
                self.wfile.write(err_body or json.dumps({"error": str(exc)}).encode())
            except OSError as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(exc)}).encode())
            return
        super().do_POST()

    def do_HEAD(self) -> None:
        if self._maybe_redirect_root():
            return
        super().do_HEAD()

    def do_GET(self) -> None:
        if self._maybe_redirect_root():
            return
        if self.path.startswith("/api/airouter/v1/jobs/") and self.path.endswith("/artifact"):
            if not self._proxy_allowed():
                self._deny_proxy()
                return
            url = f"{AIROUTER}{self.path.removeprefix('/api/airouter')}"
            req = urllib.request.Request(url, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    payload = resp.read()
                    self.send_response(resp.status)
                    ctype = resp.headers.get("Content-Type", "application/octet-stream")
                    self.send_header("Content-Type", ctype)
                    self._cors()
                    self.end_headers()
                    self.wfile.write(payload)
            except urllib.error.HTTPError as exc:
                self.send_response(exc.code)
                self._cors()
                self.end_headers()
            except OSError:
                self.send_response(502)
                self._cors()
                self.end_headers()
            return
        super().do_GET()


def main() -> None:
    host = "0.0.0.0"
    server = ThreadingHTTPServer((host, PORT), Handler)
    print(f"▶  http://{host}:{PORT}{GAME_ENTRY}")
    print(f"   game entry → {GAME_ENTRY}")
    print(f"   airouter proxy → {AIROUTER}")
    server.serve_forever()


if __name__ == "__main__":
    main()
