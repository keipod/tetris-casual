# Pokémon TCG Implementation Plan

> **For agentic workers:** Execute inline in this session.

**Goal:** Ship a multiplayer Pokémon TCG duel with lobby presence, room codes, and Hearthstone-style juice.

**Architecture:** Authoritative Python WebSocket server + static client. Game rules in `engine.py`; transport/presence in `server.py`.

**Tech Stack:** Python 3 stdlib (HTTP+WS), vanilla JS/CSS/HTML, PokeAPI CDN art

**Spec:** `docs/superpowers/specs/2026-08-21-pokemon-tcg-design.md`

## Files
- Create: `casual/tcg/catalog.json`, `engine.py`, `server.py`, `index.html`, `style.css`, `game.js`, `fx.js`
- Modify: `casual/index.html`, `ports.json`, `portctl.py`

## Tasks
1. Catalog + pure engine + tests via `python3 -c` smoke
2. WebSocket server (lobby, challenge, room, match, CPU)
3. Client lobby + board + FX
4. Hub/port wiring
5. Browser verify two tabs + CPU
