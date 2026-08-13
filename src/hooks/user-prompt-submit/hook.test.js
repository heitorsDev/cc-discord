import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import * as hookModule from "./hook.js";

test("importing user-prompt-submit hook.js does not execute its body", async () => {
  await import(`./hook.js?probe=${Date.now()}`);
  const exportedKeys = Object.keys(hookModule);
  assert.deepEqual(exportedKeys, []);
});

async function spawnHook(stdinPayload, env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(import.meta.dirname, "hook.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env } }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdinPayload !== undefined) {
      child.stdin.end(stdinPayload);
    } else {
      child.stdin.end();
    }
  });
}

async function withTempState(fn) {
  const stateHome = await mkdtemp(join(tmpdir(), "cc-discord-ups-state-"));
  try {
    return await fn(stateHome);
  } finally {
    await rm(stateHome, { recursive: true, force: true });
  }
}

test("user-prompt-submit hook.js exits 0 and writes nothing for empty stdin", async () => {
  await withTempState(async (stateHome) => {
    const result = await spawnHook("", { XDG_STATE_HOME: stateHome });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(join(stateHome, "cc-discord")).catch(() => []);
    assert.deepEqual(entries, []);
  });
});

test("user-prompt-submit hook.js tolerates malformed JSON stdin without throwing", async () => {
  await withTempState(async (stateHome) => {
    const result = await spawnHook("{not json", { XDG_STATE_HOME: stateHome });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(join(stateHome, "cc-discord")).catch(() => []);
    assert.deepEqual(entries, []);
  });
});
