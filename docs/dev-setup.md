# Development Environment Setup

이 문서는 로컬 및 CI 환경에서 `@eslint/js` 설치 중 `403 Forbidden` 문제를 예방하고, 문제가 발생했을 때 빠르게 복구하는 방법을 정리합니다.

## 필수 버전
- Node.js: **18.18.0 이상**
- npm: **9.0.0 이상**

루트 `package.json` 의 `engines` 필드가 동일 조건을 강제하며, GitHub Actions 역시 Node 20.x 를 사용합니다.

## npm 레지스트리 리셋
루트 `npm install` 또는 `npm --prefix frontend install` 실행 시 자동으로 `scripts/ensure-registry.js` 가 동작하여 다음을 수행합니다.

1. 현재 `npm` / `node` 버전과 레지스트리 설정 출력
2. `registry.npmjs.org` 로 레지스트리를 강제 재설정
3. `@eslint:registry`, `proxy`, `https-proxy` 설정 제거
4. `npm cache clean --force`

수동으로 실행하려면:
```bash
npm run fix:registry
```
또는
```bash
./scripts/fix-npm-registry.sh
```

## ESLint 우회 모드
사내 방화벽 등으로 `@eslint/js` 다운로드가 차단될 경우 다음 환경변수로 우회 설치가 가능합니다.

```bash
ESLINT_OPTIONAL=true npm --prefix frontend install
```

- `frontend/scripts/preinstall.cjs` 가 실행되어 `eslint`, `@eslint/js`, 관련 플러그인을 임시로 제거한 `package.json` 으로 설치를 진행합니다.
- 설치가 끝나면 `frontend/scripts/postinstall.cjs` 가 백업된 원본 `package.json` 을 자동 복구합니다.

우회 모드는 린트가 비활성화되므로, 네트워크 문제가 해결되면 환경변수를 제거하고 다시 설치해야 합니다.

## 빠른 점검 커맨드
403 에러 발생 시 아래 명령으로 환경을 재설정합니다.

```bash
npm_config_registry=https://registry.npmjs.org npm --prefix frontend install
```

또는 설정 스크립트를 직접 실행한 뒤 재시도합니다.

## 회귀 테스트
레지스트리 설정 및 버전을 검증하려면 루트에서 다음을 실행합니다.

```bash
npm run test:npm-registry
```

이 스크립트는 다음을 확인합니다.
- Node ≥ 18.18.0, npm ≥ 9.0.0
- `npm config get registry` 가 `https://registry.npmjs.org/` 인지
- `npm config get "@eslint:registry"` 가 비어 있거나 동일 레지스트리인지
- `https://registry.npmjs.org/@eslint%2Fjs` HEAD 요청이 200/3xx 응답인지 (실패 시 경고)

문제가 재발하면 위 테스트 결과와 함께 네트워크 설정을 점검하세요.
