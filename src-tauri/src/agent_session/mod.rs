mod antigravity;
mod claude;
mod codex;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(super) struct AgentSessionCandidate {
    pub id: String,
    pub modified_ms: u64,
}

pub(super) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

pub(super) fn file_modified_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

pub(super) fn collect_files(dir: &Path, suffix: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, suffix, out);
        } else if path.to_string_lossy().ends_with(suffix) {
            out.push(path);
        }
    }
}

#[tauri::command]
pub fn detect_agent_session(
    agent_id: String,
    workspace_path: String,
    since_ms: Option<u64>,
) -> Result<Option<String>, String> {
    let session_id = match agent_id.as_str() {
        "codex" => codex::detect_codex_session(&workspace_path, since_ms),
        "claude-code" => claude::detect_resumable_claude_session(&workspace_path),
        "antigravity" => antigravity::detect_antigravity_session(&workspace_path),
        _ => None,
    };
    Ok(session_id)
}
