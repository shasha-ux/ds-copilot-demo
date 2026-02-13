# DS Copilot Demo

PRD/원페이저 문장을 입력하면 디자인시스템 기반 화면 계획을 생성하고,
`normal/empty/loading/error/skeleton` 상태 프리뷰를 보여주는 데모입니다.

## Team Shared Usage (로컬 없이 팀 공용)

팀원이 각자 `localhost`를 켤 필요 없이 쓰려면:

1. 서버를 공용 URL로 배포 (`render.yaml` 사용)
2. 플러그인 API 주소를 공용 URL로 고정
3. 조직에 플러그인 배포

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run plugin:configure-api -- https://YOUR_RENDER_URL
```

상세 문서: `/Users/shasha/Documents/파트너센터/ds-copilot-demo/docs/TEAM_DEPLOY.md`

## Run

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run start
```

브라우저에서 `http://127.0.0.1:4173` 접속.

디자이너 UX 개선 포인트:
- 템플릿 버튼(예약취소/예약리스트/신사업)으로 프롬프트 빠른 시작
- JSON/Swagger 샘플 버튼으로 데이터 컨텍스트 즉시 주입
- Confluence URL/기획 텍스트를 입력해 요구사항 맥락 반영
- Confluence 문서 검색(키워드) 후 링크 자동 채우기
- 선택한 피그마 화면의 레이어 구조를 읽어 다음 생성에 맥락 반영
- "수정 요청" 입력으로 생성 후 즉시 수정 반영(채팅식 편집)
- `One-Click Run`으로 생성→번들→저장→코드 export 연속 실행
- 입력 초안 자동 저장(localStorage) + `Ctrl/Cmd + Enter` 즉시 Generate
- `Schema URL` 입력 + `URL에서 불러오기`로 Swagger/Schema JSON 자동 주입

## Smoke Test

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run smoke
```

포트 바인딩이 제한된 환경에서도 생성/검증/Figma 이벤트 페이로드 로직을 검증할 수 있습니다.

## Verify (중간 점검 포함)

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run verify
```

다음 항목을 한 번에 점검합니다.
- 생성/검증/IR/코드 번들 핵심 계약
- Storybook 추출 결과 및 component key 추출
- 서버/플러그인 코드 문법
- UI/플러그인/README 필수 계약 문자열

전체 파이프라인 점검:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run verify:full
```

운영 준비도 점검:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run readiness
```

엄격 모드 점검(배포 게이트와 동일 조건):

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run readiness:strict
```

컴포넌트 키 템플릿 생성/업데이트:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run component-keys:template
npm run component-keys:update -- generated/readiness/component-keys.template.json
npm run component-keys:sync:stories
```

컴포넌트 키 운영 표준 문서:

`/Users/shasha/Documents/파트너센터/ds-copilot-demo/docs/COMPONENT_KEYS_STANDARD.md`

환경 변수 템플릿:

```bash
cp /Users/shasha/Documents/파트너센터/ds-copilot-demo/.env.example /Users/shasha/Documents/파트너센터/ds-copilot-demo/.env
```

파일럿 리포트 생성:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run pilot -- "신사업 예약 취소 플로우" "{\"cancelReason\":[\"고객요청\",\"중복예약\",\"기타\"]}" "balanced"
```

디자이너 시나리오 리포트 생성:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run report:scenario -- "예약 리스트 화면을 만들어줘" "{\"rows\":[{\"reservationId\":\"R-1\",\"partnerName\":\"강남점\",\"status\":\"pending\"}]}" "balanced" "designer-check-1"
```

생성 파일: `generated/reports/designer-check-1.md`

