import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeFrame } from "./discord.js";

test("encodeFrame emits the documented header layout (byte fixture)", () => {
  const frame = encodeFrame(1, "hi");
  assert.deepEqual(
    Array.from(frame),
    [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x68, 0x69]
  );
});
