# cc-discord

Publishes your current Claude Code session as Discord Rich Presence.

Architecture mirrors [`heitorsDev/session-guard`](https://github.com/heitorsDev/session-guard):
zero runtime dependencies, `vendors` / `controller` / `service` module layout,
hooks as thin stdin/stdout adapters over injectable services.

Spec: see issue #1.
