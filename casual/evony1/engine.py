"""Authoritative Evony Age I game engine."""

from __future__ import annotations

import random
import time
from datetime import date
from typing import Any

from data import (
    BEGINNER_PROTECT_SECS,
    BUILDINGS,
    FIELDS,
    MAP_SIZE,
    QUESTS,
    RESEARCH,
    STARTER_RES,
    TROOPS,
    field_slots_for_th,
    level_cost,
    level_time,
)
from store import Store

TITLES = [
    (0, "Civilian"),
    (50, "Knight"),
    (200, "Baron"),
    (500, "Viscount"),
    (1000, "Earl"),
    (2000, "Marquis"),
    (4000, "Duke"),
]


def _title_for(honor: int) -> str:
    t = "Civilian"
    for need, name in TITLES:
        if honor >= need:
            t = name
    return t


def _empty_troops() -> dict[str, int]:
    return {k: 0 for k in TROOPS}


def ensure_map(store: Store, seed: int = 42) -> None:
    if store.map_seeded():
        return
    rng = random.Random(seed)
    rows: list[tuple] = []
    flats: list[tuple[int, int]] = []
    for y in range(MAP_SIZE):
        for x in range(MAP_SIZE):
            r = rng.random()
            if r < 0.06:
                terrain = "lake"
            elif r < 0.12:
                terrain = "river"
            elif r < 0.28:
                terrain = "forest"
            elif r < 0.40:
                terrain = "hill"
            else:
                terrain = "flat"
                flats.append((x, y))
            rows.append((x, y, terrain, None, None, None))
    store.seed_map_tiles(rows)
    rng.shuffle(flats)
    for x, y in flats[:30]:
        store.set_tile(
            {
                "x": x,
                "y": y,
                "terrain": "npc",
                "owner_device": None,
                "city_id": None,
                "npc_level": rng.randint(1, 5),
            },
            commit=False,
        )
    store.conn.commit()
    store.meta_set("map_seeded", "1")


def _find_spawn(store: Store, rng: random.Random) -> tuple[int, int]:
    # prefer center band
    for _ in range(500):
        x = rng.randint(15, MAP_SIZE - 16)
        y = rng.randint(15, MAP_SIZE - 16)
        tile = store.get_tile(x, y)
        if tile and tile["terrain"] == "flat" and not tile.get("owner_device") and not tile.get("npc_level"):
            return x, y
    for y in range(MAP_SIZE):
        for x in range(MAP_SIZE):
            tile = store.get_tile(x, y)
            if tile and tile["terrain"] in ("flat", "forest", "hill") and not tile.get("owner_device"):
                return x, y
    return 40, 40


def create_lord(store: Store, device_id: str, nick: str | None = None) -> dict[str, Any]:
    ensure_map(store)
    now = time.time()
    rng = random.Random(hash(device_id) & 0xFFFFFFFF)
    x, y = _find_spawn(store, rng)
    lord = {
        "device_id": device_id,
        "nick": nick or f"Lord{rng.randint(1000, 9999)}",
        "prestige": 0,
        "honor": 0,
        "title": "Civilian",
        "beginner_protect_until": now + BEGINNER_PROTECT_SECS,
        "research": {k: 0 for k in RESEARCH},
        "quests": {q["id"]: {"done": False, "claimed": False} for q in QUESTS},
        "wheel_day": "",
        "npc_wins": 0,
        "created_at": now,
        "last_tick": now,
    }
    store.upsert_lord(lord)
    buildings_list = [
        {"id": "b_th", "type": "town_hall", "level": 1, "slot": 0},
        {"id": "b_c1", "type": "cottage", "level": 1, "slot": 1},
        {"id": "b_c2", "type": "cottage", "level": 1, "slot": 2},
    ]
    fields_list = [
        {"id": "f_farm1", "type": "farm", "level": 1, "slot": 0},
    ]
    city = {
        "device_id": device_id,
        "name": f"{lord['nick']}'s City",
        "x": x,
        "y": y,
        "loyalty": 100,
        "grievance": 0,
        "tax_rate": 20,
        "wall_level": 0,
        "population": 50,
        "gold": float(STARTER_RES["gold"]),
        "food": float(STARTER_RES["food"]),
        "wood": float(STARTER_RES["wood"]),
        "stone": float(STARTER_RES["stone"]),
        "iron": float(STARTER_RES["iron"]),
        "buildings": buildings_list,
        "fields": fields_list,
        "troops": _empty_troops(),
        "build_queue": None,
        "train_queue": None,
        "research_queue": None,
    }
    city_id = store.save_city(city)
    city["id"] = city_id
    tile = store.get_tile(x, y) or {"x": x, "y": y, "terrain": "flat"}
    tile["terrain"] = "player_city"
    tile["owner_device"] = device_id
    tile["city_id"] = city_id
    tile["npc_level"] = None
    store.set_tile(tile)
    return lord


