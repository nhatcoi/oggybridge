use super::app_config_paths;
use std::fs;
use tauri::AppHandle;

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
