import { loadConfig } from "../../config/service.js";
import { writeState } from "../../session-state/service.js";
import { buildStateFromPayload } from "../state-shape.js";

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

  const state = buildStateFromPayload(payload, now());
  if (state.sessionId === null) return;

  await writeState(state.sessionId, state, stateDir);
}
