import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { yaml } from "@codemirror/lang-yaml";
import { useEffect, useMemo, useState } from "react";
import { Code, Folder, FolderOpen, X } from "../overview/Icons";
import { Translator } from "../i18n";
import { WorkspaceInfo } from "../types";
import "../styles/EditorWorkspace.css";

interface Props {
  workspace: WorkspaceInfo | null;
  layout?: "side" | "fullscreen";
  onLayoutChange?: (layout: "side" | "fullscreen") => void;
  t: Translator;
}

interface WorkspaceFileEntry {
  path: string;
  kind: "directory" | "file";
  modifiedMs: number;
}

interface FileTab {
  path: string;
  content: string;
  savedContent: string;
}

interface TreeNode {
  name: string;
  path: string;
  kind: "directory" | "file";
  children: TreeNode[];
}

const DEFAULT_EXPANDED = new Set([""]);

export default function EditorWorkspace({ workspace, layout = "side", onLayoutChange, t }: Props) {
  const [mode, setMode] = useState<"editor" | "browser">("editor");
  const [entries, setEntries] = useState<WorkspaceFileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(DEFAULT_EXPANDED);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("http://localhost:5173");
  const [committedBrowserUrl, setCommittedBrowserUrl] = useState("http://localhost:5173");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const tree = useMemo(() => buildTree(entries), [entries]);
  const filteredTree = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? filterTree(tree, query) : tree;
  }, [filter, tree]);

  useEffect(() => {
    setEntries([]);
    setExpanded(DEFAULT_EXPANDED);
    setTabs([]);
    setActivePath(null);
    setFilter("");
    setStatus(null);
    setMode("editor");

    if (!workspace || !("__TAURI_INTERNALS__" in window)) return;

    setLoading(true);
    invoke<WorkspaceFileEntry[]>("list_workspace_files", { workspacePath: workspace.path })
      .then((nextEntries) => {
        setEntries(nextEntries);
        setExpanded(new Set(["", ...nextEntries.filter((entry) => entry.kind === "directory" && entry.path.split("/").length <= 2).map((entry) => entry.path)]));
      })
      .catch((e) => setStatus(String(e)))
      .finally(() => setLoading(false));
  }, [workspace]);

  const openFile = async (path: string) => {
    if (!workspace || !("__TAURI_INTERNALS__" in window)) return;

    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }

    setStatus(null);
    setLoading(true);
    try {
      const content = await invoke<string>("read_workspace_text_file", {
        workspacePath: workspace.path,
        relativePath: path,
      });
      setTabs((prev) => [...prev, { path, content, savedContent: content }]);
      setActivePath(path);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setLoading(false);
    }
  };

  const updateActiveContent = (content: string) => {
    if (!activePath) return;
    setTabs((prev) => prev.map((tab) => (
      tab.path === activePath ? { ...tab, content } : tab
    )));
  };

  const closeTab = (path: string) => {
    const tab = tabs.find((item) => item.path === path);
    if (tab && tab.content !== tab.savedContent && !window.confirm(t("editor.confirmDiscard"))) return;

    setTabs((prev) => {
      const next = prev.filter((item) => item.path !== path);
      if (activePath === path) {
        setActivePath(next[next.length - 1]?.path ?? null);
      }
      return next;
    });
  };

  const saveActiveFile = async () => {
    if (!workspace || !activeTab || !("__TAURI_INTERNALS__" in window)) return;

    setSaving(true);
    setStatus(null);
    try {
      await invoke("write_workspace_text_file", {
        request: {
          workspacePath: workspace.path,
          relativePath: activeTab.path,
          content: activeTab.content,
        },
      });
      setTabs((prev) => prev.map((tab) => (
        tab.path === activeTab.path ? { ...tab, savedContent: tab.content } : tab
      )));
      setStatus(t("editor.saved"));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab]);

  if (!workspace) {
    return (
      <div className="editor-workspace-empty">
        <Code size={28} />
        <span>{t("editor.openWorkspace")}</span>
      </div>
    );
  }

  const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  return (
    <section className="editor-workspace">
      <div className="editor-mode-tabs">
        <div className="editor-content-tabs">
          <button
            className={`editor-mode-tab ${mode === "editor" ? "active" : ""}`}
            onClick={() => setMode("editor")}
          >
            <Code size={13} />
            {t("sidebar.editor")}
          </button>
          <button
            className={`editor-mode-tab ${mode === "browser" ? "active" : ""}`}
            onClick={() => setMode("browser")}
          >
            {t("editor.browser")}
          </button>
        </div>
        <div className="editor-layout-tabs">
          <button
            className={`editor-layout-tab ${layout === "side" ? "active" : ""}`}
            onClick={() => onLayoutChange?.("side")}
            title={t("editor.layout.side")}
          >
            {t("editor.layout.side")}
          </button>
          <button
            className={`editor-layout-tab ${layout === "fullscreen" ? "active" : ""}`}
            onClick={() => onLayoutChange?.("fullscreen")}
            title={t("editor.layout.fullscreen")}
          >
            {t("editor.layout.fullscreen")}
          </button>
        </div>
      </div>

      <div className="editor-shell">
        <aside className="editor-tree-pane">
          <div className="editor-tree-header">
            <span className="editor-workspace-name">{workspace.path.replace(/\\/g, "/").split("/").pop() || workspace.path}</span>
            {loading && <span className="editor-status">{t("editor.loading")}</span>}
          </div>
          <div className="editor-search-row">
            <input
              className="editor-search-input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("editor.search")}
            />
          </div>
          <div className="editor-tree">
            {filteredTree.children.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                expanded={filter ? new Set(entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path)) : expanded}
                activePath={activePath}
                onToggleDir={toggleDir}
                onOpenFile={openFile}
              />
            ))}
            {!loading && filteredTree.children.length === 0 && (
              <p className="editor-tree-empty">{t("editor.noFiles")}</p>
            )}
          </div>
        </aside>

        {mode === "editor" ? (
          <main className="editor-code-pane">
            <div className="editor-tabbar">
              {tabs.map((tab) => {
                const dirty = tab.content !== tab.savedContent;
                return (
                  <button
                    key={tab.path}
                    className={`editor-code-tab ${activePath === tab.path ? "active" : ""}`}
                    onClick={() => setActivePath(tab.path)}
                    title={tab.path}
                  >
                    <span>{basename(tab.path)}</span>
                    {dirty && <span className="editor-dirty-dot" />}
                    <span
                      className="editor-tab-close"
                      onClick={(event) => { event.stopPropagation(); closeTab(tab.path); }}
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

            {activeTab ? (
              <CodeMirror
                className="editor-codemirror"
                value={activeTab.content}
                height="100%"
                theme={oneDark}
                extensions={languageExtensions(activeTab.path)}
                basicSetup={{
                  foldGutter: true,
                  highlightActiveLine: true,
                  highlightActiveLineGutter: true,
                }}
                onChange={updateActiveContent}
              />
            ) : (
              <div className="editor-empty-state">{t("editor.selectFile")}</div>
            )}

            <div className="editor-footer">
              <span>{activePath ?? t("editor.noFileSelected")}</span>
              <span className={isDirty ? "dirty" : ""}>{isDirty ? t("editor.unsaved") : status}</span>
            </div>
          </main>
        ) : (
          <main className="editor-browser-pane">
            <form
              className="editor-browser-bar"
              onSubmit={(event) => {
                event.preventDefault();
                setCommittedBrowserUrl(normalizeBrowserUrl(browserUrl));
              }}
            >
              <input
                className="editor-browser-input"
                value={browserUrl}
                onChange={(event) => setBrowserUrl(event.target.value)}
                placeholder="http://localhost:5173"
              />
              <button className="editor-browser-go" type="submit">
                {t("editor.open")}
              </button>
            </form>
            <iframe
              className="editor-browser-frame"
              src={committedBrowserUrl}
              title={t("editor.browser")}
            />
          </main>
        )}
      </div>
    </section>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  activePath,
  onToggleDir,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const isDir = node.kind === "directory";
  const isOpen = expanded.has(node.path);

  return (
    <>
      <button
        className={`editor-tree-row ${activePath === node.path ? "active" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => isDir ? onToggleDir(node.path) : onOpenFile(node.path)}
        title={node.path}
      >
        <span className="editor-tree-caret">{isDir ? (isOpen ? "⌄" : "›") : ""}</span>
        {isDir ? (isOpen ? <FolderOpen size={14} /> : <Folder size={14} />) : <Code size={13} />}
        <span className="editor-tree-name">{node.name}</span>
      </button>
      {isDir && isOpen && node.children.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          activePath={activePath}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      ))}
    </>
  );
}

function buildTree(entries: WorkspaceFileEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", kind: "directory", children: [] };
  const nodes = new Map<string, TreeNode>([["", root]]);

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      const kind = isLeaf ? entry.kind : "directory";
      let node = nodes.get(currentPath);

      if (!node) {
        node = { name: part, path: currentPath, kind, children: [] };
        nodes.set(currentPath, node);
        parent.children.push(node);
      } else if (isLeaf) {
        node.kind = kind;
      }

      parent = node;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

function filterTree(node: TreeNode, query: string): TreeNode {
  const children = node.children
    .map((child) => filterTree(child, query))
    .filter((child) => child.path.toLowerCase().includes(query) || child.children.length > 0);
  return { ...node, children };
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function normalizeBrowserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) || trimmed.startsWith("about:")) return trimmed;
  return `http://${trimmed}`;
}

function languageExtensions(path: string): Extension[] {
  const ext = path.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "ts", "tsx"].includes(ext ?? "")) return [javascript({ jsx: true, typescript: ext === "ts" || ext === "tsx" })];
  if (ext === "css") return [css()];
  if (["html", "xml"].includes(ext ?? "")) return [html()];
  if (ext === "json" || path.endsWith(".jsonl")) return [json()];
  if (ext === "md") return [markdown()];
  if (ext === "rs") return [rust()];
  if (["yaml", "yml"].includes(ext ?? "")) return [yaml()];
  return [];
}
