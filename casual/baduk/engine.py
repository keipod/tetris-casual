#!/usr/bin/env python3
"""Authoritative Baduk engine — 9x9, area scoring, simple-ko."""

from __future__ import annotations

import random
import uuid
from typing import Any

N = 9
EMPTY, BLACK, WHITE = 0, 1, 2
KOMI = 6.5


def new_match(p0: str, p1: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [p0, p1],
        "phase": "playing",
        "turn": p0,
        "board": [[EMPTY] * N for _ in range(N)],
        "captures": {p0: 0, p1: 0},
        "passes": 0,
        "lastMove": None,
        "lastColor": None,
        "prevBoard": None,
        "winner": None,
        "resultText": None,
        "territory": None,
        "resigned": None,
        "_events": [],
    }


def _neighbors(r: int, c: int):
    if r > 0:
        yield r - 1, c
    if r < N - 1:
        yield r + 1, c
    if c > 0:
        yield r, c - 1
    if c < N - 1:
        yield r, c + 1


def _group_and_libs(board, r: int, c: int) -> tuple[list[tuple[int, int]], int]:
    color = board[r][c]
    seen = {(r, c)}
    stack = [(r, c)]
    libs = set()
    while stack:
        cr, cc = stack.pop()
        for nr, nc in _neighbors(cr, cc):
            v = board[nr][nc]
            if v == EMPTY:
                libs.add((nr, nc))
            elif v == color and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    return list(seen), len(libs)


def _copy(board):
    return [row[:] for row in board]