def get_or_create(store: Store, device_id: str, nick: str | None = None) -> dict[str, Any]:
    lord = store.get_lord(device_id)
    if lord:
        return lord
    return create_lord(store, device_id, nick)


def _building_level(city: dict[str, Any], btype: str) -> int:
    lv = 0
    for b in city["buildings"]:
        if b["type"] == btype:
            lv = max(lv, int(b["level"]))
    return lv


def _field_count(city: dict[str, Any], ftype: str) -> int:
    return sum(1 for f in city["fields"] if f["type"] == ftype)


def _field_max_level(city: dict[str, Any], ftype: str) -> int:
    return max((int(f["level"]) for f in city["fields"] if f["type"] == ftype), default=0)


def _pop_cap(city: dict[str, Any]) -> int:
    cap = 50
    for b in city["buildings"]:
        if b["type"] == "cottage":
            cap += 100 * int(b["level"])
    return cap


def _prod_rates(city: dict[str, Any], research: dict[str, int]) -> dict[str, float]:
    rates = {"food": 0.0, "wood": 0.0, "stone": 0.0, "iron": 0.0, "gold": 0.0}
    for f in city["fields"]:
        meta = FIELDS[f["type"]]
        boost = 1.0 + 0.05 * research.get(
            {"food": "agriculture", "wood": "lumbering", "stone": "masonry", "iron": "mining"}[meta["resource"]],
            0,
        )
        rates[meta["resource"]] += meta["prod_per_level"] * int(f["level"]) * boost
    # gold from tax
    rates["gold"] = city["population"] * (city["tax_rate"] / 100.0) * 10.0  # per hour
    # food upkeep
    upkeep = 0.0
    for tid, n in city["troops"].items():
        if n > 0:
            upkeep += TROOPS[tid]["food_upkeep"] * n
    rates["food"] -= upkeep
    # convert to per-second
    return {k: v / 3600.0 for k, v in rates.items()}


def _apply_production(city: dict[str, Any], research: dict[str, int], dt: float) -> None:
    if dt <= 0:
        return
    rates = _prod_rates(city, research)
    for k in ("food", "wood", "stone", "iron", "gold"):
        city[k] = max(0.0, float(city[k]) + rates[k] * dt)
    # slow pop growth toward cap
    cap = _pop_cap(city)
    if city["population"] < cap:
        city["population"] = min(cap, int(city["population"] + dt * 0.02 * (city["tax_rate"] / 20)))


def _complete_build_queue(city: dict[str, Any], now: float) -> list[str]:
    notes: list[str] = []
    q = city.get("build_queue")
    if not q or q.get("complete_at", 0) > now:
        return notes
    if q["kind"] == "building":
        if q.get("building_id"):
            for b in city["buildings"]:
                if b["id"] == q["building_id"]:
                    b["level"] = q["to_level"]
                    notes.append(f"{b['type']} → L{b['level']}")
                    break
        else:
            city["buildings"].append(
                {
                    "id": q["new_id"],
                    "type": q["type"],
                    "level": q["to_level"],
                    "slot": q["slot"],
                }
            )
            notes.append(f"Built {q['type']} L{q['to_level']}")
        if q["type"] == "wall":
            city["wall_level"] = q["to_level"]
    elif q["kind"] == "field":
        if q.get("field_id"):
            for f in city["fields"]:
                if f["id"] == q["field_id"]:
                    f["level"] = q["to_level"]
                    notes.append(f"{f['type']} → L{f['level']}")
                    break
        else:
            city["fields"].append(
                {"id": q["new_id"], "type": q["type"], "level": q["to_level"], "slot": q["slot"]}
            )
            notes.append(f"Built {q['type']} L{q['to_level']}")
    city["build_queue"] = None
    return notes


