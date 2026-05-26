mod agent_session;
mod config;
mod pty;
mod tray;
mod workspace;

use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(pty::PtyStore(Mutex::new(HashMap::new())))
        .manage(workspace::WorkspaceStore(Mutex::new(None)))
        .setup(tray::setup)
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            workspace::open_workspace,
            workspace::close_workspace,
            workspace::read_workspace_file,
            workspace::list_workspace_files,
            workspace::read_workspace_text_file,
            workspace::write_workspace_text_file,
            agent_session::detect_agent_session,
            config::read_settings,
            config::write_settings,
            config::read_session_state,
            config::write_session_state,
            config::get_config_paths,
            config::open_settings_file,
            config::open_session_file,
            config::open_config_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
