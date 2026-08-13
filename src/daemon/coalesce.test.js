import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldPublish } from "./coalesce.js";
import { RATE_LIMIT_MS } from "../vendors/discord.js";

test("shouldPublish returns true after the rate-limit window has elapsed", () => {
  const lastPublishAt = 1_000_000;
  const now = lastPublishAt + RATE_LIMIT_MS;
  const result = shouldPublish({ lastPublishAt, now, rateLimitMs: RATE_LIMIT_MS });
  assert.equal(result.shouldPublish, true);
});

test("shouldPublish returns false within the rate-limit window", () => {
  const lastPublishAt = 1_000_000;
  const now = lastPublishAt + RATE_LIMIT_MS - 1;
  const result = shouldPublish({ lastPublishAt, now, rateLimitMs: RATE_LIMIT_MS });
  assert.equal(result.shouldPublish, false);
});

test("shouldPublish computes nextPublishAt as the next eligible publish time", () => {
  const lastPublishAt = 1_000_000;
  const now = lastPublishAt + 100;
  const result = shouldPublish({ lastPublishAt, now, rateLimitMs: RATE_LIMIT_MS });
  assert.equal(result.nextPublishAt, lastPublishAt + RATE_LIMIT_MS);
});

test("shouldPublish returns true on the very first publish when lastPublishAt is zero", () => {
  const now = 1_700_000_000_000;
  const result = shouldPublish({ lastPublishAt: 0, now, rateLimitMs: RATE_LIMIT_MS });
  assert.equal(result.shouldPublish, true);
  assert.equal(result.nextPublishAt, RATE_LIMIT_MS);
});
