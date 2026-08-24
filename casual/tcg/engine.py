"""Authoritative Pokémon TCG (Hearthstone-lite) engine — no energy attach."""

from __future__ import annotations

import json
import random
import uuid
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(__file__).with_name("catalog.json")
PRIZE_TO_WIN = 3
BENCH_MAX = 3
HAND_START = 5
DECK_SIZE = 20
WEAKNESS_BONUS = 15


def load_catalog() -> dict[str, Any]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in data["cards"]}
    return {"types": data["types"], "cards": by_id, "list": data["cards"]}


CATALOG = load_catalog()


def _uid() -> str:
    return uuid.uuid4().hex[:10]


def build_deck(rng: random.Random | None = None) -> list[str]:
    rng = rng or random.Random()
    basics = [c for c in CATALOG["list"] if c["stage"] == "basic"]
    stages = [c for c in CATALOG["list"] if c["stage"] != "basic"]
    picks: list[str] = []
    basic_picks = rng.sample(basics, k=min(6, len(basics)))
    for c in basic_picks:
        picks.extend([c["id"], c["id"]])
    pool = basics + stages
    while len(picks) < DECK_SIZE:
        c = rng.choice(pool)
        if picks.count(c["id"]) >= 2:
            continue
        if c["stage"] != "basic":
            evo = c.get("evolves_from")
            if evo and picks.count(evo) == 0 and rng.random() < 0.7:
                continue
        picks.append(c["id"])
    rng.shuffle(picks)
    if not any(CATALOG["cards"][i]["stage"] == "basic" for i in picks[:HAND_START]):
        for i, cid in enumerate(picks):
            if CATALOG["cards"][cid]["stage"] == "basic":
                picks[0], picks[i] = picks[i], picks[0]
                break
    return picks[:DECK_SIZE]


def _new_instance(card_id: str) -> dict[str, Any]:
    card = CATALOG["cards"][card_id]
    return {
        "uid": _uid(),
        "cardId": card_id,
        "hp": card["hp"],
        "maxHp": card["hp"],
        "damage": 0,
        "justPlayed": True,
    }


def _primary_attack(card: dict[str, Any]) -> dict[str, Any]:
    attacks = card.get("attacks") or []
    if not attacks:
        return {"id": "strike", "name": "공격", "damage": 20}
    return attacks[0]


def _public_card(inst: dict[str, Any] | None, hide: bool = False) -> dict[str, Any] | None:
    if not inst:
        return None
    if hide:
        return {"hidden": True}
    card = CATALOG["cards"][inst["cardId"]]
    atk = _primary_attack(card)
    return {
        "uid": inst["uid"],
        "cardId": inst["cardId"],
        "name": card["name"],
        "dex": card["dex"],
        "type": card["type"],
        "stage": card["stage"],
        "hp": card["hp"] - inst["damage"],
        "maxHp": card["hp"],
        "damage": inst["damage"],
        "weakness": card.get("weakness"),
        "retreat": card.get("retreat", 0),
        "prize": card.get("prize", 1),
        "attacks": [atk],
        "attack": atk,
        "justPlayed": inst.get("justPlayed", False),
        "evolvesFrom": card.get("evolves_from"),
    }


def _player_state(deck: list[str]) -> dict[str, Any]:
    hand_ids = deck[:HAND_START]
    rest = deck[HAND_START:]
    return {
        "deck": rest,
        "hand": [_new_instance(cid) for cid in hand_ids],
        "active": None,
        "bench": [],
        "prize": 0,
        "discard": [],
        "retreatedThisTurn": False,
        "attackedThisTurn": False,
    }


def new_match(p0: str, p1: str, seed: int | None = None) -> dict[str, Any]:
    rng = random.Random(seed)
    d0, d1 = build_deck(rng), build_deck(rng)
    state = {
        "id": _uid(),
        "phase": "setup",
        "players": {p0: _player_state(d0), p1: _player_state(d1)},
        "order": [p0, p1],
        "turn": p0,
        "turnCount": 0,
        "firstTurn": True,
        "winner": None,
        "events": [],
        "setupReady": {p0: False, p1: False},
        "rng": rng,
    }
    _emit(state, {"type": "match_start", "order": [p0, p1]})
    return state


def _emit(state: dict[str, Any], event: dict[str, Any]) -> None:
    state["events"].append(event)


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    ev = state["events"]
    state["events"] = []
    return ev


def _other(state: dict[str, Any], pid: str) -> str:
    return state["order"][1] if state["order"][0] == pid else state["order"][0]


def _can_attack_now(state: dict[str, Any], pid: str) -> bool:
    """Casual rule: everyone can attack from their very first turn."""
    if state["phase"] != "playing":
        return False
    if state["turn"] != pid:
        return False
    pl = state["players"][pid]
    if not pl["active"] or pl["attackedThisTurn"]:
        return False
    return True


