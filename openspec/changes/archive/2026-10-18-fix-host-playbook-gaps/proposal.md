# Proposal

## Why

A review of the shipped host playbook (change `add-host-setup-agent-playbook`)
found that its shell-preparation and provider steps fail on exactly the bare
hosts it targets: the documented fish fallback `maki-oss fish install` cannot
resolve before anything is on `PATH` or in the fish function directory, the
Phase 4 Verify block runs the fish-only `type -q` on zsh/bash and trips the
playbook's own stop-on-mismatch rule, the provider wizard is presented with no
statement of its required input or its non-interactive forms, and Phase 2
assumes Homebrew (macOS) and an engine the non-root user can run (Linux) that
a bare host does not have. Most of this already violates requirements the
`host-setup` capability declares; two expectations were never written down, so
they can regress silently.

## What Changes

- **`docs/ai/host-playbook.md` corrections** (no behavior of shipped code
  changes):
  - Phase 4 fish: the self-contained `./bin/maki-oss fish install` (run from
    the repository root) becomes the documented path; `fisher install ./fish`
    becomes the optional alternative, since no earlier step installs fisher.
  - Phase 4 Verify: each shell's check runs only in that shell —
    `command -v maki-oss` for POSIX shells, `fish -c 'type -q maki-oss'` plus
    the completion check for fish.
  - Phase 3 provider step: states its input (a model API key — exported, or
    already in a Maki/OpenCode credential store) and the non-interactive forms
    (`--from STORE --credential SLUG --yes`, `--env VAR`, `--file PATH`, all
    documented in `docs/providers.md`), and scopes the "never `maki auth
    login`" rule to the sandbox, matching `AGENTS.md`.
  - Phase 2: states the preconditions a bare host must supply before the
    install commands — Homebrew on macOS, and engine access for a non-root
    user on Linux (docker group or rootless engine) — each with a check.
  - Phase 5 Verify: reports the `maki-oss status` outcome for a project whose
    sandbox was removed (`Exists: no`, non-zero exit) instead of failing the
    stop-on-mismatch gate.
  - Phase 3 wording: tolerates `maki-oss doctor`'s `warn` line when `jq` is
    absent.
- **`docs/helper.md`**: the same `./bin/maki-oss fish install` correction, so
  the two documents do not disagree.
- **Spec-level (`host-setup`)**: two new requirements — host preconditions are
  stated before use, and the provider step states its inputs — plus added
  scenarios to the existing shell-preparation requirement (a self-contained
  fish path; per-shell verification stays in its shell).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `host-setup`: adds requirements that the playbook state host preconditions
  (Homebrew, engine access) and the provider step's required input and
  non-interactive forms before use; adds scenarios to shell preparation
  requiring a fish path that needs no plugin manager and verification blocks
  that run only in the shell they target.

## Impact

- **Files:** `docs/ai/host-playbook.md`, `docs/helper.md`, and the synced
  `openspec/specs/host-setup/spec.md`.
- **Documentation only** — no change to `bin/maki-oss`, `fish/`, `dashboard/`,
  `examples/`, or any policy; `make test` and `make lint` are unaffected by
  construction and stay regression gates.
- **No new external links:** Homebrew and the Linux docker-group step are
  named without URLs, so `docs/ai/references.md` stays the only external-link
  index and the host-setup requirement "external links stay centralized" holds
  without edits.
- **Security invariants unchanged:** no sandbox, policy, or credential-handling
  behavior changes; the `maki auth login` restriction is clarified to be
  sandbox-scoped exactly as `AGENTS.md` states it.
