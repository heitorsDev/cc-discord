import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleUserPromptSubmit } from "./service.js";

async function withStateDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-ups-state-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("handleUserPromptSubmit overwrites state and increments turns", async () => {
  await withStateDir(async (stateDir) => {
    await writeFile(
      join(stateDir, "sess-u.json"),
      JSON.stringify({
        sessionId: "sess-u",
        cwd: "/initial",
        transcriptPath: "/tmp/t.jsonl",
        startedAt: 1_700_000_000_000,
        lastActivityAt: 1_700_000_000_000,
        model: "opus",
        turns: 0
      })
    );

    const payload = {
      session_id: "sess-u",
      cwd: "/home/user/project",
      transcript_path: "/tmp/transcript.jsonl",
      model: "claude-opus-4-1"
    };

    await handleUserPromptSubmit(payload, {
      stateDir,
      now: () => 1_700_000_500_000
    });

    const stored = JSON.parse(await readFile(join(stateDir, "sess-u.json"), "utf8"));
    assert.equal(stored.sessionId, "sess-u");
    assert.equal(stored.cwd, "/home/user/project");
    assert.equal(stored.transcriptPath, "/tmp/transcript.jsonl");
    assert.equal(stored.model, "claude-opus-4-1");
    assert.equal(stored.turns, 1);
    assert.equal(stored.startedAt, 1_700_000_000_000);
    assert.equal(stored.lastActivityAt, 1_700_000_500_000);
  });
});

test("handleUserPromptSubmit stores turns=1 when no prior state exists", async () => {
  await withStateDir(async (stateDir) => {
    const payload = { session_id: "sess-fresh", cwd: "/tmp" };

    await handleUserPromptSubmit(payload, {
      stateDir,
      now: () => 1_700_001_000_000
    });

    const stored = JSON.parse(await readFile(join(stateDir, "sess-fresh.json"), "utf8"));
    assert.equal(stored.turns, 1);
    assert.equal(stored.startedAt, 1_700_001_000_000);
    assert.equal(stored.lastActivityAt, 1_700_001_000_000);
  });
});

test("handleUserPromptSubmit increments turns on each call", async () => {
  await withStateDir(async (stateDir) => {
    await handleUserPromptSubmit({ session_id: "sess-inc" }, { stateDir, now: () => 1 });
    await handleUserPromptSubmit({ session_id: "sess-inc" }, { stateDir, now: () => 2 });
    await handleUserPromptSubmit({ session_id: "sess-inc" }, { stateDir, now: () => 3 });

    const stored = JSON.parse(await readFile(join(stateDir, "sess-inc.json"), "utf8"));
    assert.equal(stored.turns, 3);
    assert.equal(stored.lastActivityAt, 3);
    assert.equal(stored.startedAt, 1);
  });
});

test("handleUserPromptSubmit writes nothing when payload lacks a session id", async () => {
  await withStateDir(async (stateDir) => {
    await handleUserPromptSubmit({ cwd: "/tmp" }, { stateDir, now: () => 1 });

    const entries = await readdir(stateDir);
    assert.deepEqual(entries, []);
  });
});

test("handleUserPromptSubmit tolerates missing prior state file", async () => {
  await withStateDir(async (stateDir) => {
    await handleUserPromptSubmit({ session_id: "sess-missing", cwd: "/tmp" }, {
      stateDir,
      now: () => 42
    });

    const stored = JSON.parse(await readFile(join(stateDir, "sess-missing.json"), "utf8"));
    assert.equal(stored.turns, 1);
  });
});

test("handleUserPromptSubmit treats missing payload fields as null", async () => {
  await withStateDir(async (stateDir) => {
    await handleUserPromptSubmit({ session_id: "sess-bare" }, {
      stateDir,
      now: () => 99
    });

    const stored = JSON.parse(await readFile(join(stateDir, "sess-bare.json"), "utf8"));
    assert.equal(stored.cwd, null);
    assert.equal(stored.transcriptPath, null);
    assert.equal(stored.model, null);
  });
});
