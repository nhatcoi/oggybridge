# Skill: release

Bump version, tag, push, monitor CI, auto-fix errors until release succeeds.

## Trigger

User says "release", "release new version", "publish release", or sets goal "auto check error on release".

## Steps

### 1. Bump version

Files to update (must stay in sync):
- `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml` → `version = "X.Y.Z"`

Do NOT update `package.json` version — tauri-action reads `tauri.conf.json`, not `package.json`.

```bash
# Verify both files updated
grep '"version"' src-tauri/tauri.conf.json
grep '^version' src-tauri/Cargo.toml
```

### 2. Commit + tag + push

Use lightweight tag (not annotated — both work with tauri-action):

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to vX.Y.Z"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z
```

### 3. Monitor CI

Poll until `status == "completed"`:

```bash
until [ "$(curl -s "https://api.github.com/repos/nhatcoi/oggybridge/actions/runs?per_page=1" \
  | python3 -c "import json,sys; runs=json.load(sys.stdin)['workflow_runs']; print(runs[0]['status'] if runs else 'none')")" = "completed" ]; do
  sleep 30
done
```

Check conclusion:
```bash
curl -s "https://api.github.com/repos/nhatcoi/oggybridge/actions/runs?per_page=1" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['id'], r['status'], r['conclusion'])"
```

If `conclusion == "success"` → done.
If `conclusion == "failure"` → proceed to step 4.

### 4. Diagnose failure

Get logs (requires gh CLI or stored token):

```bash
# Install gh to /tmp if not available
curl -fsSL "https://github.com/cli/cli/releases/download/v2.70.0/gh_2.70.0_linux_amd64.tar.gz" -o /tmp/gh.tar.gz \
  && tar -xzf /tmp/gh.tar.gz -C /tmp

# Token stored in ~/.git-credentials
TOKEN=$(cat ~/.git-credentials 2>/dev/null | grep github | sed 's|https://[^:]*:\([^@]*\)@.*|\1|')

GH_TOKEN="$TOKEN" /tmp/gh_2.70.0_linux_amd64/bin/gh run view <RUN_ID> \
  --repo nhatcoi/oggybridge --log-failed 2>&1 | head -100
```

### 5. Known failure modes

#### A. `tauri init --ci` runs instead of `tauri build`

**Symptom in logs:**
```
running npm [ 'run', 'tauri', 'init', '--', '--ci' ]
Warn Tauri dir (".../src-tauri") not empty.
Failed to resolve Tauri path
```

**Root cause:** `tauri-action` uses `globby` with `gitignore: true` to find `tauri.conf.json`.
A stray gitignore pattern (e.g. trailing space line in `src-tauri/.gitignore`) causes globby to
filter ALL files in `src-tauri/`, making `getTauriDir()` return null → action runs `tauri init`.

**Reproduce locally:**
```javascript
// node --input-type=module
import { globbySync } from '/tmp/tauri-action/node_modules/globby/index.js';
const paths = globbySync(['**/tauri.conf.json'], {
  gitignore: true, cwd: '.', ignore: ['**/target', '**/node_modules']
});
console.log(paths); // should be ['src-tauri/tauri.conf.json']
```

**Fix:** Audit ALL `.gitignore` files for invalid/blank patterns:
```bash
find . -name ".gitignore" -not -path "./.git/*" | xargs cat -A
# Look for lines with only whitespace (shown as '^ $' or '$ ')
```

Fix offending `.gitignore`:
```bash
# e.g. src-tauri/.gitignore had ".agents/\n " (trailing space line)
echo ".agents/" > src-tauri/.gitignore
```

**Why `gitignore: true` in globby is strict:**
- Reads ALL `.gitignore` files in the tree (including subdirectory ones)
- A line with only whitespace `" "` in the `ignore` npm package can match unexpectedly
- `git check-ignore -v` may say "not ignored" but globby still filters — they use different parsers

#### B. `tauriScript: npm run tauri` + `projectPath: .` in workflow

These params were added as a "fix" but are UNNECESSARY — tauri-action auto-detects npm.
When set explicitly, the runner construction may behave differently.

**Fix:** Remove these params from workflow — v0.1.9 succeeded without them:
```yaml
# Remove these lines:
#   projectPath: .
#   tauriScript: npm run tauri
```

#### C. Wrong Linux apt packages

`libappindicator3-dev` vs `libayatana-appindicator3-dev`:
- `tray-icon` Tauri feature uses `libappindicator-sys` which **runtime-loads** the library via `libloading`
- No compile-time link — neither dev package is required for the build
- Keep the original `libappindicator3-dev` from v0.1.9 unless actual link errors appear

#### D. Build fails in ~57 seconds (too fast for compilation)

If total run time < 2 min, compilation never started — failure is in tauri-action setup phase.
Check for the `tauri init` symptom (case A) or permission/token errors.

Real compilation takes 6-15 min on GitHub runners.

### 6. After fix: bump patch, commit, tag, push, repeat from step 3

Always bump version for each new push to avoid tag conflicts and stale release artifacts.

## Files touched by this skill

- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `.github/workflows/release.yml`
- Any `.gitignore` file in the repo tree

## Workflow reference

```
.github/workflows/release.yml
  trigger: push tags v*
  matrix: ubuntu-22.04 (deb/AppImage/rpm) + macos-14 (dmg)
  publishes: draft release via tauri-apps/tauri-action@v0
  finalizes: publish-release job sets draft=false after both matrix jobs pass
```
