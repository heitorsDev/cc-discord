import { rename, readFile, rm, writeFile } from "node:fs/promises";

export const HOOK_MARKER = "cc-discord/hooks/";

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

function buildGroup(script, commandBase) {
  return {
    hooks: [{ type: "command", command: `${commandBase}${script}` }],
  };
}

function groupHasMarker(group) {
  if (!group || !Array.isArray(group.hooks)) return false;
  return group.hooks.some(
    (hook) => hook && typeof hook.command === "string" && hook.command.includes(HOOK_MARKER)
  );
}

function arrayHasMarker(array) {
  if (!Array.isArray(array)) return false;
  return array.some(groupHasMarker);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readSettings(settingsPath) {
  const raw = await readFile(settingsPath, "utf8");
  return parseSettings(raw);
}

export function buildMergedSettings(existing, commandBase) {
  const base = isPlainObject(existing) ? existing : {};
  const hooks = isPlainObject(base.hooks) ? { ...base.hooks } : {};

  for (const { event, script } of HOOK_EVENTS) {
    const existingArray = Array.isArray(hooks[event]) ? hooks[event] : [];
    if (arrayHasMarker(existingArray)) continue;
    hooks[event] = [...existingArray, buildGroup(script, commandBase)];
  }

  return { ...base, hooks };
}

export async function mergeHooks(settingsPath, options = {}) {
  const { commandBase = "", dryRun = false } = options;
  let existing = {};
  try {
    existing = await readSettings(settingsPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const merged = buildMergedSettings(existing, commandBase);

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
