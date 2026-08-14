import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquireLock, resolveLockPath } from "./lock.js";

async function withLockDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-lock-"));
  try {
    return await fn(join(dir, "cc-discord.lock"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("resolveLockPath places the lock file inside the state directory", () => {
  const dir = join(tmpdir(), "cc-discord-state");
  const path = resolveLockPath(dir);
  assert.equal(path, join(dir, "cc-discord.lock"));
});

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

test("release allows the lock to be acquired again", async () => {
  await withLockDir(async (lockPath) => {
    const first = acquireLock(lockPath);
    assert.notEqual(first, null);
    await first.release();
    const second = acquireLock(lockPath);
    assert.notEqual(second, null);
    await second.release();
  });
});

test("acquireLock takes over a lock whose owning process is gone", async () => {
  await withLockDir(async (lockPath) => {
    // A pid that cannot be running: the daemon died without releasing.
    await writeFile(lockPath, "2147483646");

    const handle = acquireLock(lockPath);

    assert.notEqual(handle, null, "a stale lock must not block a new daemon");
    assert.equal((await readFile(lockPath, "utf8")).trim(), String(process.pid));
    await handle.release();
  });
});

test("acquireLock takes over a lock file left empty or corrupt", async () => {
  await withLockDir(async (lockPath) => {
    await writeFile(lockPath, "");

    const handle = acquireLock(lockPath);

    assert.notEqual(handle, null);
    await handle.release();
  });
});

test("acquireLock still refuses a lock held by a live process", async () => {
  await withLockDir(async (lockPath) => {
    await writeFile(lockPath, String(process.pid));

    assert.equal(acquireLock(lockPath), null);
  });
});
