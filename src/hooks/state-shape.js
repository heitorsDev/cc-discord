function readString(value) {
  return typeof value === "string" ? value : null;
}

export function buildStateFromPayload(payload, timestamp) {
  return {
    sessionId: readString(payload?.session_id),
    cwd: readString(payload?.cwd),
    transcriptPath: readString(payload?.transcript_path),
    startedAt: timestamp,
    lastActivityAt: timestamp,
    model: readString(payload?.model),
    turns: 0
  };
}

export function readPriorTurns(state) {
  if (state === null) return 0;
  if (typeof state.turns !== "number") return 0;
  return state.turns;
}
