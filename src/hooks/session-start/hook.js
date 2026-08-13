import { pathToFileURL } from "node:url";

import { handleSessionStart } from "./service.js";
import { resolveConfigPath } from "../../config/service.js";
import { resolveStateDir } from "../../session-state/service.js";

const isDirectInvocation = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    payload = {};
  }
  await handleSessionStart(payload, {
    stateDir: resolveStateDir(),
    configPath: resolveConfigPath()
  });
}
