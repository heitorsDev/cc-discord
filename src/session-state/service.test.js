import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { writeState, deleteState, listState, selectActive, resolveStateDir } from "./service.js";

test("resolveStateDir is absolute so hooks and the daemon agree on one location", () => {
  const original = process.env.XDG_STATE_HOME;
  try {
    delete process.env.XDG_STATE_HOME;
    const fallback = resolveStateDir();
    assert.ok(isAbsolute(fallback), `expected an absolute path, got ${fallback}`);
    assert.equal(fallback, join(homedir(), ".local", "state", "cc-discord"));

    process.env.XDG_STATE_HOME = "/xdg/state";
    assert.equal(resolveStateDir(), join("/xdg/state", "cc-discord"));
  } finally {
    if (original === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = original;
  }
});

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

test("selectActive returns most-recently-written and otherCount", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    await writeState("sess-a", { sessionId: "sess-a", cwd: "/a" }, dir);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeState("sess-b", { sessionId: "sess-b", cwd: "/b" }, dir);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeState("sess-c", { sessionId: "sess-c", cwd: "/c" }, dir);

    const active = await selectActive(dir);
    assert.equal(active.state.sessionId, "sess-c");
    assert.equal(active.otherCount, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("selectActive over an empty directory returns a null-ish result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-state-"));
  try {
    const active = await selectActive(dir);
    assert.equal(active.state, null);
    assert.equal(active.otherCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
