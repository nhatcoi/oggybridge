import { useState, useEffect, useCallback, useRef } from "react";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_DEFAULT = 1.0;
const STORAGE_KEY = "zoomLevel";

function clamp(v: number): number {
  return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v)) * 10) / 10;
}

async function applyZoom(level: number) {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      await getCurrentWebviewWindow().setZoom(level);
      return;
    } catch {}
  }
  // Fallback for browser dev mode
  (document.body.style as any).zoom = String(level);
}

export function useZoom() {
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? clamp(parseFloat(s)) : ZOOM_DEFAULT;
    } catch {
      return ZOOM_DEFAULT;
    }
  });

  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyZoom(zoomLevel);
  }, []);

  const setZoom = useCallback(async (level: number) => {
    const next = clamp(level);
    setZoomLevel(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    await applyZoom(next);

    setShowIndicator(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowIndicator(false), 1500);
  }, []);

  const zoomIn    = useCallback(() => setZoom(zoomLevel + ZOOM_STEP), [zoomLevel, setZoom]);
  const zoomOut   = useCallback(() => setZoom(zoomLevel - ZOOM_STEP), [zoomLevel, setZoom]);
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT),           [setZoom]);

  return { zoomLevel, zoomIn, zoomOut, zoomReset, showIndicator };
}
