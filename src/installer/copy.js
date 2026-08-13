import { mkdir } from "node:fs/promises";

export async function copyHookScripts(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  return { copied: 0, destDir, note: "hook scripts wire in a later ticket" };
}
