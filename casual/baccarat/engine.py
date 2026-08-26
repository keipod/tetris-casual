#!/usr/bin/env python3
"""Baccarat table engine — N seats vs banker, continuous rounds."""

from __future__ import annotations

import random
import time
import uuid
from typing import Any

MAX_SEATS = 6
MIN_SEATS = 1
START_CHIPS = 5000
MIN_BET = 100
BET_SECONDS = 12.0
BETWEEN_SECONDS = 5.0
MAX_ROUNDS = 20

CARD_VALUES = {**{str(n): n for n in range(2, 10)}, "A": 1, "10": 0, "J": 0, "Q": 0, "K": 0}
SUITS = ["♠", "♥", "♦", "♣"]
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]


def _new_shoe() -> list[dict[str, Any]]:
    shoe = []
    for d in range(8):
        for s in SUITS:
            for r in RANKS:
                shoe.append({"id": f"{d}{s}{r}", "rank": r, "suit": s,
                             "val": CARD_VALUES[r]})
    random.shuffle(shoe)
    return shoe


def new_table(host_id: str, host_nick: str, opts: dict[str, Any]) -> dict[str, Any]:
    del host_nick, opts
    now = time.time()
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [host_id],
        "nicks": {},
        "phase": "waiting",
        "chips": {host_id: START_CHIPS},
        "bets": {},
        "shoe": [],
        "playerHand": [],
        "bankerHand": [],
        "revealedP": 0,
        "revealedB": 0,
        "thirdCardPlayer": None,
        "thirdCardBanker": None,
        "winner": None,
        "pTotal": None,
        "bTotal": None,
        "payouts": None,
        "roadmap": [],
        "round": 0,
        "deadline": None,
        "lastResults": {},
        "_events": [{"type": "joined", "pid": host_id, "seat": 0}],
    }


def join(state: dict[str, Any], pid: str, nick: str) -> None:
    if pid in state["order"]:
        raise ValueError("이미 앉아 있습니다")
    if len(state["order"]) >= MAX_SEATS:
        raise ValueError("만석입니다")
    if state["phase"] not in ("waiting", "between"):
        raise ValueError("라운드 중에는 입장할 수 없습니다")
    state["nicks"][pid] = nick
    state["order"].append(pid)
    state["chips"][pid] = START_CHIPS
    state.setdefault("_events", []).append({"type": "joined", "pid": pid, "nick": nick,
                             "seat": len(state["order"]) - 1})


def start(state: dict[str, Any], requester_pid: str) -> None:
    if requester_pid != state["order"][0]:
        raise ValueError("방장만 시작할 수 있습니다")
    if len(state["order"]) < MIN_SEATS:
        raise ValueError("최소 인원이 필요합니다")
    if state["phase"] not in ("waiting",):
        raise ValueError("이미 진행 중입니다")
    _open_round(state)


def can_start(state: dict[str, Any]) -> bool:
    return len(state["order"]) >= MIN_SEATS


def leave(state: dict[str, Any], pid: str) -> None:
    if pid not in state["order"]:
        return
    state["order"].remove(pid)
    state.setdefault("_events", []).append({"type": "left", "pid": pid})


def ended(state: dict[str, Any]) -> bool:
    return state["phase"] == "ended"


def table_seats(state: dict[str, Any]) -> int:
    return len(state["order"])


def table_running(state: dict[str, Any]) -> bool:
    return state["phase"] in ("betting", "dealing")


def _hand_total(hand: list[dict[str, Any]]) -> int:
    return sum(c["val"] for c in hand) % 10


def _draw(state: dict[str, Any]) -> dict[str, Any]:
    if len(state["shoe"]) < 15:
        state["shoe"] = _new_shoe()
    return state["shoe"].pop()


