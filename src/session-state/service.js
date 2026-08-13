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

function isValidState(value) {
  return Boolean(value) && typeof value === "object" && typeof value.sessionId === "string";
}

async function readStateFile(name, stateDir) {
  const path = join(stateDir, name);
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidState(parsed)) return null;
  const stats = await stat(path).catch(() => null);
  if (!stats) return null;
  return { state: parsed, mtimeMs: stats.mtimeMs };
}

async function readValidStates(stateDir) {
  const entries = await readdir(stateDir).catch(() => []);
  const candidates = await Promise.all(
    entries.filter((name) => name.endsWith(".json")).map((name) => readStateFile(name, stateDir))
  );
  return candidates.filter((c) => c !== null);
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
  const candidates = await readValidStates(stateDir);
  return candidates.map((c) => c.state);
}

export async function selectActive(stateDir = resolveStateDir()) {
  const candidates = await readValidStates(stateDir);
  if (candidates.length === 0) return { state: null, otherCount: 0 };
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const [head, ...rest] = candidates;
  return { state: head.state, otherCount: rest.length };
}
