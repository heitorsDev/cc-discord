import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeState, deleteState } from "./service.js";

test("writeState creates one file per session id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/tmp" }, dir);

    const entries = await readdir(dir);
    assert.deepEqual(entries, ["sess-a.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeState overwrites rather than accumulating", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/first" }, dir);
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/second" }, dir);

    const entries = await readdir(dir);
    assert.deepEqual(entries, ["sess-a.json"]);

    const payload = JSON.parse(await readFile(join(dir, "sess-a.json"), "utf8"));
    assert.equal(payload.cwd, "/second");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deleteState removes the file and tolerates absence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/tmp" }, dir);
    assert.deepEqual(await readdir(dir), ["sess-a.json"]);

    await deleteState("sess-a", dir);
    assert.deepEqual(await readdir(dir), []);

    await deleteState("sess-a", dir);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
