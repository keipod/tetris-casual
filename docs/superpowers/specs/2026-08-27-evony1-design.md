# Evony Age I — Design Spec

**Status:** Approved in prior session (2026-08-26); written 2026-08-27. Port updated (48944→48951; omok took 48944).

## Context

Portal (`casual/`) needs an Evony Age I–faithful browser MMORTS: hub → server select (Server 1) → shared world, device-bound lords, 1× timers.

## Decision

**Stack:** Canvas isometric client + Python `ThreadingHTTPServer` + WebSocket + SQLite (same pattern as `poke-world` / `tcg`).

**Path:** `casual/evony1/` · **Port:** `48951` · **DB:** `casual/evony1/evony1.sqlite` (gitignored)

### Architecture

- Hub card → lobby (Server 1) → WS `hello{device_id}` → authoritative server tick
- Server owns resources, build/research/train/march timers, combat, map
- Client: TOWN / CITY / MAP canvas + parchment DOM UI; `localStorage` for `device_id` + locale
- Reset: settings → confirm → delete lord by `device_id`, create fresh with beginner protect

### Data model

- **Lord:** device_id, nick, prestige, honor, title, beginner_protect_until (7d)
- **City:** up to 10/player; (x,y), name, loyalty, tax, wall, pop, gold + food/wood/stone/iron
- **TOWN:** Age I building set; 1 construction queue/city
- **CITY fields:** Farm / Sawmill / Quarry / Ironmine; slots scale with Town Hall
- **Research:** Academy tree; 1 research queue; shared across cities when prereqs met
- **Troops:** Worker … Catapult; train from idle pop; food upkeep
- **Map:** flat/forest/hill/lake/river/player_city/NPC; Scout/Attack/Transport/Reinforce
- **Extras:** beginner quests, reports/mail, world chat, Wheel of Fortune (1 token/day); Shop/Alliance/Forum as UI shell + minimal

### UI / protocol

- Top: ticker + TOWN/CITY/MAP + clock + EVONY mark
- Center: isometric canvas; Right: portrait/title/city/resources; Bottom: queues + icons + chat
- i18n: EN default, KO optional (`i18n.js`)
- WS in: hello, set_nick, build, upgrade, research, train, march, chat, map_query, reset_account, spin_wheel
- WS out: snapshot, delta, chat, report, error

### Phases

1. Scaffold + hello/snapshot + device_id/reset + hub/ports
2. Economy: 1× resource tick, TOWN/CITY build/upgrade, pop/tax, beginner quests
3. Military: train, upkeep, rally/march, NPC combat + reports
4. World: shared map PvP actions + world chat
5. Systems: full Academy, wall, WoF, mail, multi-city, EN/KO
6. Polish: sprites/FX, CDP E2E, vision check via airouter `qwen3-vl:32b`

### Non-goals

- No OAuth/ops auth
- No kie.ai by default (ComfyUI via airouter only if assets needed; ask before paid APIs)
- Do not touch other agents’ dirty trees

### Reinforcements (this write-up)

- World size **80×80** (playable density without huge payloads; map_query windows)
- Early building times match Age I tutorial scale (minutes), mid/late keep 1× formulas
- Starter city near map center with flat fields; NPC barbarian camps for early marches
- `*.sqlite` / `*.sqlite-*` gitignored under `casual/evony1/`

## Consequences

Playable portal MMORTS with shared persistence; full Age I surface area ships in phases but architecture must not block later systems.
