# CLAUDE.md — OggyBridge Project Brain

> **Read this first.** Quick orientation for any Claude Code session working in this repo.

---

## What this project is

**OggyBridge** is a cross-platform desktop app (Linux + macOS first) that hosts multiple AI coding agents — Claude Code, Codex, GitHub Copilot CLI, Aider — side-by-side in one window. Its key differentiator is a **shared coordination layer** so the agents (and the user) can see who is working on what, on which files, with what tasks claimed.

Internal package identifier is `agenthost`; product/window name is `OggyBridge`. Do not rename `agenthost` in `Cargo.toml` / `tauri.conf.json` without a coordinated pass.

Full plan lives in [`PLAN.md`](./PLAN.md). Always check the **Milestone Status** table there before starting work.

---

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2.x (Rust + native webview) |
| Backend | Rust workspace; crates under `crates/` and `src-tauri/` |
| Frontend | React 18 + TypeScript + Vite |
| Terminal | xterm.js + `@xterm/addon-fit` + `@xterm/addon-webgl` |
| PTY | `portable-pty` crate (from Wezterm) |
| File watch | `notify` + `notify-debouncer-mini` (250ms debounce) |
| Hook bridge | `axum` 0.7 — localhost HTTP server receiving agent hook events |
| MCP server | `rmcp` (M4b, not yet started) |

---

## Repo layout

```
agenthost/
├── PLAN.md                  # canonical plan; milestone status table at top
├── CLAUDE.md                # this file
├── Cargo.toml               # Rust workspace root (members: src-tauri, crates/pty, crates/hook_bridge)
├── package.json             # frontend deps + scripts
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/                     # React frontend
│   ├── main.tsx             # No StrictMode — see conventions
│   ├── App.tsx              # root state: panes, workspace, hookEvents, maxPerRow
│   ├── App.css
│   ├── panes/
│   │   ├── PaneGrid.tsx     # tile layout; drag-resize dividers; row chunking
│   │   ├── PaneGrid.css
│   │   └── TerminalPane.tsx # xterm.js ↔ Tauri pty IPC; cwd support
│   ├── overview/
│   │   ├── Sidebar.tsx      # agent launcher, pane list, tasks, activity feed
│   │   ├── Sidebar.css
│   │   └── TasksView.tsx    # parses TASKS.md checkboxes
│   └── workspace/
│       └── WorkspaceBar.tsx # open/close workspace dialog + WorkspaceInfo display
├── src-tauri/               # Tauri app crate
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/               # icon-32/128/256/512.png + icon.png (must be RGBA PNG)
│   └── src/
│       ├── main.rs
│       ├── lib.rs           # all Tauri commands + app bootstrap
│       └── workspace.rs     # workspace open/init, file watcher, hook script writer
└── crates/
    ├── pty/                 # PtySession wrapper around portable-pty
    │   ├── Cargo.toml
    │   └── src/lib.rs
    └── hook_bridge/         # axum HTTP server; receives + normalises agent hook events
        ├── Cargo.toml
        └── src/lib.rs
```

Planned (not yet present): `crates/mcp_server`, `crates/agents`. Do not pre-create stubs — wait until the milestone.

---

## Build / run

```bash
# Dev (hot reload frontend, recompile Rust on change)
cargo tauri dev

# Production bundle (.deb / .AppImage on Linux, .dmg on macOS)
cargo tauri build

# Type-check frontend only
npm run build

# Rust lint
cargo check --workspace
cargo clippy --workspace
```

