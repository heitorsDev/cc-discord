import { RATE_LIMIT_MS } from "../vendors/discord.js";
import { selectActive } from "../session-state/service.js";
import { loadConfig as defaultLoadConfig } from "../config/service.js";
import { readTranscript as defaultReadTranscript } from "../transcript/service.js";
import { buildActivity } from "../presence/service.js";
import { connectToDiscord } from "../presence/controller.js";
import { shouldPublish as defaultShouldPublish } from "./coalesce.js";

function basenameOf(value) {
  if (typeof value !== "string" || value === "") return null;
  const idx = value.lastIndexOf("/");
  return idx === -1 ? value : value.slice(idx + 1);
}

export function toActivityState(state, transcript) {
  return {
    title: transcript.title,
    project: basenameOf(state.cwd),
    model: state.model ?? null,
    startedAt: state.startedAt,
    turns: state.turns ?? null,
    lastPrompt: transcript.latestPrompt,
    gitBranch: null,
    lastActivityAt: state.lastActivityAt,
    offline: false
  };
}

export async function runTick(options) {
  const {
    stateDir,
    configPath,
    lastPublishAt = 0,
    rateLimitMs = RATE_LIMIT_MS,
    connect = connectToDiscord,
    sendActivity,
    sendHandshake,
    readTranscript = defaultReadTranscript,
    loadConfig = defaultLoadConfig,
    shouldPublish = defaultShouldPublish,
    now = () => Date.now()
  } = options;

  const { state, otherCount } = await selectActive(stateDir);

  if (state === null) {
    return {
      activity: null,
      published: false,
      activeSession: null,
      otherCount,
      shouldExit: true
    };
  }

  const { config, appIdMissing } = await loadConfig(configPath);
  if (appIdMissing) {
    return {
      activity: null,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: true,
      error: "appIdMissing"
    };
  }

  const transcript = await readTranscript(state.transcriptPath);
  const built = toActivityState(state, transcript);
  const activity = buildActivity(config, built, { now: now() });

  const tickNow = now();
  const coalesce = shouldPublish({ lastPublishAt, now: tickNow, rateLimitMs });

  if (!coalesce.shouldPublish) {
    return {
      activity,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: false,
      nextPublishAt: coalesce.nextPublishAt
    };
  }

  const connection = await connect();
  if (connection === null) {
    return {
      activity,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: false,
      nextPublishAt: coalesce.nextPublishAt
    };
  }

  await sendHandshake(connection.socket, config.discord.appId);
  await sendActivity(connection.socket, activity);

  return {
    activity,
    published: true,
    activeSession: state.sessionId,
    otherCount,
    shouldExit: false,
    nextPublishAt: tickNow
  };
}

export async function runLoop(options) {
  void options;
  return;
}
