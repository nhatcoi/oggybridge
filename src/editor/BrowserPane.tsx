import { useState } from "react";

function normalize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) || trimmed.startsWith("about:")) return trimmed;
  return `http://${trimmed}`;
}

export default function BrowserPane() {
  const [input, setInput] = useState("http://localhost:5173");
  const [src, setSrc] = useState("http://localhost:5173");

  return (
    <div className="browser-pane">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setSrc(normalize(input));
        }}
      >
        <input
          className="browser-url-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://localhost:5173"
        />
        <button className="browser-go-btn" type="submit">Go</button>
      </form>
      <iframe className="browser-frame" src={src} title="Browser" />
    </div>
  );
}
