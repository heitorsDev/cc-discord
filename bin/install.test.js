import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInstall } from "./install.js";

async function makeTempRun() {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-bin-install-"));
  const settingsPath = join(dir, "settings.json");
  const commandBase = join(dir, "cc-discord", "hooks") + "/";
  return { dir, settingsPath, commandBase };
}

test("runInstall end-to-end writes the three hook entries against a temp settings file", async () => {
  const { dir, settingsPath, commandBase } = await makeTempRun();
  try {
    const result = await runInstall({
      settingsPath,
      commandBase,
      srcDir: join(dir, "src-hooks-that-dont-exist"),
    });

    assert.equal(result.settingsPath, settingsPath);
    assert.equal(result.commandBase, commandBase);

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(written.hooks.SessionStart.length, 1);
    assert.equal(written.hooks.UserPromptSubmit.length, 1);
    assert.equal(written.hooks.SessionEnd.length, 1);
    assert.equal(written.hooks.SessionStart[0].hooks[0].command, `${commandBase}session-start/hook.js`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall is idempotent across reruns against the same settings file", async () => {
  const { dir, settingsPath, commandBase } = await makeTempRun();
  try {
    await runInstall({ settingsPath, commandBase, srcDir: dir });
    await runInstall({ settingsPath, commandBase, srcDir: dir });

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(written.hooks.SessionStart.length, 1);
    assert.equal(written.hooks.UserPromptSubmit.length, 1);
    assert.equal(written.hooks.SessionEnd.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

