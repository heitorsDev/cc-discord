import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeFrame, encodeFrame, HEADER_SIZE, OPCODE_FRAME } from "./discord.js";

const OPCODES = [0, 1, 2, 3, 4];

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

test("encodeFrame → decodeFrame round-trips per opcode", () => {
  for (const opcode of OPCODES) {
    const payload = `{"cmd":"SET_ACTIVITY","nonce":"op-${opcode}"}`;
    const decoded = decodeFrame(encodeFrame(opcode, payload));
    assert.equal(decoded.opcode, opcode);
    assert.equal(decoded.payloadString, payload);
    assert.deepEqual(Array.from(decoded.payload), Array.from(Buffer.from(payload, "utf8")));
  }
});

test("decodeFrame returns null on truncated frame", () => {
  const frame = encodeFrame(1, "hi");
  assert.equal(decodeFrame(frame.subarray(0, frame.length - 1)), null);
});

test("decodeFrame returns null on declared length exceeding buffer", () => {
  const frame = encodeFrame(1, "hi");
  frame.writeUInt32LE(999, 4);
  assert.equal(decodeFrame(frame), null);
});

test("encodeFrame declares the byte length, not the UTF-16 length", () => {
  // "·" is one UTF-16 code unit but two UTF-8 bytes.
  const payload = JSON.stringify({ state: "Claude Code · thinking" });
  const frame = encodeFrame(OPCODE_FRAME, payload);

  const declared = frame.readUInt32LE(4);
  assert.equal(declared, Buffer.byteLength(payload, "utf8"));
  assert.equal(frame.length, HEADER_SIZE + declared);
  assert.equal(frame.subarray(HEADER_SIZE).toString("utf8"), payload);
});

test("a frame with multi-byte characters survives a round trip", () => {
  const payload = JSON.stringify({ details: "café · naïve · 🚀", state: "ok" });

  const decoded = decodeFrame(encodeFrame(OPCODE_FRAME, payload));

  assert.equal(decoded.opcode, OPCODE_FRAME);
  assert.equal(decoded.payloadString, payload);
  assert.deepEqual(JSON.parse(decoded.payloadString), JSON.parse(payload));
});
