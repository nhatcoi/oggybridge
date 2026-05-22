import { AgentPane, HookEvent, WorkspaceInfo } from "../App";
import TasksView from "./TasksView";
import "./Sidebar.css";

interface Agent {
  readonly id: string;
  readonly label: string;
  readonly cmd: string;
}

interface Props {
  agents: readonly Agent[];
  panes: AgentPane[];
  workspace: WorkspaceInfo | null;
  maxPerRow: number;
  onAddPane: (agentId: string) => void;
  onMaxPerRowChange: (n: number) => void;
  hookEvents: HookEvent[];
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}

const AGENT_ICONS: Record<string, string> = {
  "claude-code": "🤖",
  "codex":       "⚡",
  "copilot":     "🐙",
  "antigravity": "🛸",
  "shell":       "💻",
};

export default function Sidebar({ agents, panes, workspace, maxPerRow, onAddPane, onMaxPerRowChange, hookEvents }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">OggyBridge</span>
      </div>

      {workspace && (
        <section className="sidebar-section">
          <h3 className="sidebar-section-title">Tasks</h3>
          <TasksView tasksMd={workspace.tasksMd} />
        </section>
      )}

      <section className="sidebar-section">
        <h3 className="sidebar-section-title">Agents</h3>
        {agents.map((agent) => (
          <button
            key={agent.id}
            className="agent-btn"
            onClick={() => onAddPane(agent.id)}
            title={`Open ${agent.label}`}
          >
            <span className="agent-icon">{AGENT_ICONS[agent.id] ?? "▶"}</span>
            <span className="agent-label">{agent.label}</span>
          </button>
        ))}
      </section>

      <section className="sidebar-section">
        <h3 className="sidebar-section-title">Open Panes ({panes.length})</h3>
        {panes.length === 0 && (
          <p className="sidebar-hint">No open panes</p>
        )}
        {panes.map((pane) => (
          <div key={pane.id} className="pane-item">
            <span className="agent-icon">{AGENT_ICONS[pane.agentId] ?? "▶"}</span>
            <span className="pane-item-label">{pane.label}</span>
          </div>
        ))}
      </section>

      <section className="sidebar-section">
        <h3 className="sidebar-section-title">Layout</h3>
        <div className="layout-control">
          <span className="layout-label">Max per row</span>
          <div className="layout-stepper">
            <button
              className="stepper-btn"
              onClick={() => onMaxPerRowChange(Math.max(1, maxPerRow - 1))}
              disabled={maxPerRow <= 1}
            >−</button>
            <span className="stepper-val">{maxPerRow}</span>
            <button
              className="stepper-btn"
              onClick={() => onMaxPerRowChange(Math.min(6, maxPerRow + 1))}
              disabled={maxPerRow >= 6}
            >+</button>
          </div>
        </div>
      </section>

      {hookEvents.length > 0 && (
        <section className="sidebar-section activity-section">
          <h3 className="sidebar-section-title">Activity</h3>
          <div className="activity-feed">
            {hookEvents.slice(0, 15).map((ev, i) => (
              <div key={i} className="activity-row">
                <span className="activity-time">{fmtTime(ev.ts)}</span>
                <span className="activity-event">{ev.event.replace(/_/g, " ")}</span>
                {ev.tool && <span className="activity-tool">{ev.tool}</span>}
                {ev.files[0] && (
                  <span className="activity-file" title={ev.files[0]}>
                    {shortPath(ev.files[0])}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="sidebar-footer">
        <span className="version-label">v0.1.0 · M4</span>
      </div>
    </aside>
  );
}
