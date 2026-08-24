# 비치 디펜스 — Design

경로: `casual/beach-defense/`  
허브 카드명: 비치 디펜스  
날짜: 2026-08-22

## 한 줄

붐 비치풍 열대 섬에서, 바다로 상륙하는 적을 포탑으로 막아 HQ를 지키는 웨이브 TD.

## 확정 결정

| 항목 | 선택 |
|------|------|
| 플레이 루프 | 웨이브 TD (배치 후 자동 사격) |
| 분량 | 원맵·원세션 (웨이브 8~12) |
| 카메라 | 아이소메트릭 2.5D Canvas |
| 에셋 | airouter bake, 런타임 생성 없음 |
| 기술 베이스 | `casual/tower/` 패턴 (정적 HTML/JS) |

## 플레이

- 시작 골드 → 배치 단계 → 웨이브 시작
- 적: 해안 상륙 → 모래/잔디 경로(웨이포인트) → HQ
- HQ HP ≤ 0 → 패배 / 전 웨이브 클리어 → 승리
- 웨이브 사이: 건설 · 업그레이드(건물당 1단계) · 다음 웨이브
- 배속 1x / 2x, 일시정지
- 모바일 터치 배치 지원

### 방어 건물 3종

| ID | 역할 |
|----|------|
| `mg` | 기관총 — 빠름, 단일, 저비용 |
| `cannon` | 대포 — 느림, 강함, 단일 |
| `mortar` | 박격포 — 광역, 약함, 포물선 |

### 적 3종

| ID | 역할 |
|----|------|
| `rifle` | 보병 — 보통 속도·HP |
| `brute` | 돌격병 — 빠름, 약함 |
| `tank` | 탱크 — 느림, 튼튼, 비쌈(보상↑) |

## 비주얼

붐 비치 톤: 청록 바다, 흰 파도 라인, 모래·야자수·밝은 잔디, HQ는 나무+빨간 지붕.  
UI: 노란/주황 버튼, 두꺼운 외곽선, 밝은 HUD.  
FX: 머즐 플래시, 포탄 포물선, 피격 스파크, 처치 시 짧은 연기.

## 에셋 (airouter)

- 스크립트: `casual/beach-defense/tools/generate_assets.py`
- 출력: `casual/beach-defense/assets/`
- 엔드포인트: `http://192.168.223.101:20101/v1/images/generations` (또는 `serve.py` `/api/airouter` 프록시)
- 모델: `t2i_z_image_turbo_v1`
- 프롬프트 톤: `boom beach style, tropical island, bright sunny, game asset, clean silhouette, plain background`
- bake 대상 예: 섬 배경(또는 지형 타일), HQ, 포탑 3종(+업그레이드 변형), 적 3종, 투사체/폭발
- bake 실패 시: 기하·그라데이션 플레이스홀더로 플레이 가능 → 이후 교체
- 런타임 airouter 호출 금지 (Pages/CORS)

## 기술

- `index.html` / `style.css` / `game.js` (번들러 없음)
- Canvas 2D 고정 아이소 카메라
- 경로: 웨이포인트 배열, 적은 선분 보간
- 배치: 그리드 스냅, 사거리 원 프리뷰, 경로·HQ·기존 건물과 겹침 금지
- 투사체: 직선(기관총/대포) / 포물선(박격포)
- SFX: 가능하면 `casual/assets/sfx-bank.js` 재사용, 없으면 Web Audio 톤
- 허브: `casual/index.html` 카드 추가
- 포트: `ports.json`에 `beach-defense` 항목 추가

## 파일 구조

```
casual/beach-defense/
  index.html
  style.css
  game.js
  PRD.md                 # 구현 에이전트용 요약 (이 스펙과 동기)
  tools/generate_assets.py
  assets/                # bake 결과 (+ 플레이스홀더)
docs/superpowers/specs/2026-08-22-beach-defense-design.md
```

## 의도적 비범위 (MVP)

- 멀티맵 / 캠페인 / 세이브 진행도
- 영웅 · 스킬 · 액티브 포격
- 건물 이동·회전 고급 편집
- 온라인 공격 / PvP / 상대 기지 레이드
- Three.js / WebGL
- 런타임 AI 이미지 생성

## 성공 기준

1. 허브에서 「비치 디펜스」 진입 가능
2. 한 판: 배치 → 웨이브 → 승/패까지 완주
3. 포탑 3종·적 3종·업그레이드 1단이 체감됨
4. 붐 비치풍 색·섬·FX가 플레이스홀더만으로도 방향이 분명하고, bake 에셋이 있으면 교체됨
5. 모바일에서 터치로 포탑 배치 가능
6. airouter 없이도 정적 에셋/플레이스홀더로 플레이 가능
