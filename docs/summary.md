• casual/lol: LoL PC 조작 풀클론 (Y잠금·엣지스크롤·휠팬·Space홀드·Shift큐·` TCO·미니맵 L/R)
• casual/evony1: Evony Age I MMORTS scaffold (WS+SQLite, TOWN/CITY/MAP, hub card)
• docs/superpowers/specs/2026-08-27-evony1-design.md: Age I full-clone design
• casual/story: Princess Maker 2–inspired raising sim Phase 1 (schedule/stats/events/festival/pets)
• docs/adr/2026-08-26-princess-maker-story.md: gap analysis and phased plan
• casual/story: PM2 final loop (10→18, shops/equip/Cube/rivals, airouter assets)
• casual/story: airouter rich media (BGM×5, i2v title/ending, 18 t2i scenes/NPC/UI) + create/profile/diet/errantry
• casual/story: interactive errantry (fight/talk/search/flee), unequip, harbor/market/observatory activities + events
• casual/story: class/job mastery, war/harvest years, engagement, Cube tea/gift/praise loop
• casual/story: PM2 adventure combat (encounter→turn battle, loot/sin, dresses, monsters)
• casual/story: adventure map UI (pins→schedule/depart, world_map t2i)
• casual/story: responsive UI (full-bleed shell, hub/map/panel breakpoints)
• casual/story + sfx-bank: fix intermittent mute (unlock pause race / muted cloneNode)
• casual: shared responsive-shell.css + layout modes across hub/games
• casual: widen play-surface clamps (board/canvas/VN/dressup) for desktop
• casual: rs-desktop-stage media on 45+ games; cookie/catch/poke-world desktop polish
• casual/assets/sfx-bank: gesture auto-unlock + watchBgm; audit-fix custom BGM/AudioContext games
• casual/poke-world: Mario 840×1020 canvas map + airouter tile/deco bake + 2d6 3D dice
• webhub poke-world DO: `/casual/poke-world/ws` → PokeWorldLobby (프로덕션 연결끊김 수정)
• casual/poke-tennis: guest paddle/swing + host↔guest win sync, hub Origin WS
• casual/poke-penalty: zone ROW_Y fix, local handoff dual, CPU first-kick
• casual/poke-tennis: host-only state / guest-only input guard, lobby return, score sync
• casual/poke-penalty: bubble-aim ray reaches all 6 goal zones
• casual/assets/mp_client+mp_server: HTTPS path WS (`/casual/*/ws`), duel `ended` fallback, disconnect toast
• casual/tcg/engine: restore `_public_pending`/`_match_stats` (CPU 클릭 NameError 수정)
• portctl: `up hub`도 script 멀티플레이 서버 동시 기동 (CPU/온라인 무반응 방지)
• casual/quest: catch2-style external D-pad + responsive larger stage
