import { Keybinding } from "./types";

export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function matchesBinding(e: KeyboardEvent, b: Keybinding): boolean {
  return (
    e.key.toLowerCase() === b.key.toLowerCase() &&
    (e.metaKey || e.ctrlKey) === b.mod &&
    !!e.shiftKey === !!b.shift &&
    !!e.altKey === !!b.alt
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function formatBinding(b: Keybinding): string {
  const parts: string[] = [];
  if (b.mod)   parts.push(isMac ? "⌘" : "Ctrl");
  if (b.shift) parts.push(isMac ? "⇧" : "Shift");
  if (b.alt)   parts.push(isMac ? "⌥" : "Alt");
  // = key is labeled + in most UIs
  parts.push(b.key === "=" ? "+" : b.key.length === 1 ? b.key.toUpperCase() : b.key);
  return isMac ? parts.join("") : parts.join("+");
}
