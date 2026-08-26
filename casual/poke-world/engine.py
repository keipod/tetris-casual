"""포켓몬월드 — authoritative board-game engine (2–4 players)."""

from __future__ import annotations

import logging
import random
import uuid
from typing import Any

log = logging.getLogger("poke-world")

BADGES_TO_WIN = 3
BOARD_SIZE = 24
START_COINS = 5
START_HP_HEAL = 20
MAX_ITEMS = 5

TYPE_KO = {
    "fire": "불",
    "water": "물",
    "grass": "풀",
    "electric": "전기",
    "psychic": "에스퍼",
    "fighting": "격투",
}

TYPE_CHART: dict[str, dict[str, float]] = {
    "fire": {"grass": 1.5, "water": 0.75, "fire": 0.75},
    "water": {"fire": 1.5, "grass": 0.75, "water": 0.75},
    "grass": {"water": 1.5, "fire": 0.75, "grass": 0.75},
    "electric": {"water": 1.5, "grass": 0.75, "electric": 0.75},
    "psychic": {"fighting": 1.5, "psychic": 0.75},
    "fighting": {"psychic": 0.75, "fighting": 0.75},
}

ABILITIES = {
    "blaze": {"name": "맹화", "desc": "HP 절반 이하 공격 +8"},
    "torrent": {"name": "급류", "desc": "HP 절반 이하 공격 +8"},
    "overgrow": {"name": "심록", "desc": "HP 절반 이하 공격 +8"},
    "static": {"name": "정전기", "desc": "피격 시 30% 상대 공격 -6"},
    "focus": {"name": "집중력", "desc": "첫 공격 +10"},
    "regenerate": {"name": "재생력", "desc": "턴 시작 HP +8"},
    "intimidate": {"name": "위협", "desc": "전투 시작 상대 공격 -6"},
    "sturdy": {"name": "옹골참", "desc": "치명타 시 HP 1 (1회)"},
    "keen_eye": {"name": "날카로운눈", "desc": "상성 ×1.15"},
    "guts": {"name": "근성", "desc": "상태이상 시 공격 +12"},
    "adapt": {"name": "날카로운눈", "desc": "상성 ×1.15"},
}

POKEMON: list[dict[str, Any]] = [
    {"id": "bulbasaur", "dex": 1, "name": "이상해씨", "type": "grass", "hp": 72, "atk": 22, "def": 20, "ability": "overgrow"},
    {"id": "charmander", "dex": 4, "name": "파이리", "type": "fire", "hp": 68, "atk": 26, "def": 16, "ability": "blaze"},
    {"id": "squirtle", "dex": 7, "name": "꼬부기", "type": "water", "hp": 74, "atk": 20, "def": 24, "ability": "torrent"},
    {"id": "pikachu", "dex": 25, "name": "피카츄", "type": "electric", "hp": 66, "atk": 28, "def": 14, "ability": "static"},
    {"id": "eevee", "dex": 133, "name": "이브이", "type": "fighting", "hp": 70, "atk": 22, "def": 20, "ability": "adapt"},
    {"id": "abra", "dex": 63, "name": "캐이시", "type": "psychic", "hp": 58, "atk": 30, "def": 12, "ability": "focus"},
    {"id": "machop", "dex": 66, "name": "알통몬", "type": "fighting", "hp": 76, "atk": 28, "def": 18, "ability": "guts"},
    {"id": "growlithe", "dex": 58, "name": "가디", "type": "fire", "hp": 70, "atk": 27, "def": 17, "ability": "intimidate"},
    {"id": "psyduck", "dex": 54, "name": "고라파덕", "type": "water", "hp": 72, "atk": 21, "def": 19, "ability": "regenerate"},
    {"id": "oddish", "dex": 43, "name": "뚜벅쵸", "type": "grass", "hp": 68, "atk": 23, "def": 19, "ability": "regenerate"},
    {"id": "magnemite", "dex": 81, "name": "코일", "type": "electric", "hp": 60, "atk": 24, "def": 26, "ability": "sturdy"},
    {"id": "slowpoke", "dex": 79, "name": "야돈", "type": "psychic", "hp": 80, "atk": 18, "def": 22, "ability": "regenerate"},
]
POKE_BY_ID = {p["id"]: p for p in POKEMON}

