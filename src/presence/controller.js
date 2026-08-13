import net from "node:net";
import { stat } from "node:fs/promises";
import path from "node:path";

import {
  HEADER_SIZE,
  OPCODE_CLOSE,
  OPCODE_FRAME,
  OPCODE_HANDSHAKE,
  OPCODE_PING,
  OPCODE_PONG,
  decodeFrame,
  encodeFrame,
} from "../vendors/discord.js";

export function resolveRuntimeDir() {
  return process.env.XDG_RUNTIME_DIR ?? path.posix.join("run", "user", String(process.env.USER ?? "1000"));
}

export function resolveSocketCandidates(options = {}) {
  const runtimeDir = options.runtimeDir ?? resolveRuntimeDir();
  const flatpakAppId = options.flatpakAppId ?? "com.discordapp.Discord";
  const maxSocketIndex = options.maxSocketIndex ?? 9;
  if (typeof runtimeDir !== "string" || runtimeDir === "") return [];
  const out = [];
  for (let i = 0; i <= maxSocketIndex; i++) {
    out.push({ path: path.posix.join(runtimeDir, `discord-ipc-${i}`), kind: "native" });
  }
  for (let i = 0; i <= maxSocketIndex; i++) {
    out.push({ path: path.posix.join(runtimeDir, "app", flatpakAppId, `discord-ipc-${i}`), kind: "flatpak" });
  }
  return out;
}

function defaultSocketFactory({ path: socketPath, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(Object.assign(new Error("probe timeout"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    socket.once("connect", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", fail);
  });
}

export async function connectToDiscord(options = {}) {
  const {
    socketFactory = defaultSocketFactory,
    probeTimeoutMs = 250,
    diagnostic = (msg) => console.warn(msg),
    debug = (msg) => console.debug(msg),
  } = options;

  const candidates = resolveSocketCandidates(options);
  let flatpakDirChecked = false;
  let flatpakDirExisted = false;

  for (const candidate of candidates) {
    if (candidate.kind === "flatpak" && !flatpakDirChecked) {
      flatpakDirChecked = true;
      const flatpakDir = path.posix.dirname(candidate.path);
      try {
        await stat(flatpakDir);
        flatpakDirExisted = true;
      } catch (err) {
        if (err.code === "ENOENT") {
          diagnostic(
            "Discord IPC socket not found. Native paths 0-9 unreachable and Flatpak Discord directory is missing. Start Discord and retry."
          );
        }
      }
    }
    try {
      const socket = await socketFactory({ path: candidate.path, timeoutMs: probeTimeoutMs });
      return { socket, kind: candidate.kind, path: candidate.path };
    } catch {}
  }

  debug("Discord IPC socket not reachable.");
  return null;
}

function writeFrame(socket, frame) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.off("error", fail);
      reject(err);
    };
    socket.once("error", fail);
    socket.write(frame, (err) => {
      if (settled) return;
      settled = true;
      socket.off("error", fail);
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function sendHandshake(socket, appId) {
  const payload = JSON.stringify({ v: 1, client_id: appId });
  await writeFrame(socket, encodeFrame(OPCODE_HANDSHAKE, payload));
}

let activityNonceCounter = 0;

export async function sendActivity(socket, activity) {
  activityNonceCounter++;
  const payload = JSON.stringify({
    cmd: "SET_ACTIVITY",
    args: { pid: process.pid, activity },
    nonce: String(activityNonceCounter),
  });
  await writeFrame(socket, encodeFrame(OPCODE_FRAME, payload));
}

export function startKeepalive(socket) {
  let buffer = Buffer.alloc(0);
  let stopped = false;

  const onData = (chunk) => {
    if (stopped) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (!stopped) {
      const frame = decodeFrame(buffer);
      if (frame === null) return;
      buffer = buffer.subarray(HEADER_SIZE + frame.payload.length);
      if (frame.opcode === OPCODE_PING) {
        socket.write(encodeFrame(OPCODE_PONG, frame.payloadString));
      } else if (frame.opcode === OPCODE_CLOSE) {
        socket.end();
      }
    }
  };

  socket.on("data", onData);

  const unsubscribe = () => {
    if (stopped) return;
    stopped = true;
    socket.off("data", onData);
  };

  return unsubscribe;
}

export function closeSocket(socket) {
  return new Promise((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      socket.off("close", done);
      resolve();
    };
    socket.once("close", done);
    socket.end();
    setTimeout(() => {
      if (settled) return;
      settled = true;
      if (!socket.destroyed) socket.destroy();
      resolve();
    }, 1000).unref();
  });
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withReconnect(operation, options = {}) {
  const {
    startMs = 1000,
    capMs = 60000,
    maxAttempts = Infinity,
    sleep = defaultSleep,
    connectOptions = {},
  } = options;

  let backoff = startMs;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const connection = await connectToDiscord(connectOptions);

    if (connection === null) {
      console.debug(`Discord reconnect attempt ${attempt}: no socket reachable, waiting ${backoff}ms`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, capMs);
      continue;
    }

    console.debug(`Discord connected on attempt ${attempt} via ${connection.kind}`);
    backoff = startMs;

    let opSettled = false;
    const opResult = (async () => {
      try {
        await operation(connection.socket, connection);
        opSettled = true;
        return "done";
      } catch (err) {
        opSettled = true;
        throw err;
      }
    })();

    const closed = new Promise((resolve) => {
      connection.socket.once("close", () => resolve("closed"));
      connection.socket.once("error", () => resolve("closed"));
    });

    const winner = await Promise.race([opResult, closed]);

    if (winner === "done") {
      await closeSocket(connection.socket);
      return;
    }

    closeSocket(connection.socket).catch(() => {});
    console.debug(`Discord disconnected; reconnecting after ${backoff}ms`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, capMs);
  }
}
