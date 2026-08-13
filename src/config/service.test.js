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

test("loadConfig fails closed on malformed JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, "{not json");

    const result = await loadConfig(configPath);

    assert.equal(result.failedClosed, true);
    assert.equal(result.appIdMissing, true);
    assert.equal(result.config.fields.title.show, false);
    assert.equal(result.config.fields.title.alt, "Coding");
    assert.equal(result.config.fields.project.show, false);
    assert.equal(result.config.fields.project.alt, "a project");
    assert.equal(result.config.fields.lastPrompt.show, false);
    assert.equal(result.config.fields.lastPrompt.alt, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig fails closed when the file is empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, "");

    const result = await loadConfig(configPath);

    assert.equal(result.failedClosed, true);
    assert.equal(result.config.fields.title.alt, "Coding");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig fails closed when the file is not a JSON object", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, JSON.stringify(["not", "an", "object"]));

    const result = await loadConfig(configPath);

    assert.equal(result.failedClosed, true);
    assert.equal(result.config.fields.title.alt, "Coding");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig flags appIdMissing when discord.appId is empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({ discord: { appId: "" } }));

    const result = await loadConfig(configPath);

    assert.equal(result.appIdMissing, true);
    assert.equal(result.failedClosed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig flags appIdMissing when discord is omitted entirely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({ enabled: true }));

    const result = await loadConfig(configPath);

    assert.equal(result.appIdMissing, true);
    assert.equal(result.failedClosed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig clears appIdMissing when discord.appId is provided", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({ discord: { appId: "9876543210" } }));

    const result = await loadConfig(configPath);

    assert.equal(result.appIdMissing, false);
    assert.equal(result.failedClosed, false);
    assert.equal(result.config.discId, undefined);
    assert.equal(result.config.discord.appId, "9876543210");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig ignores unknown top-level keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        enabled: true,
        thisDoesNotExist: "ignored",
        neitherDoesThis: { nested: true }
      })
    );

    const result = await loadConfig(configPath);

    assert.equal(result.config.thisDoesNotExist, undefined);
    assert.equal(result.config.neitherDoesThis, undefined);
    assert.deepEqual(result.config, { ...DEFAULT_CONFIG, enabled: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig ignores unknown nested keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-config-"));
  try {
    const configPath = join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        discord: { appId: "1234", unexpected: "drop me" }
      })
    );

    const result = await loadConfig(configPath);

    assert.equal(result.config.discord.unexpected, undefined);
    assert.equal(result.config.discord.appId, "1234");
    assert.equal(result.config.discord.largeImage, "claude_logo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
