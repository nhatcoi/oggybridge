use super::{collect_files, file_modified_ms, home_dir, AgentSessionCandidate};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

fn codex_session_from_file(path: &Path, workspace_path: &str) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(8).flatten() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        let Some(payload) = value.get("payload") else { continue };
        let Some(cwd) = payload.get("cwd").and_then(|v| v.as_str()) else { continue };
        if cwd != workspace_path {
            continue;
        }
        return payload.get("id")?.as_str().map(str::to_string);
    }
    None
}

pub fn detect_codex_session(workspace_path: &str, since_ms: Option<u64>) -> Option<String> {
    let root = home_dir()?.join(".codex/sessions");
    let mut files = Vec::new();
    collect_files(&root, ".jsonl", &mut files);
    files
        .into_iter()
        .filter_map(|path| {
            let modified_ms = file_modified_ms(&path)?;
            if since_ms.is_some_and(|since| modified_ms + 2_000 < since) {
                return None;
            }
            let id = codex_session_from_file(&path, workspace_path)?;
            Some(AgentSessionCandidate { id, modified_ms })
        })
        .max_by_key(|c| c.modified_ms)
        .map(|c| c.id)
}
