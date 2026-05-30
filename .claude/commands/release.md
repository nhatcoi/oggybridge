# /release

Bump version, push tag, monitor CI, auto-fix until release succeeds.

## Usage

```
/release [patch|minor|major]
/release 0.3.0
```

Default: patch bump.

## What this does

Loads `.claude/skills/release/skill.md` and executes the full release pipeline:
bump → commit → tag → push → poll CI → diagnose failure → fix → retry.

Runs until `conclusion == "success"` or an unfixable error is found.
