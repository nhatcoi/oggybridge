import { Fragment, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Columns, Folder, X } from "lucide-react";
import { AgentPane, AgentConfig, CustomAgentDef, WorkspaceInfo } from "../types";
import { AGENTS } from "../agents";
import { Translator } from "../i18n";
import { shortPath } from "../utils";
import TerminalPane from "./TerminalPane";
import AgentLauncher from "./AgentLauncher";
import "../styles/PaneGrid.css";

interface Props {
  panes: AgentPane[];
  maxPerRow: number;
  workspace: WorkspaceInfo | null;
  onClose: (id: string) => void;
  onAddPane: (agentId: string) => void;
  onPaneSessionId: (paneId: string, sessionId: string) => void;
  agentConfigs: Record<string, AgentConfig>;
  customAgents: CustomAgentDef[];
  t: Translator;
}

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

function resumeArgs(agentId: string, sessionId?: string): string[] {
  if (!sessionId) return [];
  if (agentId === "claude-code") return ["--resume", sessionId];
  if (agentId === "codex") return ["resume", sessionId];
  if (agentId === "antigravity") return ["--conversation", sessionId];
  return [];
}

function buildArgs(
  agentId: string,
  sessionId: string | undefined,
  agentConfigs: Record<string, AgentConfig>,
): string[] | undefined {
  const extraStr = agentConfigs[agentId]?.extraArgs?.trim() ?? "";
  const extra = extraStr ? extraStr.split(/\s+/) : [];
  const resume = resumeArgs(agentId, sessionId);
  const all = [...extra, ...resume];
  return all.length > 0 ? all : undefined;
}

export default function PaneGrid({ panes, maxPerRow, workspace, onClose, onAddPane, onPaneSessionId, agentConfigs, customAgents, t }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (paneId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const text = e.dataTransfer.getData("text/plain");
    if (text && ("__TAURI_INTERNALS__" in window)) {
      // Trailing space so the user can keep typing after the inserted path.
      invoke("write_pty", { id: paneId, data: `'${text}' ` }).catch(() => {});
    }
  };

  useEffect(() => {
    if (panes.length > 0 && (!focused || !panes.some((p) => p.id === focused))) {
      setFocused(panes[panes.length - 1].id);
    }
  }, [panes]);

  useEffect(() => {
    const onStart = () => setIsDragging(true);
    const onEnd = () => { setIsDragging(false); setDropTarget(null); };
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
    };
  }, []);

  if (panes.length === 0) {
    return (
      <div className="pane-empty-container">
        <AgentLauncher onLaunch={onAddPane} t={t} />
      </div>
    );
  }

  const rows = chunk(panes, Math.max(1, maxPerRow));

  return (
    <div className="pane-grid-outer">
      <PanelGroup orientation="vertical">
        {rows.map((row, rowIdx) => (
          <Fragment key={rowIdx}>
            {rowIdx > 0 && <PanelResizeHandle className="pane-row-divider" />}
            <Panel defaultSize={`${100 / rows.length}%`} minSize="15%">
              <PanelGroup orientation="horizontal">
                {row.map((pane, colIdx) => {
            const agent = AGENTS.find((a) => a.id === pane.agentId)
              ?? customAgents.find((a) => a.id === pane.agentId);
            const isFocused = focused === pane.id;
            const agentClass = getAgentClass(pane.agentId);

            return (
              <Fragment key={pane.id}>
                {colIdx > 0 && (
                  <PanelResizeHandle className="pane-divider" />
                )}
                <Panel
                  minSize="10%"
                  defaultSize={`${100 / row.length}%`}
                >
                  <div
                    className={`pane-wrapper ${agentClass}${isFocused ? " focused" : ""}`}
                    onMouseDown={() => setFocused(pane.id)}
                  >
                    <div className="pane-titlebar">
                      <div className="pane-titlebar-left">
                        <span className="pane-title">{pane.label}</span>
                        <span className="pane-status-badge">
                          <span className="pulse-dot"></span>
                          {t("common.running")}
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
                          title={t("pane.split")}
                        >
                          <Columns size={12} />
                        </button>
                        <button
                          className="pane-action-btn close"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onClose(pane.id); }}
                          title={t("pane.close")}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="pane-terminal">
                      <TerminalPane
                        id={pane.id}
                        agentId={pane.agentId}
                        cmd={agent?.cmd || undefined}
                        args={buildArgs(pane.agentId, pane.sessionId, agentConfigs)}
                        cwd={workspace?.path}
                        onSessionId={(sessionId) => onPaneSessionId(pane.id, sessionId)}
                      />
                      <div
                        className={`pane-drop-overlay${isDragging ? " drag-active" : ""}${dropTarget === pane.id ? " drop-target" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropTarget(pane.id); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => handleDrop(pane.id, e)}
                      />
                    </div>
                  </div>
                </Panel>
              </Fragment>
            );
          })}
              </PanelGroup>
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    </div>
  );
}
