import { useEffect, useRef, useState } from "react";
import { Search } from "./Icons";
import "../styles/CommandPalette.css";

export interface Command {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ isOpen, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => filtered.length > 0 ? (p + 1) % filtered.length : 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => filtered.length > 0 ? (p - 1 + filtered.length) % filtered.length : 0); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[selectedIndex]) { filtered[selectedIndex].action(); onClose(); } }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-container" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrapper">
          <Search size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
        </div>
        <div className="palette-list">
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`palette-item ${i === selectedIndex ? "selected" : ""}`}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="palette-item-left">
                <span className="palette-item-icon">{cmd.icon}</span>
                <span className="palette-item-label">{cmd.label}</span>
              </div>
              {cmd.shortcut && <span className="palette-item-shortcut">{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-empty">No results found.</div>}
        </div>
      </div>
    </div>
  );
}
