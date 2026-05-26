import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WorkspaceInfo, HookEvent, FileChangedPayload } from "../types";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("recentWorkspaces");
      if (stored) setRecentWorkspaces(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<FileChangedPayload>("workspace-file-changed", (e) => {
      const { kind, content } = e.payload;
      setWorkspace((prev) => {
        if (!prev) return prev;
        if (kind === "tasks") return { ...prev, tasksMd: content };
        if (kind === "agent_state") return { ...prev, agentStateMd: content };
        return prev;
      });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<HookEvent>("hook-event", (e) => {
      setHookEvents((prev) => [e.payload, ...prev].slice(0, 50));
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const addToRecent = useCallback((path: string) => {
    setRecentWorkspaces((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 5);
      localStorage.setItem("recentWorkspaces", JSON.stringify(next));
      return next;
    });
  }, []);

  const openWorkspace = useCallback(async (path: string) => {
    try {
      const info = await invoke<WorkspaceInfo>("open_workspace", { path });
      setWorkspace(info);
      addToRecent(path);
    } catch (e) {
      alert(`Failed to open workspace: ${e}`);
    }
  }, [addToRecent]);

  const closeWorkspace = useCallback(async () => {
    await invoke("close_workspace").catch(() => {});
    setWorkspace(null);
  }, []);

  // Used by WorkspaceBar which runs its own invoke and passes the result
  const handleWorkspaceOpened = useCallback((info: WorkspaceInfo) => {
    setWorkspace(info);
    addToRecent(info.path);
  }, [addToRecent]);

  return { workspace, hookEvents, recentWorkspaces, openWorkspace, closeWorkspace, handleWorkspaceOpened };
}
