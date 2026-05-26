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

pub fn open_os_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = { let mut c = std::process::Command::new("open"); c.arg(path); c };

    #[cfg(target_os = "windows")]
    let mut command = { let mut c = std::process::Command::new("cmd"); c.args(["/C", "start", ""]).arg(path); c };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = { let mut c = std::process::Command::new("xdg-open"); c.arg(path); c };

    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Result<String, String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    if settings_path.exists() {
        fs::read_to_string(settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    fs::write(&settings_path, &settings).map_err(|e| e.to_string())?;
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&settings) {
        let enabled = v.get("startMinimizedToTray").and_then(|v| v.as_bool()).unwrap_or(false);
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_visible(enabled);
        }
    }
    Ok(())
}

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

#[tauri::command]
pub fn open_settings_file(app: AppHandle) -> Result<(), String> {
    let (_, settings_path, _) = app_config_paths(&app)?;
    ensure_settings_file(&settings_path)?;
    open_os_path(&settings_path)
}

#[tauri::command]
pub fn open_session_file(app: AppHandle) -> Result<(), String> {
    let (_, _, session_path) = app_config_paths(&app)?;
    ensure_session_file(&session_path)?;
    open_os_path(&session_path)
}

#[tauri::command]
pub fn open_config_dir(app: AppHandle) -> Result<(), String> {
    let (config_dir, _, _) = app_config_paths(&app)?;
    open_os_path(&config_dir)
}
