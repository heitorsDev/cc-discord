# 0003 — JSON config, `show`/`alt` field pairs, privacy as a separate axis

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).

## Context

Presence is visible to everyone who can see the user's Discord profile, and
some of the projects worked in are client work whose directory names and
session titles must not be broadcast. That makes config a privacy
mechanism, not a preferences file, and it means the failure modes matter
more than the ergonomics.

Two format options were weighed. TOML would need either a runtime
dependency or a hand-rolled parser, and both violate the zero-dependency
posture in [0002](./0002-feature-module-layout.md).

A single boolean per field was considered and rejected: switching a field
off would leave a hole in the rendered presence, and the user asked for
switched-off fields to fall back to text they chose rather than silently
vanishing.

A single combined switch-and-privacy axis was also considered and rejected:
if the only thing standing between a client project and a published
directory name is one boolean among seven, the wrong toggle leaks it.

## Decision

- **JSON, not TOML.** Parsed by the platform, and it matches the shape of
  the Claude Code settings file the installer already reads.
- One config file under the user's config directory, **re-read on change**,
  so the master switch and every other value take effect on the next update
  without restarting the daemon or the session.
- **Every publishable field is a `show` + `alt` pair**, never a bare
  boolean. Switching a field off substitutes text the user chose.
- **An `alt` of empty string means collapse**: the field contributes
  nothing and its adjacent separator is removed, so a template never
  renders orphaned punctuation.
- `display.details` and `display.state` are **templates** over field
  placeholders, so composition is config rather than code.
- **`privacy` is a second, independent axis.** `fields` decides which values
  may exist; `privacy` decides which projects may publish real values at
  all. Resolution precedence, highest first: privacy override → a field's
  `alt` when switched off → the real value → that field's `alt` when the
  data is missing. Privacy sits *above* the field switches specifically so
  that no combination of field settings can leak a blocked project.
- **`privacy.mode` defaults to `allowlist` with `["*"]`** — a fresh install
  publishes everything and works without configuration.
- **Missing or malformed config fails closed** to generic text, not to full
  disclosure. A typo must never publish a client's project name.
- **`discord.appId` is required.** Empty means the daemon reports a clear
  error and exits rather than half-running. Hot-reload means pasting the ID
  connects on the next tick. An application ID is public data by nature —
  every RPC client ships it in the clear — so it needs no secret handling.

## Consequences

- A new install publishes real project names and session titles until the
  allowlist is narrowed. This was chosen deliberately over an empty
  allowlist; `lastPrompt` defaulting to off is what keeps prompt bodies
  private regardless.
- Config loading and activity building carry the privacy guarantee, so both
  are tested against malformed input specifically — fail-closed is a tested
  behaviour, not an intention.
- Two axes mean two places to look when a field renders unexpectedly. The
  fixed precedence order is the mitigation, and it is asserted in tests
  rather than left to reading.
