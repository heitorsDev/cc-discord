export const HOOK_MARKER = "cc-discord/hooks/";

export const HOOK_EVENTS = Object.freeze([
  { event: "SessionStart", script: "session-start/hook.js" },
  { event: "UserPromptSubmit", script: "user-prompt-submit/hook.js" },
  { event: "SessionEnd", script: "session-end/hook.js" },
]);

export async function mergeHooks(settingsPath, options = {}) {
  return { hooks: {} };
}
