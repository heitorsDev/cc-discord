export function bumpTypeFromBranch(branchName) {
  if (typeof branchName !== "string") return null;
  if (branchName.startsWith("fix/")) return "patch";
  if (branchName.startsWith("feat/")) return "minor";
  if (branchName.startsWith("release/")) return "major";
  return null;
}

export function bumpVersion(_currentVersion, _bumpType) {
  return null;
}