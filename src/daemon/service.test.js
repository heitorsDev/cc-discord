import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTick } from "./service.js";

const noopAsync = async () => undefined;
const noConnect = async () => null;

async function withStateDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-run-tick-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withConfigDir(contents, fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-run-tick-cfg-"));
  const configPath = join(dir, "config.json");
  const { writeFile } = await import("node:fs/promises");
  if (contents !== null) await writeFile(configPath, contents);
  try {
    return await fn(configPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("runTick returns shouldExit when no active session exists", async () => {
  await withStateDir(async (stateDir) => {
    await withConfigDir(JSON.stringify({ discord: { appId: "12345" } }), async (configPath) => {
      const result = await runTick({
        stateDir,
        configPath,
        connect: noConnect,
        sendActivity: noopAsync,
        sendHandshake: noopAsync,
        readTranscript: async () => ({ title: null, latestPrompt: null }),
        loadConfig: async () => ({ config: {}, appIdMissing: false, failedClosed: false }),
        now: () => 1_700_000_000_000
      });
      assert.equal(result.shouldExit, true);
      assert.equal(result.activeSession, null);
      assert.equal(result.otherCount, 0);
      assert.equal(result.published, false);
      assert.equal(result.activity, null);
    });
  });
});

test("runTick returns appIdMissing error when config has no appId", async () => {
  await withStateDir(async (stateDir) => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "sess-a.json"), JSON.stringify({
      sessionId: "sess-a",
      cwd: "/home/user/project",
      transcriptPath: "/tmp/transcript.jsonl",
      startedAt: 1_700_000_000_000,
      lastActivityAt: 1_700_000_000_000,
      model: "claude-opus",
      turns: 1
    }));
    const configDir = await import("node:fs/promises").then((m) => m.mkdtemp(join(tmpdir(), "cc-discord-appid-")));
    const configPath = join(configDir, "config.json");
    await writeFile(configPath, "{}");
    try {
      let sendActivityCalls = 0;
      let handshakeCalls = 0;
      const result = await runTick({
        stateDir,
        configPath,
        connect: noConnect,
        sendActivity: async () => { sendActivityCalls++; },
        sendHandshake: async () => { handshakeCalls++; },
        readTranscript: async () => ({ title: null, latestPrompt: null }),
        now: () => 1_700_000_000_000
      });
      assert.equal(result.shouldExit, true);
      assert.equal(result.error, "appIdMissing");
      assert.equal(result.published, false);
      assert.equal(result.activeSession, "sess-a");
      assert.equal(sendActivityCalls, 0);
      assert.equal(handshakeCalls, 0);
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
