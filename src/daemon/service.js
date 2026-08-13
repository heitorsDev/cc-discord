import { RATE_LIMIT_MS } from "../vendors/discord.js";
import { selectActive } from "../session-state/service.js";
import { loadConfig as defaultLoadConfig } from "../config/service.js";
import { readTranscript as defaultReadTranscript } from "../transcript/service.js";
import { buildActivity } from "../presence/service.js";
import { connectToDiscord } from "../presence/controller.js";

function basenameOf(value) {
  if (typeof value !== "string" || value === "") return null;
  const idx = value.lastIndexOf("/");
  return idx === -1 ? value : value.slice(idx + 1);
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
  const built = {
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

  const activity = buildActivity(config, built, { now: now() });
  const nextPublishAt = lastPublishAt + rateLimitMs;

  if (now() - lastPublishAt < rateLimitMs) {
    return {
      activity,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: false,
      nextPublishAt
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
      nextPublishAt
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
    nextPublishAt: now()
  };
}

export async function runLoop(options) {
  void options;
  return;
}
