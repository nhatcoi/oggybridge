# /commit

Stage changes and write a conventional commit message.

## Usage

```
/commit
/commit fix
/commit "describe what changed"
```

## What this does

Loads `.claude/skills/commit/skill.md` and:
1. Runs `git diff --staged` (and `git diff` if nothing staged)
2. Infers type, scope, and subject from the diff
3. Decides whether a body is needed (non-obvious why)
4. Commits with the correct format

Never uses `git add -A`. Stages specific files only.
Never adds Co-Authored-By unless asked.