def start_turn(state: dict[str, Any], pid: str) -> None:
    pl = state["players"][pid]
    pl["retreatedThisTurn"] = False
    pl["attackedThisTurn"] = False
    for inst in ([pl["active"]] if pl["active"] else []) + pl["bench"] + pl["hand"]:
        if inst:
            inst["justPlayed"] = False
    if pl["deck"]:
        cid = pl["deck"].pop(0)
        card = _new_instance(cid)
        pl["hand"].append(card)
        _emit(state, {"type": "draw", "player": pid, "cardId": cid, "uid": card["uid"]})
    state["turn"] = pid
    _emit(
        state,
        {
            "type": "turn_start",
            "player": pid,
            "turnCount": state["turnCount"],
            "canAttack": _can_attack_now(state, pid),
        },
    )


def begin_play(state: dict[str, Any]) -> None:
    state["phase"] = "playing"
    state["turnCount"] = 0
    start_turn(state, state["order"][0])


def _card_public(cid: str) -> dict[str, Any]:
    c = CATALOG["cards"][cid]
    atk = _primary_attack(c)
    return {
        "id": cid,
        "dex": c["dex"],
        "name": c["name"],
        "type": c["type"],
        "stage": c["stage"],
        "hp": c["hp"],
        "retreat": c.get("retreat", 0),
        "weakness": c.get("weakness"),
        "prize": c.get("prize", 1),
        "attacks": [atk],
        "attack": atk,
        "evolvesFrom": c.get("evolves_from"),
    }


def view_for(state: dict[str, Any], viewer: str) -> dict[str, Any]:
    def side(pid: str) -> dict[str, Any]:
        pl = state["players"][pid]
        hide_hand = pid != viewer
        return {
            "id": pid,
            "prize": pl["prize"],
            "deckCount": len(pl["deck"]),
            "handCount": len(pl["hand"]),
            "hand": [_public_card(c) for c in pl["hand"]] if not hide_hand else [{"hidden": True} for _ in pl["hand"]],
            "active": _public_card(pl["active"]),
            "bench": [_public_card(c) for c in pl["bench"]],
            "retreatedThisTurn": pl["retreatedThisTurn"],
            "attackedThisTurn": pl["attackedThisTurn"],
            "canAttack": _can_attack_now(state, pid) if pid == viewer else False,
            "canRetreat": (
                pid == viewer
                and state["phase"] == "playing"
                and state["turn"] == pid
                and bool(pl["active"])
                and bool(pl["bench"])
                and not pl["retreatedThisTurn"]
            ),
        }

    return {
        "matchId": state["id"],
        "phase": state["phase"],
        "turn": state["turn"],
        "turnCount": state["turnCount"],
        "firstTurn": state["firstTurn"],
        "winner": state["winner"],
        "you": viewer,
        "setupReady": dict(state.get("setupReady", {})),
        "players": {pid: side(pid) for pid in state["order"]},
        "order": list(state["order"]),
        "catalog": {cid: _card_public(cid) for cid in CATALOG["cards"]},
    }


def _find_in_hand(pl: dict[str, Any], uid: str):
    for i, c in enumerate(pl["hand"]):
        if c["uid"] == uid:
            return i, c
    return None


def _find_on_field(pl: dict[str, Any], uid: str):
    if pl["active"] and pl["active"]["uid"] == uid:
        return "active", None, pl["active"]
    for i, c in enumerate(pl["bench"]):
        if c["uid"] == uid:
            return "bench", i, c
    return None


