use crate::config::{app_config_paths, ensure_settings_file, ensure_session_file};
use std::path::Path;
use tauri::AppHandle;

fn open_os_path(path: &Path) -> Result<(), String> {
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
