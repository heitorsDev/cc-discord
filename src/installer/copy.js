import { chmod, cp, mkdir, stat } from "node:fs/promises";
import { basename } from "node:path";

const EXEC_MODE = 0o755;

function isSkipped(source) {
  const name = basename(source);
  if (name === "node_modules" || name === ".git") return true;
  return name.endsWith(".test.js");
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Copies a source tree into the install root, dropping tests and vendored
 * directories. Returns the number of top-level entries actually copied so the
 * caller can tell an empty install from a real one.
 */
export async function copyTree(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  if (!(await pathExists(srcDir))) return { copied: 0, destDir };

  await cp(srcDir, destDir, {
    recursive: true,
    force: true,
    filter: (source) => !isSkipped(source),
  });
  return { copied: 1, destDir };
}

/**
 * Marks the entry points Claude Code and the daemon launcher invoke directly as
 * executable. Copies inherit the source mode, and a 0644 hook script makes the
 * harness fail with "permission denied" at session start.
 */
export async function markExecutable(paths) {
  let marked = 0;
  for (const path of paths) {
    if (!(await pathExists(path))) continue;
    await chmod(path, EXEC_MODE);
    marked += 1;
  }
  return marked;
}
