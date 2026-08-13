# 0004 — Dual distribution, one installer, global scope

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).
Adopts session-guard's ADR 0004 (`distribution-and-install`).

## Context

The requirement was "install this the same way I install session-guard" —
Claude Code tooling should be consistent across this account, so this ADR is
adoption rather than design.

session-guard's own ADR 0004 records one amendment worth carrying over
rather than rediscovering: its first pass specified the standalone install
path as `npx`/npm, which was then dropped because it round-trips through the
npm registry for no benefit. The curl-pipe path fetches the repo directly
instead.

## Decision

- **Stack**: Node.js, pure stdlib, no build step.
- **Two entry points over one installer codebase** (`bin/install.js`):
  - a Claude Code plugin — `.claude-plugin/plugin.json` +
    `marketplace.json`;
  - a standalone curl-pipe `install.sh` — a thin shim that checks for Node,
    then either runs a local `bin/install.js` when executed inside a clone
    or, on the curl-pipe path, fetches the repo into a temp directory itself
    (`curl` + `tar`, or `git clone --depth 1`) and execs
    `node bin/install.js` from there.
- **No npm registry package and no `npx`, at any point.** `package.json`
  carries no `bin` field; it exists for `engines` and metadata only, and
  stays `private: true`.
- **Install scope is global** (`~/.claude/settings.json`), not per-repo.
  Presence is a property of the machine's Claude Code, not of one project,
  so a per-project reinstall would be ceremony with nothing behind it.
- **The settings merge is idempotent**: JSONC-tolerant read, marker-substring
  idempotency check, atomic write, `hooks.*` arrays appended to rather than
  replaced, unrelated hooks left untouched. Re-running the installer must
  never duplicate a hook entry.
- **No `install.ps1`.** Windows is not a supported runtime (see
  [0005](./0005-os-scope-and-ci-matrix.md)), and shipping a shim for it
  would promise support that doesn't exist.

## Consequences

- Installing works on a machine that has never cloned the repo, with no
  git workflow and no npm-capable environment.
- The shim owns its own repo-fetch logic instead of delegating to npm's
  package resolution — slightly more code in `install.sh`, zero dependency
  on the registry.
- Installed once, it applies in every repo, which matches presence being
  machine-wide.
- The settings merge is the one installer behaviour that can corrupt a
  user's config, so idempotency and preservation of unrelated hooks are
  covered by tests (see [0005](./0005-os-scope-and-ci-matrix.md)) rather
  than by care.
