# Component Keys Standard

## 목적
- 배포 게이트(`deploy_guard`) 통과를 위해 DS 컴포넌트의 Figma Component Key를 누락 없이 관리한다.

## 입력 포맷 표준
- 허용 JSON 포맷 1:
```json
{
  "component_keys": {
    "YEO_Button": "abcd1234",
    "YEO_Input": "efgh5678"
  }
}
```
- 허용 JSON 포맷 2:
```json
{
  "YEO_Button": "abcd1234",
  "YEO_Input": "efgh5678"
}
```

## 실행 순서
1. `npm run component-keys:template`
2. `generated/readiness/component-keys.request-form.md`에서 담당자별로 key 수집
3. `generated/readiness/component-keys.template.json`에 key 반영
4. `npm run component-keys:update -- generated/readiness/component-keys.template.json`
5. `npm run readiness:strict`

## 완료 기준
- `component_keys mapped: N/N`
- `npm run readiness:strict`가 0 exit code로 종료

## 품질 규칙
- 키가 비어있는 컴포넌트가 있으면 배포성 API는 차단된다.
- 신규 컴포넌트가 DS에 추가되면 동일 절차로 key를 즉시 등록한다.
