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
`maki-oss up` SHALL start the project's sandbox when it exists and is stopped, and SHALL create it when absent, never creating a second sandbox with the same name. `maki-oss status` SHALL report existence, phase, image, and attached providers for the project sandbox. Sandbox phase and provider lookups MUST give the same result whatever the gateway's JSON layout is (pretty-printed, compact, or a single line listing several sandboxes), with or without `jq` installed.

#### Scenario: First run creates the sandbox
- **WHEN** no sandbox named `maki-myproject` exists and the user runs `maki-oss up` in `~/code/myproject`
- **THEN** a sandbox named `maki-myproject` is created from the configured image, policy, and providers

#### Scenario: Second run starts the same sandbox
- **WHEN** the sandbox exists in `Stopped` phase and the user runs `maki-oss up` again
- **THEN** the existing sandbox is started and no new sandbox is created

#### Scenario: Compact JSON without jq still resolves the phase
- **WHEN** `jq` is not installed and `openshell sandbox list --output json` returns compact JSON such as `{"sandboxes":[{"name":"maki-a","phase":"Stopped"}]}`
- **THEN** `maki-oss status` reports phase `Stopped` for `maki-a` and `maki-oss up` does not attempt a second create

#### Scenario: Single-line JSON never yields another sandbox's phase
- **WHEN** `jq` is not installed and the sandbox list is one line containing several sandboxes, where `maki-a` is `Stopped` and a later sandbox is `Ready`
- **THEN** the reported phase for `maki-a` is `Stopped`, not `Ready`

