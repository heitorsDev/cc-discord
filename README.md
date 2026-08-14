# cc-discord

Publishes your current Claude Code session as Discord Rich Presence. A daemon
holds the Discord socket; hooks write a session file the daemon watches. Hooks
add no perceptible latency to prompts.

Architecture mirrors [`heitorsDev/session-guard`](https://github.com/heitorsDev/session-guard):
zero runtime dependencies, `vendors` / `controller` / `service` module layout,
hooks as thin stdin/stdout adapters. Spec: issue #1.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/heitorsDev/cc-discord/main/install.sh | bash
```

The installer copies the runtime into `~/.claude/cc-discord/` and writes three
hook entries into `~/.claude/settings.json`, each invoking the hook through the
absolute path of the `node` binary used to install. No npm, no `npx`.

Re-running the installer refreshes the copied files and rewrites its own hook
entries in place — it never appends a duplicate, and hooks belonging to other
tools are left untouched. Set `CC_DISCORD_INSTALL_ROOT` to install elsewhere.

## Discord application setup

1. Visit https://discord.com/developers/applications and create an application.
2. Copy the **Application ID** from "General Information".
3. Paste it into `~/.config/cc-discord/config.json` as `discord.appId`. The
   daemon exits with a clear message if this is empty.
4. Rich Presence icons are uploaded from the "Rich Presence" → "Art Assets"
   page. The default `discord.largeImage` is `claude_logo`; change it to
   whatever key you uploaded.

## Config

Default config (the file is created on first run if missing):

```json
{
  "enabled": true,
  "discord": { "appId": "", "largeImage": "claude_logo", "smallImage": "" },
  "display": {
    "details": "{title}",
    "state": "{model} · {turns} · {lastPrompt}",
    "idle": "Idle",
    "offline": "",
    "idleAfter": "5m"
  },
  "fields": {
    "title":      { "show": true,  "alt": "Working on something" },
    "project":    { "show": true,  "alt": "a project" },
    "model":      { "show": true,  "alt": "Claude Code" },
    "elapsed":    { "show": true,  "alt": "" },
    "turns":      { "show": false, "alt": "" },
    "lastPrompt": { "show": false, "alt": "thinking...", "maxLen": 60 },
    "gitBranch":  { "show": false, "alt": "" }
  },
  "privacy": {
    "mode": "allowlist",
    "allowlist": ["*"],
    "denylist": [],
    "alt": { "title": "Coding", "project": "a project", "lastPrompt": "" }
  }
}
```

Call-outs:

- `enabled` — master switch. Live-reloaded; flip it to `false` to stop
  publishing without restarting anything.
- `discord.appId` — required. The daemon exits with a clear message if empty.
- `display.idleAfter` — inactivity timeout before `idle` text replaces the
  live template. Default `5m`. Set to `"0"` to disable.
- `display.offline` — empty by default; when empty the daemon clears
  presence when no session is active.
- `fields.*` — each has `show` and `alt`. When `alt` is `""`, the field is
  collapsed and its separator is removed from the rendered template.
- `privacy` — defaults to `allowlist: ["*"]`, which publishes everything.
  For client work, narrow the allowlist to specific project paths or
  switch to `denylist` mode.

## How it works

`SessionStart` writes a small JSON file under `$XDG_STATE_HOME/cc-discord/`
and spawns a detached daemon. The daemon owns the Discord IPC socket (Discord
binds activity to socket lifetime, and hooks are short-lived); it watches the
state directory and publishes on a rate-limit timer. `UserPromptSubmit` and
`SessionEnd` update or remove the same file. The daemon exits after a grace
period when no session remains, so nothing stays running when Claude Code
isn't. Hooks never open a socket and never wait on the daemon.

## Troubleshooting

- **Discord is not running.** The daemon retries with backoff; presence is
  quietly absent. No error, no retry storm.
- **No `discord.appId`.** The daemon logs
  `cc-discord: discord.appId is missing in the config; exiting.` and exits.
  Add the Application ID and start a new session.
- **Master switch off.** `enabled: false` causes `SessionStart` to write
  nothing and spawn nothing. Flip it back and start a new session.
- **Flatpak Discord.** The socket probe handles the Flatpak path
  automatically; no extra config.
- **Hook latency.** `SessionStart` returns in well under 50ms. If it
  doesn't, the daemon is not actually detached — check that
  `bin/cc-discord-daemon.js` is reachable from the hook's install directory.
