import { X, Sliders, Palette, Terminal, Layout, Bot, Keyboard, Cpu } from "./Icons";
import { AppSettings } from "../App";
import "./SettingsView.css";
import { useState } from "react";

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
  general: Sliders,
  appearance: Palette,
  terminal: Terminal,
  layout: Layout,
  agents: Bot,
  keybindings: Keyboard,
  advanced: Cpu,
};

export default function SettingsView({ isOpen, onClose, settings, onSaveSettings }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  if (!isOpen) return null;

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSaveSettings({
      ...settings,
      [key]: value,
    });
  };

  const toggleAgent = (agentId: string) => {
    const next = settings.enabledAgents.includes(agentId)
      ? settings.enabledAgents.filter((id) => id !== agentId)
      : [...settings.enabledAgents, agentId];
    updateSetting("enabledAgents", next);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Open last workspace on launch</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.startupLastWs}
                  onChange={(e) => updateSetting("startupLastWs", e.target.checked)}
                />
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
              <select
                className="settings-select"
                value={settings.theme}
                onChange={(e) => updateSetting("theme", e.target.value as any)}
              >
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
                    className={`settings-color-dot ${
                      settings.accentColor === color ? "active" : ""
                    }`}
                    style={{
                      backgroundColor:
                        color === "blue"
                          ? "var(--accent-codex)"
                          : color === "green"
                          ? "var(--accent-shell)"
                          : color === "orange"
                          ? "var(--accent-claude)"
                          : color === "purple"
                          ? "var(--accent-copilot)"
                          : "var(--accent-antigravity)",
                    }}
                    onClick={() => updateSetting("accentColor", color)}
                  ></div>
                ))}
              </div>
            </div>
          </>
        );
      case "terminal":
        return (
          <>
            <div className="settings-form-group">
              <label className="settings-label">Font Family</label>
              <select
                className="settings-select"
                value={settings.fontFamily}
                onChange={(e) => updateSetting("fontFamily", e.target.value as any)}
              >
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="system">System Monospace</option>
              </select>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">Font Size</label>
              <select
                className="settings-select"
                value={settings.fontSize.toString()}
                onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}
              >
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
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Enable Claude Code Agent</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.enabledAgents.includes("claude-code")}
                  onChange={() => toggleAgent("claude-code")}
                />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Enable Codex Agent</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.enabledAgents.includes("codex")}
                  onChange={() => toggleAgent("codex")}
                />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Enable GitHub Copilot CLI</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.enabledAgents.includes("copilot")}
                  onChange={() => toggleAgent("copilot")}
                />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Enable Antigravity Agent</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.enabledAgents.includes("antigravity")}
                  onChange={() => toggleAgent("antigravity")}
                />
                <span className="settings-slider"></span>
              </label>
            </div>
          </>
        );
      case "layout":
        return (
          <>
            <div className="settings-form-group">
              <label className="settings-label">Max terminal panes per row</label>
              <select
                className="settings-select"
                value={settings.maxPerRow.toString()}
                onChange={(e) => updateSetting("maxPerRow", parseInt(e.target.value))}
              >
                <option value="1">1 Pane</option>
                <option value="2">2 Panes (Default)</option>
                <option value="3">3 Panes</option>
                <option value="4">4 Panes</option>
                <option value="6">6 Panes</option>
              </select>
              <p className="settings-help-text">
                Controls the grid organization when multiple agent terminals are launched.
              </p>
            </div>
          </>
        );
      case "keybindings":
        return (
          <table className="settings-keybindings-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Shortcut</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Open Command Palette</td>
                <td>
                  <span className="settings-keybindings-kbd">⌘K</span> or{" "}
                  <span className="settings-keybindings-kbd">Ctrl+K</span>
                </td>
              </tr>
              <tr>
                <td>Open Workspace</td>
                <td>
                  <span className="settings-keybindings-kbd">⌘O</span> or{" "}
                  <span className="settings-keybindings-kbd">Ctrl+O</span>
                </td>
              </tr>
              <tr>
                <td>Split Pane Vertically</td>
                <td>
                  <span className="settings-keybindings-kbd">⌘\</span> or{" "}
                  <span className="settings-keybindings-kbd">Ctrl+\</span>
                </td>
              </tr>
              <tr>
                <td>Split Pane Horizontally</td>
                <td>
                  <span className="settings-keybindings-kbd">⌘-</span> or{" "}
                  <span className="settings-keybindings-kbd">Ctrl+-</span>
                </td>
              </tr>
              <tr>
                <td>Close Focused Pane</td>
                <td>
                  <span className="settings-keybindings-kbd">⌘W</span> or{" "}
                  <span className="settings-keybindings-kbd">Ctrl+W</span>
                </td>
              </tr>
            </tbody>
          </table>
        );
      case "advanced":
        return (
          <>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">Enable anonymous crash logs & telemetry</span>
                <p className="settings-help-text">Helps us diagnose bugs and improve OggyBridge desktop experience.</p>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.telemetry}
                  onChange={(e) => updateSetting("telemetry", e.target.checked)}
                />
                <span className="settings-slider"></span>
              </label>
            </div>
          </>
        );
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-container" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">Settings</div>
          {(["general", "appearance", "terminal", "layout", "agents", "keybindings", "advanced"] as Tab[]).map((tab) => {
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

