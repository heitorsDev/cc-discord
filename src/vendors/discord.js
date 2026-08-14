export const HEADER_SIZE = 8;

export const OPCODE_HANDSHAKE = 0;
export const OPCODE_FRAME = 1;
export const OPCODE_CLOSE = 2;
export const OPCODE_PING = 3;
export const OPCODE_PONG = 4;

export const RATE_LIMIT_MS = 15000;

export function encodeFrame(opcode, payloadString) {
  // The header length is a BYTE count. Using payloadString.length would count
  // UTF-16 code units, so a single non-ASCII character (the "·" separator in
  // the default display template, an accented project name, an emoji) declares
  // fewer bytes than are written. Discord then parses a truncated payload and
  // kills the connection with 1003 "Expected ',' or '}' after property value".
  const payload = Buffer.from(payloadString, "utf8");
  const buffer = Buffer.alloc(HEADER_SIZE + payload.length);
  buffer.writeUInt32LE(opcode, 0);
  buffer.writeUInt32LE(payload.length, 4);
  payload.copy(buffer, HEADER_SIZE);
  return buffer;
}

export function decodeFrame(buffer) {
  if (buffer.length < HEADER_SIZE) return null;
  const opcode = buffer.readUInt32LE(0);
  const length = buffer.readUInt32LE(4);
  if (!Number.isInteger(length) || length < 0) return null;
  if (HEADER_SIZE + length > buffer.length) return null;
  const payload = buffer.subarray(HEADER_SIZE, HEADER_SIZE + length);
  return { opcode, payload, payloadString: payload.toString("utf8") };
}
