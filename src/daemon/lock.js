import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";

export function acquireLock(lockPath) {
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch {
    return null;
  }
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