ITEMS: dict[str, dict[str, str]] = {
    "potion": {"id": "potion", "name": "상처약", "desc": "HP 30 회복", "icon": "🧪"},
    "super_potion": {"id": "super_potion", "name": "좋은상처약", "desc": "HP 55 회복", "icon": "💊"},
    "x_attack": {"id": "x_attack", "name": "플러스파워", "desc": "이번 전투 공격 +12", "icon": "⚔️"},
    "x_defense": {"id": "x_defense", "name": "디펜드업", "desc": "이번 전투 방어 +12", "icon": "🛡️"},
    "full_heal": {"id": "full_heal", "name": "만병통치제", "desc": "상태이상 해제", "icon": "✨"},
    "escape_rope": {"id": "escape_rope", "name": "탈출로프", "desc": "야생에서 도망", "icon": "🪢"},
    "smoke_ball": {"id": "smoke_ball", "name": "연막탄", "desc": "다음 피격 1회 무효", "icon": "💨"},
    "rare_candy": {"id": "rare_candy", "name": "이상한사탕", "desc": "공격·방어 각 +3", "icon": "🍬"},
    "repel": {"id": "repel", "name": "벌레회피스프레이", "desc": "다음 야생 스킵", "icon": "🧴"},
    "coin_bag": {"id": "coin_bag", "name": "동전주머니", "desc": "코인 +8", "icon": "💰"},
    "focus_band": {"id": "focus_band", "name": "기합의머리띠", "desc": "이번 전투 옹골참 1회", "icon": "🎀"},
    "type_charm": {"id": "type_charm", "name": "타입부적", "desc": "이번 전투 상성 ×1.35", "icon": "🔮"},
    "moomoo": {"id": "moomoo", "name": "튼튼밀크", "desc": "HP 전부 회복", "icon": "🥛"},
    "dire_hit": {"id": "dire_hit", "name": "크리티컬커터", "desc": "다음 공격 +15", "icon": "🎯"},
}
ITEM_DROP_POOL = list(ITEMS.keys())
SHOP_STOCK = ["potion", "super_potion", "x_attack", "x_defense", "rare_candy", "smoke_ball", "moomoo", "dire_hit"]
SHOP_PRICE = {
    "potion": 4,
    "super_potion": 7,
    "x_attack": 5,
    "x_defense": 5,
    "rare_candy": 10,
    "smoke_ball": 6,
    "moomoo": 9,
    "dire_hit": 6,
}
BUFF_ITEMS = {"x_attack", "x_defense", "smoke_ball", "type_charm", "dire_hit", "focus_band", "rare_candy", "coin_bag", "repel"}

GYM_LEADERS = [
    {"id": "gym_fire", "badge": "fire", "name": "민화 관장", "mon": {"name": "리자드", "dex": 5, "type": "fire", "hp": 78, "atk": 28, "def": 18, "ability": "blaze"}},
    {"id": "gym_water", "badge": "water", "name": "이슬 관장", "mon": {"name": "어니부기", "dex": 8, "type": "water", "hp": 82, "atk": 24, "def": 24, "ability": "torrent"}},
    {"id": "gym_grass", "badge": "grass", "name": "민화숲 관장", "mon": {"name": "이상해풀", "dex": 2, "type": "grass", "hp": 80, "atk": 26, "def": 22, "ability": "overgrow"}},
    {"id": "gym_electric", "badge": "electric", "name": "마슈 관장", "mon": {"name": "라이츄", "dex": 26, "type": "electric", "hp": 76, "atk": 30, "def": 16, "ability": "static"}},
]

BOARD = [
    {"kind": "start", "name": "스타트", "hint": "통과 시 HP 회복"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "item", "name": "아이템", "hint": "아이템 획득"},
    {"kind": "event", "name": "이벤트", "hint": "랜덤 사건"},
    {"kind": "gym", "gymIndex": 0, "name": "불꽃체육관", "hint": "배지 도전"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "shop", "name": "상점", "hint": "코인으로 구매"},
    {"kind": "duel", "name": "시합장", "hint": "다른 트레이너와 대결"},
    {"kind": "rest", "name": "포켓몬센터", "hint": "HP 회복"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "item", "name": "아이템", "hint": "아이템 획득"},
    {"kind": "gym", "gymIndex": 1, "name": "물체육관", "hint": "배지 도전"},
    {"kind": "event", "name": "이벤트", "hint": "랜덤 사건"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "duel", "name": "시합장", "hint": "다른 트레이너와 대결"},
    {"kind": "item", "name": "아이템", "hint": "아이템 획득"},
    {"kind": "gym", "gymIndex": 2, "name": "풀체육관", "hint": "배지 도전"},
    {"kind": "shop", "name": "상점", "hint": "코인으로 구매"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "event", "name": "이벤트", "hint": "랜덤 사건"},
    {"kind": "rest", "name": "포켓몬센터", "hint": "HP 회복"},
    {"kind": "gym", "gymIndex": 3, "name": "전기체육관", "hint": "배지 도전"},
    {"kind": "wild", "name": "풀숲", "hint": "야생 포켓몬!"},
    {"kind": "duel", "name": "시합장", "hint": "다른 트레이너와 대결"},
]

PLAYER_COLORS = ["#e85d4c", "#3b82f6", "#22a06b", "#f5a524"]


def _emit(state: dict[str, Any], ev: dict[str, Any]) -> None:
    state.setdefault("_events", []).append(ev)


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    ev = state.get("_events") or []
    state["_events"] = []
    return ev


def _rng(state: dict[str, Any]) -> random.Random:
    state["rollCount"] = int(state.get("rollCount") or 0) + 1
    return random.Random((int(state["seed"]) ^ (state["rollCount"] * 2654435761)) & 0xFFFFFFFF)


def _push_log(state: dict[str, Any], msg: str) -> None:
    state["log"].insert(0, msg)
    if len(state["log"]) > 40:
        state["log"] = state["log"][:40]
    _emit(state, {"type": "log", "text": msg})


def _ability_id(raw: str) -> str:
    return "keen_eye" if raw == "adapt" else raw


