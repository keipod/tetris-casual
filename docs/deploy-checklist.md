# 배포 체크리스트 — game.tainery.com/casual

정적 게임 + 멀티플레이 서버(TCG·테니스·승부차기)를 실제 호스팅할 때 확인할 항목들.
저장소에 프로덕션 구성 문서가 없어 **단일 워커 + 리버스 프록시**를 가정으로 작성했다.

## 1. 정적 게임 (casual/*)

- [ ] `serve.py`는 **로컬 개발 전용**. 프로덕션에 띄우지 않는다 (airouter GPU 프록시 포함 — 프로덕션에서 띄울 경우 프록시는 Host가 사설 대역일 때만 동작하도록 가드돼 있음).
- [ ] 게임 에셋 배포는 webhub 파이프라인 사용 (`.gitignore` 정책: 일부 게임 디렉토리는 git 추적 제외).
- [ ] `casual/assets/*`(mobile-hardening, sfx-bank, safe-storage)는 모든 게임이 상대경로로 참조 — 디렉토리 구조 변경 시 전 게임 영향.
- [ ] JS 갱신 시 브라우저 휴리스틱 캐시가 이전 버전을 재사용할 수 있다 → 갱신된 파일을 참조하는 HTML의 `<script src="...?v=N">` 버전을 올린다 (lol 패턴 참고).

## 2. TCG 멀티플레이 서버 (casual/tcg/server.py)

아키텍처 전제: **프로세스 1개 + 메모리 상태** (clients/rooms/matches/challenges). DB 없음.

- [ ] **워커/프로세스 반드시 1개로 실행** — 2개 이상이면 로비·매치가 프로세스별로 분리되어 멀티플레이 파탄. (스케일아웃이 필요해지면 상태를 Redis/SQLite로 이전하는 별도 작업 필요)
- [ ] 리버스 프록시(nginx/Caddy/Cloudflare)가 WebSocket Upgrade를 중계하는지 확인:
  - `GET /ws` (또는 `/casual/tcg/ws`) → 101 Switching Protocols 전달
  - 프록시 read/send 타임아웃 ≥ 60s (서버가 25초 주기로 ping을 보내 커넥션을 유지한다)
- [ ] 서버가 재시작되면 진행 중 매치는 **모두 유실된다** (메모리 상태) — 점검·배포는 매치가 없을 때 실행.
- [ ] `PORT`(기본 48900) 환경변수, `0.0.0.0` 바인드 → 프록시 뒤에서만 노출할 것. 직접 공개 노출 금지.
- [ ] Cross-Origin WebSocket 차단: 기본으로 `Origin` 헤더의 호스트 == `Host` 헤더를 검증한다. 프록시가 Host를 재작성한다면 `WS_ALLOWED_ORIGINS=game.tainery.com` 식으로 허용 목록을 지정.
- [ ] 서버 하드닝 내역(2026-08): 프레임 64KB 제한, 메시지 레이트 리밋(40개/10초), 서버 하트비트 ping + 유령 커넥션 정리, challenge 60초 만료, 종료된 매치 5분 후 정리, 클라이언트별 send 락(프레임 인터리빙 방지), SIGTERM graceful shutdown.

## 2.5 테니스·승부차기 멀티플레이 서버 (poke-tennis / poke-penalty)

TCG와 동일 전제(프로세스 1개 + 메모리 상태, DB 없음). 포트는 각각 48941 / 48942 (`ports.json`의 `script` 필드).

- [ ] `casual/poke-tennis/server.py`: 게임 시뮬레이션 없음 — 호스트 클라이언트가 권위 물리를 돌리고 서버는 input/state 릴레이만 함. 상태 스트림(호스트 ~22Hz) 때문에 레이트 리밋이 TCG와 다름(900개/10초). 프록시 타임아웃 ≥ 60s 필요.
- [ ] `casual/poke-penalty/server.py`: 서버 권위 엔진(`engine.py`) 방식 — TCG와 동일 프로토콜/하드닝. 키퍼 선택은 해소 전까지 `view_for`에서 완전 제거되므로 프록시 추가 설정 불필요.
- [ ] 두 서버 모두 `Origin` == `Host` 검증. 프록시가 Host를 재작성하면 `WS_ALLOWED_ORIGINS` 지정(TCG 섹션과 동일).

## 2.6 포켓몬월드 (프로덕션 = Cloudflare DO)

로컬 `casual/poke-world/server.py`는 개발용. **공개 멀티는 webhub-edge Durable Object** (`PokeWorldLobby`, 경로 `/casual/poke-world/ws`).

- [ ] `webhub/apps/edge/src/poke-world/{lobby,engine}.ts` + `wrangler.toml` 바인딩 `POKE_WORLD_LOBBY`
- [ ] 배포: `cd webhub/apps/edge && npm run deploy`
- [ ] 스모크: `wss://game.tainery.com/casual/poke-world/ws` → 101, welcome, CPU 매치

## 2.6 보드·카드 대전 (omok-online / gostop / baduk / alkkagi / seotda / baccarat / poker)

`casual/assets/mp_server.py` 공유 프레임워크. HTTPS 프로덕션에서는 클라이언트가 `wss://host/casual/<game>/ws` 로 붙는다 (전용 포트 `:4894x` 직접 노출 금지).

- [ ] 리버스 프록시가 각 게임의 `/casual/<game>/ws` → 해당 프로세스 `:48944`–`:48950` 로 WebSocket Upgrade 중계
- [ ] 게임별 프로세스 1개 (`ports.json` script 필드). `python3 portctl.py up omok-online` 등으로 기동
- [ ] Origin 검증은 TCG와 동일 (`WS_ALLOWED_ORIGINS` 필요 시 지정)


- [ ] 서버 사이드 DB 없음 — 유저 데이터는 전부 기기 로컬(localStorage). 프라이버시 관점 수집 항목 없음.
- [ ] localStorage 키는 게임별 네임스페이스(`2048.best`, `lol_sound` 등) — 신규 게임도 이 컨벤션 유지. 저장소 가용성 검사는 `casual/assets/safe-storage.js` 공용 모듈 사용.
- [ ] 허브 "저장한 거 다지우기"가 localStorage/sessionStorage/IndexedDB 전체를 지운다 — 같은 오리진에서 돌아가는 다른 서비스가 있다면 오리진 분리 필요.

## 4. 배포 전 스모크 테스트

```bash
python3 portctl.py status          # 포트 충돌/프로세스 확인
python3 -m py_compile casual/tcg/server.py serve.py
# TCG 서버 기동 후:
# 1) https://<도메인>/casual/tcg/ 접속 → 닉네임 설정 → 로비에 내 닉 보이는지
# 2) 두 브라우저로 방 코드 매칭 → 매치 진입 → 액션 동기화 확인
# 3) 탭 닫고 30초 뒤 로비에서 유령 유저가 사라지는지 (하트비트 정리)
```
