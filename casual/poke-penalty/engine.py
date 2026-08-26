from __future__ import annotations

import random
import uuid
from typing import Any

KICKS_PER_SIDE = 5

ZONE_COLS = (0, 1, 2, 0, 1, 2)
ZONE_ROWS = (0, 0, 0, 1, 1, 1)


def new_match(p0: str, p1: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:10],
        "order": [p0, p1],
        "phase": "aiming",
        "kicker": p0,
        "keeper": p1,
        "kickNo": 1,
        "goals": {p0: 0, p1: 0},
        "taken": {p0: 0, p1: 0},
        "pendingShot": None,
        "pendingDive": None,
        "winner": None,
        "suddenDeath": False,
        "events": [{"type": "kick_start", "kicker": p0, "keeper": p1, "kickNo": 1}],
    }


def _valid_zone(zone: Any) -> bool:
    return isinstance(zone, int) and 0 <= zone <= 5


def apply_action(state: dict[str, Any], player_id: str, action: dict[str, Any]) -> None:
    if state["phase"] == "ended":
        raise ValueError("match ended")
    typ = action.get("type")

    if typ == "shot":
        if player_id != state["kicker"]:
            raise ValueError("키퍼는 슛을 할 수 없습니다")
        if state["pendingShot"]:
            raise ValueError("이미 슛을 정했습니다")
        zone = action.get("zone")
        power = action.get("power")
        if not _valid_zone(zone) or not isinstance(power, int) or not 1 <= power <= 100:
            raise ValueError("잘못된 슛")
        state["pendingShot"] = {"player": player_id, "zone": zone, "power": power}
    elif typ == "dive":
        if player_id != state["keeper"]:
            raise ValueError("키커는 낙하 지점을 정할 수 없습니다")
        if state["pendingDive"]:
            raise ValueError("이미 위치를 정했습니다")
        zone = action.get("zone")
        if not _valid_zone(zone):
            raise ValueError("잘못된 위치")
        state["pendingDive"] = {"player": player_id, "zone": zone}
    else:
        raise ValueError("알 수 없는 행동")

    if state["pendingShot"] and state["pendingDive"]:
        _resolve(state)


def _resolve(state: dict[str, Any]) -> None:
    shot = state["pendingShot"]
    dive = state["pendingDive"]
    kicker = shot["player"]
    zone, power, dzone = shot["zone"], shot["power"], dive["zone"]

    rng = random.Random(f"{state['id']}:{state['kickNo']}")
    if power >= 96:
        outcome = "out"
    elif dzone == zone:
        outcome = "save"
    elif ZONE_COLS[dzone] != ZONE_COLS[zone] and ZONE_ROWS[dzone] == ZONE_ROWS[zone] and power < 70:
        outcome = "save" if rng.random() < 0.5 else "goal"
    else:
        outcome = "goal"

    state["pendingShot"] = None
    state["pendingDive"] = None
    state["taken"][kicker] += 1
    scored = outcome == "goal"
    if scored:
        state["goals"][kicker] += 1

    state["events"].append(
        {
            "type": "kick_result",
            "outcome": outcome,
            "kicker": kicker,
            "shotZone": zone,
            "power": power,
            "diveZone": dzone,
            "goals": dict(state["goals"]),
            "taken": dict(state["taken"]),
        }
    )

    if _check_end(state):
        return
    _next_kick(state)


def _check_end(state: dict[str, Any]) -> bool:
    p0, p1 = state["order"]
    g0, g1 = state["goals"][p0], state["goals"][p1]
    t0, t1 = state["taken"][p0], state["taken"][p1]

    if not state["suddenDeath"] and max(t0, t1) <= KICKS_PER_SIDE:
        rem0, rem1 = KICKS_PER_SIDE - t0, KICKS_PER_SIDE - t1
        if g0 > g1 + rem1:
            _finish(state, p0)
            return True
        if g1 > g0 + rem0:
            _finish(state, p1)
            return True

    if t0 == t1 and min(t0, t1) >= KICKS_PER_SIDE:
        if g0 != g1:
            _finish(state, p0 if g0 > g1 else p1)
            return True
        if not state["suddenDeath"]:
            state["suddenDeath"] = True
            state["events"].append({"type": "sudden_death"})
    return False


def _finish(state: dict[str, Any], winner: str) -> None:
    state["phase"] = "ended"
    state["winner"] = winner
    state["events"].append({"type": "match_end", "winner": winner})


def _next_kick(state: dict[str, Any]) -> None:
    state["kicker"], state["keeper"] = state["keeper"], state["kicker"]
    state["kickNo"] += 1
    state["events"].append(
        {
            "type": "kick_start",
            "kicker": state["kicker"],
            "keeper": state["keeper"],
            "kickNo": state["kickNo"],
        }
    )


def drain_events(state: dict[str, Any]) -> list[dict[str, Any]]:
    events = state["events"]
    state["events"] = []
    return events


def view_for(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    hidden = {
        "pendingShot": None,
        "pendingDive": None,
        "events": None,
    }
    view = {k: v for k, v in state.items() if k not in hidden}
    view["youAre"] = "kicker" if state["kicker"] == player_id else "keeper"
    if state["pendingShot"] and state["pendingShot"]["player"] == player_id:
        view["myLock"] = {"kind": "shot"}
    elif state["pendingDive"] and state["pendingDive"]["player"] == player_id:
        view["myLock"] = {"kind": "dive"}
    else:
        view["myLock"] = None
    return view


def forfeit(state: dict[str, Any], player_id: str) -> None:
    if state["phase"] == "ended":
        return
    others = [p for p in state["order"] if p != player_id]
    _finish(state, others[0] if others else player_id)


def cpu_choose(state: dict[str, Any], cpu_id: str) -> dict[str, Any]:
    if state["phase"] == "ended":
        return {}
    corner_zones = (0, 2, 3, 5)
    center_zones = (1, 4)

    def pick_zone() -> int:
        roll = random.random()
        if roll < 0.66:
            return random.choice(corner_zones)
        return random.choice(center_zones)

    if cpu_id == state["kicker"] and not state["pendingShot"]:
        return {"type": "shot", "zone": pick_zone(), "power": random.randint(52, 88)}
    if cpu_id == state["keeper"] and not state["pendingDive"]:
        return {"type": "dive", "zone": pick_zone()}
    return {}
