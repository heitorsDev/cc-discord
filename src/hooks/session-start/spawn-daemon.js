import { spawn as defaultSpawn } from "node:child_process";
import { acquireLock as defaultAcquireLock, resolveLockPath as defaultResolveLockPath } from "../../daemon/lock.js";

export function maybeStartDaemon(options = {}) {
  const {
    stateDir,
    daemonScriptPath,
    acquireLock = defaultAcquireLock,
    resolveLockPath = defaultResolveLockPath,
    spawn = defaultSpawn,
    env = process.env
  } = options;

  if (stateDir === undefined || daemonScriptPath === undefined) return false;

  const lockPath = resolveLockPath(stateDir);
  const lock = acquireLock(lockPath);
  if (lock === null) return false;
  lock.release();

  const child = spawn(
    process.execPath,
    [daemonScriptPath],
    {
      detached: true,
      stdio: "ignore",
      env: { ...env }
    }
  );
  if (typeof child.unref === "function") child.unref();
  return true;
}
