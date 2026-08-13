export const HOOK_MARKER = "cc-discord/hooks/";

export const HOOK_EVENTS = Object.freeze([
  { event: "SessionStart", script: "session-start/hook.js" },
  { event: "UserPromptSubmit", script: "user-prompt-submit/hook.js" },
  { event: "SessionEnd", script: "session-end/hook.js" },
]);

function buildGroup(event, commandBase) {
  const script = HOOK_EVENTS.find((entry) => entry.event === event).script;
  return {
    hooks: [{ type: "command", command: `${commandBase}${script}` }],
  };
}

export async function mergeHooks(settingsPath, options = {}) {
  const { commandBase = "", dryRun = false } = options;
  const settings = {};

  settings.hooks = {};
  for (const { event } of HOOK_EVENTS) {
    settings.hooks[event] = [buildGroup(event, commandBase)];
  }

  if (dryRun) return settings;
  return settings;
}
