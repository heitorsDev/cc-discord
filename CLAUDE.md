## Agent skills

### Issue tracker

GitHub Issues (`gh` CLI), repo `heitorsDev/cc-discord`. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard 5 labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Code quality

- Never duplicate code. If the same logic (or near-identical logic) is
  needed in two places, extract it into a shared module and have both
  call sites use it — don't copy/adapt it a second time.
- Zero runtime dependencies. Embed what is needed (the Discord IPC wire
  protocol is ~80 lines) rather than taking a dependency. Dev dependencies
  for lint/test only.
- Module layout follows `vendors` / `controller` / `service` — see
  `docs/adr/0002-feature-module-layout.md`. Hooks are thin stdin/stdout
  adapters over a `service.js` that holds the logic and takes its I/O
  boundaries as injectable options.
