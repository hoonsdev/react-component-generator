# English PR Template

Use for international and open-source projects. Follow the "Title rules" and the "Body template" below. Replace angle brackets (`<...>`) and HTML comments with real content, or delete them.

## Title rules

`<type>: <summary>`

- type: one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test` that best represents the whole PR.
- Summary in the imperative mood, around 70 characters, no trailing period. Example: `feat: add 500-character prompt length validation`
- If the project uses a different convention (scopes like `feat(api):`, ticket prefixes), match the recent PR titles instead.
- With a single commit, its subject can be reused as the title.

## Body template

```markdown
## Summary

<What this PR changes, in 1-3 sentences. Describe the overall change, not a list of commits.>

## Changes

- <Key change 1>
- <Key change 2>

## Motivation

<Why this change is needed: background, the problem being solved, why this approach. One line is fine if the summary already says it.>

## Test plan

- [ ] <Test command run and its result (e.g. `bun run test` passes)>
- [ ] <Scenario verified manually>

<Leave unchecked any item that was not run, and say why.>

## Notes for reviewers

<Where to focus, trade-offs, known limitations. Write "N/A" if none.>

## Related issues

<Closes #number. Delete this section if there are none.>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
