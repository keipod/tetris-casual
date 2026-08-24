# Asset library

게임 간에 재사용하는 **로컬 에셋 라이브러리**입니다.  
공개 Cloudflare 배포(`casual/` → webhub)에는 **포함하지 않습니다**.

## 팩 목록

| 팩 | 경로 | 내용 | 배포/주의 |
|----|------|------|-----------|
| Boom Beach | `boom-beach/` | curated·shapes·atlas·CDN raw | ❌ Supercell IP |
| Pokémon | `pokemon/` | 트레이너·타일·UI·전투·버블 roam·앵그리 | CDN 아트는 런타임 PokeAPI |
| StarCraft | `starcraft/` | 유닛·초상·커맨드 아이콘 (starsim) | ❌ Blizzard IP |
| SFX | `sfx/` | Kenney식 UI `sfx_ui/` + `sfx-bank.js` | ✅ 공용 |
| Dressup | `dressup/` | 초상·베이스·배경·옷·코디 | ✅ |
| Match-3 | `match3/` | animals / foods / gems / shared / audio | ✅ |
| Characters | `characters/animals/` | 곰·강아지·양 등 (테트리스 테마) | ✅ |
| Shooter | `shooter/skyraid/` | 섬·적기·아이템·오디오 | ✅ |
| TD | `td/tower/` | 중세 타워·적·패스·오디오 | ✅ |
| Sports | `sports/volleyball/` | 비치·캐릭터·공·오디오 | ✅ |
| Audio | `audio/rhythm-bgm/` | 피카츄 리듬 BGM 9곡 | 용량↑ |
| UI chrome | `ui/quiz`, `ui/puzzle` | 도감/퍼즐 프레임 | ✅ |

## 경로 예

```text
library/sfx/ui/click1.ogg
library/sfx/sfx-bank.js
library/dressup/clothes/princess1/...
library/match3/gems/tile1.png
library/boom-beach/curated/game/hq.png
library/starcraft/units/terran_marine.png
library/pokemon/ui/fireball.png
```

게임 `assets/`로 **필요한 파일만 복사**한 뒤 배포하는 것을 권장합니다.

## 법적 고지

- Boom Beach / StarCraft 원본·추출물: 개인 로컬 작업용, 재배포 금지.
- Pokémon 공식 일러스트: 대부분 PokeAPI CDN. 로컬 bake는 우리 제작분.
- `sfx_ui`: Kenney 계열 UI 팩 (기존 `casual/assets`와 동일).

상세 목록: [`INDEX.md`](INDEX.md)
