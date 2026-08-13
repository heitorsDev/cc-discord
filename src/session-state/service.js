import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function resolveStateDir() {
  return join(process.env.XDG_STATE_HOME ?? join(...["home", process.env.USER ?? "", ".local", "state"]), "cc-discord");
}

export async function writeState(sessionId, state, stateDir = resolveStateDir()) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, `${sessionId}.json`), JSON.stringify(state, null, 2));
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteState(sessionId, stateDir = resolveStateDir()) {
  const target = join(stateDir, `${sessionId}.json`);
  if (!(await fileExists(target))) return null;
  await rm(target);
  return { sessionId };
}
