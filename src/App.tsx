import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  FolderOpen,
  X,
  Settings,
  Bot,
  Zap,
  Github,
  Compass,
  Terminal,
} from "./overview/Icons";
import PaneGrid from "./panes/PaneGrid";
import Sidebar from "./overview/Sidebar";
import WorkspaceBar from "./workspace/WorkspaceBar";
import SettingsView from "./overview/SettingsView";
import CommandPalette, { Command } from "./overview/CommandPalette";
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
  mcpPort: number;
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

export interface AppSettings {
  theme: "dark" | "light" | "system";
  accentColor: "blue" | "green" | "orange" | "purple" | "magenta";
  fontSize: number;
  fontFamily: "jetbrains" | "fira" | "system";
  startupLastWs: boolean;
  telemetry: boolean;
  enabledAgents: string[];
  maxPerRow: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accentColor: "blue",
  fontSize: 14,
  fontFamily: "jetbrains",
  startupLastWs: true,
  telemetry: false,
  enabledAgents: ["claude-code", "codex", "copilot", "antigravity", "shell"],
  maxPerRow: 2,
};

const AGENTS = [
  { id: "claude-code", label: "Claude Code", cmd: "claude" },
  { id: "codex",       label: "Codex",       cmd: "codex" },
  { id: "copilot",     label: "Copilot CLI", cmd: "gh" },
  { id: "antigravity", label: "Antigravity CLI", cmd: "agy" },
  { id: "shell",       label: "Shell",       cmd: "" },
] as const;

let paneCounter = 0;

