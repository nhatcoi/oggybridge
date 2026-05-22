use agenthost_hook_bridge::{HookBridge, HookEvent};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ── state ────────────────────────────────────────────────────────────────────

pub struct WorkspaceHandle {
    #[allow(dead_code)]
    pub path: PathBuf,
    _debouncer: Debouncer<RecommendedWatcher>,
    _bridge_abort: tokio::task::AbortHandle,
}

impl Drop for WorkspaceHandle {
    fn drop(&mut self) {
        self._bridge_abort.abort();
    }
}

pub struct WorkspaceStore(pub Mutex<Option<WorkspaceHandle>>);

// ── serialisable types returned to frontend ──────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub path: String,
    pub tasks_md: String,
    pub agent_state_md: String,
    pub hook_port: u16,
}

#[derive(Serialize, Clone)]
pub struct FileChangedPayload {
    pub kind: String,
    pub content: String,
    pub path: String,
}

// ── public API ───────────────────────────────────────────────────────────────

pub async fn open(
    workspace: &Path,
    app: AppHandle,
) -> anyhow::Result<(WorkspaceHandle, WorkspaceInfo)> {
    let mut info = init_agents_dir(workspace)?;

    // Start hook bridge; forward events to frontend via Tauri event
    let app_bridge = app.clone();
    let bridge = HookBridge::start(move |event: HookEvent| {
        let _ = app_bridge.emit("hook-event", &event);
    })
    .await?;

    write_hook_scripts(workspace, bridge.port, &bridge.token)?;
    info.hook_port = bridge.port;

    // File watcher for .agents/
    let agents_dir = workspace.join(".agents");
    let app_watcher = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        move |res: DebounceEventResult| {
            let events = match res {
                Ok(e) => e,
                Err(_) => return,
            };
            for ev in events {
                let content = fs::read_to_string(&ev.path).unwrap_or_default();
                let kind = classify(&ev.path);
                let _ = app_watcher.emit(
                    "workspace-file-changed",
                    FileChangedPayload {
                        path: ev.path.to_string_lossy().to_string(),
                        kind,
                        content,
                    },
                );
            }
        },
    )?;
    debouncer
        .watcher()
        .watch(&agents_dir, RecursiveMode::Recursive)?;

    let handle = WorkspaceHandle {
        path: workspace.to_owned(),
        _debouncer: debouncer,
        _bridge_abort: bridge.abort,
    };

    Ok((handle, info))
}

// ── hook scripts ─────────────────────────────────────────────────────────────

fn write_hook_scripts(workspace: &Path, port: u16, token: &str) -> anyhow::Result<()> {
    let hooks_dir = workspace.join(".agents/hooks");
    fs::create_dir_all(&hooks_dir)?;

    for name in &["pre_tool_use.sh", "post_tool_use.sh"] {
        let script = format!(
            "#!/bin/bash\n\
             # OggyBridge hook — pipes stdin to the local hook bridge.\n\
             curl -s -o /dev/null --max-time 5 \\\n\
               -X POST \"http://127.0.0.1:{port}/hooks/claude-code\" \\\n\
               -H \"Authorization: Bearer {token}\" \\\n\
               -H \"Content-Type: application/json\" \\\n\
               --data-binary @-\n\
             exit 0\n"
        );
        let path = hooks_dir.join(name);
        fs::write(&path, script)?;
        make_executable(&path)?;
    }

    write_claude_settings(workspace, &hooks_dir)?;
    Ok(())
}

#[cfg(unix)]
fn make_executable(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms)?;
    Ok(())
}

