import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as hookModule from "./hook.js";
import { spawnHook } from "../spawn-hook.js";

const HOOK_DIR = import.meta.dirname;

test("importing session-start hook.js does not execute its body", async () => {
  await import(`./hook.js?probe=${Date.now()}`);
  const exportedKeys = Object.keys(hookModule);
  assert.deepEqual(exportedKeys, []);
});

async function withTempDirs(fn) {
  const stateHome = await mkdtemp(join(tmpdir(), "cc-discord-session-start-state-"));
  const configHome = await mkdtemp(join(tmpdir(), "cc-discord-session-start-cfg-"));
  try {
    return await fn({ stateHome, configHome });
  } finally {
    await rm(stateHome, { recursive: true, force: true });
    await rm(configHome, { recursive: true, force: true });
  }
}

test("session-start hook.js exits 0 and writes state when given a valid payload", async () => {
  await withTempDirs(async ({ stateHome, configHome }) => {
    const payload = JSON.stringify({
      session_id: "sess-spawn",
      cwd: "/tmp",
      transcript_path: "/tmp/transcript.jsonl",
      model: "opus"
    });

    const result = await spawnHook(
      payload,
      {
        XDG_STATE_HOME: stateHome,
        XDG_CONFIG_HOME: configHome
      },
      { hookDir: HOOK_DIR }
    );

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(join(stateHome, "cc-discord"));
    assert.deepEqual(entries, ["sess-spawn.json"]);
  });
});

test("session-start hook.js tolerates empty stdin without throwing", async () => {
  await withTempDirs(async ({ stateHome, configHome }) => {
    const result = await spawnHook(
      "",
      {
        XDG_STATE_HOME: stateHome,
        XDG_CONFIG_HOME: configHome
      },
      { hookDir: HOOK_DIR }
    );

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(join(stateHome, "cc-discord")).catch(() => []);
    assert.deepEqual(entries, []);
  });
});

test("session-start hook.js tolerates malformed JSON stdin without throwing", async () => {
  await withTempDirs(async ({ stateHome, configHome }) => {
    const result = await spawnHook(
      "{not json",
      {
        XDG_STATE_HOME: stateHome,
        XDG_CONFIG_HOME: configHome
      },
      { hookDir: HOOK_DIR }
    );

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    const entries = await readdir(join(stateHome, "cc-discord")).catch(() => []);
    assert.deepEqual(entries, []);
  });
});
