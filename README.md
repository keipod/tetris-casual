# tainery casual games

로컬 개발용 저장소입니다. **공개 배포는 [game.tainery.com/casual](https://game.tainery.com/casual/)** 에서만 제공합니다.

## 로컬 실행

```bash
./up.sh          # 허브 (48888)
./up-all.sh      # 전체 게임 포트
python3 portctl.py status
```

## 공유 모바일 모듈

모든 게임 페이지는 `casual/assets/no-select.css`(텍스트 선택 차단, 당김 새로고침 방지, 전체화면 버튼 스타일)와 `casual/assets/mobile-hardening.js`(컨텍스트 메뉴/롱프레스 차단, drag-to-refresh 이중 방어, 전체화면 토글 버튼 + 첫 터치 자동 진입, Wake Lock, 이모지 파비콘)를 링크해야 합니다.

- 게임별 전체화면 버튼 위치 지정: `<body data-mh-fs-pos="tr|tl|br|bl">` (미지정 시 충돌 회피 자동 배치)
- 첫 터치 자동 전체화면 제외: `<body data-mh-no-auto-fs>`
- 진동 등 헬퍼: `window.CasualMobile.vibrate(pattern)`

## 에셋 라이브러리

재사용 에셋은 [`library/`](library/)에 정리합니다.

| 팩 | 경로 | 비고 |
|----|------|------|
| Boom Beach | `library/boom-beach/` | curated / shapes / atlas / raw (배포 제외) |
| Pokémon | `library/pokemon/` | 트레이너·타일·UI·전투·버블 roam |
| StarCraft | `library/starcraft/` | 유닛·초상·커맨드 아이콘 |
| SFX / Match3 / Dressup 등 | `library/sfx`, `match3`, `dressup`, … | 공용 UI·테마 팩 |

안내: [`library/README.md`](library/README.md) · 목록: [`library/INDEX.md`](library/INDEX.md)

GitHub Pages는 사용하지 않습니다.
