import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mergeHooks, resolveSettingsPath } from "../src/installer/settings.js";
import { copyHookScripts } from "../src/installer/copy.js";

function envOrUndefined(name) {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function defaultHooksDir() {
  return join(process.cwd(), "hooks") + "/";
}

export async function runInstall(options = {}) {
  const settingsPath =
    options.settingsPath ?? envOrUndefined("CC_DISCORD_SETTINGS_PATH") ?? resolveSettingsPath();
  const commandBase = options.commandBase ?? defaultHooksDir();
  const srcDir = options.srcDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "hooks");

  await mergeHooks(settingsPath, { commandBase });
  await copyHookScripts(srcDir, commandBase.replace(/\/$/, ""));
  return { settingsPath, commandBase };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runInstall()
    .then(({ settingsPath }) => {
      process.stdout.write(`cc-discord installed: hooks registered in ${settingsPath}\n`);
    })
    .catch((err) => {
      process.stderr.write(`install failed: ${err.message}\n`);
      process.exit(1);
    });
}

