import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeState } from "../../session-state/service.js";
import { buildStateFromPayload, readPriorTurns } from "../state-shape.js";

async function readPriorState(stateDir, sessionId) {
  try {
    const raw = await readFile(join(stateDir, `${sessionId}.json`), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function handleUserPromptSubmit(payload, options = {}) {
  const { stateDir, now = () => Date.now() } = options;

  const state = buildStateFromPayload(payload, now());
  if (state.sessionId === null) return;

  const prior = await readPriorState(stateDir, state.sessionId);
  state.turns = readPriorTurns(prior) + 1;
  if (prior && typeof prior.startedAt === "number") state.startedAt = prior.startedAt;

  await writeState(state.sessionId, state, stateDir);
}
