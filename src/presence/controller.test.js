import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSocketCandidates } from "./controller.js";

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
