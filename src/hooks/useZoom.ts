import { useState, useEffect, useCallback, useRef } from "react";

export const ZOOM_STEP = 0.1;
export const ZOOM_MIN  = 0.5;
export const ZOOM_MAX  = 2.0;
export const ZOOM_DEFAULT = 1.0;

export function clampZoom(v: number): number {
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
  (document.body.style as any).zoom = String(level);
}

export function useZoom(zoomLevel: number, onSave: (level: number) => void) {
  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyZoom(zoomLevel);
  }, [zoomLevel]);

  const changeZoom = useCallback((next: number) => {
    const clamped = clampZoom(next);
    onSave(clamped);
    setShowIndicator(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowIndicator(false), 1500);
  }, [onSave]);

  const zoomIn    = useCallback(() => changeZoom(zoomLevel + ZOOM_STEP), [zoomLevel, changeZoom]);
  const zoomOut   = useCallback(() => changeZoom(zoomLevel - ZOOM_STEP), [zoomLevel, changeZoom]);
  const zoomReset = useCallback(() => changeZoom(ZOOM_DEFAULT),           [changeZoom]);

  return { zoomIn, zoomOut, zoomReset, showIndicator };
}