def _clone_mon(base: dict[str, Any], scale: float = 1.0) -> dict[str, Any]:
    return {
        "id": base.get("id") or base["name"],
        "name": base["name"],
        "dex": base["dex"],
        "type": base["type"],
        "hp": int(round(base["hp"] * scale)),
        "maxHp": int(round(base["hp"] * scale)),
        "atk": int(round(base["atk"] * scale)),
        "def": int(round(base["def"] * scale)),
        "ability": _ability_id(base.get("ability") or "focus"),
        "status": None,
        "sturdyUsed": False,
        "battle": {
            "atkBonus": 0,
            "defBonus": 0,
            "smoke": False,
            "typeCharm": False,
            "direHit": False,
            "firstAtk": True,
            "focusBand": False,
        },
    }


def _heal(mon: dict[str, Any], n: int) -> None:
    mon["hp"] = min(mon["maxHp"], mon["hp"] + n)


def _hurt(mon: dict[str, Any], n: int) -> None:
    mon["hp"] = max(0, mon["hp"] - n)


def _give_item(player: dict[str, Any], item_id: str) -> bool:
    if item_id not in ITEMS or len(player["items"]) >= MAX_ITEMS:
        return False
    player["items"].append(item_id)
    return True


def _type_mult(atk: str, deftype: str, keen: bool) -> float:
    if keen:
        return 1.15
    return TYPE_CHART.get(atk, {}).get(deftype, 1.0)


def _ability_atk(mon: dict[str, Any]) -> int:
    half = mon["hp"] <= mon["maxHp"] / 2
    ab = mon["ability"]
    if ab in ("blaze", "torrent", "overgrow") and half:
        return 8
    if ab == "guts" and mon.get("status"):
        return 12
    return 0


def _eff_atk(mon: dict[str, Any]) -> int:
    return mon["atk"] + int(mon["battle"].get("atkBonus") or 0) + _ability_atk(mon)


def _eff_def(mon: dict[str, Any]) -> int:
    return mon["def"] + int(mon["battle"].get("defBonus") or 0)


def _reset_battle(mon: dict[str, Any]) -> None:
    mon["battle"] = {
        "atkBonus": 0,
        "defBonus": 0,
        "smoke": False,
        "typeCharm": False,
        "direHit": False,
        "firstAtk": True,
        "focusBand": False,
    }
    mon["sturdyUsed"] = False


def _apply_damage(target: dict[str, Any], amount: int) -> dict[str, Any]:
    b = target["battle"]
    if b.get("smoke"):
        b["smoke"] = False
        return {"blocked": True, "damage": 0}
    if target["hp"] - amount <= 0 and target["ability"] == "sturdy" and not target.get("sturdyUsed"):
        target["sturdyUsed"] = True
        target["hp"] = 1
        return {"blocked": False, "damage": amount, "sturdy": True}
    if b.get("focusBand"):
        b["focusBand"] = False
        if target["hp"] - amount <= 0:
            target["hp"] = 1
            return {"blocked": False, "damage": amount, "sturdy": True}
    _hurt(target, amount)
    return {"blocked": False, "damage": amount}


