import { RATE_LIMIT_MS } from "../vendors/discord.js";
import { selectActive, resolveStateDir } from "../session-state/service.js";
import { loadConfig as defaultLoadConfig, resolveConfigPath } from "../config/service.js";
import { readTranscript as defaultReadTranscript } from "../transcript/service.js";
import { buildActivity } from "../presence/service.js";
import {
  connectToDiscord,
  closeSocket,
  startKeepalive,
  sendActivity as defaultSendActivity,
  sendHandshake as defaultSendHandshake
} from "../presence/controller.js";
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

export async function runTick(options = {}) {
  const {
    stateDir = resolveStateDir(),
    configPath = resolveConfigPath(),
    lastPublishAt = 0,
    rateLimitMs = RATE_LIMIT_MS,
    connect = connectToDiscord,
    sendActivity = defaultSendActivity,
    sendHandshake = defaultSendHandshake,
    readTranscript = defaultReadTranscript,
    loadConfig = defaultLoadConfig,
    shouldPublish = defaultShouldPublish,
    keepalive = startKeepalive,
    now = () => Date.now(),
    // Discord clears a client's Rich Presence the moment its IPC socket
    // closes, so the daemon hands the same connection back in on every tick
    // and this function must leave it open. A caller that passes nothing keeps
    // the self-contained connect-publish-disconnect behaviour.
    connection = null,
    persistent = false
  } = options;

  const { state, otherCount } = await selectActive(stateDir);

  if (state === null) {
    return {
      activity: null,
      published: false,
      activeSession: null,
      otherCount,
      shouldExit: true,
      connection
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
      error: "appIdMissing",
      connection
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
      // Handed straight back: a coalesced tick must not tear down the
      // connection, or the presence it is holding up disappears.
      connection,
      nextPublishAt: coalesce.nextPublishAt
    };
  }

  const reusable = connection !== null && !connection.socket.destroyed;
  const live = reusable ? connection : await connect();
  if (live === null || live === undefined) {
    return {
      activity,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: false,
      connection: null,
      nextPublishAt: coalesce.nextPublishAt
    };
  }

  if (persistent && !reusable && live.stopKeepalive === undefined) {
    // Discord pings a long-lived connection and drops it if nobody pongs.
    live.stopKeepalive = keepalive(live.socket);
  }

  const drop = async () => {
    if (typeof live.stopKeepalive === "function") live.stopKeepalive();
    await closeSocket(live.socket).catch(() => {});
  };

  try {
    // The handshake identifies the app once per connection, not once per publish.
    if (live.handshaked !== true) {
      await sendHandshake(live.socket, config.discord.appId);
      live.handshaked = true;
    }
    await sendActivity(live.socket, activity);
  } catch (err) {
    // A half-dead socket must not kill the daemon: drop it and let the next
    // tick reconnect from scratch.
    await drop();
    return {
      activity,
      published: false,
      activeSession: state.sessionId,
      otherCount,
      shouldExit: false,
      connection: null,
      error: "publishFailed",
      errorMessage: err.message,
      nextPublishAt: coalesce.nextPublishAt
    };
  }

  if (!persistent) await drop();

  return {
    activity,
    published: true,
    activeSession: state.sessionId,
    otherCount,
    shouldExit: false,
    connection: persistent ? live : null,
    nextPublishAt: tickNow
  };
}

// The daemon launcher calls this with no arguments, so the two paths the loop
// cannot run without have to default to their production locations here.
export async function runLoop(options = {}) {
  const {
    stateDir = resolveStateDir(),
    configPath = resolveConfigPath(),
    lockPath = stateDir !== undefined ? resolveLockPath(stateDir) : undefined,
    gracePeriodMs = 5000,
    rateLimitMs = RATE_LIMIT_MS,
    connect = connectToDiscord,
    sendActivity = defaultSendActivity,
    sendHandshake = defaultSendHandshake,
    readTranscript = defaultReadTranscript,
    loadConfig = defaultLoadConfig,
    shouldPublish = defaultShouldPublish,
    keepalive = startKeepalive,
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

  let connection = null;

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
        keepalive,
        now,
        connection,
        persistent: true
      });

      // Carried across ticks so the presence stays up between publishes.
      connection = result.connection ?? null;

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
    if (connection !== null) {
      if (typeof connection.stopKeepalive === "function") connection.stopKeepalive();
      await closeSocket(connection.socket).catch(() => {});
    }
    lock.release();
  }
}
