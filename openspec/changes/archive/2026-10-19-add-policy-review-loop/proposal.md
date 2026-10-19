# Proposal

## Why

A real session (2026-10-19, sandbox `maki-mlx-optiq`) showed that policy
denials are invisible end to end: the agent hit a blocked host, improvised a
workaround, and wrote its deliverable outside the synced workdir; the human
never saw a denial, and three auto-drafted rule proposals sat pending at the
gateway with no surface to notice or act on them. OpenShell already has the
full loop — automatic draft proposals, `openshell rule get/approve/reject`,
and a `policy.local` agent API that lets the agent wait for a decision and
continue (docs:
[Policy Advisor](https://docs.nvidia.com/openshell/how-it-works/policies/advisor.md),
verified against the local gateway v0.1.2) — but the helper exposes none of
it, so denials remain dead ends.

## What Changes

- **Advisor auto-enable:** `maki-oss` enables the sandbox setting
  `agent_policy_proposals_enabled=true` on the project sandbox right after
  creation and before Maki attaches, so agents can submit proposals and wait
  for a decision instead of giving up. Humans stay the approver; nothing is
  auto-approved by this change.
- **Exit-time surfacing:** on session exit (including Ctrl-C and failure),
  the sync hook checks for pending rule proposals and prints a stderr note
  with the count and the review command, so denials are never invisible.
- **New `maki-oss policy` commands:** thin passthroughs to
  `openshell rule` — `policy review` (list pending proposals), `policy
  approve <chunk-id>` (with confirmation), `policy reject <chunk-id> --reason
  "..."`. No bulk approve/clear wrappers (reading one rule at a time is the
  point).
- **Upload filtering convention (docs):** playbook and docs gain the rule
  that a target project must be a git repo with environment/dependency
  directories (`.venv/`, `node_modules/`, …) gitignored, so `openshell`
  upload filtering keeps them out of the sandbox and the unfiltered download
  merge has nothing to drag back. Verified behavior: upload applies
  `.gitignore` only inside a git work tree and warns otherwise; download has
  no filtering at all (docs:
  [Manage sandboxes — Transfer Files](https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md)).
- **Version note:** docs record that the advisor flow was verified against
  gateway/CLI v0.1.2 (`rule get` has no JSON output there; the helper parses
  its text output).

## Capabilities

### New Capabilities

- `policy-review`: surfacing and acting on pending network-rule proposals —
  enabling the agent proposal loop per sandbox, reporting pending proposals
  at session exit, and the `policy review|approve|reject` passthrough
  commands.

### Modified Capabilities

- `helper-cli`: the session-ensure flow gains the advisor enable step, and
  the command set gains the `policy` subcommands (spec-level behavior change
  to what `maki-oss` does on ensure and exit).

## Impact

- `bin/maki-oss`: `ensure_project_sandbox` (one `openshell settings set`
  after create), the sync hook (pending-count check), new `cmd_policy_*`
  functions, usage text.
- `docs/helper.md`, `docs/ai/agent-playbook.md`, `README.md`: new commands,
  exit-note behavior, gitignore convention for target projects.
- Security invariants unchanged: egress stays deny-by-default, proposals
  take effect only through explicit human `approve`, no secrets via `--env`,
  no mounts. The change makes denials *visible and answerable*, not looser.
- No dashboard or fish-plugin changes (out of scope for this change).
- Upstream dependency: behavior relies on OpenShell v0.1.2+ `settings` and
  `rule` commands; no upstream changes needed.
