import { Bot, Zap, Github, Atom, Terminal, Plus } from "../overview/Icons";
import "../styles/AgentLauncher.css";

interface Props {
  onLaunch: (agentId: string) => void;
  onAddCustom?: () => void;
}

interface AgentInfo {
  id: string;
  className: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tags: string[];
}

const LAUNCHABLE_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    className: "claude",
    icon: <Bot size={20} style={{ color: "var(--accent-claude)" }} />,
    title: "Claude Code",
    desc: "Anthropic's Claude Code CLI. Interactive agent optimized for editing, refactoring, and git operations.",
    tags: ["AI", "Anthropic", "CLI"],
  },
  {
    id: "codex",
    className: "codex",
    icon: <Zap size={20} style={{ color: "var(--accent-codex)" }} />,
    title: "Codex CLI",
    desc: "OpenAI Codex-powered terminal interface. Great for quick scaffolding, search, and coding tasks.",
    tags: ["AI", "OpenAI", "CLI"],
  },
  {
    id: "copilot",
    className: "copilot",
    icon: <Github size={20} style={{ color: "var(--accent-copilot)" }} />,
    title: "GitHub Copilot CLI",
    desc: "GitHub's official command line pair programmer. Translates natural language to shell commands.",
    tags: ["AI", "GitHub", "CLI"],
  },
  {
    id: "antigravity",
    className: "antigravity",
    icon: <Atom size={20} style={{ color: "var(--accent-antigravity)" }} />,
    title: "Antigravity CLI",
    desc: "Local-first agentic coding client. Excels at precision structural edits and codebase analysis.",
    tags: ["AI", "Local", "CLI"],
  },
  {
    id: "shell",
    className: "shell",
    icon: <Terminal size={20} style={{ color: "var(--accent-shell)" }} />,
    title: "System Shell",
    desc: "Open a default persistent system shell (bash/zsh) inside the workspace environment.",
    tags: ["System", "Shell"],
  },
];

export default function AgentLauncher({ onLaunch, onAddCustom }: Props) {
  return (
    <div className="launcher-container">
      <div className="launcher-header">
        <h2>Launch a new agent</h2>
        <p>Launch multiple agents side-by-side to collaborate in this workspace.</p>
      </div>
      <div className="launcher-grid">
        {LAUNCHABLE_AGENTS.map((agent) => (
          <div key={agent.id} className={`launcher-card ${agent.className}`}>
            <div className="launcher-card-header">
              <span className="launcher-card-icon">{agent.icon}</span>
              <span className="launcher-card-title">{agent.title}</span>
            </div>
            <p className="launcher-card-desc">{agent.desc}</p>
            <div className="launcher-card-tags">
              {agent.tags.map((tag) => (
                <span key={tag} className="launcher-card-tag">{tag}</span>
              ))}
            </div>
            <button className="launcher-card-btn" onClick={() => onLaunch(agent.id)}>
              Launch
            </button>
          </div>
        ))}
        <div className="launcher-card custom" onClick={() => onAddCustom?.()}>
          <Plus size={32} className="launcher-card-add-icon" />
          <span className="launcher-card-add-text">Add Custom Agent</span>
          <span className="launcher-card-add-sub">
            Configure a custom command, path, and environment.
          </span>
        </div>
      </div>
    </div>
  );
}
