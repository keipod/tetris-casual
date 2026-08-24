# Pokémon TCG (casual) — Design Spec

## Context
캐주얼 허브에 공식 TCG 핵심 룰 + 하스스톤식 연출의 1v1 카드대전을 추가한다. 도감 잡기 진행도와는 독립 카드 풀.

## Decision
- Path: `casual/tcg/`, port **48900**, custom `server.py` (static + WebSocket)
- Matching: lobby presence challenge + 6-char room code + CPU practice
- Rules (v1): deck 20, bench ≤3, KO points to 3, Energy Zone (1/turn), weakness +20, no Resistance, no Trainer
- Authority: server validates moves; client plays FX from event queue
- Art: PokeAPI CDN official artwork

## Consequences
- Deploy requires the Python TCG server (not pure static hosting)
- Trainer/Item and 60-card constructed deferred
