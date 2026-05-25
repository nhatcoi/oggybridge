import { FileHeatEntry } from "../App";
import "./FileHeatmap.css";

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#da7756",
  "codex":       "#7c6af7",
  "copilot":     "#2da44e",
  "antigravity": "#e3b341",
  "shell":       "#6e7681",
};

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}

interface Props {
  entries: FileHeatEntry[];
}

export default function FileHeatmap({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="sidebar-hint">No file activity yet</p>;
  }
  return (
    <div className="heatmap">
      {entries.map((entry) => (
        <div
          key={entry.path}
          className={`heatmap-row${entry.hasConflict ? " heatmap-conflict" : ""}`}
          title={entry.path}
        >
          {entry.hasConflict && (
            <span className="conflict-icon" title="Multiple agents editing this file">⚠</span>
          )}
          <span className="heatmap-path">{shortPath(entry.path)}</span>
          <span className="heatmap-agents">
            {entry.agents.map((agentId) => (
              <span
                key={agentId}
                className="agent-dot"
                style={{ backgroundColor: AGENT_COLORS[agentId] ?? "#484f58" }}
                title={agentId}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
