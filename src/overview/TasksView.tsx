import { CheckSquare, Square } from "./Icons";
import { Translator, interpolate } from "../i18n";
import "../styles/TasksView.css";

interface Props {
  tasksMd: string;
  t: Translator;
}

interface Task {
  id: string;
  done: boolean;
  label: string;
}

function parseTasks(md: string): Task[] {
  const tasks: Task[] = [];
  const re = /^- \[([ xX])\] (?:<!-- (\S+) --> )?(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    tasks.push({
      done: m[1].toLowerCase() === "x",
      id: m[2] ?? crypto.randomUUID(),
      label: m[3].trim(),
    });
  }
  return tasks;
}

export default function TasksView({ tasksMd, t }: Props) {
  const tasks = parseTasks(tasksMd);
  const done = tasks.filter((t) => t.done).length;

  if (tasks.length === 0) {
    return <p className="tasks-empty">{t("tasks.empty")}</p>;
  }

  return (
    <div className="tasks-view">
      <div className="tasks-summary">{interpolate(t("tasks.done"), { done, total: tasks.length })}</div>
      {tasks.map((t) => (
        <div key={t.id} className={`task-item${t.done ? " done" : ""}`}>
          <span className="task-check">
            {t.done ? <CheckSquare size={13} /> : <Square size={13} />}
          </span>
          <span className="task-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}
