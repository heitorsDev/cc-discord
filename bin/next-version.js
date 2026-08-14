#!/usr/bin/env node
import { bumpTypeFromBranch, bumpVersion } from "../src/release/next-version.js";

const [, , currentVersionArg, branchNameArg] = process.argv;

if (currentVersionArg === undefined || branchNameArg === undefined) {
  process.stderr.write("usage: next-version <currentVersion> <branchName>\n");
  process.exit(1);
}

const bumpType = bumpTypeFromBranch(branchNameArg);
if (bumpType === null) {
  process.stderr.write(`unrecognised branch prefix: ${branchNameArg}\n`);
  process.exit(1);
}

const nextVersion = bumpVersion(currentVersionArg, bumpType);
if (nextVersion === null) {
  process.stderr.write(`malformed current version: ${currentVersionArg}\n`);
  process.exit(1);
}

process.stdout.write(`${nextVersion}\n`);