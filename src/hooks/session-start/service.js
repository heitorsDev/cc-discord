import { writeState } from "../../session-state/service.js";

export async function handleSessionStart(payload, options = {}) {
  const { stateDir, now = () => Date.now() } = options;
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
