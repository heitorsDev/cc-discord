import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTick, runLoop } from "./service.js";
import { RATE_LIMIT_MS } from "../vendors/discord.js";

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

async function writeActiveSession(stateDir, sessionId, { cwd = "/home/user/project", turns = 3 } = {}) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, `${sessionId}.json`), JSON.stringify({
    sessionId,
    cwd,
    transcriptPath: "/tmp/transcript.jsonl",
    startedAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_000_000,
    model: "claude-opus",
    turns
  }));
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

test("runTick builds activity and publishes on active session", async () => {
  await withStateDir(async (stateDir) => {
    await writeActiveSession(stateDir, "sess-a");
    await withConfigDir(JSON.stringify({ discord: { appId: "12345" } }), async (configPath) => {
      let handshakeCalls = 0;
      let sendActivityCalls = 0;
      let publishedActivity = null;
      const fakeSocket = { _isFake: true };
      const result = await runTick({
        stateDir,
        configPath,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async (socket, appId) => {
          handshakeCalls++;
          assert.equal(socket, fakeSocket);
          assert.equal(appId, "12345");
        },
        sendActivity: async (socket, activity) => {
          sendActivityCalls++;
          assert.equal(socket, fakeSocket);
          publishedActivity = activity;
        },
        readTranscript: async () => ({ title: "Refactor daemon", latestPrompt: "ship it" }),
        now: () => 1_700_000_000_000
      });
      assert.equal(result.shouldExit, false);
      assert.equal(result.published, true);
      assert.equal(result.activeSession, "sess-a");
      assert.equal(result.otherCount, 0);
      assert.equal(handshakeCalls, 1);
      assert.equal(sendActivityCalls, 1);
      assert.notEqual(publishedActivity, null);
      assert.equal(publishedActivity.details, "Refactor daemon");
    });
  });
});

