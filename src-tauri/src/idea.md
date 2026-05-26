src-tauri/src/
├── main.rs                 # binary entry (already small, keep)
├── lib.rs                  # only: pub mod declarations + run() bootstrap
│
├── pty/
│   ├── mod.rs              # PtyStore type + #[tauri::command] handlers
│   └── (no sub-files needed — the heavy work lives in crates/pty)
│
├── workspace/
│   ├── mod.rs              # existing workspace.rs content (already a module)
│   └── commands.rs         # open/close/read_workspace_file Tauri commands
│
├── agent_session/
│   ├── mod.rs              # detect_agent_session command + dispatcher
│   ├── codex.rs            # detect_codex_session + helpers
│   ├── claude.rs           # detect_claude_session + claude_project_dir
│   └── antigravity.rs      # detect_antigravity_session
│
├── config/
│   ├── mod.rs              # app_config_paths, ensure_*_file helpers
│   ├── settings.rs         # read_settings, write_settings (+ tray sync)
│   └── session.rs          # read_session_state, write_session_state
│
├── tray/
│   └── mod.rs              # TrayIconBuilder setup, menu, click handlers
│
└── system.rs               # open_os_path, open_settings_file, open_session_file, open_config_dir
