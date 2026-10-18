# Proposal

## Why

A coding agent that lands on a bare machine has no executable path to a
working `maki-oss`: `docs/ai/agent-playbook.md` starts at a preflight that
already assumes Docker, the OpenShell CLI, a running gateway, and Maki exist,
while `docs/setup-guide.md` is a human narrative that neither gates each step
with a verification nor covers shell preparation or the everyday loop. The
result is that "set this up for me" currently has to be improvised — tool
installs, `PATH`, the fish plugin, and what daily use looks like are all
undocumented as an ordered, checkable sequence.

## What Changes

- Add `docs/ai/host-playbook.md`: an ordered, agent-executable playbook that
  takes a bare macOS (Apple Silicon) or Linux host to a daily-driver
  `maki-oss`, with an explicit verification command and expected output after
  every step, and a stop-on-mismatch rule in the same spirit as the existing
  `docs/ai/agent-playbook.md`.
  - **Host tooling install:** container engine (Docker Engine 28+ or OrbStack),
    OpenShell CLI + gateway, Maki CLI — each with its install command, its
    upstream installer URL, and a verification (`docker version`,
    `openshell status`, `maki --version`).
  - **Repository and helper setup:** clone, `maki-oss doctor`,
    `maki-oss image build`, `maki-oss provider setup`.
  - **Shell preparation:** put `bin/` on `PATH` (zsh and fish), or install the
    fish plugin with `fisher install ./fish` / `maki-oss fish install`, with
    `MAKI_OSS_BIN` as the documented fallback — one chosen path per shell, each
    verified by `command -v maki-oss` / `type -q maki-oss` and a completion
    check.
  - **Daily driver:** the `cd <project> && maki-oss` loop, `maki-oss run` for
    headless, `maki-oss status`, and the cleanup commands, presented as the
    everyday workflow rather than as reference material.
  - **Handoff:** the pointer from host setup into
    `docs/ai/agent-playbook.md` (sandbox phases) so the two playbooks read as
    one sequence without duplicating each other's steps.
- Link the new playbook from the README Guides list and add a pointer in
  `AGENTS.md` so an agent reading the repository's instruction file finds it
  before improvising.
- **Does not change** any command, script, fish file, example, policy, or the
  sandbox boundary: every step documents and verifies existing behavior.

## Capabilities

### New Capabilities

- `host-setup`: the repository's guarantee that a coding agent can take a bare
  host to a working, verified `maki-oss` daily driver from documentation
  alone — ordered steps, per-step verification, shell preparation choices,
  and discoverability from the repository's instruction file and README.

### Modified Capabilities

_None._ `helper-cli`, `fish-integration`, and `dashboard` describe the
behavior of shipped code; this change documents and verifies that behavior
without altering any requirement.

## Impact

- **New file:** `docs/ai/host-playbook.md`.
- **Edits to two existing files:** `README.md` (one Guides link) and
  `AGENTS.md` (pointer to the playbook in its start-here list).
- **Documentation only** — no code, no examples, no configuration changes; the
  test suite and lint gates are unaffected by construction and still run as
  regression checks.
- **Depends on upstream behavior:** OpenShell installation
  (<https://docs.nvidia.com/openshell/about/installation.md>) and its
  install script
  (<https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh>),
  the support matrix (<https://docs.nvidia.com/openshell/about/support-matrix.md>),
  Maki's quick start (<https://maki.sh/docs/quick-start/>) and install script
  (<https://maki.sh/install.sh>), plus container-engine requirements already
  stated in `docs/setup-guide.md` §2. All are listed in
  `docs/ai/references.md`, which stays the only external-link index.
- **Risk of drift:** the playbook repeats install commands that also live in
  `docs/setup-guide.md`; the design must decide whether the playbook links
  §2–§3 for installs or restates them, otherwise the two documents can
  disagree.
- **No effect on:** the sandbox boundary, provider profiles, policies,
  `bin/maki-oss`, `fish/`, `dashboard/`, or the verification checklist in
  `docs/verification.md`.
