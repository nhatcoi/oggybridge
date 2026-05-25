# Plan: OggyBridge — Multi-Agent Coding Host Desktop App

> **Status (as of M4b commit):** PTY backend, React terminal grid, workspace directory config, automatic Claude hook installer, HTTP hook bridge (M4a), and MCP coordinator (M4b) are done. Next up: M5 (Conflict detection, heatmap, auto-init prompts).
>
> Internal package identifier remains `agenthost` in `Cargo.toml` / `tauri.conf.json` until a rename pass is done. Window title and product branding: **OggyBridge**.

---

## Milestone Status

| Milestone | Scope | Status |
|-----------|-------|--------|
| M1 | Tauri scaffold + single pty pane | ✅ Done |
| M2 | Agent registry + multi-pane grid + drag-resize | ✅ Done |
| M3 | Workspace picker + `.agents/` init + markdown watcher | ✅ Done |
| M4a | Hook bridge (axum) | ✅ Done |
| M4b | MCP coordinator (rmcp) | ✅ Done |
| M5 | 6 MCP tools + conflict detection + file heatmap | ✅ Done |
| M6 | Settings, theme, bundle `.deb` / `.AppImage` / `.dmg` | ⬜ Not started |
| M7 | Post-MVP agent-specific integrations | ⬜ Not started |

---

## Context

Modern AI coding workflows increasingly involve multiple agents in parallel — Claude Code for refactoring, Codex for scaffolding, Copilot CLI for snippets, Antigravity CLI for surgical edits. Today users juggle these in separate terminal tabs with no shared awareness, leading to redundant work, conflicting edits, and lost context.

This project builds a single desktop window that **hosts multiple AI coding agents side-by-side** and provides a **shared overview layer** — a coordinator the user (and the agents) can consult to see who is doing what, on which files, and what tasks remain.

Primary targets: **Linux (X11/Wayland) and macOS**. Windows is non-goal for v1.

MVP agent scope: Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Antigravity CLI (all CLI-based, all support pty hosting).

---

## Architecture Overview