fn write_claude_settings(workspace: &Path, hooks_dir: &Path) -> anyhow::Result<()> {
    let dot_claude = workspace.join(".claude");
    fs::create_dir_all(&dot_claude)?;

    let settings_path = dot_claude.join("settings.json");
    let mut settings: serde_json::Value = if settings_path.exists() {
        let raw = fs::read_to_string(&settings_path)?;
        serde_json::from_str(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let pre = hooks_dir.join("pre_tool_use.sh");
    let post = hooks_dir.join("post_tool_use.sh");

    settings["hooks"] = serde_json::json!({
        "PreToolUse": [{"hooks": [{"type": "command", "command": pre.to_string_lossy()}]}],
        "PostToolUse": [{"hooks": [{"type": "command", "command": post.to_string_lossy()}]}]
    });

    fs::write(settings_path, serde_json::to_string_pretty(&settings)?)?;
    Ok(())
}

// ── workspace init ────────────────────────────────────────────────────────────

fn init_agents_dir(workspace: &Path) -> anyhow::Result<WorkspaceInfo> {
    let dir = workspace.join(".agents");
    fs::create_dir_all(dir.join("hooks"))?;

    let tasks_path = dir.join("TASKS.md");
    if !tasks_path.exists() {
        fs::write(&tasks_path, TASKS_TEMPLATE)?;
    }

    let state_path = dir.join("AGENT_STATE.md");
    if !state_path.exists() {
        fs::write(&state_path, AGENT_STATE_TEMPLATE)?;
    }

    if !dir.join("ACTIVITY.log").exists() {
        fs::write(dir.join("ACTIVITY.log"), "")?;
    }

    if !dir.join("config.toml").exists() {
        fs::write(dir.join("config.toml"), CONFIG_TEMPLATE)?;
    }

    let agents_md = workspace.join("AGENTS.md");
    if !agents_md.exists() {
        fs::write(&agents_md, AGENTS_MD_TEMPLATE)?;
    }

    let gitignore = workspace.join(".gitignore");
    let existing = if gitignore.exists() {
        fs::read_to_string(&gitignore)?
    } else {
        String::new()
    };
    if !existing.contains(".agents/") {
        let sep = if existing.is_empty() || existing.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        fs::write(&gitignore, format!("{}{}.agents/\n", existing, sep))?;
    }

    let tasks_md = fs::read_to_string(&tasks_path)?;
    let agent_state_md = fs::read_to_string(&state_path)?;

    Ok(WorkspaceInfo {
        path: workspace.to_string_lossy().to_string(),
        tasks_md,
        agent_state_md,
        hook_port: 0, // filled in after bridge starts
    })
}

fn classify(path: &Path) -> String {
    match path.file_name().and_then(|n| n.to_str()) {
        Some("TASKS.md") => "tasks",
        Some("AGENT_STATE.md") => "agent_state",
        Some("ACTIVITY.log") => "activity",
        _ => "other",
    }
    .to_string()
}

// ── templates ─────────────────────────────────────────────────────────────────

const TASKS_TEMPLATE: &str = r#"# Tasks

<!-- Agents: use MCP claim_task("id") to claim a task, release_task("id") to release. -->
<!-- Format: - [ ] <!-- id --> description -->

- [ ] <!-- setup --> Set up development environment
"#;

const AGENT_STATE_TEMPLATE: &str = r#"# Agent State

<!-- Auto-updated by OggyBridge coordinator. Do not edit manually. -->

| Agent | Status | Current Task | Files Touched |
|-------|--------|--------------|---------------|
| claude-code | idle | — | — |
| codex | idle | — | — |
| copilot | idle | — | — |
| antigravity | idle | — | — |
"#;

const CONFIG_TEMPLATE: &str = r#"[agents]
enabled = ["claude-code", "codex", "copilot", "antigravity"]

[coordinator]
hook_port = 0
mcp_socket = ".agents/coordinator.sock"
conflict_window_secs = 30
"#;

const AGENTS_MD_TEMPLATE: &str = r#"# OggyBridge Coordination Protocol

This workspace is managed by **OggyBridge**. Multiple AI agents may work here simultaneously.

## Rules

1. **Before starting work**, check `.agents/TASKS.md` and claim a task via the MCP coordinator
   (`claim_task("task-id")`), or add a new task first.
2. **Report progress** periodically: `report_progress("what you just did")`.
3. **Report touched files**: `touched_files(["path/to/file"])` when editing — this lets the
   coordinator warn if another agent is editing the same file.
4. **Release your task** when done: `release_task("task-id")`.

## Shared files

| File | Purpose |
|------|---------|
| `.agents/TASKS.md` | Canonical task list. Human- and agent-editable. |
| `.agents/AGENT_STATE.md` | Live per-agent status. Auto-updated by coordinator. |
| `.agents/ACTIVITY.log` | Append-only JSON-lines event log. |

## MCP coordinator

When the app is running, an MCP server is available at the socket in `.agents/config.toml`
(`mcp_socket`). Add it to your `.mcp.json` to enable tool-based coordination.
"#;
