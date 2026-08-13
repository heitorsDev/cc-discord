import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readTranscript } from "./service.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function copyFixtureTo(name) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-transcript-"));
  const target = join(dir, "transcript.jsonl");
  await copyFile(join(FIXTURES_DIR, name), target);
  return { dir, target };
}

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

test("readTranscript extracts the title from a single title entry", async () => {
  const { dir, target } = await copyFixtureTo("single-title.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, "Adding Discord presence");
    assert.equal(result.latestPrompt, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readTranscript picks the last title when several exist", async () => {
  const { dir, target } = await copyFixtureTo("multiple-titles.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, "Polishing Discord presence");
    assert.equal(result.latestPrompt, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readTranscript resolves pointer to message text", async () => {
  const { dir, target } = await copyFixtureTo("with-prompt.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, "Adding Discord presence");
    assert.equal(result.latestPrompt, "ship it");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readTranscript returns null latestPrompt when only title exists", async () => {
  const { dir, target } = await copyFixtureTo("no-title-with-pointer.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, null);
    assert.equal(result.latestPrompt, "ship it");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readTranscript ignores unknown entry types", async () => {
  const { dir, target } = await copyFixtureTo("unknown-entries.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, "Adding Discord presence");
    assert.equal(result.latestPrompt, "ship it");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readTranscript skips unparseable lines", async () => {
  const { dir, target } = await copyFixtureTo("malformed-lines.jsonl");
  try {
    const result = await readTranscript(target);
    assert.equal(result.title, "Adding Discord presence");
    assert.equal(result.latestPrompt, "ship it");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
