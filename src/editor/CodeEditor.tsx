import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  drawSelection, rectangularSelection, dropCursor, highlightSpecialChars,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  defaultKeymap, historyKeymap, history, indentWithTab,
  toggleComment, moveLineUp, moveLineDown, deleteLine,
  indentMore, indentLess, selectLine,
} from "@codemirror/commands";
import {
  syntaxHighlighting, defaultHighlightStyle,
  bracketMatching, foldGutter, indentOnInput,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  highlightSelectionMatches, searchKeymap,
  selectNextOccurrence,
} from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage } from "@codemirror/language";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { oneDark } from "@codemirror/theme-one-dark";

export interface CodeEditorHandle {
  getSelection: () => string;
}

interface FileTab {
  path: string;
  content: string;
  savedContent: string;
}

interface Props {
  tab: FileTab;
  onChange: (path: string, value: string) => void;
  onContextMenuSend?: (x: number, y: number, text: string) => void;
}

const languageCompartment = new Compartment();

function getLangExtension(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js":
    case "jsx":   return javascript({ jsx: true });
    case "ts":    return javascript({ typescript: true });
    case "tsx":   return javascript({ typescript: true, jsx: true });
    case "css":   return css();
    case "html":  return html();
    case "json":
    case "jsonl": return json();
    case "md":    return markdown();
    case "rs":    return StreamLanguage.define(rust);
    case "sh":    return StreamLanguage.define(shell);
    case "yaml":
    case "yml":   return StreamLanguage.define(yaml);
    case "toml":  return StreamLanguage.define(toml);
    default:      return [];
  }
}

const darkTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
  ".cm-content": { caretColor: "#e2e8f0" },
  ".cm-gutters": { background: "#1e2230", borderRight: "1px solid #2d3348" },
  ".cm-lineNumbers .cm-gutterElement": { color: "#4a5570", minWidth: "40px" },
  ".cm-selectionMatch": { background: "rgba(88,166,255,0.15)" },
  ".cm-searchMatch": { background: "rgba(210,153,34,0.3)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { background: "rgba(210,153,34,0.6)" },
  ".cm-tooltip": { borderRadius: "6px", border: "1px solid #2d3348" },
  ".cm-tooltip-autocomplete": { background: "#1e2230" },
}, { dark: true });

const editorKeymap = keymap.of([
  // Autocomplete / brackets
  ...closeBracketsKeymap,
  ...completionKeymap,
  // Search
  ...searchKeymap,
  // History
  ...historyKeymap,
  // Default (includes Ctrl+A, Home/End, arrow nav, etc.)
  ...defaultKeymap,
  // Tab indent
  indentWithTab,
  // Line operations
  { key: "Ctrl-/",         run: toggleComment },
  { key: "Mod-/",          run: toggleComment },
  { key: "Alt-ArrowUp",    run: moveLineUp },
  { key: "Alt-ArrowDown",  run: moveLineDown },
  { key: "Ctrl-Shift-k",   run: deleteLine },
  { key: "Ctrl-]",         run: indentMore },
  { key: "Ctrl-[",         run: indentLess },
  { key: "Ctrl-l",         run: selectLine },
  // Select next occurrence (Ctrl+D like VS Code)
  { key: "Ctrl-d",         run: selectNextOccurrence },
]);

const baseExtensions = [
  history(),
  lineNumbers(),
  foldGutter(),
  highlightActiveLine(),
  highlightSpecialChars(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  bracketMatching(),
  closeBrackets(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  highlightSelectionMatches(),
  autocompletion(),
  EditorView.dragMovesSelection.of(() => true),
  EditorState.tabSize.of(2),
  EditorView.lineWrapping,
  oneDark,
  darkTheme,
  editorKeymap,
];

const CodeEditor = forwardRef<CodeEditorHandle, Props>(({ tab, onChange, onContextMenuSend }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef<string>(tab.path);
  const onChangeRef = useRef(onChange);
  const onContextMenuSendRef = useRef(onContextMenuSend);
  onChangeRef.current = onChange;
  onContextMenuSendRef.current = onContextMenuSend;

  useImperativeHandle(ref, () => ({
    getSelection: () => {
      const view = viewRef.current;
      if (!view) return "";
      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: tab.content,
        extensions: [
          ...baseExtensions,
          languageCompartment.of(getLangExtension(tab.path)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(pathRef.current, update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            contextmenu(event, view) {
              const { from, to } = view.state.selection.main;
              if (from === to) return false;
              const text = view.state.sliceDoc(from, to);
              event.preventDefault();
              onContextMenuSendRef.current?.(event.clientX, event.clientY, text);
              return true;
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    pathRef.current = tab.path;

    return () => { view.destroy(); viewRef.current = null; };
  }, [tab.path]);

  // Sync on external save only — avoid re-render on every keystroke
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== tab.content) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: tab.content } });
    }
  }, [tab.savedContent]);

  return <div ref={containerRef} className="cm-editor-container" />;
});

CodeEditor.displayName = "CodeEditor";
export default CodeEditor;
