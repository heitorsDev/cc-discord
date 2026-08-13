# 0006 — Branching model and semver bump derived from branch prefix

## Status

Accepted. Source: the v1 spec, [issue #1](https://github.com/heitorsDev/cc-discord/issues/1).
Adopts session-guard's ADRs 0006 (`branching-and-release-strategy`) and 0008
(`semver-bump-by-branch-prefix`) as they stand after 0008 superseded 0006's
branch-name-as-version rule.

## Context

Tickets from the spec ship independently rather than as one change, and
versions should exist without anyone tagging by hand.

session-guard arrived at this in two steps, and only the end state is worth
adopting: its first release workflow read the target version literally out of
a `release/x.y.z` branch name, which meant deciding and typing the next
version number correctly by hand every time, relative to whatever was already
tagged. Its ADR 0008 replaced that with a bump computed from the latest git
tag plus the merging branch's prefix. This repo starts from the end state.

Two sub-decisions from that ADR are carried over because neither is obvious
from the one-line ask:

1. **The bump signal is the branch-name prefix, not conventional-commit
   messages.** Branches are already named `feat/*` and `fix/*` by
   convention; commit-message discipline would be new process for no extra
   benefit at this scale.
2. **The bump fires only on merge into `main`.** A PR merging into an
   intermediate `release/*` branch bumps nothing by itself.

## Decision

- **Branching**: `feat/*` and `fix/*`, one per ticket, with granular commits
  — one small change per commit, not one squashed blob per ticket. They may
  merge into an optional `release/*` integration branch to stage several
  tickets, or straight into `main` for smaller independent changes. `main` is
  only ever reached through a PR.
- **Release trigger**: `.github/workflows/release.yml` on `pull_request`
  `closed`, guarded by `merged == true`, base branch `main`, and a head
  branch matching `fix/`, `feat/`, or `release/`.
- **Bump size** from the head branch's prefix:
  - `fix/*` → patch (`z += 1`)
  - `feat/*` → minor (`y += 1`, `z` resets)
  - `release/*` → major (`x += 1`, `y` and `z` reset) — always major,
    regardless of what it accumulated
  - any other prefix → no-op; no tag, no release
- **Base version**: the latest existing `vX.Y.Z` git tag selected by semver
  sort (`git tag --list 'v*' --sort=-v:refname`), never a tag's creation
  date, never a branch name, never a file.
- **Output**: a `vX.Y.Z` tag pushed to `origin`, plus a GitHub Release
  created with `--generate-notes`.
- **The rule is a tested module, not shell.** `src/release/next-version.js`
  exports `bumpTypeFromBranch(branchName)` (prefix →
  `"major"`/`"minor"`/`"patch"`/`null`) and
  `bumpVersion(currentVersion, bumpType)`; `bin/next-version.js` is the CLI
  wrapper the workflow calls. The workflow's `run:` block computes nothing
  itself.
- **`package.json`'s `version` is not kept in sync.** Git tags are the sole
  source of truth.
- **Out of scope**: changelog generation, registry publishing, marketplace
  submission.

## Consequences

- No version number is decided or typed by a human anywhere.
- `release/*` no longer needs a real version in its name — `release/next` is
  as valid as `release/0.1.0`.
- A `release/*` merge always bumps major even if it only staged `fix/*`
  work. Computing the bump as the max severity of everything staged inside
  was considered and rejected in favour of the simpler prefix-only rule.
- A `docs/*` branch merging to `main` creates no tag or release, which is
  how docs-only changes land outside the versioned flow.
- The release rule is unit-tested like any other module — the release path
  is tested rather than trusted.
