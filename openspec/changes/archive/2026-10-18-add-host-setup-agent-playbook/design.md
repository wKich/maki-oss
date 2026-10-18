# Design

## Context

See `proposal.md` — Why. What shapes the approach:

- `docs/ai/agent-playbook.md` is the model to follow: ordered phases, a
  verification after each, a stop-on-mismatch rule, and a closing list of
  invariants that may never be relaxed. Its contract is "run every command
  from the repository root" and it opens at Phase 0 preflight with Docker,
  OpenShell, and Maki already present.
- `docs/setup-guide.md` is the human narrative for a clean machine: §2
  prerequisites (engine 28+, Docker Desktop/OrbStack networking settings,
  OpenShell install script), §3 image build, §6 helper shortcut, §8
  troubleshooting, §10 pointers.
- `docs/helper.md` already documents the one-time/per-project split
  (`doctor` → `image build` → `provider setup`, then `cd … && maki-oss`) and
  both fish installation paths (`fisher install ./fish`, `maki-oss fish
  install`) plus the `MAKI_OSS_BIN` resolution order in the wrapper.
- `AGENTS.md` lists the start-here documents; `README.md` lists the Guides.
  Neither currently mentions host provisioning.
- Constraint from the project context: `docs/ai/references.md` is the only
  index of external documentation links (`scripts/check-links.sh` keeps link
  rot in one place).

## Goals / Non-Goals

**Goals:**

- One agent-executable path from bare host to daily driver, with a
  verification gate after every step.
- A clean seam: host setup here, sandbox phases in `agent-playbook.md`, no
  duplicated steps between them.
- Discoverability from `AGENTS.md` and the README.

**Non-Goals:**

- No new commands, scripts, fish files, examples, or policy changes; nothing
  under `bin/`, `fish/`, `examples/`, or `dashboard/` is touched.
- No rewrite or merge of `docs/setup-guide.md` (the human guide stays as-is).
- No coverage of sandbox creation, policy selection, or isolation checks here
  — those belong to `agent-playbook.md` and `docs/verification.md`.

## Decisions

### D1 — A new file instead of extending `agent-playbook.md`

- **Why:** the two documents have different preconditions and different
  stopping points. `agent-playbook.md` assumes the host is provisioned and
  says so in its first lines; prepending install phases would break that
  contract and force every existing phase to re-check tools it previously
  took for granted. Two documents with an explicit handoff keep each one's
  "stop on mismatch" rule internally consistent.
- **Alternatives rejected:** extending `agent-playbook.md` with a Phase −1 —
  mixes host mutation (installs, shell edits) with sandbox work in one
  sequence, so a failure in either is reported with the same context;
  putting it in `docs/setup-guide.md` — that guide is written for humans and
  has no verification-gate structure to hang an agent's loop on.

### D2 — Restate install commands inline; link for background and troubleshooting

- **Why:** an agent executing a playbook should not have to hop documents to
  learn what to type — `agent-playbook.md` already restates the `docker build`
  command this way, so the precedent exists. Background (Docker Desktop
  networking toggles, OrbStack notes) and failure tables stay in
  `docs/setup-guide.md` §2/§8 and are linked, not copied.
- **Drift guard, not a hope:** versions come from canonical sources only —
  Maki from `examples/maki-image/Dockerfile`, verified OpenShell/Maki versions
  from `docs/ai/references.md` — and external URLs are limited to entries
  already in `references.md`. A task diffs them, so drift fails a check rather
  than sitting unnoticed.
- **Alternatives rejected:** link-only (agent must open three documents to
  run one sequence, and the guide's narrative ordering is not a gate
  structure); full duplication of §2 (two copies of the networking settings
  to keep in sync for no gain).

### D3 — One primary shell path per shell, fallback last

- **zsh (and other POSIX shells):** put the repository's `bin/` on `PATH`;
  verified with `command -v maki-oss`.
- **fish:** `fisher install ./fish` as the primary path, `maki-oss fish
  install` as the documented no-fisher alternative (both are already
  specified by the `fish-integration` capability); verified with
  `type -q maki-oss`.
- **`MAKI_OSS_BIN`:** documented last, as the fallback for the case where the
  wrapper cannot resolve the repository — it is a resolution mechanism, not an
  installation choice.
- **Why:** `docs/helper.md` presents fisher and the symlink install as equals;
  a playbook needs one order to be checkable, and this ordering matches the
  wrapper's own resolution order (`MAKI_OSS_BIN` → source repo → `PATH`).
- **Alternatives rejected:** presenting both fish paths as interchangeable
  primaries (an agent cannot verify "either of these worked" as a gate);
  recommending `PATH` for fish too (it would bypass the function wrapper and
  its completions).

### D4 — Structure: five phases, each ending in a gate

1. Preflight (what is already installed) → 2. Host tooling install + verify →
3. Repository and helper setup (`doctor`, `image build`, `provider setup`) →
4. Shell preparation → 5. Daily driver, then the handoff.
- **Why:** mirrors `agent-playbook.md`'s shape, so the two read as one
  sequence; every phase ends with commands whose expected output is stated,
  and a mismatch stops the run.
- The boundary is enforced by the spec, not by convention: no
  `openshell sandbox create`, `openshell policy set`, or `openshell sandbox
  exec` may appear in this file.

### D5 — Two discoverability edits, both one line

- `AGENTS.md`: add the playbook to its start-here list (the file already
  names `docs/ai/agent-playbook.md`, so this is a sibling entry, not a new
  section).
- `README.md`: one line in the Guides list.
- **Why:** `AGENTS.md` is the file every agent reads first — without this
  pointer the playbook is exactly as discoverable as the current gap. The
  change's scope explicitly includes these two edits.

## Risks / Trade-offs

- **Drift against `docs/setup-guide.md`** (install commands exist in both) →
  D2's drift guard: versions diffed against canonical sources in a task,
  external links checked against `references.md`, and `scripts/check-links.sh`
  run over the new file.
- **Two playbooks compete for authority** → D1's explicit handoff plus the
  D4 boundary requirement; a task greps for the forbidden sandbox commands.
- **Shell instructions vary by environment** (nix/nvm PATH quirks, OrbStack vs
  Docker Desktop) → link `setup-guide.md` §2/§8 for environment-specific
  detail instead of restating it; the playbook keeps one command per shell.
- **A verifier's host is already provisioned** (the common case here) →
  phase 1 is a preflight that reports which tools are already present, so the
  playbook is runnable end-to-end on a fresh machine and idempotent on a used
  one; `maki-oss doctor` remains the executable preflight.
- **Host mutation is out of the sandbox's control** → the playbook never
  introduces secrets (`maki-oss provider setup` handles credentials through
  provider profiles) and never relaxes the invariants already listed in
  `agent-playbook.md`.

## Migration Plan

Additive: one new file plus two one-line edits. Nothing existing changes, so
rollback is deleting `docs/ai/host-playbook.md` and removing the two links.
No data, no configuration, no service state is involved.

## Open Questions

None that would change the specs, the approach, or the task breakdown. The
choice of fisher vs `maki-oss fish install` as fish primary (D3) is settled by
the decision above; if the maintainer prefers the symlink path as primary, it
is a one-line edit that the spec's "one primary path per shell" requirement
still satisfies.
