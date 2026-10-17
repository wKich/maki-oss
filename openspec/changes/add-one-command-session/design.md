# Design

## Context

See `proposal.md` for motivation. `bin/maki-oss` is a single POSIX sh script with a flat command dispatch, a data-only `key = "value"` config parser (`load_config`), and OpenShell wrappers (`run_gateway`, `sandbox_phase`, `attached_providers`). Today `up` creates/starts only, `maki` requires an existing sandbox, `run` requires an existing sandbox, transfer is manual, and the provider wizard does not persist anything. `add-any-provider-support` (active, implemented) adds the setup wizard; this change layers on top of it, so that change must be archived before this one.

Constraints: POSIX sh only; the sandbox stays the security boundary (no bind mounts, no credentials in argv/config/output); all transfer goes through `openshell sandbox upload`/`download`; config parsing must not execute file contents.

## Goals / Non-Goals

**Goals:**
- Two-command onboarding: one-time `maki-oss provider setup`, then bare `maki-oss` per project.
- Idempotent session startup shared by bare/maki/run, with the sandbox reused across sessions.
- Round-trip sync so host and sandbox converge without user bookkeeping.

**Non-Goals:**
- Live file sync during a session; deletion propagation; sync on un-trappable signals (SIGKILL).
- Attaching providers that are not in the config list.
- Changing gateway-side defaults, image contents, or policies.
- Auto-updating image/policy of existing sandboxes (still `rm` + fresh `up`).

## Decisions

**1. One shared `ensure` routine; bare invocation aliases `maki`.**
Bare `maki-oss` (no positional command) dispatches to the session command, which calls `ensure_project_sandbox` before exec'ing Maki. `maki` and `run` call the same routine. Alternatives: bare-only orchestration (rejected: `maki` on a fresh project would still fail, keeping the friction); folding the launch into `up` (rejected: scripts use `up` as a pure lifecycle command). `up` keeps its behavior.

**2. Ensure order and semantics.**
1. Remembered providers (config `providers`) drive everything. None → inline wizard on TTY / actionable exit otherwise. Not on the gateway → fail naming it.
2. Sandbox: absent → create via the existing `cmd_up` path with remembered providers; `Ready` → reuse; `Stopped`/`Completed`/`Error` → `sandbox start`; `Provisioning`/`Starting` → bounded wait for `Ready`, then fail with the phase.
3. Upload only when this invocation created the sandbox (`.gitignore` respected, as `sandbox upload` already does).
4. Attach each remembered provider missing from `sandbox provider list` with `--wait`.

Rationale for create-only upload: sandbox-side work survives restarts, and re-uploading on every launch would silently clobber it. Change detection was considered and rejected as premature magic; the sync-back (below) makes create-only safe because sessions round-trip.

**3. Sync-back is an additive download into the local project dir.**
On session end (normal, SIGINT/TERM, or failure) a trap runs `openshell sandbox download <name> <workdir> <project-dir>` unless `--no-sync`. Verified against the real CLI (OpenShell 0.1.2): a directory download places the source's contents directly into the destination and merges into an existing directory — matching paths are overwritten, host-only files are preserved — so no temp directory or re-merge step is needed, and deletions made in the sandbox are not propagated. Helper messages go to stderr so `run` stdout stays pure JSON. A failed sync warns and preserves Maki's exit code; a flag guards against double sync from multiple trap paths.

**4. Provider memory lives in the existing config file.**
`provider setup` and `provider add` append the instance name to the `providers` key (comma-separated, deduped), creating the file with a minimal header when absent. The write is a parse-validate-then-atomic-replace: read all lines, modify only the `providers` line (or append one), write to a temp file, validate with the same parser, then rename. Alternatives: a separate state file (rejected: two sources of truth with the documented config key); gateway labels (rejected: not useful before the first create).

**5. Model is an optional config key with flag precedence.**
`model = "provider/model"` in config; `--model` overrides; unset means Maki's picker. The interactive wizard offers to set it at the end, skipping by default; no per-launch prompt. Bare/maki pass the resolved model to Maki the same way `run` already does.

**6. Inline wizard reuses the in-process setup function.**
The ensure step calls the existing `cmd_provider_setup` logic rather than spawning a child; after it returns, the config is re-read and ensure continues. This avoids recursion into the session dispatcher and keeps credential handling in one place.

## Risks / Trade-offs

- [Auto-download overwrites host files changed during the session] → additive merge is deterministic (sandbox wins on matching paths); `--no-sync` opts out; the sync prints a summary, and git remains the recovery net.
- [Sandbox-side deletions are not propagated] → documented behavior: downloaded merges never delete host files; use git or delete manually.
- [Config rewrite corrupts user edits] → modify only the `providers` line, atomic replace, re-parse before rename, never touch credentials.
- [Sync runs after a crash/exit but download fails] → warning only, Maki's exit code preserved.
- [SIGKILL or gateway outage loses the round-trip] → documented; `maki-oss download` remains available next run.
- [Big repositories pay a full download per session] → accepted for correctness; `--no-sync` is the escape hatch.
- [The helper script keeps growing] → keep new functions small and single-purpose; `make lint`/`make test` gate the change.

## Migration Plan

No data or gateway migration: additive CLI behavior plus a new config key. Archive `add-any-provider-support` first so the `helper-cli` delta applies cleanly. Rollback is reverting the implementation commit; the worst case is users run the explicit commands again. Docs (`docs/helper.md`, `docs/setup-guide.md`, `docs/ai/agent-playbook.md`, `docs/verification.md`, `README.md`) and the verification log are updated in the same change.
