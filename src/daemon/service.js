import { RATE_LIMIT_MS } from "../vendors/discord.js";
import { selectActive } from "../session-state/service.js";
import { loadConfig as defaultLoadConfig } from "../config/service.js";
import { readTranscript as defaultReadTranscript } from "../transcript/service.js";
import { buildActivity } from "../presence/service.js";
import { connectToDiscord, closeSocket } from "../presence/controller.js";
import { shouldPublish as defaultShouldPublish } from "./coalesce.js";
import { acquireLock as defaultAcquireLock, resolveLockPath } from "./lock.js";
import { watchStateDir as defaultWatchStateDir } from "./watch.js";

function basenameOf(value) {
  if (typeof value !== "string" || value === "") return null;
  const idx = value.lastIndexOf("/");
  return idx === -1 ? value : value.slice(idx + 1);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const tickNow = now();
  const built = toActivityState(state, transcript);
  const activity = buildActivity(config, built, { now: tickNow });
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

  try {
    await sendHandshake(connection.socket, config.discord.appId);
    await sendActivity(connection.socket, activity);
  } finally {
    await closeSocket(connection.socket).catch(() => {});
  }

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
  const {
    stateDir,
    configPath,
    lockPath = stateDir !== undefined ? resolveLockPath(stateDir) : undefined,
    gracePeriodMs = 5000,
    rateLimitMs = RATE_LIMIT_MS,
    connect = connectToDiscord,
    sendActivity,
    sendHandshake,
    readTranscript = defaultReadTranscript,
    loadConfig = defaultLoadConfig,
    shouldPublish = defaultShouldPublish,
    acquireLock = defaultAcquireLock,
    watchStateDir = defaultWatchStateDir,
    sleep = defaultSleep,
    now = () => Date.now()
  } = options;

  const lock = acquireLock(lockPath);
  if (lock === null) {
    console.warn("cc-discord daemon could not acquire lock; another instance is running.");
    return;
  }

  let wakeup;
  let resolveWakeup = () => {};
  const rotateWakeup = () => {
    wakeup = new Promise((resolve) => { resolveWakeup = resolve; });
    return wakeup;
  };
  rotateWakeup();

  const watcher = watchStateDir(stateDir, () => {
    resolveWakeup();
  });

  const waitFor = (ms) => {
    rotateWakeup();
    return Promise.race([sleep(ms), wakeup]);
  };

  try {
    let lastPublishAt = 0;
    let emptySince = null;

    while (true) {
      const result = await runTick({
        stateDir,
        configPath,
        lastPublishAt,
        rateLimitMs,
        connect,
        sendActivity,
        sendHandshake,
        readTranscript,
        loadConfig,
        shouldPublish,
        now
      });

      if (result.error === "appIdMissing") {
        console.error("cc-discord: discord.appId is missing in the config; exiting.");
        return;
      }

      if (result.published) {
        lastPublishAt = result.nextPublishAt ?? now();
        emptySince = null;
        await waitFor(rateLimitMs);
        continue;
      }

      if (result.shouldExit) {
        if (emptySince === null) {
          emptySince = now();
          await waitFor(Math.max(20, Math.min(gracePeriodMs, 100)));
          continue;
        }
        if (now() - emptySince >= gracePeriodMs) {
          return;
        }
        const remaining = Math.max(20, gracePeriodMs - (now() - emptySince));
        await waitFor(Math.min(remaining, 100));
        continue;
      }

      const waitMs = Math.max(20, (result.nextPublishAt ?? now()) - now());
      await waitFor(waitMs);
    }
  } finally {
    watcher.close();
    lock.release();
  }
}
