# OggyBridge Coordination Protocol

This workspace is managed by **OggyBridge**. Multiple AI agents may work here simultaneously.

## Rules

1. **Before starting work**, check `.agents/TASKS.md` and claim a task via the MCP coordinator
   (`claim_task("task-id")`), or add a new task first.
2. **Report progress** periodically: `report_progress("what you just did")`.
3. **Report touched files**: `touched_files(["path/to/file"])` when editing — this lets the
   coordinator warn if another agent is editing the same file.
4. **Release your task** when done: `release_task("task-id")`.

## Shared files

| File | Purpose |
|------|---------|
| `.agents/TASKS.md` | Canonical task list. Human- and agent-editable. |
| `.agents/AGENT_STATE.md` | Live per-agent status. Auto-updated by coordinator. |
| `.agents/ACTIVITY.log` | Append-only JSON-lines event log. |

## MCP coordinator

When the app is running, an MCP server is available at the socket in `.agents/config.toml`
(`mcp_socket`). Add it to your `.mcp.json` to enable tool-based coordination.
