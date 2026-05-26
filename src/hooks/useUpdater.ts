import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update && active) setUpdateAvailable(update);
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const applyUpdate = async () => {
    if (!updateAvailable) return;
    setUpdating(true);
    try {
      await updateAvailable.downloadAndInstall();
      await relaunch();
    } catch (err) {
      alert(`Update failed: ${err}`);
      setUpdating(false);
    }
  };

  const dismissUpdate = () => setUpdateAvailable(null);

  return { updateAvailable, updating, applyUpdate, dismissUpdate };
}
