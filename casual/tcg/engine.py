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

# Battle items (separate from Pokémon hand). KO → discover pick.
ITEMS: dict[str, dict[str, str]] = {
    "smoke": {
        "id": "smoke",
        "name": "연막",
        "desc": "상대의 다음 공격을 1회 무효화",
    },
    "potion": {
        "id": "potion",
        "name": "상처약",
        "desc": "내 액티브 HP 30 회복",
    },
    "x_attack": {
        "id": "x_attack",
        "name": "플러스파워",
        "desc": "다음 공격 데미지 +15",
    },
    "poke_ball": {
        "id": "poke_ball",
        "name": "몬스터볼",
        "desc": "덱에서 카드 1장 드로우",
    },
    "full_restore": {
        "id": "full_restore",
        "name": "회복약",
        "desc": "액티브 HP 40 회복 + 마비 해제",
    },
}
ITEM_DROP_POOL = ["smoke", "potion", "x_attack", "poke_ball", "full_restore"]

# Marvel Snap-style per-match field rules
FIELD_MODIFIERS: dict[str, dict[str, str]] = {
    "hot_weakness": {"id": "hot_weakness", "name": "약점 과열", "desc": "약점 추가 데미지 +25"},
    "power_surge": {"id": "power_surge", "name": "파워 서치", "desc": "모든 공격 데미지 +5"},
    "starter_kit": {"id": "starter_kit", "name": "시작 보급", "desc": "각자 랜덤 아이템 1개로 시작"},
}

# Overlay special effects onto attack ids (catalog stays untouched).
ATTACK_EFFECTS: dict[str, str] = {
    "bite": "drain",
    "lick": "paralyze",
    "nuzzle": "paralyze",
    "spark": "paralyze",
    "ember": "recoil",
    "flame": "recoil",
    "firemane": "drain",
    "submission": "recoil",
    "bone": "drain",
    "wrap": "paralyze",
    "confusion": "paralyze",
    "headbutt": "recoil",
}


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
        atk: dict[str, Any] = {"id": "strike", "name": "공격", "damage": 20}
    else:
        atk = dict(attacks[0])
    eff = ATTACK_EFFECTS.get(atk.get("id") or "")
    if eff:
        atk["effect"] = eff
    return atk


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
        "items": [],
        "skipNextAttack": False,
        "nextAttackBonus": 0,
        "paralyzed": False,
        "retreatedThisTurn": False,
        "attackedThisTurn": False,
        "itemUsedThisTurn": False,
        "stats": {"damage": 0, "kos": 0, "itemsUsed": 0},
    }


def new_match(p0: str, p1: str, seed: int | None = None) -> dict[str, Any]:
    rng = random.Random(seed)
    d0, d1 = build_deck(rng), build_deck(rng)
    mod_id = rng.choice(list(FIELD_MODIFIERS.keys()))
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
        "pendingChoice": None,
        "fieldModifier": dict(FIELD_MODIFIERS[mod_id]),
        "rng": rng,
    }
    _emit(
        state,
        {
            "type": "match_start",
            "order": [p0, p1],
            "fieldModifier": dict(FIELD_MODIFIERS[mod_id]),
        },
    )
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
    pl["itemUsedThisTurn"] = False
    # Paralyze: skip attack this turn, then clear.
    if pl.get("paralyzed"):
        pl["attackedThisTurn"] = True
        pl["paralyzed"] = False
        _emit(state, {"type": "paralyze_skip", "player": pid})
    for inst in ([pl["active"]] if pl["active"] else []) + pl["bench"] + pl["hand"]:
        if inst:
            inst["justPlayed"] = False
    if pl["deck"]:
        cid = pl["deck"].pop(0)
        card = _new_instance(cid)
        pl["hand"].append(card)
        _emit(state, {"type": "draw", "player": pid, "cardId": cid, "uid": card["uid"]})
    state["turn"] = pid
    clutch = [
        p
        for p in state["order"]
        if state["players"][p]["prize"] >= PRIZE_TO_WIN - 1
    ]
    _emit(
        state,
        {
            "type": "turn_start",
            "player": pid,
            "turnCount": state["turnCount"],
            "canAttack": _can_attack_now(state, pid),
            "matchPoint": bool(clutch),
            "matchPointPlayers": clutch,
        },
    )