def _complete_train_queue(city: dict[str, Any], now: float) -> list[str]:
    notes: list[str] = []
    q = city.get("train_queue")
    if not q or q.get("complete_at", 0) > now:
        return notes
    tid = q["troop"]
    n = int(q["count"])
    city["troops"][tid] = int(city["troops"].get(tid, 0)) + n
    notes.append(f"Trained {n} {tid}")
    city["train_queue"] = None
    return notes


def _complete_research_queue(lord: dict[str, Any], city: dict[str, Any], now: float) -> list[str]:
    notes: list[str] = []
    q = city.get("research_queue")
    if not q or q.get("complete_at", 0) > now:
        return notes
    key = q["tech"]
    lord["research"][key] = q["to_level"]
    notes.append(f"Researched {key} L{q['to_level']}")
    city["research_queue"] = None
    return notes


def _troop_power(troops: dict[str, int]) -> tuple[float, float, float]:
    atk = defn = hp = 0.0
    for tid, n in troops.items():
        if n <= 0:
            continue
        t = TROOPS[tid]
        atk += t["atk"] * n
        defn += t["def"] * n
        hp += t["hp"] * n
    return atk, defn, hp


def _resolve_combat(attacker: dict[str, int], defender_power: float, seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    a_atk, a_def, a_hp = _troop_power(attacker)
    # defender abstract strength
    d_atk = defender_power
    d_def = defender_power * 0.8
    d_hp = defender_power * 3
    rounds = 0
    while a_hp > 0 and d_hp > 0 and rounds < 40:
        rounds += 1
        dmg_to_d = max(1.0, a_atk * (0.8 + 0.4 * rng.random()) - d_def * 0.3)
        dmg_to_a = max(1.0, d_atk * (0.8 + 0.4 * rng.random()) - a_def * 0.3)
        d_hp -= dmg_to_d
        a_hp -= dmg_to_a
    win = a_hp > 0 and a_hp >= d_hp
    # survivors proportional
    survivors: dict[str, int] = {}
    if a_atk + a_def + a_hp <= 0:
        ratio = 0.0
    else:
        orig = sum(TROOPS[t]["hp"] * n for t, n in attacker.items() if n > 0) or 1
        ratio = max(0.0, min(1.0, a_hp / orig)) if win else max(0.0, a_hp / orig * 0.3)
    for tid, n in attacker.items():
        if n > 0:
            survivors[tid] = int(n * ratio)
    loot = {"gold": 0, "food": 0, "wood": 0, "stone": 0, "iron": 0}
    if win:
        loot = {
            "gold": int(50 + defender_power * 2),
            "food": int(100 + defender_power * 3),
            "wood": int(80 + defender_power * 2),
            "stone": int(60 + defender_power),
            "iron": int(40 + defender_power),
        }
    return {"win": win, "survivors": survivors, "loot": loot, "rounds": rounds}


def _process_marches(store: Store, now: float) -> None:
    for march in store.all_active_marches():
        if march["status"] == "going" and now >= march["arrive_at"]:
            city = store.get_city(march["city_id"])
            if not city:
                march["status"] = "done"
                store.save_march(march)
                continue
            action = march["action"]
            tile = store.get_tile(march["to_x"], march["to_y"])
            result: dict[str, Any] = {"action": action}
            if action == "scout":
                result["tile"] = tile
                result["info"] = (
                    f"Tile ({march['to_x']},{march['to_y']}) terrain={tile and tile['terrain']}"
                    + (f" NPC L{tile['npc_level']}" if tile and tile.get("npc_level") else "")
                    + (f" owner={tile['owner_device']}" if tile and tile.get("owner_device") else "")
                )
                store.add_report(march["device_id"], "Scout Report", result["info"], now)
                march["result"] = result
                march["status"] = "returning"
                march["return_at"] = now + (march["arrive_at"] - march["depart_at"])
            elif action in ("attack",):
                if tile and tile.get("npc_level"):
                    power = 80 * int(tile["npc_level"])
                    combat = _resolve_combat(
                        march["troops"],
                        power,
                        seed=int(march["id"] or 1) * 10007,
                    )
                    result["combat"] = combat
                    march["troops"] = combat["survivors"]
                    if combat["win"]:
                        lord = store.get_lord(march["device_id"])
                        if lord:
                            lord["npc_wins"] = int(lord.get("npc_wins") or 0) + 1
                            lord["honor"] = int(lord["honor"]) + 10 * int(tile["npc_level"])
                            lord["prestige"] = int(lord["prestige"]) + 5 * int(tile["npc_level"])
                            lord["title"] = _title_for(lord["honor"])
                            store.upsert_lord(lord)
                        for k, v in combat["loot"].items():
                            city[k] = float(city[k]) + v
                        # weaken or clear NPC
                        if tile["npc_level"] <= 1:
                            tile["terrain"] = "flat"
                            tile["npc_level"] = None
                        else:
                            tile["npc_level"] = int(tile["npc_level"]) - 1
                        store.set_tile(tile)
                        store.add_report(
                            march["device_id"],
                            "Victory!",
                            f"Defeated camp at ({march['to_x']},{march['to_y']}). Loot {combat['loot']}",
                            now,
                        )
                    else:
                        store.add_report(
                            march["device_id"],
                            "Defeat",
                            f"Failed attack at ({march['to_x']},{march['to_y']}).",
                            now,
                        )
                elif tile and tile.get("owner_device") and tile["owner_device"] != march["device_id"]:
                    # PvP simplified: attack garrison of 0 → loot small if unprotected
                    target_city = store.get_city(tile["city_id"]) if tile.get("city_id") else None
                    target_lord = store.get_lord(tile["owner_device"]) if tile.get("owner_device") else None
                    protected = target_lord and now < float(target_lord["beginner_protect_until"])
                    if protected:
                        store.add_report(
                            march["device_id"],
                            "Protected",
                            "Target under beginner protection.",
                            now,
                        )
                        result["blocked"] = True
                    elif target_city:
                        def_power = sum(
                            TROOPS[t]["atk"] * n for t, n in target_city["troops"].items() if n > 0
                        ) + 50 * int(target_city.get("wall_level") or 0)
                        combat = _resolve_combat(march["troops"], max(30.0, float(def_power)), seed=int(march["id"] or 1))
                        result["combat"] = combat
                        march["troops"] = combat["survivors"]
                        if combat["win"]:
                            for k, v in combat["loot"].items():
                                take = min(float(target_city[k]) * 0.1, float(v * 5))
                                target_city[k] = max(0.0, float(target_city[k]) - take)
                                city[k] = float(city[k]) + take
                            store.save_city(target_city)
                            store.add_report(
                                march["device_id"],
                                "Raid Victory",
                                f"Raided ({march['to_x']},{march['to_y']}).",
                                now,
                            )
                            store.add_report(
                                tile["owner_device"],
                                "City Attacked",
                                f"Enemy raided your city at ({march['to_x']},{march['to_y']}).",
                                now,
                            )
                        else:
                            store.add_report(march["device_id"], "Raid Failed", "Your troops were repelled.", now)
                else:
                    store.add_report(march["device_id"], "No Target", "Nothing to attack.", now)
                march["result"] = result
                march["status"] = "returning"
                march["return_at"] = now + max(5.0, march["arrive_at"] - march["depart_at"])
            else:
                # transport / reinforce — return immediately with note
                store.add_report(march["device_id"], action.title(), f"{action} arrived.", now)
                march["status"] = "returning"
                march["return_at"] = now + max(5.0, march["arrive_at"] - march["depart_at"])
            store.save_city(city)
            store.save_march(march)
        elif march["status"] == "returning" and march.get("return_at") and now >= march["return_at"]:
            city = store.get_city(march["city_id"])
            if city:
                for tid, n in march["troops"].items():
                    city["troops"][tid] = int(city["troops"].get(tid, 0)) + int(n)
                store.save_city(city)
            march["status"] = "done"
            store.save_march(march)


def _update_quests(store: Store, lord: dict[str, Any], cities: list[dict[str, Any]]) -> None:
    qstate = lord.get("quests") or {}
    for q in QUESTS:
        st = qstate.get(q["id"]) or {"done": False, "claimed": False}
        if st.get("done"):
            continue
        ok = False
        if q["check"] == "cottage_level":
            ok = any(_building_level(c, "cottage") >= q["target"] for c in cities)
        elif q["check"] == "farm_level":
            ok = any(_field_max_level(c, "farm") >= q["target"] for c in cities)
        elif q["check"] == "warrior_count":
            ok = any(int(c["troops"].get("warrior", 0)) >= q["target"] for c in cities)
        elif q["check"] == "npc_wins":
            ok = int(lord.get("npc_wins") or 0) >= q["target"]
        if ok:
            st["done"] = True
            qstate[q["id"]] = st
    lord["quests"] = qstate


def tick(store: Store, now: float | None = None) -> None:
    ensure_map(store)
    now = time.time() if now is None else now
    _process_marches(store, now)
    for device_id in store.list_lords():
        lord = store.get_lord(device_id)
        if not lord:
            continue
        dt = max(0.0, now - float(lord["last_tick"]))
        cities = store.get_cities(device_id)
        for city in cities:
            _apply_production(city, lord["research"], dt)
            for note in _complete_build_queue(city, now):
                store.add_report(device_id, "Construction Complete", note, now)
            for note in _complete_train_queue(city, now):
                store.add_report(device_id, "Training Complete", note, now)
            for note in _complete_research_queue(lord, city, now):
                store.add_report(device_id, "Research Complete", note, now)
            store.save_city(city)
        _update_quests(store, lord, cities)
        lord["last_tick"] = now
        lord["title"] = _title_for(int(lord["honor"]))
        store.upsert_lord(lord)


def snapshot_for(
    store: Store,
    device_id: str,
    map_x: int | None = None,
    map_y: int | None = None,
    map_w: int = 11,
    map_h: int = 11,
) -> dict[str, Any]:
    tick(store)
    lord = store.get_lord(device_id)
    if not lord:
        lord = create_lord(store, device_id)
    cities = store.get_cities(device_id)
    if not cities:
        # should not happen
        create_lord(store, device_id)
        cities = store.get_cities(device_id)
    cx = cities[0]["x"] if map_x is None else map_x
    cy = cities[0]["y"] if map_y is None else map_y
    x0 = max(0, int(cx) - map_w // 2)
    y0 = max(0, int(cy) - map_h // 2)
    rates = _prod_rates(cities[0], lord["research"]) if cities else {}
    # hourly for UI
    rates_h = {k: v * 3600 for k, v in rates.items()}
    return {
        "server_time": time.time(),
        "map_size": MAP_SIZE,
        "lord": {
            "device_id": lord["device_id"],
            "nick": lord["nick"],
            "prestige": lord["prestige"],
            "honor": lord["honor"],
            "title": lord["title"],
            "beginner_protect_until": lord["beginner_protect_until"],
            "research": lord["research"],
            "quests": lord["quests"],
            "npc_wins": lord.get("npc_wins") or 0,
            "wheel_day": lord.get("wheel_day") or "",
        },
        "cities": cities,
        "marches": store.get_marches(device_id),
        "reports": store.get_reports(device_id),
        "chat": store.recent_chat(),
        "map_window": {
            "x": x0,
            "y": y0,
            "w": map_w,
            "h": map_h,
            "tiles": store.map_window(x0, y0, map_w, map_h),
        },
        "prod_hourly": rates_h,
        "catalog": {
            "buildings": {k: {"name": v["name"], "max_level": v["max_level"]} for k, v in BUILDINGS.items()},
            "fields": {k: {"name": v["name"], "max_level": v["max_level"]} for k, v in FIELDS.items()},
            "troops": {k: {"name": v["name"], "pop": v["pop"], "time": v["time"]} for k, v in TROOPS.items()},
            "research": {k: {"name": v["name"], "max_level": v["max_level"]} for k, v in RESEARCH.items()},
            "quests": QUESTS,
        },
        "online": len(store.list_lords()),
    }


def _pay(city: dict[str, Any], cost: dict[str, int]) -> str | None:
    for k, v in cost.items():
        if k == "gold":
            if city["gold"] < v:
                return "Not enough gold"
        elif city.get(k, 0) < v:
            return f"Not enough {k}"
    for k, v in cost.items():
        if k == "gold":
            city["gold"] -= v
        else:
            city[k] = float(city[k]) - v
    return None


def _action_build(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    city = store.get_city(int(msg["city_id"]))
    if not city or city["device_id"] != lord["device_id"]:
        return {"ok": False, "error": "Invalid city"}
    if city.get("build_queue"):
        return {"ok": False, "error": "Construction queue busy"}
    kind = msg.get("kind", "building")
    now = time.time()
    if kind == "building":
        btype = msg.get("build_type") or msg.get("building_type")
        if btype not in BUILDINGS:
            return {"ok": False, "error": "Unknown building"}
        meta = BUILDINGS[btype]
        # upgrade existing?
        building_id = msg.get("building_id")
        if building_id:
            target = next((b for b in city["buildings"] if b["id"] == building_id), None)
            if not target or target["type"] != btype:
                return {"ok": False, "error": "Building not found"}
            to_level = int(target["level"]) + 1
            if to_level > meta["max_level"]:
                return {"ok": False, "error": "Max level"}
            cost = level_cost(meta["base_cost"], to_level)
            tsec = level_time(meta["base_time"], to_level)
            err = _pay(city, cost)
            if err:
                return {"ok": False, "error": err}
            city["build_queue"] = {
                "kind": "building",
                "type": btype,
                "building_id": building_id,
                "to_level": to_level,
                "complete_at": now + tsec,
                "started_at": now,
            }
        else:
            # new build
            for req, lv in meta.get("prereq", {}).items():
                if _building_level(city, req) < lv:
                    return {"ok": False, "error": f"Requires {req} L{lv}"}
            slot = int(msg.get("slot", len(city["buildings"])))
            if any(b["slot"] == slot for b in city["buildings"]):
                return {"ok": False, "error": "Slot occupied"}
            to_level = 1
            cost = level_cost(meta["base_cost"], to_level)
            tsec = level_time(meta["base_time"], to_level)
            err = _pay(city, cost)
            if err:
                return {"ok": False, "error": err}
            city["build_queue"] = {
                "kind": "building",
                "type": btype,
                "new_id": f"b_{btype}_{int(now)}",
                "slot": slot,
                "to_level": to_level,
                "complete_at": now + tsec,
                "started_at": now,
            }
    elif kind == "field":
        ftype = msg.get("build_type") or msg.get("field_type")
        if ftype not in FIELDS:
            return {"ok": False, "error": "Unknown field"}
        meta = FIELDS[ftype]
        th = _building_level(city, "town_hall")
        field_id = msg.get("field_id")
        if field_id:
            target = next((f for f in city["fields"] if f["id"] == field_id), None)
            if not target:
                return {"ok": False, "error": "Field not found"}
            to_level = int(target["level"]) + 1
            if to_level > meta["max_level"]:
                return {"ok": False, "error": "Max level"}
            cost = level_cost(meta["base_cost"], to_level)
            tsec = level_time(meta["base_time"], to_level)
            err = _pay(city, cost)
            if err:
                return {"ok": False, "error": err}
            city["build_queue"] = {
                "kind": "field",
                "type": ftype,
                "field_id": field_id,
                "to_level": to_level,
                "complete_at": now + tsec,
                "started_at": now,
            }
        else:
            if _field_count(city, ftype) >= field_slots_for_th(th):
                return {"ok": False, "error": "No field slots (raise Town Hall)"}
            slot = int(msg.get("slot", len(city["fields"])))
            cost = level_cost(meta["base_cost"], 1)
            tsec = level_time(meta["base_time"], 1)
            err = _pay(city, cost)
            if err:
                return {"ok": False, "error": err}
            city["build_queue"] = {
                "kind": "field",
                "type": ftype,
                "new_id": f"f_{ftype}_{int(now)}",
                "slot": slot,
                "to_level": 1,
                "complete_at": now + tsec,
                "started_at": now,
            }
    else:
        return {"ok": False, "error": "Bad kind"}
    store.save_city(city)
    return {"ok": True}


def _action_train(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    city = store.get_city(int(msg["city_id"]))
    if not city or city["device_id"] != lord["device_id"]:
        return {"ok": False, "error": "Invalid city"}
    if city.get("train_queue"):
        return {"ok": False, "error": "Training queue busy"}
    tid = msg.get("troop")
    count = int(msg.get("count") or 0)
    if tid not in TROOPS or count < 1 or count > 500:
        return {"ok": False, "error": "Bad troop/count"}
    meta = TROOPS[tid]
    if _building_level(city, meta["building"]) < meta["building_level"]:
        return {"ok": False, "error": f"Need {meta['building']} L{meta['building_level']}"}
    req_r = meta.get("research")
    if req_r and int(lord["research"].get(req_r, 0)) < 1:
        return {"ok": False, "error": f"Need research {req_r}"}
    idle = _pop_cap(city) - int(city["population"])
    # population used by troops
    used = sum(TROOPS[t]["pop"] * n for t, n in city["troops"].items() if n > 0)
    free_pop = max(0, _pop_cap(city) - used - 10)
    need_pop = meta["pop"] * count
    if need_pop > free_pop:
        return {"ok": False, "error": "Not enough idle population"}
    cost = {k: v * count for k, v in meta["cost"].items()}
    err = _pay(city, cost)
    if err:
        return {"ok": False, "error": err}
    now = time.time()
    city["train_queue"] = {
        "troop": tid,
        "count": count,
        "complete_at": now + meta["time"] * count,
        "started_at": now,
    }
    store.save_city(city)
    return {"ok": True}


def _action_research(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    city = store.get_city(int(msg["city_id"]))
    if not city or city["device_id"] != lord["device_id"]:
        return {"ok": False, "error": "Invalid city"}
    if _building_level(city, "academy") < 1:
        return {"ok": False, "error": "Need Academy"}
    # only one research across cities
    for c in store.get_cities(lord["device_id"]):
        if c.get("research_queue"):
            return {"ok": False, "error": "Research queue busy"}
    tech = msg.get("tech")
    if tech not in RESEARCH:
        return {"ok": False, "error": "Unknown tech"}
    meta = RESEARCH[tech]
    cur = int(lord["research"].get(tech, 0))
    to_level = cur + 1
    if to_level > meta["max_level"]:
        return {"ok": False, "error": "Max level"}
    cost = level_cost(meta["base_cost"], to_level)
    tsec = level_time(meta["base_time"], to_level)
    err = _pay(city, cost)
    if err:
        return {"ok": False, "error": err}
    now = time.time()
    city["research_queue"] = {
        "tech": tech,
        "to_level": to_level,
        "complete_at": now + tsec,
        "started_at": now,
    }
    store.save_city(city)
    store.upsert_lord(lord)
    return {"ok": True}


def _march_eta(troops: dict[str, int], dist: float) -> float:
    if not any(n > 0 for n in troops.values()):
        return 30.0
    speed = min(TROOPS[t]["speed"] for t, n in troops.items() if n > 0)
    # tiles per hour-ish → seconds
    return max(8.0, (dist / max(1, speed)) * 60.0)


def _action_march(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    city = store.get_city(int(msg["city_id"]))
    if not city or city["device_id"] != lord["device_id"]:
        return {"ok": False, "error": "Invalid city"}
    action = msg.get("action")
    if action not in ("scout", "attack", "transport", "reinforce"):
        return {"ok": False, "error": "Bad action"}
    to_x, to_y = int(msg["x"]), int(msg["y"])
    if not (0 <= to_x < MAP_SIZE and 0 <= to_y < MAP_SIZE):
        return {"ok": False, "error": "Out of bounds"}
    troops = msg.get("troops") or {}
    send: dict[str, int] = {}
    for tid, n in troops.items():
        n = int(n)
        if n <= 0:
            continue
        if tid not in TROOPS:
            return {"ok": False, "error": f"Bad troop {tid}"}
        if int(city["troops"].get(tid, 0)) < n:
            return {"ok": False, "error": "Not enough troops"}
        send[tid] = n
    if action == "scout" and not send:
        # free scout uses 1 scout if available else ghost scout 15s
        if int(city["troops"].get("scout", 0)) >= 1:
            send = {"scout": 1}
        else:
            send = {"warrior": 0}
    if action != "scout" and not any(send.values()):
        return {"ok": False, "error": "No troops selected"}
    for tid, n in send.items():
        if n > 0:
            city["troops"][tid] = int(city["troops"].get(tid, 0)) - n
    now = time.time()
    dist = abs(to_x - city["x"]) + abs(to_y - city["y"])
    eta = _march_eta(send if any(send.values()) else {"scout": 1}, float(dist))
    march = {
        "device_id": lord["device_id"],
        "city_id": city["id"],
        "action": action,
        "from_x": city["x"],
        "from_y": city["y"],
        "to_x": to_x,
        "to_y": to_y,
        "troops": send,
        "depart_at": now,
        "arrive_at": now + eta,
        "return_at": None,
        "status": "going",
        "result": None,
    }
    store.save_city(city)
    store.save_march(march)
    return {"ok": True}


def _action_claim_quest(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    qid = msg.get("quest_id")
    q = next((x for x in QUESTS if x["id"] == qid), None)
    if not q:
        return {"ok": False, "error": "Unknown quest"}
    st = (lord.get("quests") or {}).get(qid) or {}
    if not st.get("done") or st.get("claimed"):
        return {"ok": False, "error": "Quest not claimable"}
    cities = store.get_cities(lord["device_id"])
    if not cities:
        return {"ok": False, "error": "No city"}
    city = cities[0]
    for k, v in q.get("reward", {}).items():
        if k == "honor":
            lord["honor"] = int(lord["honor"]) + int(v)
        else:
            city[k] = float(city.get(k, 0)) + float(v)
    st["claimed"] = True
    lord["quests"][qid] = st
    lord["title"] = _title_for(int(lord["honor"]))
    store.save_city(city)
    store.upsert_lord(lord)
    return {"ok": True}


def _action_spin_wheel(store: Store, lord: dict, msg: dict) -> dict[str, Any]:
    today = date.today().isoformat()
    if lord.get("wheel_day") == today:
        return {"ok": False, "error": "Already spun today"}
    cities = store.get_cities(lord["device_id"])
    if not cities:
        return {"ok": False, "error": "No city"}
    rewards = [
        {"gold": 200},
        {"food": 500},
        {"wood": 500},
        {"stone": 400},
        {"iron": 300},
        {"gold": 1000},
    ]
    prize = random.choice(rewards)
    city = cities[0]
    for k, v in prize.items():
        city[k] = float(city[k]) + v
    lord["wheel_day"] = today
    store.save_city(city)
    store.upsert_lord(lord)
    return {"ok": True, "prize": prize}


def handle_action(store: Store, device_id: str, msg: dict[str, Any]) -> dict[str, Any]:
    tick(store)
    typ = msg.get("type")
    if typ == "hello":
        nick = msg.get("nick")
        lord = get_or_create(store, device_id, nick)
        if nick and nick != lord["nick"]:
            lord["nick"] = nick[:16]
            store.upsert_lord(lord)
        return {"ok": True, "snapshot": snapshot_for(store, device_id)}
    lord = store.get_lord(device_id)
    if not lord:
        lord = create_lord(store, device_id)
    if typ == "set_nick":
        lord["nick"] = str(msg.get("nick") or lord["nick"])[:16]
        store.upsert_lord(lord)
        return {"ok": True, "snapshot": snapshot_for(store, device_id)}
    if typ == "build" or typ == "upgrade":
        res = _action_build(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "train":
        res = _action_train(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "research":
        res = _action_research(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "march":
        res = _action_march(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "map_query":
        return {
            "ok": True,
            "snapshot": snapshot_for(
                store,
                device_id,
                map_x=int(msg.get("x", 40)),
                map_y=int(msg.get("y", 40)),
                map_w=int(msg.get("w", 11)),
                map_h=int(msg.get("h", 11)),
            ),
        }
    if typ == "chat":
        text = str(msg.get("text") or "").strip()
        if not text:
            return {"ok": False, "error": "Empty"}
        store.add_chat(device_id, lord["nick"], text)
        return {"ok": True, "snapshot": snapshot_for(store, device_id)}
    if typ == "claim_quest":
        res = _action_claim_quest(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "spin_wheel":
        res = _action_spin_wheel(store, lord, msg)
        if res.get("ok"):
            res["snapshot"] = snapshot_for(store, device_id)
        return res
    if typ == "reset_account":
        store.delete_lord(device_id)
        create_lord(store, device_id, msg.get("nick"))
        return {"ok": True, "snapshot": snapshot_for(store, device_id)}
    if typ == "ping":
        return {"ok": True, "snapshot": snapshot_for(store, device_id)}
    return {"ok": False, "error": f"Unknown type {typ}"}
