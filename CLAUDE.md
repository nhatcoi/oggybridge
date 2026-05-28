# CLAUDE.md — OggyBridge Project Brain

> **Read this first.** Quick orientation for any Claude Code session working in this repo.

---

## What this project is

**OggyBridge** is a cross-platform desktop app (Linux + macOS first) that hosts multiple AI coding agents — Claude Code, Codex, GitHub Copilot CLI, Aider — side-by-side in one window. Its key differentiator is a **shared coordination layer** so the agents (and the user) can see who is working on what, on which files, with what tasks claimed.

Internal package identifier is `oggybridge`; product/window name is `OggyBridge`. Do not rename `oggybridge` in `Cargo.toml` / `tauri.conf.json` without a coordinated pass.

Full plan lives in [`PLAN.md`](./PLAN.md). Always check the **Milestone Status** table there before starting work.

---

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2.x (Rust + native webview) |
| Backend | Rust workspace; crates under `crates/` and `src-tauri/` |
| Frontend | React 18 + TypeScript + Vite |
| Layout | `react-resizable-panels` v4 — all panel sizes must be **strings** (`"50%"`, `"20%"`); numeric values are pixels, not percentages |
| Terminal | xterm.js + `@xterm/addon-fit` + `@xterm/addon-webgl` |
| PTY | `portable-pty` crate (from Wezterm) |
| File watch | `notify` + `notify-debouncer-mini` (250ms debounce) |
| Hook bridge | `axum` 0.7 — localhost HTTP server receiving agent hook events |
| MCP server | `rmcp` (M4b, not yet started) |

---

## Repo layout

```
oggybridge/
├── PLAN.md
├── CLAUDE.md                    # this file
├── Cargo.toml                   # Rust workspace root
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx                 # No StrictMode — see conventions
│   ├── App.tsx                  # root state: panes, workspace, editorOpen, layout
│   ├── agents.tsx
│   ├── i18n.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── sessionStorage.ts
│   ├── panes/
│   │   ├── PaneGrid.tsx         # react-resizable-panels grid; vertical+horizontal resize; drag-drop overlay
│   │   TerminalPane.tsx         # xterm.js ↔ Tauri PTY IPC; ResizeObserver refit
│   │   └── AgentLauncher.tsx
│   ├── editor/
│   │   ├── EditorWorkspace.tsx  # Editor/Browser tab host
│   │   ├── FileTree.tsx         # file explorer; draggable rows → drop onto panes
│   │   ├── FileIcon.tsx         # Material-style file/folder icon+color mapping
│   │   ├── CodeEditor.tsx       # Monaco-based code editor
│   │   └── BrowserPane.tsx
│   ├── overview/
│   │   ├── Sidebar.tsx          # activity bar + sidebar panel (explorer/tasks/agents/activity)
│   │   ├── TasksView.tsx
│   │   ├── SettingsView.tsx
│   │   ├── CommandPalette.tsx
│   │   └── Icons.tsx
│   ├── workspace/
│   │   └── WorkspaceBar.tsx
│   ├── hooks/
│   │   ├── useSettings.ts
│   │   ├── useWorkspace.ts
│   │   ├── useUpdater.ts
│   │   └── useZoom.ts
│   └── styles/                  # all CSS lives here (imported by components)
│       ├── App.css
│       ├── PaneGrid.css
│       ├── Sidebar.css
│       ├── EditorWorkspace.css
│       └── …
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json          # dragDropEnabled: false — required for HTML5 drag-drop to work
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs               # Tauri commands + app bootstrap
│       └── workspace.rs         # workspace open/init, file watcher, hook script writer
└── crates/
    ├── pty/
    └── hook_bridge/
```

Planned (not yet present): `crates/mcp_server`, `crates/agents`. Do not pre-create stubs.

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

## Layout architecture

The three-panel layout (sidebar | panes | editor) uses `react-resizable-panels` v4:

```
App
├── <Sidebar>                     activity bar (icons) + collapsible panel
└── .main-area
    ├── <WorkspaceBar>
    └── .main-workbench
        ├── <PanelGroup horizontal>   panes ↔ editor split
        │   ├── <Panel panelRef=panesPanelRef>
        │   │   └── <PaneGrid>        vertical PanelGroup of rows
        │   │       └── each row: horizontal PanelGroup of panels
        │   ├── <PanelResizeHandle>   (only when editorOpen && side)
        │   └── <Panel>               editor side panel
        │       └── <EditorWorkspace>
        └── editor-fullscreen-pane   (position:absolute overlay, when fullscreen)
```

**Key states in App.tsx:**
- `activeSidebarView: "explorer" | "tasks" | "agents" | "activity" | null` — controls left sidebar content
- `editorOpen: boolean` — controls right editor panel (independent of sidebar)
- `editorLayout: "side" | "fullscreen"` — side = in PanelGroup, fullscreen = absolute overlay
- `showEditorSide = editorOpen && editorLayout === "side"` — drives conditional Panel render

When editor opens, `panesPanelRef.current.resize("50%")` is called imperatively because react-resizable-panels v4 does not redistribute existing panels when a new one mounts.

---

## IPC contract (current)

