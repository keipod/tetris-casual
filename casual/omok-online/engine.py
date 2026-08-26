#!/usr/bin/env python3
"""Authoritative Omok engine (15x15, free-style five-in-a-row)."""

from __future__ import annotations

import random
import uuid
from typing import Any

N = 15
EMPTY, BLACK, WHITE = 0, 1, 2
DIRS = [(1, 0), (0, 1), (1, 1), (1, -1)]


def new_match(p0: str, p1: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [p0, p1],
        "phase": "playing",
        "turn": p0,
        "board": [[EMPTY] * N for _ in range(N)],
        "last": None,
        "winLine": None,
        "winner": None,
        "moves": [],
    }


def _in_bounds(r: int, c: int) -> bool:
    return 0 <= r < N and 0 <= c < N


def _is_win(board: list[list[int]], r: int, c: int, color: int) -> list[tuple[int, int]] | None:
    for dr, dc in DIRS:
        cells = [(r, c)]
        rr, cc = r + dr, c + dc
        while _in_bounds(rr, cc) and board[rr][cc] == color:
            cells.append((rr, cc))
            rr += dr
            cc += dc
        rr, cc = r - dr, c - dc
        while _in_bounds(rr, cc) and board[rr][cc] == color:
            cells.insert(0, (rr, cc))
            rr -= dr
            cc -= dc
        if len(cells) >= 5:
            return cells[:5]
    return None


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise ValueError("게임이 끝났습니다")
    if pid != state["turn"]:
        raise ValueError("당신 차례이 아닙니다")
    try:
        r, c = int(action["r"]), int(action["c"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("잘못된 좌표")
    if not _in_bounds(r, c):
        raise ValueError("보드 밖 좌표")
    if state["board"][r][c] != EMPTY:
        raise ValueError("이미 놓인 자리")
    color = BLACK if state["order"].index(pid) == 0 else WHITE
    state.setdefault("_events", []).append({"type": "place", "r": r, "c": c, "color": color})
    state["board"][r][c] = color
    state["moves"].append([r, c])
    state["last"] = [r, c]
    win = _is_win(state["board"], r, c, color)
    if win:
        state["phase"] = "ended"
        state["winner"] = pid
        state["winLine"] = [[rr, cc] for rr, cc in win]
        state.setdefault("_events", []).append({"type": "win", "winner": pid, "color": color, "line": state["winLine"]})
    elif len(state["moves"]) >= N * N:
        state["phase"] = "ended"
        state["winner"] = None
        state.setdefault("_events", []).append({"type": "draw"})
    else:
        state["turn"] = state["order"][1 - state["order"].index(pid)]


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    idx = state["order"].index(pid) if pid in state["order"] else 0
    opp = state["order"][1 - idx]
    return {
        "game": "omok",
        "n": N,
        "board": state["board"],
        "phase": state["phase"],
        "yourColor": BLACK if idx == 0 else WHITE,
        "yourTurn": state["phase"] == "playing" and state["turn"] == pid,
        "turnPid": state["turn"],
        "oppPid": opp,
        "isCpuMatch": "cpu" in state["order"],
        "last": state["last"],
        "winLine": state["winLine"],
        "winner": state["winner"],
        "moveCount": len(state["moves"]),
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.pop("_events", [])


def forfeit(state: dict[str, Any], pid: str) -> None:
    if state["phase"] == "ended":
        return
    state["phase"] = "ended"
    idx = state["order"].index(pid) if pid in state["order"] else 0
    state["winner"] = state["order"][1 - idx]
    state.setdefault("_events", []).append({"type": "forfeit", "winner": state["winner"], "by": pid})


def cpu_should_act(state: dict[str, Any]) -> bool:
    return state["phase"] == "playing" and state["turn"] == "cpu"


def _line_len(board: list[list[int]], r: int, c: int, color: int, dr: int, dc: int) -> int:
    n = 0
    rr, cc = r + dr, c + dc
    while _in_bounds(rr, cc) and board[rr][cc] == color:
        n += 1
        rr += dr
        cc += dc
    return n


def _score(board: list[list[int]], r: int, c: int, color: int) -> int:
    s = 0
    for dr, dc in DIRS:
        n = 1 + _line_len(board, r, c, color, dr, dc) + _line_len(board, r, c, color, -dr, -dc)
        if n >= 5:
            s += 100000
        elif n == 4:
            s += 8000
        elif n == 3:
            s += 400
        elif n == 2:
            s += 20
    s += 14 - (abs(r - 7) + abs(c - 7))
    return s


def cpu_choose(state: dict[str, Any], _cpu_id: str) -> dict[str, Any]:
    board = state["board"]
    best_moves: list[tuple[int, int]] = []
    best_score = -1
    for r in range(N):
        for c in range(N):
            if board[r][c] != EMPTY:
                continue
            s = max(_score(board, r, c, WHITE), _score(board, r, c, BLACK) * 0.95)
            if s > best_score:
                best_score = s
                best_moves = [(r, c)]
            elif s == best_score:
                best_moves.append((r, c))
    r, c = random.choice(best_moves) if best_moves else (7, 7)
    return {"r": r, "c": c}
