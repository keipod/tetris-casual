# PRD — 포켓몬 잡기 (구: 사파리 스냅)

경로: `casual/catch/`  
허브 카드명: 포켓몬 잡기  
담당: 구현 에이전트 (이 문서만 근거)

## 한 줄

초원에서 돌아다니는 포켓몬을 조준·포획하고, **갖고 싶게 만드는 고퀄 도감 카드**로 소장한다.

## 목표

- 버블슈터의 roam(필드 배회) 패턴을 포획 루프로 재구성한다.
- 포획 성공 시 도감 카드가 전면 연출된다. 카드는 수집품처럼 보여야 한다.
- 잡은 포켓몬은 localStorage에 영구 소장된다.
- 모바일 터치 우선, 한국어 UI.

## 하지 말 것

- 버블슈터 `casual/bubble/` 로직을 이 폴더로 복사해 섞지 말 것.
- 실사 사진 스냅 카메라 시뮬은 제외 (이름은 잡기다).
- 서버 DB, 로그인, 멀티플레이.
- 유료 API 직접 호출. 이미지 생성은 로컬 airouter만 (`serve.py` 프록시 `/api/airouter`).

## 플레이 루프

1. 초원 필드에 포켓몬 3~8마리가 배회한다 (PokeAPI Gen V animated GIF).
2. 플레이어가 몬스터볼을 짧게 조준 드래그해 던진다. 탭만으로는 안 나간다.
3. 볼이 맞으면 흔들림 연출 → 확률 판정 → 잡힘 / 도망.
4. 잡히면 **카드 플립 연출** + 울음소리(PokeAPI cry) + 햅틱.
5. 도감에서 카드 갤러리를 다시 볼 수 있다. 중복 포획은 카드에 ★ 또는 개체값(간단한 IV 한 줄)만 갱신.

## 도감 카드 (핵심 품질)

소유욕이 생기려면 카드가 게임의 보상이어야 한다.

필수 시각:

- 세로 비율 카드 (약 63:88, 포켓몬 TCG 감성).
- 홀로그램/포일 하이라이트 (CSS `background-position` + pointer tilt, reduced-motion이면 정지).
- 타입별 테두리 색 (PokeAPI types).
- 공식 공식화 아트: `sprites.other["official-artwork"].front_default`. 실패 시 `front_default`.
- 번호 `#025`, 한글 이름(PokeAPI `names` ko), 영문 이름 작게.
- 플레이버 텍스트: `pokemon-species` flavor_text_entries 중 `ko` 우선, 없으면 `en`.
- 키/몸무게, 타입 칩 1~2개.
- 잡은 시각, 잡은 장소 카피(초원 루트 랜덤 이름이면 충분).
- 배경은 타입 그라데이션 + 은은한 패턴. 흰 사각형 금지.

카드는 정적 PNG 한 장이 아니라 **DOM 카드 컴포넌트**로 만든다. 공유용 캡처는 후순위.

## 에셋 / API

- 스프라이트·울음·설명: `https://pokeapi.co` + `raw.githubusercontent.com/PokeAPI/...`
- 필드 배경: `casual/bubble/assets/terrain-grass.png` 재사용 가능. 복사하거나 상대경로 `../bubble/assets/terrain-grass.png`.
- 볼 그래픽: CSS/캔버스로 충분. airouter t2i는 카드 배경 텍스처 1장 정도만 (실패해도 CSS 폴백).
- airouter: `http://192.168.223.101:20101` — 브라우저에서는 `/api/airouter` (CORS). GitHub Pages에선 생성 스킵.

대상 풀 (초기): 버블 `ROAM_IDS` + 스타터·피카츄·이브이 라인. 1세대 전부는 v1에서 과함. 최소 25종.

## 화면

- `index.html` + `style.css` + `game.js` (버블과 동일한 정적 3파일 구조).
- 상단: 목록으로, 도감 연 버튼, 잡은 수 / 전체.
- 메인: 필드 캔버스 또는 DOM roamers.
- 오버레이: 포획 카드, 도감 그리드.

## 조작

- 볼 조준: 하단 런처에서만 pointerdown. 드래그 후 릴리스로 발사. 탭 즉시 발사 금지 (버블과 동일 실수 재발 금지).
- 포켓몬 탭: 울음 + 짧은 리액션. 포획은 아님.

## 데이터

localStorage 키: `catch_dex_v1`

```json
{
  "caught": {
    "25": { "count": 2, "bestStars": 3, "caughtAt": 0, "route": "초원 3번도로" }
  }
}
```

## 수락 기준

- [ ] 허브 `casual/index.html`에 카드가 있고 `catch/`로 진입된다.
- [ ] 드래그 발사로만 볼이 나간다.
- [ ] 포획 성공 시 고퀄 카드가 화면을 차지하고, 닫은 뒤 도감에서 다시 열린다.
- [ ] 새로고침 후에도 잡은 목록이 남는다.
- [ ] 사운드 토글이 울음/효과음을 끈다.
- [ ] 모바일 세로에서 플레이 가능 (터치, safe-area).

## 검증

브라우저에서 `casual/catch/` 로드, 포획 1회, 새로고침 후 도감 확인. `selfTest`가 있으면 포획 판정·저장 직렬화를 넣을 것.
