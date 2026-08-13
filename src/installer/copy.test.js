import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { copyHookScripts } from "./copy.js";

test("copyHookScripts creates the destination and tolerates missing source files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-installer-copy-"));
  try {
    const src = join(dir, "hooks-src-that-does-not-exist");
    const dest = join(dir, "hooks-dest");

    const result = await copyHookScripts(src, dest);

    const stats = await stat(dest);
    assert.ok(stats.isDirectory());
    assert.equal(result.copied, 0);
    assert.equal(result.destDir, dest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
