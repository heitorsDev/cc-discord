import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleSessionEnd } from "./service.js";

async function withStateDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-session-end-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("handleSessionEnd deletes the state file", async () => {
  await withStateDir(async (stateDir) => {
    await writeFile(
      join(stateDir, "sess-end.json"),
      JSON.stringify({ sessionId: "sess-end", cwd: "/tmp" })
    );
    assert.deepEqual(await readdir(stateDir), ["sess-end.json"]);

    await handleSessionEnd({ session_id: "sess-end" }, { stateDir });

    assert.deepEqual(await readdir(stateDir), []);
  });
});

test("handleSessionEnd tolerates a missing state file", async () => {
  await withStateDir(async (stateDir) => {
    await handleSessionEnd({ session_id: "sess-gone" }, { stateDir });

    const entries = await readdir(stateDir).catch(() => []);
    assert.deepEqual(entries, []);
  });
});

test("handleSessionEnd writes nothing when payload lacks a session id", async () => {
  await withStateDir(async (stateDir) => {
    await writeFile(join(stateDir, "sess-keep.json"), JSON.stringify({ sessionId: "sess-keep" }));

    await handleSessionEnd({ cwd: "/tmp" }, { stateDir });

    assert.deepEqual(await readdir(stateDir), ["sess-keep.json"]);
  });
});

test("handleSessionEnd leaves other sessions' state untouched", async () => {
  await withStateDir(async (stateDir) => {
    await writeFile(join(stateDir, "sess-a.json"), JSON.stringify({ sessionId: "sess-a" }));
    await writeFile(join(stateDir, "sess-b.json"), JSON.stringify({ sessionId: "sess-b" }));

    await handleSessionEnd({ session_id: "sess-a" }, { stateDir });

    const entries = await readdir(stateDir);
    assert.deepEqual(entries, ["sess-b.json"]);
  });
});
