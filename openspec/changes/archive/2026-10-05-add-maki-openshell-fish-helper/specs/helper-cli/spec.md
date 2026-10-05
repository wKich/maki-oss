# Spec Delta

## Purpose

`maki-oss` is a thin, safe workflow layer over the OpenShell CLI: it creates, starts, and manages a per-project Maki sandbox with encoded defaults, and it refuses the unsafe shortcuts (host bind mounts, plaintext secrets, unconfirmed deletion) that the raw commands allow.

## ADDED Requirements

### Requirement: Configuration resolution
The helper SHALL resolve settings from command-line flags, `MAKI_OSS_*` environment variables, the config file at `${XDG_CONFIG_HOME:-$HOME/.config}/maki-openshell/config.toml`, and built-in defaults, in that order of precedence. The config file SHALL be parsed as data without executing its contents, and an unknown key SHALL cause a non-zero exit that names the file and the key.

#### Scenario: Flag overrides config and environment
- **WHEN** the config file sets `sandbox_name = "a"`, the environment sets `MAKI_OSS_SANDBOX_NAME=b`, and the user passes `--name c`
- **THEN** the helper uses `c`

#### Scenario: Unknown config key fails loudly
- **WHEN** the config file contains `opennshell_path = "/x"` (a misspelling)
- **THEN** the command exits non-zero and the error names both the config file and the unknown key

### Requirement: Idempotent sandbox lifecycle
`maki-oss up` SHALL start the project's sandbox when it exists and is stopped, and SHALL create it when absent, never creating a second sandbox with the same name. `maki-oss status` SHALL report existence, phase, image, and attached providers for the project sandbox.

#### Scenario: First run creates the sandbox
- **WHEN** no sandbox named `maki-myproject` exists and the user runs `maki-oss up` in `~/code/myproject`
- **THEN** a sandbox named `maki-myproject` is created from the configured image, policy, and providers

#### Scenario: Second run starts the same sandbox
- **WHEN** the sandbox exists in `Stopped` phase and the user runs `maki-oss up` again
- **THEN** the existing sandbox is started and no new sandbox is created

### Requirement: Headless and interactive execution
`maki-oss run "<prompt>"` SHALL execute Maki headless with `--print --yolo --trust --output-format json`, stream Maki's stdout unchanged, and exit with Maki's exit code. `maki-oss maki` SHALL attach an interactive TTY session running Maki in the sandbox workspace.

#### Scenario: Headless JSON passthrough
- **WHEN** the user runs `maki-oss run "fix the tests"` and Maki exits 0
- **THEN** stdout contains Maki's JSON result and the helper exits 0

#### Scenario: Non-zero Maki exit propagates
- **WHEN** Maki exits 1 in a headless run
- **THEN** the helper exits 1 without rewriting or swallowing Maki's output

### Requirement: Project transfer in and out
`maki-oss upload [path]` SHALL copy a local directory into the sandbox workspace using `openshell sandbox upload` and SHALL NOT create a bind mount or any other host filesystem exposure. `maki-oss download [path] [dest]` SHALL copy files from the sandbox workspace to an explicit host destination.

#### Scenario: Upload never mounts
- **WHEN** the user runs `maki-oss upload .`
- **THEN** the helper invokes `openshell sandbox upload` and its argv contains no mount or bind option

### Requirement: Secret hygiene
The helper SHALL refuse to pass sandbox environment variables whose names contain a credential-like underscore-separated segment (`TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `API_KEY`, `ACCESS_KEY`, or `SECRET_KEY`), and SHALL direct the user to `maki-oss provider add`. Passing `--allow-env KEY` SHALL override the refusal for that key only.

#### Scenario: API key through --env is refused
- **WHEN** the user runs `maki-oss init --env ANTHROPIC_API_KEY=test`
- **THEN** the command exits non-zero before creating the sandbox and the error explains the provider-based alternative

#### Scenario: Explicit override is honored
- **WHEN** the user runs `maki-oss init --env MY_TOKEN=x --allow-env MY_TOKEN`
- **THEN** the variable is passed through to the sandbox

#### Scenario: Non-segment lookalikes pass
- **WHEN** the user passes `--env TOKENIZERS_PARALLELISM=false`
- **THEN** the variable is passed through without a refusal

### Requirement: Prerequisite diagnostics
`maki-oss doctor` SHALL check at least: the `openshell` CLI exists, the gateway is reachable, the configured container engine is available, the configured image exists locally or is pullable, and configured policy and provider names resolve. It SHALL print one line per check and exit non-zero when any check fails.

#### Scenario: Missing OpenShell reported
- **WHEN** `doctor` runs with no `openshell` on `PATH`
- **THEN** the output names that failure first and exits non-zero without attempting sandbox operations

### Requirement: Destructive commands require confirmation
`maki-oss rm` SHALL print the exact sandbox name and require interactive confirmation or an explicit `--yes` flag before deleting. When stdin is not a TTY it SHALL require `--yes` and otherwise exit non-zero without deleting.

#### Scenario: rm without --yes prompts
- **WHEN** the user runs `maki-oss rm` interactively
- **THEN** the helper prints the sandbox name and waits for confirmation before deleting

#### Scenario: Non-interactive rm without --yes fails
- **WHEN** stdin is not a TTY and `--yes` is not passed
- **THEN** the command exits non-zero and no delete request is sent
