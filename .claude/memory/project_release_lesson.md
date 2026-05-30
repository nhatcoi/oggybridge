---
name: project-release-lesson
description: Root cause of release CI failures for oggybridge — globby gitignore bug from trailing space in src-tauri/.gitignore
metadata:
  type: project
---

Trailing space line in `src-tauri/.gitignore` caused `tauri-action@v0` to fail silently.

**Root cause:** `globby` with `gitignore: true` reads ALL `.gitignore` files. A line
containing only `" "` (single space) in the `ignore` npm package filters the entire
parent directory. `git check-ignore -v` shows "not ignored" — the parsers differ.

**Why:** `src-tauri/.gitignore` had content `.agents/\n ` (trailing space on line 2).
This made globby return 0 files from `src-tauri/**`, so `getTauriDir()` → null →
action ran `tauri init --ci` → failed with "not empty".

**Fix applied in v0.2.3:** `src-tauri/.gitignore` now just `.agents/\n` (no trailing space).

**How to apply:** Before any release debug, verify gitignore files are clean:
```bash
find . -name ".gitignore" -not -path "./.git/*" | xargs cat -A | grep '^ \+\$'
```

**Related skill:** [[skills/release]]
