import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, DEFAULT_SETTINGS, DEFAULT_KEYBINDINGS } from "../types";
import { normalizeLocale } from "../i18n";

const COLOR_MAP: Record<AppSettings["accentColor"], string> = {
  blue:    "#58a6ff",
  green:   "#3fb950",
  orange:  "#ff7b72",
  purple:  "#bc8cff",
  magenta: "#ff5e97",
};

const FONT_FAMILIES: Record<AppSettings["fontFamily"], string> = {
  jetbrains: '"JetBrains Mono", "Fira Code", monospace',
  fira:      '"Fira Code", monospace',
  system:    "monospace",
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const applySettings = useCallback((cfg: AppSettings) => {
    document.documentElement.style.setProperty("--accent-primary", COLOR_MAP[cfg.accentColor] ?? COLOR_MAP.blue);
    document.documentElement.setAttribute("data-theme", cfg.theme);
    document.documentElement.setAttribute("lang", cfg.locale);
    document.documentElement.style.setProperty("--terminal-font-size", `${cfg.fontSize}px`);
    document.documentElement.style.setProperty("--terminal-font-family", FONT_FAMILIES[cfg.fontFamily]);
  }, []);

  const saveSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    applySettings(newSettings);
    if (!("__TAURI_INTERNALS__" in window)) return;
    invoke("write_settings", { settings: JSON.stringify(newSettings) })
      .catch((e) => console.error("Failed to write settings:", e));
  }, [applySettings]);

  useEffect(() => {
    applySettings(DEFAULT_SETTINGS);
    if (!("__TAURI_INTERNALS__" in window)) return;
    invoke<string>("read_settings")
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          const loaded: AppSettings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            locale: normalizeLocale(parsed.locale),
            keybindings: { ...DEFAULT_KEYBINDINGS, ...(parsed.keybindings ?? {}) },
          };
          setSettings(loaded);
          applySettings(loaded);
        } catch {}
      })
      .catch((e) => console.error("Failed to read settings:", e));
  }, [applySettings]);

  return { settings, saveSettings };
}
