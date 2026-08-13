import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function resolveStateDir() {
  return join(process.env.XDG_STATE_HOME ?? join(...["home", process.env.USER ?? "", ".local", "state"]), "cc-discord");
}

function stateFileName(sessionId) {
  return `${sessionId}.json`;
}

function stateFilePath(sessionId, stateDir) {
  return join(stateDir, stateFileName(sessionId));
}

export async function writeState(sessionId, state, stateDir = resolveStateDir()) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFilePath(sessionId, stateDir), JSON.stringify(state, null, 2));
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
  const target = stateFilePath(sessionId, stateDir);
  if (!(await fileExists(target))) return null;
  await rm(target);
  return { sessionId };
}

export async function listState(stateDir = resolveStateDir()) {
  const entries = await readdir(stateDir).catch(() => []);
  const states = await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const raw = await readFile(join(stateDir, name), "utf8").catch(() => null);
        if (raw === null) return null;
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || typeof parsed.sessionId !== "string") return null;
          return parsed;
        } catch {
          return null;
        }
      })
  );
  return states.filter((s) => s !== null);
}

export async function selectActive(stateDir = resolveStateDir()) {
  const entries = await readdir(stateDir).catch(() => []);
  const candidates = (
    await Promise.all(
      entries
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const path = join(stateDir, name);
          const raw = await readFile(path, "utf8").catch(() => null);
          if (raw === null) return null;
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return null;
          }
          if (!parsed || typeof parsed !== "object" || typeof parsed.sessionId !== "string") return null;
          const stats = await stat(path).catch(() => null);
          if (!stats) return null;
          return { state: parsed, mtime: stats.mtimeMs };
        })
    )
  ).filter((c) => c !== null);

  if (candidates.length === 0) return { state: null, otherCount: 0 };

  candidates.sort((a, b) => b.mtime - a.mtime);
  const [head, ...rest] = candidates;
  return { state: head.state, otherCount: rest.length };
}
