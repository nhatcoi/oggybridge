use oggybridge_pty::PtySession;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct PtyStore(pub Mutex<HashMap<String, PtySession>>);

#[tauri::command]
pub fn create_pty(
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
pub fn write_pty(id: String, data: String, store: State<'_, PtyStore>) -> Result<(), String> {
    let guard = store.0.lock().unwrap();
    match guard.get(&id) {
        Some(s) => s.write(data.as_bytes()).map_err(|e| e.to_string()),
        None => Err(format!("pty '{}' not found", id)),
    }
}

#[tauri::command]
pub fn resize_pty(id: String, cols: u16, rows: u16, store: State<'_, PtyStore>) -> Result<(), String> {
    let guard = store.0.lock().unwrap();
    match guard.get(&id) {
        Some(s) => s.resize(cols, rows).map_err(|e| e.to_string()),
        None => Err(format!("pty '{}' not found", id)),
    }
}

#[tauri::command]
pub fn kill_pty(id: String, store: State<'_, PtyStore>) -> Result<(), String> {
    store.0.lock().unwrap().remove(&id);
    Ok(())
}
