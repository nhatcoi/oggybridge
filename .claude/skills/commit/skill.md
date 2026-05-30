# Skill: commit

Write conventional commit messages. Short, precise, no fluff.

## Trigger

User says "commit", "write commit", "stage and commit", "/commit", or asks for a commit message.

## Format

```
<type>(<scope>): <subject>

[body — only when WHY is non-obvious]

[footer: fixes/closes issue refs]
```

### Rules

- Subject ≤ 50 chars
- Subject: imperative mood, no period, lowercase after colon
- Body: only when the why isn't obvious from the diff
- Body lines ≤ 72 chars
- Blank line between subject and body
- No "Co-Authored-By" unless explicitly asked

### Types

| Type | When |
|------|------|
| `feat` | new feature (correlates with MINOR in semver) |
| `fix` | bug fix (correlates with PATCH) |
| `chore` | build, tooling, deps, no production code change |
| `refactor` | restructure without behavior change |
| `perf` | performance improvement |
| `docs` | documentation only |
| `test` | add or fix tests |
| `style` | formatting, whitespace — no logic change |
| `ci` | CI/CD workflow changes |
| `revert` | revert a previous commit |

### Scope (optional)

Short noun: component, module, or layer affected.

```
feat(auth): add JWT refresh token rotation
fix(pty): prevent double PTY spawn in StrictMode
ci(release): fix missing libayatana-appindicator3-dev
```

Omit scope when change is repo-wide or doesn't map to one component.

## Issue references (footer)

```
Fixes #42          ← closes issue on merge
Closes #42         ← same as Fixes
Refs #42           ← links without closing
```

Multiple:
```
Fixes #12, #34
```

## Breaking changes

Add `!` after type/scope AND a `BREAKING CHANGE:` footer:

```
feat(api)!: remove deprecated /v1 endpoints

BREAKING CHANGE: /v1/users and /v1/posts removed. Use /v2 equivalents.
```

## Body: when to write it

Write body ONLY when:
- A non-obvious constraint forced the approach
- A subtle invariant or workaround exists
- The "why" can't be inferred from reading the diff

Do NOT write body for:
- Obvious fixes ("fix typo", "update version")
- Pure refactors where diff is self-explanatory
- Adding a missing import

## Examples

**Good — subject only:**
```
fix(gitignore): remove trailing space in src-tauri/.gitignore
```

**Good — with body (non-obvious why):**
```
fix(gitignore): remove trailing space in src-tauri/.gitignore

Trailing space line caused globby (gitignore:true) in tauri-action to
filter all files in src-tauri/, making getTauriDir() return null and
triggering tauri init instead of tauri build. git check-ignore reports
not-ignored but the ignore npm package parses differently.
```

**Good — breaking + issue:**
```
feat(ipc)!: rename create_pty args, add cwd param

Fixes #88

BREAKING CHANGE: create_pty now requires cwd as second arg.
```

**Bad:**
```
fixed stuff
Updated the file to make it work better
WIP
feat: implement a solution for the login issue that was causing problems
```

## Workflow

```bash
# 1. Check what changed
git diff --staged

# 2. If nothing staged, stage relevant files
git add <files>   # never 'git add -A' blindly

# 3. Commit
git commit -m "type(scope): subject"
# or with body:
git commit -m "$(cat <<'EOF'
type(scope): subject

Body explaining why.

Fixes #N
EOF
)"
```

## Scope cheatsheet for this repo (oggybridge)

| Scope | Maps to |
|-------|---------|
| `pty` | PTY crate + Tauri PTY commands |
| `ipc` | Tauri commands in lib.rs |
| `workspace` | workspace.rs, open/close workspace |
| `hook-bridge` | crates/hook_bridge |
| `mcp` | crates/mcp_server |
| `pane` | src/panes/ |
| `editor` | src/editor/ |
| `sidebar` | src/overview/Sidebar.tsx |
| `filetree` | src/editor/FileTree.tsx |
| `ci` | .github/workflows/ |
| `gitignore` | any .gitignore file |
