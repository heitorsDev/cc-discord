export const HEADER_SIZE = 8;

export const OPCODE_HANDSHAKE = 0;
export const OPCODE_FRAME = 1;
export const OPCODE_CLOSE = 2;
export const OPCODE_PING = 3;
export const OPCODE_PONG = 4;

export const RATE_LIMIT_MS = 15000;

export function encodeFrame(opcode, payloadString) {
  const buffer = Buffer.alloc(HEADER_SIZE + payloadString.length);
  buffer.writeUInt32LE(opcode, 0);
  buffer.writeUInt32LE(payloadString.length, 4);
  buffer.write(payloadString, HEADER_SIZE);
  return buffer;
}
