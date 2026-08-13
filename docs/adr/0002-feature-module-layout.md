# 0002 — Feature module layout: vendors / controller / service

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).
Adapted from session-guard's ADR 0007 (`feature-module-layout-vendors-controllers-services`).

## Context

This project is the second Claude Code hook bundle in this account, after
[`heitorsDev/session-guard`](https://github.com/heitorsDev/session-guard).
Keeping the two navigable by the same reflexes — and by the same agents —
is worth more than any local improvement to the layout, so the layout was
taken from there rather than redesigned.

session-guard's source was read directly for this ADR, not just its ADRs,
because the prose convention and the actual code differed in one place
(injection style, below).

## Decision

**Zero runtime dependencies.** The Discord IPC wire format is ~80 lines and
is embedded, the same way session-guard embeds its Anthropic usage fetch
instead of taking an SDK. Dev dependencies are lint and test only; tests run
on the Node built-in runner (`node --test`). `package.json` and
`eslint.config.js` match session-guard's.

**Three module roles.**

- `vendors/` — a foreign system's constants and magic values, nothing else.
  session-guard's `src/vendors/anthropic.js` is ten exported constants;
  `src/vendors/discord.js` is opcodes, header layout, and the rate-limit
  window.
- `controller.js` — owns exactly one external I/O boundary. session-guard's
  `src/usage/controller.js` is the `fetch`; `src/presence/controller.js` is
  the socket.
- `service.js` — logic, as individually exported functions, receiving its
  I/O boundaries from the caller.

**The concrete tree**, since naming roles without addresses is how the
daemon, the socket, and the activity builder end up in one file:

```
src/
├── vendors/discord.js              ← opcodes, header layout, rate-limit window
├── presence/
│   ├── controller.js               ← socket: probe, connect, frame I/O
│   └── service.js                  ← activity building (the primary test seam)
├── session-state/service.js        ← write / delete / list / select state files
├── config/service.js               ← load, merge defaults, fail closed
├── transcript/service.js           ← title + latest-prompt extraction
├── daemon/                         ← lock, watch, coalescing timer, reconnect
├── installer/{copy.js,settings.js}
├── release/next-version.js
└── hooks/
    ├── session-start/{hook.js,service.js}
    ├── user-prompt-submit/{hook.js,service.js}
    └── session-end/{hook.js,service.js}
```

**Hooks are thin adapters.** Each hook is a directory whose `hook.js` reads
stdin, parses JSON, delegates to its sibling `service.js`, and writes the
result to stdout — guarded by
`import.meta.url === pathToFileURL(process.argv[1]).href` so importing it
never executes it. All logic lives in the service.

**Injection style is mixed, on purpose.** This is session-guard's actual
convention, and copying its prose instead of its code would get it wrong:

- one boundary → positional parameter with a default —
  `getUsage(credentialsPath = resolveCredentialsPath())`
- two or more → options object with destructured defaults —
  `handlePreToolUse(stdinPayload, options = {})`

Wrapping a single-boundary service in an options object for the sake of
uniformity is not the house style.

**Shared logic is extracted, never repeated.** All three hooks touch the
same state directory, so reading, writing, deleting, and selecting state
files lives in one `src/session-state/service.js` that hook services and
the daemon both call. Precedent: session-guard extracted
`src/hooks/usage-hook-response.js` and `src/hooks/format-usage.js` rather
than repeating a shape across three hook services.

**Fail soft.** Every read of an external resource returns a null-ish result
rather than throwing. A missing Discord, a malformed transcript, and an
absent config are non-events. The daemon's connection loop is the single
scoped exception — see [0001](./0001-daemon-as-socket-holder.md).

**Filesystem locations are resolved behind injectable boundaries**, never
inlined at a use site: the state directory, the config file, and Discord's
socket directory each come from a resolver a caller may override. Tests
inject a temp directory and **no test may call a resolver's default** — see
[0005](./0005-os-scope-and-ci-matrix.md) for why the Windows CI leg depends
on this.

## Consequences

- The primary test seam is `src/presence/service.js`: give it a config and
  a session state, assert on the activity payload. Field switching, `alt`
  substitution, separator collapsing, template rendering, privacy
  precedence, and idle rendering are all reachable there without a socket.
- Both repos can be navigated with the same expectations, and an agent that
  has read one can find its way around the other.
- Embedding the wire protocol means a Discord protocol change is our
  problem to fix rather than a dependency bump — accepted deliberately, and
  the reason `vendors/discord.js` isolates every magic value in one file.