```
┌─────────────────────────── Tauri Window ──────────────────────────┐
│  ┌─ Sidebar ──┐  ┌─ Agent Pane Grid ─────────────────────────────┐│
│  │ Overview   │  │ ┌─Claude Code─┐ ┌─Codex─────┐ ┌─Antigravity──┐││
│  │ Tasks      │  │ │ xterm.js    │ │ xterm.js  │ │ xterm.js     │││
│  │ Files map  │  │ │ (pty)       │ │ (pty)     │ │ (pty)        │││
│  │ Agents     │  │ └─────────────┘ └───────────┘ └──────────────┘││
│  │ Settings   │  │                                                ││
│  └────────────┘  └────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
         │                                  │
         │ Tauri IPC                        │ Tauri IPC
         ▼                                  ▼
┌──────────────── Rust Backend ───────────────────────────────────────┐
│  ┌─ PTY Manager ─┐  ┌─ Workspace Watcher ─┐  ┌─ MCP Coordinator ─┐  │
│  │ portable-pty  │  │ notify (fs events)  │  │ rmcp server       │  │
│  │ per-agent     │  │ TASKS.md, AGENT_*   │  │ stdio + sse       │  │
│  │ session       │  │ debounced → UI      │  │ team-state tools  │  │
│  └───────────────┘  └─────────────────────┘  └───────────────────┘  │
│  ┌─ Hook Bridge ─┐  ┌─ Workspace Store ───┐  ┌─ Agent Registry ──┐  │
│  │ HTTP localhost│  │ SQLite (history)    │  │ adapters per CLI  │  │
│  │ accepts hook  │  │ + markdown files    │  │ launch cmd, env   │  │
│  │ JSON events   │  │ on disk             │  │ hook install      │  │
│  └───────────────┘  └─────────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼ spawn
   ┌──── Agent CLI processes (claude, codex, gh copilot, agy) ──────┐
   │ Each in its own pty. Sees workspace root + .agents/ folder.    │
   │ Optionally configured with hook scripts pointing at Hook Bridge.│
   └────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Shell | **Tauri 2.x** | Small binary, native webview, Rust backend ideal for pty/process work. Mature Linux+macOS support. |
| UI | **React + TypeScript + Vite** | Standard, fast iteration, xterm.js bindings exist. |
| Terminal | **xterm.js** + `@xterm/addon-fit`, `@xterm/addon-webgl` | De-facto standard in-browser terminal. WebGL renderer for perf. |
| PTY (Rust) | **`portable-pty`** crate | Cross-platform pty (unix forkpty + macOS), maintained by Wezterm authors. |
| File watch | **`notify`** crate | Standard Rust fs watcher, debounced via `notify-debouncer-mini`. |
| Local store | **`rusqlite`** (bundled) + plain markdown files on disk | Markdown is source of truth (visible to agents); SQLite for indexed history/search. |
| MCP server | **`rmcp`** (official Rust MCP SDK) | Expose coordinator as MCP server agents can attach to. |
| Hook bridge | **`axum`** localhost-only HTTP | Receives Claude Code / Codex hook JSON via POST. Auth via per-session token. |
| Diff/AST (later) | **tree-sitter** | For file-change attribution and conflict detection. |
| Packaging | Tauri bundler → `.deb` / `.AppImage` / `.dmg` (universal-2) | Native installers, no extra runtime. |

---

## Core Concepts

### Workspace
A workspace is a directory the user opens. Inside, the app creates `.agents/`:

```
<workspace-root>/
├── (user's project files)
└── .agents/
    ├── TASKS.md           # human + agent editable; canonical task list
    ├── AGENT_STATE.md     # auto-generated; per-agent current focus
    ├── ACTIVITY.log       # append-only event stream (jsonl)
    ├── config.toml        # which agents enabled, per-agent overrides
    └── hooks/             # generated hook scripts each agent calls
        ├── on_session_start.sh
        ├── on_pre_tool.sh
        └── on_post_tool.sh
```

`.agents/` is gitignored by default (added to `.gitignore` on first init).

### Agent Adapter
A struct per supported agent describing how to launch and (optionally) instrument it. MVP adapters are pty-only; richer adapters land later.

```rust
// crates/coordinator/src/agent.rs (conceptual)
pub struct AgentAdapter {
    pub id: &'static str,             // "claude-code", "codex", "copilot", "antigravity"
    pub display_name: &'static str,
    pub launch: AgentLaunch,          // command + args + env
    pub hook_install: Option<HookInstall>, // for agents that support hooks
    pub icon: &'static str,
}

pub enum AgentLaunch {
    Cli { cmd: String, args: Vec<String> }, // all MVP agents use this
}
```

### Coordinator
Long-running Rust service inside the Tauri backend that:
1. Watches `.agents/*.md` files and broadcasts changes to UI via Tauri events.
2. Hosts an MCP server on a unix socket (Linux/macOS) — agents that speak MCP can attach.
3. Hosts an HTTP hook bridge on `127.0.0.1:<port>` — hook scripts POST JSON events here.
4. Maintains an in-memory snapshot of {agents, tasks, file-touch heatmap} that powers Overview UI.

### Sync Mechanisms (all three from user selection)

| Mechanism | Used by | Trigger |
|-----------|---------|---------|
| Shared markdown (`TASKS.md`, `AGENT_STATE.md`) | All agents (lowest common denominator) | Pre-loaded into each agent's working dir; agents instructed via system prompt / `CLAUDE.md` / `AGENTS.md` to read & update |
| MCP coordinator | Agents that support MCP clients (Claude Code, Codex) | App writes per-workspace `.mcp.json` adding `coordinator` server |
| Hook scripts | Claude Code (full hook support), Codex (event hooks) | App writes `settings.json` / equivalent on workspace init |

---

## Module Breakdown

### Rust crates (workspace)

```
crates/
├── app/             # Tauri main; window, IPC, lifecycle
├── pty/             # portable-pty wrapper, resize, write, read stream
├── coordinator/     # workspace state, file watcher, event bus
├── mcp_server/      # rmcp server exposing team-state tools
├── hook_bridge/     # axum http server accepting hook events
└── agents/          # adapter registry + per-agent metadata
```

### Frontend (`src/`)

```
src/
├── app/                  # routing, layout
├── panes/
│   ├── TerminalPane.tsx  # xterm.js + Tauri pty IPC
│   ├── AgentTabs.tsx
│   └── PaneGrid.tsx      # tile layout, drag-to-resize
├── overview/
│   ├── TasksView.tsx     # rendered TASKS.md w/ editable cells
│   ├── AgentStateView.tsx
│   ├── FileHeatmap.tsx   # which agent touched which file lately
│   └── ActivityFeed.tsx
├── workspace/
│   ├── Open.tsx          # pick directory, init .agents/
│   └── Settings.tsx
└── ipc.ts                # typed wrappers around Tauri commands
```

---

## MCP Coordinator Tools (exposed to attached agents)

Minimum viable set for v1:

| Tool | Purpose |
|------|---------|
| `team_state` | Return current `AGENT_STATE.md` parsed + active agent list. |
| `list_tasks` | Return parsed `TASKS.md`. |
| `claim_task(id)` | Mark a task as owned by calling agent. Prevents double-work. |
| `release_task(id)` | Release ownership. |
| `report_progress(text)` | Append to `ACTIVITY.log` and update agent's row in `AGENT_STATE.md`. |
| `touched_files(paths[])` | Tell coordinator which files this agent is editing — feeds heatmap + conflict warnings. |

All tools mutate the on-disk markdown so other agents (and the user) see updates even without MCP.

---

## Hook Bridge Events

Listens on `http://127.0.0.1:<port>/hooks/<agent_id>` with bearer token from workspace config. Accepts the agent's native hook JSON shape and normalizes into:

```json
{
  "agent_id": "claude-code",
  "event": "pre_tool_use" | "post_tool_use" | "session_start" | "session_end" | "user_prompt_submit",
  "tool": "Edit",
  "files": ["src/foo.rs"],
  "ts": 1234567890
}
```

Normalized events feed the same in-memory state the MCP tools mutate.

---

## Build / Run Plan (Milestones)

### M1 — Skeleton (1 week)
- Tauri scaffold, single window, "Open Workspace" picker.
- One terminal pane with xterm.js + portable-pty round-trip.
- Hardcode launching `bash` for now.

### M2 — Agent Registry + Multi-Pane (1 week)
- Adapter structs for the four MVP agents.
- Pane grid: split horizontally/vertically, focus, close.
- Each pane picks an agent from the registry; spawns pty.

### M3 — Workspace + Markdown (1 week)
- `.agents/` init on workspace open.
- File watcher → UI updates of TASKS.md / AGENT_STATE.md.
- Overview sidebar renders parsed markdown.

### M4 — Hook Bridge + MCP Coordinator (1.5 weeks)
- Axum hook endpoint, token auth.
- rmcp server on unix socket, write `.mcp.json` on workspace init.
- Wire normalized events → coordinator state → UI.
- Install Claude Code hooks and `.mcp.json` automatically.

### M5 — Coordination Tools (1 week)
- Implement the 6 MCP tools above.
- Conflict detection: warn in Overview if two agents touch same file within window N.
- File heatmap.

### M6 — Polish + Package (1 week)
- Settings page (per-agent env, CLI path overrides).
- Light/dark theme.
- Bundle `.dmg`, `.AppImage`, `.deb`. CI matrix: macOS-14 + ubuntu-22.04.

### M7 (post-MVP) — Per-agent adapters & richer integration
- Codex event integration.
- Antigravity CLI task dispatch.
- Optional GUI-agent launchers (open Cursor externally, sync via file layer only).

---

## Critical Files to Create (none exist yet)

| Path | Purpose |
|------|---------|
| `Cargo.toml` (workspace) | Rust workspace manifest. |
| `crates/app/tauri.conf.json` | Tauri config, allowed APIs, bundler targets. |
| `crates/pty/src/lib.rs` | `PtySession` abstraction over `portable_pty::PtySystem`. |
| `crates/coordinator/src/state.rs` | In-memory `WorkspaceState`, broadcast channel. |
| `crates/coordinator/src/watcher.rs` | `notify` + debouncer; markdown parser. |
| `crates/mcp_server/src/lib.rs` | rmcp `ServerHandler` impl with the 6 tools. |
| `crates/hook_bridge/src/lib.rs` | axum router, token middleware, event normalizer. |
| `crates/agents/src/registry.rs` | Built-in `AgentAdapter` instances. |
| `src/panes/TerminalPane.tsx` | xterm.js bound to Tauri pty channel. |
| `src/overview/*` | All overview components. |
| `templates/AGENTS.md` | Boilerplate injected into workspace explaining the coordination protocol to any agent that reads it. |

---

## Reusable Existing Pieces (external)

- **`portable-pty`** — don't roll our own pty. Wezterm uses it in production.
- **`rmcp`** — official MCP Rust SDK; do not implement protocol ourselves.
- **xterm.js + addons** — handles ANSI, mouse, copy/paste, links.
- **Tauri v2 plugins**: `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-shell` for workspace picker and signed shell exec.

---

## Verification Plan

End-to-end checks after each milestone:

1. **M1**: Open app, see a working bash prompt. Resize window, terminal reflows. `ls`, `vim`, `htop` work.
2. **M2**: Launch 3 agent panes side-by-side (Claude Code, Codex, Antigravity CLI). Each accepts input, shows output, survives backgrounding.
3. **M3**: Edit `TASKS.md` in external editor → Overview sidebar updates within 500ms. App-side edit writes back to disk.
4. **M4**: Run Claude Code in a pane → trigger a tool call → confirm hook event arrives at bridge and appears in ActivityFeed. Attach MCP inspector to coordinator socket → list tools.
5. **M5**: From Claude Code agent, call `team_state` MCP tool → returns parsed state. Two agents claim same task → second gets conflict error. Both edit same file within 30s → Overview shows red warning.
6. **M6**: Install `.dmg` on macOS 14, `.deb` on Ubuntu 22.04, `.AppImage` on Fedora 39. Cold-start under 1s, idle RAM under 250MB with 3 agents.

Manual test checklist lives in `docs/qa/manual-checks.md` (to be created).

Automated tests:
- Rust: unit tests per crate; integration test that spins up coordinator + fake MCP client and exercises all 6 tools.
- Frontend: Vitest for component logic; Playwright (via `tauri-driver`) for the open-workspace → spawn-agent → see-overview-update path.

---

## Open Risks

1. **macOS pty permissions** — portable-pty handles this; verify codesigning entitlements include `com.apple.security.device.audio-input` is NOT needed (it isn't), but `--deep` signing of bundled binaries is.
2. **Hook install is invasive** — modifying user's `~/.claude/settings.json` is risky. Mitigation: write workspace-local `.claude/settings.json` only, never touch user-global config.
3. **MCP server discoverability** — agents need to know the socket path. Mitigation: write `.mcp.json` in workspace root per Claude Code's documented config; for Codex, write equivalent.
4. **GUI agents such as Cursor cannot be hosted in-window on Linux** under Wayland (no XEmbed equivalent). Defer to post-MVP; for v1 they're "external" and sync only via file layer.
5. **Some CLIs lack hooks** — fallback to pty scraping for activity signal, or none at all (file watcher catches edits).

---

## Out of Scope (v1)

- Windows support.
- Cloud sync between workspaces / machines.
- Built-in LLM (we host *agents*, not models).
- Embedding GUI agents such as Cursor inside the window.
- Multi-user / collaboration features.
