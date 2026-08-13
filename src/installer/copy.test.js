import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { copyTree, markExecutable } from "./copy.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "cc-discord-installer-copy-"));
}

test("copyTree creates the destination and tolerates a missing source", async () => {
  const dir = await makeTempDir();
  try {
    const src = join(dir, "src-that-does-not-exist");
    const dest = join(dir, "dest");

    const result = await copyTree(src, dest);

    assert.ok((await stat(dest)).isDirectory());
    assert.equal(result.copied, 0);
    assert.equal(result.destDir, dest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("copyTree copies nested files and skips tests and node_modules", async () => {
  const dir = await makeTempDir();
  try {
    const src = join(dir, "src");
    const dest = join(dir, "dest");
    await mkdir(join(src, "hooks", "session-start"), { recursive: true });
    await mkdir(join(src, "node_modules"), { recursive: true });
    await writeFile(join(src, "hooks", "session-start", "hook.js"), "export const x = 1;\n");
    await writeFile(join(src, "hooks", "session-start", "hook.test.js"), "// test\n");
    await writeFile(join(src, "node_modules", "dep.js"), "// dep\n");

    const result = await copyTree(src, dest);

    assert.equal(result.copied, 1);
    assert.equal(
      await readFile(join(dest, "hooks", "session-start", "hook.js"), "utf8"),
      "export const x = 1;\n"
    );
    await assert.rejects(stat(join(dest, "hooks", "session-start", "hook.test.js")));
    await assert.rejects(stat(join(dest, "node_modules")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("copyTree overwrites an earlier install of the same file", async () => {
  const dir = await makeTempDir();
  try {
    const src = join(dir, "src");
    const dest = join(dir, "dest");
    await mkdir(src, { recursive: true });
    await mkdir(dest, { recursive: true });
    await writeFile(join(src, "hook.js"), "new\n");
    await writeFile(join(dest, "hook.js"), "stale\n");

    await copyTree(src, dest);

    assert.equal(await readFile(join(dest, "hook.js"), "utf8"), "new\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("markExecutable sets the exec bit and ignores missing paths", async () => {
  const dir = await makeTempDir();
  try {
    const present = join(dir, "hook.js");
    await writeFile(present, "// hook\n", { mode: 0o644 });

    const marked = await markExecutable([present, join(dir, "missing.js")]);

    assert.equal(marked, 1);
    const mode = (await stat(present)).mode & 0o777;
    assert.equal(mode, 0o755);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
