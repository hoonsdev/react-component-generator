#!/usr/bin/env bash
# PreToolUse 훅: git commit 실행 전에 전체 테스트를 돌리고, 하나라도 실패하면 커밋을 차단한다.
# 종료 코드 2 = 도구 호출 차단, stderr 내용이 에이전트에게 전달된다.

input=$(cat)

# git commit 명령이 아니면 통과 (복합 명령 `git add . && git commit ...` 포함 검사)
echo "$input" | grep -qE 'git[[:space:]]+commit' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! output=$(bun run test 2>&1); then
  echo "$output" | tail -40 >&2
  echo "" >&2
  echo "테스트가 실패하여 커밋을 차단했습니다. 모든 테스트를 통과시킨 뒤 다시 커밋하세요." >&2
  exit 2
fi

exit 0
