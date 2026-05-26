import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import "../styles/TerminalPane.css";

interface Props {
  id: string;
  agentId: string;
  cmd?: string;
  args?: string[];
  cwd?: string;
  onSessionId?: (sessionId: string) => void;
}

export default function TerminalPane({ id, agentId, cmd, args, cwd, onSessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSessionIdRef = useRef(onSessionId);
  onSessionIdRef.current = onSessionId;
  const argsKey = args?.join("\u0000") ?? "";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const rootStyle = getComputedStyle(document.documentElement);
    const fontSize = parseInt(rootStyle.getPropertyValue("--terminal-font-size")) || 14;
    const fontFamily = rootStyle.getPropertyValue("--terminal-font-family") || '"JetBrains Mono", "Cascadia Code", Menlo, monospace';

    const term = new Terminal({
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      theme: {
        background:        "#0d1117",
        foreground:        "#e6edf3",
        cursor:            "#58a6ff",
        selectionBackground: "#264f78",
        black:             "#484f58",
        red:               "#ff7b72",
        green:             "#3fb950",
        yellow:            "#d29922",
        blue:              "#58a6ff",
        magenta:           "#bc8cff",
        cyan:              "#39c5cf",
        white:             "#b1bac4",
        brightBlack:       "#6e7681",
        brightRed:         "#ffa198",
        brightGreen:       "#56d364",
        brightYellow:      "#e3b341",
        brightBlue:        "#79c0ff",
        brightMagenta:     "#d2a8ff",
        brightCyan:        "#56d4dd",
        brightWhite:       "#f0f6fc",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, fall back to canvas
    }

    if (!("__TAURI_INTERNALS__" in window)) {
      term.writeln("\r\n\x1b[33mNot running inside Tauri — IPC unavailable\x1b[0m");
      return;
    }

    const startedAt = Date.now();

    invoke("create_pty", {
      id,
      cols: term.cols,
      rows: term.rows,
      cmd: cmd ?? null,
      args: args ?? null,
      cwd: cwd ?? null,
    }).catch((e) => term.writeln(`\r\n\x1b[31mFailed to create pty: ${e}\x1b[0m`));

    let sessionDetected = false;
    const detectSession = () => {
      if (!cwd || sessionDetected || args?.length || agentId === "shell") return;
      invoke<string | null>("detect_agent_session", {
        agentId,
        workspacePath: cwd,
        sinceMs: startedAt,
      })
        .then((sessionId) => {
          if (!sessionId || sessionDetected) return;
          sessionDetected = true;
          onSessionIdRef.current?.(sessionId);
        })
        .catch(() => {});
    };
    const sessionDetector = window.setInterval(detectSession, 2000);
    window.setTimeout(detectSession, 800);

    const unlistenPromise = listen<string>(`pty-data-${id}`, (e) => {
      term.write(e.payload);
    });

    const onDataDisposable = term.onData((data) => {
      invoke("write_pty", { id, data }).catch(() => {});
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    ro.observe(el);

    return () => {
      unlistenPromise.then((f) => f());
      onDataDisposable.dispose();
      ro.disconnect();
      window.clearInterval(sessionDetector);
      invoke("kill_pty", { id }).catch(() => {});
      term.dispose();
    };
  }, [id, agentId, cmd, argsKey, cwd]);

  return <div ref={containerRef} className="terminal-pane-container" />;
}