원클릭 파이프라인 실행(로컬 CLI):

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run pipeline -- "예약 취소 팝업 생성" "{\"cancelReason\":[\"고객요청\",\"중복예약\",\"기타\"]}" "manual_pipeline_run"
npm run pipeline -- "예약 취소 팝업 생성" "{\"cancelReason\":[\"고객요청\",\"중복예약\",\"기타\"]}" "manual_pipeline_run_hifi" "hifi"
```

## Included

- 무의존성 Node HTTP API (`/api/generate`)
- Fidelity 비교 생성 API (`/api/generate-matrix`)
- IR 변환 API (`/api/ir`)
- 코드 출력 API (`/api/code-export`)
- 코드 번들 출력 API (`/api/code-export-bundle`)
- 코드 번들 저장 API (`/api/code-export-bundle/save`)
- 저장 번들 목록 API (`/api/code-export-bundle/saved`)
- 저장 번들 상세 API (`/api/code-export-bundle/saved/:name`)
- 번들 아카이브 생성 API (`POST /api/code-export-bundle/archive`)
- 번들 아카이브 다운로드 (`GET /api/code-export-bundle/archive/:name`)
- 파이프라인 실행 API (`POST /api/pipeline/run`)
- 파이프라인 실행 이력 API (`GET /api/pipeline/runs?limit=50`)
- 컴플라이언스 체크 API (`POST /api/compliance/check`)
- 승인 요청/승인/조회 API (`POST /api/approvals/request`, `POST /api/approvals/approve`, `GET /api/approvals`)
- 프로젝트 생성/목록/조회/수정 API (`POST /api/projects`, `GET /api/projects`, `GET/PATCH /api/projects/:id`)
- 프로젝트 문맥 기반 생성 API (`POST /api/projects/:id/generate`)
- 프로젝트 문맥 기반 3안 생성 API (`POST /api/projects/:id/generate-matrix`)
- Figma 이벤트 수신 API (`/api/figma/events/onDesignRequest`, `/api/figma/events/onAssetValidation`, `/api/figma/events/onCodeExport`)
- DS 레지스트리 (`ds-registry.json`)
- 규칙 검증 결과(Severity + 메시지)
- 상태 세트 프리뷰
- 번들 파일 프리뷰(App/hooks/msw)
- sections 기반 분할 컴포넌트(`ScreenHeader/ScreenFilterBar/ScreenBody/ScreenFooter`) 생성
- 단일 파일 백업(`src/App.single.tsx`) 동시 생성
- 공통 타입 파일(`src/types/generated.ts`) + 분할 컴포넌트 타입 import 자동 생성
- 번들 아카이브(tar.gz) 생성/다운로드
- 파이프라인 실행 시 manifest + 실행 이력(JSONL) 자동 기록
- 생성/검증/배포 단계별 컴플라이언스 판정(신규 컴포넌트는 기본 Warn)
- PRD/원페이저 누적 컨텍스트 프로젝트 세션 저장 + revision 이력
- Fidelity(`lowfi/prototype/hifi`) 기반 생성 밀도/컴포넌트 셋 자동 조절
- 단일 PRD 입력으로 lowfi/prototype/hifi 3안 동시 생성 비교
- Figma 이벤트 payload 초안 (`onDesignRequest`, `onAssetValidation`, `onCodeExport`)
- Figma 플러그인 스캐폴드 (`figma-plugin/`)

## Registry Extractor

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run extract:registry
```

샘플 Storybook 메타데이터(`examples/storybook-sample.json`)를 읽어
`generated/ds-registry.generated.json`을 생성합니다.

