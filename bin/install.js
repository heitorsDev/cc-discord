import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mergeHooks, resolveConfigHome, resolveSettingsPath, HOOK_EVENTS } from "../src/installer/settings.js";
import { copyTree, markExecutable } from "../src/installer/copy.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function envOrUndefined(name) {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Hooks are copied out of the package into a stable root. The package itself
 * may be a throwaway clone (install.sh clones into a temp dir it then deletes),
 * so pointing settings.json at the package path would leave dangling commands.
 */
export function defaultInstallRoot() {
  return join(resolveConfigHome(), "cc-discord");
}

export async function runInstall(options = {}) {
  const settingsPath =
    options.settingsPath ?? envOrUndefined("CC_DISCORD_SETTINGS_PATH") ?? resolveSettingsPath();
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const installRoot =
    options.installRoot ?? envOrUndefined("CC_DISCORD_INSTALL_ROOT") ?? defaultInstallRoot();
  const nodePath = options.nodePath ?? process.execPath;
  const commandBase = options.commandBase ?? join(installRoot, "src", "hooks") + "/";

  // The repo layout is preserved under installRoot so the hooks' relative
  // imports (../../session-state, ../../../bin/cc-discord-daemon.js) resolve.
  if (resolve(packageRoot) !== resolve(installRoot)) {
    await copyTree(join(packageRoot, "src"), join(installRoot, "src"));
    await copyTree(join(packageRoot, "bin"), join(installRoot, "bin"));
  }

  await markExecutable([
    ...HOOK_EVENTS.map(({ script }) => `${commandBase}${script}`),
    join(installRoot, "bin", "cc-discord-daemon.js"),
  ]);

  await mergeHooks(settingsPath, { commandBase, nodePath });
  return { settingsPath, commandBase, installRoot, nodePath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runInstall()
    .then(({ settingsPath, installRoot }) => {
      process.stdout.write(
        `cc-discord installed: hooks copied to ${installRoot}, registered in ${settingsPath}\n`
      );
    })
    .catch((err) => {
      process.stderr.write(`install failed: ${err.message}\n`);
      process.exit(1);
    });
}
