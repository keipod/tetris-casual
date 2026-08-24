# Boom Beach assets

원본 덤프는 `casual/beach-defense/vendor/`에 흩어져 있던 것을 여기로 모았습니다.

| 경로 | 설명 | 대략 |
|------|------|------|
| `curated/game/` | `beach-defense`가 실제로 로드하는 bake PNG | ~4MB |
| `curated/selected/` | 이름 붙은 재사용 후보 (HQ, 포탑, 보병, 탱크, 보트, 잔디…) | ~14MB |
| `shapes/units/` | `.sc`에서 뽑은 유닛 shape | 다수 |
| `shapes/troop_icon/` | 병종 아이콘 shape | |
| `atlas/` | in-game / map / defenses 시트 | ~71MB |
| `raw/` | CDN fingerprint + `.sc` / `.sctx` | ~171MB |

## 추천 재사용

1. 새 TD/섬맵 → 먼저 `curated/selected/` + `curated/game/`
2. 추가 유닛/포탑 탐색 → `shapes/units/` (파일명 `units-shapeN.png`)
3. 시트에서 직접 자르기 → `atlas/`
4. 재추출 → `raw/` + `cr-sc-dump` / Supercell-Extractor (기존 vendor 툴)

## 호환

`casual/beach-defense/vendor/boom_beach_cdn` 등은 이 트리로 가는 심볼릭 링크를 둡니다.
