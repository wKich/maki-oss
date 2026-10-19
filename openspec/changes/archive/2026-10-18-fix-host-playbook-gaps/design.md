# Design

## Context

`docs/ai/host-playbook.md` ships as the ordered, verification-gated path from
a bare host to a daily-driver `maki-oss`. A review of the applied change found
several steps that fail on the very hosts the playbook targets, plus two
expectations that were never captured in the `host-setup` spec. The helper
itself (`bin/maki-oss`, `fish/`) is not at fault: every command the corrected
playbook will run already exists and is covered by the stub-backed suite
(`make test`, 66 cases). This change corrects the documents and closes the
spec gaps. Motivation lives in `proposal.md`; the behavior contract lives in
the `host-setup` delta.

## Goals / Non-Goals

**Goals:**

- Every command in the playbook runs on a bare macOS (Apple Silicon) or Linux
  host without assuming a tool no earlier step installed.
- Verification blocks fail only on genuine mismatches, never on the reader's
  shell choice or on a cleanup command the playbook itself just listed.
- The provider step states its input (a model API key) and its
  non-interactive forms before an agent reaches a usage error.
- `docs/ai/host-playbook.md` and `docs/helper.md` give the same fish
  instruction.

**Non-Goals:**

- No change to `bin/maki-oss`, `fish/`, `dashboard/`, `examples/`, or any
  policy — the flags and commands the corrected playbook names already ship.
- No new external links, so `docs/ai/references.md` stays untouched.
- No restructuring of the five-phase layout, the stop-on-mismatch rule, or
  the host/sandbox boundary.

## Decisions

### D1 — The symlink install becomes the primary fish path

`./bin/maki-oss fish install` (run from the repository root) is the documented
fish path; `fisher install ./fish` is presented as the alternative for users
who already have fisher. This reverses D3 of the archived
`add-host-setup-agent-playbook` design, whose own note left the choice open.

- **Why:** no earlier step installs fisher, and on a bare host `maki-oss` is
  neither on `PATH` nor in the fish function directory, so the previously
  documented bare `maki-oss fish install` cannot resolve. The symlink path
  runs from repository files only and is what `make install-fish` already
  invokes.
- **Alternatives rejected:** adding a fisher-install step (a third-party tool
  plus an external URL that would have to enter `references.md`, for no gain);
  leaving both as documented equals (an agent still picks the one that fails).

### D2 — Verification blocks are split per shell

The Phase 4 Verify block becomes two labeled blocks: POSIX shells run
`command -v maki-oss`; fish users run `fish -c 'type -q maki-oss'` and the
completion-file check. Using `fish -c` keeps the fish checks runnable from
any login shell without a `type -q` error in zsh/bash.

- **Why:** the shipped block runs the fish-only `type -q`, which errors under
  zsh and bash (`bad option: -q`), tripping the playbook's own stop rule.
- **Alternatives rejected:** a comment telling the reader to skip lines (an
  agent running the block verbatim still fails); keeping one block and hoping
  the reader filters it (the bug that shipped).

### D3 — Preconditions are stated inline, with checks, and without URLs

Phase 2 gains one short precondition paragraph per OS: Homebrew must exist on
macOS (checked with `brew --version`), and on Linux the non-root user must be
able to run containers (docker group membership with the required re-login,
or a rootless engine), checked before the engine install.

- **Why:** a bare host fails at `brew install --cask orbstack` with
  `command not found: brew`, and the common Linux failure — engine installed,
  user not in the docker group — surfaces later as `maki-oss doctor`'s
  misleading "installed but not running".
- **Alternatives rejected:** linking brew.sh or docs.docker.com (new external
  links would have to be added to `references.md` and re-verified by
  `scripts/check-links.sh` for background the agent does not need at that
  moment); doing nothing (an improvised engine install is the riskiest thing
  the playbook can provoke).

### D4 — The provider step states its input and its flags, and scopes the login rule

Phase 3 gains one paragraph: the wizard needs a model API key — exported, or
already in a Maki or OpenCode credential store — and, without a terminal, the
flags documented in `docs/providers.md` (`--from STORE --credential SLUG
--yes`, `--env VAR`, `--file PATH`). The "never `maki auth login`" line is
scoped to the sandbox, matching `AGENTS.md`, so host-side stores stay a
legitimate wizard source.

- **Why:** on a bare host both credential stores are empty, so the wizard as
  described scans nothing, and a non-interactive run hits a usage error with
  no documented way forward. The restriction was copied from the sandbox
  invariants without the sandbox context.
- **Alternatives rejected:** documenting the full flag table in the playbook
  (it already lives in `docs/providers.md`; duplicating it invites drift);
  removing the scan description entirely (it is accurate once a key exists).

### D5 — The daily-driver verification reports both status outcomes

Phase 5's Verify states that `maki-oss status` reports `Exists: yes` with
phase and providers, and that it reports `Exists: no` with a non-zero exit
when the project's sandbox has not been created or was removed — so the loop
can keep `stop` and `rm` in the order `docs/helper.md` presents them.

- **Why:** `maki-oss status` exits non-zero (`EX_USAGE`) for a missing
  sandbox; a literal run of the loop ends with `rm`, so the verification
  failed after a correct run.
- **Alternatives rejected:** moving `status` before the cleanup commands
  (documents a loop that hides its own cleanup result); dropping the cleanup
  lines (they belong in the everyday loop).

## Risks / Trade-offs

- **Fisher users see their path demoted** → fisher stays documented and
  working as the alternative, and `docs/helper.md` is corrected in the same
  change so the two documents agree.
- **Docs drift from the helper again** → every corrected claim is verified
  against the shipped commands in the task list (`grep` gates plus the stub
  suite), and the existing `scripts/check-links.sh` and `make test` gates
  still run.
- **`fish -c 'type -q maki-oss'` needs fish installed** → it appears only in
  the fish-labeled block, which a POSIX-only host never runs.
- **Spec additions could be read as scope creep** → both added requirements
  describe behavior the review proved the playbook lacks; the rest of the
  fixes satisfy requirements `host-setup` already declares.

## Migration Plan

Documentation only: one commit edits the two documents, syncs the delta into
`openspec/specs/host-setup/spec.md`, and archives the change. Rollback is
reverting that commit; no data, configuration, or running system is affected.

## Open Questions

None.
