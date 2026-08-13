import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquireLock } from "./lock.js";

async function withLockDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-lock-"));
  try {
    return await fn(join(dir, "cc-discord.lock"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("acquireLock returns a release object on first call", async () => {
  await withLockDir(async (lockPath) => {
    const handle = acquireLock(lockPath);
    assert.notEqual(handle, null);
    assert.equal(typeof handle.release, "function");
    await handle.release();
  });
});

test("acquireLock returns null when the lock is already held", async () => {
  await withLockDir(async (lockPath) => {
    const first = acquireLock(lockPath);
    assert.notEqual(first, null);
    const second = acquireLock(lockPath);
    assert.equal(second, null);
    await first.release();
  });
});
