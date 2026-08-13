import { readFile } from "node:fs/promises";

export function resolveTranscriptPath() {
  const fromEnv = process.env.CC_DISCORD_TRANSCRIPT;
  if (fromEnv) return fromEnv;
  return null;
}

export async function readTranscript(transcriptPath = resolveTranscriptPath()) {
  let raw;
  try {
    raw = await readFile(transcriptPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { title: null, latestPrompt: null };
    }
    throw err;
  }

  let title = null;
  let currentMessageId = null;
  const userMessages = new Map();

  for (const line of raw.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    if (entry.type === "title" && typeof entry.text === "string") {
      title = entry.text;
    } else if (entry.type === "user-message" && typeof entry.id === "string" && typeof entry.text === "string") {
      userMessages.set(entry.id, entry.text);
    } else if (entry.type === "current-message-pointer" && typeof entry.messageId === "string") {
      currentMessageId = entry.messageId;
    }
  }

  const latestPrompt = currentMessageId === null ? null : userMessages.get(currentMessageId) ?? null;

  return { title, latestPrompt };
}
