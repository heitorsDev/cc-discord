import { deleteState } from "../../session-state/service.js";

export async function handleSessionEnd(payload, options = {}) {
  const { stateDir } = options;
  const sessionId = typeof payload?.session_id === "string" ? payload.session_id : null;
  if (sessionId === null) return;

  await deleteState(sessionId, stateDir);
}
