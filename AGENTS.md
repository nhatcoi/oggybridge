# Repository Guidelines

## Project Structure & Module Organization

This repository is a Tauri 2 desktop app named OggyBridge. The React + TypeScript frontend lives in `src/`: `App.tsx` owns the shell, `panes/` contains terminal pane UI, `overview/` contains sidebar/task views, and `workspace/` contains workspace selection UI. CSS files are colocated with components. The native backend is in `src-tauri/`, with config in `src-tauri/tauri.conf.json` and Rust commands/workspace logic in `src-tauri/src/`. Shared Rust crates are in `crates/pty`, `crates/hook_bridge`, and `crates/mcp_server`.

## Build, Test, and Development Commands

- `npm install`: install frontend and Tauri CLI dependencies.
- `npm run dev`: run the Vite frontend dev server.
- `npm run build`: type-check with `tsc` and build the frontend bundle.
- `npm run preview`: preview the built frontend.
- `npm run tauri dev`: run the full desktop app in development mode.
- `npm run tauri build`: produce platform bundles through Tauri.
- `cargo test --workspace`: run Rust crate and Tauri backend tests.
- `cargo fmt --all`: format Rust code before committing.

## Coding Style & Naming Conventions

TypeScript is strict: keep unused locals and parameters out of committed code. Use React function components, PascalCase component filenames such as `TerminalPane.tsx`, and colocated styles like `TerminalPane.css`. Prefer explicit interfaces/types for shared props and state. Rust uses edition 2021 conventions: `snake_case` functions, `PascalCase` types, and `cargo fmt` formatting. Keep IPC command names aligned across Rust and TypeScript call sites.

## Testing Guidelines

There is no dedicated frontend test runner configured yet, so `npm run build` is the minimum validation for UI changes. Add Rust tests near the crate code they cover, using unit tests inside `src/lib.rs` modules or integration tests under a crate-level `tests/` directory. For changes that affect PTY spawning, workspace lifecycle, or MCP coordination, run `cargo test --workspace` and manually exercise `npm run tauri dev`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits, for example `feat: implement MCP server coordinator` and `docs: add initialization logic doc`. Use short, imperative subjects with a clear scope when useful. Pull requests should include a summary, validation commands, linked issues when applicable, and screenshots or recordings for UI changes. Call out platform-specific behavior, especially Linux/macOS packaging or terminal process handling.

## Agent-Specific Instructions

This workspace may be used by multiple AI agents. Before editing files under `src-tauri/`, read `src-tauri/AGENTS.md` and follow its coordination protocol for task claiming, progress reporting, touched files, and release.
