export function shouldPublish({ lastPublishAt, now, rateLimitMs }) {
  const elapsed = now - lastPublishAt;
  const nextPublishAt = lastPublishAt + rateLimitMs;
  return {
    shouldPublish: elapsed >= rateLimitMs,
    nextPublishAt
  };
}
