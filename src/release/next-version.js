export function bumpTypeFromBranch(branchName) {
  if (typeof branchName !== "string") return null;
  if (branchName.startsWith("fix/")) return "patch";
  if (branchName.startsWith("feat/")) return "minor";
  if (branchName.startsWith("release/")) return "major";
  return null;
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function bumpVersion(currentVersion, bumpType) {
  if (typeof currentVersion !== "string") return null;
  const match = SEMVER_PATTERN.exec(currentVersion);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map((segment) => Number(segment));
  if (major < 0 || minor < 0 || patch < 0) return null;
  if (bumpType === "patch") return `${major}.${minor}.${patch + 1}`;
  return null;
}