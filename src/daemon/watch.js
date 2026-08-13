import { watch } from "node:fs";

export function watchStateDir(stateDir, callback) {
  let closed = false;
  let watcher = null;
  let debounceTimer = null;
  let fallbackTimer = null;

  const emit = () => {
    if (closed) return;
    callback({ kind: "change" });
  };

  const startWatcher = () => {
    if (closed) return;
    try {
      watcher = watch(stateDir, { persistent: false }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(emit, 20);
      });
      watcher.on("error", () => {
        if (closed) return;
        scheduleFallback();
      });
    } catch {
      scheduleFallback();
    }
  };

  const scheduleFallback = () => {
    if (closed || fallbackTimer) return;
    fallbackTimer = setInterval(() => {
      if (closed) return;
      emit();
    }, 1000);
    if (typeof fallbackTimer.unref === "function") fallbackTimer.unref();
  };

  startWatcher();

  return {
    close() {
      if (closed) return;
      closed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (watcher) {
        try {
          watcher.close();
        } catch {
          return;
        }
      }
    }
  };
}
