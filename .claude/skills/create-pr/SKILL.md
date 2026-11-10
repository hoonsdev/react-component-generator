---
name: create-pr
description: |
  현재 브랜치의 커밋을 분석해 GitHub Pull Request를 생성한다. 포크된 서브 에이전트에서 실행되며, 프로젝트 성격에 따라 한국어 또는 영문 PR 템플릿(references/)을 골라 제목과 본문을 작성한다.
  "PR 만들어줘", "PR 올려줘", "풀리퀘스트 생성", "create a pull request", "open a PR", "create-pr", "/create-pr" 같은 요청에 활성화한다. 사용자가 PR이라는 말을 직접 하지 않아도 "이 브랜치 리뷰 올려줘"처럼 PR 생성이 목적이면 이 스킬을 쓴다.
  변경사항 커밋(commit 스킬)이나 리뷰 코멘트 반영(autofix 스킬)에는 쓰지 않는다.
argument-hint: "[base 브랜치] [--draft] [--lang ko|en]"
context: fork
allowed-tools: Read Glob Grep Bash
---

# create-pr

현재 브랜치를 push하고 PR을 생성한다. 이 스킬은 대화 이력 없이 포크된 서브 에이전트에서 실행되므로, 필요한 정보는 모두 git과 저장소에서 직접 수집한다. 사용자에게 되묻지 않고 끝까지 진행하며, 판단한 내용(언어, base 브랜치)은 마지막 보고에 적는다.

## 인자

- 첫 번째 위치 인자: base 브랜치. 없으면 저장소의 기본 브랜치.
- `--draft`: 드래프트 PR로 생성한다.
- `--lang ko|en`: 템플릿 언어를 강제한다. 지정하면 2단계의 판별을 건너뛴다.

## 절차

### 1. 사전 확인

실패하면 PR을 만들지 말고 이유와 다음 행동을 보고하고 끝낸다. 억지로 우회하면 엉뚱한 브랜치나 불완전한 변경이 공개되기 때문이다.

- `git rev-parse --is-inside-work-tree`: git 저장소인지 확인.
- `gh auth status`: GitHub 로그인 확인.
- 기본 브랜치: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. 원격이 없으면 "원격 저장소가 없다"고 보고한다.
- 현재 브랜치가 기본 브랜치면 중단한다. PR은 작업 브랜치에서만 만들 수 있다. 새 브랜치를 만들어야 한다고 알린다.
- `git status --short`에 커밋되지 않은 변경이 있으면 중단하고 먼저 커밋(`commit` 스킬)하도록 안내한다. 커밋되지 않은 변경은 PR에 포함되지 않아 사용자가 의도와 다른 PR을 보게 된다.
- `gh pr list --head <현재 브랜치> --state open --json url`로 이미 열린 PR이 있는지 확인한다. 있으면 새로 만들지 말고 그 URL을 보고한다.
- `git log <base>..HEAD --oneline`이 비어 있으면 PR할 커밋이 없으므로 중단한다.

### 2. 템플릿 언어 결정

PR 본문은 리뷰어가 읽는 글이라, 프로젝트의 기본 언어와 맞아야 한다. `--lang`이 있으면 그 값을 쓰고, 없으면 아래 신호를 모아 판단한다.

- 최근 커밋 메시지: `git log -n 20 --format=%s`
- 최근 PR 제목: `gh pr list --state all --limit 10 --json title`
- `README.md`, `AGENTS.md`, `CLAUDE.md`의 주 언어
- 이슈와 PR의 언어, 저장소 소유자의 국적 단서(문서 언어, 커뮤니티 안내 등)

판단 기준:

- 신호 대부분이 한글이면 한국어 템플릿(`references/pr-template.ko.md`). 한국 팀·한국어 프로젝트가 여기에 해당한다.
- 신호 대부분이 영어이거나 해외 오픈소스 프로젝트로 보이면 영문 템플릿(`references/pr-template.en.md`). 외부 기여자가 읽는 프로젝트는 영어가 공용어다.
- 신호가 섞이거나 판단이 서지 않으면 영문 템플릿을 쓴다. 공개 저장소에서 가장 널리 읽히는 언어이기 때문이다.

저장소에 자체 템플릿(`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`)이 있으면 그것이 우선이다. 팀이 정한 형식을 덮어쓰면 안 된다. 이 경우 언어 판별은 건너뛰고 그 템플릿의 섹션을 채운다.

선택한 템플릿 파일만 읽는다.

### 3. 변경 내용 분석

- `git log <base>..HEAD --format='%h %s%n%b'`: 커밋 목록과 본문.
- `git diff <base>...HEAD --stat` 후 필요한 파일은 `git diff <base>...HEAD -- <파일>`로 직접 읽는다.
- 커밋 제목만 이어 붙이지 말고, 변경이 무엇을 왜 바꾸는지를 한 흐름으로 요약한다. 리뷰어는 diff가 아니라 요약을 먼저 읽는다.
- 테스트 계획은 실제로 확인할 수 있는 것만 쓴다. 테스트를 실행하지 않았다면 실행했다고 쓰지 않는다. 필요하면 프로젝트의 테스트 명령(AGENTS.md나 package.json 참조)을 실행해 결과를 반영한다.
- 관련 이슈 번호가 커밋이나 브랜치명에 있으면 `Closes #N` 형태로 연결한다. 없으면 해당 항목을 지운다.
- `.env`, 키, 토큰 같은 비밀 정보가 diff에 보이면 PR을 만들지 말고 보고한다.

### 4. 제목과 본문 작성

- 제목: 템플릿의 제목 규칙을 따른다. 70자 안팎, 마침표 없음.
- 본문: 템플릿의 섹션을 모두 채우고, 해당 없는 항목은 섹션 안내 문구를 지우거나 "해당 없음"/"N/A"로 둔다. 빈 템플릿 문구를 그대로 두지 않는다.
- 마지막 줄에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`를 붙인다. 세션이 다른 attribution을 지정했다면 그것을 따른다.
- 본문은 Bash heredoc(`cat > <임시 파일> <<'EOF'`)으로 임시 파일에 쓰고 `--body-file`로 전달해 줄바꿈과 백틱을 보존한다. 허용 도구에 Write가 없으므로 파일 쓰기는 Bash로 한다.

### 5. push 및 PR 생성

- 원격에 브랜치가 없으면 `git push -u origin HEAD`. 이미 있으면 `git push`. force push는 하지 않는다.
- `gh pr create --base <base> --title "<제목>" --body-file <파일>` (`--draft` 인자가 있으면 추가).
- 포크 저장소에서 상위 저장소로 보내는 경우(`gh repo view --json isFork,parent`가 fork이고 사용자가 상위 저장소 기여를 의도한 경우)에만 `--repo <parent>`를 쓴다. 불확실하면 현재 저장소로 만든다.
- 임시 본문 파일은 생성 후 삭제한다.

### 6. 보고

- PR URL.
- 선택한 템플릿 언어와 그 근거(어떤 신호로 판단했는지) 한 줄.
- base 브랜치, 드래프트 여부.
- 건너뛰었거나 확인하지 못한 항목(테스트 미실행 등)이 있으면 그대로 적는다.

## 하지 않는 것

- 커밋 생성, 저장소 파일 수정, 브랜치 생성. 허용 도구는 `Read Glob Grep Bash`뿐이다.
- force push, 기존 PR 덮어쓰기, PR 자동 머지.
- 사용자 승인 요청. 포크된 실행에서는 대화가 불가능하므로 위 사전 확인에서 막히는 경우만 중단하고 보고한다.