def apply_action(state: dict[str, Any], pid: str, action: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        raise ValueError("match ended")
    typ = action.get("type")

    if state["phase"] == "setup":
        if typ == "setup_active":
            _setup_active(state, pid, action["uid"])
            return
        if typ == "setup_bench":
            _setup_bench(state, pid, action["uid"])
            return
        if typ == "setup_ready":
            _setup_ready(state, pid)
            return
        raise ValueError("invalid setup action")

    if state["turn"] != pid:
        raise ValueError("not your turn")

    if typ == "attach_energy":
        raise ValueError("energy system removed")
    if typ == "play_basic":
        _play_basic(state, pid, action["uid"])
    elif typ == "evolve":
        _evolve(state, pid, action["handUid"], action["targetUid"])
    elif typ == "retreat":
        _retreat(state, pid, action["benchUid"])
    elif typ == "attack":
        _attack(state, pid, action.get("attackId"))
    elif typ == "end_turn":
        _end_turn(state, pid)
    else:
        raise ValueError(f"unknown action {typ}")


def _setup_active(state: dict[str, Any], pid: str, uid: str) -> None:
    pl = state["players"][pid]
    if pl["active"]:
        raise ValueError("active already set")
    found = _find_in_hand(pl, uid)
    if not found:
        raise ValueError("card not in hand")
    idx, card = found
    pl["hand"].pop(idx)
    pl["active"] = card
    _emit(state, {"type": "setup_active", "player": pid, "uid": uid, "cardId": card["cardId"]})


def _setup_bench(state: dict[str, Any], pid: str, uid: str) -> None:
    pl = state["players"][pid]
    if not pl["active"]:
        raise ValueError("set active first")
    if len(pl["bench"]) >= BENCH_MAX:
        raise ValueError("bench full")
    found = _find_in_hand(pl, uid)
    if not found:
        raise ValueError("card not in hand")
    idx, card = found
    pl["hand"].pop(idx)
    pl["bench"].append(card)
    _emit(state, {"type": "setup_bench", "player": pid, "uid": uid, "cardId": card["cardId"]})


def _setup_ready(state: dict[str, Any], pid: str) -> None:
    pl = state["players"][pid]
    if not pl["active"]:
        raise ValueError("need active pokemon")
    state["setupReady"][pid] = True
    _emit(state, {"type": "setup_ready", "player": pid})
    if all(state["setupReady"].get(p) for p in state["order"]):
        begin_play(state)


def _play_basic(state: dict[str, Any], pid: str, uid: str) -> None:
    """Play any Pokémon from hand onto the bench (name kept for wire compat)."""
    pl = state["players"][pid]
    if len(pl["bench"]) >= BENCH_MAX:
        raise ValueError("bench full")
    found = _find_in_hand(pl, uid)
    if not found:
        raise ValueError("not in hand")
    idx, card = found
    pl["hand"].pop(idx)
    card["justPlayed"] = True
    pl["bench"].append(card)
    _emit(state, {"type": "play_basic", "player": pid, "uid": uid, "cardId": card["cardId"]})


def _evolve(state: dict[str, Any], pid: str, hand_uid: str, target_uid: str) -> None:
    pl = state["players"][pid]
    found = _find_in_hand(pl, hand_uid)
    if not found:
        raise ValueError("evo not in hand")
    idx, evo = found
    meta = CATALOG["cards"][evo["cardId"]]
    if not meta.get("evolves_from"):
        raise ValueError("not an evolution")
    loc = _find_on_field(pl, target_uid)
    if not loc:
        raise ValueError("target missing")
    where, bidx, target = loc
    if target["justPlayed"]:
        raise ValueError("cannot evolve same turn played")
    if target["cardId"] != meta["evolves_from"]:
        raise ValueError("wrong evolution target")
    evo["damage"] = target["damage"]
    evo["justPlayed"] = True
    evo["maxHp"] = meta["hp"]
    evo["hp"] = meta["hp"]
    pl["hand"].pop(idx)
    if where == "active":
        pl["discard"].append(target)
        pl["active"] = evo
    else:
        pl["discard"].append(target)
        pl["bench"][bidx] = evo
    _emit(
        state,
        {
            "type": "evolve",
            "player": pid,
            "fromUid": target_uid,
            "toUid": evo["uid"],
            "cardId": evo["cardId"],
            "where": where,
        },
    )


def _retreat(state: dict[str, Any], pid: str, bench_uid: str) -> None:
    pl = state["players"][pid]
    if pl["retreatedThisTurn"]:
        raise ValueError("already retreated")
    if not pl["active"]:
        raise ValueError("no active")
    if not pl["bench"]:
        raise ValueError("no bench")
    loc = _find_on_field(pl, bench_uid)
    if not loc or loc[0] != "bench":
        raise ValueError("invalid bench target")
    _, bidx, _ = loc
    pl["active"], pl["bench"][bidx] = pl["bench"][bidx], pl["active"]
    pl["retreatedThisTurn"] = True
    _emit(state, {"type": "retreat", "player": pid, "newActive": pl["active"]["uid"]})


def _attack(state: dict[str, Any], pid: str, attack_id: str | None = None) -> None:
    pl = state["players"][pid]
    opp_id = _other(state, pid)
    opp = state["players"][opp_id]
    if not pl["active"] or not opp["active"]:
        raise ValueError("need actives")
    if not _can_attack_now(state, pid):
        raise ValueError("cannot attack now")
    meta = CATALOG["cards"][pl["active"]["cardId"]]
    atk = _primary_attack(meta)
    if attack_id and atk["id"] != attack_id:
        # Only one attack per card; ignore stale client ids by using primary
        atk = _primary_attack(meta)
    dmg = int(atk["damage"])
    weak = False
    opp_meta = CATALOG["cards"][opp["active"]["cardId"]]
    if opp_meta.get("weakness") and opp_meta["weakness"] == meta["type"]:
        dmg += WEAKNESS_BONUS
        weak = True
    opp["active"]["damage"] += dmg
    pl["attackedThisTurn"] = True
    _emit(
        state,
        {
            "type": "attack",
            "player": pid,
            "attackId": atk["id"],
            "attackName": atk["name"],
            "damage": dmg,
            "weakness": weak,
            "attackerType": meta["type"],
            "targetUid": opp["active"]["uid"],
        },
    )
    if opp["active"]["damage"] >= opp_meta["hp"]:
        _knock_out(state, pid, opp_id)
    else:
        _end_turn(state, pid)


def _knock_out(state: dict[str, Any], attacker: str, defender: str) -> None:
    apl = state["players"][attacker]
    dpl = state["players"][defender]
    ko = dpl["active"]
    prize = CATALOG["cards"][ko["cardId"]].get("prize", 1)
    dpl["discard"].append(ko)
    dpl["active"] = None
    apl["prize"] += prize
    _emit(
        state,
        {
            "type": "knock_out",
            "player": defender,
            "uid": ko["uid"],
            "cardId": ko["cardId"],
            "prize": prize,
            "attacker": attacker,
            "attackerPrize": apl["prize"],
        },
    )
    if apl["prize"] >= PRIZE_TO_WIN:
        state["phase"] = "ended"
        state["winner"] = attacker
        _emit(state, {"type": "game_over", "winner": attacker})
        return
    if not dpl["bench"]:
        state["phase"] = "ended"
        state["winner"] = attacker
        _emit(state, {"type": "game_over", "winner": attacker, "reason": "no_bench"})
        return
    # Defender chooses first bench — auto promote front for v1
    dpl["active"] = dpl["bench"].pop(0)
    _emit(state, {"type": "promote", "player": defender, "uid": dpl["active"]["uid"]})
    _end_turn(state, attacker)


def _end_turn(state: dict[str, Any], pid: str) -> None:
    if state["phase"] != "playing":
        return
    if state["turn"] != pid:
        raise ValueError("not your turn")
    state["firstTurn"] = False
    state["turnCount"] += 1
    nxt = _other(state, pid)
    _emit(state, {"type": "turn_end", "player": pid})
    start_turn(state, nxt)


def forfeit(state: dict[str, Any], pid: str) -> None:
    if state["phase"] == "ended":
        return
    state["phase"] = "ended"
    state["winner"] = _other(state, pid)
    _emit(state, {"type": "game_over", "winner": state["winner"], "reason": "forfeit", "by": pid})


def cpu_choose(state: dict[str, Any], pid: str) -> dict[str, Any] | None:
    """Softer CPU: fewer benches, sometimes skip evolve, sometimes pass without attack."""
    if state["phase"] == "ended":
        return None
    pl = state["players"][pid]
    rng: random.Random = state.get("rng") or random.Random()

    if state["phase"] == "setup":
        if not pl["active"]:
            if pl["hand"]:
                return {"type": "setup_active", "uid": pl["hand"][0]["uid"]}
        want_bench = 1 if rng.random() < 0.7 else 2
        if len(pl["bench"]) < want_bench and pl["hand"]:
            return {"type": "setup_bench", "uid": pl["hand"][0]["uid"]}
        if not state["setupReady"].get(pid):
            return {"type": "setup_ready"}
        return None

    if state["turn"] != pid:
        return None

    # Evolve sometimes (60%)
    if rng.random() < 0.6:
        for c in pl["hand"]:
            meta = CATALOG["cards"][c["cardId"]]
            evo_from = meta.get("evolves_from")
            if not evo_from:
                continue
            for loc in ([pl["active"]] if pl["active"] else []) + pl["bench"]:
                if loc and loc["cardId"] == evo_from and not loc["justPlayed"]:
                    return {"type": "evolve", "handUid": c["uid"], "targetUid": loc["uid"]}

    # Bench a card sometimes
    if len(pl["bench"]) < 2 and pl["hand"] and rng.random() < 0.45:
        return {"type": "play_basic", "uid": pl["hand"][0]["uid"]}

    # Retreat if active is low HP and bench is healthier (30%)
    if (
        pl["active"]
        and pl["bench"]
        and not pl["retreatedThisTurn"]
        and rng.random() < 0.3
    ):
        meta = CATALOG["cards"][pl["active"]["cardId"]]
        cur_hp = meta["hp"] - pl["active"]["damage"]
        if cur_hp <= meta["hp"] * 0.4:
            best = max(
                pl["bench"],
                key=lambda b: CATALOG["cards"][b["cardId"]]["hp"] - b["damage"],
            )
            return {"type": "retreat", "benchUid": best["uid"]}

    if pl["active"] and _can_attack_now(state, pid):
        # Occasionally pass without attacking (15%) to feel less ruthless
        if rng.random() < 0.15:
            return {"type": "end_turn"}
        atk = _primary_attack(CATALOG["cards"][pl["active"]["cardId"]])
        return {"type": "attack", "attackId": atk["id"]}

    return {"type": "end_turn"}