def _calc_damage(attacker: dict[str, Any], defender: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    keen = attacker["ability"] == "keen_eye"
    mult = _type_mult(attacker["type"], defender["type"], keen)
    if attacker["battle"].get("typeCharm"):
        mult *= 1.35
    raw = max(5, _eff_atk(attacker) - _eff_def(defender) // 2)
    dmg = int(round(raw * mult)) + rng.randint(0, 4)
    if attacker["battle"].get("firstAtk") and attacker["ability"] == "focus":
        dmg += 10
    if attacker["battle"].get("direHit"):
        dmg += 15
        attacker["battle"]["direHit"] = False
    if attacker.get("status") == "confuse" and rng.random() < 0.25:
        return {"damage": max(1, dmg // 2), "confuseSelf": True, "mult": mult}
    return {"damage": dmg, "confuseSelf": False, "mult": mult}


def _alive_players(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [state["players"][pid] for pid in state["order"] if not state["players"][pid].get("eliminated")]


def _current(state: dict[str, Any]) -> dict[str, Any]:
    return state["players"][state["turn"]]


def new_match(player_specs: list[dict[str, Any]], seed: int | None = None) -> dict[str, Any]:
    if not 2 <= len(player_specs) <= 4:
        raise ValueError("2–4 players required")
    seed = int(seed if seed is not None else uuid.uuid4().int & 0xFFFFFFFF)
    rng = random.Random(seed)
    players: dict[str, Any] = {}
    order: list[str] = []
    for i, spec in enumerate(player_specs):
        pid = spec["id"]
        base = POKE_BY_ID.get(spec.get("pokemonId") or "") or rng.choice(POKEMON)
        players[pid] = {
            "id": pid,
            "nick": (spec.get("nick") or f"플레이어{i+1}")[:12],
            "color": PLAYER_COLORS[i],
            "isCpu": bool(spec.get("isCpu")),
            "pos": 0,
            "coins": START_COINS,
            "badges": [],
            "items": ["potion"],
            "mon": _clone_mon(base),
            "flags": {"slowNext": False, "boostDice": False, "repel": False},
            "skipped": False,
            "eliminated": False,
            "index": i,
        }
        order.append(pid)
    state: dict[str, Any] = {
        "id": uuid.uuid4().hex[:10],
        "phase": "playing",
        "turn": order[0],
        "order": order,
        "players": players,
        "lastDice": None,
        "awaitingRoll": True,
        "battle": None,
        "shopOffers": None,
        "pendingDuel": None,
        "winnerId": None,
        "log": ["모험을 시작해요! 배지 3개를 먼저 모으세요."],
        "seed": seed,
        "rollCount": 0,
        "_events": [{"type": "match_start"}],
    }
    return state


def _check_win(state: dict[str, Any], player: dict[str, Any]) -> bool:
    if len(player["badges"]) >= BADGES_TO_WIN:
        state["phase"] = "ended"
        state["winnerId"] = player["id"]
        _push_log(state, f"{player['nick']}이(가) 배지 {BADGES_TO_WIN}개로 우승!")
        _emit(state, {"type": "win", "player": player["id"]})
        return True
    alive = _alive_players(state)
    if len(alive) == 1:
        state["phase"] = "ended"
        state["winnerId"] = alive[0]["id"]
        _push_log(state, f"{alive[0]['nick']}이(가) 마지막 생존자로 우승!")
        _emit(state, {"type": "win", "player": alive[0]["id"]})
        return True
    return False


def _advance_turn(state: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        return
    n = len(state["order"])
    for _ in range(n):
        idx = state["order"].index(state["turn"])
        state["turn"] = state["order"][(idx + 1) % n]
        p = _current(state)
        if p.get("eliminated"):
            continue
        if p.get("skipped"):
            p["skipped"] = False
            continue
        break
    state["phase"] = "playing"
    state["awaitingRoll"] = True
    state["battle"] = None
    state["shopOffers"] = None
    state["pendingDuel"] = None
    p = _current(state)
    if p["mon"]["ability"] == "regenerate" and p["mon"]["hp"] > 0:
        _heal(p["mon"], 8)
    _push_log(state, f"—— {p['nick']} 차례 ——")
    _emit(state, {"type": "turn", "player": p["id"]})


def _begin_battle(state: dict[str, Any], spec: dict[str, Any]) -> None:
    p = _current(state)
    _reset_battle(p["mon"])
    _reset_battle(spec["foe"])
    if p["mon"]["ability"] == "intimidate":
        spec["foe"]["battle"]["atkBonus"] -= 6
    if spec["foe"]["ability"] == "intimidate":
        p["mon"]["battle"]["atkBonus"] -= 6
    state["phase"] = "battle"
    state["battle"] = {**spec, "turn": "player", "log": []}
    _emit(state, {"type": "battle_start", "kind": spec["kind"]})


def _battle_log(state: dict[str, Any], msg: str) -> None:
    b = state.get("battle")
    if b is not None:
        b["log"].insert(0, msg)
        if len(b["log"]) > 12:
            b["log"] = b["log"][:12]
    _push_log(state, msg)


def _do_strike(state: dict[str, Any], attacker: dict[str, Any], defender: dict[str, Any], rng: random.Random) -> None:
    result = _calc_damage(attacker, defender, rng)
    attacker["battle"]["firstAtk"] = False
    if result["confuseSelf"]:
        _apply_damage(attacker, result["damage"])
        _battle_log(state, f"{attacker['name']}은(는) 혼란에 빠져 자해! -{result['damage']}")
        return
    hit = _apply_damage(defender, result["damage"])
    if hit.get("blocked"):
        _battle_log(state, f"{defender['name']}: 연막으로 피했어요!")
        return
    tag = " 효과는 굉장했다!" if result["mult"] > 1.1 else (" 효과가 별로…" if result["mult"] < 0.9 else "")
    _battle_log(state, f"{attacker['name']}의 공격! {defender['name']}에게 {hit['damage']}{tag}")
    if hit.get("sturdy"):
        _battle_log(state, f"{defender['name']}은(는) 버텼다!")
    if defender["hp"] > 0 and defender["ability"] == "static" and rng.random() < 0.3:
        attacker["battle"]["atkBonus"] -= 6
        _battle_log(state, f"정전기! {attacker['name']}의 공격이 떨어졌어요")


def _finish_battle(state: dict[str, Any], player_won: bool, rng: random.Random) -> None:
    p = _current(state)
    b = state["battle"]
    if player_won:
        reward = int(b.get("rewardCoins") or 0)
        p["coins"] += reward
        _battle_log(state, f"승리! 코인 +{reward}")
        badge = b.get("gymBadge")
        if b.get("kind") == "gym" and badge and badge not in p["badges"]:
            p["badges"].append(badge)
            _battle_log(state, f"{TYPE_KO[badge]} 배지 획득! ({len(p['badges'])}/{BADGES_TO_WIN})")
            if _check_win(state, p):
                state["battle"] = None
                return
        if b.get("kind") == "wild" and rng.random() < float(b.get("rewardItemChance") or 0):
            iid = rng.choice(ITEM_DROP_POOL)
            if _give_item(p, iid):
                _battle_log(state, f"전리품 {ITEMS[iid]['name']}!")
        if b.get("kind") == "duel" and b.get("duelTargetId"):
            t = state["players"].get(b["duelTargetId"])
            if t and not t.get("eliminated"):
                steal = min(3, t["coins"])
                t["coins"] -= steal
                p["coins"] += steal
                _battle_log(state, f"{t['nick']}에게서 코인 {steal} 획득")
    else:
        _battle_log(state, f"{p['mon']['name']}이(가) 기절…")
        p["mon"]["hp"] = max(1, p["mon"]["maxHp"] * 35 // 100)
        p["mon"]["status"] = None
        p["coins"] = max(0, p["coins"] - 2)
        if b.get("kind") == "duel":
            p["skipped"] = True
            _battle_log(state, "패배로 다음 턴을 쉽니다")
    state["battle"] = None
    if state["phase"] != "ended":
        _advance_turn(state)


def _foe_strike(state: dict[str, Any]) -> None:
    if state["phase"] != "battle" or not state.get("battle"):
        return
    p = _current(state)
    rng = _rng(state)
    _do_strike(state, state["battle"]["foe"], p["mon"], rng)
    if state["phase"] != "battle":
        return
    if p["mon"]["hp"] <= 0:
        _finish_battle(state, False, rng)
        return
    state["battle"]["turn"] = "player"


def _start_wild(state: dict[str, Any], rng: random.Random) -> None:
    base = rng.choice(POKEMON)
    scale = 0.85 + rng.random() * 0.35
    foe = _clone_mon(base, scale)
    foe["name"] = f"야생 {foe['name']}"
    _begin_battle(
        state,
        {
            "kind": "wild",
            "foe": foe,
            "canFlee": True,
            "rewardCoins": rng.randint(2, 5),
            "rewardItemChance": 0.45,
        },
    )
    _push_log(state, f"야생의 {base['name']}이(가) 나타났어요!")


def _start_gym(state: dict[str, Any], gym_index: int) -> None:
    p = _current(state)
    gym = GYM_LEADERS[gym_index]
    if gym["badge"] in p["badges"]:
        _push_log(state, f"이미 {TYPE_KO[gym['badge']]} 배지를 가지고 있어요. 코인 +3")
        p["coins"] += 3
        _advance_turn(state)
        return
    foe = _clone_mon(gym["mon"], 1.0)
    _begin_battle(
        state,
        {
            "kind": "gym",
            "foe": foe,
            "canFlee": False,
            "gymBadge": gym["badge"],
            "gymName": gym["name"],
            "rewardCoins": 8,
        },
    )
    _push_log(state, f"{gym['name']}의 도전! ({TYPE_KO[gym['badge']]} 배지)")


def _apply_event(state: dict[str, Any], rng: random.Random) -> None:
    p = _current(state)
    events = [
        ("길에서 동전을 주웠어요! +5코인", lambda: p.__setitem__("coins", p["coins"] + 5)),
        ("나무열매를 먹었어요. HP +25", lambda: _heal(p["mon"], 25)),
        ("돌부리에 걸려 삐었어요. HP -15", lambda: _hurt(p["mon"], 15)),
        ("오박사가 사탕을 줬어요! 공격+2 방어+2", lambda: (p["mon"].__setitem__("atk", p["mon"]["atk"] + 2), p["mon"].__setitem__("def", p["mon"]["def"] + 2))),
        ("폭풍! 다음 이동 -2", lambda: p["flags"].__setitem__("slowNext", True)),
        ("기분 좋은 햇살. 다음 주사위 +1", lambda: p["flags"].__setitem__("boostDice", True)),
        ("지나가는 트레이너가 아이템을 줬어요!", lambda: _give_item(p, rng.choice(ITEM_DROP_POOL))),
        ("자전거 대여비… -3코인", lambda: p.__setitem__("coins", max(0, p["coins"] - 3))),
        ("간호순이 치료해줬어요. HP 전부 회복", lambda: (p["mon"].__setitem__("hp", p["mon"]["maxHp"]), p["mon"].__setitem__("status", None))),
        ("길을 헤맸어요. 상태: 혼란", lambda: p["mon"].__setitem__("status", "confuse")),
        ("지름길 발견! 앞으로 3칸", lambda: p.__setitem__("pos", (p["pos"] + 3) % BOARD_SIZE)),
        ("공사 중… 뒤로 2칸", lambda: p.__setitem__("pos", (p["pos"] - 2 + BOARD_SIZE) % BOARD_SIZE)),
    ]
    text, fn = rng.choice(events)
    fn()
    _push_log(state, text)


def _resolve_tile(state: dict[str, Any], rng: random.Random) -> None:
    p = _current(state)
    tile = BOARD[p["pos"]]
    _push_log(state, f"{p['nick']} → {tile['name']}")
    kind = tile["kind"]
    if kind == "start":
        _heal(p["mon"], 30)
        _push_log(state, "스타트에서 푹 쉬어요. HP +30")
        _advance_turn(state)
    elif kind == "rest":
        _heal(p["mon"], 40)
        p["mon"]["status"] = None
        _push_log(state, "포켓몬센터! HP +40")
        _advance_turn(state)
    elif kind == "item":
        iid = rng.choice(ITEM_DROP_POOL)
        if _give_item(p, iid):
            _push_log(state, f"{ITEMS[iid]['name']} 획득!")
        else:
            _push_log(state, "가방이 가득 찼어요")
        _advance_turn(state)
    elif kind == "shop":
        offers = SHOP_STOCK[:]
        rng.shuffle(offers)
        state["phase"] = "shop"
        state["shopOffers"] = offers[:3]
        _push_log(state, "상점입니다. 살 물건을 고르거나 나가세요.")
    elif kind == "event":
        _apply_event(state, rng)
        _advance_turn(state)
    elif kind == "wild":
        if p["flags"].get("repel"):
            p["flags"]["repel"] = False
            _push_log(state, "스프레이 덕분에 야생이 오지 않았어요")
            _advance_turn(state)
        else:
            _start_wild(state, rng)
    elif kind == "gym":
        _start_gym(state, int(tile["gymIndex"]))
    elif kind == "duel":
        others = [o for o in _alive_players(state) if o["id"] != p["id"] and o["mon"]["hp"] > 0]
        if not others:
            _push_log(state, "대결할 상대가 없어요")
            _advance_turn(state)
        else:
            state["phase"] = "duel_pick"
            state["pendingDuel"] = {"candidates": [o["id"] for o in others]}
            _push_log(state, "시합장! 대결할 트레이너를 고르세요")
    else:
        _advance_turn(state)


def _roll(state: dict[str, Any]) -> None:
    if state["phase"] != "playing" or not state.get("awaitingRoll"):
        raise ValueError("지금은 주사위를 굴릴 수 없어요")
    p = _current(state)
    rng = _rng(state)
    dice = rng.randint(1, 6)
    if p["flags"].get("boostDice"):
        dice = min(6, dice + 1)
        p["flags"]["boostDice"] = False
    if p["flags"].get("slowNext"):
        dice = max(1, dice - 2)
        p["flags"]["slowNext"] = False
    state["lastDice"] = dice
    state["awaitingRoll"] = False
    _push_log(state, f"{p['nick']}: 주사위 {dice}!")
    _emit(state, {"type": "dice", "player": p["id"], "value": dice})
    frm = p["pos"]
    p["pos"] = (p["pos"] + dice) % BOARD_SIZE
    if frm + dice >= BOARD_SIZE:
        _heal(p["mon"], START_HP_HEAL)
        p["coins"] += 2
        _push_log(state, f"{p['nick']}이(가) 스타트 통과! HP 회복 · 코인 +2")
    _resolve_tile(state, rng)


def _attack(state: dict[str, Any]) -> None:
    if state["phase"] != "battle" or not state.get("battle") or state["battle"]["turn"] != "player":
        raise ValueError("지금은 공격할 수 없어요")
    p = _current(state)
    rng = _rng(state)
    _do_strike(state, p["mon"], state["battle"]["foe"], rng)
    if state["phase"] != "battle":
        return
    if state["battle"]["foe"]["hp"] <= 0:
        _finish_battle(state, True, rng)
        return
    state["battle"]["turn"] = "foe"
    _foe_strike(state)


def _flee(state: dict[str, Any]) -> None:
    if state["phase"] != "battle" or not state.get("battle") or not state["battle"].get("canFlee"):
        raise ValueError("도망칠 수 없어요")
    p = _current(state)
    if "escape_rope" in p["items"]:
        p["items"].remove("escape_rope")
        _battle_log(state, "탈출로프로 도망쳤어요!")
        state["battle"] = None
        _advance_turn(state)
        return
    rng = _rng(state)
    if rng.random() < 0.55:
        _battle_log(state, "무사히 도망쳤어요!")
        state["battle"] = None
        _advance_turn(state)
        return
    _battle_log(state, "도망치지 못했어요!")
    state["battle"]["turn"] = "foe"
    _foe_strike(state)


def _use_item(state: dict[str, Any], item_id: str) -> None:
    p = _current(state)
    if item_id not in p["items"]:
        raise ValueError("아이템이 없어요")
    item = ITEMS.get(item_id)
    if not item:
        raise ValueError("알 수 없는 아이템")
    in_battle = state["phase"] == "battle"
    if state["phase"] not in ("playing", "battle"):
        raise ValueError("지금은 쓸 수 없어요")
    if state["phase"] == "playing" and not state.get("awaitingRoll"):
        raise ValueError("자기 턴 시작에만 쓸 수 있어요")

    battle_only = {"x_attack", "x_defense", "smoke_ball", "type_charm", "dire_hit", "focus_band", "escape_rope"}
    if item_id in battle_only and not in_battle:
        raise ValueError("전투 중에만 쓸 수 있어요")

    if item_id == "escape_rope":
        _flee(state)
        return

    p["items"].remove(item_id)
    mon = p["mon"]
    if item_id == "potion":
        _heal(mon, 30)
    elif item_id == "super_potion":
        _heal(mon, 55)
    elif item_id == "moomoo":
        mon["hp"] = mon["maxHp"]
    elif item_id == "full_heal":
        mon["status"] = None
    elif item_id == "x_attack":
        mon["battle"]["atkBonus"] += 12
    elif item_id == "x_defense":
        mon["battle"]["defBonus"] += 12
    elif item_id == "smoke_ball":
        mon["battle"]["smoke"] = True
    elif item_id == "type_charm":
        mon["battle"]["typeCharm"] = True
    elif item_id == "dire_hit":
        mon["battle"]["direHit"] = True
    elif item_id == "focus_band":
        mon["battle"]["focusBand"] = True
    elif item_id == "rare_candy":
        mon["atk"] += 3
        mon["def"] += 3
    elif item_id == "coin_bag":
        p["coins"] += 8
    elif item_id == "repel":
        p["flags"]["repel"] = True
    else:
        raise ValueError("쓸 수 없는 아이템")

    msg = f"{item['name']} 사용!"
    if in_battle:
        _battle_log(state, msg)
    else:
        _push_log(state, msg)

    spends = item_id in ("potion", "super_potion", "moomoo", "full_heal")
    if in_battle and spends and state.get("battle") and state["battle"]["turn"] == "player":
        state["battle"]["turn"] = "foe"
        _foe_strike(state)


def apply_action(state: dict[str, Any], player_id: str, action: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        raise ValueError("match ended")
    if player_id != state["turn"]:
        raise ValueError("your turn이 아닙니다")
    p = state["players"].get(player_id)
    if not p or p.get("eliminated"):
        raise ValueError("플레이할 수 없어요")

    typ = (action or {}).get("type")
    if typ == "roll":
        _roll(state)
    elif typ == "attack":
        _attack(state)
    elif typ == "flee":
        _flee(state)
    elif typ == "use_item":
        _use_item(state, str(action.get("itemId") or ""))
    elif typ == "shop_buy":
        if state["phase"] != "shop":
            raise ValueError("상점이 아니에요")
        iid = str(action.get("itemId") or "")
        if iid not in (state.get("shopOffers") or []):
            raise ValueError("판매 중이 아니에요")
        price = SHOP_PRICE.get(iid, 99)
        if p["coins"] < price:
            raise ValueError("코인이 부족해요")
        if len(p["items"]) >= MAX_ITEMS:
            raise ValueError("가방이 가득 찼어요")
        p["coins"] -= price
        _give_item(p, iid)
        _push_log(state, f"{ITEMS[iid]['name']} 구매 (−{price}코인)")
    elif typ == "shop_leave":
        if state["phase"] != "shop":
            raise ValueError("상점이 아니에요")
        _advance_turn(state)
    elif typ == "duel_pick":
        if state["phase"] != "duel_pick":
            raise ValueError("시합장이 아니에요")
        tid = str(action.get("targetId") or "")
        if tid not in (state.get("pendingDuel") or {}).get("candidates", []):
            raise ValueError("잘못된 상대")
        target = state["players"][tid]
        foe = _clone_mon(
            {
                "name": target["mon"]["name"],
                "dex": target["mon"]["dex"],
                "type": target["mon"]["type"],
                "hp": max(40, target["mon"]["maxHp"] * 70 // 100),
                "atk": target["mon"]["atk"],
                "def": target["mon"]["def"],
                "ability": target["mon"]["ability"],
            }
        )
        foe["name"] = f"{target['nick']}의 {target['mon']['name']}"
        _begin_battle(
            state,
            {"kind": "duel", "foe": foe, "canFlee": False, "duelTargetId": tid, "rewardCoins": 6},
        )
        _push_log(state, f"{p['nick']} VS {target['nick']}!")
    elif typ == "duel_skip":
        if state["phase"] != "duel_pick":
            raise ValueError("시합장이 아니에요")
        _push_log(state, "오늘은 대결을 건너뛰었어요")
        _advance_turn(state)
    else:
        raise ValueError("알 수 없는 행동")


def forfeit(state: dict[str, Any], player_id: str) -> None:
    p = state["players"].get(player_id)
    if not p or p.get("eliminated"):
        return
    p["eliminated"] = True
    _push_log(state, f"{p['nick']}이(가) 기권했습니다")
    if state["phase"] == "ended":
        return
    if _check_win(state, p):  # may crown last survivor
        return
    alive = _alive_players(state)
    if not alive:
        state["phase"] = "ended"
        return
    if state["turn"] == player_id:
        # clear mid-action and advance
        state["battle"] = None
        state["shopOffers"] = None
        state["pendingDuel"] = None
        state["turn"] = alive[0]["id"]
        _advance_turn(state)
    elif state["phase"] == "duel_pick" and state.get("pendingDuel"):
        cands = [c for c in state["pendingDuel"]["candidates"] if c != player_id]
        state["pendingDuel"]["candidates"] = cands
        if not cands:
            _advance_turn(state)


def cpu_choose(state: dict[str, Any], cpu_id: str) -> dict[str, Any] | None:
    if state["phase"] == "ended" or state["turn"] != cpu_id:
        return None
    p = state["players"][cpu_id]
    if p.get("eliminated"):
        return None
    if state["phase"] == "playing" and state.get("awaitingRoll"):
        return {"type": "roll"}
    if state["phase"] == "shop":
        offers = state.get("shopOffers") or []
        affordable = [i for i in offers if SHOP_PRICE.get(i, 99) <= p["coins"] and len(p["items"]) < MAX_ITEMS]
        if affordable and p["coins"] >= 6:
            prefer = next((i for i in affordable if i in ("rare_candy", "moomoo")), affordable[0])
            return {"type": "shop_buy", "itemId": prefer}
        return {"type": "shop_leave"}
    if state["phase"] == "duel_pick":
        ids = (state.get("pendingDuel") or {}).get("candidates") or []
        if ids and random.random() < 0.7:
            best = max(ids, key=lambda i: len(state["players"][i]["badges"]) * 10 + state["players"][i]["coins"])
            return {"type": "duel_pick", "targetId": best}
        return {"type": "duel_skip"}
    if state["phase"] == "battle" and state.get("battle") and state["battle"]["turn"] == "player":
        foe = state["battle"]["foe"]
        mult = _type_mult(p["mon"]["type"], foe["type"], p["mon"]["ability"] == "keen_eye")
        if p["mon"]["hp"] < p["mon"]["maxHp"] * 0.28 and "super_potion" in p["items"]:
            return {"type": "use_item", "itemId": "super_potion"}
        if p["mon"]["hp"] < p["mon"]["maxHp"] * 0.32 and "potion" in p["items"]:
            return {"type": "use_item", "itemId": "potion"}
        if mult < 0.85 and state["battle"].get("canFlee") and random.random() < 0.35:
            return {"type": "flee"}
        if mult >= 1.4 and "dire_hit" in p["items"] and not p["mon"]["battle"].get("direHit"):
            return {"type": "use_item", "itemId": "dire_hit"}
        if "x_attack" in p["items"] and int(p["mon"]["battle"].get("atkBonus") or 0) < 12:
            return {"type": "use_item", "itemId": "x_attack"}
        return {"type": "attack"}
    return None


def view_for(state: dict[str, Any], viewer_id: str) -> dict[str, Any]:
    def mon_pub(m: dict[str, Any], battle_eff: bool = False) -> dict[str, Any]:
        out = {
            "name": m["name"],
            "dex": m["dex"],
            "type": m["type"],
            "hp": m["hp"],
            "maxHp": m["maxHp"],
            "atk": _eff_atk(m) if battle_eff else m["atk"],
            "def": _eff_def(m) if battle_eff else m["def"],
            "ability": m["ability"],
            "abilityName": ABILITIES.get(m["ability"], {}).get("name", m["ability"]),
            "status": m.get("status"),
        }
        return out

    battle = None
    if state.get("battle"):
        b = state["battle"]
        battle = {
            "kind": b["kind"],
            "canFlee": b.get("canFlee"),
            "turn": b["turn"],
            "gymBadge": b.get("gymBadge"),
            "gymName": b.get("gymName"),
            "foe": mon_pub(b["foe"], True),
            "log": list(b.get("log") or []),
        }

    return {
        "id": state["id"],
        "you": viewer_id,
        "phase": state["phase"],
        "turn": state["turn"],
        "awaitingRoll": state.get("awaitingRoll"),
        "lastDice": state.get("lastDice"),
        "winnerId": state.get("winnerId"),
        "log": list(state.get("log") or [])[:12],
        "shopOffers": state.get("shopOffers"),
        "pendingDuel": state.get("pendingDuel"),
        "battle": battle,
        "badgesToWin": BADGES_TO_WIN,
        "board": BOARD,
        "itemsCatalog": ITEMS,
        "shopPrices": SHOP_PRICE,
        "typeKo": TYPE_KO,
        "pokemonCatalog": POKEMON,
        "players": [
            {
                "id": state["players"][pid]["id"],
                "nick": state["players"][pid]["nick"],
                "color": state["players"][pid]["color"],
                "isCpu": state["players"][pid]["isCpu"],
                "pos": state["players"][pid]["pos"],
                "coins": state["players"][pid]["coins"],
                "badges": list(state["players"][pid]["badges"]),
                "items": list(state["players"][pid]["items"]),
                "eliminated": state["players"][pid].get("eliminated", False),
                "mon": mon_pub(state["players"][pid]["mon"]),
                "index": state["players"][pid]["index"],
            }
            for pid in state["order"]
        ],
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    specs = [
        {"id": "cpu0", "nick": "A", "pokemonId": "pikachu", "isCpu": True},
        {"id": "cpu1", "nick": "B", "pokemonId": "charmander", "isCpu": True},
        {"id": "cpu2", "nick": "C", "pokemonId": "bulbasaur", "isCpu": True},
        {"id": "cpu3", "nick": "D", "pokemonId": "squirtle", "isCpu": True},
    ]
    st = new_match(specs, seed=7)
    for i in range(2500):
        if st["phase"] == "ended":
            break
        act = cpu_choose(st, st["turn"])
        if not act:
            log.error("stuck %s", st["phase"])
            break
        apply_action(st, st["turn"], act)
        drain_events(st)
    print(st["phase"], st.get("winnerId"), {p["nick"]: p["badges"] for p in st["players"].values()})
