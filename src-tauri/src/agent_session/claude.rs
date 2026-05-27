use super::{collect_files, file_modified_ms, home_dir, AgentSessionCandidate};
use std::path::PathBuf;

fn claude_project_dir(workspace_path: &str) -> PathBuf {
    let encoded = workspace_path.replace('/', "-");
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".claude/projects")
        .join(encoded)
}

pub fn detect_resumable_claude_session(workspace_path: &str) -> Option<String> {
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
