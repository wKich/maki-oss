# helper-cli Specification

## Purpose
`maki-oss` is a thin, safe workflow layer over the OpenShell CLI: it creates, starts, and manages a per-project Maki sandbox with encoded defaults, and it refuses the unsafe shortcuts (host bind mounts, plaintext secrets, unconfirmed deletion) that the raw commands allow.

## Requirements

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
`maki-oss run "<prompt>"` SHALL execute Maki headless with `--print --yolo --trust --output-format json`, stream Maki's stdout unchanged, and exit with Maki's exit code. `maki-oss run` SHALL accept `--model <provider/model>` and pass it to Maki as its model selection. `maki-oss maki` SHALL attach an interactive TTY session running Maki in the sandbox workspace.

#### Scenario: Headless JSON passthrough
- **WHEN** the user runs `maki-oss run "fix the tests"` and Maki exits 0
- **THEN** stdout contains Maki's JSON result and the helper exits 0

#### Scenario: Non-zero Maki exit propagates
- **WHEN** Maki exits 1 in a headless run
- **THEN** the helper exits 1 without rewriting or swallowing Maki's output

#### Scenario: Model selection is passed through
- **WHEN** the user runs `maki-oss run --model opencode-go/deepseek-v4.1-flash "check"`
- **THEN** the sandbox exec invocation passes that model to Maki's `--model` option

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

### Requirement: Provider setup wizard
`maki-oss provider setup` SHALL provide an interactive flow that discovers stored credentials, resolves a provider profile, ensures the profile is known to the gateway, creates or updates the provider, and offers to attach it to the project sandbox. Every step SHALL be available non-interactively through flags (at least `--from`, `--credential`, `--profile`, and `--yes`) for scripted use. When stdin is not a TTY and the flags needed to complete the flow are absent, the command SHALL exit non-zero before performing any gateway mutation.

#### Scenario: Interactive setup from a stored credential
- **WHEN** a supported store contains an API-key credential and the user selects it in `maki-oss provider setup`
- **THEN** the helper lints and imports the resolved profile, creates the provider from the stored key, and prints next-step guidance

#### Scenario: Non-TTY without flags makes no changes
- **WHEN** stdin is not a TTY and the required flags are absent
- **THEN** the command exits non-zero and no `openshell profile import`, `provider create`, or `provider update` invocation is recorded

### Requirement: Credential store scanning
The helper SHALL detect API-key credentials in the Maki store (`~/.local/state/maki/auth/*.json` and `~/.local/state/maki/auth/plugins/*.json`) and the OpenCode store (`~/.local/share/opencode/auth.json`), and SHALL present each credential's store, provider id, and auth type. OAuth credentials SHALL be presented as unsupported and SHALL NOT be usable for provider creation. Storage scanning SHALL NOT display or log credential values.

#### Scenario: API-key credentials are listed
- **WHEN** the Maki store holds an `opencode-go` key and the OpenCode store holds a `deepseek` key
- **THEN** both are listed with their store and provider id, and neither value appears in the output

#### Scenario: OAuth credentials are not selectable
- **WHEN** the OpenCode store holds an `openai` credential of type `oauth`
- **THEN** it is listed as unsupported, and selecting it exits non-zero with guidance without creating or updating any provider

#### Scenario: No supported store present
- **WHEN** neither store exists on the host
- **THEN** the helper reports no detected credentials and offers the generic credential sources instead of failing

### Requirement: Generic credential sources
For credentials not present in a supported store, the helper SHALL accept a JSON file with a field path, a host environment variable name, or a hidden interactive prompt, and SHALL use the resulting value only in the provider creation flow.

#### Scenario: JSON file with field path
- **WHEN** the user selects a file source with a field path
- **THEN** the value at that path is used for provider creation

#### Scenario: Environment variable source
- **WHEN** the user selects an environment variable source and the variable is set on the host
- **THEN** the helper uses it without reading from stdin

#### Scenario: Hidden prompt source
- **WHEN** the user selects the hidden prompt source in an interactive session
- **THEN** the helper reads the value with terminal echo disabled and does not echo it

### Requirement: Profile resolution and generation
Given a selected credential, the helper SHALL resolve a provider profile from: a curated profile file under `examples/providers/` matched through the catalog mapping, an explicit `--profile` file, or a generated custom profile for an unknown provider. Custom profiles SHALL be generated only after validating the provider id (kebab-case), credential environment variable name, host, and API path, and SHALL be written under `${XDG_CONFIG_HOME:-$HOME/.config}/maki-openshell/profiles/`. Profiles SHALL be linted before import, imported at global scope, and an existing generated profile SHALL NOT be overwritten without confirmation.

#### Scenario: Curated provider resolves to a shipped profile
- **WHEN** the selected credential matches a catalog entry
- **THEN** the matching file under `examples/providers/` is used and no generated file is written

#### Scenario: Custom provider generates a profile
- **WHEN** an unknown provider is configured with an env var, host, and API path
- **THEN** a profile file is generated in the helper's profiles directory, linted, and imported

#### Scenario: Invalid custom input is rejected
- **WHEN** a custom provider would be generated with an invalid id or without a host
- **THEN** the helper exits non-zero without writing a profile or importing anything

#### Scenario: Existing generated profile is preserved
- **WHEN** the target generated profile already exists and the user declines overwriting
- **THEN** the existing file is left unchanged

### Requirement: Credential non-exposure
The helper SHALL supply credential values to the OpenShell CLI only through the environment of the invoked child process. It SHALL NOT place values in command arguments, write them to any file, or print them to stdout or stderr, including error messages and logs, and its output SHALL be safe to capture in a shared log.

#### Scenario: Credential absent from argv
- **WHEN** the wizard creates a provider from a stored key
- **THEN** the recorded `openshell` invocation contains `--from-existing` and no credential value

#### Scenario: Credential absent from output
- **WHEN** a store-sourced setup flow completes or fails
- **THEN** stdout and stderr contain no credential value

#### Scenario: Credential absent from generated files
- **WHEN** a custom profile is generated
- **THEN** the file contains profile configuration only and no credential value

### Requirement: Provider create or update
The helper SHALL create the provider when its name does not exist, and SHALL offer to update an existing provider through the gateway's discovery flow instead of failing. When a provider is created or updated and a sandbox is selected, the helper SHALL offer to attach it and SHALL wait for the attachment to be applied when confirmed.

#### Scenario: New provider is created
- **WHEN** no provider with the target name exists
- **THEN** the helper runs `provider create --from-existing`

#### Scenario: Existing provider is updated
- **WHEN** the provider name already exists and the user confirms
- **THEN** the helper runs `provider update --from-existing` and creates no duplicate

#### Scenario: Optional attach waits for apply
- **WHEN** the user confirms attaching the provider to a sandbox
- **THEN** the helper runs `sandbox provider attach` with `--wait`
