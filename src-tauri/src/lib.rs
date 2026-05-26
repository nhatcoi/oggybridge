mod workspace;

use oggybridge_pty::PtySession;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager, State};
use workspace::{WorkspaceInfo, WorkspaceStore};

// ── PTY state ────────────────────────────────────────────────────────────────

pub struct PtyStore(pub Mutex<HashMap<String, PtySession>>);

// ── PTY commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn create_pty(
    id: String,
    cols: u16,
    rows: u16,
    cmd: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    app: AppHandle,
    store: State<'_, PtyStore>,
) -> Result<(), String> {
    let shell = cmd.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    });
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    let args = args.unwrap_or_default();
    let event_name = format!("pty-data-{}", id);
    let session = PtySession::spawn(cols, rows, &shell, &args, cwd_path, move |data| {
        let _ = app.emit(&event_name, data);
    })
    .map_err(|e| e.to_string())?;
    store.0.lock().unwrap().insert(id, session);
    Ok(())
}

#[tauri::command]
fn write_pty(id: String, data: String, store: State<'_, PtyStore>) -> Result<(), String> {
    let guard = store.0.lock().unwrap();
    match guard.get(&id) {
        Some(s) => s.write(data.as_bytes()).map_err(|e| e.to_string()),
        None => Err(format!("pty '{}' not found", id)),
    }
}

#[tauri::command]
fn resize_pty(id: String, cols: u16, rows: u16, store: State<'_, PtyStore>) -> Result<(), String> {
    let guard = store.0.lock().unwrap();
    match guard.get(&id) {
        Some(s) => s.resize(cols, rows).map_err(|e| e.to_string()),
        None => Err(format!("pty '{}' not found", id)),
    }
}

#[tauri::command]
fn kill_pty(id: String, store: State<'_, PtyStore>) -> Result<(), String> {
    store.0.lock().unwrap().remove(&id);
    Ok(())
}

// ── Workspace commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn open_workspace(
    path: String,
    app: AppHandle,
    store: State<'_, WorkspaceStore>,
) -> Result<WorkspaceInfo, String> {
    let p = std::path::Path::new(&path);
    let (handle, info) = workspace::open(p, app).await.map_err(|e| e.to_string())?;
    *store.0.lock().unwrap() = Some(handle);
    Ok(info)
}

#[tauri::command]
fn close_workspace(store: State<'_, WorkspaceStore>) -> Result<(), String> {
    *store.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn read_workspace_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[derive(Debug)]
struct AgentSessionCandidate {
    id: String,
    modified_ms: u64,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn file_modified_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn collect_files(dir: &Path, suffix: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, suffix, out);
        } else if path.to_string_lossy().ends_with(suffix) {
            out.push(path);
        }
    }
}

fn codex_session_from_file(path: &Path, workspace_path: &str) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(8).flatten() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let Some(payload) = value.get("payload") else {
            continue;
        };
        let Some(cwd) = payload.get("cwd").and_then(|cwd| cwd.as_str()) else {
            continue;
        };
        if cwd != workspace_path {
            continue;
        }
        return payload.get("id")?.as_str().map(str::to_string);
    }
    None
}

fn detect_codex_session(workspace_path: &str, since_ms: Option<u64>) -> Option<String> {
    let root = home_dir()?.join(".codex/sessions");
    let mut files = Vec::new();
    collect_files(&root, ".jsonl", &mut files);

    files
        .into_iter()
        .filter_map(|path| {
            let modified_ms = file_modified_ms(&path)?;
            if since_ms.is_some_and(|since| modified_ms + 2_000 < since) {
                return None;
            }
            let id = codex_session_from_file(&path, workspace_path)?;
            Some(AgentSessionCandidate { id, modified_ms })
        })
        .max_by_key(|candidate| candidate.modified_ms)
        .map(|candidate| candidate.id)
}

fn claude_project_dir(workspace_path: &str) -> PathBuf {
    let encoded = workspace_path.replace('/', "-");
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".claude/projects")
        .join(encoded)
}

