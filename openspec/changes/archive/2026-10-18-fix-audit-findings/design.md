# Design

## Context

The audit (see proposal.md) found six defects with concrete reproducers. All
fixes live in two files plus tests: `bin/maki-oss` (POSIX sh, `set -eu`,
stub-tested by `tests/run-tests.sh`) and the Bun dashboard
(`dashboard/src/{server,logs}.ts` + `app.js`, tested by `bun test`, the
smoke script, and a browser check). Constraints from the project context:
secrets never travel through `--env`, the sandbox stays the security
boundary, and the helper stays POSIX sh with `jq` optional.

Relevant existing behavior: `check_env_hygiene` exists and is called only
from `cmd_up`; the session ensure path (`ensure_project_sandbox`) calls
`run_sandbox_create` directly. `sandbox_phase`/`attached_providers` have
jq-preferred parsing with awk/sed fallbacks that assume pretty-printed
JSON. Line 1291 sets `trap setup_cleanup EXIT INT TERM` — a cleanup-only
handler that does not exit, which replaces the default signal termination.
The dashboard mints a mutation token, embeds it in the page, guards only
POST routes, and keeps one `LogHub` per sandbox name in a Map forever.

## Goals / Non-Goals

**Goals:**
- One choke point so no sandbox-creating path can skip the secret check.
- Correct, cheap fixes for the two proven parser bugs (no new dependency).
- Signals that stop the program; a log route that cannot be used to spawn
  unbounded processes; a create race that resolves to reuse.

**Non-Goals:**
- Making `jq` required (the fallbacks stay; deleting them is a future lean
  option, see Open Questions).
- Re-uploading on every session (the reuse-without-upload design stands;
  this change only announces it).
- Any of the audit's "nice to have" items (deferred in the proposal).
- Changing mutation auth, egress policy, or the merge semantics of sync.

## Decisions

1. **Secret check moves to the choke point, not the caller.**
   `check_env_hygiene` is called at the top of `run_sandbox_create` (in
   addition to the existing early call in `cmd_up`). Every creation path
   then passes through one check; `cmd_up`'s early call stays so `up
   --env BAD=...` fails before any listing, even when the sandbox exists.
   Alternative: call it from `ensure_project_sandbox` only — rejected:
   the next command that creates a sandbox would bypass it again.
   The check is pure and side-effect free, so calling it twice is free.

2. **Reuse warning is one `note` line.** In `ensure_project_sandbox`'s
   reuse branches (`Ready`, and after starting a stopped sandbox), print
   to stderr that the exit sync overwrites matching host files and
   `maki-oss upload` refreshes the sandbox. No diffing, no new flags.
   Alternative: only warn when host files differ from the sandbox —
   rejected: that needs a comparison pass (slow, racy) for a warning.

3. **Parser fixes, not a jq requirement.** The awk fallback matches
   `"name":[ ]*"target"` (optional space after the colon) and cuts the
   phase from the text *after* that match — first on the same line
   (compact JSON), then on following lines (pretty JSON). The
   `attached_providers` fallback uses `grep -o` so several providers on
   one line are all returned. Both stay line-oriented and dependency
   free. Alternative: require jq and delete ~150 lines — rejected for
   this change because the specs and `doctor` treat jq as optional; kept
   as a recorded lean opportunity.

4. **Signal traps exit after cleanup.** Line 1291 becomes
   `trap setup_cleanup EXIT`,
   `trap 'setup_cleanup; exit 130' INT`,
   `trap 'setup_cleanup; exit 143' TERM`. The session flow is unaffected:
   `cmd_maki`/`cmd_run` install their own INT/TERM handler around the exec
   (spec "Interrupt still syncs") and the EXIT hook still syncs.
   `dashboard/scripts/smoke.sh` and `tests/run-tests.sh` get the same
   exit-after-cleanup shape.

5. **SSE token rides the URL.** A token is minted in all modes (in
   read-only it gates streams only; `guardMutation` keeps returning 403
   for every mutation regardless). The log route compares
   `?token=` against it with the existing constant-time compare and
   returns 403 with no process spawned otherwise. `app.js` appends the
   token to the stream URL. Alternative: a custom header — rejected:
   `EventSource` cannot set headers, and a fetch-based streaming client
   is a lot of code for one parameter. The token already ships in the
   page; a loopback query parameter adds no exposure the page does not
   already have.

6. **Hub eviction via an idle callback.** `LogHub` gains an `onIdle`
   callback, invoked from `removeSubscriber`/`closeAll` when the last
   subscriber is gone and the child is dead. `server.ts` uses it to
   `hubs.delete(name)`. Alternative: a TTL sweep — rejected: extra timer,
   same result slower.

7. **Lost create race becomes reuse.** If `sandbox create` fails inside
   `ensure_project_sandbox`, re-check `sandbox_phase`; if the sandbox now
   exists (another run won), wait for `Ready` and continue *without*
   upload — both runs share the same project directory, so the winner's
   upload is the same tree. If it still does not exist, keep the current
   hard failure.

## Risks / Trade-offs

- [Inline bootstrap sets the wizard traps before `arm_sync` replaces the
  EXIT trap] → `setup_tmp` cleanup on EXIT is lost after a TTY bootstrap.
  Pre-existing, unchanged by this design; noted, not fixed here.
- [SSE token in a URL] → could appear in tooling that logs URLs. Accepted:
  loopback only, never logged by the server, and already present in the
  page HTML.
- [Race-lost runs do not upload] → if the winning run dies before its own
  upload, the sandbox may be empty. Accepted: identical to today's reuse
  path, and the warning/`upload` command covers recovery.
- [Compact-JSON awk fix] → depends on `openshell` keeping `"name"` and
  `"phase"` in the same object; a shape change breaks it again. Mitigated
  by stub fixtures that pin both compact and pretty shapes.

## Migration Plan

No data or config migration. Implementation order: helper fixes with new
stub tests, then dashboard changes with new `bun test` cases, then docs
notes (`docs/helper.md`, `dashboard/README.md`). Rollback is a plain
revert; nothing persisted changes shape.

## Open Questions

- Should the ~150 lines of no-jq fallback parsing be deleted outright by
  requiring `jq`? Safe to decide later without changing these specs (the
  observable behaviors in the delta stay identical either way).
