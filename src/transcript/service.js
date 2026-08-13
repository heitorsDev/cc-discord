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
  for (const line of raw.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry && entry.type === "title" && typeof entry.text === "string") {
      title = entry.text;
    }
  }

  return { title, latestPrompt: null };
}
