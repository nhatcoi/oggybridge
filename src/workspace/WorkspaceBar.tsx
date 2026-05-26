import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, X } from "../overview/Icons";
import { WorkspaceInfo } from "../types";
import { shortPath } from "../utils";
import "../styles/WorkspaceBar.css";

interface Props {
  workspace: WorkspaceInfo | null;
  onOpen: (info: WorkspaceInfo) => void;
  onClose: () => void;
}

export default function WorkspaceBar({ workspace, onOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setLoading(true);
    setError(null);
    try {
      const info = await invoke<WorkspaceInfo>("open_workspace", { path: selected });
      onOpen(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    await invoke("close_workspace").catch(() => {});
    onClose();
  };

  return (
    <div className="workspace-bar">
      {workspace ? (
        <>
          <FolderOpen size={15} className="ws-icon" />
          <span className="ws-path" title={workspace.path}>
            {shortPath(workspace.path)}
          </span>
          <button className="ws-btn ws-btn-close" onClick={handleClose} title="Close workspace">
            <X size={12} style={{ display: "block" }} />
          </button>
        </>
      ) : (
        <>
          <span className="ws-hint">No workspace open</span>
          <button className="ws-btn ws-btn-open" onClick={handleOpen} disabled={loading}>
            {loading ? "Opening…" : "Open Workspace"}
          </button>
        </>
      )}
      {error && <span className="ws-error">{error}</span>}
    </div>
  );
}