def _open_round(state: dict[str, Any]) -> None:
    alive = [p for p in state["order"] if state["chips"].get(p, 0) >= MIN_BET]
    if len(alive) == 0:
        state["phase"] = "ended"
        return
    if state["round"] >= MAX_ROUNDS:
        state["phase"] = "ended"
        return
    state["round"] += 1
    state["phase"] = "betting"
    state["bets"] = {}
    state["playerHand"] = []
    state["bankerHand"] = []
    state["revealedP"] = 0
    state["revealedB"] = 0
    state["thirdCardPlayer"] = None
    state["thirdCardBanker"] = None
    state["winner"] = None
    state["pTotal"] = None
    state["bTotal"] = None
    state["payouts"] = None
    state["acted"] = set()
    state["deadline"] = time.time() + BET_SECONDS
    state.setdefault("_events", []).append({"type": "round_open", "round": state["round"],
                             "betSeconds": BET_SECONDS})


def _all_acted(state: dict[str, Any]) -> bool:
    eligible = [p for p in state["order"] if state["chips"].get(p, 0) >= MIN_BET]
    return bool(eligible) and all(p in state["acted"] for p in eligible)


def _run_deal(state: dict[str, Any]) -> None:
    state["phase"] = "dealing"
    state["deadline"] = None
    p_hand = [_draw(state) for _ in range(2)]
    b_hand = [_draw(state) for _ in range(2)]
    state["playerHand"] = p_hand
    state["bankerHand"] = b_hand
    for i, c in enumerate(p_hand):
        state.setdefault("_events", []).append({"type": "deal_card", "who": "PLAYER", "card": c, "idx": i})
    for i, c in enumerate(b_hand):
        state.setdefault("_events", []).append({"type": "deal_card", "who": "BANKER", "card": c, "idx": i})
    pt = _hand_total(p_hand)
    bt = _hand_total(b_hand)
    player_third = None
    banker_third = None
    if pt <= 5:
        player_third = _draw(state)
        p_hand.append(player_third)
        pt = _hand_total(p_hand)
        state.setdefault("_events", []).append({"type": "deal_card", "who": "PLAYER", "card": player_third, "idx": 2})
    p_third_val = player_third["val"] if player_third else None
    if player_third is None:
        if bt <= 5:
            banker_third = _draw(state)
    else:
        v = p_third_val
        if bt <= 2:
            banker_third = _draw(state)
        elif bt == 3 and v != 8:
            banker_third = _draw(state)
        elif bt == 4 and 2 <= v <= 7:
            banker_third = _draw(state)
        elif bt == 5 and 4 <= v <= 7:
            banker_third = _draw(state)
        elif bt == 6 and 6 <= v <= 7:
            banker_third = _draw(state)
    if banker_third is not None:
        b_hand.append(banker_third)
        bt = _hand_total(b_hand)
        state.setdefault("_events", []).append({"type": "deal_card", "who": "BANKER", "card": banker_third, "idx": 2})

    state["thirdCardPlayer"] = player_third
    state["thirdCardBanker"] = banker_third
    state["pTotal"] = pt
    state["bTotal"] = bt

    if pt > bt:
        spot = "PLAYER"
    elif bt > pt:
        spot = "BANKER"
    else:
        spot = "TIE"
    state["winner"] = spot
    state["roadmap"].append({"PLAYER": "P", "BANKER": "B", "TIE": "T"}[spot])
    state["roadmap"] = state["roadmap"][-24:]

    payouts = []
    for pid, bets in state["bets"].items():
        delta = 0
        for s, amt in bets.items():
            if s == spot == "TIE":
                delta += amt * 9
            elif spot == "TIE":
                delta += amt
            elif s == spot:
                delta += int(amt * 1.95) if s == "BANKER" else amt * 2
        if delta:
            state["chips"][pid] += delta
        net = delta - sum(bets.values())
        payouts.append({"pid": pid, "delta": net})
        state["lastResults"][pid] = net
    state["payouts"] = payouts
    state.setdefault("_events", []).append({
        "type": "result",
        "spot": spot,
        "pTotal": pt,
        "bTotal": bt,
        "payouts": payouts,
        "playerHand": p_hand,
        "bankerHand": b_hand,
    })
    state["phase"] = "between"
    state["deadline"] = time.time() + BETWEEN_SECONDS
    busted = [p for p in state["order"] if state["chips"].get(p, 0) < MIN_BET]
    for p in busted:
        state.setdefault("_events", []).append({"type": "busted", "pid": p})


