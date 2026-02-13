# DS Copilot 팀 공용 배포

## 1) Render로 서버 배포

1. Render에서 `New +` -> `Blueprint` 선택
2. 이 저장소 경로 연결 (`render.yaml` 자동 인식)
3. 환경변수 입력
   - (선택) `FIGMA_ACCESS_TOKEN`: 디자인 시스템 라이브러리에서 컴포넌트 키를 자동 수집할 때 사용
   - (선택, 구형 방식) `DS_CONFLUENCE_EMAIL`/`DS_CONFLUENCE_API_TOKEN`: 서버가 하나의 계정으로 컨플을 읽는 방식(권장 X)
   - (권장, 개인 연결) Atlassian OAuth 3LO:
     - `ATLASSIAN_CLIENT_ID`
     - `ATLASSIAN_CLIENT_SECRET`
     - `ATLASSIAN_REDIRECT_URI`: `https://YOUR_RENDER_URL/api/auth/atlassian/callback`
     - `ATLASSIAN_SCOPES`
   - (권장) `DS_CONFLUENCE_BASE_URL`: 예) `https://gccom.atlassian.net` (자원 선택에 사용)
   - (권장) `DS_ALLOWED_CONTEXT_HOSTS`: 예) `gccom.atlassian.net` (안전장치)
   - (선택) `DS_ALLOWED_SCHEMA_HOSTS`, `DS_SCHEMA_FETCH_*`: 데이터 문서(URL) 불러오기 허용 범위
4. 배포 완료 후 공용 URL 확인
   - 예: `https://ds-copilot-demo.onrender.com`

헬스체크:

```bash
curl https://YOUR_RENDER_URL/api/health
```

응답 `{"ok":true,...}` 이면 정상입니다.

## Git push가 막힐 때(회사 네트워크 등)

`git push`가 403/차단되는 환경에서는 GitHub API로 변경분만 업로드할 수 있습니다.

터미널에서:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
export GITHUB_REPO=shasha-ux/ds-copilot-demo
export GITHUB_TOKEN=...   # GitHub PAT (채팅에 붙여넣지 마세요)
npm run github:publish
```

## 2) 플러그인 공용 URL 고정

아래 명령 1회 실행:

```bash
cd /Users/shasha/Documents/파트너센터/ds-copilot-demo
npm run plugin:configure-api -- https://YOUR_RENDER_URL
```

자동 반영:
- `figma-plugin/ui.html`의 기본 API 주소
- `figma-plugin/manifest.json`의 `allowedDomains`

## 3) Figma 팀 배포

1. Figma Desktop: `Plugins > Development > Import plugin from manifest...`
2. `figma-plugin/manifest.json` 선택
3. 플러그인 동작 확인 후 조직 배포

이후 팀원은 로컬 서버 없이 공용 플러그인만 실행하면 됩니다.

## 보안 메모 (중요)

- 토큰은 Figma 플러그인 UI에 넣지 않습니다.
- 토큰은 Render(공용 서버)의 환경변수로만 설정합니다.
