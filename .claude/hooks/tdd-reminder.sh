#!/usr/bin/env bash
# PreToolUse 훅: .ts/.tsx 파일을 생성·수정하기 직전에 TDD 규칙(.claude/rules/tdd.md)을 에이전트에게 리마인드한다.
# 차단하지 않고(exit 0) additionalContext로 프롬프트만 주입한다.

input=$(cat)

# 대상 파일이 .ts / .tsx 가 아니면 통과
echo "$input" | grep -qE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*\.tsx?"' || exit 0

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "[TDD 리마인더] .ts/.tsx 파일을 작성·수정하려 하고 있습니다. 진행 전에 .claude/rules/tdd.md(Rigid)를 지키고 있는지 스스로 점검하세요.\n1. 이 변경이 TDD 필수 대상(비즈니스 로직, API, 유틸/순수 함수, 버그 수정, 동작이 있는 훅/컴포넌트)인가? 애매하면 TDD를 적용합니다.\n2. 필수 대상이라면 RED(실패하는 테스트를 작성하고 '기능 미구현'이라는 올바른 이유로 실패하는 것을 실행해 확인) 단계를 이미 거쳤는가?\n3. GREEN은 테스트가 요구하는 최소한의 코드만 작성하는가? (YAGNI)\n4. 테스트보다 프로덕션 코드를 먼저 작성했다면 그 코드를 삭제하고 RED부터 다시 시작해야 합니다. 참고용 보관도 금지입니다.\n5. 한 테스트에는 하나의 동작만, 테스트 설명(it)은 한국어로 작성합니다.\n타입 정의, 설정 파일, 로직 없는 순수 UI는 TDD 예외입니다."
  }
}
EOF
exit 0
