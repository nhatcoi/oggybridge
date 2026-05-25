import { useEffect, useRef, useState } from "react";
import { Columns, X, Folder } from "../overview/Icons";
import { AgentPane, AGENTS, WorkspaceInfo } from "../App";
import TerminalPane from "./TerminalPane";
import AgentLauncher from "./AgentLauncher";
import "./PaneGrid.css";

interface Props {
  panes: AgentPane[];
  maxPerRow: number;
  workspace: WorkspaceInfo | null;
  onClose: (id: string) => void;
  onAddPane: (agentId: string) => void;
}

const DIVIDER_PX = 6;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getAgentClass(agentId: string): string {
  if (agentId.includes("claude")) return "claude";
  if (agentId.includes("codex")) return "codex";
  if (agentId.includes("copilot")) return "copilot";
  if (agentId.includes("antigravity")) return "antigravity";
  return "shell";
}

export default function PaneGrid({ panes, maxPerRow, workspace, onClose, onAddPane }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep ratios in sync as panes are added/removed
  useEffect(() => {
    setRatios((prev) => {
      const next: Record<string, number> = {};
      for (const p of panes) next[p.id] = prev[p.id] ?? 1;
      return next;
    });
    if (panes.length > 0 && (!focused || !panes.some((p) => p.id === focused))) {
      setFocused(panes[panes.length - 1].id);
    }
  }, [panes]);

  if (panes.length === 0) {
    return (
      <div className="pane-empty-container">
        <AgentLauncher onLaunch={onAddPane} />
      </div>
    );
  }

  const rows = chunk(panes, Math.max(1, maxPerRow));

  return (
    <div className="pane-grid-outer" ref={containerRef}>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="pane-row">
          {row.map((pane, colIdx) => {
            const agent = AGENTS.find((a) => a.id === pane.agentId);
            const isFocused = focused === pane.id;
            const ratio = ratios[pane.id] ?? 1;
            const nextPane = row[colIdx + 1];
            const agentClass = getAgentClass(pane.agentId);

            return (
              <div key={pane.id} style={{ display: "contents" }}>
                <div
                  className={`pane-wrapper ${agentClass}${isFocused ? " focused" : ""}`}
                  style={{ flex: ratio }}
                  onMouseDown={() => setFocused(pane.id)}
                >
                  <div className="pane-titlebar">
                    <div className="pane-titlebar-left">
                      <span className="pane-title">{pane.label}</span>
                      <span className="pane-status-badge">
                        <span className="pulse-dot"></span>
                        Running
                      </span>
                      {workspace && (
                        <span className="pane-path" title={workspace.path}>
                          <Folder size={11} style={{ marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                          {shortPath(workspace.path)}
                        </span>
                      )}
                    </div>
                    <div className="pane-titlebar-right">
                      <button
                        className="pane-action-btn"
                        onClick={() => onAddPane(pane.agentId)}
                        title="Split horizontally"
                      >
                        <Columns size={12} />
                      </button>
                      <button
                        className="pane-action-btn close"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose(pane.id);
                        }}
                        title="Close pane"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="pane-terminal">
                    <TerminalPane
                      id={pane.id}
                      cmd={agent?.cmd || undefined}
                      cwd={workspace?.path}
                    />
                  </div>
                </div>

                {nextPane && (
                  <Divider
                    leftId={pane.id}
                    rightId={nextPane.id}
                    ratios={ratios}
                    containerRef={containerRef}
                    setRatios={setRatios}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────

interface DividerProps {
  leftId: string;
  rightId: string;
  ratios: Record<string, number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setRatios: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

function Divider({ leftId, rightId, ratios, containerRef, setRatios }: DividerProps) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const containerWidth = (containerRef.current?.offsetWidth ?? 400) - DIVIDER_PX;
    const snapLeft = ratios[leftId] ?? 1;
    const snapRight = ratios[rightId] ?? 1;
    const totalRatioSum = Object.values(ratios).reduce((a, b) => a + b, 0);
    const pxPerRatio = containerWidth / totalRatioSum;

    const onMove = (me: PointerEvent) => {
      const deltaRatio = (me.clientX - startX) / pxPerRatio;
      const newLeft = Math.max(0.1, snapLeft + deltaRatio);
      const newRight = Math.max(0.1, snapLeft + snapRight - newLeft);
      setRatios((prev) => ({ ...prev, [leftId]: newLeft, [rightId]: newRight }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return <div className="pane-divider" onPointerDown={onPointerDown} />;
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}