fn detect_claude_session(workspace_path: &str, since_ms: Option<u64>) -> Option<String> {
    let _ = since_ms;
    detect_resumable_claude_session(workspace_path)
}

fn detect_resumable_claude_session(workspace_path: &str) -> Option<String> {
    let root = claude_project_dir(workspace_path);
    let mut files = Vec::new();
    collect_files(&root, ".jsonl", &mut files);

    files
        .into_iter()
        .filter_map(|path| {
            let modified_ms = file_modified_ms(&path)?;
            let id = path.file_stem()?.to_str()?.to_string();
            Some(AgentSessionCandidate { id, modified_ms })
        })
        .max_by_key(|candidate| candidate.modified_ms)
        .map(|candidate| candidate.id)
}

fn detect_antigravity_session(workspace_path: &str) -> Option<String> {
    let path = home_dir()?.join(".gemini/antigravity-cli/cache/last_conversations.json");
    let raw = fs::read_to_string(path).ok()?;
    let conversations = serde_json::from_str::<HashMap<String, String>>(&raw).ok()?;
    conversations.get(workspace_path).cloned()
}

#[tauri::command]
fn detect_agent_session(
    agent_id: String,
    workspace_path: String,
    since_ms: Option<u64>,
) -> Result<Option<String>, String> {
    let session_id = match agent_id.as_str() {
        "codex" => detect_codex_session(&workspace_path, since_ms),
        "claude-code" => detect_claude_session(&workspace_path, since_ms)
            .or_else(|| detect_claude_session(&workspace_path, None)),
        "antigravity" => detect_antigravity_session(&workspace_path),
        _ => None,
    };
    Ok(session_id)
}

fn app_config_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let path_resolver = app.path();
    let config_dir = path_resolver.app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");
    let session_path = config_dir.join("session.json");
    Ok((config_dir, settings_path, session_path))
}

fn ensure_settings_file(settings_path: &Path) -> Result<(), String> {
    if !settings_path.exists() {
        fs::write(settings_path, "{}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_session_file(session_path: &Path) -> Result<(), String> {
    if !session_path.exists() {
        fs::write(session_path, "{}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn open_os_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]).arg(path);
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_settings(app: AppHandle) -> Result<String, String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    if settings_path.exists() {
        fs::read_to_string(settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn write_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    fs::write(settings_path, settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_session_state(app: AppHandle) -> Result<String, String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    if session_path.exists() {
        fs::read_to_string(session_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn write_session_state(app: AppHandle, session: String) -> Result<(), String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    fs::write(session_path, session).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config_paths(app: AppHandle) -> Result<(String, String, String), String> {
    let (config_dir, settings_path, session_path) = app_config_paths(&app)?;
    ensure_settings_file(&settings_path)?;
    ensure_session_file(&session_path)?;
    Ok((
        config_dir.to_string_lossy().to_string(),
        settings_path.to_string_lossy().to_string(),
        session_path.to_string_lossy().to_string(),
    ))
}

#[tauri::command]
fn open_settings_file(app: AppHandle) -> Result<(), String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    ensure_settings_file(&settings_path)?;
    open_os_path(&settings_path)
}

#[tauri::command]
fn open_session_file(app: AppHandle) -> Result<(), String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    ensure_session_file(&session_path)?;
    open_os_path(&session_path)
}

#[tauri::command]
fn open_config_dir(app: AppHandle) -> Result<(), String> {
    let (config_dir, _, _) = app_config_paths(&app)?;
    open_os_path(&config_dir)
}

// ── app bootstrap ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(PtyStore(Mutex::new(HashMap::new())))
        .manage(WorkspaceStore(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty,
            resize_pty,
            kill_pty,
            open_workspace,
            close_workspace,
            read_workspace_file,
            detect_agent_session,
            read_settings,
            write_settings,
            read_session_state,
            write_session_state,
            get_config_paths,
            open_settings_file,
            open_session_file,
            open_config_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
