export function resolveTranscriptPath() {
  const fromEnv = process.env.CC_DISCORD_TRANSCRIPT;
  if (fromEnv) return fromEnv;
  return null;
}
