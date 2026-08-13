import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("loadConfig deep-merges partial user config over defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        enabled: false,
        discord: { appId: "1234567890" },
        fields: { title: { alt: "Custom Title" } }
      })
    );

    const result = await loadConfig(configPath);

    assert.equal(result.config.enabled, false);
    assert.equal(result.config.discord.appId, "1234567890");
    assert.equal(result.config.discord.largeImage, "claude_logo");
    assert.equal(result.config.fields.title.show, true);
    assert.equal(result.config.fields.title.alt, "Custom Title");
    assert.deepEqual(result.config.fields.project, { show: true, alt: "a project" });
    assert.deepEqual(result.config.privacy.allowlist, ["*"]);
    assert.equal(result.config.fields.lastPrompt.maxLen, 60);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
