export interface AgentPane {
  id: string;       // runtime DOM key, e.g. "pane-0"
  paneId: string;   // stable UUID, persisted to session.json
  agentId: string;
  label: string;
  sessionId?: string;
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

export interface FileChangedPayload {
  kind: string;
  content: string;
  path: string;
}

export type ActionId =
  | "toggleCommandPalette"
  | "openWorkspace"
  | "closeLastPane"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset";

export interface Keybinding {
  key: string;
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type Keybindings = Record<ActionId, Keybinding>;

export const ACTION_LABELS: Record<ActionId, string> = {
  toggleCommandPalette: "Open Command Palette",
  openWorkspace:        "Open Workspace",
  closeLastPane:        "Close Last Pane",
  zoomIn:               "Zoom In",
  zoomOut:              "Zoom Out",
  zoomReset:            "Reset Zoom",
};

export const DEFAULT_KEYBINDINGS: Keybindings = {
  toggleCommandPalette: { mod: true, key: "k" },
  openWorkspace:        { mod: true, key: "o" },
  closeLastPane:        { mod: true, key: "w" },
  zoomIn:               { mod: true, key: "=" },
  zoomOut:              { mod: true, key: "-" },
  zoomReset:            { mod: true, key: "0" },
};

export interface AgentConfig {
  extraArgs: string;
}

export interface CustomAgentDef {
  id: string;
  label: string;
  cmd: string;
  extraArgs: string;
}

export interface AppSettings {
  locale: "en" | "vi";
  theme: "dark" | "light" | "system";
  accentColor: "blue" | "green" | "orange" | "purple" | "magenta";
  fontSize: number;
  fontFamily: "jetbrains" | "fira" | "system";
  startupLastWs: boolean;
  savePaneSessions: boolean;
  startMinimizedToTray: boolean;
  confirmCloseMultiplePanes: boolean;
  telemetry: boolean;
  enabledAgents: string[];
  maxPerRow: number;
  zoomLevel: number;
  keybindings: Keybindings;
  agentConfigs: Record<string, AgentConfig>;
  customAgents: CustomAgentDef[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: "en",
  theme: "dark",
  accentColor: "blue",
  fontSize: 14,
  fontFamily: "jetbrains",
  startupLastWs: true,
  savePaneSessions: true,
  startMinimizedToTray: false,
  confirmCloseMultiplePanes: true,
  telemetry: false,
  enabledAgents: ["claude-code", "codex", "copilot", "antigravity", "shell"],
  maxPerRow: 2,
  zoomLevel: 1.0,
  keybindings: DEFAULT_KEYBINDINGS,
  agentConfigs: {},
  customAgents: [],
};
