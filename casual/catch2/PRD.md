# PRD — 포켓몬 잡기 2

경로: `casual/catch2/`  
허브: 포켓몬 잡기 2 · 포트 48902

## 한 줄

타일맵 초원 탐험 → 조우 → Three.js 3D 턴제 배틀 또는 타입 카드 승부로 포획.

## 플레이

1. 성별·스타터 선택 후 필드 이동 (D-pad / WASD)
2. 긴 풀에서 조우 → **배틀** / **카드 승부**
3. 배틀: 싸운다·가방(볼)·포켓몬·도망 (정식 메뉴 축소판)
4. 카드: 상성×전투력 비교, 승리면 포획
5. 파티 6 + 박스, `catch2_save_v1`

## 에셋

`python3 casual/catch2/tools/generate_assets.py` → airouter `t2i_z_image_turbo_v1`  
캐릭터는 `assets/characters/male.jpg` / `female.jpg` 복장·헤어를 프롬프트에 반영 (img2img 엔드포인트 없음).

## 검증

- 허브 `catch2/` 진입
- 조우 후 배틀 포획 1회, 카드 승부 1회
- 새로고침 후 파티 유지
- airouter 없이도 정적 에셋으로 플레이
