import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { open as openDirDialog, ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FolderOpen, X, Settings, Bot, Zap, Github, Compass, Terminal, ZoomIn, ZoomOut,
} from "./overview/Icons";
import { AGENTS } from "./agents";
import { useSettings } from "./hooks/useSettings";
import { useWorkspace } from "./hooks/useWorkspace";
import { useUpdater } from "./hooks/useUpdater";
import { useZoom } from "./hooks/useZoom";
import { AgentPane } from "./types";
import { actionLabelKey, createTranslator, interpolate } from "./i18n";
import {
  StoredPaneSession,
  getLastWorkspacePath,
  getStoredPaneSession,
  writeLastWorkspacePath,
  writeStoredPaneSession,
} from "./sessionStorage";
import { matchesBinding, formatBinding } from "./utils";
import PaneGrid from "./panes/PaneGrid";
import Sidebar from "./overview/Sidebar";
import WorkspaceBar from "./workspace/WorkspaceBar";
import SettingsView from "./overview/SettingsView";
import CommandPalette, { Command } from "./overview/CommandPalette";
import "./styles/App.css";

function makeDefaultPanes(): AgentPane[] {
  return [{ id: "pane-0", paneId: crypto.randomUUID(), agentId: "shell", label: "Shell" }];
}

function createPane(agentId: string, index: number): AgentPane {
  const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[AGENTS.length - 1];
  return { id: `pane-${index}`, paneId: crypto.randomUUID(), agentId: agent.id, label: agent.label };
}