### Tauri commands → `src-tauri/src/lib.rs`

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `create_pty` | `id, cols, rows, cmd?: string, cwd?: string` | `Result<(), String>` | `cmd` null → `$SHELL`. `cwd` null → inherited. |
| `write_pty` | `id, data: string` | `Result<(), String>` | User keystrokes + drag-drop path inserts. |
| `resize_pty` | `id, cols, rows` | `Result<(), String>` | From `ResizeObserver`. |
| `kill_pty` | `id` | `Result<(), String>` | Drops session → kills child. |
| `open_workspace` | `path: string` | `Result<WorkspaceInfo, String>` | **async**. Inits `.agents/`, starts hook bridge, writes hook scripts. |
| `close_workspace` | — | `Result<(), String>` | Drops `WorkspaceHandle` → aborts bridge + watcher. |
| `read_workspace_file` | `path: string` | `Result<string, String>` | Raw file read, no watcher. |
| `list_workspace_files` | `workspacePath: string` | `Result<WorkspaceFileEntry[], String>` | Used by FileTree. |
| `write_workspace_text_file` | `{ workspacePath, relativePath, content }` | `Result<(), String>` | |
| `create_workspace_dir` | `workspacePath, relativePath` | `Result<(), String>` | |
| `rename_workspace_item` | `workspacePath, fromPath, toName` | `Result<(), String>` | |
| `delete_workspace_item` | `workspacePath, relativePath` | `Result<(), String>` | |
| `detect_agent_session` | `agentId, workspacePath, sinceMs` | `Result<string \| null, String>` | Session ID detection for resume. |

### Tauri events (Rust → frontend)

| Event | Payload | Source |
|-------|---------|--------|
| `pty-data-{id}` | `string` (UTF-8 chunk) | PTY reader thread |
| `workspace-file-changed` | `{ kind, content, path }` | notify debouncer; kind = `"tasks" \| "agent_state" \| "activity" \| "other"` |
| `hook-event` | `HookEvent` (see below) | Hook bridge on each POST |

### `HookEvent` shape

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
  hookPort: number;
}
```

---

## Drag-and-drop (file tree → panes)

- `FileTree.tsx` sets `dataTransfer.setData("text/plain", node.path)` — **workspace-relative** path (e.g. `README.md`, `src/main.tsx`).
- `PaneGrid.tsx` wraps the xterm canvas in a `.pane-drop-overlay` div (position: absolute, inset: 0). The overlay is `pointer-events: none` normally, and flips to `pointer-events: auto` when `isDragging` is true (tracked via window `dragstart`/`dragend`). This is necessary because xterm's WebGL canvas swallows all pointer events.
- Drop handler writes `'${path}' ` (single-quoted, trailing space) to the PTY via `write_pty`.
- **`dragDropEnabled: false`** in `tauri.conf.json` is mandatory — Tauri's native OS drag handler intercepts and suppresses HTML5 drop events by default.

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
├── AGENTS.md
├── .claude/
│   └── settings.json            # Claude Code hook config (workspace-local only)
└── .agents/
    ├── TASKS.md
    ├── AGENT_STATE.md
    ├── ACTIVITY.log
    ├── config.toml
    └── hooks/
        ├── pre_tool_use.sh
        └── post_tool_use.sh
```

`.agents/` is added to `.gitignore` automatically.

---

## Conventions

- **No `unwrap()` in IPC handlers.** Return `Result<_, String>`.
- **No unused imports.** `cargo check --workspace` must produce zero errors.
- **No React `StrictMode`.** Double-invokes effects → two PTYs per pane. Removed in `src/main.tsx`; do not re-add.
- **PTY reader uses `std::thread::spawn`, not `tokio::spawn`.** `Read` blocks; mixing with tokio runtime deadlocks.
- **Icons are RGBA PNG.** Tauri rejects RGB. Regenerate with Python: color type 6, 4 bytes per pixel.
- **One PTY per pane.** `PtyStore` keyed by `pane-N` ID. Never reuse IDs.
- **Frontend imports `invoke` from `@tauri-apps/api/core`**, not `@tauri-apps/api` (Tauri 2 breaking change).
- **Guard `invoke` / `listen` calls** with `if (!("__TAURI_INTERNALS__" in window))`.
- **Hook bridge uses axum 0.7.** Do not upgrade to 0.8 without verifying API compat.
- **`open_workspace` is `async fn`** (needs to await bridge start). `close_workspace` is sync.
- **react-resizable-panels v4: all sizes must be strings.** `defaultSize="50%"`, `minSize="20%"`, `resize("50%")`. Numeric values = pixels, not percentages.
- **`dragDropEnabled: false` in tauri.conf.json.** Never set it back to true — it kills HTML5 drag-drop.
- **SidebarView does not include `"editor"`.** Editor panel is controlled by separate `editorOpen: boolean` state in App.tsx, independent of sidebar view.

---

## Things NOT to do

- Don't add Windows-specific code paths. Out of scope for v1.
- Don't touch the user's global `~/.claude/settings.json`. Write workspace-local `.claude/settings.json` only.
- Don't embed GUI agents (Cursor, etc.) — Wayland has no XEmbed. Post-MVP.
- Don't roll a custom MCP protocol. Use `rmcp` crate when M4b starts.
- Don't use `electron`, `node-pty`, or any Node-side spawning.
- Don't make hook scripts exit non-zero on `PreToolUse` unless intentionally blocking the tool.
- Don't set `dragDropEnabled: true` in tauri.conf.json.
- Don't use numeric values for react-resizable-panels sizes (they mean pixels, not percent).

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
