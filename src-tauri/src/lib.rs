mod workspace;

use agenthost_pty::PtySession;
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
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
    cwd: Option<String>,
    app: AppHandle,
    store: State<'_, PtyStore>,
) -> Result<(), String> {
    let shell = cmd.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    });
    let cwd_path = cwd.as_deref().map(std::path::Path::new);
    let event_name = format!("pty-data-{}", id);
    let session = PtySession::spawn(cols, rows, &shell, cwd_path, move |data| {
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

#[tauri::command]
fn read_settings(app: AppHandle) -> Result<String, String> {
    let path_resolver = app.path();
    let config_dir = path_resolver.app_config_dir().map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");
    if settings_path.exists() {
        fs::read_to_string(settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn write_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let path_resolver = app.path();
    let config_dir = path_resolver.app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");
    fs::write(settings_path, settings).map_err(|e| e.to_string())
}

// ── app bootstrap ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            read_settings,
            write_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
