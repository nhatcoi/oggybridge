import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  File,
  Folder,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import FileIcon from "./FileIcon";

export interface WorkspaceFileEntry {
  path: string;
  kind: "directory" | "file";
  modifiedMs: number;
}

interface TreeNode {
  path: string;
  name: string;
  kind: "directory" | "file";
  children: TreeNode[];
  expanded: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  node: TreeNode;
}

interface Props {
  workspacePath: string;
  onOpenFile: (path: string) => void;
}

function buildTree(entries: WorkspaceFileEntry[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    const parts = entry.path.split("/").filter(Boolean);
    let siblings = roots;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isDir = isLast ? entry.kind === "directory" : true;

      if (!map.has(currentPath)) {
        const node: TreeNode = {
          path: currentPath,
          name: part,
          kind: isDir ? "directory" : "file",
          children: [],
          expanded: i === 0 && isDir,
        };
        map.set(currentPath, node);
        siblings.push(node);
      }
      siblings = map.get(currentPath)!.children;
    }
  }

  return roots;
}

function updateExpanded(nodes: TreeNode[], path: string): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, expanded: !n.expanded };
    if (n.children.length > 0)
      return { ...n, children: updateExpanded(n.children, path) };
    return n;
  });
}

interface InlineInput {
  parentPath: string | null;
  kind: "file" | "directory";
  renamePath?: string;
  value: string;
}

export default function FileTree({ workspacePath, onOpenFile }: Props) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [filter, setFilter] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke<WorkspaceFileEntry[]>("list_workspace_files", {
        workspacePath,
      });
      setNodes(buildTree(entries));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [workspacePath]);

  useEffect(() => {
    if (inlineInput) inputRef.current?.focus();
  }, [inlineInput]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const toggle = (path: string) => setNodes((prev) => updateExpanded(prev, path));

  const commitInline = async () => {
    if (!inlineInput) return;
    const name = inlineInput.value.trim();
    if (!name) { setInlineInput(null); return; }

    try {
      if (inlineInput.renamePath) {
        await invoke("rename_workspace_item", {
          workspacePath,
          fromPath: inlineInput.renamePath,
          toName: name,
        });
      } else if (inlineInput.kind === "directory") {
        const rel = inlineInput.parentPath ? `${inlineInput.parentPath}/${name}` : name;
        await invoke("create_workspace_dir", { workspacePath, relativePath: rel });
      } else {
        const rel = inlineInput.parentPath ? `${inlineInput.parentPath}/${name}` : name;
        await invoke("write_workspace_text_file", {
          request: { workspacePath, relativePath: rel, content: "" },
        });
        onOpenFile(rel);
      }
      setInlineInput(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteNode = async (node: TreeNode) => {
    if (!window.confirm(`Delete "${node.name}"?`)) return;
    try {
      await invoke("delete_workspace_item", { workspacePath, relativePath: node.path });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const startRename = (node: TreeNode) => {
    setContextMenu(null);
    setInlineInput({ parentPath: null, kind: node.kind, renamePath: node.path, value: node.name });
  };

  const startCreate = (parentPath: string | null, kind: "file" | "directory") => {
    setContextMenu(null);
    setInlineInput({ parentPath, kind, value: "" });
  };

  const renderInlineInput = (parentPath: string | null) => {
    if (!inlineInput || inlineInput.renamePath) return null;
    if (inlineInput.parentPath !== parentPath) return null;
    return (
      <div className="ft-inline-input-row">
        {inlineInput.kind === "directory" ? <Folder size={13} /> : <File size={13} style={{ color: "#9E9E9E" }} />}
        <input
          ref={inputRef}
          className="ft-inline-input"
          value={inlineInput.value}
          onChange={(e) => setInlineInput((prev) => prev ? { ...prev, value: e.target.value } : prev)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitInline();
            if (e.key === "Escape") setInlineInput(null);
          }}
          onBlur={() => void commitInline()}
        />
      </div>
    );
  };

  const renderRenameInput = (node: TreeNode) => {
    if (!inlineInput?.renamePath || inlineInput.renamePath !== node.path) return null;
    return (
      <input
        ref={inputRef}
        className="ft-inline-input ft-inline-rename"
        value={inlineInput.value}
        onChange={(e) => setInlineInput((prev) => prev ? { ...prev, value: e.target.value } : prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commitInline();
          if (e.key === "Escape") setInlineInput(null);
        }}
        onBlur={() => void commitInline()}
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  const filterMatch = (node: TreeNode): boolean => {
    if (!filter) return true;
    const term = filter.toLowerCase();
    if (node.name.toLowerCase().includes(term)) return true;
    return node.children.some(filterMatch);
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (!filterMatch(node)) return null;
    const isDir = node.kind === "directory";
    const isRenaming = inlineInput?.renamePath === node.path;
    const dragText = node.path;

    return (
      <div key={node.path} className="ft-node">
        <div
          className="ft-row"
          style={{ paddingLeft: depth * 14 + 6 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("text/plain", dragText);
            e.dataTransfer.setData("application/x-oggybridge-path", node.path);
            (e.currentTarget.closest(".ft-node") as HTMLElement | null)?.setAttribute("dragging", "");
          }}
          onDragEnd={(e) => {
            (e.currentTarget.closest(".ft-node") as HTMLElement | null)?.removeAttribute("dragging");
          }}
          onClick={() => isDir ? toggle(node.path) : onOpenFile(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, node });
          }}
        >
          <span className="ft-caret">
            {isDir ? (node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </span>
          <FileIcon name={node.name} isDir={isDir} isOpen={node.expanded} />
          {isRenaming ? renderRenameInput(node) : (
            <span className="ft-name">{node.name}</span>
          )}
        </div>

        {isDir && node.expanded && (
          <div className="ft-children">
            {renderInlineInput(node.path)}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="ft-toolbar">
        <button
          className="ft-tool-btn"
          title="New File"
          onClick={() => startCreate(null, "file")}
        >
          <FilePlus size={14} />
        </button>
        <button
          className="ft-tool-btn"
          title="New Folder"
          onClick={() => startCreate(null, "directory")}
        >
          <FolderPlus size={14} />
        </button>
        <button
          className="ft-tool-btn"
          title="Refresh"
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
        </button>
        <input
          className="ft-search"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && <div className="ft-error">{error}</div>}
      {loading && <div className="ft-loading">Loading...</div>}

      <div className="ft-scroll">
        {renderInlineInput(null)}
        {nodes.map((node) => renderNode(node, 0))}
        {!loading && nodes.length === 0 && !error && (
          <div className="ft-empty">No files</div>
        )}
      </div>

      {contextMenu && (
        <div
          className="ft-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.kind === "directory" && (
            <>
              <button onClick={() => startCreate(contextMenu.node.path, "file")}>
                <FilePlus size={12} /> New File
              </button>
              <button onClick={() => startCreate(contextMenu.node.path, "directory")}>
                <FolderPlus size={12} /> New Folder
              </button>
              <div className="ft-menu-sep" />
            </>
          )}
          <button onClick={() => startRename(contextMenu.node)}>
            <Edit2 size={12} /> Rename
          </button>
          <button
            className="ft-menu-danger"
            onClick={() => { setContextMenu(null); void deleteNode(contextMenu.node); }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
