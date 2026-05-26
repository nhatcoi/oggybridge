import { X, Sliders, Palette, Terminal, Layout, Bot, Keyboard, Cpu } from "./Icons";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, ActionId, ACTION_LABELS, DEFAULT_KEYBINDINGS, Keybinding } from "../types";
import { clampZoom, ZOOM_STEP, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX } from "../hooks/useZoom";
import { formatBinding } from "../utils";
import { LOCALE_OPTIONS, Translator, actionLabelKey, interpolate } from "../i18n";
import "../styles/SettingsView.css";
import { useState, useEffect, useCallback } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  t: Translator;
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
type ConfigPaths = [configDir: string, settingsPath: string, sessionPath: string];

const TAB_LABEL_KEYS: Record<Tab, Parameters<Translator>[0]> = {
  general:     "settings.tab.general",
  appearance:  "settings.tab.appearance",
  terminal:    "settings.tab.terminal",
  layout:      "settings.tab.layout",
  agents:      "settings.tab.agents",
  keybindings: "settings.tab.keybindings",
  advanced:    "settings.tab.advanced",
};

const AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex:         "Codex",
  copilot:       "GitHub Copilot CLI",
  antigravity:   "Antigravity",
};

export default function SettingsView({ isOpen, onClose, settings, onSaveSettings, t }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [recordingAction, setRecordingAction] = useState<ActionId | null>(null);
  const [configPaths, setConfigPaths] = useState<ConfigPaths | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen || activeTab !== "advanced") return;
    if (!("__TAURI_INTERNALS__" in window)) {
      setConfigError(t("settings.advanced.configUnavailable"));
      return;
    }

    invoke<ConfigPaths>("get_config_paths")
      .then((paths) => {
        setConfigPaths(paths);
        setConfigError(null);
      })
      .catch((e) => setConfigError(String(e)));
  }, [activeTab, isOpen, t]);

  const openManualConfig = (command: "open_settings_file" | "open_session_file" | "open_config_dir") => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setConfigError(t("settings.advanced.configUnavailable"));
      return;
    }
    invoke(command).catch((e) => setConfigError(String(e)));
  };

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t("settings.general.openLastWorkspace")}</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.startupLastWs} onChange={(e) => updateSetting("startupLastWs", e.target.checked)} />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">{t("settings.general.savePaneSessions")}</span>
                <p className="settings-help-text">{t("settings.general.savePaneSessionsHelp")}</p>
              </div>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.savePaneSessions} onChange={(e) => updateSetting("savePaneSessions", e.target.checked)} />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">{t("locale.label")}</label>
              <select className="settings-select" value={settings.locale} onChange={(e) => updateSetting("locale", e.target.value as AppSettings["locale"])}>
                {LOCALE_OPTIONS.map((locale) => (
                  <option key={locale.value} value={locale.value}>{locale.label}</option>
                ))}
              </select>
              <p className="settings-help-text">{t("locale.help")}</p>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t("settings.general.startMinimized")}</span>
              <label className="settings-toggle">
                <input type="checkbox" />
                <span className="settings-slider"></span>
              </label>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t("settings.general.confirmClose")}</span>
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
              <label className="settings-label">{t("settings.appearance.theme")}</label>
              <select className="settings-select" value={settings.theme} onChange={(e) => updateSetting("theme", e.target.value as AppSettings["theme"])}>
                <option value="dark">{t("settings.appearance.theme.dark")}</option>
                <option value="light">{t("settings.appearance.theme.light")}</option>
                <option value="system">{t("settings.appearance.theme.system")}</option>
              </select>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">{t("settings.appearance.accentColor")}</label>
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
              <label className="settings-label">{t("settings.appearance.zoomLevel")}</label>
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
                  <button className="settings-zoom-reset" onClick={() => updateSetting("zoomLevel", ZOOM_DEFAULT)}>{t("common.reset")}</button>
                )}
              </div>
              <p className="settings-help-text">{t("settings.appearance.zoomHelp")}</p>
            </div>
          </>
        );
      case "terminal":
        return (
          <>
            <div className="settings-form-group">
              <label className="settings-label">{t("settings.terminal.fontFamily")}</label>
              <select className="settings-select" value={settings.fontFamily} onChange={(e) => updateSetting("fontFamily", e.target.value as AppSettings["fontFamily"])}>
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="system">System Monospace</option>
              </select>
            </div>
            <div className="settings-form-group">
              <label className="settings-label">{t("settings.terminal.fontSize")}</label>
              <select className="settings-select" value={settings.fontSize.toString()} onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}>
                <option value="12">12px</option>
                <option value="13">13px</option>
                <option value="14">14px</option>
                <option value="16">16px</option>
              </select>
            </div>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t("settings.terminal.cursorBlinking")}</span>
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
                <span className="settings-toggle-label">
                  {interpolate(t("settings.agents.enable"), { agent: AGENT_NAMES[id] })}
                </span>
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
            <label className="settings-label">{t("settings.layout.maxPanes")}</label>
            <select className="settings-select" value={settings.maxPerRow.toString()} onChange={(e) => updateSetting("maxPerRow", parseInt(e.target.value))}>
              <option value="1">{t("settings.layout.onePane")}</option>
              <option value="2">{t("settings.layout.twoPanes")}</option>
              <option value="3">{t("settings.layout.threePanes")}</option>
              <option value="4">{t("settings.layout.fourPanes")}</option>
              <option value="6">{t("settings.layout.sixPanes")}</option>
            </select>
            <p className="settings-help-text">{t("settings.layout.help")}</p>
          </div>
        );
      case "keybindings":
        return (
          <div className="settings-keybindings-list">
            <p className="settings-help-text" style={{ marginBottom: 16 }}>
              {t("settings.keybindings.help")}
            </p>
            {ACTION_IDS.map((action) => {
              const binding = settings.keybindings[action];
              const isDefault = JSON.stringify(binding) === JSON.stringify(DEFAULT_KEYBINDINGS[action]);
              const isRecording = recordingAction === action;
              return (
                <div key={action} className="settings-kb-row">
                  <span className="settings-kb-label">{t(actionLabelKey(action))}</span>
                  <div className="settings-kb-controls">
                    <button
                      className={`settings-kb-shortcut ${isRecording ? "recording" : ""}`}
                      onClick={() => setRecordingAction(isRecording ? null : action)}
                      title={isRecording ? t("settings.keybindings.recordTitle") : t("settings.keybindings.changeTitle")}
                    >
                      {isRecording ? t("settings.keybindings.pressShortcut") : formatBinding(binding)}
                    </button>
                    {!isDefault && (
                      <button className="settings-kb-reset" onClick={() => resetBinding(action)} title={t("settings.keybindings.resetTitle")}>
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
          <>
            <div className="settings-form-group">
              <label className="settings-label">{t("settings.advanced.manualConfig")}</label>
              <p className="settings-help-text">{t("settings.advanced.manualConfigHelp")}</p>
              {configPaths && (
                <div className="settings-config-paths">
                  <div className="settings-config-path-row">
                    <span className="settings-config-path-label">{t("settings.advanced.settingsPath")}</span>
                    <code className="settings-config-path-value">{configPaths[1]}</code>
                  </div>
                  <div className="settings-config-path-row">
                    <span className="settings-config-path-label">{t("settings.advanced.sessionPath")}</span>
                    <code className="settings-config-path-value">{configPaths[2]}</code>
                  </div>
                  <div className="settings-config-path-row">
                    <span className="settings-config-path-label">{t("settings.advanced.configFolder")}</span>
                    <code className="settings-config-path-value">{configPaths[0]}</code>
                  </div>
                </div>
              )}
              {configError && <p className="settings-help-text">{configError}</p>}
              <div className="settings-action-row">
                <button className="settings-action-btn" onClick={() => openManualConfig("open_settings_file")} disabled={!configPaths}>
                  {t("settings.advanced.openSettingsFile")}
                </button>
                <button className="settings-action-btn" onClick={() => openManualConfig("open_session_file")} disabled={!configPaths}>
                  {t("settings.advanced.openSessionFile")}
                </button>
                <button className="settings-action-btn" onClick={() => openManualConfig("open_config_dir")} disabled={!configPaths}>
                  {t("settings.advanced.openConfigFolder")}
                </button>
              </div>
            </div>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">{t("settings.advanced.telemetry")}</span>
                <p className="settings-help-text">{t("settings.advanced.telemetryHelp")}</p>
              </div>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.telemetry} onChange={(e) => updateSetting("telemetry", e.target.checked)} />
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
          <div className="settings-sidebar-header">{t("settings.title")}</div>
          {ALL_TABS.map((tab) => {
            const Icon = tabIcons[tab];
            return (
              <button
                key={tab}
                className={`settings-tab-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <Icon size={14} className="settings-tab-icon" />
                <span>{t(TAB_LABEL_KEYS[tab])}</span>
              </button>
            );
          })}
        </div>
        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{t(TAB_LABEL_KEYS[activeTab])}</h3>
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
