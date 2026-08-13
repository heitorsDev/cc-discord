import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeFrame, encodeFrame } from "./discord.js";

test("encodeFrame emits the documented header layout (byte fixture)", () => {
  const frame = encodeFrame(1, "hi");
  assert.deepEqual(
    Array.from(frame),
    [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x68, 0x69]
  );
});

test("decodeFrame parses a known frame (byte fixture)", () => {
  const frame = Buffer.from([
    0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x68, 0x69,
  ]);
  const decoded = decodeFrame(frame);
  assert.equal(decoded.opcode, 1);
  assert.deepEqual(Array.from(decoded.payload), [0x68, 0x69]);
  assert.equal(decoded.payloadString, "hi");
});
