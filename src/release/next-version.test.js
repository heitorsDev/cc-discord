import { test } from "node:test";
import assert from "node:assert/strict";

import { bumpTypeFromBranch } from "./next-version.js";

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