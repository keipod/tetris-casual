#!/usr/bin/env python3
"""Authoritative Seotda engine — 20 hanafuda cards, single betting round."""

from __future__ import annotations

import random
import uuid
from typing import Any

START_CHIPS = 10000
ANTE = 100
MAX_RAISES = 3
SPECIALS: list[tuple[tuple[int, int], str]] = [
    ((1, 2), "알리"),
    ((1, 4), "독사"),
    ((1, 9), "구삥"),
    ((1, 10), "장삥"),
    ((4, 10), "장사"),
    ((4, 6), "세륙"),
]


def _rank(hand: tuple[int, int]) -> tuple[int, str]:
    a, b = sorted(hand)
    if (a, b) == (3, 8):
        return (1000, "38광땡")
    if a == b:
        return (900 + a, f"{a}땡")
    for i, (combo, name) in enumerate(SPECIALS):
        if (a, b) == combo:
            return (806 - i, name)
    return ((a + b) % 10, f"{(a + b) % 10}끗")


def _strength(rank_score: int) -> float:
    if rank_score >= 1000:
        return 1.0
    if rank_score >= 901:
        return 0.72 + (rank_score - 901) / 9 * 0.26
    if rank_score >= 806:
        return 0.62 + (rank_score - 801) / 5 * 0.09
    kk = rank_score % 100
    return max(0.05, (kk / 9) * 0.55)


def new_match(p0: str, p1: str) -> dict[str, Any]:
    deck = [(m, s) for m in range(1, 11) for s in range(2)]
    random.shuffle(deck)
    hands = {p0: [deck[0], deck[2]], p1: [deck[1], deck[3]]}
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [p0, p1],
        "phase": "betting",
        "turn": p0,
        "hands": {pid: [[m, s] for m, s in hands[pid]] for pid in (p0, p1)},
        "chips": {p0: START_CHIPS - ANTE, p1: START_CHIPS - ANTE},
        "invested": {p0: ANTE, p1: ANTE},
        "pot": ANTE * 2,
        "currentBet": 0,
        "raiseCount": 0,
        "actedOnce": {p0: False, p1: False},
        "winner": None,
        "resultText": None,
        "winByFold": False,
        "_events": [],
    }


def _other(state: dict[str, Any], pid: str) -> str:
    return state["order"][1 - state["order"].index(pid)]


def _pay(state: dict[str, Any], pid: str, amount: int) -> None:
    pay_now = min(amount, state["chips"][pid])
    state["chips"][pid] -= pay_now
    state["invested"][pid] += pay_now
    state["pot"] += pay_now


