pub mod session;
pub mod settings;


use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn app_config_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");
    let session_path = config_dir.join("session.json");
    Ok((config_dir, settings_path, session_path))
}

pub(crate) fn ensure_settings_file(settings_path: &Path) -> Result<(), String> {
    if !settings_path.exists() {
        fs::write(settings_path, "{}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) fn ensure_session_file(session_path: &Path) -> Result<(), String> {
    if !session_path.exists() {
        fs::write(session_path, "{}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_config_paths(app: AppHandle) -> Result<(String, String, String), String> {
    let (config_dir, settings_path, session_path) = app_config_paths(&app)?;
    ensure_settings_file(&settings_path)?;
    ensure_session_file(&session_path)?;
    Ok((
        config_dir.to_string_lossy().to_string(),
        settings_path.to_string_lossy().to_string(),
        session_path.to_string_lossy().to_string(),
    ))
}
