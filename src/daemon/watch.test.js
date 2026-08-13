import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { watchStateDir } from "./watch.js";

async function withStateDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-watch-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isWindows = process.platform === "win32";
const watchTest = isWindows ? test.skip : test;

watchTest("watchStateDir fires callback when a file is added", async () => {
  await withStateDir(async (stateDir) => {
    const events = [];
    const handle = watchStateDir(stateDir, (event) => events.push(event));
    try {
      await wait(50);
      await writeFile(join(stateDir, "sess-a.json"), "{}");
      await wait(200);
      assert.ok(events.length >= 1);
      assert.ok(events.some((e) => e.kind === "change"));
    } finally {
      handle.close();
    }
  });
});
