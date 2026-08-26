#!/usr/bin/env python3
"""Authoritative Go-Stop engine — 48 hanafuda cards, 2-player."""

from __future__ import annotations

import itertools
import random
import uuid
from typing import Any

MONTH_LAYOUT: dict[int, list[str]] = {
    1: ["bright", "ribbon-red", "plain", "plain"],
    2: ["ribbon-red", "animal", "plain", "plain"],
    3: ["bright", "ribbon-red", "plain", "plain"],
    4: ["ribbon-grass", "animal", "plain", "plain"],
    5: ["ribbon-grass", "animal", "plain", "plain"],
    6: ["ribbon-blue", "animal", "plain", "plain"],
    7: ["ribbon-grass", "animal", "plain", "plain"],
    8: ["bright", "animal", "plain", "plain"],
    9: ["ribbon-blue", "animal", "plain", "plain"],
    10: ["ribbon-blue", "animal", "plain", "plain"],
    11: ["bright", "plain2", "plain", "plain"],
    12: ["rain-bright", "rain-ribbon", "rain-plain", "rain-plain"],
}

WIN_SCORE = 7


def build_deck() -> list[dict[str, int]]:
    deck = []
    counters: dict[tuple[int, str], int] = {}
    for month, kinds in MONTH_LAYOUT.items():
        for kind in kinds:
            key = (month, kind)
            idx = counters.get(key, 0)
            counters[key] = idx + 1
            deck.append({"id": f"{month:02d}-{kind[:6]}{idx}", "month": month, "kind": kind})
    return deck


def new_match(p0: str, p1: str) -> dict[str, Any]:
    deck = build_deck()
    random.shuffle(deck)
    hands = {p0: deck[8:15], p1: deck[15:22]}
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [p0, p1],
        "phase": "playing",
        "turn": p0,
        "deck": deck[22:],
        "field": deck[:8],
        "hands": hands,
        "taken": {p0: [], p1: []},
        "scores": {p0: 0, p1: 0},
        "goCount": 0,
        "pendingChoice": None,
        "winner": None,
        "finalScore": None,
        "_events": [],
    }


def _other(state: dict[str, Any], pid: str) -> str:
    return state["order"][1 - state["order"].index(pid)]


def _score_taken(cards: list[dict[str, Any]]) -> dict[str, int]:
    plains = sum(2 if c["kind"] == "plain2" else 1 for c in cards
                 if c["kind"].startswith("plain"))
    animals = sum(1 for c in cards if c["kind"] == "animal")
    brights = sum(1 for c in cards if "bright" in c["kind"])
    reds = sum(1 for c in cards if c["kind"] == "ribbon-red")
    blues = sum(1 for c in cards if c["kind"] == "ribbon-blue")
    grass = sum(1 for c in cards if c["kind"] == "ribbon-grass")
    ribbons = reds + blues + grass
    pts = 0
    pts += max(0, plains - 9)
    if animals >= 5:
        pts += animals - 4
    if reds >= 3:
        pts += 3
    if blues >= 3:
        pts += 3
    if grass >= 3:
        pts += 3
    if ribbons >= 5:
        pts += ribbons - 4
    if brights >= 3:
        pts += brights
    return {"plains": plains, "animals": animals, "brights": brights,
            "reds": reds, "blues": blues, "grass": grass, "ribbons": ribbons,
            "points": pts}


def _capture(state: dict[str, Any], pid: str, card: dict[str, Any]) -> bool:
    same_month = [c for c in state["field"] if c["month"] == card["month"]]
    captured_any = False
    if len(same_month) >= 3:
        for c in same_month:
            state["field"].remove(c)
            state["taken"][pid].append(c)
        state["taken"][pid].append(card)
        captured_any = True
        state["_events"].append({"type": "capture", "pid": pid, "cards": [c["id"] for c in same_month],
                                 "played": card["id"], "mode": "triple"})
    elif len(same_month) == 1:
        target = same_month[0]
        state["field"].remove(target)
        state["taken"][pid].append(target)
        state["taken"][pid].append(card)
        captured_any = True
        state["_events"].append({"type": "capture", "pid": pid, "cards": [target["id"]],
                                 "played": card["id"], "mode": "single"})
    elif len(same_month) == 2:
        pick = random.choice(same_month)
        state["field"].remove(pick)
        state["taken"][pid].append(pick)
        state["taken"][pid].append(card)
        captured_any = True
        state["_events"].append({"type": "capture", "pid": pid, "cards": [pick["id"]],
                                 "played": card["id"], "mode": "pair"})
    else:
        state["field"].append(card)
    return captured_any


