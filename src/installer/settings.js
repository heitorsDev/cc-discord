import { homedir } from "node:os";
import { join } from "node:path";
import { rename, readFile, rm, writeFile } from "node:fs/promises";

export const HOOK_MARKER = "cc-discord/hooks/";

// Path shapes written by this and by earlier releases. Reruns must recognise
// every one of them, otherwise an upgrade appends a second entry instead of
// replacing the stale one.
const LEGACY_HOOK_MARKERS = Object.freeze([HOOK_MARKER, "cc-discord/src/hooks/"]);

const DEFAULT_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

export function resolveConfigHome() {
  return process.env.CLAUDE_CONFIG_HOME ?? join(homedir(), ".claude");
}

export function resolveSettingsPath() {
  return join(resolveConfigHome(), "settings.json");
}

export function defaultSettingsPath() {
  return DEFAULT_SETTINGS_PATH;
}

export const HOOK_EVENTS = Object.freeze([
  { event: "SessionStart", script: "session-start/hook.js" },
  { event: "UserPromptSubmit", script: "user-prompt-submit/hook.js" },
  { event: "SessionEnd", script: "session-end/hook.js" },
]);

function stripJsoncComments(input) {
  let result = "";
  let i = 0;
  const n = input.length;
  let inString = false;
  while (i < n) {
    const ch = input[i];
    const next = i + 1 < n ? input[i + 1] : "";
    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < n) {
        result += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

function parseSettings(raw) {
  const stripped = stripJsoncComments(raw);
  if (stripped.trim() === "") return {};
  return JSON.parse(stripped);
}

/**
 * Hook commands run through an explicit node binary rather than relying on the
 * script's own shebang and executable bit: the hook shell does not inherit a
 * version-manager PATH, and a bare script path fails with "permission denied".
 */
export function buildHookCommand(script, commandBase, nodePath) {
  const scriptPath = `${commandBase}${script}`;
  return nodePath ? `"${nodePath}" "${scriptPath}"` : `"${scriptPath}"`;
}

function buildGroup(script, commandBase, nodePath) {
  return {
    hooks: [{ type: "command", command: buildHookCommand(script, commandBase, nodePath) }],
  };
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function commandHasMarker(command, commandBase) {
  if (typeof command !== "string") return false;
  const normalized = normalizePath(command);
  // A custom install root need not contain "cc-discord" anywhere, so the
  // current commandBase counts as a marker in its own right.
  if (commandBase && normalized.includes(normalizePath(commandBase))) return true;
  return LEGACY_HOOK_MARKERS.some((marker) => normalized.includes(marker));
}

function groupHasMarker(group, commandBase) {
  if (!group || !Array.isArray(group.hooks)) return false;
  return group.hooks.some((hook) => hook && commandHasMarker(hook.command, commandBase));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readSettings(settingsPath) {
  const raw = await readFile(settingsPath, "utf8");
  return parseSettings(raw);
}

export function buildMergedSettings(existing, commandBase, nodePath) {
  const base = isPlainObject(existing) ? existing : {};
  const hooks = isPlainObject(base.hooks) ? { ...base.hooks } : {};

  for (const { event, script } of HOOK_EVENTS) {
    const existingArray = Array.isArray(hooks[event]) ? hooks[event] : [];
    const withoutOurs = existingArray.filter((group) => !groupHasMarker(group, commandBase));
    hooks[event] = [...withoutOurs, buildGroup(script, commandBase, nodePath)];
  }

  return { ...base, hooks };
}

export async function mergeHooks(settingsPath, options = {}) {
  const { commandBase = "", nodePath, dryRun = false } = options;
  let existing = {};
  try {
    existing = await readSettings(settingsPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const merged = buildMergedSettings(existing, commandBase, nodePath);

  if (dryRun) return merged;
  await writeAtomicJson(settingsPath, merged);
  return merged;
}

async function writeAtomicJson(settingsPath, data) {
  const tmpPath = `${settingsPath}.tmp`;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await writeFile(tmpPath, body);
    await rename(tmpPath, settingsPath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}
