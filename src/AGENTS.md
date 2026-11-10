# src/AGENTS.md

## Module Context

React 19 + Vite 프론트엔드. 상태는 `useComponentGenerator` 훅과 `App.tsx`의 로컬 state가 전부이며, 서버와는 `/api/*` 상대 경로로만 통신한다.

## Tech Stack & Constraints

- 상대 경로 `/api/...`만 사용한다. 호스트와 포트를 직접 쓰지 않는다 (Vite 프록시 의존: `src/hooks/useComponentGenerator.ts:23`, `src/App.tsx:25`).
- 타입 전용 import는 `import type`을 쓴다 (`verbatimModuleSyntax`: `tsconfig.app.json:17`, 예: `src/App.tsx:5`).
- `enum`, `namespace`, 생성자 파라미터 프로퍼티는 쓰지 않는다 (`erasableSyntaxOnly`: `tsconfig.app.json:26`). 유니온 리터럴 타입을 쓴다 (`src/types/index.ts:1`).
- 미사용 변수와 파라미터는 빌드 에러다 (`noUnusedLocals`, `noUnusedParameters`: `tsconfig.app.json:24-25`).
- 스타일은 전역 클래스명 + `src/App.css`, `src/index.css`로 작성한다. 컴포넌트 파일에 CSS import나 inline style을 추가하지 않는다 (inline style은 AI 생성 코드 전용).

## Implementation Patterns

- 컴포넌트는 `src/components/<PascalCase>.tsx`에 named export, props 인터페이스는 같은 파일 상단에 `<Name>Props`로 둔다 (`src/components/CodeView.tsx:3-5`). `App`만 default export다.
- 서버 호출과 목록 상태는 `src/hooks/useComponentGenerator.ts`에 모은다. 컴포넌트에서 `fetch('/api/generate')`를 직접 부르지 않는다. 단, 설정 조회(`/api/config`)는 `App.tsx`에서 직접 호출한다.
- 공용 타입은 `src/types/index.ts`에 둔다.

## Testing Strategy

- 실행: `bunx vitest run src`
- 환경은 jsdom이며 각 테스트 후 `cleanup()`이 자동 실행된다 (`src/test/setup.ts`).
- 패턴: `userEvent.setup()` + `screen.getByRole(..., { name })` 한국어 버튼 이름 조회 (`src/components/PromptInput.test.tsx`).

## Local Golden Rules

- Test Boundary: 테스트는 `PromptInput`뿐이다. `App`, `useComponentGenerator`, `ComponentCard`, `LivePreview`, `CodeView`는 테스트가 없다. 이 파일을 수정하면 `bun run dev`로 생성, 에러, 재생성, 삭제 경로를 직접 확인한다.
- Test Boundary: `PromptInput.test.tsx`가 버튼 이름 `'컴포넌트 생성'`, `'생성 중...'`을 그대로 조회한다 (`src/components/PromptInput.test.tsx:8`, `src/components/PromptInput.test.tsx:25`). 이 문구(`src/components/PromptInput.tsx:241-243`)를 바꾸면 테스트도 같이 바꾼다.
- Asymmetry: API 키 사전 검사는 `App.tsx`의 `handleGenerate`에만 있고 훅에는 없다 (`src/App.tsx:33-39`). 재생성도 `onRegenerate={handleGenerate}`를 거쳐야 검사가 적용된다 (`src/App.tsx:176`). 훅의 `generate`를 다른 경로에서 직접 호출하면 키 검사를 우회한다 (서버에도 같은 검사가 있다: `server/index.ts:169`).
- Security Boundary: API 키는 `App.tsx`의 메모리 state에만 둔다. localStorage, sessionStorage, URL, 로그에 저장하지 않는다. 프로바이더를 바꾸면 입력 키를 비운다 (`src/App.tsx:41-44`). 키가 없으면 body에서 생략해 서버 `.env` 키를 쓰게 한다 (`src/hooks/useComponentGenerator.ts:26`).
- Hard Constraint: `LivePreview`의 `noInline` 옵션을 제거하지 않는다 (`src/components/LivePreview.tsx:74`). 제거하면 서버가 보장하는 `render(...)` 호출 계약이 깨져 미리보기가 그려지지 않는다.
- Hard Constraint: 미리보기 새로고침은 `key={previewKey}`로 `LivePreview`를 리마운트해 애니메이션을 다시 실행한다 (`src/components/ComponentCard.tsx:363`). 이 key를 제거하거나 고정하지 않는다.
- Hard Constraint: `GeneratedComponent.createdAt`은 `Date` 객체이며 `toLocaleTimeString`을 직접 호출한다 (`src/components/ComponentCard.tsx:309`). 문자열로 직렬화하는 변경(예: 저장소 영속화)을 하면 함께 복원해야 한다.
- Hard Constraint: `eslint-plugin-react-refresh` 규칙 때문에 컴포넌트 파일에서는 컴포넌트 외 값을 export하지 않는다 (`eslint.config.js:396`). 상수와 헬퍼는 같은 파일 내부에 두거나 별도 모듈로 분리한다.
- Do: 재생성은 기존 항목을 교체하지 않고 새 항목을 목록 맨 앞에 추가한다 (`src/hooks/useComponentGenerator.ts:42`). 의도된 동작이다.
