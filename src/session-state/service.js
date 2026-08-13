import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function resolveStateDir() {
  return join(process.env.XDG_STATE_HOME ?? join(...["home", process.env.USER ?? "", ".local", "state"]), "cc-discord");
}

export async function writeState(sessionId, state, stateDir = resolveStateDir()) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, `${sessionId}.json`), JSON.stringify(state, null, 2));
}