def _end_turn_or_ask(state: dict[str, Any], pid: str, captured: bool) -> None:
    state["scores"] = {p: _score_taken(state["taken"][p])["points"] for p in state["order"]}
    if captured and state["scores"][pid] >= WIN_SCORE:
        state["phase"] = "gostop"
        state["pendingChoice"] = pid
        state["_events"].append({"type": "gostop_offer", "pid": pid, "score": state["scores"][pid]})
        return
    state["turn"] = _other(state, pid)


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        raise ValueError("게임이 끝났습니다")

    if state["phase"] == "gostop":
        if state["pendingChoice"] != pid:
            raise ValueError("선택 차례이 아닙니다")
        choice = action.get("t")
        if choice == "stop":
            bonus = state["goCount"]
            final = state["scores"][pid] + bonus
            state["phase"] = "ended"
            state["winner"] = pid
            state["finalScore"] = final
            state["_events"].append({"type": "win", "winner": pid, "score": final,
                                     "goCount": bonus, "byStop": True})
            return
        if choice == "go":
            state["goCount"] += 1
            state["phase"] = "playing"
            state["pendingChoice"] = None
            state["_events"].append({"type": "go", "pid": pid, "goCount": state["goCount"]})
            state["turn"] = _other(state, pid)
            return
        raise ValueError("고 또는 스톱을 선택하세요")

    if state["phase"] != "playing":
        raise ValueError("진행 중이 아닙니다")
    if pid != state["turn"]:
        raise ValueError("당신 차례이 아닙니다")
    if action.get("t") != "play":
        raise ValueError("카드를 내세요")
    cid = str(action.get("card") or "")
    card = next((c for c in state["hands"][pid] if c["id"] == cid), None)
    if not card:
        raise ValueError("손에 없는 카드입니다")
    state["hands"][pid].remove(card)
    state["_events"].append({"type": "play", "pid": pid, "card": cid, "month": card["month"]})
    captured = _capture(state, pid, card)

    if state["deck"]:
        flip = state["deck"].pop()
        state["_events"].append({"type": "flip", "card": flip["id"], "month": flip["month"]})
        if _capture(state, pid, flip):
            captured = True
    else:
        state["_events"].append({"type": "flip", "card": None})

    if not state["hands"][pid]:
        s0 = state["scores"][state["order"][0]]
        s1 = state["scores"][state["order"][1]]
        if s0 == s1:
            state["phase"] = "ended"
            state["winner"] = None
            state["finalScore"] = s0
            state["_events"].append({"type": "win", "winner": None, "score": s0,
                                     "goCount": state["goCount"], "byStop": False})
        else:
            winner = state["order"][0] if s0 > s1 else state["order"][1]
            state["phase"] = "ended"
            state["winner"] = winner
            state["finalScore"] = max(s0, s1)
            state["_events"].append({"type": "win", "winner": winner, "score": max(s0, s1),
                                     "goCount": state["goCount"], "byStop": False})
        return

    _end_turn_or_ask(state, pid, captured)


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    idx = state["order"].index(pid) if pid in state["order"] else 0
    opp = state["order"][1 - idx]
    my_detail = _score_taken(state["taken"][pid])
    opp_detail = _score_taken(state["taken"][opp])
    return {
        "game": "gostop",
        "phase": state["phase"],
        "yourTurn": state["phase"] == "playing" and state["turn"] == pid,
        "yourChoice": state["phase"] == "gostop" and state["pendingChoice"] == pid,
        "yourHand": [c["id"] for c in state["hands"][pid]],
        "handCards": state["hands"][pid],
        "oppHandCount": len(state["hands"][opp]),
        "field": state["field"],
        "yourTaken": state["taken"][pid],
        "oppTakenCount": len(state["taken"][opp]),
        "yourScore": my_detail["points"],
        "oppScore": opp_detail["points"],
        "yourDetail": {k: v for k, v in my_detail.items() if k != "points"},
        "deckCount": len(state["deck"]),
        "goCount": state["goCount"],
        "isCpuMatch": "cpu" in state["order"],
        "winner": state["winner"],
        "finalScore": state["finalScore"],
        "winScore": WIN_SCORE,
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.pop("_events", [])


def forfeit(state: dict[str, Any], pid: str) -> None:
    if state["phase"] == "ended":
        return
    other = _other(state, pid)
    state["phase"] = "ended"
    state["winner"] = other
    state["finalScore"] = state["scores"].get(other, 0)
    state.setdefault("_events", []).append({"type": "forfeit", "winner": other, "by": pid})


def cpu_should_act(state: dict[str, Any]) -> bool:
    return (state["phase"] == "playing" and state["turn"] == "cpu") or \
           (state["phase"] == "gostop" and state["pendingChoice"] == "cpu")


def _capture_value(month: int, field: list[dict[str, Any]]) -> float:
    n = sum(1 for c in field if c["month"] == month)
    if n >= 3:
        return 4.0
    if n == 2:
        return 1.6
    if n == 1:
        v = 1.0
        for c in field:
            if c["month"] == month:
                if "bright" in c["kind"]:
                    v += 1.2
                elif c["kind"] == "animal":
                    v += 0.6
                elif c["kind"].startswith("ribbon"):
                    v += 0.45
        return v
    return 0.05


def cpu_choose(state: dict[str, Any], _cpu_id: str) -> dict[str, Any]:
    if state["phase"] == "gostop":
        score = state["scores"]["cpu"]
        if score >= 10 or state["goCount"] >= 1:
            return {"t": "stop"}
        if score >= 8 and random.random() < 0.7:
            return {"t": "stop"}
        return {"t": "go"}
    hand = state["hands"]["cpu"]
    best_card = None
    best_v = -1
    for c in hand:
        v = _capture_value(c["month"], state["field"])
        if "bright" in c["kind"] and v < 0.5:
            v -= 0.3
        v += random.uniform(0, 0.25)
        if v > best_v:
            best_v = v
            best_card = c
    return {"t": "play", "card": best_card["id"]}
