import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import PaneGrid from "./panes/PaneGrid";
import Sidebar from "./overview/Sidebar";
import WorkspaceBar from "./workspace/WorkspaceBar";
import "./App.css";

export interface AgentPane {
  id: string;
  agentId: string;
  label: string;
}

export interface WorkspaceInfo {
  path: string;
  tasksMd: string;
  agentStateMd: string;
  hookPort: number;
}

export interface HookEvent {
  agentId: string;
  event: string;
  tool: string | null;
  files: string[];
  ts: number;
}

interface FileChangedPayload {
  kind: string;
  content: string;
  path: string;
}

const AGENTS = [
  { id: "claude-code", label: "Claude Code", cmd: "claude" },
  { id: "codex",       label: "Codex",       cmd: "codex" },
  { id: "copilot",     label: "Copilot CLI", cmd: "gh" },
  { id: "aider",       label: "Aider",       cmd: "aider" },
  { id: "shell",       label: "Shell",       cmd: "" },
] as const;

let paneCounter = 0;

export default function App() {
  const [panes, setPanes] = useState<AgentPane[]>([
    { id: "pane-0", agentId: "shell", label: "Shell" },
  ]);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [maxPerRow, setMaxPerRow] = useState(2);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);

  // Listen for file-change events from the Rust watcher
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

  // Listen for hook events from the bridge
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<HookEvent>("hook-event", (e) => {
      setHookEvents((prev) => [e.payload, ...prev].slice(0, 50));
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const addPane = useCallback((agentId: string) => {
    paneCounter += 1;
    const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[AGENTS.length - 1];
    setPanes((prev) => [
      ...prev,
      { id: `pane-${paneCounter}`, agentId, label: agent.label },
    ]);
  }, []);

  const removePane = useCallback((id: string) => {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className="app-root">
      <Sidebar
        agents={AGENTS}
        onAddPane={addPane}
        panes={panes}
        workspace={workspace}
        maxPerRow={maxPerRow}
        onMaxPerRowChange={setMaxPerRow}
        hookEvents={hookEvents}
      />
      <main className="main-area">
        <WorkspaceBar
          workspace={workspace}
          onOpen={setWorkspace}
          onClose={() => setWorkspace(null)}
        />
        <PaneGrid panes={panes} maxPerRow={maxPerRow} workspace={workspace} onClose={removePane} />
      </main>
    </div>
  );
}

export { AGENTS };
