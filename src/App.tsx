import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen, X, Settings, Bot, Zap, Github, Compass, Terminal, ZoomIn, ZoomOut,
} from "./overview/Icons";
import { AGENTS } from "./agents";
import { useSettings } from "./hooks/useSettings";
import { useWorkspace } from "./hooks/useWorkspace";
import { useUpdater } from "./hooks/useUpdater";
import { useZoom } from "./hooks/useZoom";
import { AgentPane } from "./types";
import { matchesBinding, formatBinding } from "./utils";
import PaneGrid from "./panes/PaneGrid";
import Sidebar from "./overview/Sidebar";
import WorkspaceBar from "./workspace/WorkspaceBar";
import SettingsView from "./overview/SettingsView";
import CommandPalette, { Command } from "./overview/CommandPalette";
import "./styles/App.css";

export default function App() {
  const paneCounter = useRef(0);
  const [panes, setPanes] = useState<AgentPane[]>([
    { id: "pane-0", agentId: "shell", label: "Shell" },
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { settings, saveSettings } = useSettings();
  const { workspace, hookEvents, recentWorkspaces, openWorkspace, closeWorkspace, handleWorkspaceOpened } = useWorkspace();
  const { updateAvailable, updating, applyUpdate, dismissUpdate } = useUpdater();

  const saveZoom = useCallback((level: number) => {
    saveSettings({ ...settings, zoomLevel: level });
  }, [settings, saveSettings]);
  const { zoomIn, zoomOut, zoomReset, showIndicator } = useZoom(settings.zoomLevel, saveZoom);

  const addPane = useCallback((agentId: string) => {
    paneCounter.current += 1;
    const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[AGENTS.length - 1];
    setPanes((prev) => [
      ...prev,
      { id: `pane-${paneCounter.current}`, agentId, label: agent.label },
    ]);
  }, []);

  const removePane = useCallback((id: string) => {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleSelectWorkspaceDialog = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const selected = await openDirDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") openWorkspace(selected);
  }, [openWorkspace]);

  useEffect(() => {
    const kb = settings.keybindings;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesBinding(e, kb.toggleCommandPalette)) { e.preventDefault(); setPaletteOpen((p) => !p); }
      else if (matchesBinding(e, kb.openWorkspace)) { e.preventDefault(); handleSelectWorkspaceDialog(); }
      else if (matchesBinding(e, kb.closeLastPane) && panes.length > 0) { e.preventDefault(); removePane(panes[panes.length - 1].id); }
      else if (matchesBinding(e, kb.zoomIn) || (e.key === "+" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); zoomIn(); }
      else if (matchesBinding(e, kb.zoomOut)) { e.preventDefault(); zoomOut(); }
      else if (matchesBinding(e, kb.zoomReset)) { e.preventDefault(); zoomReset(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panes, settings.keybindings, handleSelectWorkspaceDialog, removePane, zoomIn, zoomOut, zoomReset]);

  const commands: Command[] = useMemo(() => {
    const kb = settings.keybindings;
    return [
      { id: "open-workspace",    label: "Open Workspace",            category: "Workspace", icon: <FolderOpen size={16} />, shortcut: formatBinding(kb.openWorkspace),        action: handleSelectWorkspaceDialog },
      { id: "close-workspace",   label: "Close Current Workspace",   category: "Workspace", icon: <X size={16} />,                                                            action: closeWorkspace },
      { id: "toggle-settings",   label: "Toggle Settings",           category: "General",   icon: <Settings size={16} />,                                                     action: () => setSettingsOpen((p) => !p) },
      { id: "zoom-in",           label: "Zoom In",                   category: "View",      icon: <ZoomIn size={16} />,    shortcut: formatBinding(kb.zoomIn),               action: zoomIn },
      { id: "zoom-out",          label: "Zoom Out",                  category: "View",      icon: <ZoomOut size={16} />,   shortcut: formatBinding(kb.zoomOut),              action: zoomOut },
      { id: "zoom-reset",        label: "Reset Zoom",                category: "View",      icon: <ZoomIn size={16} />,    shortcut: formatBinding(kb.zoomReset),            action: zoomReset },
      { id: "launch-claude",     label: "Launch Claude Code",        category: "Agents",    icon: <Bot size={16} />,                                                          action: () => addPane("claude-code") },
      { id: "launch-codex",      label: "Launch Codex CLI",          category: "Agents",    icon: <Zap size={16} />,                                                          action: () => addPane("codex") },
      { id: "launch-copilot",    label: "Launch GitHub Copilot CLI", category: "Agents",    icon: <Github size={16} />,                                                       action: () => addPane("copilot") },
      { id: "launch-antigravity",label: "Launch Antigravity CLI",    category: "Agents",    icon: <Compass size={16} />,                                                      action: () => addPane("antigravity") },
      { id: "launch-shell",      label: "Launch System Shell",       category: "Agents",    icon: <Terminal size={16} />,                                                     action: () => addPane("shell") },
    ];
  }, [settings.keybindings, handleSelectWorkspaceDialog, closeWorkspace, addPane, zoomIn, zoomOut, zoomReset]);

  const visibleAgents = useMemo(
    () => AGENTS.filter((a) => settings.enabledAgents.includes(a.id)),
    [settings.enabledAgents]
  );

  return (
    <div className="app-root">
      <Sidebar
        agents={visibleAgents}
        onAddPane={addPane}
        panes={panes}
        workspace={workspace}
        hookEvents={hookEvents}
        recentWorkspaces={recentWorkspaces}
        onSelectWorkspace={openWorkspace}
        onToggleSettings={() => setSettingsOpen(true)}
        onToggleCommandPalette={() => setPaletteOpen(true)}
      />
      <main className="main-area">
        {updateAvailable && (
          <div className="update-banner">
            <span className="update-banner-text">
              A new update (version <strong>{updateAvailable.version}</strong>) is available!
            </span>
            <div className="update-banner-actions">
              <button className="update-banner-btn" onClick={applyUpdate} disabled={updating}>
                {updating ? "Updating..." : "Update Now"}
              </button>
              {!updating && (
                <button className="update-banner-close" onClick={dismissUpdate} title="Close">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        <WorkspaceBar
          workspace={workspace}
          onOpen={handleWorkspaceOpened}
          onClose={closeWorkspace}
        />
        <PaneGrid
          panes={panes}
          maxPerRow={settings.maxPerRow}
          workspace={workspace}
          onClose={removePane}
          onAddPane={addPane}
        />
      </main>

      {showIndicator && (
        <div className="zoom-indicator">
          {Math.round(settings.zoomLevel * 100)}%
        </div>
      )}

      <SettingsView
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSaveSettings={saveSettings}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}
