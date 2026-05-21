use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;

// ── public event type ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEvent {
    pub agent_id: String,
    pub event: String,
    pub tool: Option<String>,
    pub files: Vec<String>,
    pub ts: u64,
}

// ── bridge ────────────────────────────────────────────────────────────────────

pub struct HookBridge {
    pub port: u16,
    pub token: String,
    pub abort: tokio::task::AbortHandle,
}

struct BridgeState {
    token: String,
    on_event: Box<dyn Fn(HookEvent) + Send + Sync>,
}

impl HookBridge {
    pub async fn start<F>(on_event: F) -> anyhow::Result<Self>
    where
        F: Fn(HookEvent) + Send + Sync + 'static,
    {
        let token = uuid::Uuid::new_v4().to_string();
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();

        let state = Arc::new(BridgeState {
            token: token.clone(),
            on_event: Box::new(on_event),
        });

        let app = Router::new()
            .route("/hooks/:agent_id", post(handle_hook))
            .with_state(state);

        let join_handle = tokio::spawn(async move {
            axum::serve(listener, app).await.ok();
        });
        let abort = join_handle.abort_handle();

        Ok(HookBridge { port, token, abort })
    }
}

// ── request handler ───────────────────────────────────────────────────────────

async fn handle_hook(
    Path(agent_id): Path<String>,
    State(state): State<Arc<BridgeState>>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if auth != format!("Bearer {}", state.token) {
        return StatusCode::UNAUTHORIZED;
    }

    let raw: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST,
    };

    (state.on_event)(normalize(&agent_id, &raw));
    StatusCode::OK
}

// ── normaliser ────────────────────────────────────────────────────────────────

fn normalize(agent_id: &str, raw: &serde_json::Value) -> HookEvent {
    let tool = raw
        .get("tool_name")
        .or_else(|| raw.get("tool"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let files = extract_files(raw);

    let event_type = raw
        .get("event")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| {
            if raw.get("tool_response").is_some() {
                "post_tool_use"
            } else if tool.is_some() {
                "pre_tool_use"
            } else {
                "unknown"
            }
        })
        .to_string();

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    HookEvent {
        agent_id: agent_id.to_string(),
        event: event_type,
        tool,
        files,
        ts,
    }
}

fn extract_files(raw: &serde_json::Value) -> Vec<String> {
    let mut files = Vec::new();
    if let Some(input) = raw.get("tool_input") {
        for key in &["path", "file_path", "notebook_path"] {
            if let Some(p) = input.get(key).and_then(|v| v.as_str()) {
                files.push(p.to_string());
                break;
            }
        }
        if let Some(arr) = input.get("paths").and_then(|v| v.as_array()) {
            for p in arr {
                if let Some(s) = p.as_str() {
                    files.push(s.to_string());
                }
            }
        }
    }
    files
}
