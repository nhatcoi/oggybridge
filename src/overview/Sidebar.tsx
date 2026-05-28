import {
  Bot, Search, Folder, FolderOpen, Activity, AlertTriangle, Settings, CheckSquare, X, Code,
} from "./Icons";
import { AgentPane, HookEvent, WorkspaceInfo } from "../types";
import { AGENT_ICONS } from "../agents";
import { Translator, interpolate } from "../i18n";
import { shortPath, fmtTime } from "../utils";
import TasksView from "./TasksView";
import { useState } from "react";
import logoUrl from "../assets/logo.png";
import "../styles/Sidebar.css";

interface Agent {
  readonly id: string;
  readonly label: string;
  readonly cmd: string;
}

interface Props {
  agents: readonly Agent[];
  panes: AgentPane[];
  workspace: WorkspaceInfo | null;
  onAddPane: (agentId: string) => void;
  hookEvents: HookEvent[];
  recentWorkspaces: string[];
  onSelectWorkspace: (path: string) => void;
  onToggleSettings: () => void;
  onToggleCommandPalette: () => void;
  activeView: SidebarView | null;
  onActiveViewChange: (view: SidebarView | null) => void;
  editorOpen: boolean;
  onEditorToggle: () => void;
  t: Translator;
}

export type SidebarView = "explorer" | "tasks" | "agents" | "activity";

