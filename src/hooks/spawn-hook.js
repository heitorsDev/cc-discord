import { spawn } from "node:child_process";
import { join } from "node:path";

const INHERITED_ENV_KEYS_TO_STRIP = [
  "XDG_STATE_HOME",
  "XDG_CONFIG_HOME",
  "CLAUDE_CONFIG_HOME"
];

export async function spawnHook(stdinPayload, env = {}, { hookDir } = {}) {
  return await new Promise((resolve, reject) => {
    const childEnv = { ...process.env };
    for (const key of INHERITED_ENV_KEYS_TO_STRIP) {
      delete childEnv[key];
    }
    Object.assign(childEnv, env);
    const child = spawn(
      process.execPath,
      [join(hookDir, "hook.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: childEnv }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdinPayload !== undefined) {
      child.stdin.end(stdinPayload);
    } else {
      child.stdin.end();
    }
  });
}