def _try_move(board: list[list[int]], r: int, c: int, color: int):
    if not (0 <= r < N and 0 <= c < N):
        raise ValueError("판 밖 좌표")
    if board[r][c] != EMPTY:
        raise ValueError("이미 놓인 자리")
    nb = _copy(board)
    nb[r][c] = color
    opp = BLACK + WHITE - color
    captured: list[tuple[int, int]] = []
    for nr, nc in _neighbors(r, c):
        if nb[nr][nc] == opp:
            grp, libs = _group_and_libs(nb, nr, nc)
            if libs == 0:
                for gr, gc in grp:
                    nb[gr][gc] = EMPTY
                    captured.append((gr, gc))
    _, own_libs = _group_and_libs(nb, r, c)
    if own_libs == 0:
        raise ValueError("자충수는 둘 수 없습니다")
    return nb, captured


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise ValueError("게임이 진행 중이 아닙니다")
    if pid != state["turn"]:
        raise ValueError("당신 차례이 아닙니다")
    t = action.get("t")

    if t == "pass":
        state.setdefault("_events", []).append({"type": "pass", "by": pid})
        state["passes"] += 1
        state["lastMove"] = None
        state["lastColor"] = None
        if state["passes"] >= 2:
            _finish_by_score(state)
        else:
            state["turn"] = state["order"][1 - state["order"].index(pid)]
        return

    if t == "resign":
        state["phase"] = "ended"
        state["winner"] = state["order"][1 - state["order"].index(pid)]
        state["resigned"] = pid
        state["resultText"] = "기권"
        state.setdefault("_events", []).append({"type": "forfeit", "winner": state["winner"], "by": pid})
        return

    if t != "place":
        raise ValueError("잘못된 행동")

    try:
        r, c = int(action["r"]), int(action["c"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("잘못된 좌표")
    color = BLACK if state["order"].index(pid) == 0 else WHITE
    nb, captured = _try_move(state["board"], r, c, color)
    if state["prevBoard"] is not None and nb == state["prevBoard"]:
        raise ValueError("코 규칙: 바로 잡힌 돌을 되잡을 수 없습니다")
    state["prevBoard"] = _copy(state["board"])
    state["board"] = nb
    state["passes"] = 0
    state["lastMove"] = [r, c]
    state["lastColor"] = color
    ev = {"type": "place", "r": r, "c": c, "color": color}
    if captured:
        state["captures"][pid] += len(captured)
        ev["captured"] = [[cr, cc] for cr, cc in captured]
        ev["capturedColor"] = opp = BLACK + WHITE - color
        state.setdefault("_events", []).append(ev)
        state.setdefault("_events", []).append({"type": "capture", "cells": ev["captured"], "color": ev["capturedColor"]})
    else:
        state.setdefault("_events", []).append(ev)
    state["turn"] = state["order"][1 - state["order"].index(pid)]


def _flood_owner(board, r: int, c: int) -> int:
    seen = {(r, c)}
    stack = [(r, c)]
    borders = set()
    while stack:
        cr, cc = stack.pop()
        for nr, nc in _neighbors(cr, cc):
            v = board[nr][nc]
            if v == EMPTY and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
            elif v != EMPTY:
                borders.add(v)
    if borders == {BLACK}:
        return BLACK
    if borders == {WHITE}:
        return WHITE
    return EMPTY


def _finish_by_score(state: dict[str, Any]) -> None:
    board = state["board"]
    terr = [[EMPTY] * N for _ in range(N)]
    b_area = w_area = 0
    for r in range(N):
        for c in range(N):
            if board[r][c] == BLACK:
                b_area += 1
            elif board[r][c] == WHITE:
                w_area += 1
            else:
                owner = _flood_owner(board, r, c)
                terr[r][c] = owner
                if owner == BLACK:
                    b_area += 1
                elif owner == WHITE:
                    w_area += 1
    w_total = w_area + KOMI
    terr_event = {
        "type": "scored",
        "blackArea": b_area,
        "whiteArea": round(w_total, 1),
        "komi": KOMI,
    }
    state["territory"] = terr
    state["phase"] = "ended"
    if b_area > w_total:
        state["winner"] = state["order"][0]
        state["resultText"] = f"흑 {b_area} 대 백 {w_total} · 흑 {round(b_area - w_total, 1)}점 승"
    else:
        state["winner"] = state["order"][1]
        state["resultText"] = f"흑 {b_area} 대 백 {w_total} · 백 {round(w_total - b_area, 1)}점 승"
    terr_event["resultText"] = state["resultText"]
    terr_event["winner"] = state["winner"]
    state.setdefault("_events", []).append(terr_event)


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    idx = state["order"].index(pid) if pid in state["order"] else 0
    return {
        "game": "baduk",
        "n": N,
        "board": state["board"],
        "phase": state["phase"],
        "yourColor": BLACK if idx == 0 else WHITE,
        "yourTurn": state["phase"] == "playing" and state["turn"] == pid,
        "isCpuMatch": "cpu" in state["order"],
        "capturesBlack": state["captures"][state["order"][0]],
        "capturesWhite": state["captures"][state["order"][1]],
        "lastMove": state["lastMove"],
        "lastColor": state["lastColor"],
        "winner": state["winner"],
        "resultText": state["resultText"],
        "territory": state["territory"],
        "moveCount": sum(v for row in state["board"] for v in row),
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.pop("_events", [])


def forfeit(state: dict[str, Any], pid: str) -> None:
    if state["phase"] == "ended":
        return
    state["phase"] = "ended"
    idx = state["order"].index(pid) if pid in state["order"] else 0
    state["winner"] = state["order"][1 - idx]
    state["resultText"] = "기권"
    state.setdefault("_events", []).append({"type": "forfeit", "winner": state["winner"], "by": pid})


def cpu_should_act(state: dict[str, Any]) -> bool:
    return state["phase"] == "playing" and state["turn"] == "cpu"


def _cpu_candidates(state: dict[str, Any], color: int) -> list[tuple[int, int]]:
    board = state["board"]
    empties = [(r, c) for r in range(N) for c in range(N) if board[r][c] == EMPTY]
    if not empties:
        return []
    scored = []
    center = (N - 1) / 2
    for r, c in empties:
        try:
            nb, captured = _try_move(board, r, c, color)
        except ValueError:
            continue
        s = 100 * len(captured)
        opp = BLACK + WHITE - color
        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < N and 0 <= nc < N and board[nr][nc] == opp:
                grp, libs = _group_and_libs(nb, nr, nc)
                if libs == 1:
                    s += 40
        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < N and 0 <= nc < N and board[nr][nc] == color:
                _, before_libs = _group_and_libs(board, nr, nc)
                _, after_libs = _group_and_libs(nb, nr, nc)
                if before_libs == 1 and after_libs > 1:
                    s += 35
        dist = abs(r - center) + abs(c - center)
        line = min(r, c, N - 1 - r, N - 1 - c)
        s += max(0, 12 - dist)
        if len([v for row in board for v in row]) < 14:
            s += {2: 8, 3: 10}.get(line, 0)
        s += random.uniform(0, 6)
        scored.append((s, r, c))
    scored.sort(reverse=True)
    return [(r, c) for _, r, c in scored]


def cpu_choose(state: dict[str, Any], _cpu_id: str) -> dict[str, Any]:
    board = state["board"]
    stones = sum(v for row in board for v in row)
    my_captures = state["captures"]["cpu"]
    opp_captures = state["captures"][state["order"][0]]
    cand = _cpu_candidates(state, WHITE)
    if not cand or (stones > 55 and opp_captures < my_captures and random.random() < 0.3):
        return {"t": "pass"}
    r, c = random.choice(cand[:3])
    return {"t": "place", "r": r, "c": c}