export default function App() {
  const paneCounter = useRef(0);
  const [panes, setPanes] = useState<AgentPane[]>(makeDefaultPanes);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { settings, saveSettings, ready: settingsReady } = useSettings();
  const t = useMemo(() => createTranslator(settings.locale), [settings.locale]);
  const { workspace, hookEvents, recentWorkspaces, sessionReady, openWorkspace, closeWorkspace, handleWorkspaceOpened } = useWorkspace();
  const { updateAvailable, updating, applyUpdate, dismissUpdate } = useUpdater();
  const didRestoreWorkspace = useRef(false);
  const restoredPaneWorkspace = useRef<string | null>(null);
  const skipNextPaneSessionSave = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const tRef = useRef(t);
  tRef.current = t;

  const saveZoom = useCallback((level: number) => {
    saveSettings({ ...settings, zoomLevel: level });
  }, [settings, saveSettings]);
  const { zoomIn, zoomOut, zoomReset, showIndicator } = useZoom(settings.zoomLevel, saveZoom);

  const addPane = useCallback((agentId: string) => {
    paneCounter.current += 1;
    setPanes((prev) => [
      ...prev,
      createPane(agentId, paneCounter.current),
    ]);
  }, []);

  const removePane = useCallback((id: string) => {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePaneSessionId = useCallback((paneId: string, sessionId: string) => {
    setPanes((prev) => prev.map((pane) => (
      pane.id === paneId && pane.sessionId !== sessionId
        ? { ...pane, sessionId }
        : pane
    )));
  }, []);

  const handleSelectWorkspaceDialog = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const selected = await openDirDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") openWorkspace(selected);
  }, [openWorkspace]);

  const restorePanes = useCallback((storedPanes: StoredPaneSession | null) => {
    const nextPanes = storedPanes && storedPanes.length > 0
      ? storedPanes.map((pane, index) => ({
          id: `pane-${index}`,
          paneId: pane.paneId,
          agentId: pane.agentId,
          label: pane.label,
        }))
      : makeDefaultPanes();

    paneCounter.current = Math.max(0, nextPanes.length - 1);
    setPanes(nextPanes);
  }, []);

  useEffect(() => {
    if (didRestoreWorkspace.current) return;
    if (!("__TAURI_INTERNALS__" in window)) return;
    if (!settingsReady || !sessionReady || !settings.startupLastWs || workspace) return;

    let cancelled = false;
    getLastWorkspacePath().then((storedWorkspace) => {
      if (cancelled) return;
      const lastWorkspace = storedWorkspace ?? recentWorkspaces[0];
      if (!lastWorkspace) return;

      didRestoreWorkspace.current = true;
      void openWorkspace(lastWorkspace);
    });

    return () => { cancelled = true; };
  }, [settingsReady, sessionReady, settings.startupLastWs, workspace, recentWorkspaces, openWorkspace]);

  useEffect(() => {
    if (!workspace) return;
    writeLastWorkspacePath(workspace.path).catch(() => {});
  }, [workspace]);

  useEffect(() => {
    if (workspace) return;
    restoredPaneWorkspace.current = null;
    skipNextPaneSessionSave.current = null;
  }, [workspace]);

  useEffect(() => {
    if (!workspace || settings.savePaneSessions) return;
    restoredPaneWorkspace.current = workspace.path;
    skipNextPaneSessionSave.current = null;
  }, [settings.savePaneSessions, workspace]);

  useEffect(() => {
    if (!settingsReady || !settings.savePaneSessions || !workspace) return;
    if (restoredPaneWorkspace.current === workspace.path) return;

    let cancelled = false;
    restoredPaneWorkspace.current = workspace.path;
    skipNextPaneSessionSave.current = workspace.path;
    getStoredPaneSession(workspace.path).then((storedPanes) => {
      if (cancelled) return;
      restorePanes(storedPanes);
    });

    return () => { cancelled = true; };
  }, [settingsReady, settings.savePaneSessions, workspace, restorePanes]);

  useEffect(() => {
    if (!settingsReady || !settings.savePaneSessions || !workspace) return;
    if (skipNextPaneSessionSave.current === workspace.path) {
      skipNextPaneSessionSave.current = null;
      return;
    }

    const paneSessions = panes.map(({ paneId, agentId, label }) => ({ paneId, agentId, label }));
    writeStoredPaneSession(workspace.path, paneSessions).catch(() => {});
  }, [settingsReady, settings.savePaneSessions, workspace, panes]);

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

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const appWindow = getCurrentWindow();
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      const s = settingsRef.current;
      const p = panesRef.current;
      if (s.startMinimizedToTray) return;
      if (s.confirmCloseMultiplePanes && p.length > 1) {
        event.preventDefault();
        const confirmed = await ask(
          interpolate(tRef.current("dialog.confirmClose.message"), { count: p.length }),
          { title: tRef.current("dialog.confirmClose.title"), kind: "warning" }
        );
        if (confirmed) await appWindow.destroy();
      }
    });
    return () => { unlistenPromise.then((f) => f()); };
  }, []);

  const commands: Command[] = useMemo(() => {
    const kb = settings.keybindings;
    return [
      { id: "open-workspace",     label: t("command.openWorkspace"),       category: t("command.category.workspace"), icon: <FolderOpen size={16} />, shortcut: formatBinding(kb.openWorkspace), action: handleSelectWorkspaceDialog },
      { id: "close-workspace",    label: t("command.closeWorkspace"),      category: t("command.category.workspace"), icon: <X size={16} />, action: closeWorkspace },
      { id: "toggle-settings",    label: t("command.toggleSettings"),      category: t("command.category.general"),   icon: <Settings size={16} />, action: () => setSettingsOpen((p) => !p) },
      { id: "zoom-in",            label: t(actionLabelKey("zoomIn")),      category: t("command.category.view"),      icon: <ZoomIn size={16} />, shortcut: formatBinding(kb.zoomIn), action: zoomIn },
      { id: "zoom-out",           label: t(actionLabelKey("zoomOut")),     category: t("command.category.view"),      icon: <ZoomOut size={16} />, shortcut: formatBinding(kb.zoomOut), action: zoomOut },
      { id: "zoom-reset",         label: t(actionLabelKey("zoomReset")),   category: t("command.category.view"),      icon: <ZoomIn size={16} />, shortcut: formatBinding(kb.zoomReset), action: zoomReset },
      { id: "launch-claude",      label: t("command.launchClaude"),        category: t("command.category.agents"),    icon: <Bot size={16} />, action: () => addPane("claude-code") },
      { id: "launch-codex",       label: t("command.launchCodex"),         category: t("command.category.agents"),    icon: <Zap size={16} />, action: () => addPane("codex") },
      { id: "launch-copilot",     label: t("command.launchCopilot"),       category: t("command.category.agents"),    icon: <Github size={16} />, action: () => addPane("copilot") },
      { id: "launch-antigravity", label: t("command.launchAntigravity"),   category: t("command.category.agents"),    icon: <Compass size={16} />, action: () => addPane("antigravity") },
      { id: "launch-shell",       label: t("command.launchShell"),         category: t("command.category.agents"),    icon: <Terminal size={16} />, action: () => addPane("shell") },
    ];
  }, [settings.keybindings, handleSelectWorkspaceDialog, closeWorkspace, addPane, zoomIn, zoomOut, zoomReset, t]);

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
        t={t}
      />
      <main className="main-area">
        {updateAvailable && (
          <div className="update-banner">
            <span className="update-banner-text">
              {interpolate(t("update.available"), { version: updateAvailable.version })}
            </span>
            <div className="update-banner-actions">
              <button className="update-banner-btn" onClick={applyUpdate} disabled={updating}>
                {updating ? t("update.updating") : t("update.now")}
              </button>
              {!updating && (
                <button className="update-banner-close" onClick={dismissUpdate} title={t("common.close")}>
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
          t={t}
        />
        <PaneGrid
          panes={panes}
          maxPerRow={settings.maxPerRow}
          workspace={workspace}
          onClose={removePane}
          onAddPane={addPane}
          onPaneSessionId={updatePaneSessionId}
          t={t}
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
        t={t}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        t={t}
      />
    </div>
  );
}
