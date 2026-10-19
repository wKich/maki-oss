# Spec Delta

## MODIFIED Requirements

### Requirement: Shell preparation with one verified path per shell

The playbook SHALL cover shell preparation for both zsh and fish, choosing
exactly one primary path per shell (repository `bin/` on `PATH`, or the fish
plugin through fisher, or `maki-oss fish install`), and SHALL document
`MAKI_OSS_BIN` as the fallback when the repository location must be
discovered explicitly. Every documented path SHALL be runnable on the bare
host the playbook targets: a fish path that depends on a plugin manager
SHALL be presented only as an alternative, the primary fish path SHALL be
runnable from the repository root before anything is on `PATH` or in the
fish function directory, and each shell's verification commands SHALL be
labeled so they run only in that shell.

#### Scenario: Primary path resolves the command

- **WHEN** an agent completes the zsh section and runs `command -v maki-oss`,
  or completes the fish section and runs `type -q maki-oss`
- **THEN** the command resolves to this repository's `bin/maki-oss`

#### Scenario: Fallback is documented

- **WHEN** neither `PATH` entry nor the fish function can locate the helper
- **THEN** the playbook states that setting `MAKI_OSS_BIN` to the absolute
  path of `bin/maki-oss` makes the wrapper resolve it

#### Scenario: Fish path runs before the helper is resolvable

- **WHEN** an agent with no fisher, no `maki-oss` on `PATH`, and no installed
  fish function follows the fish section from the repository root
- **THEN** the documented primary fish command runs from the repository's
  files (for example `./bin/maki-oss fish install`) and succeeds without a
  prior shell-preparation step

#### Scenario: Per-shell verification stays in its shell

- **WHEN** an agent runs the verification block for a POSIX shell
- **THEN** no fish-only command (such as `type -q` or a check of
  `~/.config/fish/…`) appears in the commands it is expected to run, and the
  fish-only checks are labeled and grouped so they run only in fish

## ADDED Requirements

### Requirement: Host preconditions are stated before the install steps

The playbook SHALL state, before the container-engine install step, every
precondition a bare host must supply that no earlier playbook step installs —
Homebrew on macOS, and container-engine access for a non-root user on Linux
(docker group membership or a rootless engine) — and SHALL give a command
that checks each precondition, so a missing precondition is reported as such
instead of surfacing as a confusing failure from a later verification.

#### Scenario: macOS engine step names Homebrew

- **WHEN** an agent reaches the macOS engine step on a host without `brew`
- **THEN** the playbook has already named Homebrew as a precondition with its
  check, so the missing `brew` is reported as an unmet precondition rather
  than an improvised install or a mid-phase stop

#### Scenario: Linux engine step names engine access

- **WHEN** an agent reaches the Linux engine step on a host where the
  non-root user cannot run containers
- **THEN** the playbook has already stated docker group membership (with the
  re-login it requires) or a rootless engine as a precondition with its check,
  so the later `maki-oss doctor` engine failure is not misread as an engine
  that is "installed but not running"

### Requirement: Provider step states its inputs and scopes the login restriction

The playbook SHALL state the input the provider wizard requires — a model API
key, exported in the environment or already present in a Maki or OpenCode
credential store — before running it, SHALL name the non-interactive forms
documented in `docs/providers.md` (`--from STORE --credential SLUG --yes`,
`--env VAR`, `--file PATH`), and SHALL scope any restriction on `maki auth
login` to the sandbox, matching `AGENTS.md`, so host-side credential stores
remain a legitimate wizard source.

#### Scenario: Required input is stated on a bare host

- **WHEN** an agent reads the provider step on a host whose Maki and
  OpenCode credential stores are empty
- **THEN** the playbook has already stated that a model API key is required
  input and where it comes from, instead of describing a scan that finds
  nothing

#### Scenario: Non-interactive forms are named

- **WHEN** the provider step runs without a terminal
- **THEN** the playbook names the non-interactive flags rather than leaving
  the agent to infer them from a usage error

#### Scenario: Login restriction is sandbox-scoped

- **WHEN** an agent reads the playbook's `maki auth login` restriction
- **THEN** it applies to the sandbox only, so host-side credential stores are
  still offered as a wizard source
