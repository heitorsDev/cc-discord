import { readFile } from "node:fs/promises";

export function resolveTranscriptPath() {
  const fromEnv = process.env.CC_DISCORD_TRANSCRIPT;
  if (fromEnv) return fromEnv;
  return null;
}

export async function readTranscript(transcriptPath = resolveTranscriptPath()) {
  try {
    await readFile(transcriptPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { title: null, latestPrompt: null };
    }
    throw err;
  }
  return { title: null, latestPrompt: null };
}
