# 0005 — Linux-only runtime, but CI runs Linux + Windows

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).

## Context

Discord's IPC transport differs by platform, and the target machine is Arch
Linux. Supporting Windows or macOS would mean a second transport code path
that nobody would exercise.

That settles the *runtime* scope but not the *CI* scope, and the two were
initially conflated: the CI matrix was first narrowed to `ubuntu-latest`
alone on the grounds that Linux is all this project supports. That reasoning
was wrong. Most of this codebase is platform-independent by nature —
activity building, config loading, transcript reading, version computation —
and a stray POSIX-path or separator assumption in any of them is a real bug
regardless of which OS ships. A Windows leg costs nothing and catches
exactly that class of slip.

The reason it can stay green without a Windows code path existing is
[0002](./0002-feature-module-layout.md)'s injectable-resolver rule.
`XDG_RUNTIME_DIR` is undefined on Windows and `path.join(undefined, …)`
throws, so a resolver evaluated at import time would fail the whole leg.
session-guard handles the same problem the other way — it branches on
`process.platform` and supports Windows as a runtime; this project keeps its
Linux-only resolvers out of the tested path entirely instead.

CI test content follows the fail-soft, no-live-dependency posture in
[0001](./0001-daemon-as-socket-holder.md) and
[0002](./0002-feature-module-layout.md): fixtures and injected paths, never a
real Discord.

## Decision

- **Runtime support (v1)**: Linux only. Windows and macOS are deferred, not
  half-supported.
- **CI**: GitHub Actions, `.github/workflows/ci.yml`.
  - Triggers: `pull_request` (any base, so it covers `feat/*` → `release/*`
    and `release/*` → `main`) and `push` to `release/**`.
  - Matrix: `ubuntu-latest` + `windows-latest`, `fail-fast: false`.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` with Node `20` and
    `cache: "npm"`, then `npm ci`, `npm run lint`, `npm test`.
- **The Windows leg is a portability check, not a support claim.** No
  installer, no daemon, and no Discord transport is claimed to work there.
- **No live anything in CI**: no Discord process, no IPC socket, no network,
  no real Claude Code session.
- **No test may call a filesystem resolver's default** — every test injects
  its own directory. This is what keeps the Windows leg green.
- **CI is the merge gate.** The release workflow
  ([0006](./0006-branching-and-semver-by-branch-prefix.md)) is not a gate
  and must never be relied on as one.

## Consequences

- Tested behaviour is the behaviour that carries logic: activity building
  (the primary seam), transcript reading, config loading, session-state
  selection, hook services, protocol frame encode/decode against byte
  fixtures, the installer's settings merge, and version computation.
- The socket controller is not covered against a real Discord. Accepted: it
  is kept thin precisely so the untested part contains no decisions.
- A genuinely Linux-shaped regression can't be caught by the Windows leg,
  and isn't meant to be. Its job is catching accidental platform coupling in
  code that shouldn't have any.
- Revisit macOS or Windows runtime support only alongside a second transport
  implementation. This is a clean deferral; no partial work exists toward it.
