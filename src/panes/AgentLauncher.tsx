import { Bot, Zap, Github, Atom, Terminal, Plus } from "../overview/Icons";
import { Translator } from "../i18n";
import "../styles/AgentLauncher.css";

interface Props {
  onLaunch: (agentId: string) => void;
  onAddCustom?: () => void;
  t: Translator;
}

interface AgentInfo {
  id: string;
  className: string;
  icon: React.ReactNode;
  title: string;
  descKey: Parameters<Translator>[0];
  tags: string[];
}

const LAUNCHABLE_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    className: "claude",
    icon: <Bot size={20} style={{ color: "var(--accent-claude)" }} />,
    title: "Claude Code",
    descKey: "launcher.desc.claude",
    tags: ["AI", "Anthropic", "CLI"],
  },
  {
    id: "codex",
    className: "codex",
    icon: <Zap size={20} style={{ color: "var(--accent-codex)" }} />,
    title: "Codex CLI",
    descKey: "launcher.desc.codex",
    tags: ["AI", "OpenAI", "CLI"],
  },
  {
    id: "copilot",
    className: "copilot",
    icon: <Github size={20} style={{ color: "var(--accent-copilot)" }} />,
    title: "GitHub Copilot CLI",
    descKey: "launcher.desc.copilot",
    tags: ["AI", "GitHub", "CLI"],
  },
  {
    id: "antigravity",
    className: "antigravity",
    icon: <Atom size={20} style={{ color: "var(--accent-antigravity)" }} />,
    title: "Antigravity CLI",
    descKey: "launcher.desc.antigravity",
    tags: ["AI", "Local", "CLI"],
  },
  {
    id: "shell",
    className: "shell",
    icon: <Terminal size={20} style={{ color: "var(--accent-shell)" }} />,
    title: "System Shell",
    descKey: "launcher.desc.shell",
    tags: ["System", "Shell"],
  },
];

export default function AgentLauncher({ onLaunch, onAddCustom, t }: Props) {
  return (
    <div className="launcher-container">
      <div className="launcher-header">
        <h2>{t("launcher.title")}</h2>
        <p>{t("launcher.subtitle")}</p>
      </div>
      <div className="launcher-grid">
        {LAUNCHABLE_AGENTS.map((agent) => (
          <div key={agent.id} className={`launcher-card ${agent.className}`}>
            <div className="launcher-card-header">
              <span className="launcher-card-icon">{agent.icon}</span>
              <span className="launcher-card-title">{agent.title}</span>
            </div>
            <p className="launcher-card-desc">{t(agent.descKey)}</p>
            <div className="launcher-card-tags">
              {agent.tags.map((tag) => (
                <span key={tag} className="launcher-card-tag">{tag}</span>
              ))}
            </div>
            <button className="launcher-card-btn" onClick={() => onLaunch(agent.id)}>
              {t("common.launch")}
            </button>
          </div>
        ))}
        <div className="launcher-card custom" onClick={() => onAddCustom?.()}>
          <Plus size={32} className="launcher-card-add-icon" />
          <span className="launcher-card-add-text">{t("launcher.addCustom")}</span>
          <span className="launcher-card-add-sub">
            {t("launcher.addCustomHelp")}
          </span>
        </div>
      </div>
    </div>
  );
}
