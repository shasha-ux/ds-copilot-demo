# DS Copilot 팀 공용 배포

## 1) Render로 서버 배포

1. Render에서 `New +` -> `Blueprint` 선택
2. 이 저장소 경로 연결 (`render.yaml` 자동 인식)
3. 환경변수 입력
   - `FIGMA_ACCESS_TOKEN` (필수)
   - 필요 시 `DS_ALLOWED_SCHEMA_HOSTS`, `DS_SCHEMA_FETCH_*`
4. 배포 완료 후 공용 URL 확인
   - 예: `https://ds-copilot-demo.onrender.com`

헬스체크:

```bash
curl https://YOUR_RENDER_URL/api/health
```

응답 `{"ok":true,...}` 이면 정상입니다.

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
