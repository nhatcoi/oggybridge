import { X, Sliders, Palette, Terminal, Layout, Bot, Keyboard, Cpu } from "./Icons";
import { AppSettings, ActionId, ACTION_LABELS, DEFAULT_KEYBINDINGS, Keybinding } from "../types";
import { clampZoom, ZOOM_STEP, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX } from "../hooks/useZoom";
import { formatBinding } from "../utils";
import "../styles/SettingsView.css";
import { useState, useEffect, useCallback } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

type Tab =
  | "general"
  | "appearance"
  | "terminal"
  | "layout"
  | "agents"
  | "keybindings"
  | "advanced";

const tabIcons: Record<Tab, React.ComponentType<{ size?: number | string; className?: string }>> = {
  general:     Sliders,
  appearance:  Palette,
  terminal:    Terminal,
  layout:      Layout,
  agents:      Bot,
  keybindings: Keyboard,
  advanced:    Cpu,
};

const ALL_TABS: Tab[] = ["general", "appearance", "terminal", "layout", "agents", "keybindings", "advanced"];
const ACTION_IDS = Object.keys(ACTION_LABELS) as ActionId[];

export default function SettingsView({ isOpen, onClose, settings, onSaveSettings }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [recordingAction, setRecordingAction] = useState<ActionId | null>(null);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSaveSettings({ ...settings, [key]: value });
  };

  const toggleAgent = (agentId: string) => {
    const next = settings.enabledAgents.includes(agentId)
      ? settings.enabledAgents.filter((id) => id !== agentId)
      : [...settings.enabledAgents, agentId];
    updateSetting("enabledAgents", next);
  };

  const saveBinding = useCallback((action: ActionId, binding: Keybinding) => {
    onSaveSettings({
      ...settings,
      keybindings: { ...settings.keybindings, [action]: binding },
    });
  }, [settings, onSaveSettings]);

  const resetBinding = (action: ActionId) => {
    saveBinding(action, DEFAULT_KEYBINDINGS[action]);
  };

  // Capture keydown when recording
  useEffect(() => {
    if (!recordingAction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecordingAction(null); return; }
      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
      saveBinding(recordingAction, {
        key:   e.key,
        mod:   e.metaKey || e.ctrlKey,
        shift: e.shiftKey || undefined,
        alt:   e.altKey || undefined,
      });
      setRecordingAction(null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingAction, saveBinding]);

  // Cancel recording when switching tabs or closing
  useEffect(() => { setRecordingAction(null); }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Open last workspace on launch</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.startupLastWs} onChange={(e) => updateSetting("startupLastWs", e.target.checked)} />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Start minimized in system tray</span>
              <label className="settings-toggle">
                <input type="checkbox" />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Confirm before closing multiple panes</span>
              <label className="settings-toggle">
                <input type="checkbox" defaultChecked />
                <span className="settings-slider"></span>
              </label>
            </div>
          </>
        );
      case "appearance":
        return (
          <>
            <div className="settings-form-group">
              <label className="settings-label">Theme</label>
              <select className="settings-select" value={settings.theme} onChange={(e) => updateSetting("theme", e.target.value as AppSettings["theme"])}>
                <option value="dark">Dark (Deep Carbon)</option>
                <option value="light">Light</option>
                <option value="system">System Default</option>
              </select>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">Accent Color</label>
              <div className="settings-color-palette">
                {(["blue", "green", "orange", "purple", "magenta"] as const).map((color) => (
                  <div
                    key={color}
                    className={`settings-color-dot ${settings.accentColor === color ? "active" : ""}`}
                    style={{
                      backgroundColor:
                        color === "blue" ? "var(--accent-codex)" :
                        color === "green" ? "var(--accent-shell)" :
                        color === "orange" ? "var(--accent-claude)" :
                        color === "purple" ? "var(--accent-copilot)" :
                        "var(--accent-antigravity)",
                    }}
                    onClick={() => updateSetting("accentColor", color)}
                  />
                ))}
              </div>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">Zoom Level</label>
              <div className="settings-zoom-row">
                <button
                  className="settings-zoom-btn"
                  onClick={() => updateSetting("zoomLevel", clampZoom(settings.zoomLevel - ZOOM_STEP))}
                  disabled={settings.zoomLevel <= ZOOM_MIN}
                >−</button>
                <span className="settings-zoom-value">{Math.round(settings.zoomLevel * 100)}%</span>
                <button
                  className="settings-zoom-btn"
                  onClick={() => updateSetting("zoomLevel", clampZoom(settings.zoomLevel + ZOOM_STEP))}
                  disabled={settings.zoomLevel >= ZOOM_MAX}
                >+</button>
                {settings.zoomLevel !== ZOOM_DEFAULT && (
                  <button className="settings-zoom-reset" onClick={() => updateSetting("zoomLevel", ZOOM_DEFAULT)}>Reset</button>
                )}
              </div>
              <p className="settings-help-text">Scales the entire application window. Range: {ZOOM_MIN * 100}%–{ZOOM_MAX * 100}%. Shortcut: ⌘+ / ⌘−</p>
            </div>
          </>
        );
      case "terminal":
        return (
          <>
            <div className="settings-form-group">
              <label className="settings-label">Font Family</label>
              <select className="settings-select" value={settings.fontFamily} onChange={(e) => updateSetting("fontFamily", e.target.value as AppSettings["fontFamily"])}>
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="system">System Monospace</option>
              </select>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">Font Size</label>
              <select className="settings-select" value={settings.fontSize.toString()} onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}>
                <option value="12">12px</option>
                <option value="13">13px</option>
                <option value="14">14px</option>
                <option value="16">16px</option>
              </select>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Terminal Cursor Blinking</span>
              <label className="settings-toggle">
                <input type="checkbox" defaultChecked />
                <span className="settings-slider"></span>
              </label>
            </div>
          </>
        );
      case "agents":
        return (
          <>
            {(["claude-code", "codex", "copilot", "antigravity"] as const).map((id) => (
              <div key={id} className="settings-toggle-row">
                <span className="settings-toggle-label">Enable {id === "claude-code" ? "Claude Code" : id === "codex" ? "Codex" : id === "copilot" ? "GitHub Copilot CLI" : "Antigravity"} Agent</span>
                <label className="settings-toggle">
                  <input type="checkbox" checked={settings.enabledAgents.includes(id)} onChange={() => toggleAgent(id)} />
                  <span className="settings-slider"></span>
                </label>
              </div>
            ))}
          </>
        );
      case "layout":
        return (
          <div className="settings-form-group">
            <label className="settings-label">Max terminal panes per row</label>
            <select className="settings-select" value={settings.maxPerRow.toString()} onChange={(e) => updateSetting("maxPerRow", parseInt(e.target.value))}>
              <option value="1">1 Pane</option>
              <option value="2">2 Panes (Default)</option>
              <option value="3">3 Panes</option>
              <option value="4">4 Panes</option>
              <option value="6">6 Panes</option>
            </select>
            <p className="settings-help-text">Controls the grid organization when multiple agent terminals are launched.</p>
          </div>
        );
      case "keybindings":
        return (
          <div className="settings-keybindings-list">
            <p className="settings-help-text" style={{ marginBottom: 16 }}>
              Click a shortcut to record a new one. Press <kbd className="settings-keybindings-kbd">Esc</kbd> to cancel.
            </p>
            {ACTION_IDS.map((action) => {
              const binding = settings.keybindings[action];
              const isDefault = JSON.stringify(binding) === JSON.stringify(DEFAULT_KEYBINDINGS[action]);
              const isRecording = recordingAction === action;
              return (
                <div key={action} className="settings-kb-row">
                  <span className="settings-kb-label">{ACTION_LABELS[action]}</span>
                  <div className="settings-kb-controls">
                    <button
                      className={`settings-kb-shortcut ${isRecording ? "recording" : ""}`}
                      onClick={() => setRecordingAction(isRecording ? null : action)}
                      title={isRecording ? "Press a key combo (Esc to cancel)" : "Click to change"}
                    >
                      {isRecording ? "Press shortcut…" : formatBinding(binding)}
                    </button>
                    {!isDefault && (
                      <button className="settings-kb-reset" onClick={() => resetBinding(action)} title="Reset to default">
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      case "advanced":
        return (
          <div className="settings-toggle-row">
            <div>
              <span className="settings-toggle-label">Enable anonymous crash logs & telemetry</span>
              <p className="settings-help-text">Helps us diagnose bugs and improve OggyBridge desktop experience.</p>
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={settings.telemetry} onChange={(e) => updateSetting("telemetry", e.target.checked)} />
              <span className="settings-slider"></span>
            </label>
          </div>
        );
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-container" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">Settings</div>
          {ALL_TABS.map((tab) => {
            const Icon = tabIcons[tab];
            return (
              <button
                key={tab}
                className={`settings-tab-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <Icon size={14} className="settings-tab-icon" />
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </button>
            );
          })}
        </div>
        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
            <button className="settings-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
