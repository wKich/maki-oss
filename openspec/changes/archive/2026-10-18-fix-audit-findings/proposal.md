# Proposal

## Why

A senior-developer audit of the whole repository found six real defects, three
of them in the daily-use path of the helper: the session flow bypasses the
`--env` secret check, reusing an existing sandbox can silently revert
today's host files to stale sandbox copies on sync-back, and the no-jq JSON
parser reports wrong sandbox phases on non-pretty output. Two more make the
provider-setup wizard immune to Ctrl-C/kill, and let any local web page
spawn unbounded CLI processes through the dashboard's unauthenticated log
stream. All six have a concrete reproducing case recorded in the audit.

## What Changes

- Enforce `--env` secret hygiene on the session path: bare `maki-oss`,
  `maki-oss maki`, and `maki-oss run` refuse credential-like `--env` keys
  before any sandbox creation, exactly like `up` does today.
- Warn when a session reuses an existing sandbox without a fresh upload, so
  the sync-back merge that overwrites matching host files is announced
  instead of silent.
- Fix the no-jq `sandbox_phase` / `attached_providers` fallbacks so compact
  JSON (no space after `:`) is not missed and single-line JSON with several
  sandboxes never yields another sandbox's phase.
- Make SIGINT/SIGTERM terminate the provider-setup wizard (and the dashboard
  smoke script) instead of only running a cleanup handler and continuing.
- Require the session token for the dashboard's SSE log route, and drop idle
  log hubs so neither an unauthenticated page nor a long-lived dashboard can
  grow processes and memory without bound.
- Recover instead of failing when two `maki-oss` runs race the same project:
  a create that loses the race re-checks the sandbox and reuses it.

Out of scope (audit "nice to have" items, deferred): documenting
`--no-git-ignore`, deleting the unused `settingsGet` client method, the
`policy show` duplicate branch, hidden-tab polling, multiple `--credential`
slugs in `--from`, and the config-writer lock.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `helper-cli`: Secret hygiene applies to every command that creates a
  sandbox (not just `up`); the one-command session announces that sync-back
  will overwrite matching host files when it reuses a sandbox without an
  upload; the sandbox parser is correct for compact and single-line JSON
  without jq; the provider-setup wizard terminates on SIGINT/SIGTERM; a
  concurrent create race resolves to reuse instead of a hard gateway error.
- `dashboard`: starting a log stream requires the session token, and idle
  log hubs are released once their subscribers and child process are gone.

## Impact

- `bin/maki-oss` — session ensure path, signal traps, awk/sed JSON fallbacks.
- `dashboard/src/server.ts`, `dashboard/src/logs.ts` — SSE route guard, hub
  lifecycle; `dashboard/src/app.js` sends the token on the stream URL.
- `dashboard/scripts/smoke.sh` — signal trap only (no behavior change).
- `tests/run-tests.sh`, `dashboard/test/*` — new and corrected tests for the
  above; existing tests keep passing (`make test`, `bun test`, smoke).
- `docs/helper.md`, `dashboard/README.md` — short notes for the reuse
  warning and the token-gated stream.
