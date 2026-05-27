use super::home_dir;
use std::collections::HashMap;
use std::fs;

pub fn detect_antigravity_session(workspace_path: &str) -> Option<String> {
    let path = home_dir()?.join(".gemini/antigravity-cli/cache/last_conversations.json");
    let raw = fs::read_to_string(path).ok()?;
    let conversations = serde_json::from_str::<HashMap<String, String>>(&raw).ok()?;
    conversations.get(workspace_path).cloned()
}