## Storybook Source Extractor

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run extract:stories
```

`examples/storybook-src/*.stories.tsx`를 스캔해
`generated/ds-registry.from-stories.json`을 생성합니다.

실제 사내 스토리북 경로를 쓰려면:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
STORYBOOK_SRC_DIR=/absolute/path/to/storybook npm run extract:stories
```

`component_keys`를 레지스트리에 즉시 동기화:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run component-keys:sync:stories
# 또는
STORYBOOK_SRC_DIR=/absolute/path/to/storybook npm run component-keys:sync:stories
```

## Real Data Context Input

`dataSchema`에 JSON 샘플 또는 Swagger(OpenAPI JSON)를 넣으면 생성 plan과 코드 번들(`mocks/handlers/App`)에 반영됩니다.

- JSON 샘플 예시: `/Users/shasha/Documents/파트너센터/ds-copilot-demo/examples/data-sample.json`
- Swagger 예시: `/Users/shasha/Documents/파트너센터/ds-copilot-demo/examples/swagger-sample.json`

Swagger를 넣으면 첫 `GET` path를 mock endpoint로 사용하고, enum 값(status/cancelReason)을 컴포넌트 옵션에 매핑합니다.

`dataSchema` 대신 `dataSchemaUrl`도 지원합니다.
- 서버 API: `POST /api/data-schema/fetch` with `{ "url": "https://.../openapi.json" }`
- 생성/매트릭스/코드 export API에 `dataSchemaUrl`를 같이 전달하면 URL fetch 결과를 자동 사용합니다.
- 보안을 위해 `DS_ALLOWED_SCHEMA_HOSTS`(comma-separated)를 설정하면 허용 도메인만 fetch합니다.
- 인증이 필요한 사내 Swagger는 서버 환경변수로 헤더를 주입합니다.
  - Bearer: `DS_SCHEMA_FETCH_AUTH_MODE=bearer`, `DS_SCHEMA_FETCH_BEARER_TOKEN=...`
  - Custom Header: `DS_SCHEMA_FETCH_AUTH_MODE=header`, `DS_SCHEMA_FETCH_HEADER_NAME=X-API-KEY`, `DS_SCHEMA_FETCH_HEADER_VALUE=...`
  - 타임아웃: `DS_SCHEMA_FETCH_TIMEOUT_MS=7000`
- 프로젝트 생성/저장 시 `dataSchemaUrl`도 함께 저장되며, 프로젝트 재실행 시 URL 스키마가 자동 재사용됩니다.

## Figma Plugin (Scaffold)

`figma-plugin/manifest.json`을 기준으로 로컬 플러그인 import 후,
UI에서 API base(`http://127.0.0.1:4173`)를 맞추면 생성 요청/이벤트 전송 테스트를 할 수 있습니다.
플러그인 UI는 템플릿(예약취소/예약리스트/신사업), JSON/Swagger 샘플 주입, 원클릭 실행(생성+피그마 반영), 초안 자동 저장, `Ctrl/Cmd + Enter` 생성 단축키를 지원합니다.
`피그마에 반영` 버튼을 누르면 계획 기반 오토레이아웃 프레임/상태칩/Dev Notes가 생성됩니다.
`ds-registry.json`의 `component_keys`를 채우면 플러그인이 컴포넌트 key import를 시도하고, 실패 시 fallback 칩으로 렌더링합니다.
선택한 영역이 있으면 해당 좌표/사이즈를 기준으로 생성 프레임을 배치합니다.
생성 plan의 `componentProps`가 있으면 플러그인이 인스턴스 variant/size 속성 바인딩을 시도합니다.
`layout_strategy`가 있으면 버튼을 Action Row로 그룹핑하고, 입력/테이블 계열을 stretch 정렬로 배치합니다.
`pattern_strategy`가 있으면 Modal Footer 액션 분리, Table 상단 Filter Bar 자동 배치를 적용합니다.
생성 plan에 `sections(header/body/footer/filterBar)`가 포함되면 플러그인은 sections 기반 렌더를 우선 적용합니다.
코드 export(`irToReactCode`)도 동일 sections 구조를 반영해 JSX를 생성합니다.
플러그인 `Fidelity` 입력값(`lowfi/prototype/hifi`)에 따라 상태칩 개수, 구조 단순화, Dev Notes(Reasoning/Compliance 포함) 밀도가 달라집니다.
플러그인에서 `3안 생성(lowfi/prototype/hifi)` 버튼을 누르면 `/api/generate-matrix` 결과를 받아 fidelity별 후보를 즉시 전환/반영할 수 있습니다.
플러그인 `3안 모두 반영` 버튼을 누르면 lowfi/prototype/hifi 프레임을 가로 배치로 한 번에 생성해 비교 리뷰할 수 있습니다.
`여러 안 생성`은 기본 3안 + 대안안(Prototype Alt)까지 생성합니다.
플러그인 `기획문서 불러오기`는 `/api/context/fetch`를 통해 Confluence 페이지 텍스트를 요약해 생성 입력에 반영합니다.
플러그인 `컨플 문서 찾기`는 `/api/context/search`를 호출해 검색 결과를 제공하고, `선택 문서 링크 채우기`로 URL 입력을 자동화합니다.
플러그인 `선택화면 맥락 읽기`는 현재 선택된 프레임의 레이어/텍스트 힌트를 생성 입력에 반영합니다.
플러그인 `선택화면 수정 반영`은 수정요청 문장을 추가 맥락으로 사용해 재생성 후 즉시 반영합니다.
`3안 모두 반영` 시 가능한 경우 프레임 간 프로토타입 클릭 링크를 자동 연결합니다.
`/api/generate-matrix`는 위반/복잡도/균형 기준 점수로 후보를 랭킹하고 추천 fidelity를 함께 반환하며, 플러그인은 추천안을 자동 선택합니다.
랭킹 가중치는 `ds-registry.json`의 `ranking_policy`로 조정할 수 있습니다. (severity/block/complexity/balance/fidelity bonus)
팀별 기본 추천 성향은 `ds-registry.json`의 `ranking_presets`로 관리하며, 프로젝트별 `rankingPreset`(예: `balanced`, `speed_first`, `hifi_first`)으로 오버라이드할 수 있습니다.
웹 데모에서 `Ranking Policy Override (JSON)`과 `Project Config Save`를 사용하면 프로젝트별 가중치 오버라이드를 직접 저장할 수 있습니다.
플러그인에서도 `Project ID`, `Ranking Preset`, `Ranking Policy Override (JSON)`을 입력해 프로젝트 단위 추천 정책을 바로 저장/실행할 수 있습니다.
플러그인 `프로젝트 목록`/`프로젝트 불러오기` 버튼으로 저장된 프로젝트 설정을 조회해 바로 적용할 수 있습니다.
배포 성격 작업은 승인 정책(`approval_policy`)에 따라 승인 토큰이 필요하며, 웹 데모의 Approval 패널에서 요청 조회/승인 후 재실행할 수 있습니다.
승인 정책은 역할 기반으로 동작하며(`allowed_roles`, `action_roles`), 승인 시 approver role이 요청된 역할과 일치해야 통과됩니다.
승인 토큰은 `approval_policy.token_ttl_minutes` 내에서만 유효하며, `one_time_token=true`일 때 1회 사용 후 자동 폐기됩니다.
승인 목록은 `pending/approved/used/expired` 상태 기준으로 필터링할 수 있습니다.
승인 목록 조회 시 만료된 승인 토큰은 자동으로 `expired` 상태로 정리되며, `expiringSoon`/`minutesToExpiry` 필드로 만료 임박 요청을 확인할 수 있습니다.
배포성 API(`bundle save`, `pipeline run`, `project generate`)는 `deploy_guard` 조건(`component_keys`, `STORYBOOK_SRC_DIR`)을 만족하지 않으면 `412 Deploy guard blocked`로 차단됩니다.

### Figma Design Library Sync

디자인 라이브러리 컴포넌트 key를 레지스트리(`component_keys`)에 자동 동기화할 수 있습니다.

- 상태 조회: `GET /api/figma/library/status`
- 동기화(점검/적용): `POST /api/figma/library/sync`
  - `{"dryRun": true}`: 매칭 점검만
  - `{"dryRun": false}`: 실제 적용
  - `{"fileKey":"..."}` 또는 서버 환경변수 `FIGMA_LIBRARY_FILE_KEY` 사용
- `FIGMA_ACCESS_TOKEN` 설정 시 Figma API에서 직접 컴포넌트 목록 조회

플러그인 UI의 `라이브러리 상태 / 키 매칭 점검 / 라이브러리 적용` 버튼으로 동일 작업 실행 가능.
매칭 엔진은 `component_aliases` + 토큰 유사도(Jaccard) 기반으로 이름 편차(`RadioGroup`, `Text Area`, `Select`)를 보정합니다.
매칭 실패 시 리포트에 상위 후보 3개가 추천됩니다.

## Next

- Storybook/TS 기반 DS Registry 자동추출
- WebContainer + HMR 런타임
- Figma Plugin 실제 연동
- IR 기반 Code Export 고도화
Confluence 검색/불러오기 환경 변수:

```bash
DS_ALLOWED_CONTEXT_HOSTS=gccom.atlassian.net
DS_CONFLUENCE_BASE_URL=https://gccom.atlassian.net
DS_CONFLUENCE_EMAIL=you@company.com
DS_CONFLUENCE_API_TOKEN=xxxxx
```
