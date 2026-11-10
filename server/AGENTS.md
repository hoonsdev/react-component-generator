# server/AGENTS.md

## Module Context

Bun 기반 AI 프록시 서버. `/api/generate`가 Anthropic/Gemini를 호출하고 응답을 react-live 실행 가능한 코드로 정규화한다.

## Tech Stack & Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). Node 전용 서버 코드로 바꾸지 않는다.
- HTTP 호출은 내장 `fetch`만 사용한다. SDK나 axios를 추가하지 않는다 (`server/index.ts:69`, `server/index.ts:101`).
- 모든 응답에 `CORS_HEADERS`를 붙인다. 새 응답을 추가할 때 누락하지 않는다 (`server/index.ts:51-55`).

## Implementation Patterns

- 프로바이더 호출 함수는 `string`(모델 원문 텍스트)을 반환한다. 후처리는 핸들러에서 `ensureRenderCall(stripCodeFences(text))`로 공통 적용한다 (`server/index.ts:188`).
- 모델 폴백은 `withModelFallback(models, attempt)`로 감싼다. 우선순위는 `GOOGLE_MODELS` 배열 순서 (`server/index.ts:5`, `server/index.ts:135`).
- 순수 함수는 `generator.ts`/`fallback.ts`에 추가하고 같은 폴더에 `*.test.ts`를 둔다.

## Testing Strategy

- 서버 테스트만 실행: `bunx vitest run server`
- 프로바이더 호출과 에러 매핑(`index.ts`)은 테스트가 없다. 순수 로직으로 분리 가능하면 분리해 테스트한다.

## Local Golden Rules

- Asymmetry: MAX_TOKENS 잘림 검사와 모델 폴백은 Google 경로에만 있다 (`server/index.ts:123-125`, `server/index.ts:135`). Anthropic 경로(`server/index.ts:68-96`)는 `stop_reason`을 확인하지 않고 폴백도 없다. 두 경로가 동일하게 동작한다고 가정하지 않는다.
- Double Defense: 시스템 프롬프트가 "코드펜스 금지", "render() 호출 필수"를 요구하지만(`server/index.ts:12`, `server/index.ts:16`) 서버도 `stripCodeFences`, `ensureRenderCall`로 다시 보정한다. 한쪽을 제거하지 않는다. 프롬프트 규칙을 바꾸면 보정 함수와 테스트도 함께 맞춘다.
- Hard Constraint: 시스템 프롬프트는 "import 금지, TypeScript 문법 금지, inline style만"을 강제한다 (`server/index.ts:10-11`, `server/index.ts:20`). react-live가 이를 실행하지 못하기 때문이므로 완화하지 않는다.
- Hard Constraint: 에러 매핑은 메시지 문자열의 `'503'`, `'429'` 포함 여부로 status를 결정한다 (`server/index.ts:194`, `server/index.ts:201`). 프로바이더 에러 메시지에는 반드시 HTTP status 코드를 포함한다 (`Claude API error: ${status}`).
- Security Boundary: 클라이언트가 보낸 `apiKey`가 환경변수보다 우선한다 (`server/index.ts:65`). 이 우선순위와 `ENV_KEYS` 노출 범위를 바꾸지 않는다.
