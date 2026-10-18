# Spec Delta

## Purpose

Guarantees that a coding agent starting from a bare macOS or Linux host can
provision the container engine, OpenShell, Maki, and the user's shell from
this repository's documentation alone, with a verification gate after every
step, a clear boundary between host setup and sandbox work, and discovery of
the playbook from the files agents read first.

## ADDED Requirements

### Requirement: Ordered host playbook with a verification gate per step

The repository SHALL provide `docs/ai/host-playbook.md` as an ordered,
agent-executable sequence from a bare host to a working `maki-oss`, where
every step states the command to run, the expected output, and a rule to stop
and report on mismatch rather than continue.

#### Scenario: Every step is checkable

- **WHEN** a maintainer reads any step of `docs/ai/host-playbook.md`
- **THEN** that step names at least one verification command together with
  the output that counts as success, and the playbook states that a failed
  check stops the run

#### Scenario: Fresh host ordering

- **WHEN** an agent follows the playbook on a machine where Docker,
  `openshell`, and `maki` are all absent
- **THEN** the steps run in dependency order — tooling, then repository and
  helper setup, then shell preparation, then the daily-driver loop — and no
  step assumes a tool the preceding steps have not installed and verified

### Requirement: Host tooling installation and verification

The playbook SHALL install and verify the container engine (Docker Engine 28+
or a documented equivalent), the OpenShell CLI with a running gateway, and the
Maki CLI, using the upstream installers, and SHALL record the required
post-install gateway recovery step for a `Disconnected` status.

#### Scenario: Engine verification

- **WHEN** the agent runs the engine step's verification
- **THEN** the command reports version `28.0` or later (for example
  `docker version --format '{{.Server.Version}}'`)

#### Scenario: Gateway verification and recovery

- **WHEN** `openshell status` does not report `Connected`
- **THEN** the playbook directs the agent to restart the gateway service
  (`brew services restart openshell` on macOS,
  `systemctl --user restart openshell-gateway` on Linux) and re-verify before
  proceeding, instead of continuing to the next step

#### Scenario: Maki CLI verification

- **WHEN** the agent runs the Maki step's verification
- **THEN** `maki --version` prints the version pinned by
  `examples/maki-image/Dockerfile`

### Requirement: Shell preparation with one verified path per shell

The playbook SHALL cover shell preparation for both zsh and fish, choosing
exactly one primary path per shell (repository `bin/` on `PATH`, or the fish
plugin through fisher, or `maki-oss fish install`), and SHALL document
`MAKI_OSS_BIN` as the fallback when the repository location must be
discovered explicitly.

#### Scenario: Primary path resolves the command

- **WHEN** an agent completes the zsh section and runs `command -v maki-oss`,
  or completes the fish section and runs `type -q maki-oss`
- **THEN** the command resolves to this repository's `bin/maki-oss`

#### Scenario: Fallback is documented

- **WHEN** neither `PATH` entry nor the fish function can locate the helper
- **THEN** the playbook states that setting `MAKI_OSS_BIN` to the absolute
  path of `bin/maki-oss` makes the wrapper resolve it

### Requirement: Daily-driver loop separated from one-time setup

The playbook SHALL separate the one-time machine setup (`maki-oss doctor`,
`maki-oss image build`, `maki-oss provider setup`) from the per-project
everyday loop (`cd <project> && maki-oss`, `maki-oss run "<prompt>"`,
`maki-oss status`, cleanup), and SHALL state the observable outcome of the
bare `maki-oss` command.

#### Scenario: One-time vs per-project separation

- **WHEN** a maintainer reads the daily-driver section
- **THEN** the commands that run once per machine are listed separately from
  the commands that run in every project, and no one-time command is presented
  as part of the per-project loop

#### Scenario: Bare command outcome stated

- **WHEN** an agent reads what `maki-oss` does with no arguments
- **THEN** the playbook states that it creates or reuses the project sandbox,
  uploads the project on first creation, attaches remembered providers,
  launches Maki, and syncs changes back on exit

### Requirement: Clear boundary to the sandbox playbook

The playbook SHALL end by handing off to `docs/ai/agent-playbook.md` for
sandbox phases, and MUST NOT contain sandbox creation, policy selection, or
isolation-verification commands of its own.

#### Scenario: No overlap with sandbox phases

- **WHEN** `docs/ai/host-playbook.md` is searched for
  `openshell sandbox create`, `openshell policy set`, and
  `openshell sandbox exec`
- **THEN** there are no matches; those steps are reached only through the
  handoff link

#### Scenario: Handoff is present

- **WHEN** an agent finishes the daily-driver section
- **THEN** the playbook links to `docs/ai/agent-playbook.md` and states that
  the sandbox phases continue there

### Requirement: Discoverable from the files agents read first

The README SHALL link `docs/ai/host-playbook.md` in its Guides list, and
`AGENTS.md` SHALL point to it in its start-here list, so an agent that reads
only the repository's instruction file reaches the playbook without searching.

#### Scenario: README link

- **WHEN** the README Guides list is read
- **THEN** it contains a working link to `docs/ai/host-playbook.md`

#### Scenario: Instruction-file pointer

- **WHEN** `AGENTS.md` is read by a coding agent
- **THEN** it names `docs/ai/host-playbook.md` as the path for setting up the
  host before running Maki

### Requirement: Versions match their canonical sources

Every version the playbook pins (Maki version, OpenShell version, container
engine minimum) SHALL match the repository's canonical source for that value —
`examples/maki-image/Dockerfile` for Maki, `docs/ai/references.md` for the
verified OpenShell and Maki versions — and the playbook SHALL link
`docs/ai/references.md` rather than restate external documentation links.

#### Scenario: Maki version consistency

- **WHEN** `MAKI_VERSION` in `examples/maki-image/Dockerfile` and the Maki
  version stated in `docs/ai/host-playbook.md` are compared
- **THEN** they are identical

#### Scenario: External links stay centralized

- **WHEN** `docs/ai/host-playbook.md` is searched for `https://` links
- **THEN** every such link is one of the URLs already listed in
  `docs/ai/references.md`
