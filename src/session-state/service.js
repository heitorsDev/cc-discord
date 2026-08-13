import { join } from "node:path";

export function resolveStateDir() {
  return join(process.env.XDG_STATE_HOME ?? join(...["home", process.env.USER ?? "", ".local", "state"]), "cc-discord");
}