export default function App() {
  const [panes, setPanes] = useState<AgentPane[]>([
    { id: "pane-0", agentId: "shell", label: "Shell" },
  ]);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let active = true;

    async function checkForUpdates() {
      try {
        const update = await check();
        if (update && active) {
          setUpdateAvailable(update);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }

    const timer = setTimeout(checkForUpdates, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const handleApplyUpdate = async () => {
    if (!updateAvailable) return;
    setUpdating(true);
    try {
      await updateAvailable.downloadAndInstall();
      await relaunch();
    } catch (err) {
      alert(`Update failed: ${err}`);
      setUpdating(false);
    }
  };

  const applySettings = useCallback((cfg: AppSettings) => {
    // 1. Accent color
    const colorMap = {
      blue: "#58a6ff",
      green: "#3fb950",
      orange: "#ff7b72",
      purple: "#bc8cff",
      magenta: "#ff5e97",
    };
    const colorVal = colorMap[cfg.accentColor] || colorMap.blue;
    document.documentElement.style.setProperty("--accent-primary", colorVal);

    // 2. Theme
    document.documentElement.setAttribute("data-theme", cfg.theme);
    
    // 3. Font Size & Family
    document.documentElement.style.setProperty("--terminal-font-size", `${cfg.fontSize}px`);
    const fontFamilies = {
      jetbrains: '"JetBrains Mono", "Fira Code", monospace',
      fira: '"Fira Code", monospace',
      system: "monospace",
    };
    document.documentElement.style.setProperty("--terminal-font-family", fontFamilies[cfg.fontFamily]);
  }, []);

  const saveSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    applySettings(newSettings);
    if (!("__TAURI_INTERNALS__" in window)) return;
    invoke("write_settings", { settings: JSON.stringify(newSettings) })
      .catch((e) => console.error("Failed to write settings:", e));
  }, [applySettings]);

  // Load settings on mount
  useEffect(() => {
    applySettings(DEFAULT_SETTINGS);

    if (!("__TAURI_INTERNALS__" in window)) return;
    invoke<string>("read_settings")
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          const loadedSettings = { ...DEFAULT_SETTINGS, ...parsed };
          setSettings(loadedSettings);
          applySettings(loadedSettings);
        } catch {
          // Ignore
        }
      })
      .catch((e) => console.error("Failed to read settings:", e));
  }, [applySettings]);

  // Load recent workspaces from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("recentWorkspaces");
      if (stored) {
        setRecentWorkspaces(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }
  }, []);

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
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Listen for hook events from the bridge
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<HookEvent>("hook-event", (e) => {
      setHookEvents((prev) => [e.payload, ...prev].slice(0, 50));
    });
    return () => {
      unlisten.then((f) => f());
    };
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

  const handleOpenWorkspace = useCallback(async (path: string) => {
    try {
      const info = await invoke<WorkspaceInfo>("open_workspace", { path });
      setWorkspace(info);
      
      // Update recent workspaces
      setRecentWorkspaces((prev) => {
        const next = [path, ...prev.filter((p) => p !== path)].slice(0, 5);
        localStorage.setItem("recentWorkspaces", JSON.stringify(next));
        return next;
      });
    } catch (e) {
      alert(`Failed to open workspace: ${e}`);
    }
  }, []);

  const handleSelectWorkspaceDialog = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const selected = await openDirDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      handleOpenWorkspace(selected);
    }
  }, [handleOpenWorkspace]);

  const handleCloseWorkspace = useCallback(async () => {
    await invoke("close_workspace").catch(() => {});
    setWorkspace(null);
  }, []);

  // Bind hotkeys (⌘K/Ctrl+K, ⌘O/Ctrl+O, ⌘W/Ctrl+W)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key === "o") {
        e.preventDefault();
        handleSelectWorkspaceDialog();
      } else if (isCmdOrCtrl && e.key === "w" && panes.length > 0) {
        e.preventDefault();
        // Remove the last pane
        removePane(panes[panes.length - 1].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panes, handleSelectWorkspaceDialog, removePane]);

  const commands: Command[] = [
    {
      id: "open-workspace",
      label: "Open Workspace",
      category: "Workspace",
      icon: <FolderOpen size={16} />,
      shortcut: "⌘O",
      action: handleSelectWorkspaceDialog,
    },
    {
      id: "close-workspace",
      label: "Close Current Workspace",
      category: "Workspace",
      icon: <X size={16} />,
      action: handleCloseWorkspace,
    },
    {
      id: "toggle-settings",
      label: "Toggle Settings",
      category: "General",
      icon: <Settings size={16} />,
      action: () => setSettingsOpen((prev) => !prev),
    },
    {
      id: "launch-claude",
      label: "Launch Claude Code",
      category: "Agents",
      icon: <Bot size={16} />,
      action: () => addPane("claude-code"),
    },
    {
      id: "launch-codex",
      label: "Launch Codex CLI",
      category: "Agents",
      icon: <Zap size={16} />,
      action: () => addPane("codex"),
    },
    {
      id: "launch-copilot",
      label: "Launch GitHub Copilot CLI",
      category: "Agents",
      icon: <Github size={16} />,
      action: () => addPane("copilot"),
    },
    {
      id: "launch-antigravity",
      label: "Launch Antigravity CLI",
      category: "Agents",
      icon: <Compass size={16} />,
      action: () => addPane("antigravity"),
    },
    {
      id: "launch-shell",
      label: "Launch System Shell",
      category: "Agents",
      icon: <Terminal size={16} />,
      action: () => addPane("shell"),
    },
  ];

  // Filter agents based on settings enabled status
  const visibleAgents = AGENTS.filter((a) => settings.enabledAgents.includes(a.id));

  return (
    <div className="app-root">
      <Sidebar
        agents={visibleAgents}
        onAddPane={addPane}
        panes={panes}
        workspace={workspace}
        hookEvents={hookEvents}
        recentWorkspaces={recentWorkspaces}
        onSelectWorkspace={handleOpenWorkspace}
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
              <button className="update-banner-btn" onClick={handleApplyUpdate} disabled={updating}>
                {updating ? "Updating..." : "Update Now"}
              </button>
              {!updating && (
                <button className="update-banner-close" onClick={() => setUpdateAvailable(null)} title="Close">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        <WorkspaceBar
          workspace={workspace}
          onOpen={(info) => {
            setWorkspace(info);
            // Append workspace to recent
            setRecentWorkspaces((prev) => {
              const next = [info.path, ...prev.filter((p) => p !== info.path)].slice(0, 5);
              localStorage.setItem("recentWorkspaces", JSON.stringify(next));
              return next;
            });
          }}
          onClose={handleCloseWorkspace}
        />
        <PaneGrid
          panes={panes}
          maxPerRow={settings.maxPerRow}
          workspace={workspace}
          onClose={removePane}
          onAddPane={addPane}
        />
      </main>

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

export { AGENTS };
