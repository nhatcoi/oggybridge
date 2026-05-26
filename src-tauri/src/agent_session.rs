use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

struct AgentSessionCandidate {
    id: String,
    modified_ms: u64,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn file_modified_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn collect_files(dir: &Path, suffix: &str, out: &mut Vec<PathBuf>) {
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

fn codex_session_from_file(path: &Path, workspace_path: &str) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(8).flatten() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        let Some(payload) = value.get("payload") else { continue };
        let Some(cwd) = payload.get("cwd").and_then(|v| v.as_str()) else { continue };
        if cwd != workspace_path { continue; }
        return payload.get("id")?.as_str().map(str::to_string);
    }
    None
}

fn detect_codex_session(workspace_path: &str, since_ms: Option<u64>) -> Option<String> {
    let root = home_dir()?.join(".codex/sessions");
    let mut files = Vec::new();
    collect_files(&root, ".jsonl", &mut files);
    files
        .into_iter()
        .filter_map(|path| {
            let modified_ms = file_modified_ms(&path)?;
            if since_ms.is_some_and(|since| modified_ms + 2_000 < since) { return None; }
            let id = codex_session_from_file(&path, workspace_path)?;
            Some(AgentSessionCandidate { id, modified_ms })
        })
        .max_by_key(|c| c.modified_ms)
        .map(|c| c.id)
}

fn claude_project_dir(workspace_path: &str) -> PathBuf {
    let encoded = workspace_path.replace('/', "-");
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".claude/projects")
        .join(encoded)
}

fn detect_resumable_claude_session(workspace_path: &str) -> Option<String> {
    let root = claude_project_dir(workspace_path);
    let mut files = Vec::new();
    collect_files(&root, ".jsonl", &mut files);
    files
        .into_iter()
        .filter_map(|path| {
            let modified_ms = file_modified_ms(&path)?;
            let id = path.file_stem()?.to_str()?.to_string();
            Some(AgentSessionCandidate { id, modified_ms })
        })
        .max_by_key(|c| c.modified_ms)
        .map(|c| c.id)
}

fn detect_antigravity_session(workspace_path: &str) -> Option<String> {
    let path = home_dir()?.join(".gemini/antigravity-cli/cache/last_conversations.json");
    let raw = fs::read_to_string(path).ok()?;
    let conversations = serde_json::from_str::<HashMap<String, String>>(&raw).ok()?;
    conversations.get(workspace_path).cloned()
}

#[tauri::command]
pub fn detect_agent_session(
    agent_id: String,
    workspace_path: String,
    since_ms: Option<u64>,
) -> Result<Option<String>, String> {
    let session_id = match agent_id.as_str() {
        "codex" => detect_codex_session(&workspace_path, since_ms),
        "claude-code" => detect_resumable_claude_session(&workspace_path),
        "antigravity" => detect_antigravity_session(&workspace_path),
        _ => None,
    };
    Ok(session_id)
}
