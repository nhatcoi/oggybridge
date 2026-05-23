use rmcp::{
    handler::server::wrapper::Parameters,
    schemars,
    tool, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, tower::StreamableHttpService,
        StreamableHttpServerConfig,
    },
};
use serde::Deserialize;
use std::{path::PathBuf, sync::Arc};
use tokio::net::TcpListener;

// ── public handle ─────────────────────────────────────────────────────────────

pub struct McpServer {
    pub port: u16,
    pub abort: tokio::task::AbortHandle,
}

impl McpServer {
    pub async fn start(workspace_path: PathBuf) -> anyhow::Result<Self> {
        let workspace_path = Arc::new(workspace_path);
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();

        let session_manager = Arc::new(LocalSessionManager::default());
        let wp = workspace_path.clone();
        let mcp_service = StreamableHttpService::new(
            move || Ok(CoordinatorHandler { workspace_path: wp.clone() }),
            session_manager,
            StreamableHttpServerConfig::default(),
        );

        let app = axum::Router::new().fallback_service(mcp_service);

        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app).await.ok();
        });

        Ok(McpServer {
            port,
            abort: join_handle.abort_handle(),
        })
    }
}

// ── tool parameters ──────────────────────────────────────────────────────────

#[derive(Deserialize, schemars::JsonSchema)]
struct ClaimTaskParams {
    task_id: String,
    agent_id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ReleaseTaskParams {
    task_id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ReportProgressParams {
    agent_id: String,
    text: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct TouchedFilesParams {
    agent_id: String,
    paths: Vec<String>,
}

// ── coordinator handler ───────────────────────────────────────────────────────

#[derive(Clone)]
struct CoordinatorHandler {
    workspace_path: Arc<PathBuf>,
}

#[tool_router(server_handler)]
impl CoordinatorHandler {
    #[tool(description = "Return current AGENT_STATE.md content showing what each agent is doing.")]
    async fn team_state(&self) -> String {
        let path = self.workspace_path.join(".agents/AGENT_STATE.md");
        std::fs::read_to_string(path).unwrap_or_else(|_| "No agent state available.".into())
    }

    #[tool(description = "Return TASKS.md task list with completion status and IDs.")]
    async fn list_tasks(&self) -> String {
        let path = self.workspace_path.join(".agents/TASKS.md");
        std::fs::read_to_string(path).unwrap_or_else(|_| "No tasks available.".into())
    }

    #[tool(description = "Claim a task by ID so other agents know you own it.")]
    async fn claim_task(&self, Parameters(p): Parameters<ClaimTaskParams>) -> String {
        match update_task_owner(&self.workspace_path, &p.task_id, Some(&p.agent_id)) {
            Ok(_) => format!("Task '{}' claimed by '{}'.", p.task_id, p.agent_id),
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "Release ownership of a task you previously claimed.")]
    async fn release_task(&self, Parameters(p): Parameters<ReleaseTaskParams>) -> String {
        match update_task_owner(&self.workspace_path, &p.task_id, None) {
            Ok(_) => format!("Task '{}' released.", p.task_id),
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "Append a progress note to ACTIVITY.log and update AGENT_STATE.md.")]
    async fn report_progress(&self, Parameters(p): Parameters<ReportProgressParams>) -> String {
        if let Err(e) = append_activity(
            &self.workspace_path,
            &p.agent_id,
            "progress",
            serde_json::json!({ "text": p.text }),
        ) {
            return format!("Error: {e}");
        }
        let _ = update_agent_status(&self.workspace_path, &p.agent_id, "active", &p.text);
        "Progress recorded.".into()
    }

    #[tool(description = "Report files you are editing. Feeds conflict detection and file heatmap.")]
    async fn touched_files(&self, Parameters(p): Parameters<TouchedFilesParams>) -> String {
        let count = p.paths.len();
        if let Err(e) = append_activity(
            &self.workspace_path,
            &p.agent_id,
            "touched_files",
            serde_json::json!({ "paths": p.paths }),
        ) {
            return format!("Error: {e}");
        }
        format!("Recorded {count} file(s).")
    }
}

// ── file helpers ──────────────────────────────────────────────────────────────

fn append_activity(
    workspace: &PathBuf,
    agent_id: &str,
    event: &str,
    data: serde_json::Value,
) -> anyhow::Result<()> {
    use std::io::Write;
    let path = workspace.join(".agents/ACTIVITY.log");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    let line = serde_json::json!({ "ts": ts, "agent_id": agent_id, "event": event, "data": data });
    writeln!(f, "{}", line)?;
    Ok(())
}

fn update_task_owner(
    workspace: &PathBuf,
    task_id: &str,
    owner: Option<&str>,
) -> anyhow::Result<()> {
    let path = workspace.join(".agents/TASKS.md");
    let content = std::fs::read_to_string(&path)?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    // Pattern: `- [ ] <!-- id --> description` or `- [x] <!-- id --> description [owner]`
    for line in &mut lines {
        if line.contains(&format!("<!-- {task_id} -->")) {
            *line = match owner {
                Some(o) => line
                    .trim_end_matches(|c: char| c == ']' || c == '[' || c == ' ')
                    .to_string()
                    + &format!(" [{o}]"),
                None => {
                    // Remove trailing [owner] if present
                    if let Some(idx) = line.rfind(" [") {
                        line[..idx].to_string()
                    } else {
                        line.clone()
                    }
                }
            };
            break;
        }
    }

    std::fs::write(path, lines.join("\n") + "\n")?;
    Ok(())
}

fn update_agent_status(
    workspace: &PathBuf,
    agent_id: &str,
    status: &str,
    task: &str,
) -> anyhow::Result<()> {
    let path = workspace.join(".agents/AGENT_STATE.md");
    let content = std::fs::read_to_string(&path)?;
    let truncated_task = if task.len() > 40 { &task[..40] } else { task };
    let new_content = content
        .lines()
        .map(|line| {
            if line.starts_with(&format!("| {agent_id} |")) {
                format!("| {agent_id} | {status} | {truncated_task} | — |")
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    std::fs::write(path, new_content)?;
    Ok(())
}