test("runTick re-reads config on each call so live edits take effect", async () => {
  await withStateDir(async (stateDir) => {
    await writeActiveSession(stateDir, "sess-a");
    const fakeSocket = { _isFake: true };
    const configDir = await mkdtemp(join(tmpdir(), "cc-discord-reread-"));
    const configPath = join(configDir, "config.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(configPath, JSON.stringify({ discord: { appId: "11111" }, display: { details: "first" } }));
    try {
      const handshakeAppIds = [];
      const tickOne = 1_700_000_000_000 + (RATE_LIMIT_MS + 100);
      await runTick({
        stateDir,
        configPath,
        lastPublishAt: 0,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async (_socket, appId) => { handshakeAppIds.push(appId); },
        sendActivity: async () => {},
        readTranscript: async () => ({ title: "T", latestPrompt: null }),
        now: () => tickOne
      });
      await writeFile(configPath, JSON.stringify({ discord: { appId: "22222" }, display: { details: "second" } }));
      const tickTwo = tickOne + RATE_LIMIT_MS + 100;
      await runTick({
        stateDir,
        configPath,
        lastPublishAt: tickOne,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async (_socket, appId) => { handshakeAppIds.push(appId); },
        sendActivity: async () => {},
        readTranscript: async () => ({ title: "T", latestPrompt: null }),
        now: () => tickTwo
      });
      assert.deepEqual(handshakeAppIds, ["11111", "22222"]);
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});

test("runTick reports otherCount when multiple sessions exist", async () => {
  await withStateDir(async (stateDir) => {
    await writeActiveSession(stateDir, "sess-a", { turns: 1 });
    const older = 1_700_000_000_000 - 60_000;
    const newer = 1_700_000_000_000;
    const { writeFile, utimes, mkdir } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "sess-b.json"), JSON.stringify({
      sessionId: "sess-b",
      cwd: "/home/user/older",
      transcriptPath: "/tmp/t-b.jsonl",
      startedAt: older,
      lastActivityAt: older,
      model: "claude-opus",
      turns: 2
    }));
    await utimes(join(stateDir, "sess-b.json"), new Date(older / 1000), new Date(older / 1000));
    await utimes(join(stateDir, "sess-a.json"), new Date(newer / 1000), new Date(newer / 1000));
    await withConfigDir(JSON.stringify({ discord: { appId: "12345" } }), async (configPath) => {
      const fakeSocket = { _isFake: true };
      let publishedTitle = null;
      const result = await runTick({
        stateDir,
        configPath,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async () => {},
        sendActivity: async (_socket, activity) => { publishedTitle = activity.details; },
        readTranscript: async () => ({ title: "Most recent", latestPrompt: null }),
        now: () => 1_700_000_000_000 + RATE_LIMIT_MS + 100
      });
      assert.equal(result.activeSession, "sess-a");
      assert.equal(result.otherCount, 1);
      assert.equal(publishedTitle, "Most recent");
    });
  });
});

test("runTick reads transcript here, not in hooks", async () => {
  await withStateDir(async (stateDir) => {
    await writeActiveSession(stateDir, "sess-a");
    await withConfigDir(JSON.stringify({ discord: { appId: "12345" } }), async (configPath) => {
      let transcriptPath = null;
      const fakeSocket = { _isFake: true };
      const result = await runTick({
        stateDir,
        configPath,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async () => {},
        sendActivity: async () => {},
        readTranscript: async (injectedPath) => {
          transcriptPath = injectedPath;
          return { title: "Read here", latestPrompt: "prompt text" };
        },
        now: () => 1_700_000_000_000 + RATE_LIMIT_MS + 100
      });
      assert.equal(transcriptPath, "/tmp/transcript.jsonl");
      assert.equal(result.activity.details, "Read here");
    });
  });
});

test("runTick renders idle when inactivity exceeds idleAfter", async () => {
  await withStateDir(async (stateDir) => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    const startedAt = 1_700_000_000_000;
    const lastActivityAt = startedAt;
    await writeFile(join(stateDir, "sess-a.json"), JSON.stringify({
      sessionId: "sess-a",
      cwd: "/home/user/project",
      transcriptPath: "/tmp/t.jsonl",
      startedAt,
      lastActivityAt,
      model: "claude-opus",
      turns: 1
    }));
    await withConfigDir(JSON.stringify({
      discord: { appId: "12345" },
      display: { idleAfter: "1s", idle: "Idle" }
    }), async (configPath) => {
      const fakeSocket = { _isFake: true };
      let published = null;
      const result = await runTick({
        stateDir,
        configPath,
        connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
        sendHandshake: async () => {},
        sendActivity: async (_socket, activity) => { published = activity; },
        readTranscript: async () => ({ title: "T", latestPrompt: null }),
        now: () => lastActivityAt + 60_000
      });
      assert.equal(result.shouldExit, false);
      assert.equal(result.published, true);
      assert.equal(published.details, "Idle");
      assert.equal(published.state, "Idle");
    });
  });
});

test("runLoop publishes when a state file appears, exits after grace period when it disappears", async () => {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const stateDir = await mkdtemp(join(tmpdir(), "cc-discord-loop-state-"));
  const configDir = await mkdtemp(join(tmpdir(), "cc-discord-loop-cfg-"));
  const configPath = join(configDir, "config.json");
  await writeFile(configPath, JSON.stringify({ discord: { appId: "12345" } }));
  await mkdir(stateDir, { recursive: true });
  try {
    // Realistic enough for the real keepalive and closeSocket to run against.
    const { EventEmitter } = await import("node:events");
    const fakeSocket = Object.assign(new EventEmitter(), {
      _isFake: true,
      destroyed: false,
      write() { return true; },
      resume() {},
      end() { this.destroyed = true; this.emit("close"); },
      destroy() { this.destroyed = true; this.emit("close"); }
    });
    const handshakeAppIds = [];
    const publishedAt = [];
    let loopStarted = false;
    const loopPromise = runLoop({
      stateDir,
      configPath,
      lockPath: join(stateDir, "cc-discord.lock"),
      gracePeriodMs: 100,
      rateLimitMs: 20,
      connect: async () => ({ socket: fakeSocket, kind: "native", path: "/tmp/fake" }),
      sendHandshake: async (_socket, appId) => {
        handshakeAppIds.push(appId);
      },
      sendActivity: async () => {
        publishedAt.push(Date.now());
      },
      watchStateDir: () => ({ close() {} }),
      acquireLock: () => {
        loopStarted = true;
        return { release() {} };
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(loopStarted, true, "loop should acquire lock at start");
    assert.equal(handshakeAppIds.length, 0, "no publishes before state file exists");
    await writeFile(join(stateDir, "sess-a.json"), JSON.stringify({
      sessionId: "sess-a",
      cwd: "/home/user/project",
      transcriptPath: "/tmp/t.jsonl",
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      model: "claude-opus",
      turns: 1
    }));
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (publishedAt.length >= 1) break;
    }
    assert.ok(publishedAt.length >= 1, "daemon should publish when state file appears");
    assert.equal(handshakeAppIds.length, 1, "handshake happens once per connection, not per publish");
    const firstPublishAt = publishedAt[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
    const intervals = [];
    for (let i = 1; i < publishedAt.length; i++) {
      intervals.push(publishedAt[i] - publishedAt[i - 1]);
    }
    for (const gap of intervals) {
      assert.ok(gap >= 18, `coalescing: gap between publishes should respect rate limit, got ${gap}ms`);
    }
    assert.equal(
      handshakeAppIds.length,
      1,
      "the connection is reused across publishes so presence is never torn down"
    );
    const { rm: rmFile } = await import("node:fs/promises");
    await rmFile(join(stateDir, "sess-a.json"));
    const start = Date.now();
    await Promise.race([
      loopPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("loop did not exit within 5s")), 5000))
    ]);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `loop should exit promptly after grace period (was ${elapsed}ms)`);
    void firstPublishAt;
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
});
