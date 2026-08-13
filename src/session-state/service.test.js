import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeState } from "./service.js";

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
