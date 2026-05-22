# CLAUDE.md — OggyBridge Project Brain

> **Read this first.** Quick orientation for any Claude Code session working in this repo.

---

## What this project is

**OggyBridge** is a cross-platform desktop app (Linux + macOS first) that hosts multiple AI coding agents — Claude Code, Codex, GitHub Copilot CLI, Antigravity CLI — side-by-side in one window. Its key differentiator is a **shared coordination layer** so the agents (and the user) can see who is working on what, on which files, with what tasks claimed.

Internal package identifier is `agenthost`; product/window name is `OggyBridge`. Do not rename `agenthost` in `Cargo.toml` / `tauri.conf.json` without a coordinated pass.

Full plan lives in [`PLAN.md`](./PLAN.md). Always check the **Milestone Status** table there before starting work.

---

## Stack

- **Shell:** Tauri 2.x (Rust + native webview)
- **Backend:** Rust workspace; crates under `crates/` and `src-tauri/`
- **Frontend:** React 18 + TypeScript + Vite
- **Terminal rendering:** xterm.js + `@xterm/addon-fit` + `@xterm/addon-webgl`
- **PTY:** `portable-pty` crate (from Wezterm)
- **Coming (M3+):** `notify` (fs watcher), `rmcp` (MCP server), `axum` (hook bridge), `rusqlite`

---

## Repo layout

```
agenthost/
├── PLAN.md                  # canonical plan; milestone status table at top
├── CLAUDE.md                # this file
├── Cargo.toml               # Rust workspace root
├── package.json             # frontend deps + scripts
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/                     # React frontend
│   ├── main.tsx
│   ├── App.tsx              # root layout (sidebar + main area)
│   ├── App.css
│   ├── panes/
│   │   ├── PaneGrid.tsx     # agent pane tile layout
│   │   ├── PaneGrid.css
│   │   └── TerminalPane.tsx # xterm.js ↔ Tauri IPC
│   ├── overview/
│   │   ├── Sidebar.tsx      # agent launcher + open-pane list
│   │   └── Sidebar.css
│   └── workspace/           # (M3) workspace picker + settings
├── src-tauri/               # Tauri app crate
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/               # icon-32/128/256/512.png + icon.png (RGBA)
│   └── src/
│       ├── main.rs
│       └── lib.rs           # IPC handlers: create_pty / write_pty / resize_pty / kill_pty
└── crates/
    └── pty/                 # PtySession wrapper around portable-pty
        ├── Cargo.toml
        └── src/lib.rs
```

Planned (not yet present): `crates/coordinator`, `crates/mcp_server`, `crates/hook_bridge`, `crates/agents`. Do not pre-create stubs — wait until the corresponding milestone.

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
cargo check
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

Defined in `src-tauri/src/lib.rs`. Frontend wrappers in `src/panes/TerminalPane.tsx`.

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `create_pty` | `id: string, cols: u16, rows: u16, cmd?: string` | `Result<(), String>` | Spawns shell or agent CLI in a pty. `cmd` null → `$SHELL`. |
| `write_pty` | `id, data: string` | `Result<(), String>` | Writes user keystrokes. |
| `resize_pty` | `id, cols, rows` | `Result<(), String>` | Called from `ResizeObserver`. |
| `kill_pty` | `id` | `Result<(), String>` | Drops session → kills child. |

Output flows the other way as Tauri events: `pty-data-{id}` payload is a UTF-8 string chunk.

---

## Conventions

- **No `unwrap()` in IPC handlers.** Errors must be returned as `Result<_, String>` and surfaced in the terminal pane (red text).
- **No unused imports.** `cargo check` must be clean; the build will not be released with warnings.
- **No React `StrictMode`.** It double-invokes effects in dev → spawns two PTYs per pane. Already removed in `src/main.tsx`; do not re-add.
- **PTY readers run in `std::thread::spawn`,** not `tokio::spawn`. The `Read` call blocks; mixing with the tokio runtime that powers Tauri causes deadlocks.
- **Icons are RGBA PNG.** Tauri rejects RGB. Regenerate via the Python snippet in `src-tauri/icons/` history if needed.
- **One PTY per pane.** `PtyStore` keyed by string ID generated in `App.tsx` (`pane-0`, `pane-1`, …). Never reuse IDs across panes.
- **Frontend imports `invoke` from `@tauri-apps/api/core`,** not from `@tauri-apps/api`. Tauri 2 broke the top-level export.
- **Guard `invoke` calls** with `if (!("__TAURI_INTERNALS__" in window))` to keep the dev page survivable if loaded outside Tauri.

---

## Things NOT to do

- Don't add Windows-specific code paths. Out of scope for v1 (see PLAN.md → Out of Scope).
- Don't modify the user's global `~/.claude/settings.json` or `~/.codex/` config. All hook installs must be workspace-local.
- Don't embed GUI agents such as Cursor inside the window — Linux Wayland has no XEmbed equivalent; deferred to post-MVP.
- Don't roll a custom MCP protocol implementation. Use the `rmcp` crate when M4 starts.
- Don't introduce `electron`, `node-pty`, or any Node-side spawning. PTY work belongs in Rust.

---

## When changing things, update

- `PLAN.md` milestone status table when a milestone advances.
- This file's IPC contract table if a Tauri command is added/removed.
- `package.json` and `src-tauri/Cargo.toml` together when adding a dep that bridges both sides.

---

## Next milestone (M2 finish → M3)

Remaining M2: split-pane (horizontal/vertical) with drag-to-resize; right now `PaneGrid` is a CSS `auto-fit` grid with no manual control.

Then M3:
1. Workspace picker dialog (`tauri-plugin-dialog` → `open({ directory: true })`).
2. New crate `crates/coordinator` with `notify`-based watcher.
3. On workspace open: create `.agents/{TASKS.md,AGENT_STATE.md,ACTIVITY.log,config.toml}` if missing; add to `.gitignore`.
4. Tauri event `workspace-changed` → frontend re-renders `Sidebar` overview.
