use oggybridge_hook_bridge::{HookBridge, HookEvent};
use oggybridge_mcp_server::McpServer;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

// ── state ────────────────────────────────────────────────────────────────────

pub struct WorkspaceHandle {
    #[allow(dead_code)]
    pub path: PathBuf,
    _debouncer: Debouncer<RecommendedWatcher>,
    _bridge_abort: tokio::task::AbortHandle,
    _mcp_abort: tokio::task::AbortHandle,
}

impl Drop for WorkspaceHandle {
    fn drop(&mut self) {
        self._bridge_abort.abort();
        self._mcp_abort.abort();
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
    pub mcp_port: u16,
}

#[derive(Serialize, Clone)]
pub struct FileChangedPayload {
    pub kind: String,
    pub content: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileEntry {
    pub path: String,
    pub kind: String,
    pub modified_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteWorkspaceFileRequest {
    pub workspace_path: String,
    pub relative_path: String,
    pub content: String,
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

    // Start MCP coordinator server
    let mcp = McpServer::start(workspace.to_path_buf()).await?;
    write_mcp_json(workspace, mcp.port)?;
    info.mcp_port = mcp.port;

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
        _mcp_abort: mcp.abort,
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

fn write_mcp_json(workspace: &Path, port: u16) -> anyhow::Result<()> {
    let config = serde_json::json!({
        "mcpServers": {
            "oggybridge": {
                "url": format!("http://127.0.0.1:{port}/mcp"),
                "type": "streamableHttp"
            }
        }
    });
    fs::write(
        workspace.join(".mcp.json"),
        serde_json::to_string_pretty(&config)?,
    )?;
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
        mcp_port: 0,  // filled in after MCP server starts
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

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_workspace(
    path: String,
    app: AppHandle,
    store: State<'_, WorkspaceStore>,
) -> Result<WorkspaceInfo, String> {
    let p = std::path::Path::new(&path);
    let (handle, info) = open(p, app).await.map_err(|e| e.to_string())?;
    *store.0.lock().unwrap() = Some(handle);
    Ok(info)
}

#[tauri::command]
pub fn close_workspace(store: State<'_, WorkspaceStore>) -> Result<(), String> {
    *store.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn read_workspace_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workspace_files(workspace_path: String) -> Result<Vec<WorkspaceFileEntry>, String> {
    let workspace = PathBuf::from(workspace_path);
    let workspace_root = workspace.canonicalize().map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    collect_workspace_files(&workspace_root, &workspace_root, &mut files)?;
    files.sort_by(|a, b| {
        let kind_order = match (a.kind.as_str(), b.kind.as_str()) {
            ("directory", "file") => std::cmp::Ordering::Less,
            ("file", "directory") => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        };
        kind_order.then_with(|| a.path.cmp(&b.path))
    });
    Ok(files)
}

#[tauri::command]
pub fn read_workspace_text_file(
    workspace_path: String,
    relative_path: String,
) -> Result<String, String> {
    let path = safe_workspace_path(&workspace_path, &relative_path)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_workspace_text_file(request: WriteWorkspaceFileRequest) -> Result<(), String> {
    let path = safe_workspace_path(&request.workspace_path, &request.relative_path)?;
    fs::write(path, request.content).map_err(|e| e.to_string())
}

fn safe_workspace_path(workspace_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let workspace_root = PathBuf::from(workspace_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let path = workspace_root.join(relative_path);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid file path".to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !parent.starts_with(&workspace_root) {
        return Err("File is outside the workspace".to_string());
    }
    Ok(path)
}

fn collect_workspace_files(
    workspace_root: &Path,
    dir: &Path,
    out: &mut Vec<WorkspaceFileEntry>,
) -> Result<(), String> {
    if out.len() >= 5_000 {
        return Ok(());
    }

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");

        if should_skip_workspace_entry(file_name) {
            continue;
        }

        let Ok(relative) = path.strip_prefix(workspace_root) else {
            continue;
        };
        let relative_path = relative.to_string_lossy().replace('\\', "/");
        let modified_ms = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);

        if path.is_dir() {
            out.push(WorkspaceFileEntry {
                path: relative_path,
                kind: "directory".to_string(),
                modified_ms,
            });
            collect_workspace_files(workspace_root, &path, out)?;
            continue;
        }

        if !is_editable_file(&path) {
            continue;
        }

        out.push(WorkspaceFileEntry {
            path: relative_path,
            kind: "file".to_string(),
            modified_ms,
        });
    }
    Ok(())
}

fn should_skip_workspace_entry(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".DS_Store"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".vite"
    )
}

fn is_editable_file(path: &Path) -> bool {
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    if file_name.starts_with('.') {
        return true;
    }

    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    matches!(
        ext,
        "css"
            | "html"
            | "js"
            | "json"
            | "jsonl"
            | "jsx"
            | "md"
            | "rs"
            | "sh"
            | "toml"
            | "ts"
            | "tsx"
            | "txt"
            | "yml"
            | "yaml"
    )
}

// ── templates ─────────────────────────────────────────────────────────────────

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
