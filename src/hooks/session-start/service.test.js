import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleSessionStart } from "./service.js";

async function withStateDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-session-start-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withConfigDir(contents, fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-session-start-config-"));
  const configPath = join(dir, "config.json");
  await writeFile(configPath, contents);
  try {
    return await fn(configPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("handleSessionStart writes state for the session id", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = {
        session_id: "sess-a",
        transcript_path: "/tmp/transcripts/sess-a.jsonl",
        cwd: "/home/user/project",
        model: "claude-opus-4-1"
      };

      await handleSessionStart(payload, { stateDir, configPath });

      const entries = await readdir(stateDir);
      assert.deepEqual(entries, ["sess-a.json"]);

      const stored = JSON.parse(await readFile(join(stateDir, "sess-a.json"), "utf8"));
      assert.equal(stored.sessionId, "sess-a");
      assert.equal(stored.cwd, "/home/user/project");
      assert.equal(stored.transcriptPath, "/tmp/transcripts/sess-a.jsonl");
      assert.equal(stored.model, "claude-opus-4-1");
      assert.equal(stored.turns, 0);
      assert.equal(typeof stored.startedAt, "number");
      assert.equal(typeof stored.lastActivityAt, "number");
    });
  });
});

test("handleSessionStart derives sessionId from payload.session_id", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = { session_id: "sess-b", cwd: "/tmp" };

      await handleSessionStart(payload, { stateDir, configPath });

      const entries = await readdir(stateDir);
      assert.deepEqual(entries, ["sess-b.json"]);
    });
  });
});

test("handleSessionStart writes no state when payload lacks a session id", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      await handleSessionStart({ cwd: "/tmp" }, { stateDir, configPath });

      const entries = await readdir(stateDir);
      assert.deepEqual(entries, []);
    });
  });
});

test("handleSessionStart treats missing payload fields as null", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = { session_id: "sess-c" };

      await handleSessionStart(payload, { stateDir, configPath });

      const stored = JSON.parse(await readFile(join(stateDir, "sess-c.json"), "utf8"));
      assert.equal(stored.cwd, null);
      assert.equal(stored.transcriptPath, null);
      assert.equal(stored.model, null);
    });
  });
});

test("handleSessionStart accepts an injected now() for deterministic timestamps", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = { session_id: "sess-d", cwd: "/tmp" };

      await handleSessionStart(payload, { stateDir, configPath, now: () => 1_700_000_000_000 });

      const stored = JSON.parse(await readFile(join(stateDir, "sess-d.json"), "utf8"));
      assert.equal(stored.startedAt, 1_700_000_000_000);
      assert.equal(stored.lastActivityAt, 1_700_000_000_000);
    });
  });
});

test("handleSessionStart writes nothing when config.enabled is false", async () => {
  await withConfigDir(JSON.stringify({ enabled: false }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = { session_id: "sess-off", cwd: "/tmp" };

      await handleSessionStart(payload, { stateDir, configPath });

      const entries = await readdir(stateDir);
      assert.deepEqual(entries, []);
    });
  });
});

test("handleSessionStart writes nothing when config fails closed (malformed JSON)", async () => {
  await withConfigDir("{not json", async (configPath) => {
    await withStateDir(async (stateDir) => {
      const payload = { session_id: "sess-bad", cwd: "/tmp" };

      await handleSessionStart(payload, { stateDir, configPath });

      const entries = await readdir(stateDir);
      assert.deepEqual(entries, []);
    });
  });
});

function makeFakeSpawn() {
  const calls = [];
  function fakeSpawn(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    return { unref() {} };
  }
  fakeSpawn.calls = calls;
  return fakeSpawn;
}

test("handleSessionStart spawns the daemon when no instance is running", async () => {
  await withConfigDir(JSON.stringify({ enabled: true }), async (configPath) => {
    await withStateDir(async (stateDir) => {
      const spawn = makeFakeSpawn();
      const released = [];
      const acquireLock = (lockPath) => {
        released.push(lockPath);
        return { release() { released.push("release"); } };
      };

      await handleSessionStart(
        { session_id: "sess-spawn", cwd: "/tmp" },
        {
          stateDir,
          configPath,
          daemonScriptPath: "/path/to/bin/cc-discord-daemon.js",
          acquireLock,
          spawn,
          env: {}
        }
      );

      assert.equal(spawn.calls.length, 1);
      assert.equal(spawn.calls[0].args[0], "/path/to/bin/cc-discord-daemon.js");
      assert.equal(spawn.calls[0].opts.detached, true);
      assert.equal(spawn.calls[0].opts.stdio, "ignore");
      assert.equal(typeof spawn.calls[0].opts.env, "object");
      assert.ok(released.includes("release"), "lock acquired by us must be released before spawn");
    });
  });
});
