# AGENTS.md

## Operational Commands

- 패키지 매니저/런타임은 `bun` 고정. npm, yarn, pnpm 사용 금지 (근거: `bun.lock`, `package.json` scripts의 `bun run server`).
- 개발 서버(API + Vite 동시 실행): `bun run dev`
- 테스트 전체: `bun run test` (vitest run, `src/**`와 `server/**` 테스트를 함께 실행)
- 단일 테스트: `bunx vitest run <파일 경로>`
- 린트: `bun run lint`
- 타입 체크 + 빌드: `bun run build` (`tsc -b && vite build`)
- 변경 후 최소 `bun run test`, `bun run lint`, `bun run build`를 통과시킨다.

## Golden Rules

### Immutable

- API 키를 코드, 로그, 커밋에 넣지 않는다. 서버 키는 `.env`(gitignore 대상)로만 전달된다. 사용자가 입력한 키는 요청 body로 전달되며, 클라이언트에서는 Provider별로 localStorage(`rcg:apiKey`)에 평문 저장된다 (`server/index.ts:59-66`, `src/AGENTS.md` Security Boundary 참조).
- `/api/config`는 키 존재 여부(boolean)만 반환한다. 키 값을 클라이언트로 내려보내지 않는다 (`server/index.ts:147-156`).
- Gemini 호출은 API 키가 URL 쿼리에 포함된다 (`server/index.ts:99`). 요청 URL을 로그나 에러 메시지에 포함하지 않는다 (현재 에러는 status 코드만 노출: `server/index.ts:112`).

### 민감 파일 차단

- 에이전트는 민감 파일을 읽거나 수정하지 않는다. 대상: `.env`, `.env.*`, `*.env`, `*credential*`, `*secret*`, `*.ini`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.netrc`, `.aws/`, `.ssh/`.
- `.claude/settings.json`의 `permissions.deny`가 Read/Edit와 Bash/PowerShell의 주요 우회 명령(`cat`, `type`, `Get-Content`, `grep`, `cp`, `rm` 등)을 차단한다. 이 정책을 완화하거나 삭제하지 않는다.
- 차단된 파일이 필요해 보이면 우회(다른 명령, 스크립트, 심볼릭 링크 등)하지 말고 사용자에게 필요한 값이나 변경을 직접 요청한다.
- 새 유형의 민감 파일이 생기면 `permissions.deny`와 이 목록을 함께 갱신한다.
- `permissions.deny`는 명령 패턴 매칭이라 완전한 차단이 아니다. 키 노출 방지의 기본 방어선은 `.gitignore`의 `.env`와 위 Immutable 규칙이다.

### Do's & Don'ts

- Do: 포트 3002는 두 곳에 하드코딩되어 있다. 변경 시 함께 수정한다 (`server/index.ts:139`, `vite.config.ts:11`).
- Do: 순수 로직은 부수효과 없는 모듈(`server/generator.ts`, `server/fallback.ts`)에 두고 테스트를 함께 추가한다. `server/index.ts`는 `Bun.serve`를 실행하므로 import하면 서버가 뜬다 (`server/generator.ts:1-2` 주석).
- Do: 생성 코드 실행 계약(미리보기)은 `react-live`의 `noInline` 모드에 의존한다. `render(<X />)` 호출이 있어야 그려지고, `import` 문은 쓸 수 없다 (`src/components/LivePreview.tsx:74`, `server/generator.ts:234-246`).
- Don't: 프론트에서 AI 공급자 API를 직접 호출하지 않는다. 항상 `/api/generate` 프록시를 거친다 (`src/hooks/useComponentGenerator.ts:23`).
- Don't: 새 프로바이더를 추가할 때 `Provider` 타입을 한쪽만 수정하지 않는다. 클라이언트(`src/types/index.ts:1`)와 서버(`server/index.ts:57`)에 각각 정의되어 있다.

### Test Boundary

- 테스트 있음: `server/generator.ts`, `server/fallback.ts`, `src/components/PromptInput.tsx`, `src/App.tsx`(영속화 경로), `src/utils/storage.ts`.
- 테스트 없음: `server/index.ts`(프로바이더 호출, 에러 매핑), `src/hooks/useComponentGenerator.ts`, `LivePreview`, `CodeView`, `ComponentCard`. 이 영역을 수정하면 수동으로 `bun run dev` 후 생성/에러 경로를 확인하거나 테스트를 추가한다.
- 테스트는 대상 파일 옆에 `*.test.ts(x)`로 두고 한국어 `it` 설명을 쓴다 (`server/generator.test.ts`, `src/components/PromptInput.test.tsx`).

## Project Context

- AI 프롬프트로 React 컴포넌트를 생성하고 실시간 미리보기를 제공하는 도구.
- Stack: React 19, TypeScript, Vite, Bun(API 서버), react-live, vitest, Testing Library, ESLint.

## Context Map

- **[API 서버 수정 (Bun)](./server/AGENTS.md)** — 프로바이더 호출, 에러 매핑, 코드 정규화 작업 시.
- **[프론트엔드 수정 (React)](./src/AGENTS.md)** — 컴포넌트, 훅, 미리보기, 스타일 작업 시.

## Standards & References

- 설치, 실행, 기능 설명은 `README.md` 참조.
- 커밋 메시지: `<type>: <한국어 요약>` (type은 feat, fix, refactor, chore). `.claude/skills/commit/SKILL.md` 규칙을 따른다.
- 사용자 대상 문구와 주석은 한국어로 작성한다.

## Maintenance Policy

- 이 문서의 규칙과 코드가 어긋나면(파일 이동, 포트 변경 등) 작업 중 발견 즉시 업데이트를 제안한다.
