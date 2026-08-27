"""Engine tests for Evony Age I (stdlib unittest)."""

from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import engine
from store import Store


class EngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self._tmp.name) / "t.sqlite")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_create_and_tick_adds_resources(self) -> None:
        lord = engine.create_lord(self.store, "dev1", "Alpha")
        cities = self.store.get_cities("dev1")
        self.assertEqual(len(cities), 1)
        food0 = cities[0]["food"]
        lord["last_tick"] = time.time() - 3600
        self.store.upsert_lord(lord)
        engine.tick(self.store)
        city = self.store.get_cities("dev1")[0]
        self.assertGreater(city["food"], food0)

    def test_build_upgrade_field(self) -> None:
        engine.create_lord(self.store, "dev2b", "Builder")
        city = self.store.get_cities("dev2b")[0]
        farm = next(f for f in city["fields"] if f["type"] == "farm")
        res = engine.handle_action(
            self.store,
            "dev2b",
            {
                "type": "build",
                "city_id": city["id"],
                "kind": "field",
                "build_type": "farm",
                "field_id": farm["id"],
            },
        )
        self.assertTrue(res["ok"], res)
        city = self.store.get_cities("dev2b")[0]
        q = city["build_queue"]
        self.assertIsNotNone(q)
        self.assertEqual(q["to_level"], 2)
        q["complete_at"] = time.time() - 1
        self.store.save_city(city)
        engine.tick(self.store)
        city = self.store.get_cities("dev2b")[0]
        farm2 = next(f for f in city["fields"] if f["id"] == farm["id"])
        self.assertEqual(farm2["level"], 2)
        self.assertIsNone(city["build_queue"])

    def test_train_warriors(self) -> None:
        engine.create_lord(self.store, "dev3", "General")
        city = self.store.get_cities("dev3")[0]
        res = engine.handle_action(
            self.store,
            "dev3",
            {
                "type": "build",
                "city_id": city["id"],
                "kind": "building",
                "build_type": "barracks",
                "slot": 5,
            },
        )
        self.assertTrue(res["ok"], res)
        city = self.store.get_cities("dev3")[0]
        city["build_queue"]["complete_at"] = time.time() - 1
        self.store.save_city(city)
        engine.tick(self.store)
        city = self.store.get_cities("dev3")[0]
        res = engine.handle_action(
            self.store,
            "dev3",
            {"type": "train", "city_id": city["id"], "troop": "warrior", "count": 10},
        )
        self.assertTrue(res["ok"], res)
        city = self.store.get_cities("dev3")[0]
        city["train_queue"]["complete_at"] = time.time() - 1
        self.store.save_city(city)
        engine.tick(self.store)
        city = self.store.get_cities("dev3")[0]
        self.assertEqual(city["troops"]["warrior"], 10)

    def test_march_attack_npc(self) -> None:
        engine.create_lord(self.store, "dev4", "Raider")
        city = self.store.get_cities("dev4")[0]
        city["buildings"].append({"id": "b_bar", "type": "barracks", "level": 1, "slot": 5})
        city["troops"]["warrior"] = 80
        self.store.save_city(city)
        tiles = self.store.map_window(0, 0, 80, 80)
        npc = next(t for t in tiles if t.get("npc_level"))
        res = engine.handle_action(
            self.store,
            "dev4",
            {
                "type": "march",
                "city_id": city["id"],
                "action": "attack",
                "x": npc["x"],
                "y": npc["y"],
                "troops": {"warrior": 80},
            },
        )
        self.assertTrue(res["ok"], res)
        marches = self.store.get_marches("dev4")
        self.assertTrue(marches)
        m = marches[0]
        m["arrive_at"] = time.time() - 1
        self.store.save_march(m)
        engine.tick(self.store)
        reports = self.store.get_reports("dev4")
        self.assertTrue(
            any(
                "Victory" in r["title"] or "Defeat" in r["title"] or "No Target" in r["title"]
                for r in reports
            )
        )

    def test_reset_clears_device(self) -> None:
        engine.create_lord(self.store, "dev5", "Old")
        self.assertTrue(self.store.lord_exists("dev5"))
        engine.handle_action(self.store, "dev5", {"type": "reset_account", "nick": "New"})
        lord = self.store.get_lord("dev5")
        self.assertIsNotNone(lord)
        self.assertEqual(lord["nick"], "New")
        self.assertTrue(self.store.get_cities("dev5"))

    def test_combat_deterministic(self) -> None:
        a = {"warrior": 50}
        r1 = engine._resolve_combat(a, 100, seed=123)
        r2 = engine._resolve_combat(a, 100, seed=123)
        self.assertEqual(r1, r2)


if __name__ == "__main__":
    unittest.main()
