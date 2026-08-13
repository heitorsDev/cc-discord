import { test } from "node:test";
import assert from "node:assert/strict";

import { bumpTypeFromBranch, bumpVersion } from "./next-version.js";

test("bumpTypeFromBranch returns patch for fix/*", () => {
  assert.equal(bumpTypeFromBranch("fix/x"), "patch");
});

test("bumpTypeFromBranch returns minor for feat/*", () => {
  assert.equal(bumpTypeFromBranch("feat/x"), "minor");
});

test("bumpTypeFromBranch returns major for release/*", () => {
  assert.equal(bumpTypeFromBranch("release/x"), "major");
  assert.equal(bumpTypeFromBranch("release/0.0.0"), "major");
  assert.equal(bumpTypeFromBranch("release/next"), "major");
});

test("bumpTypeFromBranch returns null for unrecognised prefixes", () => {
  assert.equal(bumpTypeFromBranch("main"), null);
  assert.equal(bumpTypeFromBranch("docs/x"), null);
  assert.equal(bumpTypeFromBranch(""), null);
  assert.equal(bumpTypeFromBranch("release"), null);
  assert.equal(bumpTypeFromBranch("feature/x"), null);
  assert.equal(bumpTypeFromBranch("fixes/x"), null);
});

test("bumpVersion patch increments the patch segment only", () => {
  assert.equal(bumpVersion("0.0.0", "patch"), "0.0.1");
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("0.0.9", "patch"), "0.0.10");
});

test("bumpVersion minor zeroes patch and increments minor", () => {
  assert.equal(bumpVersion("0.0.0", "minor"), "0.1.0");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpVersion("0.9.9", "minor"), "0.10.0");
});

test("bumpVersion major zeroes minor and patch and increments major", () => {
  assert.equal(bumpVersion("0.0.0", "major"), "1.0.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
  assert.equal(bumpVersion("9.9.9", "major"), "10.0.0");
});

test("bumpVersion returns null for null bumpType", () => {
  assert.equal(bumpVersion("0.0.0", null), null);
});

test("bumpVersion returns null for malformed currentVersion", () => {
  assert.equal(bumpVersion("garbage", "patch"), null);
  assert.equal(bumpVersion("1.2", "patch"), null);
  assert.equal(bumpVersion("-1.0.0", "patch"), null);
  assert.equal(bumpVersion("1.2.x", "patch"), null);
  assert.equal(bumpVersion("1.2.3.4", "patch"), null);
  assert.equal(bumpVersion("v1.2.3", "patch"), null);
  assert.equal(bumpVersion(" 1.2.3", "patch"), null);
  assert.equal(bumpVersion("", "patch"), null);
});