# Design

## Context

See proposal.md for motivation. The relevant current state:

- `bin/maki-oss` is POSIX sh; `ensure_project_sandbox` creates/reuses the
  project sandbox, uploads on creation only, and attaches providers;
  `sync_exit_hook` runs the download-back on every session exit path.
- OpenShell v0.1.2 (verified locally) already provides the whole loop:
  automatic draft proposals from denied connections, `openshell settings`
  (per-sandbox keys), `openshell rule get --status pending` (text output
  only in v0.1.2 — no `--output json`), `openshell rule approve/reject
  --chunk-id`, and the in-sandbox `policy.local` API whose
  `/v1/proposals/{id}/wait` blocks the agent until the human decides.
- Live verification (sandbox `maki-mlx-optiq`, 2026-10-19): setting
  `agent_policy_proposals_enabled=true` on a running sandbox flips
  `policy.local` from `404 feature_disabled` to serving denials and policy;
  the agent-facing guide files (`/etc/openshell/skills/policy_advisor.md`,
  `/AGENTS.md`) are only materialized by the supervisor at startup, so
  enabling before the agent's first exec matters for discovery.
- Security invariants (AGENTS.md) are unchanged by this design: egress
  stays deny-by-default; the change makes denials visible and answerable,
  never auto-grantable.

## Goals / Non-Goals

**Goals:**
- An agent in any `maki-oss` session can ask for network access and wait.
- A human always sees pending proposals at session exit and can act on them
  with `maki-oss policy ...`.
- Zero change to the trust posture: every grant is an explicit human
  decision, one chunk at a time.

**Non-Goals:**
- Automatic approval modes (`--approval-mode auto`, `proposal_approval_mode`)
  — available upstream, deliberately not wrapped or enabled.
- Bulk approve/clear wrappers.
- Download-side artifact filtering / `sync_exclude` (deferred until a real
  sandbox-created-artifact flood occurs).
- Syncing sandbox `$HOME` dotfiles back to the host (deferred; first
  occurrence was the mlx-optiq `~/.optiq` case).
- Dashboard or fish-plugin integration.

## Decisions

**D1: Enable via `openshell settings set <name> --key
agent_policy_proposals_enabled --value true`, in `ensure_project_sandbox`,
before the Maki exec — on both create and reuse paths.**
Rationale: the supervisor only writes the agent guide at startup, so
pre-Maki placement is the only point where a fresh sandbox reliably hands
the agent its instructions; reuse covers pre-existing sandboxes (the API
works immediately even though the guide may be absent — the denial
responses still point the agent at `policy.local`). Idempotent: setting an
already-true key is a harmless no-op revision. Alternative considered: a
gateway-wide `--global` setting — rejected: changes every sandbox on the
gateway including ones not managed by `maki-oss`, and violates per-project
scope. `maki-oss up` stays settings-free (create/start-only semantics per
the existing spec); the advisory enable is a session concern.

**D2: A failed settings call warns and continues.**
Rationale: an older gateway without the key must not brick sessions. The
degradation is graceful — the agent just lacks the wait API and behaves as
today. Fits the existing "warn on stderr, preserve Maki's exit code" pattern
of the sync hook.

**D3: Surface pending proposals from the existing `sync_exit_hook`, via
`openshell rule get <name> --status pending`, parsed with awk.**
Rationale: v0.1.2 has no JSON output for `rule get`, so text parsing is the
only option; the repo already has this exact pattern (`sandbox_phase`,
`attached_providers` fallbacks). Detection = count `Chunk:` lines; the note
prints the count and `maki-oss policy review`, nothing more — no rule
details in the exit path, keeping it short and avoiding parse fragility for
display. Fail soft: any failure (gateway down, unknown subcommand) yields at
most a warning and never masks Maki's exit code, mirroring the sync
failure path. Runs on the same exit paths as sync-back (including SIGINT),
but not under `--no-sync` and not on non-session commands.

**D4: `policy review|approve|reject` are thin passthroughs in the style of
`cmd_policy_show`/`cmd_rm`.**
`review` → `rule get <name> --status pending` (raw text passthrough; the
chunk ids are what the user needs). `approve <chunk-id>` → confirmation
prompt printing sandbox name + chunk id, then `rule approve <name>
--chunk-id <id>`; `--yes` skips the prompt; non-TTY without `--yes` fails,
same contract as `rm`. `reject <chunk-id> --reason "..."` → requires a
non-empty reason (an empty reason robs the agent of the steering signal),
then `rule reject <name> --chunk-id <id> --reason <text>`. Alternatives
considered: wrapping `approve-all`/`clear` — explicitly rejected in
proposal and spec; per-chunk reading is the security posture.

**D5: The venv/artifact problem is solved by convention, documented in the
playbooks — not by helper code.**
`openshell sandbox upload` already applies `.gitignore` inside a git work
tree and warns outside one; `sandbox download` has no filtering. A target
project that is a git repo with dependency dirs ignored never uploads them,
so there is nothing to download back — this covers `.venv/`,
`node_modules/`, `target/`, etc. generically. Helper-side exclude manifests
were considered and rejected as re-implementing gitignore semantics (YAGNI,
and the repo's ponytail posture). Docs record that download is unfiltered,
so sandbox-created artifacts still come back — accepted until it bites.

**D6: Docs record the verification baseline: gateway/CLI v0.1.2.**
Upstream docs (v0.1.4) describe `rule get --output json`-adjacent features
and the guide materialization timing; the helper targets what v0.1.2
actually does. When the gateway floor rises, D3's parser can be swapped for
JSON without behavior change.

## Risks / Trade-offs

- [Agents gain a new capability surface (`policy.local`)] → The API can
  only read policy/denials and *propose*; every grant still requires the
  human `approve`. No egress is loosened by enabling.
- [Proposal volume could nag the user] → The exit note is one stderr line;
  unreviewed proposals are inert and age safely; rejection with a reason
  teaches the agent to stop asking.
- [Guide absent on reused sandboxes (enabled after supervisor start)] → The
  agent still gets denial-response pointers to `policy.local` (upstream
  behavior); full guide coverage needs a fresh sandbox. Documented, not
  worked around.
- [awk parsing of `rule get` text is brittle across upstream format
  changes] → Only `Chunk:` counting is load-bearing in the exit path;
  `policy review` passes text through unmodified, so display never depends
  on the parser. Verified against live v0.1.2 output.
- [A sandbox where the agent waits long blocks a turn] → The `wait` call
  has a timeout; on expiry the agent reports the pending request and the
  human can approve later and say "continue" — documented workflow, not a
  hang.

## Migration Plan

No data migration. Rollout is the normal apply flow; rollback = revert the
helper (sandboxes keep the setting harmlessly; `openshell settings delete
<name> --key agent_policy_proposals_enabled` restores prior state). The
live sandbox used for verification (`maki-mlx-optiq`) already carries the
setting from research; that is not assumed by any task.

## Open Questions

- None blocking. Deferrable: whether the exit note should also list chunk
  ids inline (D3 chose a count + review command); revisit if users report
  the extra hop annoying.
