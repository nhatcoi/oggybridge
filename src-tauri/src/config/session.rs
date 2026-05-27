use super::app_config_paths;
use std::fs;
use tauri::AppHandle;

#[tauri::command]
pub fn read_session_state(app: AppHandle) -> Result<String, String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    if session_path.exists() {
        fs::read_to_string(session_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
pub fn write_session_state(app: AppHandle, session: String) -> Result<(), String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    fs::write(session_path, session).map_err(|e| e.to_string())
}
