use super::{
    collect_workspace_files, open, safe_workspace_path, WorkspaceFileEntry, WorkspaceInfo,
    WorkspaceStore, WriteWorkspaceFileRequest,
};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn open_workspace(
    path: String,
    app: AppHandle,
    store: State<'_, WorkspaceStore>,
) -> Result<WorkspaceInfo, String> {
    let p = std::path::Path::new(&path);
    let (handle, info) = open(p, app).await.map_err(|e| e.to_string())?;
    *store.0.lock().unwrap() = Some(handle);
    Ok(info)
}

#[tauri::command]
pub fn close_workspace(store: State<'_, WorkspaceStore>) -> Result<(), String> {
    *store.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn read_workspace_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workspace_files(workspace_path: String) -> Result<Vec<WorkspaceFileEntry>, String> {
    let workspace = PathBuf::from(workspace_path);
    let workspace_root = workspace.canonicalize().map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    collect_workspace_files(&workspace_root, &workspace_root, &mut files)?;
    files.sort_by(|a, b| {
        let kind_order = match (a.kind.as_str(), b.kind.as_str()) {
            ("directory", "file") => std::cmp::Ordering::Less,
            ("file", "directory") => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        };
        kind_order.then_with(|| a.path.cmp(&b.path))
    });
    Ok(files)
}

#[tauri::command]
pub fn read_workspace_text_file(
    workspace_path: String,
    relative_path: String,
) -> Result<String, String> {
    let path = safe_workspace_path(&workspace_path, &relative_path)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_workspace_text_file(request: WriteWorkspaceFileRequest) -> Result<(), String> {
    let path = safe_workspace_path(&request.workspace_path, &request.relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, request.content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_workspace_dir(workspace_path: String, relative_path: String) -> Result<(), String> {
    let path = safe_workspace_path(&workspace_path, &relative_path)?;
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_workspace_item(
    workspace_path: String,
    from_path: String,
    to_name: String,
) -> Result<(), String> {
    let to_name = to_name.trim().to_string();
    if to_name.is_empty() || to_name.contains('/') || to_name.contains('\\') {
        return Err("Invalid name".to_string());
    }
    let from = safe_workspace_path(&workspace_path, &from_path)?;
    let to = from.parent()
        .ok_or_else(|| "No parent directory".to_string())?
        .join(&to_name);
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace_item(workspace_path: String, relative_path: String) -> Result<(), String> {
    let path = safe_workspace_path(&workspace_path, &relative_path)?;
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}
