export function shouldPublish({ lastPublishAt, now, rateLimitMs }) {
  return { shouldPublish: false, nextPublishAt: now };
}
