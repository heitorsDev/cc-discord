import { loadConfig } from "../../config/service.js";
import { writeState } from "../../session-state/service.js";

export async function handleSessionStart(payload, options = {}) {
  const { stateDir, configPath, now = () => Date.now() } = options;

  if (configPath !== undefined) {
    let result;
    try {
      result = await loadConfig(configPath);
    } catch {
      return;
    }
    if (result.failedClosed) return;
    if (result.config.enabled !== true) return;
  }

  const sessionId = typeof payload?.session_id === "string" ? payload.session_id : null;
  if (sessionId === null) return;

  const timestamp = now();
  const state = {
    sessionId,
    cwd: typeof payload.cwd === "string" ? payload.cwd : null,
    transcriptPath: typeof payload.transcript_path === "string" ? payload.transcript_path : null,
    startedAt: timestamp,
    lastActivityAt: timestamp,
    model: typeof payload.model === "string" ? payload.model : null,
    turns: 0
  };

  await writeState(sessionId, state, stateDir);
}