**System deps (Linux, one-time):**
```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev libdbus-1-dev \
  libayatana-appindicator3-dev librsvg2-dev libglib2.0-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

---

## IPC contract (current)

### Tauri commands → `src-tauri/src/lib.rs`

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `create_pty` | `id, cols, rows, cmd?: string, cwd?: string` | `Result<(), String>` | `cmd` null → `$SHELL`. `cwd` null → inherited. |
| `write_pty` | `id, data: string` | `Result<(), String>` | User keystrokes. |
| `resize_pty` | `id, cols, rows` | `Result<(), String>` | From `ResizeObserver`. |
| `kill_pty` | `id` | `Result<(), String>` | Drops session → kills child. |
| `open_workspace` | `path: string` | `Result<WorkspaceInfo, String>` | **async**. Inits `.agents/`, starts hook bridge, writes hook scripts. |
| `close_workspace` | — | `Result<(), String>` | Drops `WorkspaceHandle` → aborts bridge + watcher. |
| `read_workspace_file` | `path: string` | `Result<string, String>` | Raw file read, no watcher. |

### Tauri events (Rust → frontend)

| Event | Payload | Source |
|-------|---------|--------|
| `pty-data-{id}` | `string` (UTF-8 chunk) | PTY reader thread |
| `workspace-file-changed` | `{ kind, content, path }` | notify debouncer; kind = `"tasks" \| "agent_state" \| "activity" \| "other"` |
| `hook-event` | `HookEvent` (see below) | Hook bridge on each POST |

### `HookEvent` shape (TypeScript + Rust)

```typescript
interface HookEvent {
  agentId: string;      // "claude-code", "codex", …
  event: string;        // "pre_tool_use" | "post_tool_use" | "unknown"
  tool: string | null;  // "Edit", "Read", "Bash", …
  files: string[];      // affected file paths
  ts: number;           // Unix seconds
}
```

### `WorkspaceInfo` shape

```typescript
interface WorkspaceInfo {
  path: string;
  tasksMd: string;
  agentStateMd: string;
  hookPort: number;     // port the hook bridge is listening on
}
```

---

## Hook bridge (`crates/hook_bridge`)

- Binds `127.0.0.1:0` (OS picks port) on workspace open.
- Endpoint: `POST /hooks/:agent_id` with `Authorization: Bearer <token>`.
- Token is per-session UUID, stored only in the hook scripts and in-memory.
- On workspace open, `workspace.rs` writes:
  - `.agents/hooks/pre_tool_use.sh` — curl stdin to bridge, `exit 0`
  - `.agents/hooks/post_tool_use.sh` — same
  - `<workspace>/.claude/settings.json` — `PreToolUse`/`PostToolUse` hooks pointing at scripts
- `WorkspaceHandle` holds `AbortHandle`; bridge task aborted on workspace close / drop.

---

## Workspace init (on first open)

`workspace.rs::init_agents_dir` creates (if missing):

```
<workspace>/
├── AGENTS.md                    # coordination protocol doc for agents
├── .claude/
│   └── settings.json            # Claude Code hook config (workspace-local only)
└── .agents/
    ├── TASKS.md
    ├── AGENT_STATE.md
    ├── ACTIVITY.log
    ├── config.toml
    └── hooks/
        ├── pre_tool_use.sh      # posts to hook bridge
        └── post_tool_use.sh
```

`.agents/` is added to `.gitignore` automatically.

---

## Conventions

- **No `unwrap()` in IPC handlers.** Return `Result<_, String>`.
- **No unused imports.** `cargo check --workspace` must produce zero errors, zero unused-import warnings.
- **No React `StrictMode`.** Double-invokes effects → two PTYs per pane. Removed in `src/main.tsx`; do not re-add.
- **PTY reader uses `std::thread::spawn`, not `tokio::spawn`.** `Read` blocks; mixing with tokio runtime deadlocks.
- **Icons are RGBA PNG.** Tauri rejects RGB. Regenerate with Python: color type 6, 4 bytes per pixel.
- **One PTY per pane.** `PtyStore` keyed by `pane-N` ID. Never reuse IDs.
- **Frontend imports `invoke` from `@tauri-apps/api/core`**, not `@tauri-apps/api` (Tauri 2 breaking change).
- **Guard `invoke` / `listen` calls** with `if (!("__TAURI_INTERNALS__" in window))`.
- **Hook bridge uses axum 0.7.** Do not upgrade to 0.8 without verifying API compat.
- **`open_workspace` is `async fn`** (needs to await bridge start). `close_workspace` is sync.

---

## Things NOT to do

- Don't add Windows-specific code paths. Out of scope for v1.
- Don't touch the user's global `~/.claude/settings.json`. Write workspace-local `.claude/settings.json` only.
- Don't embed GUI agents (Cursor, etc.) — Wayland has no XEmbed. Post-MVP.
- Don't roll a custom MCP protocol. Use `rmcp` crate when M4b starts.
- Don't use `electron`, `node-pty`, or any Node-side spawning.
- Don't make hook scripts exit non-zero on `PreToolUse` unless intentionally blocking the tool.

---

## When changing things, update

- `PLAN.md` milestone status table when a milestone advances.
- IPC contract table above if a Tauri command is added/removed.
- Hook bridge section above if bridge behavior changes.
- `package.json` + `src-tauri/Cargo.toml` together when adding a dep that bridges both sides.

---

## Next milestone: M4b — MCP Coordinator

1. Add `rmcp` crate as new `crates/mcp_server`.
2. Start MCP server on unix socket `<workspace>/.agents/coordinator.sock` on workspace open.
3. Write `.mcp.json` in workspace root so Claude Code auto-connects.
4. Implement 6 tools: `team_state`, `list_tasks`, `claim_task`, `release_task`, `report_progress`, `touched_files`.
5. Wire tool calls → mutate `AGENT_STATE.md` + `ACTIVITY.log` on disk.
