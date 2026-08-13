import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readTranscript } from "./service.js";

test("readTranscript returns null-ish when file missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-transcript-"));
  try {
    const missingPath = join(dir, "does-not-exist.jsonl");
    const result = await readTranscript(missingPath);
    assert.deepEqual(result, { title: null, latestPrompt: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
