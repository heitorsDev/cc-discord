import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";

import { resolveStateDir } from "../session-state/service.js";

export function resolveLockPath(stateDir = resolveStateDir()) {
  return join(stateDir, "cc-discord.lock");
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 performs the permission and existence checks without delivering.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the pid exists but belongs to another user, so it is alive.
    return err.code === "EPERM";
  }
}

/**
 * Removes a lock file whose owning process is gone. A daemon killed by SIGKILL,
 * an OOM, or a reboot never runs its release path, and without this check the
 * leftover file would block every future daemon forever.
 */
function clearIfStale(lockPath) {
  let owner;
  try {
    owner = readFileSync(lockPath, "utf8");
  } catch {
    return false;
  }
  const pid = Number.parseInt(owner.trim(), 10);
  // An unreadable or empty lock file cannot name a live owner either.
  if (isProcessAlive(pid)) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function open(lockPath) {
  try {
    return openSync(lockPath, "wx");
  } catch {
    return null;
  }
}

export function acquireLock(lockPath) {
  let fd = open(lockPath);
  if (fd === null && clearIfStale(lockPath)) fd = open(lockPath);
  if (fd === null) return null;

  try {
    writeSync(fd, String(process.pid));
  } catch {
    closeSync(fd);
    return null;
  }
  return {
    release() {
      try {
        closeSync(fd);
      } catch {
        return;
      }
      try {
        unlinkSync(lockPath);
      } catch {
        return;
      }
    }
  };
}