def _showdown(state: dict[str, Any]) -> None:
    p0, p1 = state["order"]
    r0 = _rank(tuple(m for m, _ in state["hands"][p0]))
    r1 = _rank(tuple(m for m, _ in state["hands"][p1]))
    if r0[0] > r1[0]:
        winner, win_rank, lose_rank = p0, r0, r1
    elif r1[0] > r0[0]:
        winner, win_rank, lose_rank = p1, r1, r0
    else:
        winner, win_rank, lose_rank = state["order"][0], r0, r1
    pot = state["pot"]
    state["chips"][winner] += pot
    state["phase"] = "ended"
    state["winner"] = winner
    state["resultText"] = f"{win_rank[1]} 승 · 상대는 {lose_rank[1]}"
    state.setdefault("_events", []).append({
        "type": "showdown",
        "reveal": {state["order"][i]: state["hands"][state["order"][i]] for i in range(2)},
        "ranks": {state["order"][i]: _rank(tuple(m for m, _ in state["hands"][state["order"][i]]))[1]
                  for i in range(2)},
        "winner": winner,
        "handName": win_rank[1],
        "pot": pot,
    })


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] != "betting":
        raise ValueError("베팅 단계가 아닙니다")
    if pid != state["turn"]:
        raise ValueError("당신 차례이 아닙니다")
    t = action.get("t")
    other = _other(state, pid)

    if t == "bet":
        if state["currentBet"] != 0:
            raise ValueError("이미 베팅이 열려 있습니다")
        try:
            amount = int(action["amount"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 금액")
        amount = max(ANTE, min(amount, state["chips"][pid]))
        _pay(state, pid, amount)
        state["currentBet"] = state["invested"][pid]
        state["actedOnce"][pid] = True
        state.setdefault("_events", []).append({"type": "bet", "pid": pid, "amount": amount})
        state["turn"] = other
        return

    if t == "call":
        if state["currentBet"] == 0:
            raise ValueError("호출할 베팅이 없습니다")
        need = state["currentBet"] - state["invested"][pid]
        if need <= 0:
            raise ValueError("이미 콜 상태입니다")
        _pay(state, pid, need)
        state["actedOnce"][pid] = True
        state.setdefault("_events", []).append({"type": "call", "pid": pid, "amount": need})
        _showdown(state)
        return

    if t == "raise":
        if state["currentBet"] == 0:
            raise ValueError("먼저 베팅을 하세요")
        if state["raiseCount"] >= MAX_RAISES:
            raise ValueError("더 이상 레이즈할 수 없습니다")
        try:
            target_total = int(action["amount"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 금액")
        if target_total <= state["currentBet"]:
            raise ValueError("레이즈 금액이 현재 베팅보다 커야 합니다")
        add = target_total - state["invested"][pid]
        if add > state["chips"][pid]:
            raise ValueError("칩이 부족합니다")
        _pay(state, pid, add)
        state["currentBet"] = target_total
        state["raiseCount"] += 1
        state["actedOnce"][pid] = True
        state.setdefault("_events", []).append({"type": "raise", "pid": pid, "to": target_total})
        state["turn"] = other
        return

    if t == "fold":
        state["phase"] = "ended"
        state["winner"] = other
        state["winByFold"] = True
        state["chips"][other] += state["pot"]
        state["resultText"] = "폴드"
        state.setdefault("_events", []).append({"type": "fold", "pid": pid, "winner": other,
                                 "pot": state["pot"], "foldPot": state["invested"][pid]})
        return

    if t == "allin":
        if state["chips"][pid] <= 0:
            raise ValueError("칩이 없습니다")
        _pay(state, pid, state["chips"][pid])
        state["currentBet"] = max(state["currentBet"], state["invested"][pid])
        state["actedOnce"][pid] = True
        state.setdefault("_events", []).append({"type": "allin", "pid": pid, "total": state["invested"][pid]})
        need = state["currentBet"] - state["invested"][other]
        if need <= 0 or state["chips"][other] == 0:
            _showdown(state)
        else:
            state["turn"] = other
        return

    raise ValueError("잘못된 행동")


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    idx = state["order"].index(pid) if pid in state["order"] else 0
    opp = state["order"][1 - idx]
    reveal_all = state["phase"] == "ended" or bool(state.get("_revealed"))
    return {
        "game": "seotda",
        "phase": state["phase"],
        "yourTurn": state["phase"] == "betting" and state["turn"] == pid,
        "isDealer": idx == 0,
        "yourHand": state["hands"][pid],
        "oppHandCount": len(state["hands"][opp]),
        "oppHand": state["hands"][opp] if reveal_all else None,
        "yourRank": _rank(tuple(m for m, _ in state["hands"][pid]))[1],
        "oppRank": _rank(tuple(m for m, _ in state["hands"][opp]))[1] if reveal_all else None,
        "chips": {state["order"][i]: state["chips"][state["order"][i]] for i in range(2)},
        "invested": {state["order"][i]: state["invested"][state["order"][i]] for i in range(2)},
        "pot": state["pot"],
        "currentBet": state["currentBet"],
        "canRaise": state["raiseCount"] < MAX_RAISES,
        "minRaiseTo": state["currentBet"] * 2,
        "isCpuMatch": "cpu" in state["order"],
        "winner": state["winner"],
        "resultText": state["resultText"],
        "startChips": START_CHIPS,
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    ev = state.pop("_events", [])
    return ev


def forfeit(state: dict[str, Any], pid: str) -> None:
    if state["phase"] == "ended":
        return
    other = _other(state, pid)
    state["phase"] = "ended"
    state["winner"] = other
    state["winByFold"] = True
    state["chips"][other] += state["pot"]
    state["resultText"] = "기권"
    state.setdefault("_events", []).append({"type": "forfeit", "winner": other, "by": pid})


def cpu_should_act(state: dict[str, Any]) -> bool:
    return state["phase"] == "betting" and state["turn"] == "cpu"


def cpu_choose(state: dict[str, Any], _cpu_id: str) -> dict[str, Any]:
    hand = state["hands"]["cpu"]
    rank = _rank(tuple(m for m, _ in hand))
    s = _strength(rank[0])
    bluff = random.random() < 0.10
    eff = min(1.0, s + (0.35 if bluff else 0))
    cb = state["currentBet"]
    inv = state["invested"]["cpu"]
    chips = state["chips"]["cpu"]

    if cb == 0:
        if eff > 0.75 and chips > 400:
            return {"t": "bet", "amount": random.choice([200, 500, 1000])}
        return {"t": "bet", "amount": ANTE}
    need = cb - inv
    if eff < 0.22 and need > 500 and random.random() > 0.15:
        return {"t": "fold"}
    if eff > 0.82 and state["raiseCount"] < MAX_RAISES and chips > need * 2:
        return {"t": "raise", "amount": min(cb * 2, inv + chips)}
    if chips <= need:
        return {"t": "allin"}
    return {"t": "call"}
