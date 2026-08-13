import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeState, deleteState, listState } from "./service.js";

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

    const result = await deleteState("sess-a", dir);
    assert.equal(result, null);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("listState skips junk and unparseable JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/a" }, dir);
    await writeState("sess-b", { sessionId: "sess-b", cwd: "/b" }, dir);
    await writeFile(join(dir, "README.md"), "not state");
    await writeFile(join(dir, "sess-c.json"), "{not json");
    await writeFile(join(dir, "sess-d.json"), JSON.stringify({ cwd: "/d" }));

    const states = await listState(dir);
    const ids = states.map((s) => s.sessionId).sort();
    assert.deepEqual(ids, ["sess-a", "sess-b"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
