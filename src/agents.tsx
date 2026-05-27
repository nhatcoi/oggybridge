import { Bot, Zap, Compass, Terminal, GitFork } from "lucide-react";

export const AGENTS = [
  { id: "claude-code", label: "Claude Code",      cmd: "claude" },
  { id: "codex",       label: "Codex",            cmd: "codex"  },
  { id: "copilot",     label: "Copilot CLI",      cmd: "gh"     },
  { id: "antigravity", label: "Antigravity CLI",  cmd: "agy"    },
  { id: "shell",       label: "Shell",            cmd: ""       },
] as const;

export const AGENT_ICONS: Record<string, React.ReactNode> = {
  "claude-code": <Bot size={15} />,
  "codex":       <Zap size={15} />,
  "copilot":     <GitFork size={15} />,
  "antigravity": <Compass size={15} />,
  "shell":       <Terminal size={15} />,
};
