import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import * as hookModule from "./hook.js";

test("importing session-start hook.js does not execute its body", async () => {
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

async function withTempDirs(fn) {
  const stateDir = await mkdtemp(join(tmpdir(), "cc-discord-session-start-state-"));
  const configDir = await mkdtemp(join(tmpdir(), "cc-discord-session-start-cfg-"));
  try {
    return await fn({ stateDir, configDir });
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
}

test("session-start hook.js exits 0 and writes state when given a valid payload", async () => {
  await withTempDirs(async ({ stateDir, configDir }) => {
    const payload = JSON.stringify({
      session_id: "sess-spawn",
      cwd: "/tmp",
      transcript_path: "/tmp/transcript.jsonl",
      model: "opus"
    });

    const result = await spawnHook(payload, {
      XDG_STATE_HOME: stateDir,
      XDG_CONFIG_HOME: configDir
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(stateDir);
    assert.deepEqual(entries, ["sess-spawn.json"]);
  });
});

test("session-start hook.js tolerates empty stdin without throwing", async () => {
  await withTempDirs(async ({ stateDir, configDir }) => {
    const result = await spawnHook("", {
      XDG_STATE_HOME: stateDir,
      XDG_CONFIG_HOME: configDir
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(stateDir).catch(() => []);
    assert.deepEqual(entries, []);
  });
});

test("session-start hook.js tolerates malformed JSON stdin without throwing", async () => {
  await withTempDirs(async ({ stateDir, configDir }) => {
    const result = await spawnHook("{not json", {
      XDG_STATE_HOME: stateDir,
      XDG_CONFIG_HOME: configDir
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(stateDir).catch(() => []);
    assert.deepEqual(entries, []);
  });
});
