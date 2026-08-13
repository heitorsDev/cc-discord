import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

import {
  connectToDiscord,
  resolveSocketCandidates,
  sendActivity,
  sendHandshake,
  startKeepalive,
  withReconnect,
  closeSocket,
} from "./controller.js";
import { encodeFrame, OPCODE_PING, OPCODE_PONG, HEADER_SIZE } from "../vendors/discord.js";

const skipOnWindows = platform === "win32" ? test.skip : test;

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cc-discord-presence-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function startFakeServer(socketPath) {
  const server = net.createServer();
  const sockets = new Set();
  const waiting = [];
  server.on("connection", (sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    const w = waiting.shift();
    if (w) w.resolve(sock);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  server.__sockets = sockets;
  server.__nextConnection = () => new Promise((resolve) => waiting.push({ resolve }));
  return server;
}

async function stopServer(server) {
  for (const sock of server.__sockets) sock.destroy();
  await new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function tryConsume(buf, waiters) {
  if (waiters.length === 0) return buf;
  if (buf.length < HEADER_SIZE) return buf;
  const length = buf.readUInt32LE(4);
  if (buf.length < HEADER_SIZE + length) return buf;
  const opcode = buf.readUInt32LE(0);
  const payload = buf.subarray(HEADER_SIZE, HEADER_SIZE + length).toString("utf8");
  const next = buf.subarray(HEADER_SIZE + length);
  const w = waiters.shift();
  w.resolve({ opcode, payload });
  return tryConsume(next, waiters);
}

function attachFrameReader(socket) {
  let buf = Buffer.alloc(0);
  const waiters = [];
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    buf = tryConsume(buf, waiters);
  });
  return {
    nextFrame() {
      return new Promise((resolve) => {
        waiters.push({ resolve });
        buf = tryConsume(buf, waiters);
      });
    },
  };
}

async function connectFirstAvailable(dir, maxIndex = 4) {
  return connectToDiscord({
    runtimeDir: dir,
    probeTimeoutMs: 100,
    maxSocketIndex: maxIndex,
    debug: () => {},
  });
}

skipOnWindows("resolveSocketCandidates returns native paths in order", () => {
  const candidates = resolveSocketCandidates({
    runtimeDir: "/run/user/1000",
    flatpakAppId: "com.discordapp.Discord",
    maxSocketIndex: 2,
  });

  const natives = candidates.filter((c) => c.kind === "native");
  assert.deepEqual(natives, [
    { path: "/run/user/1000/discord-ipc-0", kind: "native" },
    { path: "/run/user/1000/discord-ipc-1", kind: "native" },
    { path: "/run/user/1000/discord-ipc-2", kind: "native" },
  ]);
});

skipOnWindows("resolveSocketCandidates appends Flatpak paths after native", () => {
  const candidates = resolveSocketCandidates({
    runtimeDir: "/run/user/1000",
    flatpakAppId: "com.discordapp.Discord",
    maxSocketIndex: 1,
  });

  const flatpaks = candidates.filter((c) => c.kind === "flatpak");
  assert.deepEqual(flatpaks, [
    { path: "/run/user/1000/app/com.discordapp.Discord/discord-ipc-0", kind: "flatpak" },
    { path: "/run/user/1000/app/com.discordapp.Discord/discord-ipc-1", kind: "flatpak" },
  ]);

  const nativeCount = candidates.filter((c) => c.kind === "native").length;
  const flatpakStart = candidates.findIndex((c) => c.kind === "flatpak");
  assert.equal(flatpakStart, nativeCount);
});

skipOnWindows("connectToDiscord finds the first reachable native socket", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-2");
    const server = await startFakeServer(socketPath);
    try {
      const connection = await connectFirstAvailable(dir, 4);
      assert.ok(connection);
      assert.equal(connection.kind, "native");
      assert.equal(connection.path, socketPath);
      await closeSocket(connection.socket);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("connectToDiscord falls back to Flatpak when native is absent", async () => {
  await withTempDir(async (dir) => {
    const flatpakDir = join(dir, "app", "com.discordapp.Discord");
    await mkdir(flatpakDir, { recursive: true });
    const socketPath = join(flatpakDir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      const connection = await connectFirstAvailable(dir, 1);
      assert.ok(connection);
      assert.equal(connection.kind, "flatpak");
      assert.equal(connection.path, socketPath);
      await closeSocket(connection.socket);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("connectToDiscord emits explicit diagnostic on Flatpak-only failure", async () => {
  await withTempDir(async (dir) => {
    const messages = [];
    const connection = await connectToDiscord({
      runtimeDir: dir,
      probeTimeoutMs: 50,
      maxSocketIndex: 1,
      debug: () => {},
      diagnostic: (msg) => messages.push(msg),
    });
    assert.equal(connection, null);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Flatpak/);
    assert.match(messages[0], /Start Discord and retry/);
  });
});

skipOnWindows("connectToDiscord returns null quietly when no socket is reachable", async () => {
  await withTempDir(async (dir) => {
    const connection = await connectToDiscord({
      runtimeDir: dir,
      probeTimeoutMs: 50,
      maxSocketIndex: 1,
      debug: () => {},
    });
    assert.equal(connection, null);
  });
});

skipOnWindows("sendHandshake writes the documented JSON payload", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      const serverSidePromise = server.__nextConnection();
      const connection = await connectFirstAvailable(dir);
      const serverSide = await serverSidePromise;
      const reader = attachFrameReader(serverSide);
      await sendHandshake(connection.socket, "987654321");
      const frame = await reader.nextFrame();
      assert.equal(frame.opcode, 0);
      assert.deepEqual(JSON.parse(frame.payload), { v: 1, client_id: "987654321" });
      await closeSocket(connection.socket);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("sendActivity encodes a SET_ACTIVITY frame with unique nonce", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      const serverSidePromise = server.__nextConnection();
      const connection = await connectFirstAvailable(dir);
      const serverSide = await serverSidePromise;
      const reader = attachFrameReader(serverSide);
      await sendActivity(connection.socket, { details: "d", state: "s" });
      await sendActivity(connection.socket, { details: "d2", state: "s2" });
      const first = JSON.parse((await reader.nextFrame()).payload);
      const second = JSON.parse((await reader.nextFrame()).payload);
      assert.equal(first.cmd, "SET_ACTIVITY");
      assert.equal(first.args.pid, process.pid);
      assert.deepEqual(first.args.activity, { details: "d", state: "s" });
      assert.deepEqual(second.args.activity, { details: "d2", state: "s2" });
      assert.notEqual(first.nonce, second.nonce);
      await closeSocket(connection.socket);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("startKeepalive answers PING with PONG", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      const serverSidePromise = server.__nextConnection();
      const connection = await connectFirstAvailable(dir);
      const serverSide = await serverSidePromise;
      const reader = attachFrameReader(serverSide);

      const unsubscribe = startKeepalive(connection.socket);
      try {
        serverSide.write(encodeFrame(OPCODE_PING, "ping-payload"));
        const reply = await reader.nextFrame();
        assert.equal(reply.opcode, OPCODE_PONG);
        assert.equal(reply.payload, "ping-payload");
      } finally {
        unsubscribe();
      }
      await closeSocket(connection.socket);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("withReconnect reconnects after a disconnect with backoff", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      let opCalls = 0;
      const sleepCalls = [];
      let firstServerSide = null;
      const opResult = await withReconnect(
        async (sock) => {
          opCalls++;
          if (opCalls === 1) {
            firstServerSide = [...server.__sockets][0];
            firstServerSide.destroy();
            await new Promise((resolve) => sock.once("close", resolve));
            return;
          }
          return "ok";
        },
        {
          startMs: 5,
          capMs: 20,
          sleep: (ms) => {
            sleepCalls.push(ms);
            return Promise.resolve();
          },
          connectOptions: {
            runtimeDir: dir,
            probeTimeoutMs: 50,
            maxSocketIndex: 0,
            debug: () => {},
          },
        }
      );
      assert.equal(opResult, "ok");
      assert.equal(opCalls, 2);
      assert.ok(sleepCalls.length >= 1);
    } finally {
      await stopServer(server);
    }
  });
});

skipOnWindows("withReconnect resolves when no socket is reachable after attempts", async () => {
  await withTempDir(async (dir) => {
    let attempts = 0;
    const sleepCalls = [];
    await withReconnect(
      async () => {
        attempts++;
        return "should-not-reach";
      },
      {
        startMs: 5,
        capMs: 10,
        maxAttempts: 3,
        sleep: (ms) => {
          sleepCalls.push(ms);
          return Promise.resolve();
        },
        connectOptions: {
          runtimeDir: dir,
          probeTimeoutMs: 50,
          maxSocketIndex: 0,
          debug: () => {},
        },
      }
    ).catch((err) => {
      assert.match(err.message, /Discord/);
    });
    assert.equal(attempts, 0);
    assert.ok(sleepCalls.length >= 2);
  });
});