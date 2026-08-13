import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectToDiscord, resolveSocketCandidates } from "./controller.js";

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
  server.on("connection", (sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  server.__sockets = sockets;
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

test("resolveSocketCandidates returns native paths in order", () => {
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

test("resolveSocketCandidates appends Flatpak paths after native", () => {
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

test("connectToDiscord finds the first reachable native socket", async () => {
  await withTempDir(async (dir) => {
    const socketPath = join(dir, "discord-ipc-2");
    const server = await startFakeServer(socketPath);
    try {
      const connection = await connectToDiscord({
        runtimeDir: dir,
        probeTimeoutMs: 100,
        maxSocketIndex: 4,
        debug: () => {},
      });
      assert.ok(connection);
      assert.equal(connection.kind, "native");
      assert.equal(connection.path, socketPath);
      await new Promise((resolve) => connection.socket.end(resolve));
    } finally {
      await stopServer(server);
    }
  });
});

test("connectToDiscord falls back to Flatpak when native is absent", async () => {
  await withTempDir(async (dir) => {
    const flatpakDir = join(dir, "app", "com.discordapp.Discord");
    await mkdir(flatpakDir, { recursive: true });
    const socketPath = join(flatpakDir, "discord-ipc-0");
    const server = await startFakeServer(socketPath);
    try {
      const connection = await connectToDiscord({
        runtimeDir: dir,
        probeTimeoutMs: 100,
        maxSocketIndex: 1,
        debug: () => {},
      });
      assert.ok(connection);
      assert.equal(connection.kind, "flatpak");
      assert.equal(connection.path, socketPath);
      await new Promise((resolve) => connection.socket.end(resolve));
    } finally {
      await stopServer(server);
    }
  });
});

test("connectToDiscord emits explicit diagnostic on Flatpak-only failure", async () => {
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
