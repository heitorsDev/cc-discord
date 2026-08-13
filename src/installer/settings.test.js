import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOOK_MARKER, mergeHooks } from "./settings.js";

async function tempSettingsPath() {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-installer-"));
  return { dir, settingsPath: join(dir, "settings.json") };
}

async function writeJson(path, data) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

test("mergeHooks adds all three event entries to a fresh settings file", async () => {
  const { dir, settingsPath } = await tempSettingsPath();
  try {
    const result = await mergeHooks(settingsPath, { commandBase: "/opt/cc-discord/hooks/" });

    const hooks = result.hooks ?? {};
    assert.ok(Array.isArray(hooks.SessionStart));
    assert.ok(Array.isArray(hooks.UserPromptSubmit));
    assert.ok(Array.isArray(hooks.SessionEnd));

    const sessions = hooks.SessionStart;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].hooks.length, 1);
    assert.equal(sessions[0].hooks[0].type, "command");
    assert.ok(sessions[0].hooks[0].command.includes(HOOK_MARKER));
    assert.ok(sessions[0].hooks[0].command.includes("session-start/hook.js"));
    assert.ok(hooks.UserPromptSubmit[0].hooks[0].command.includes("user-prompt-submit/hook.js"));
    assert.ok(hooks.SessionEnd[0].hooks[0].command.includes("session-end/hook.js"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mergeHooks is idempotent when marker is already present", async () => {
  const { dir, settingsPath } = await tempSettingsPath();
  try {
    const existingCommand = "/home/user/.local/share/cc-discord/hooks/session-start/hook.js";
    await writeJson(settingsPath, {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: existingCommand }] }],
      },
    });

    const result = await mergeHooks(settingsPath, { commandBase: "/opt/cc-discord/hooks/" });

    assert.equal(result.hooks.SessionStart.length, 1);
    assert.equal(result.hooks.SessionStart[0].hooks[0].command, existingCommand);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mergeHooks preserves unrelated hook entries and appends ours", async () => {
  const { dir, settingsPath } = await tempSettingsPath();
  try {
    await writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "/usr/local/bin/other-tool/start.sh" }] },
        ],
        Stop: [
          { hooks: [{ type: "command", command: "/usr/local/bin/other-tool/stop.sh" }] },
        ],
      },
    });

    const result = await mergeHooks(settingsPath, { commandBase: "/opt/cc-discord/hooks/" });

    assert.equal(result.hooks.SessionStart.length, 2);
    assert.equal(result.hooks.SessionStart[0].hooks[0].command, "/usr/local/bin/other-tool/start.sh");
    assert.ok(result.hooks.SessionStart[1].hooks[0].command.includes(HOOK_MARKER));
    assert.equal(result.hooks.SessionEnd.length, 1);
    assert.equal(result.hooks.UserPromptSubmit.length, 1);
    assert.equal(result.hooks.Stop.length, 1);
    assert.equal(result.hooks.Stop[0].hooks[0].command, "/usr/local/bin/other-tool/stop.sh");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mergeHooks reads JSONC with line and block comments then writes plain JSON", async () => {
  const { dir, settingsPath } = await tempSettingsPath();
  try {
    const source = [
      "// my personal settings",
      "{",
      "  /* keep me */",
      "  \"hooks\": {",
      "    // keep this entry",
      "    \"Stop\": [{\"hooks\":[{\"type\":\"command\",\"command\":\"/bin/stop\"}]}]",
      "  }",
      "  , \"theme\": \"dark\"",
      "}",
      "",
    ].join("\n");
    await writeFile(settingsPath, source);

    const result = await mergeHooks(settingsPath, { commandBase: "/opt/cc-discord/hooks/", dryRun: true });

    assert.equal(result.theme, "dark");
    assert.equal(result.hooks.Stop.length, 1);
    assert.equal(result.hooks.Stop[0].hooks[0].command, "/bin/stop");
    assert.equal(result.hooks.SessionStart.length, 1);
    assert.equal(result.hooks.UserPromptSubmit.length, 1);
    assert.equal(result.hooks.SessionEnd.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mergeHooks does not strip comment-like sequences inside string values", async () => {
  const { dir, settingsPath } = await tempSettingsPath();
  try {
    await writeJson(settingsPath, {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "/bin/stop // not a comment" }] }],
      },
    });

    const result = await mergeHooks(settingsPath, { commandBase: "/opt/cc-discord/hooks/", dryRun: true });

    assert.equal(result.hooks.Stop[0].hooks[0].command, "/bin/stop // not a comment");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
