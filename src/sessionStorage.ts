import { invoke } from "@tauri-apps/api/core";
import { AgentPane } from "./types";

const LAST_WORKSPACE_KEY = "lastWorkspacePath";
const RECENT_WORKSPACES_KEY = "recentWorkspaces";
const PANE_SESSIONS_KEY = "workspacePaneSessions";

export type StoredPaneSession = Array<Pick<AgentPane, "paneId" | "agentId" | "label">>;

export interface AppSessionState {
  lastWorkspacePath: string | null;
  recentWorkspaces: string[];
  workspacePaneSessions: Record<string, StoredPaneSession>;
}

const DEFAULT_SESSION_STATE: AppSessionState = {
  lastWorkspacePath: null,
  recentWorkspaces: [],
  workspacePaneSessions: {},
};

let memorySessionState: AppSessionState = DEFAULT_SESSION_STATE;
let writeQueue: Promise<void> = Promise.resolve();

export async function readSessionState(): Promise<AppSessionState> {
  const state = await readStoredSessionState();
  const migrated = readLegacyLocalStorageState();
  if (migrated && isEmptySessionState(state)) {
    await writeSessionState(migrated);
    clearLegacyLocalStorageState();
    return migrated;
  }
  if (migrated) clearLegacyLocalStorageState();
  return state;
}

export async function writeSessionState(state: AppSessionState): Promise<void> {
  const normalized = normalizeSessionState(state);
  memorySessionState = normalized;
  if (!("__TAURI_INTERNALS__" in window)) return;

  await invoke("write_session_state", {
    session: JSON.stringify(normalized, null, 2),
  });
}

export async function getLastWorkspacePath(): Promise<string | null> {
  return (await readSessionState()).lastWorkspacePath;
}

export async function writeLastWorkspacePath(path: string): Promise<void> {
  await updateSessionState((state) => ({ ...state, lastWorkspacePath: path }));
}

export async function getRecentWorkspaces(): Promise<string[]> {
  return (await readSessionState()).recentWorkspaces;
}

export async function writeRecentWorkspaces(recentWorkspaces: string[]): Promise<void> {
  await updateSessionState((state) => ({ ...state, recentWorkspaces }));
}

export async function getStoredPaneSession(workspacePath: string): Promise<StoredPaneSession | null> {
  return (await readSessionState()).workspacePaneSessions[workspacePath] ?? null;
}

export async function writeStoredPaneSession(workspacePath: string, panes: StoredPaneSession): Promise<void> {
  await updateSessionState((state) => ({
    ...state,
    workspacePaneSessions: {
      ...state.workspacePaneSessions,
      [workspacePath]: normalizeStoredPanes(panes) ?? [],
    },
  }));
}

async function updateSessionState(updater: (state: AppSessionState) => AppSessionState): Promise<void> {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const state = await readSessionState();
    await writeSessionState(updater(state));
  });
  await writeQueue;
}

async function readStoredSessionState(): Promise<AppSessionState> {
  if (!("__TAURI_INTERNALS__" in window)) return memorySessionState;

  try {
    const raw = await invoke<string>("read_session_state");
    const parsed = raw ? JSON.parse(raw) : {};
    const normalized = normalizeSessionState(parsed);
    memorySessionState = normalized;
    return normalized;
  } catch {
    return memorySessionState;
  }
}

function normalizeSessionState(value: unknown): AppSessionState {
  if (!value || typeof value !== "object") return DEFAULT_SESSION_STATE;

  const state = value as Partial<AppSessionState>;
  const workspacePaneSessions = state.workspacePaneSessions && typeof state.workspacePaneSessions === "object"
    ? Object.fromEntries(
        Object.entries(state.workspacePaneSessions)
          .map(([workspacePath, panes]) => [workspacePath, normalizeStoredPanes(panes)])
          .filter((entry): entry is [string, StoredPaneSession] => Array.isArray(entry[1]))
      )
    : {};

  return {
    lastWorkspacePath: typeof state.lastWorkspacePath === "string" ? state.lastWorkspacePath : null,
    recentWorkspaces: normalizeStringArray(state.recentWorkspaces).slice(0, 5),
    workspacePaneSessions,
  };
}

function normalizeStoredPanes(panes: unknown): StoredPaneSession | null {
  if (!Array.isArray(panes)) return null;

  return panes
    .filter((pane) => typeof pane?.agentId === "string" && typeof pane?.label === "string")
    .map((pane) => ({
      // Preserve existing paneId; generate a stable UUID for migrated (pre-paneId) entries.
      paneId: typeof pane.paneId === "string" && pane.paneId ? pane.paneId : crypto.randomUUID(),
      agentId: pane.agentId as string,
      label: pane.label as string,
    }));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isEmptySessionState(state: AppSessionState): boolean {
  return !state.lastWorkspacePath
    && state.recentWorkspaces.length === 0
    && Object.keys(state.workspacePaneSessions).length === 0;
}

function readLegacyLocalStorageState(): AppSessionState | null {
  try {
    const lastWorkspacePath = localStorage.getItem(LAST_WORKSPACE_KEY);
    const recentWorkspaces = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY) || "[]");
    const workspacePaneSessions = JSON.parse(localStorage.getItem(PANE_SESSIONS_KEY) || "{}");
    const migrated = normalizeSessionState({ lastWorkspacePath, recentWorkspaces, workspacePaneSessions });
    return isEmptySessionState(migrated) ? null : migrated;
  } catch {
    return null;
  }
}

function clearLegacyLocalStorageState() {
  try {
    localStorage.removeItem(LAST_WORKSPACE_KEY);
    localStorage.removeItem(RECENT_WORKSPACES_KEY);
    localStorage.removeItem(PANE_SESSIONS_KEY);
  } catch {
    // Migration cleanup is best effort.
  }
}
