#!/usr/bin/env python3
"""Start/stop static game servers on dedicated ports (see ports.json)."""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORTS_FILE = ROOT / "ports.json"
RUN_DIR = ROOT / ".run"
SERVE = ROOT / "serve.py"


def load_games() -> list[dict]:
    data = json.loads(PORTS_FILE.read_text(encoding="utf-8"))
    games = data.get("games") or []
    if not games:
        raise SystemExit("ports.json: games is empty")
    ports = [g["port"] for g in games]
    if len(ports) != len(set(ports)):
        raise SystemExit("ports.json: duplicate port")
    return games


def game_by_id(games: list[dict], game_id: str) -> dict:
    for g in games:
        if g["id"] == game_id:
            return g
    ids = ", ".join(g["id"] for g in games)
    raise SystemExit(f"unknown game id {game_id!r} (available: {ids})")


def pid_path(port: int) -> Path:
    return RUN_DIR / f"{port}.pid"


def read_pid(port: int) -> int | None:
    path = pid_path(port)
    if not path.exists():
        return None
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except ValueError:
        return None


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def kill_port(port: int) -> None:
    pid = read_pid(port)
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(20):
                if not port_open(port):
                    break
                time.sleep(0.1)
        except ProcessLookupError:
            pass
        pid_path(port).unlink(missing_ok=True)
    if port_open(port):
        try:
            out = subprocess.check_output(["lsof", "-ti", f":{port}"], text=True).strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            out = ""
        for token in out.split():
            try:
                os.kill(int(token), signal.SIGKILL)
            except (ProcessLookupError, ValueError):
                pass
        time.sleep(0.2)


def start_game(game: dict) -> None:
    port = int(game["port"])
    entry = game["entry"]
    kill_port(port)
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["GAME_ENTRY"] = entry
    script = game.get("script")
    cmd = [sys.executable, str(ROOT / script)] if script else [sys.executable, str(SERVE)]
    log = RUN_DIR / f"{port}.log"
    with log.open("w", encoding="utf-8") as fh:
        proc = subprocess.Popen(
            cmd,
            cwd=ROOT,
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    pid_path(port).write_text(str(proc.pid), encoding="utf-8")
    for _ in range(30):
        if port_open(port):
            break
        if proc.poll() is not None:
            tail = log.read_text(encoding="utf-8")[-800:]
            raise SystemExit(f"server failed on :{port}\n{tail}")
        time.sleep(0.1)
    print(f"▶  {game['name']}  http://127.0.0.1:{port}{entry}  (pid {proc.pid})")


def stop_game(game: dict) -> None:
    port = int(game["port"])
    was = port_open(port)
    kill_port(port)
    if was:
        print(f"■  {game['name']}  :{port} stopped")
    else:
        print(f"   {game['name']}  :{port} (not running)")


def cmd_status(games: list[dict]) -> None:
    for g in games:
        port = int(g["port"])
        pid = read_pid(port)
        state = "up" if port_open(port) else "down"
        pid_s = str(pid) if pid else "-"
        print(f"{state:4}  :{port}  {g['id']:14}  pid={pid_s}  {g['name']}")


def main(argv: list[str]) -> int:
    if not PORTS_FILE.exists():
        raise SystemExit(f"missing {PORTS_FILE}")
    games = load_games()
    if len(argv) < 2:
        print("usage: portctl.py up|down|status [game-id|all]")
        print("       default up/down target: hub")
        return 2
    action = argv[1]
    target = argv[2] if len(argv) > 2 else "hub"
    if action == "status":
        cmd_status(games)
        return 0
    if action not in {"up", "down"}:
        raise SystemExit(f"unknown action {action!r}")
    selected = games if target == "all" else [game_by_id(games, target)]
    for g in selected:
        if action == "up":
            start_game(g)
        else:
            stop_game(g)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
