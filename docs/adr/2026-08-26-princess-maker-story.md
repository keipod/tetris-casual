# ADR: 공주 이야기 → Princess Maker 2 지향 육성 시뮬

## Context
목표는 Gainax *Princess Maker 2* 스타일 육성 시뮬. Phase 1은 계절제 미니 루프였다.

## Decision
`casual/story`를 PM2 최종 루프로 확장한다. 다른 에이전트 파일은 건드리지 않는다.

### Phase 1 (완료)
- 나이 10→14, 계절×3칸, 기본 활동/축제/이벤트/엔딩

### Phase Final (이번)
- 나이 **10→18**, **12개월** 캘린더, 10월=추수 축제
- 도시 상점: 무기/옷/식당/잡화/성당/진료소/왕궁
- 장비(무기·갑옷·옷) + 소비 아이템 + 가방
- 집사 **큐브** 조언, 라이벌(로즈/릴리), 왕자 호감
- 병세(아픔→와병), 장난기, 가출, 연모
- 알바 숙련 랭크, 탐험 확장, 엔딩 다수
- airouter t2i로 상점·궁·NPC·아이콘 리소스 bake

### Media Rich / Gap fill
- 캐릭터 생성(혈액형·생일), 식단, 투구 슬롯, 다구간 원정(errantry)
- airouter **AceStep BGM** 5곡(title/hub/festival/adventure/ending)
- airouter **i2v** 타이틀·엔딩 루프 영상
- t2i 추가 BG/초상/UI 아이콘 (`tools/generate_rich_assets.py`)

## Consequences
- 세이브 키 `princess_maker_v2` (v1 자동 마이그레이션)
- 플레이 길이 증가(8년×12개월×3칸) — 의도된 PM2 밀도로 유지
- 미디어 파일은 `casual/story/assets/{bgm,video,bg,portraits,ui}/` 에 동봉
