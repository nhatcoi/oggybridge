import { useEffect, useRef, useState } from "react";
import { AgentPane, AGENTS, WorkspaceInfo } from "../App";
import TerminalPane from "./TerminalPane";
import "./PaneGrid.css";

interface Props {
  panes: AgentPane[];
  maxPerRow: number;
  workspace: WorkspaceInfo | null;
  onClose: (id: string) => void;
}

const DIVIDER_PX = 5;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PaneGrid({ panes, maxPerRow, workspace, onClose }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep ratios in sync as panes are added/removed
  useEffect(() => {
    setRatios((prev) => {
      const next: Record<string, number> = {};
      for (const p of panes) next[p.id] = prev[p.id] ?? 1;
      return next;
    });
  }, [panes]);

  if (panes.length === 0) {
    return (
      <div className="pane-empty">
        No agents open — add one from the sidebar.
      </div>
    );
  }

  const rows = chunk(panes, Math.max(1, maxPerRow));

  return (
    <div className="pane-grid-outer" ref={containerRef}>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="pane-row">
          {row.map((pane, colIdx) => {
            const agent = AGENTS.find((a) => a.id === pane.agentId);
            const isFocused = focused === pane.id;
            const ratio = ratios[pane.id] ?? 1;
            const nextPane = row[colIdx + 1];

            return (
              <div key={pane.id} style={{ display: "contents" }}>
                <div
                  className={`pane-wrapper${isFocused ? " focused" : ""}`}
                  style={{ flex: ratio }}
                  onMouseDown={() => setFocused(pane.id)}
                >
                  <div className="pane-titlebar">
                    <span className="pane-title">{pane.label}</span>
                    <button
                      className="pane-close"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onClose(pane.id); }}
                      title="Close pane"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="pane-terminal">
                    <TerminalPane
                      id={pane.id}
                      cmd={agent?.cmd || undefined}
                      cwd={workspace?.path}
                    />
                  </div>
                </div>

                {nextPane && (
                  <Divider
                    leftId={pane.id}
                    rightId={nextPane.id}
                    ratios={ratios}
                    containerRef={containerRef}
                    setRatios={setRatios}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────

interface DividerProps {
  leftId: string;
  rightId: string;
  ratios: Record<string, number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setRatios: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

function Divider({ leftId, rightId, ratios, containerRef, setRatios }: DividerProps) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const containerWidth = (containerRef.current?.offsetWidth ?? 400) - DIVIDER_PX;
    const snapLeft = ratios[leftId] ?? 1;
    const snapRight = ratios[rightId] ?? 1;
    const totalRatioSum = Object.values(ratios).reduce((a, b) => a + b, 0);
    const pxPerRatio = containerWidth / totalRatioSum;

    const onMove = (me: PointerEvent) => {
      const deltaRatio = (me.clientX - startX) / pxPerRatio;
      const newLeft = Math.max(0.1, snapLeft + deltaRatio);
      const newRight = Math.max(0.1, snapLeft + snapRight - newLeft);
      setRatios((prev) => ({ ...prev, [leftId]: newLeft, [rightId]: newRight }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return <div className="pane-divider" onPointerDown={onPointerDown} />;
}
