# Design

## Context

The spike repo (`~/Projects/experiments/openmaki`) proved the bridge end to
end against pinned versions (`opencode v2.0.32`, `maki 0.6.4`) with a
measured route inventory (33 routes, 21 at boot), a field-by-field wire
mapping, and captured evidence. There it spawned Maki on the host; this
repository's premise is that the agent only ever runs inside the OpenShell
sandbox. The split agreed with the maintainer: this change adopts the bridge
and moves its backend into the sandbox; the next change adds the test tiers
and the generated compatibility report; later changes fix the known rendering
defects and add missing features. See `proposal.md` for motivation. Upstream
behavior this design depends on:

- OpenShell `sandbox exec` streams bidirectional stdio without a TTY, caps
  pending stdin at 4 MiB, waits at most 200 ms for piped-stdin EOF before
  starting, and reports an output-delivery failure when a background process
  holds stdout >30 s after exit
  (https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md).
- Maki's SDK mode is a bidirectional NDJSON loop over stdio, Claude-Code
  wire-shaped, with `control_request`/`control_response` permission round
  trips (https://maki.sh/docs/headless/).
- The OpenCode TUI is a client of an HTTP+SSE server and can be pointed at
  one with `--server` (https://opencode.ai/docs/cli/,
  https://opencode.ai/docs/server/).

## Goals / Non-Goals

Goals: the bridge runs unchanged in behavior with Maki inside the project
sandbox; bare `maki-oss` gains a config-gated OpenCode TUI mode that shares
the helper's existing ensure/sync lifecycle; every security invariant holds
by construction; the copied code and evidence land in this repository so the
spike repo can rest.

Non-goals: fixing the known transcript defects (message order, synthesized
model name — recorded in `evidence/known-defects.md`); the test tiers,
compatibility report, and drift gate (next change); bridge session resume;
host-mode Maki; removing Maki's own TUI session; renaming the bridge's
`OPENMAKI_*` environment variables.

## Decisions

1. **Move the bridge into this repo as `bridge/`**, a Bun sibling of
   `dashboard/`, with its own `package.json` (no runtime dependencies; `ajv`
   stays dev-only). The spike repo keeps its OpenSpec store and history
   untouched; the harness scripts, fixtures, and `mapping-table.md` are
   copied into this change's `evidence/`. *Alternative: keep openmaki as a
   path dependency — rejected: two-repo CI and pinning with no precedent
   here.*

2. **One injectable child executable, SDK args appended.** The bridge's
   `MakiSession` keeps spawning a child with Maki's SDK flags, but the
   executable comes from one environment variable (`MAKI_CHILD_CMD`,
   default `maki`). This is the single seam that serves both the sandbox
   wrapper (default path) and a scripted fake process (test seam for the next
   change). *Alternative: full argv override — rejected: no second consumer.*

3. **The helper owns the sandbox, the bridge owns the wire.** In OpenCode
   mode the helper runs its existing ensure routine, exports environment for
   the bridge (`OPENSHELL_BIN` with the resolved CLI, sandbox name, workdir,
   `MAKI_MODEL` from the existing `model` setting, `PORT` when the user set
   it), starts `bun bridge/…` in the background, then attaches
   `opencode --server http://127.0.0.1:$PORT` on the TTY. The bridge spawns
   `openshell sandbox exec -n <name> --no-login-shell --workdir <workdir>
   -- maki -p --trust --input-format stream-json --output-format stream-json
   [-m <model>]` per session. `--trust` because no TUI exists inside the
   sandbox to answer Maki's folder-trust card (headless `run` passes it for
   the same reason); `--yolo` is deliberately **not** passed — permission
   prompts must keep firing so the TUI's permission dialog round-trips.

4. **Teardown order is a spec'd invariant, not an afterthought.** Bridge
   kills its child on session delete and on process exit; the helper traps
   INT/TERM, kills the bridge on TUI exit, then runs the existing exit sync
   and proposal check. This is what keeps OpenShell's ">30 s stdout hold ⇒
   output delivery failure" rule from stranding the session.

5. **Session location answers come from the sandbox.** The bridge's canonical
   directory is the sandbox workdir passed by the helper (and confirmed by
   Maki's `system.init.cwd`), so the TUI's location/project reads stay
   self-consistent without any host path entering the sandbox.

6. **Loopback-only, no password, matching the dashboard rule.** The bridge
   binds `127.0.0.1` unless an address is configured, in which case a
   password is required; the helper never sets an address. Maki authenticates
   only in-sandbox through provider placeholders; the bridge fakes OpenCode's
   provider/model answers, so no credential exists on the host side.

7. **Config gate instead of a subcommand** (decision B from exploration):
   `tui = "opencode"` in `config.toml` / `MAKI_OSS_TUI`; unset keeps today's
   Maki TTY session byte-for-byte. Flipping the default is a later change
   once the defect loop clears. Resume flags are refused in this mode
   (spec'd) because a bridge session has no replayable transcript yet.

8. **Known defects are evidence, not tasks here.** `evidence/known-defects.md`
   records the observed message-order inversion (A-A-A-Q-Q-Q) and the
   synthesized model name, each with the capture that shows it, so the
   polish change has acceptance criteria and the next change's discovery
   loop has a seed list.

## Risks / Trade-offs

- [OpenCode's server contract drifts from the 2.0.32 mapping] → version
  pinned in doctor messaging and evidence; the A/B spec diff and generated
  compatibility report arrive with the next change.
- [Known transcript defects make the mode visibly rough] → opt-in config
  gate; defects recorded with captures; polish is its own later change.
- [Long-lived `sandbox exec` quirks (4 MiB stdin cap, 200 ms EOF wait,
  30 s stdout-hold)] → chat messages are far below the cap, the pipe stays
  open for the session, and decision 4 fixes teardown; all three are
  asserted in task verification.
- [Port collision with a running dashboard or another bridge] → `PORT`
  env override documented; the helper passes it through when set.
- [`bun` and `opencode` missing on a host] → conditional `doctor` checks
  fail only when `tui = "opencode"` is configured.

## Migration Plan

Opt-in only; no data migration. Rollback = unset `tui` (the Maki TTY path is
untouched) and, if desired, delete `bridge/`. The spike repo remains
available as the reference implementation throughout.

## Open Questions

None blocking. Deferred to the next change by agreement: defect-discovery
loop, test tiers, compatibility report, drift gate. Deferred to a later
change: flipping the default TUI, bridge session resume, env-prefix rename.
