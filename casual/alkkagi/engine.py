#!/usr/bin/env python3
"""Authoritative Alkkagi engine — deterministic server-side physics."""

from __future__ import annotations

import math
import random
import uuid
from typing import Any

BOARD_R = 220.0
MARBLE_R = 17.0
MAX_SPEED = 950.0
FRICTION = 165.0
RESTITUTION = 0.93
DT = 1 / 120.0
MAX_SIM_SECONDS = 6.0
STOP_EPS = 9.0
MIN_GAP = MARBLE_R * 2 + 2.0


def new_match(p0: str, p1: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [p0, p1],
        "phase": "setup",
        "turn": p0,
        "marbles": [],
        "placedCount": {p0: 0, p1: 0},
        "fallen": [],
        "winner": None,
        "_seq": 0,
        "_events": [],
    }


def _next_id(state: dict[str, Any], pid: str) -> str:
    state["_seq"] += 1
    return f"{'a' if pid == state['order'][0] else 'b'}{state['_seq']}"


def _dist(x1, y1, x2, y2) -> float:
    return math.hypot(x1 - x2, y1 - y2)


def _valid_spot(state: dict[str, Any], pid: str, x: float, y: float) -> bool:
    half_top = pid == state["order"][0]
    if _dist(x, y, 0, 0) > BOARD_R - MARBLE_R:
        return False
    if half_top and y > -MARBLE_R:
        return False
    if not half_top and y < MARBLE_R:
        return False
    for m in state["marbles"]:
        if m["alive"] and _dist(x, y, m["x"], m["y"]) < MIN_GAP:
            return False
    return True


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        raise ValueError("게임이 끝났습니다")
    if pid != state["turn"]:
        raise ValueError("당신 차례이 아닙니다")
    t = action.get("t")

    if t == "place":
        if state["phase"] != "setup":
            raise ValueError("배치 단계가 아닙니다")
        try:
            x, y = float(action["x"]), float(action["y"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 좌표")
        if not _valid_spot(state, pid, x, y):
            raise ValueError("그곳에는 배치할 수 없습니다")
        mid = _next_id(state, pid)
        state["marbles"].append({"id": mid, "owner": pid, "x": round(x, 1), "y": round(y, 1),
                                 "vx": 0.0, "vy": 0.0, "alive": True})
        state["placedCount"][pid] += 1
        state.setdefault("_events", []).append({"type": "place", "id": mid, "x": x, "y": y, "owner": pid})
        if state["placedCount"][pid] >= 4:
            other = state["order"][1 - state["order"].index(pid)]
            if state["placedCount"][other] >= 4:
                state["phase"] = "playing"
                state.setdefault("_events", []).append({"type": "phase", "phase": "playing"})
            state["turn"] = other
        else:
            state["turn"] = state["order"][1 - state["order"].index(pid)]
        return

    if t == "flick":
        if state["phase"] != "playing":
            raise ValueError("아직 시작하지 않았습니다")
        try:
            vx, vy = float(action["vx"]), float(action["vy"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 힘")
        mid = str(action.get("id") or "")
        marble = next((m for m in state["marbles"] if m["id"] == mid and m["alive"]), None)
        if not marble or marble["owner"] != pid:
            raise ValueError("내 알이 아닙니다")
        speed = math.hypot(vx, vy)
        if speed < 20:
            raise ValueError("너무 약합니다")
        if speed > MAX_SPEED:
            scale = MAX_SPEED / speed
            vx *= scale
            vy *= scale
        marble["vx"] = vx
        marble["vy"] = vy
        state.setdefault("_events", []).append(_simulate(state))
        _check_end(state)
        if state["phase"] != "ended":
            state["turn"] = state["order"][1 - state["order"].index(pid)]
        return

    raise ValueError("잘못된 행동")


def _simulate(state: dict[str, Any]) -> dict[str, Any]:
    alive = [m for m in state["marbles"] if m["alive"]]
    frames = []
    falls = []
    hits = []
    steps = int(MAX_SIM_SECONDS / DT)
    for i in range(steps):
        any_moving = False
        for m in alive:
            if not m["alive"]:
                continue
            sp = math.hypot(m["vx"], m["vy"])
            if sp > 0:
                ns = max(0.0, sp - FRICTION * DT)
                if ns < STOP_EPS:
                    m["vx"] = m["vy"] = 0.0
                else:
                    k = ns / sp
                    m["vx"] *= k
                    m["vy"] *= k
                    any_moving = True
            m["x"] += m["vx"] * DT
            m["y"] += m["vy"] * DT
            d = _dist(m["x"], m["y"], 0, 0)
            if d - MARBLE_R > BOARD_R:
                m["alive"] = False
                m["vx"] = m["vy"] = 0.0
                falls.append({"id": m["id"], "owner": m["owner"], "step": i})
        for a_i in range(len(alive)):
            for b_i in range(a_i + 1, len(alive)):
                ma, mb = alive[a_i], alive[b_i]
                if not ma["alive"] or not mb["alive"]:
                    continue
                dx = mb["x"] - ma["x"]
                dy = mb["y"] - ma["y"]
                d = math.hypot(dx, dy)
                if d >= MARBLE_R * 2 or d == 0:
                    continue
                nx, ny = dx / d, dy / d
                overlap = MARBLE_R * 2 - d
                ma["x"] -= nx * overlap / 2
                ma["y"] -= ny * overlap / 2
                mb["x"] += nx * overlap / 2
                mb["y"] += ny * overlap / 2
                va_n = ma["vx"] * nx + ma["vy"] * ny
                vb_n = mb["vx"] * nx + mb["vy"] * ny
                impulse = (vb_n - va_n) * RESTITUTION
                ma["vx"] += impulse * nx
                ma["vy"] += impulse * ny
                mb["vx"] -= impulse * nx
                mb["vy"] -= impulse * ny
                rel = abs(va_n - vb_n)
                if rel > 60:
                    hits.append({"step": i, "x": (ma["x"] + mb["x"]) / 2, "y": (ma["y"] + mb["y"]) / 2,
                                 "power": round(min(1.0, rel / MAX_SPEED), 2)})
                any_moving = True
        if any_moving and i % 4 == 0:
            frames.append({
                "i": i,
                "m": [[m["id"], round(m["x"], 1), round(m["y"], 1), 1 if m["alive"] else 0] for m in alive],
            })
        if not any_moving and not falls:
            break
        if not any(m["alive"] for m in alive):
            break
    frames.append({
        "i": -1,
        "m": [[m["id"], round(m["x"], 1), round(m["y"], 1), 1 if m["alive"] else 0] for m in alive],
    })
    ev = {"type": "sim", "frames": frames, "hits": hits, "falls": falls}
    return ev


def _check_end(state: dict[str, Any]) -> None:
    p0, p1 = state["order"]
    left = {p: sum(1 for m in state["marbles"] if m["owner"] == p and m["alive"]) for p in (p0, p1)}
    if left[p0] == 0 and left[p1] == 0:
        state["phase"] = "ended"
        state["winner"] = None
        state.setdefault("_events", []).append({"type": "win", "winner": None})
    elif left[p0] == 0:
        state["phase"] = "ended"
        state["winner"] = p1
        state.setdefault("_events", []).append({"type": "win", "winner": p1})
    elif left[p1] == 0:
        state["phase"] = "ended"
        state["winner"] = p0
        state.setdefault("_events", []).append({"type": "win", "winner": p0})


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    idx = state["order"].index(pid) if pid in state["order"] else 0
    return {
        "game": "alkkagi",
        "boardR": BOARD_R,
        "marbleR": MARBLE_R,
        "maxSpeed": MAX_SPEED,
        "phase": state["phase"],
        "yourTurn": state["phase"] != "ended" and state["turn"] == pid,
        "yourTop": idx == 0,
        "yourMarbleIds": [m["id"] for m in state["marbles"] if m["owner"] == pid and m["alive"]],
        "marbles": [{"id": m["id"], "owner": m["owner"], "x": m["x"], "y": m["y"],
                     "alive": m["alive"]} for m in state["marbles"]],
        "counts": {p: sum(1 for m in state["marbles"] if m["owner"] == p and m["alive"])
                   for p in state["order"]},
        "isCpuMatch": "cpu" in state["order"],
        "winner": state["winner"],
        "moveCount": len([e for e in []]),
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
    return state["phase"] != "ended" and state["turn"] == "cpu"


def cpu_choose(state: dict[str, Any], pid: str = "cpu") -> dict[str, Any]:
    if state["phase"] == "setup":
        top = pid == state["order"][0]
        lo = -(BOARD_R * 0.78) if top else MARBLE_R + 10
        hi = -MARBLE_R - 10 if top else BOARD_R * 0.78
        for _ in range(120):
            x = random.uniform(-BOARD_R * 0.75, BOARD_R * 0.75)
            y = random.uniform(lo, hi)
            if _valid_spot(state, pid, x, y):
                return {"t": "place", "x": x, "y": y}
        step = MARBLE_R + 4
        y = (-BOARD_R + MARBLE_R + 2) if top else (BOARD_R - MARBLE_R - 2)
        edge = MARBLE_R + 2
        while (top and y < -edge) or (not top and y > edge):
            for x in [v * step for v in range(-int(BOARD_R / step), int(BOARD_R / step) + 1)]:
                if _dist(x, y, 0, 0) <= BOARD_R - MARBLE_R and _valid_spot(state, "cpu", x, y):
                    return {"t": "place", "x": x, "y": y}
            y += step if top else -step
        raise ValueError("배치할 공간이 없습니다")
    mine = [m for m in state["marbles"] if m["owner"] == pid and m["alive"]]
    foes = [m for m in state["marbles"] if m["owner"] != pid and m["alive"]]
    if not mine or not foes:
        return {"t": "flick", "id": mine[0]["id"] if mine else "", "vx": 100, "vy": -100}
    best_shot = None
    best_score = -1e9
    for mm in mine:
        for foe in foes:
            dx = foe["x"] - mm["x"]
            dy = foe["y"] - mm["y"]
            d = math.hypot(dx, dy) or 1
            power = min(MAX_SPEED * 0.85, 380 + d * 2.2)
            noise = random.uniform(-0.06, 0.06)
            ang = math.atan2(dy, dx) + noise
            vx = math.cos(ang) * power
            vy = math.sin(ang) * power
            score = -d + random.uniform(0, 40)
            if score > best_score:
                best_score = score
                best_shot = (mm["id"], vx, vy)
    mid, vx, vy = best_shot
    return {"t": "flick", "id": mid, "vx": round(vx, 1), "vy": round(vy, 1)}