def begin_play(state: dict[str, Any]) -> None:
    state["phase"] = "playing"
    state["turnCount"] = 0
    mod = (state.get("fieldModifier") or {}).get("id")
    if mod == "starter_kit":
        rng: random.Random = state.get("rng") or random.Random()
        for pid in state["order"]:
            iid = rng.choice(ITEM_DROP_POOL)
            drop = {"uid": _uid(), "itemId": iid}
            state["players"][pid].setdefault("items", []).append(drop)
            meta = ITEMS[iid]
            _emit(
                state,
                {
                    "type": "item_drop",
                    "player": pid,
                    "uid": drop["uid"],
                    "itemId": iid,
                    "itemName": meta["name"],
                    "reason": "starter_kit",
                },
            )
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
        items_pub = [
            {
                "uid": it["uid"],
                "itemId": it["itemId"],
                "name": ITEMS[it["itemId"]]["name"],
                "desc": ITEMS[it["itemId"]]["desc"],
            }
            for it in pl.get("items", [])
            if it["itemId"] in ITEMS
        ]
        return {
            "id": pid,
            "prize": pl["prize"],
            "deckCount": len(pl["deck"]),
            "handCount": len(pl["hand"]),
            "hand": [_public_card(c) for c in pl["hand"]] if not hide_hand else [{"hidden": True} for _ in pl["hand"]],
            "active": _public_card(pl["active"]),
            "bench": [_public_card(c) for c in pl["bench"]],
            "items": items_pub if pid == viewer else [{"hidden": True} for _ in items_pub],
            "itemCount": len(pl.get("items", [])),
            "skipNextAttack": bool(pl.get("skipNextAttack")),
            "nextAttackBonus": int(pl.get("nextAttackBonus") or 0),
            "paralyzed": bool(pl.get("paralyzed")),
            "retreatedThisTurn": pl["retreatedThisTurn"],
            "attackedThisTurn": pl["attackedThisTurn"],
            "itemUsedThisTurn": bool(pl.get("itemUsedThisTurn")),
            "stats": dict(pl.get("stats") or {"damage": 0, "kos": 0, "itemsUsed": 0}),
            "canAttack": _can_attack_now(state, pid) if pid == viewer else False,
            "canUseItem": (
                pid == viewer
                and state["phase"] == "playing"
                and state["turn"] == pid
                and not pl.get("itemUsedThisTurn")
                and bool(pl.get("items"))
            ),
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
        "items": {iid: dict(meta) for iid, meta in ITEMS.items()},
        "pendingChoice": _public_pending(state, viewer),
        "fieldModifier": dict(state["fieldModifier"]) if state.get("fieldModifier") else None,
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

    # Discover choice blocks all other actions.
    pc = state.get("pendingChoice")
    if pc:
        if typ != "choose_discover":
            if pid == pc["player"]:
                raise ValueError("choose item first")
            raise ValueError("waiting for opponent choice")
        if pid != pc["player"]:
            raise ValueError("waiting for opponent choice")
        _choose_discover(state, pid, action.get("uid"))
        return

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
    elif typ == "use_item":
        _use_item(state, pid, action.get("uid") or action.get("itemId"))
    elif typ == "choose_discover":
        raise ValueError("no pending choice")
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


def _use_item(state: dict[str, Any], pid: str, uid_or_id: str | None) -> None:
    pl = state["players"][pid]
    if not uid_or_id:
        raise ValueError("item required")
    if pl.get("itemUsedThisTurn"):
        raise ValueError("already used item this turn")
    found = None
    for i, it in enumerate(pl.get("items", [])):
        if it["uid"] == uid_or_id or it["itemId"] == uid_or_id:
            found = (i, it)
            break
    if not found:
        raise ValueError("item not found")
    idx, it = found
    item_id = it["itemId"]
    meta = ITEMS.get(item_id)
    if not meta:
        raise ValueError("unknown item")

    if item_id == "smoke":
        if pl.get("skipNextAttack"):
            raise ValueError("already shielded")
        pl["skipNextAttack"] = True
    elif item_id == "potion":
        if not pl.get("active"):
            raise ValueError("need active pokemon")
        before = pl["active"]["damage"]
        pl["active"]["damage"] = max(0, before - 30)
        healed = before - pl["active"]["damage"]
        if healed <= 0:
            raise ValueError("already full hp")
    elif item_id == "x_attack":
        pl["nextAttackBonus"] = int(pl.get("nextAttackBonus") or 0) + 15
    elif item_id == "poke_ball":
        if not pl["deck"]:
            raise ValueError("deck empty")
        cid = pl["deck"].pop(0)
        card = _new_instance(cid)
        pl["hand"].append(card)
        _emit(state, {"type": "draw", "player": pid, "cardId": cid, "uid": card["uid"]})
    elif item_id == "full_restore":
        if not pl.get("active"):
            raise ValueError("need active pokemon")
        before = pl["active"]["damage"]
        was_para = bool(pl.get("paralyzed"))
        pl["active"]["damage"] = max(0, before - 40)
        pl["paralyzed"] = False
        if before <= 0 and not was_para:
            raise ValueError("already full hp")
    else:
        raise ValueError("unknown item")

    pl["items"].pop(idx)
    pl["itemUsedThisTurn"] = True
    pl.setdefault("stats", {"damage": 0, "kos": 0, "itemsUsed": 0})
    pl["stats"]["itemsUsed"] = int(pl["stats"].get("itemsUsed") or 0) + 1
    _emit(
        state,
        {
            "type": "use_item",
            "player": pid,
            "uid": it["uid"],
            "itemId": item_id,
            "itemName": meta["name"],
        },
    )


def _offer_discover(state: dict[str, Any], attacker: str) -> None:
    if state["phase"] != "playing":
        return
    rng: random.Random = state.get("rng") or random.Random()
    pool = list(ITEM_DROP_POOL)
    rng.shuffle(pool)
    picks = pool[: min(3, len(pool))]
    options = [{"uid": _uid(), "itemId": iid} for iid in picks]
    state["pendingChoice"] = {
        "player": attacker,
        "type": "discover_item",
        "options": options,
    }
    pub = []
    for o in options:
        meta = ITEMS[o["itemId"]]
        pub.append(
            {
                "uid": o["uid"],
                "itemId": o["itemId"],
                "name": meta["name"],
                "desc": meta["desc"],
            }
        )
    _emit(state, {"type": "discover_offer", "player": attacker, "options": pub})


def _choose_discover(state: dict[str, Any], pid: str, uid: str | None) -> None:
    pc = state.get("pendingChoice")
    if not pc or pc.get("type") != "discover_item":
        raise ValueError("no pending choice")
    if pc["player"] != pid:
        raise ValueError("waiting for opponent choice")
    if not uid:
        raise ValueError("item required")
    chosen = None
    for o in pc["options"]:
        if o["uid"] == uid:
            chosen = o
            break
    if not chosen:
        raise ValueError("item not found")
    meta = ITEMS[chosen["itemId"]]
    state["players"][pid].setdefault("items", []).append(
        {"uid": chosen["uid"], "itemId": chosen["itemId"]}
    )
    state["pendingChoice"] = None
    _emit(
        state,
        {
            "type": "discover_pick",
            "player": pid,
            "uid": chosen["uid"],
            "itemId": chosen["itemId"],
            "itemName": meta["name"],
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
        atk = _primary_attack(meta)

    # Smoke shield: defender skips the incoming attack once (turn does NOT auto-end).
    if opp.get("skipNextAttack"):
        opp["skipNextAttack"] = False
        pl["attackedThisTurn"] = True
        pl["nextAttackBonus"] = 0
        _emit(
            state,
            {
                "type": "attack_blocked",
                "player": pid,
                "defender": opp_id,
                "attackId": atk["id"],
                "attackName": atk["name"],
                "reason": "smoke",
                "attackerType": meta["type"],
                "targetUid": opp["active"]["uid"],
            },
        )
        return

    dmg = int(atk["damage"])
    bonus = int(pl.get("nextAttackBonus") or 0)
    if bonus:
        dmg += bonus
        pl["nextAttackBonus"] = 0
    mod_id = (state.get("fieldModifier") or {}).get("id")
    if mod_id == "power_surge":
        dmg += 5
    weak = False
    opp_meta = CATALOG["cards"][opp["active"]["cardId"]]
    if opp_meta.get("weakness") and opp_meta["weakness"] == meta["type"]:
        weak_bonus = 25 if mod_id == "hot_weakness" else WEAKNESS_BONUS
        dmg += weak_bonus
        weak = True
    effect = atk.get("effect")
    opp["active"]["damage"] += dmg
    pl["attackedThisTurn"] = True
    pl.setdefault("stats", {"damage": 0, "kos": 0, "itemsUsed": 0})
    pl["stats"]["damage"] = int(pl["stats"].get("damage") or 0) + dmg

    if effect == "drain":
        heal = max(1, dmg // 2)
        pl["active"]["damage"] = max(0, pl["active"]["damage"] - heal)
    elif effect == "paralyze":
        opp["paralyzed"] = True
    elif effect == "recoil":
        # Soft recoil: never KO yourself.
        room = meta["hp"] - pl["active"]["damage"] - 1
        take = min(10, max(0, room))
        pl["active"]["damage"] += take

    _emit(
        state,
        {
            "type": "attack",
            "player": pid,
            "attackId": atk["id"],
            "attackName": atk["name"],
            "damage": dmg,
            "weakness": weak,
            "effect": effect,
            "attackerType": meta["type"],
            "targetUid": opp["active"]["uid"],
            "bonus": bonus,
        },
    )
    if opp["active"]["damage"] >= opp_meta["hp"]:
        _knock_out(state, pid, opp_id)
    # Hearthstone-style: attacker keeps the turn after attack/KO.


def _knock_out(state: dict[str, Any], attacker: str, defender: str) -> None:
    apl = state["players"][attacker]
    dpl = state["players"][defender]
    ko = dpl["active"]
    prize = CATALOG["cards"][ko["cardId"]].get("prize", 1)
    dpl["discard"].append(ko)
    dpl["active"] = None
    apl["prize"] += prize
    apl.setdefault("stats", {"damage": 0, "kos": 0, "itemsUsed": 0})
    apl["stats"]["kos"] = int(apl["stats"].get("kos") or 0) + 1
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
        state["pendingChoice"] = None
        _emit(state, {"type": "game_over", "winner": attacker, "stats": _match_stats(state)})
        return
    if not dpl["bench"]:
        state["phase"] = "ended"
        state["winner"] = attacker
        state["pendingChoice"] = None
        _emit(state, {"type": "game_over", "winner": attacker, "reason": "no_bench", "stats": _match_stats(state)})
        return
    dpl["active"] = dpl["bench"].pop(0)
    _emit(state, {"type": "promote", "player": defender, "uid": dpl["active"]["uid"]})
    _offer_discover(state, attacker)


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
    _emit(state, {"type": "game_over", "winner": state["winner"], "reason": "forfeit", "by": pid, "stats": _match_stats(state)})


def cpu_choose(state: dict[str, Any], pid: str) -> dict[str, Any] | None:
    """Softer CPU: fewer benches, sometimes skip evolve, sometimes pass without attack."""
    if state["phase"] == "ended":
        return None
    pl = state["players"][pid]
    rng: random.Random = state.get("rng") or random.Random()

    pc = state.get("pendingChoice")
    if pc and pc.get("player") == pid and pc.get("type") == "discover_item":
        opt = rng.choice(pc["options"])
        return {"type": "choose_discover", "uid": opt["uid"]}
    if pc:
        return None

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

    # Use smoke when threatened (low HP) or sometimes just to be cheeky.
    if (
        pl.get("items")
        and not pl.get("itemUsedThisTurn")
        and not pl.get("skipNextAttack")
    ):
        smoke = next((it for it in pl["items"] if it["itemId"] == "smoke"), None)
        if smoke:
            use_chance = 0.55
            if pl["active"]:
                meta = CATALOG["cards"][pl["active"]["cardId"]]
                cur_hp = meta["hp"] - pl["active"]["damage"]
                if cur_hp <= meta["hp"] * 0.45:
                    use_chance = 0.85
            if rng.random() < use_chance:
                return {"type": "use_item", "uid": smoke["uid"]}

    # Already attacked this turn → end (keeps turn tension for humans, tidy for CPU).
    if pl.get("attackedThisTurn"):
        return {"type": "end_turn"}

    if pl["active"] and _can_attack_now(state, pid):
        if rng.random() < 0.12:
            return {"type": "end_turn"}
        atk = _primary_attack(CATALOG["cards"][pl["active"]["cardId"]])
        return {"type": "attack", "attackId": atk["id"]}

    return {"type": "end_turn"}
