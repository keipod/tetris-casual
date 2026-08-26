#!/usr/bin/env python3
"""No-Limit Texas Hold'em table engine — side pots, bots, auto hands."""

from __future__ import annotations

import itertools
import random
import time
import uuid
from typing import Any

MAX_SEATS = 5
MIN_HUMAN_SEATS = 1
START_CHIPS = 2000
SB, BB = 10, 20
BETWEEN_SECONDS = 5.0
MAX_HANDS = 40

SUITS = ["s", "h", "d", "c"]
RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
RANK_CH = {14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", **{n: str(n) for n in range(2, 10)}}
CAT_NAMES = ["하이카드", "원페어", "투페어", "트리플", "스트레이트", "플러시",
             "풀하우스", "포카드", "스트레이트 플러시"]


def _new_deck() -> list[dict[str, Any]]:
    deck = [{"id": f"{RANK_CH[r]}{s}", "r": r, "s": s} for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


def _score5(cards: list[dict[str, Any]]) -> tuple[int, ...]:
    vals = sorted((c["r"] for c in cards), reverse=True)
    suits = {c["s"] for c in cards}
    is_flush = len(suits) == 1
    uniq = sorted(set(vals), reverse=True)
    is_straight = False
    straight_high = 0
    if len(uniq) == 5:
        if uniq[0] - uniq[4] == 4:
            is_straight, straight_high = True, uniq[0]
        elif uniq == [14, 5, 4, 3, 2]:
            is_straight, straight_high = True, 5
    counts: dict[int, int] = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    if is_flush and is_straight:
        return tuple([8, straight_high])
    if groups[0][1] == 4:
        kicker = max(v for v in vals if v != groups[0][0])
        return tuple([7, groups[0][0], kicker])
    if groups[0][1] == 3 and len(groups) > 1 and groups[1][1] == 2:
        return tuple([6, groups[0][0], groups[1][0]])
    if is_flush:
        return tuple([5] + vals)
    if is_straight:
        return tuple([4, straight_high])
    if groups[0][1] == 3:
        kicks = sorted((v for v in vals if v != groups[0][0]), reverse=True)
        return tuple([3, groups[0][0]] + kicks)
    if groups[0][1] == 2 and len(groups) > 1 and groups[1][1] == 2:
        kicker = max(v for v in vals if v != groups[0][0] and v != groups[1][0])
        return tuple([2, groups[0][0], groups[1][0], kicker])
    if groups[0][1] == 2:
        kicks = sorted((v for v in vals if v != groups[0][0]), reverse=True)
        return tuple([1, groups[0][0]] + kicks)
    return tuple([0] + vals)


def _best7(cards7: list[dict[str, Any]]) -> tuple[tuple[int, ...], list[dict[str, Any]]]:
    best = None
    best_combo = None
    for combo in itertools.combinations(cards7, 5):
        sc = _score5(list(combo))
        if best is None or sc > best:
            best = sc
            best_combo = list(combo)
    return best, best_combo


def _hand_name(score: tuple[int, ...]) -> str:
    base = CAT_NAMES[score[0]]
    if score[0] in (7,):
        return f"{RANK_CH.get(score[1], score[1])} 포카드"
    if score[0] in (6,):
        return "풀하우스"
    return base


def new_table(host_id: str, host_nick: str, opts: dict[str, Any]) -> dict[str, Any]:
    del opts
    return {
        "id": uuid.uuid4().hex[:12],
        "order": [host_id],
        "nicks": {host_id: host_nick},
        "isBot": {},
        "phase": "waiting",
        "chips": {host_id: START_CHIPS},
        "button": 0,
        "handsPlayed": 0,
        "deadline": None,
        "_events": [],
    }


def join(state: dict[str, Any], pid: str, nick: str) -> None:
    if pid in state["order"]:
        raise ValueError("이미 앉아 있습니다")
    if len(state["order"]) >= MAX_SEATS:
        raise ValueError("만석입니다")
    if state["phase"] != "waiting":
        raise ValueError("진행 중에는 입장할 수 없습니다")
    state["order"].append(pid)
    state["chips"][pid] = START_CHIPS
    state["isBot"][pid] = False
    state["nicks"][pid] = nick
    state.setdefault("_events", []).append({"type": "joined", "pid": pid, "nick": nick})


BOT_NAMES = ["바둑이", "루키", "에이스"]


def start(state: dict[str, Any], requester_pid: str) -> None:
    if requester_pid != state["order"][0]:
        raise ValueError("방장만 시작할 수 있습니다")
    humans = [p for p in state["order"] if not state["isBot"].get(p)]
    if len(humans) < MIN_HUMAN_SEATS:
        raise ValueError("최소 인원 필요")
    if state["phase"] != "waiting":
        raise ValueError("이미 진행 중입니다")
    i = 1
    while len(state["order"]) < 3:
        bpid = f"bot{i}"
        state["order"].append(bpid)
        state["chips"][bpid] = START_CHIPS
        state["isBot"][bpid] = True
        state["nicks"][bpid] = BOT_NAMES[i - 1]
        i += 1
    _open_hand(state)


def can_start(state: dict[str, Any]) -> bool:
    return len(state["order"]) >= MIN_HUMAN_SEATS


def leave(state: dict[str, Any], pid: str) -> None:
    if pid not in state["order"]:
        return
    if state["phase"] not in ("waiting", "between", "ended"):
        state["foldedNow"].add(pid)
        state["out"][pid] = True
        state.setdefault("_events", []).append({"type": "action", "pid": pid, "t": "fold", "amount": 0})
        _advance_street(state)
    else:
        state["order"].remove(pid)
        state.setdefault("_events", []).append({"type": "left", "pid": pid})
        if not state["order"]:
            state["phase"] = "ended"


def ended(state: dict[str, Any]) -> bool:
    return state["phase"] == "ended"


def table_seats(state: dict[str, Any]) -> int:
    return len(state["order"])


def table_running(state: dict[str, Any]) -> bool:
    return state["phase"] not in ("waiting", "ended")


def _eligible(state: dict[str, Any]) -> list[str]:
    return [p for p in state["order"] if state["chips"].get(p, 0) > 0]


def _open_hand(state: dict[str, Any]) -> None:
    elig = _eligible(state)
    if len(elig) < 2 or state["handsPlayed"] >= MAX_HANDS:
        state["phase"] = "ended"
        state.setdefault("_events", []).append({"type": "table_end"})
        return
    while state["button"] < len(state["order"]) and state["order"][state["button"]] not in elig:
        state["button"] = (state["button"] + 1) % len(state["order"])
        if state["button"] == 0 and state["order"][state["button"]] not in elig:
            break
    state["handsPlayed"] += 1
    state["phase"] = "preflop"
    state["deck"] = _new_deck()
    state["community"] = []
    state["hole"] = {}
    state["folded"] = set()
    state["allin"] = set()
    state["out"] = {p for p in state["order"] if state["chips"].get(p, 0) <= 0}
    state["contrib"] = {p: 0 for p in state["order"]}
    state["streetContrib"] = {p: 0 for p in state["order"]}
    state["currentBet"] = 0
    state["minRaiseTo"] = BB
    state["acted"] = set()
    state["revealed"] = {}
    state["foldedNow"] = set()
    state["lastAggressor"] = None

    live = [p for p in state["order"] if p not in state["out"]]
    btn_pid = state["order"][state["button"]]
    if btn_pid in live:
        bidx = live.index(btn_pid)
    else:
        bidx = 0
    n = len(live)
    if n == 2:
        sb_p = live[bidx]
        bb_p = live[(bidx + 1) % n]
        first_preflop = sb_p
    else:
        sb_p = live[(bidx + 1) % n]
        bb_p = live[(bidx + 2) % n]
        first_preflop = live[(bidx + 3) % n]
    state["sbPid"], state["bbPid"] = sb_p, bb_p
    _post(state, sb_p, SB)
    _post(state, bb_p, BB)
    state["currentBet"] = BB
    state["minRaiseTo"] = BB
    state["toAct"] = first_preflop
    state.setdefault("_events", []).append({
        "type": "hand_open", "hand": state["handsPlayed"],
        "button": state["order"][state["button"]],
        "sb": {"pid": sb_p, "amount": state.get("streetContrib", {})[sb_p]},
        "bb": {"pid": bb_p, "amount": state.get("streetContrib", {})[bb_p]},
    })
    for p in live:
        state["hole"][p] = [state["deck"].pop(), state["deck"].pop()]
    state.setdefault("_events", []).append({"type": "dealt_hole", "count": 2, "live": live})


def _post(state: dict[str, Any], pid: str, amount: int) -> None:
    pay = min(amount, state["chips"][pid])
    state["chips"][pid] -= pay
    state.get("contrib", {})[pid] += pay
    state.get("streetContrib", {})[pid] += pay
    if state["chips"][pid] == 0:
        state["allin"].add(pid)


def _pot_total(state: dict[str, Any]) -> int:
    return sum(state.get("contrib", {}).values())


def _live_players(state: dict[str, Any]) -> list[str]:
    return [p for p in state["order"]
            if p not in state["folded"] and p not in state["out"]]


def _apply_action_inner(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    t = action.get("t")
    if pid in state["folded"] or pid in state["allin"] or pid in state["out"]:
        raise ValueError("액션할 수 없는 상태입니다")
    if pid != state.get("toAct"):
        raise ValueError("당신 차례이 아닙니다")

    to_call = state["currentBet"] - state.get("streetContrib", {})[pid]

    if t == "fold":
        state["folded"].add(pid)
        state.setdefault("_events", []).append({"type": "action", "pid": pid, "t": "fold", "amount": 0})
        _advance_street(state)
        return

    if t == "check":
        if to_call > 0:
            raise ValueError("체크할 수 없습니다")
        state["acted"].add(pid)
        state.setdefault("_events", []).append({"type": "action", "pid": pid, "t": "check", "amount": 0})
        _advance_street(state)
        return

    if t == "call":
        if to_call <= 0:
            raise ValueError("체크하세요")
        _post(state, pid, to_call)
        state["acted"].add(pid)
        state.setdefault("_events", []).append({"type": "action", "pid": pid, "t": "call",
                                 "amount": to_call,
                                 "allin": pid in state["allin"]})
        _advance_street(state)
        return

    if t in ("raise", "bet"):
        try:
            target_total = int(action["to"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("잘못된 금액")
        max_to = state.get("streetContrib", {})[pid] + state["chips"][pid]
        if target_total > max_to:
            target_total = max_to
        need_add = target_total - state.get("streetContrib", {})[pid]
        if need_add <= 0:
            raise ValueError("금액이 부족합니다")
        if state["currentBet"] > 0 and target_total < state["minRaiseTo"] and target_total < max_to:
            raise ValueError(f"최소 레이즈는 {state['minRaiseTo']}까지입니다")
        if state["currentBet"] == 0 and target_total < BB:
            raise ValueError(f"최소 베팅은 {BB}입니다")
        prev_bet = state["currentBet"]
        _post(state, pid, need_add)
        state["currentBet"] = max(state["currentBet"], target_total)
        if state["currentBet"] - prev_bet >= state["minRaiseTo"]:
            state["minRaiseTo"] = state["currentBet"] + (state["currentBet"] - prev_bet)
            state["acted"] = {pid}
            state["lastAggressor"] = pid
        else:
            state["acted"].add(pid)
        ev = {"type": "action", "pid": pid, "t": "raise" if prev_bet > 0 else "bet",
              "amount": need_add, "to": state["currentBet"],
              "allin": pid in state["allin"]}
        state.setdefault("_events", []).append(ev)
        _advance_street(state)
        return

    if t == "allin":
        stack = state["chips"][pid]
        if stack <= 0:
            raise ValueError("칩이 없습니다")
        target_total = state.get("streetContrib", {})[pid] + stack
        prev_bet = state["currentBet"]
        _post(state, pid, stack)
        if target_total > state["currentBet"]:
            state["currentBet"] = target_total
            if target_total - prev_bet >= state["minRaiseTo"]:
                state["minRaiseTo"] = state["currentBet"] + (target_total - prev_bet)
                state["acted"] = {pid}
                state["lastAggressor"] = pid
            else:
                state["acted"].add(pid)
        else:
            state["acted"].add(pid)
        state.setdefault("_events", []).append({"type": "action", "pid": pid, "t": "allin",
                                 "amount": stack, "to": state["currentBet"],
                                 "allin": True})
        _advance_street(state)
        return

    raise ValueError("잘못된 행동")


def _advance_street(state: dict[str, Any]) -> None:
    live = _live_players(state)
    if len(live) == 1:
        _award_untouched(state, live[0])
        return
    everyone_done = all(
        p in state["acted"] or p in state["allin"] or p in state["folded"]
        for p in live
    )
    if not everyone_done:
        idx = state["order"].index(state["toAct"])
        for step in range(1, len(state["order"]) + 1):
            cand = state["order"][(idx + step) % len(state["order"])]
            if cand in live and cand not in state["acted"] and cand not in state["allin"]:
                state["toAct"] = cand
                return
        return
    if all(p in state["allin"] for p in live) or (
        len([p for p in live if p not in state["allin"]]) <= 1 and
        all(state.get("streetContrib", {})[p] == state["currentBet"] for p in live if p not in state["allin"])
    ):
        while len(state["community"]) < 5:
            state.setdefault("_events", []).append({"type": "run_out"})
            _deal_next_street(state)
        _showdown(state)
        return
    _next_street(state)


def _next_street(state: dict[str, Any]) -> None:
    if len(state["community"]) >= 5:
        _showdown(state)
        return
    _deal_next_street(state)
    state["currentBet"] = 0
    state["minRaiseTo"] = BB
    state["acted"] = set()
    state["streetContrib"] = {p: 0 for p in state["order"]}
    live = _live_players(state)
    btn_idx = state["button"]
    for step in range(1, len(state["order"]) + 1):
        cand = state["order"][(btn_idx + step) % len(state["order"])]
        if cand in live and cand not in state["allin"]:
            state["toAct"] = cand
            break
    if all(p in state["allin"] for p in live):
        while len(state["community"]) < 5:
            _deal_next_street(state)
        _showdown(state)


def _deal_next_street(state: dict[str, Any]) -> None:
    if len(state["community"]) == 0:
        state["community"] = [state["deck"].pop() for _ in range(3)]
        state.setdefault("_events", []).append({"type": "street", "name": "flop", "cards": state["community"]})
        state["phase"] = "flop"
    elif len(state["community"]) == 3:
        state["community"].append(state["deck"].pop())
        state.setdefault("_events", []).append({"type": "street", "name": "turn",
                                 "cards": [state["community"][-1]]})
        state["phase"] = "turn"
    elif len(state["community"]) == 4:
        state["community"].append(state["deck"].pop())
        state.setdefault("_events", []).append({"type": "street", "name": "river",
                                 "cards": [state["community"][-1]]})
        state["phase"] = "river"


def _award_untouched(state: dict[str, Any], winner: str) -> None:
    _refund_uncalled(state)
    pot = _pot_total(state)
    state["chips"][winner] += pot
    state["contrib"] = {p: 0 for p in state["order"]}
    state["phase"] = "between"
    state["deadline"] = time.time() + BETWEEN_SECONDS
    state.setdefault("_events", []).append({
        "type": "pot_award",
        "winners": [{"pid": winner, "amount": pot, "handName": ""}],
        "pot": pot,
        "byFold": True,
    })
    state.setdefault("_events", []).append({"type": "hand_end"})


def _refund_uncalled(state: dict[str, Any]) -> None:
    active_contribs = {p: c for p, c in state.get("contrib", {}).items()
                       if c > 0 and p not in state["folded"]}
    if len(active_contribs) <= 1:
        return
    top = max(active_contribs.values())
    tops = [p for p, c in active_contribs.items() if c == top]
    if len(tops) != 1:
        return
    leader = tops[0]
    second = max(c for p, c in active_contribs.items() if p != leader)
    excess = top - second
    if excess > 0 and leader not in state["allin"]:
        state["chips"][leader] += excess
        state.get("contrib", {})[leader] -= excess


def _showdown(state: dict[str, Any]) -> None:
    live = _live_players(state)
    _refund_uncalled(state)
    results = {}
    best_cards = {}
    for p in live:
        sc, combo = _best7(state["hole"][p] + state["community"])
        results[p] = sc
        best_cards[p] = combo
        state["revealed"][p] = state["hole"][p]
        state.setdefault("_events", []).append({"type": "show_cards", "pid": p, "cards": state["hole"][p]})
    contribs = {p: state.get("contrib", {})[p] for p in state["order"] if state.get("contrib", {})[p] > 0}
    levels = sorted(set(contribs.values()))
    winners_list = []
    prev_level = 0
    remaining = {p: c for p, c in contribs.items()}
    for level in levels:
        layer = 0
        contenders = {}
        for p, c in remaining.items():
            take = min(c, level - prev_level)
            layer += take
            if take > 0:
                contenders[p] = True
        if layer <= 0:
            continue
        eligible = [p for p in contenders if p in results]
        if not eligible:
            continue
        best_sc = max(results[p] for p in eligible)
        winners = [p for p in eligible if results[p] == best_sc]
        share = layer // len(winners)
        extra = layer % len(winners)
        for w in winners:
            gain = share
            state["chips"][w] += gain
            winners_list.append({"pid": w, "amount": gain, "handName": _hand_name(best_sc)})
        if extra:
            first = winners[0]
            state["chips"][first] += extra
        for p in list(remaining.keys()):
            used = min(remaining[p], level - prev_level)
            remaining[p] -= used
        prev_level = level
    merged: dict[str, dict[str, Any]] = {}
    for w in winners_list:
        if w["pid"] in merged:
            merged[w["pid"]]["amount"] += w["amount"]
        else:
            merged[w["pid"]] = w
    state.setdefault("_events", []).append({
        "type": "showdown_result",
        "ranks": {p: list(results[p]) for p in live},
        "names": {p: _hand_name(results[p]) for p in live},
        "usedCards": {p: [c["id"] for c in best_cards[p]] for p in live},
    })
    state.setdefault("_events", []).append({
        "type": "pot_award",
        "winners": list(merged.values()),
        "pot": sum(contribs.values()),
        "byFold": False,
    })
    state["contrib"] = {p: 0 for p in state["order"]}
    state["phase"] = "between"
    state["deadline"] = time.time() + BETWEEN_SECONDS
    state.setdefault("_events", []).append({"type": "hand_end"})


def maybe_tick(state: dict[str, Any]) -> bool:
    if state["phase"] == "between":
        if state["deadline"] and time.time() >= state["deadline"]:
            alive = [p for p in state["order"] if state["chips"].get(p, 0) > 0
                     and not state["isBot"].get(p)]
            bots = [p for p in state["order"] if state["isBot"].get(p)
                    and state["chips"].get(p, 0) > 0]
            if len(alive) == 0 or (len(alive) + len(bots)) < 2:
                state["phase"] = "ended"
                state.setdefault("_events", []).append({"type": "table_end"})
                return True
            state["button"] = (state["button"] + 1) % len(state["order"])
            while state["chips"].get(state["order"][state["button"]], 0) <= 0:
                state["button"] = (state["button"] + 1) % len(state["order"])
            _open_hand(state)
            return True
    return False


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if pid not in state["order"]:
        raise ValueError("앉아 있지 않습니다")
    maybe_tick(state)
    if state["phase"] in ("waiting", "between", "ended"):
        raise ValueError("핸드 진행 중이 아닙니다")
    _apply_action_inner(state, pid, action)


def view_for(state: dict[str, Any], pid: str) -> dict[str, Any]:
    seats = []
    btn = state["order"][state["button"]] if state["order"] else None
    for i, sp in enumerate(state["order"]):
        seats.append({
            "pid": sp,
            "seat": i,
            "nick": state["nicks"].get(sp, ""),
            "chips": state["chips"].get(sp, 0),
            "betThisStreet": state.get("streetContrib", {}).get(sp, 0),
            "totalContrib": state.get("contrib", {}).get(sp, 0),
            "folded": sp in state.get("folded", set()),
            "allin": sp in state.get("allin", set()),
            "out": sp in state.get("out", set()),
            "isDealer": sp == btn,
            "isBot": bool(state["isBot"].get(sp)),
            "cards": state.get("revealed", {}).get(sp),
        })
    return {
        "game": "poker",
        "phase": state["phase"],
        "seated": pid in state["order"],
        "youAreHost": state["order"][:1] == [pid],
        "canStart": state["phase"] == "waiting" and can_start(state) and pid in state["order"],
        "seats": seats,
        "maxSeats": MAX_SEATS,
        "yourHole": state.get("hole", {}).get(pid),
        "community": state.get("community", []),
        "pot": _pot_total(state),
        "currentBet": state.get("currentBet", 0),
        "myStreetBet": state.get("streetContrib", {}).get(pid, 0),
        "toCall": max(0, state.get("currentBet", 0) - state.get("streetContrib", {}).get(pid, 0)),
        "minRaiseTo": state.get("minRaiseTo", BB),
        "myChips": state["chips"].get(pid, 0),
        "toActPid": state.get("toAct"),
        "yourTurn": state.get("toAct") == pid,
        "sb": SB,
        "bb": BB,
        "startChips": START_CHIPS,
        "handsPlayed": state.get("handsPlayed", 0),
    }


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.pop("_events", [])


def forfeit(state: dict[str, Any], pid: str) -> None:
    leave(state, pid)


def _chen_score(hole: list[dict[str, Any]]) -> float:
    r1, r2 = hole[0]["r"], hole[1]["r"]
    suited = hole[0]["s"] == hole[1]["s"]
    pts_map = {14: 10, 13: 8, 12: 7, 11: 6}
    hi = max(r1, r2)
    lo = min(r1, r2)
    score = pts_map.get(hi, hi / 2)
    if r1 == r2:
        score = max(5, score * 2)
    if suited:
        score += 2
    gap = hi - lo - 1
    if r1 != r2:
        if gap == 1:
            score -= 1
        elif gap == 2:
            score -= 2
        elif gap == 3:
            score -= 4
        elif gap >= 4:
            score -= 5
    if gap <= 1 and hi < 12:
        score += 1
    return score


def _bot_decide(state: dict[str, Any], pid: str) -> dict[str, Any]:
    to_call = state["currentBet"] - state.get("streetContrib", {})[pid]
    stack = state["chips"][pid]
    pot = _pot_total(state)

    if state["phase"] == "preflop":
        chen = _chen_score(state["hole"][pid])
        strength = min(1.0, max(0.05, chen / 14))
    else:
        sc, _ = _best7(state["hole"][pid] + state["community"])
        strength = min(1.0, sc[0] / 6 + 0.18)

    roll = random.random()

    if to_call == 0:
        if strength > 0.62 and roll < 0.65:
            target = state.get("streetContrib", {})[pid] + max(BB, int(pot * 0.6))
            return {"t": "raise", "to": min(target, state.get("streetContrib", {})[pid] + stack)}
        return {"t": "check"}
    if strength > 0.75 and roll < 0.55:
        target = state["currentBet"] * 2 + int(pot * 0.5)
        return {"t": "raise", "to": min(target, state.get("streetContrib", {})[pid] + stack)}
    if strength > 0.45 or to_call <= BB:
        if to_call >= stack:
            return {"t": "allin"} if strength > 0.6 else {"t": "fold"}
        return {"t": "call"}
    if strength > 0.3 and to_call < stack * 0.15 and roll < 0.4:
        return {"t": "call"}
    return {"t": "fold"}


def cpu_should_act(state: dict[str, Any]) -> bool:
    return False


def bot_tick(state: dict[str, Any]) -> bool:
    if state["phase"] in ("preflop", "flop", "turn", "river"):
        to_act = state.get("toAct")
        if to_act and state["isBot"].get(to_act) and to_act in _live_players(state):
            try:
                _apply_action_inner(state, to_act, _bot_decide(state, to_act))
                return True
            except ValueError:
                try:
                    _apply_action_inner(state, to_act, {"t": "fold"})
                    return True
                except ValueError:
                    return False
    return False
