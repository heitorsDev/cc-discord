import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInstall } from "./install.js";
import { HOOK_EVENTS } from "../src/installer/settings.js";

const NODE_PATH = "/usr/bin/node-under-test";

async function makeTempRun() {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-bin-install-"));
  const settingsPath = join(dir, "settings.json");
  const installRoot = join(dir, "install-root");
  const packageRoot = join(dir, "package-root");

  // Minimal stand-in for the shipped package layout.
  await mkdir(join(packageRoot, "src", "hooks", "session-start"), { recursive: true });
  await mkdir(join(packageRoot, "src", "hooks", "user-prompt-submit"), { recursive: true });
  await mkdir(join(packageRoot, "src", "hooks", "session-end"), { recursive: true });
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  for (const { script } of HOOK_EVENTS) {
    await writeFile(join(packageRoot, "src", "hooks", script), "// hook\n", { mode: 0o644 });
  }
  await writeFile(join(packageRoot, "bin", "cc-discord-daemon.js"), "// daemon\n", { mode: 0o644 });

  return { dir, settingsPath, installRoot, packageRoot };
}

function run(options) {
  return runInstall({ nodePath: NODE_PATH, ...options });
}

test("runInstall copies hooks into the install root and registers all three events", async () => {
  const { dir, settingsPath, installRoot, packageRoot } = await makeTempRun();
  try {
    const result = await run({ settingsPath, installRoot, packageRoot });

    assert.equal(result.settingsPath, settingsPath);
    assert.equal(result.installRoot, installRoot);
    assert.equal(result.commandBase, join(installRoot, "src", "hooks") + "/");

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(written.hooks.SessionStart.length, 1);
    assert.equal(written.hooks.UserPromptSubmit.length, 1);
    assert.equal(written.hooks.SessionEnd.length, 1);

    const expected = `"${NODE_PATH}" "${join(installRoot, "src", "hooks", "session-start", "hook.js")}"`;
    assert.equal(written.hooks.SessionStart[0].hooks[0].command, expected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall marks the copied hook scripts and daemon as executable", async () => {
  const { dir, settingsPath, installRoot, packageRoot } = await makeTempRun();
  try {
    await run({ settingsPath, installRoot, packageRoot });

    for (const { script } of HOOK_EVENTS) {
      const mode = (await stat(join(installRoot, "src", "hooks", script))).mode & 0o777;
      assert.equal(mode, 0o755, `${script} should be executable`);
    }
    const daemonMode = (await stat(join(installRoot, "bin", "cc-discord-daemon.js"))).mode & 0o777;
    assert.equal(daemonMode, 0o755);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall points hooks at the install root, never at the current directory", async () => {
  const { dir, settingsPath, installRoot, packageRoot } = await makeTempRun();
  try {
    await run({ settingsPath, installRoot, packageRoot });

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    const command = written.hooks.SessionStart[0].hooks[0].command;
    assert.ok(command.includes(installRoot), "command should live under the install root");
    assert.ok(!command.includes(process.cwd()), "command must not depend on the install-time cwd");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall is idempotent across reruns against the same settings file", async () => {
  const { dir, settingsPath, installRoot, packageRoot } = await makeTempRun();
  try {
    await run({ settingsPath, installRoot, packageRoot });
    await run({ settingsPath, installRoot, packageRoot });

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(written.hooks.SessionStart.length, 1);
    assert.equal(written.hooks.UserPromptSubmit.length, 1);
    assert.equal(written.hooks.SessionEnd.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall repairs a stale cc-discord hook entry left by an earlier version", async () => {
  const { dir, settingsPath, installRoot, packageRoot } = await makeTempRun();
  try {
    const stale = "/home/someone/cc-discord/src/hooks/session-start/hook.js";
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "/usr/local/bin/other-tool" }] },
            { hooks: [{ type: "command", command: stale }] },
          ],
        },
      })
    );

    await run({ settingsPath, installRoot, packageRoot });

    const written = JSON.parse(await readFile(settingsPath, "utf8"));
    const commands = written.hooks.SessionStart.map((group) => group.hooks[0].command);
    assert.equal(commands.length, 2);
    assert.equal(commands[0], "/usr/local/bin/other-tool", "foreign hooks are preserved");
    assert.ok(!commands.includes(stale), "the stale entry is replaced, not duplicated");
    assert.ok(commands[1].startsWith(`"${NODE_PATH}"`), "the repaired entry runs through node");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstall skips copying when the package already is the install root", async () => {
  const { dir, settingsPath, packageRoot } = await makeTempRun();
  try {
    const result = await run({ settingsPath, installRoot: packageRoot, packageRoot });

    assert.equal(result.installRoot, packageRoot);
    await assert.doesNotReject(stat(join(packageRoot, "src", "hooks", "session-start", "hook.js")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