#### Scenario: Concurrent create race resolves to reuse
- **WHEN** two `maki-oss` runs race to create the same project sandbox and the second create reports that the name already exists
- **THEN** the second run re-checks the sandbox and continues by reusing it instead of exiting with a gateway error

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
The helper SHALL refuse to pass sandbox environment variables whose names contain a credential-like underscore-separated segment (`TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `API_KEY`, `ACCESS_KEY`, or `SECRET_KEY`) on every command that can create a sandbox, including `up`, bare `maki-oss`, `maki-oss maki`, and `maki-oss run`, and SHALL direct the user to `maki-oss provider add`. The check MUST run before any gateway mutation. Passing `--allow-env KEY` SHALL override the refusal for that key only.

#### Scenario: API key through --env is refused
- **WHEN** the user runs `maki-oss init --env ANTHROPIC_API_KEY=test`
- **THEN** the command exits non-zero before creating the sandbox and the error explains the provider-based alternative

#### Scenario: Session path refuses credential-like env
- **WHEN** the user runs `maki-oss run --env ANTHROPIC_API_KEY=sk-secret "hello"` with no sandbox yet
- **THEN** the command exits non-zero before any `sandbox create` invocation and the error explains the provider-based alternative

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

### Requirement: One-command project session
Bare `maki-oss` (no subcommand), `maki-oss maki`, and `maki-oss run "<prompt>"` SHALL share an idempotent ensure routine before launching Maki: resolve remembered providers from configuration, create the project sandbox when absent using the configured image, policy, resources, and remembered providers, start it when stopped, upload the current project only when that invocation created the sandbox, and attach any remembered provider that is not currently attached. When a session reuses an existing sandbox without an upload, the helper SHALL warn on stderr that the exit sync overwrites matching host files and that `maki-oss upload` refreshes the sandbox. The explicit `maki-oss up` command SHALL remain create/start-only, and explicit `upload`, `download`, and `provider attach` SHALL keep their manual semantics.

#### Scenario: Fresh project starts in one command
- **WHEN** no sandbox exists for the project and the user runs `maki-oss` (or `maki-oss run "<prompt>"`) in the project directory with providers remembered
- **THEN** the sandbox is created with those providers, the project is uploaded once, and Maki runs in the sandbox workspace

#### Scenario: Existing sandbox is reused without upload
- **WHEN** the project sandbox exists in `Ready` phase and the user runs bare `maki-oss`
- **THEN** the existing sandbox is reused and no upload invocation is recorded

#### Scenario: Reuse without upload is announced
- **WHEN** a session reuses an existing sandbox and does not upload the project
- **THEN** stderr carries a note that sync-back overwrites matching host files and mentions `maki-oss upload` as the refresh command

#### Scenario: Stopped sandbox is started
- **WHEN** the project sandbox exists in `Stopped` phase
- **THEN** the helper starts the existing sandbox and no second sandbox is created

#### Scenario: Missing provider attachment is repaired
- **WHEN** a remembered provider is not attached to the project sandbox
- **THEN** the helper attaches it with `--wait` before launching Maki

#### Scenario: Explicit up stays create-only
- **WHEN** the user runs `maki-oss up`
- **THEN** only create/start behavior runs: no upload and no Maki launch

### Requirement: Inline provider bootstrap
When no provider is remembered, the helper SHALL NOT create or start a sandbox or launch Maki. On a TTY it SHALL offer to run the provider setup flow inline and continue the session after success. When stdin is not a TTY it SHALL exit non-zero with the exact `maki-oss provider setup` command to run, before any gateway mutation. When a remembered provider name does not exist on the gateway, the helper SHALL exit non-zero naming it and pointing at `maki-oss provider setup`.

#### Scenario: TTY bootstrap continues the session
- **WHEN** bare `maki-oss` runs on a TTY with no provider remembered
- **THEN** the provider setup flow runs, the provider is remembered, and the session continues without a second invocation

#### Scenario: Non-TTY bootstrap makes no changes
- **WHEN** stdin is not a TTY and no provider is remembered
- **THEN** the helper exits non-zero with the setup command and no sandbox create, start, or exec invocation is recorded

#### Scenario: Missing gateway provider fails actionably
- **WHEN** a remembered provider is absent from the gateway
- **THEN** the command exits non-zero naming that provider and suggesting `maki-oss provider setup`, before creating a sandbox

### Requirement: Provider and model memory
On successful completion, `maki-oss provider setup` and `maki-oss provider add` SHALL record the provider instance name in the config file's `providers` list, deduplicated and comma-separated, creating the config file when absent, without altering comments or unrelated lines and without ever writing credential values. The helper SHALL accept an optional `model` config key; a `--model` flag SHALL take precedence over it, and when neither is set Maki's own selection applies. The interactive setup flow SHALL offer to set the model.

#### Scenario: Wizard remembers the provider
- **WHEN** a provider setup flow completes successfully
- **THEN** its instance name appears in the config `providers` list, and recording it again does not duplicate the name

#### Scenario: Config rewrite preserves unrelated content
- **WHEN** the config file contains comments and other keys and a provider is remembered
- **THEN** only the providers list changes and all other lines are preserved

#### Scenario: Model precedence
- **WHEN** the config sets `model = "opencode-go/deepseek-v4.1-flash"` and no flag is passed
- **THEN** that model is passed to Maki; when `--model other/model` is passed, the flag wins

#### Scenario: No credentials in config
- **WHEN** any provider is remembered
- **THEN** the config contains provider names and model ids only, never a credential value

### Requirement: Session sync-back
When a Maki session launched by bare `maki-oss`, `maki-oss maki`, or `maki-oss run` ends, including non-zero exits and interrupts, the helper SHALL download the sandbox workspace into the local project directory unless `--no-sync` is set. The transfer SHALL use `openshell sandbox download` with sources inside the sandbox workspace, SHALL merge additively by overwriting matching paths while never deleting host-only files, and SHALL NOT create a bind mount. A failed sync SHALL warn on stderr without replacing Maki's exit code. In `maki-oss run`, helper output SHALL go to stderr so stdout carries Maki's output unchanged.

#### Scenario: Interactive exit syncs changes back
- **WHEN** the user exits an interactive session after Maki changed files
- **THEN** those changes overwrite the matching local files and local-only files remain untouched

#### Scenario: Headless run syncs without polluting stdout
- **WHEN** `maki-oss run "<prompt>"` finishes
- **THEN** the workspace is downloaded, stdout contains only Maki's output, and the exit code is Maki's

#### Scenario: Interrupt still syncs
- **WHEN** the interactive session is interrupted with SIGINT
- **THEN** the helper attempts the same download before exiting

#### Scenario: No-sync opt-out
- **WHEN** `--no-sync` is passed
- **THEN** no download invocation is recorded and the helper prints the manual `download` command instead

#### Scenario: Sync failure preserves Maki's status
- **WHEN** the download fails
- **THEN** a warning goes to stderr and the helper exits with Maki's code, not the download's

### Requirement: Wizard terminates on interrupt
The provider setup wizard and every other `maki-oss` command SHALL terminate when the helper process receives SIGINT or SIGTERM, after removing its temporary files. The commands MUST NOT continue to the next step after handling the signal.

#### Scenario: SIGINT stops the wizard
- **WHEN** the user presses Ctrl-C while `maki-oss provider setup` is prompting or waiting on the gateway
- **THEN** the helper removes its temporary directory and exits with the interrupt status, without issuing further gateway commands

#### Scenario: SIGTERM stops the helper
- **WHEN** the helper receives SIGTERM during `maki-oss provider setup`
- **THEN** the process exits and does not continue to the next setup step

### Requirement: Session resume flag pass-through
The helper SHALL accept `--continue`, `--resume <ID>`, and `--session-id <ID>` on bare `maki-oss`, `maki-oss maki`, and `maki-oss run "<prompt>"`, and SHALL forward them to the Maki process it execs inside the sandbox as Maki's `--continue`, `--resume <ID>`, and `--session-id <ID>` respectively. `--continue` together with `--resume` SHALL be a usage error (exit 1) that names both flags and MUST NOT launch Maki; `--session-id` SHALL be accepted alongside either of them. A missing or empty value for `--resume` or `--session-id` SHALL be a usage error. On commands that do not launch Maki the flags SHALL be accepted and have no effect, exactly as `--model` behaves today. Passing resume flags SHALL NOT change what the helper syncs: the exit sync SHALL still download only the sandbox workspace, never the sandbox's session or state directory, and the helper MUST NOT add any host-side session storage.

#### Scenario: Interactive session resumes the most recent conversation
- **WHEN** the user runs `maki-oss maki --continue` against a `Ready` sandbox
- **THEN** the sandbox exec launches `maki` with `--continue` after it, and the session still syncs the workspace back to the host on exit

#### Scenario: Headless run resumes a session by id
- **WHEN** the user runs `maki-oss run --resume CgADMGeR7WnHDw7NJRUfN "keep going"`
- **THEN** the sandbox exec launches `maki --print --yolo --trust --output-format json --resume CgADMGeR7WnHDw7NJRUfN "keep going"` and stdout still carries only Maki's output

#### Scenario: Session flags are separated from the prompt
- **WHEN** the user runs `maki-oss run --continue "fix the tests"`
- **THEN** the prompt passed to Maki is exactly `fix the tests` and `--continue` appears only as an option, not inside the prompt

#### Scenario: Chosen session id is forwarded
- **WHEN** the user runs `maki-oss run --session-id ci-run-42 "start the migration"`
- **THEN** the sandbox exec passes `--session-id ci-run-42` to Maki and the exit sync behavior is unchanged

#### Scenario: Conflicting resume flags are refused
- **WHEN** the user runs `maki-oss maki --continue --resume CgADMGeR7WnHDw7NJRUfN`
- **THEN** the helper exits 1 with an error naming both flags and no sandbox exec is recorded

#### Scenario: Missing resume value is refused
- **WHEN** the user runs `maki-oss maki --resume` with no following argument, or passes an empty `--resume ""`
- **THEN** the helper exits 1 with a usage error that names `--resume` and launches no Maki process

#### Scenario: Flags on a non-session command have no effect
- **WHEN** the user runs `maki-oss status --continue`
- **THEN** the command runs as `status`, exits the way it would without the flag, and launches no Maki process

#### Scenario: Session state never crosses the boundary
- **WHEN** any session command with resume flags exits and the helper performs its sync
- **THEN** the download source is the sandbox workspace only, and no session transcript is written under the project directory or any host state directory by the helper