export default function Sidebar({
  agents,
  panes,
  workspace,
  onAddPane,
  hookEvents,
  recentWorkspaces,
  onSelectWorkspace,
  onToggleSettings,
  onToggleCommandPalette,
  activeView,
  onActiveViewChange,
  editorOpen,
  onEditorToggle,
  t,
}: Props) {
  const hasSidebarPanel = activeView !== null;
  const [isLogoOpen, setIsLogoOpen] = useState(false);

  const hasConflict = hookEvents.length >= 2 && (() => {
    const first = hookEvents[0];
    return hookEvents.slice(1).some(
      (ev) =>
        ev.agentId !== first.agentId &&
        Math.abs(first.ts - ev.ts) < 30 &&
        ev.files.some((f) => first.files.includes(f))
    );
  })();

  const conflictFile = hasConflict && hookEvents[0].files[0] ? shortPath(hookEvents[0].files[0]) : null;

  const handleTabClick = (view: SidebarView) => {
    onActiveViewChange(activeView === view ? null : view);
  };

  return (
    <aside className={`sidebar-container ${hasSidebarPanel ? "expanded" : "collapsed"}`}>
      {/* 1. Activity Bar */}
      <div className="activity-bar">
        <div className="activity-bar-top">
          <div className="activity-bar-brand" title={t("sidebar.about")} onClick={() => setIsLogoOpen(true)}>
            <img src={logoUrl} alt="OggyBridge" className="activity-logo" />
          </div>

          <button
            className={`activity-tab-btn ${activeView === "explorer" ? "active" : ""}`}
            onClick={() => handleTabClick("explorer")}
            title={t("sidebar.explorerTitle")}
          >
            <Folder size={20} />
          </button>

          <button
            className={`activity-tab-btn ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => handleTabClick("tasks")}
            title={t("sidebar.tasksTitle")}
          >
            <CheckSquare size={20} />
            {workspace && <span className="tab-badge-dot"></span>}
          </button>

          <button
            className={`activity-tab-btn ${editorOpen ? "active" : ""}`}
            onClick={onEditorToggle}
            title={t("sidebar.editorTitle")}
          >
            <Code size={20} />
          </button>

          <button
            className={`activity-tab-btn ${activeView === "agents" ? "active" : ""}`}
            onClick={() => handleTabClick("agents")}
            title={t("sidebar.agentsTitle")}
          >
            <Bot size={20} />
            {panes.length > 0 && (
              <span className="tab-badge-count">{panes.length}</span>
            )}
          </button>

          <button
            className={`activity-tab-btn ${activeView === "activity" ? "active" : ""}`}
            onClick={() => handleTabClick("activity")}
            title={t("sidebar.activityTitle")}
          >
            <Activity size={20} />
            {hasConflict && <span className="tab-badge-warning">!</span>}
          </button>
        </div>

        <div className="activity-bar-bottom">
          <button className="activity-tab-btn" onClick={onToggleCommandPalette} title={t("sidebar.commandPaletteTitle")}>
            <Search size={20} />
          </button>
          <button className="activity-tab-btn" onClick={onToggleSettings} title={t("sidebar.settingsTitle")}>
            <Settings size={20} />
          </button>
          <div className="activity-user-avatar" title={t("sidebar.userSession")}>NC</div>
        </div>
      </div>

      {/* 2. Sidebar Panel */}
      {hasSidebarPanel && (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            <h2>
              {activeView === "explorer" && t("sidebar.explorer")}
              {activeView === "tasks" && t("sidebar.tasks")}
              {activeView === "agents" && t("sidebar.agents")}
              {activeView === "activity" && t("sidebar.activity")}
            </h2>
          </div>

          <div className="sidebar-panel-content">
            {activeView === "explorer" && (
              <>
                <section className="sidebar-section">
                  <div className="sidebar-section-header">
                    <h3 className="sidebar-section-title">{t("sidebar.activeWorkspace")}</h3>
                  </div>
                  {workspace ? (
                    <div className="active-workspace-card">
                      <FolderOpen size={16} className="workspace-card-icon" />
                      <div className="workspace-card-info">
                        <span className="workspace-card-name" title={workspace.path}>
                          {workspace.path.replace(/\\/g, "/").split("/").pop() || workspace.path}
                        </span>
                        <span className="workspace-card-path" title={workspace.path}>
                          {shortPath(workspace.path)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="sidebar-hint">{t("sidebar.noActiveWorkspace")}</p>
                  )}
                </section>

                <section className="sidebar-section">
                  <div className="sidebar-section-header">
                    <h3 className="sidebar-section-title">{t("sidebar.recentWorkspaces")}</h3>
                  </div>
                  <div className="workspace-list">
                    {recentWorkspaces.map((path) => {
                      const isActive = workspace?.path === path;
                      const name = path.replace(/\\/g, "/").split("/").pop() || path;
                      return (
                        <button
                          key={path}
                          className={`workspace-item ${isActive ? "active" : ""}`}
                          onClick={() => onSelectWorkspace(path)}
                          title={path}
                        >
                          <Folder size={14} className="workspace-item-icon" />
                          <span className="workspace-item-name">{name}</span>
                        </button>
                      );
                    })}
                    {recentWorkspaces.length === 0 && (
                      <p className="sidebar-hint">{t("sidebar.noRecentWorkspaces")}</p>
                    )}
                  </div>
                </section>
              </>
            )}

            {activeView === "tasks" && (
              <section className="sidebar-section" style={{ borderBottom: "none" }}>
                {workspace ? (
                  <TasksView tasksMd={workspace.tasksMd} t={t} />
                ) : (
                  <p className="sidebar-hint">{t("sidebar.openWorkspaceForTasks")}</p>
                )}
              </section>
            )}

            {activeView === "agents" && (
              <>
                <section className="sidebar-section">
                  <div className="sidebar-section-header">
                    <h3 className="sidebar-section-title">{t("sidebar.agentLaunchers")}</h3>
                  </div>
                  <div className="agent-list">
                    {agents.map((agent) => {
                      const isRunning = panes.some((p) => p.agentId === agent.id);
                      return (
                        <button
                          key={agent.id}
                          className="agent-btn"
                          onClick={() => onAddPane(agent.id)}
                          title={interpolate(t("sidebar.openAgent"), { agent: agent.label })}
                        >
                          <span className="agent-icon">{AGENT_ICONS[agent.id] ?? "▶"}</span>
                          <span className="agent-label">{agent.label}</span>
                          <span className={`agent-status-badge ${isRunning ? "running" : ""}`}>
                            <span className={`pulse-dot ${isRunning ? "" : "idle"}`}></span>
                            {isRunning ? t("common.running") : t("common.idle")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="sidebar-section" style={{ borderBottom: "none" }}>
                  <div className="sidebar-section-header">
                    <h3 className="sidebar-section-title">{interpolate(t("sidebar.activePanes"), { count: panes.length })}</h3>
                  </div>
                  <div className="pane-list">
                    {panes.length === 0 && <p className="sidebar-hint">{t("sidebar.noOpenPanes")}</p>}
                    {panes.map((pane) => (
                      <div key={pane.id} className="pane-item">
                        <span className="agent-icon">{AGENT_ICONS[pane.agentId] ?? "▶"}</span>
                        <span className="pane-item-label">{pane.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeView === "activity" && (
              <>
                {hasConflict && (
                  <div className="conflict-banner" style={{ margin: "0 16px 16px" }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>{interpolate(t("sidebar.conflictWarning"), { file: conflictFile ?? "" })}</span>
                  </div>
                )}

                <section className="sidebar-section" style={{ borderBottom: "none" }}>
                  <div className="sidebar-section-header">
                    <h3 className="sidebar-section-title">{t("sidebar.liveActivityLog")}</h3>
                  </div>
                  <div className="activity-feed">
                    {hookEvents.length === 0 && (
                      <p className="sidebar-hint">{t("sidebar.noRecentEvents")}</p>
                    )}
                    {hookEvents.slice(0, 20).map((ev, i) => (
                      <div key={`${ev.agentId}-${ev.ts}-${i}`} className="activity-row">
                        <div className="activity-header-row">
                          <span className="activity-event">{ev.event.replace(/_/g, " ")}</span>
                          <span className="activity-time">{fmtTime(ev.ts)}</span>
                        </div>
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
              </>
            )}
          </div>
        </div>
      )}

      {isLogoOpen && (
        <div className="logo-modal-overlay" onClick={() => setIsLogoOpen(false)}>
          <div className="logo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="logo-modal-close" onClick={() => setIsLogoOpen(false)} title={t("common.close")}>
              <X size={16} />
            </button>
            <img src={logoUrl} alt={t("sidebar.logoAlt")} className="logo-modal-image" />
            <h1 className="logo-modal-title">OggyBridge</h1>
            <p className="logo-modal-version">v0.1.0</p>
          </div>
        </div>
      )}
    </aside>
  );
}
