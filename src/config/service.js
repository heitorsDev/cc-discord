import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  discord: {
    appId: "",
    largeImage: "claude_logo",
    smallImage: ""
  },
  display: {
    details: "{title}",
    state: "{model} · {turns} · {lastPrompt}",
    idle: "Idle",
    offline: "",
    idleAfter: "5m"
  },
  fields: {
    title:      { show: true,  alt: "Working on something" },
    project:    { show: true,  alt: "a project" },
    model:      { show: true,  alt: "Claude Code" },
    elapsed:    { show: true,  alt: "" },
    turns:      { show: false, alt: "" },
    lastPrompt: { show: false, alt: "thinking...", maxLen: 60 },
    gitBranch:  { show: false, alt: "" }
  },
  privacy: {
    mode: "allowlist",
    allowlist: ["*"],
    denylist: [],
    alt: {
      title: "Coding",
      project: "a project",
      lastPrompt: ""
    }
  }
});

export function resolveConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configHome, "cc-discord", "config.json");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
  }
  return value;
}

function deepMerge(base, override) {
  const out = deepClone(base);
  for (const key of Object.keys(override)) {
    if (!(key in out)) continue;
    const baseVal = out[key];
    const overVal = override[key];
    if (isPlainObject(baseVal) && isPlainObject(overVal)) {
      out[key] = deepMerge(baseVal, overVal);
    } else {
      out[key] = overVal;
    }
  }
  return out;
}

function failClosedConfig() {
  const config = deepClone(DEFAULT_CONFIG);
  for (const [fieldKey, altValue] of Object.entries(config.privacy.alt)) {
    if (config.fields[fieldKey]) {
      config.fields[fieldKey] = { ...config.fields[fieldKey], show: false, alt: altValue };
    }
  }
  return config;
}

export async function loadConfig(configPath = resolveConfigPath()) {
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return { config: deepClone(DEFAULT_CONFIG), appIdMissing: true, failedClosed: false };
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: failClosedConfig(), appIdMissing: true, failedClosed: true };
  }
  if (!isPlainObject(parsed)) {
    return { config: failClosedConfig(), appIdMissing: true, failedClosed: true };
  }
  const config = deepMerge(DEFAULT_CONFIG, parsed);
  return { config, appIdMissing: !config.discord.appId, failedClosed: false };
}