def maybe_tick(state: dict[str, Any]) -> bool:
    if state["phase"] == "betting":
        if state["deadline"] and time.time() >= state["deadline"]:
            state.setdefault("_events", []).append({"type": "deal_start"})
            _run_deal(state)
            return True
    elif state["phase"] == "between":
        if state["deadline"] and time.time() >= state["deadline"]:
            if state["round"] >= MAX_ROUNDS:
                state["phase"] = "ended"
                state.setdefault("_events", []).append({"type": "table_end"})
                return True
            alive = [p for p in state["order"] if state["chips"].get(p, 0) >= MIN_BET]
            if not alive:
                state["phase"] = "ended"
                state.setdefault("_events", []).append({"type": "table_end"})
                return True
            _open_round(state)
            return True
    return False


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if pid not in state["order"]:
        raise ValueError("앉아 있지 않습니다")
    maybe_tick(state)
    if state["phase"] == "ended":
        raise ValueError("게임이 종료되었습니다")
    t = action.get("t")

    if t == "skip":
        if state["phase"] != "betting":
            raise ValueError("베팅 시간이 아닙니다")
        state["acted"].add(pid)
        state.setdefault("_events", []).append({"type": "skipped", "pid": pid})
        if _all_acted(state):
            state.setdefault("_events", []).append({"type": "deal_start"})
            _run_deal(state)
        return

    if t == "bet":
        if state["phase"] != "betting":
            raise ValueError("베팅 시간이 아닙니다")
        spot = action.get("spot")
        if spot not in ("PLAYER", "BANKER", "TIE"):
            raise ValueError("잘못된 베팅 구역")
        try:
            amount = int(action["amount"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 금액")
        current = sum(state["bets"].get(pid, {}).values())
        amount = min(amount, state["chips"][pid])
        if amount < MIN_BET:
            raise ValueError(f"최소 베팅은 {MIN_BET}칩입니다")
        state["chips"][pid] -= amount
        state["bets"].setdefault(pid, {})
        state["bets"][pid][spot] = state["bets"][pid].get(spot, 0) + amount
        state["acted"].add(pid)
        state.setdefault("_events", []).append({"type": "bet", "pid": pid, "spot": spot, "amount": amount})
        return

    raise ValueError("잘못된 행동")


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    seats = []
    for i, sp in enumerate(state["order"]):
        seats.append({
            "pid": sp,
            "seat": i,
            "chips": state["chips"].get(sp, 0),
            "bets": state["bets"].get(sp, {}),
            "lastResult": state["lastResults"].get(sp),
        })
    reveal_done = state["phase"] in ("between",)
    return {
        "game": "baccarat",
        "phase": state["phase"],
        "seated": pid in state["order"],
        "youAreHost": state["order"][:1] == [pid],
        "canStart": state["phase"] == "waiting" and can_start(state) and pid in state["order"],
        "seats": seats,
        "maxSeats": MAX_SEATS,
        "round": state["round"],
        "maxRounds": MAX_ROUNDS,
        "myChips": state["chips"].get(pid, 0),
        "myBets": state["bets"].get(pid, {}),
        "minBet": MIN_BET,
        "deadlineMs": int(state["deadline"] * 1000) if state["deadline"] else None,
        "serverNowMs": int(time.time() * 1000),
        "playerHandCount": len(state["playerHand"]),
        "bankerHandCount": len(state["bankerHand"]),
        "playerHand": state["playerHand"],
        "bankerHand": state["bankerHand"],
        "revealDone": reveal_done,
        "winner": state["winner"],
        "pTotal": state["pTotal"],
        "bTotal": state["bTotal"],
        "payouts": state["payouts"],
        "roadmap": state["roadmap"],
        "startChips": START_CHIPS,
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.pop("_events", [])


def forfeit(state: dict[str, Any], pid: str) -> None:
    leave(state, pid)
