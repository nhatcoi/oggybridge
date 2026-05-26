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

export interface FileChangedPayload {
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

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accentColor: "blue",
  fontSize: 14,
  fontFamily: "jetbrains",
  startupLastWs: true,
  telemetry: false,
  enabledAgents: ["claude-code", "codex", "copilot", "antigravity", "shell"],
  maxPerRow: 2,
};
