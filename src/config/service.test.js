import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG, loadConfig } from "./service.js";

test("loadConfig returns full defaults when the file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    const result = await loadConfig(configPath);

    assert.equal(result.failedClosed, false);
    assert.equal(result.appIdMissing, true);
    assert.deepEqual(result.config, DEFAULT_CONFIG);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
