import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Code2, Columns, Maximize2, X, Globe } from "lucide-react";
import { Translator } from "../i18n";
import { AgentPane, WorkspaceInfo } from "../types";
import FileTree from "./FileTree";
import CodeEditor, { CodeEditorHandle } from "./CodeEditor";
import BrowserPane from "./BrowserPane";
import "../styles/EditorWorkspace.css";

interface Props {
  workspace: WorkspaceInfo | null;
  layout?: "side" | "fullscreen";
  onLayoutChange?: (layout: "side" | "fullscreen") => void;
  panes: AgentPane[];
  onSendToPane: (paneId: string, text: string) => void;
  t: Translator;
}

interface SendMenu {
  x: number;
  y: number;
  text: string;
}

interface FileTab {
  path: string;
  content: string;
  savedContent: string;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

const TREE_MIN = 140;
const TREE_MAX = 500;
const TREE_DEFAULT = 260;

export default function EditorWorkspace({ workspace, layout = "side", onLayoutChange, panes, onSendToPane, t }: Props) {
  const [mode, setMode] = useState<"editor" | "browser">("editor");
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT);
  const [sendMenu, setSendMenu] = useState<SendMenu | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const activeTabRef = useRef<FileTab | null>(null);
  const tabsRef = useRef<FileTab[]>([]);
  const activePathRef = useRef<string | null>(null);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  activeTabRef.current = activeTab;
  tabsRef.current = tabs;
  activePathRef.current = activePath;

  const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  useEffect(() => {
    setTabs([]);
    setActivePath(null);
    setStatus(null);
    setMode("editor");
  }, [workspace?.path]);

  const openFile = async (path: string) => {
    if (!workspace || !("__TAURI_INTERNALS__" in window)) return;
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing) { setActivePath(path); return; }

