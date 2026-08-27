"""SQLite persistence for Evony Age I."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "evony1.sqlite"


class Store:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else DB_PATH
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def _init_schema(self) -> None:
        c = self.conn
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lords (
              device_id TEXT PRIMARY KEY,
              nick TEXT NOT NULL,
              prestige INTEGER NOT NULL DEFAULT 0,
              honor INTEGER NOT NULL DEFAULT 0,
              title TEXT NOT NULL DEFAULT 'Civilian',
              beginner_protect_until REAL NOT NULL,
              research_json TEXT NOT NULL DEFAULT '{}',
              quests_json TEXT NOT NULL DEFAULT '{}',
              wheel_day TEXT NOT NULL DEFAULT '',
              npc_wins INTEGER NOT NULL DEFAULT 0,
              created_at REAL NOT NULL,
              last_tick REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cities (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device_id TEXT NOT NULL,
              name TEXT NOT NULL,
              x INTEGER NOT NULL,
              y INTEGER NOT NULL,
              loyalty INTEGER NOT NULL DEFAULT 100,
              grievance INTEGER NOT NULL DEFAULT 0,
              tax_rate INTEGER NOT NULL DEFAULT 20,
              wall_level INTEGER NOT NULL DEFAULT 0,
              population INTEGER NOT NULL DEFAULT 50,
              gold REAL NOT NULL,
              food REAL NOT NULL,
              wood REAL NOT NULL,
              stone REAL NOT NULL,
              iron REAL NOT NULL,
              buildings_json TEXT NOT NULL,
              fields_json TEXT NOT NULL,
              troops_json TEXT NOT NULL,
              build_queue_json TEXT NOT NULL DEFAULT 'null',
              train_queue_json TEXT NOT NULL DEFAULT 'null',
              research_queue_json TEXT NOT NULL DEFAULT 'null',
              UNIQUE(device_id, x, y)
            );
            CREATE TABLE IF NOT EXISTS marches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device_id TEXT NOT NULL,
              city_id INTEGER NOT NULL,
              action TEXT NOT NULL,
              from_x INTEGER NOT NULL,
              from_y INTEGER NOT NULL,
              to_x INTEGER NOT NULL,
              to_y INTEGER NOT NULL,
              troops_json TEXT NOT NULL,
              depart_at REAL NOT NULL,
              arrive_at REAL NOT NULL,
              return_at REAL,
              status TEXT NOT NULL DEFAULT 'going',
              result_json TEXT
            );
            CREATE TABLE IF NOT EXISTS reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device_id TEXT NOT NULL,
              created_at REAL NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              read INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS chat (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device_id TEXT NOT NULL,
              nick TEXT NOT NULL,
              text TEXT NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS map_tiles (
              x INTEGER NOT NULL,
              y INTEGER NOT NULL,
              terrain TEXT NOT NULL,
              owner_device TEXT,
              city_id INTEGER,
              npc_level INTEGER,
              PRIMARY KEY (x, y)
            );
            """
        )
        c.commit()

    def meta_get(self, key: str, default: str | None = None) -> str | None:
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    def meta_set(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self.conn.commit()

    def lord_exists(self, device_id: str) -> bool:
        row = self.conn.execute("SELECT 1 FROM lords WHERE device_id=?", (device_id,)).fetchone()
        return row is not None

    def get_lord(self, device_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM lords WHERE device_id=?", (device_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["research"] = json.loads(d.pop("research_json"))
        d["quests"] = json.loads(d.pop("quests_json"))
        return d

    def upsert_lord(self, lord: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO lords(device_id,nick,prestige,honor,title,beginner_protect_until,
              research_json,quests_json,wheel_day,npc_wins,created_at,last_tick)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(device_id) DO UPDATE SET
              nick=excluded.nick, prestige=excluded.prestige, honor=excluded.honor,
              title=excluded.title, beginner_protect_until=excluded.beginner_protect_until,
              research_json=excluded.research_json, quests_json=excluded.quests_json,
              wheel_day=excluded.wheel_day, npc_wins=excluded.npc_wins, last_tick=excluded.last_tick
            """,
            (
                lord["device_id"],
                lord["nick"],
                lord["prestige"],
                lord["honor"],
                lord["title"],
                lord["beginner_protect_until"],
                json.dumps(lord.get("research") or {}),
                json.dumps(lord.get("quests") or {}),
                lord.get("wheel_day") or "",
                lord.get("npc_wins") or 0,
                lord["created_at"],
                lord["last_tick"],
            ),
        )
        self.conn.commit()

    def delete_lord(self, device_id: str) -> None:
        cities = self.conn.execute(
            "SELECT id,x,y FROM cities WHERE device_id=?", (device_id,)
        ).fetchall()
        for city in cities:
            self.conn.execute(
                "UPDATE map_tiles SET owner_device=NULL, city_id=NULL WHERE x=? AND y=?",
                (city["x"], city["y"]),
            )
        self.conn.execute("DELETE FROM marches WHERE device_id=?", (device_id,))
        self.conn.execute("DELETE FROM reports WHERE device_id=?", (device_id,))
        self.conn.execute("DELETE FROM cities WHERE device_id=?", (device_id,))
        self.conn.execute("DELETE FROM lords WHERE device_id=?", (device_id,))
        self.conn.commit()

    def list_lords(self) -> list[str]:
        rows = self.conn.execute("SELECT device_id FROM lords").fetchall()
        return [r["device_id"] for r in rows]

    def get_cities(self, device_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM cities WHERE device_id=? ORDER BY id", (device_id,)
        ).fetchall()
        out = []
        for row in rows:
            d = dict(row)
            for key in ("buildings", "fields", "troops"):
                d[key] = json.loads(d.pop(f"{key}_json"))
            for key in ("build_queue", "train_queue", "research_queue"):
                d[key] = json.loads(d.pop(f"{key}_json"))
            out.append(d)
        return out

    def get_city(self, city_id: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM cities WHERE id=?", (city_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        for key in ("buildings", "fields", "troops"):
            d[key] = json.loads(d.pop(f"{key}_json"))
        for key in ("build_queue", "train_queue", "research_queue"):
            d[key] = json.loads(d.pop(f"{key}_json"))
        return d

    def save_city(self, city: dict[str, Any]) -> int:
        vals = (
            city["device_id"],
            city["name"],
            city["x"],
            city["y"],
            city["loyalty"],
            city["grievance"],
            city["tax_rate"],
            city["wall_level"],
            city["population"],
            city["gold"],
            city["food"],
            city["wood"],
            city["stone"],
            city["iron"],
            json.dumps(city["buildings"]),
            json.dumps(city["fields"]),
            json.dumps(city["troops"]),
            json.dumps(city.get("build_queue")),
            json.dumps(city.get("train_queue")),
            json.dumps(city.get("research_queue")),
        )
        if city.get("id"):
            self.conn.execute(
                """
                UPDATE cities SET device_id=?, name=?, x=?, y=?, loyalty=?, grievance=?,
                  tax_rate=?, wall_level=?, population=?, gold=?, food=?, wood=?, stone=?, iron=?,
                  buildings_json=?, fields_json=?, troops_json=?,
                  build_queue_json=?, train_queue_json=?, research_queue_json=?
                WHERE id=?
                """,
                vals + (city["id"],),
            )
            self.conn.commit()
            return int(city["id"])
        cur = self.conn.execute(
            """
            INSERT INTO cities(device_id,name,x,y,loyalty,grievance,tax_rate,wall_level,population,
              gold,food,wood,stone,iron,buildings_json,fields_json,troops_json,
              build_queue_json,train_queue_json,research_queue_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            vals,
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def add_report(self, device_id: str, title: str, body: str, now: float | None = None) -> None:
        self.conn.execute(
            "INSERT INTO reports(device_id,created_at,title,body) VALUES(?,?,?,?)",
            (device_id, now or time.time(), title, body),
        )
        self.conn.commit()

    def get_reports(self, device_id: str, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT id,created_at,title,body,read FROM reports WHERE device_id=? ORDER BY id DESC LIMIT ?",
            (device_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def add_chat(self, device_id: str, nick: str, text: str, now: float | None = None) -> None:
        self.conn.execute(
            "INSERT INTO chat(device_id,nick,text,created_at) VALUES(?,?,?,?)",
            (device_id, nick, text[:200], now or time.time()),
        )
        self.conn.commit()

    def recent_chat(self, limit: int = 40) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT nick,text,created_at FROM chat ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return list(reversed([dict(r) for r in rows]))

    def get_marches(self, device_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM marches WHERE device_id=? AND status IN ('going','returning') ORDER BY id",
            (device_id,),
        ).fetchall()
        out = []
        for row in rows:
            d = dict(row)
            d["troops"] = json.loads(d.pop("troops_json"))
            d["result"] = json.loads(d["result_json"]) if d.get("result_json") else None
            del d["result_json"]
            out.append(d)
        return out

    def all_active_marches(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM marches WHERE status IN ('going','returning')"
        ).fetchall()
        out = []
        for row in rows:
            d = dict(row)
            d["troops"] = json.loads(d.pop("troops_json"))
            d["result"] = json.loads(d["result_json"]) if d.get("result_json") else None
            del d["result_json"]
            out.append(d)
        return out

    def save_march(self, march: dict[str, Any]) -> int:
        if march.get("id"):
            self.conn.execute(
                """
                UPDATE marches SET status=?, depart_at=?, arrive_at=?, return_at=?,
                  result_json=?, troops_json=? WHERE id=?
                """,
                (
                    march["status"],
                    march.get("depart_at"),
                    march.get("arrive_at"),
                    march.get("return_at"),
                    json.dumps(march.get("result")),
                    json.dumps(march["troops"]),
                    march["id"],
                ),
            )
            self.conn.commit()
            return int(march["id"])
        cur = self.conn.execute(
            """
            INSERT INTO marches(device_id,city_id,action,from_x,from_y,to_x,to_y,troops_json,
              depart_at,arrive_at,return_at,status,result_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                march["device_id"],
                march["city_id"],
                march["action"],
                march["from_x"],
                march["from_y"],
                march["to_x"],
                march["to_y"],
                json.dumps(march["troops"]),
                march["depart_at"],
                march["arrive_at"],
                march.get("return_at"),
                march.get("status") or "going",
                json.dumps(march.get("result")),
            ),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def map_seeded(self) -> bool:
        return self.meta_get("map_seeded") == "1"

    def get_tile(self, x: int, y: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM map_tiles WHERE x=? AND y=?", (x, y)).fetchone()
        return dict(row) if row else None

    def set_tile(self, tile: dict[str, Any], commit: bool = True) -> None:
        self.conn.execute(
            """
            INSERT INTO map_tiles(x,y,terrain,owner_device,city_id,npc_level)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(x,y) DO UPDATE SET
              terrain=excluded.terrain, owner_device=excluded.owner_device,
              city_id=excluded.city_id, npc_level=excluded.npc_level
            """,
            (
                tile["x"],
                tile["y"],
                tile["terrain"],
                tile.get("owner_device"),
                tile.get("city_id"),
                tile.get("npc_level"),
            ),
        )
        if commit:
            self.conn.commit()

    def seed_map_tiles(self, tiles: list[tuple]) -> None:
        """Bulk insert (x,y,terrain,owner,city_id,npc_level)."""
        self.conn.executemany(
            "INSERT OR REPLACE INTO map_tiles(x,y,terrain,owner_device,city_id,npc_level) VALUES(?,?,?,?,?,?)",
            tiles,
        )
        self.conn.commit()

    def map_window(self, x0: int, y0: int, w: int, h: int) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM map_tiles
            WHERE x >= ? AND x < ? AND y >= ? AND y < ?
            ORDER BY y, x
            """,
            (x0, x0 + w, y0, y0 + h),
        ).fetchall()
        return [dict(r) for r in rows]

    def close(self) -> None:
        self.conn.close()
