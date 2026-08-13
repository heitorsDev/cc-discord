# 0001 — A daemon holds the Discord socket; hooks never touch it

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).

## Context

Discord binds a Rich Presence activity to the lifetime of the IPC
connection that set it. When the connecting process exits, the presence
disappears. Claude Code hooks are short-lived processes — they read stdin,
write stdout, and die — so a hook cannot publish presence that outlives
itself. Something has to hold the socket open.

This is the one architectural question where
[`heitorsDev/session-guard`](https://github.com/heitorsDev/session-guard),
the reference for everything else in this repo (see
[0002](./0002-feature-module-layout.md)), offers no precedent to copy.
session-guard runs **no long-lived process at all**: each hook fetches
usage, formats it, and exits. Its "every read of an external resource
returns a null-ish result rather than throwing" convention is a statement
about one-shot reads, and it does not describe a connection that must be
re-established after Discord restarts.

Alternatives considered:

- **A systemd user unit.** Rejected: it binds presence to the login
  session rather than to Claude Code, which is the opposite of the
  requirement that presence appear and disappear with the editor. It also
  reintroduces the enable/disable ceremony the config's master switch
  exists to replace.
- **A hook that publishes and exits.** Not viable — the protocol clears
  the activity the moment the socket closes.
- **A hook that lingers for the turn.** Rejected: it puts Discord I/O on
  the prompt path, which the latency requirement forbids.

## Decision

- A **daemon** owns the Discord socket. It is the smallest thing that can
  outlive a hook invocation: a socket-holder, not a poller.
- It is started by the `SessionStart` hook, so its lifetime tracks Claude
  Code rather than the login session. Single-instance is enforced by a
  lock, so concurrent `SessionStart` hooks cannot race two daemons onto the
  socket.
- **No hook opens a socket and no hook waits on the daemon.** The state
  directory is the only interface between them, which keeps hooks off the
  network and makes both sides testable in isolation.
- The daemon watches the state directory and publishes on a timer,
  coalescing to at most one activity update per Discord's rate-limit
  window. State writes and activity updates are deliberately decoupled:
  `UserPromptSubmit` writes as often as it likes.
- When the last state file disappears, the daemon clears the presence and
  exits after a grace period. Nothing is left running when Claude Code
  isn't.
- **The daemon's failure mode is retry, not `null`.** Disconnects trigger a
  re-probe with backoff rather than an exit. This is an explicit, scoped
  exception to the fail-soft convention in
  [0002](./0002-feature-module-layout.md), and it applies to the daemon's
  connection loop only — every other external read still degrades to a
  null-ish value.

## Consequences

- Presence follows Claude Code's lifecycle with no service manager, no
  enable/disable commands, and nothing running at idle.
- This repo now contains a stateful long-lived component that
  session-guard's conventions do not cover. The lock, the watch, the
  coalescing timer, and the backoff loop are this project's own design and
  cannot be reviewed by analogy to session-guard.
- The socket controller is deliberately kept thin and is **not**
  unit-tested against a real Discord. What carries logic — protocol frame
  encoding and activity building — is tested without a socket (see
  [0002](./0002-feature-module-layout.md)).
- Restarting Discord mid-session recovers on its own; Discord not running
  at all is a non-event rather than a startup failure.