    try {
      const content = await invoke<string>("read_workspace_text_file", {
        workspacePath: workspace.path,
        relativePath: path,
      });
      setTabs((prev) => [...prev, { path, content, savedContent: content }]);
      setActivePath(path);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const closeTab = useCallback((path: string) => {
    const tab = tabsRef.current.find((t) => t.path === path);
    if (tab && tab.content !== tab.savedContent && !window.confirm(t("editor.confirmDiscard"))) return;
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activePathRef.current === path) setActivePath(next[next.length - 1]?.path ?? null);
      return next;
    });
  }, [t]);

  const saveActiveFile = useCallback(async () => {
    const tab = activeTabRef.current;
    if (!workspace || !tab || !("__TAURI_INTERNALS__" in window)) return;
    setSaving(true);
    setStatus(null);
    try {
      await invoke("write_workspace_text_file", {
        request: { workspacePath: workspace.path, relativePath: tab.path, content: tab.content },
      });
      setTabs((prev) => prev.map((t) =>
        t.path === tab.path ? { ...t, savedContent: t.content } : t
      ));
      setStatus(t("editor.saved"));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setSaving(false);
    }
  }, [workspace, t]);

  const cycleTab = useCallback((dir: 1 | -1) => {
    const ts = tabsRef.current;
    if (ts.length < 2) return;
    const idx = ts.findIndex((t) => t.path === activePathRef.current);
    const next = (idx + dir + ts.length) % ts.length;
    setActivePath(ts[next].path);
  }, []);

  const updateTabContent = (path: string, value: string) => {
    setTabs((prev) => prev.map((tab) =>
      tab.path === path ? { ...tab, content: value } : tab
    ));
  };

  // Global keyboard shortcuts for frame
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActiveFile();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activePathRef.current) closeTab(activePathRef.current);
      } else if (e.key === "Tab") {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveActiveFile, closeTab, cycleTab]);

  // Tree pane drag-resize
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: treeWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      setTreeWidth(Math.min(TREE_MAX, Math.max(TREE_MIN, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!workspace) {
    return (
      <div className="editor-workspace-empty">
        <Code2 size={28} />
        <span>{t("editor.openWorkspace")}</span>
      </div>
    );
  }

  return (
    <section className="editor-workspace">
      <div className="editor-topbar">
        <div className="editor-mode-tabs">
          <button
            className={`editor-mode-tab${mode === "editor" ? " active" : ""}`}
            onClick={() => setMode("editor")}
          >
            <Code2 size={13} />
            {t("sidebar.editor")}
          </button>
          <button
            className={`editor-mode-tab${mode === "browser" ? " active" : ""}`}
            onClick={() => setMode("browser")}
          >
            <Globe size={13} />
            {t("editor.browser")}
          </button>
        </div>
        <div className="editor-layout-tabs">
          <button
            className={`editor-layout-tab${layout === "side" ? " active" : ""}`}
            onClick={() => onLayoutChange?.("side")}
            title={t("editor.layout.side")}
          >
            <Columns size={14} />
          </button>
          <button
            className={`editor-layout-tab${layout === "fullscreen" ? " active" : ""}`}
            onClick={() => onLayoutChange?.("fullscreen")}
            title={t("editor.layout.fullscreen")}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div className="editor-shell">
        <aside className="editor-tree-pane" style={{ width: treeWidth, minWidth: treeWidth, maxWidth: treeWidth }}>
          <div className="editor-tree-header">
            <span className="editor-workspace-name">
              {workspace.path.replace(/\\/g, "/").split("/").pop() || workspace.path}
            </span>
          </div>
          <FileTree workspacePath={workspace.path} onOpenFile={openFile} />
        </aside>

        <div className="editor-tree-divider" onMouseDown={onDividerMouseDown} />

        <main className={`editor-code-pane${mode !== "editor" ? " editor-pane-hidden" : ""}`}>
          <div className="editor-tabbar">
            {tabs.map((tab) => {
              const dirty = tab.content !== tab.savedContent;
              return (
                <button
                  key={tab.path}
                  className={`editor-code-tab${activePath === tab.path ? " active" : ""}`}
                  onClick={() => setActivePath(tab.path)}
                  onAuxClick={(e) => { if (e.button === 1) closeTab(tab.path); }}
                  title={tab.path}
                >
                  <span>{basename(tab.path)}</span>
                  {dirty && <span className="editor-dirty-dot" />}
                  <span
                    className="editor-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  >
                    <X size={12} />
                  </span>
                </button>
              );
            })}
            <div className="editor-tabbar-spacer" />
            <button
              className="editor-save-action"
              onClick={saveActiveFile}
              disabled={!activeTab || !isDirty || saving}
            >
              {saving ? t("editor.saving") : t("editor.save")}
            </button>
          </div>

          <div className="editor-code-area">
            {activeTab ? (
              <CodeEditor
                ref={editorRef}
                tab={activeTab}
                onChange={updateTabContent}
                onContextMenuSend={(x, y, text) => setSendMenu({ x, y, text })}
              />
            ) : (
              <div className="editor-empty-state">{t("editor.selectFile")}</div>
            )}
          </div>

          <div className="editor-footer">
            <span>{activePath ?? t("editor.noFileSelected")}</span>
            <span className={isDirty ? "dirty" : ""}>{isDirty ? t("editor.unsaved") : status}</span>
          </div>
        </main>

        <main className={`editor-browser-pane${mode !== "browser" ? " editor-pane-hidden" : ""}`}>
          <BrowserPane />
        </main>
      </div>

      {sendMenu && (
        <div
          className="send-to-agent-overlay"
          onClick={() => setSendMenu(null)}
        >
          <div
            className="send-to-agent-menu"
            style={{ top: sendMenu.y, left: sendMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="send-menu-header">Send to agent</div>
            {panes.length === 0 && (
              <div className="send-menu-empty">No agent panes open</div>
            )}
            {panes.map((pane) => (
              <button
                key={pane.id}
                className="send-menu-item"
                onClick={() => {
                  onSendToPane(pane.id, sendMenu.text);
                  setSendMenu(null);
                }}
              >
                {pane.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
