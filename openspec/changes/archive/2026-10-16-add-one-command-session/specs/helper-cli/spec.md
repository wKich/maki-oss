# Spec Delta

## ADDED Requirements

### Requirement: One-command project session
Bare `maki-oss` (no subcommand), `maki-oss maki`, and `maki-oss run "<prompt>"` SHALL share an idempotent ensure routine before launching Maki: resolve remembered providers from configuration, create the project sandbox when absent using the configured image, policy, resources, and remembered providers, start it when stopped, upload the current project only when that invocation created the sandbox, and attach any remembered provider that is not currently attached. The explicit `maki-oss up` command SHALL remain create/start-only, and explicit `upload`, `download`, and `provider attach` SHALL keep their manual semantics.

#### Scenario: Fresh project starts in one command
- **WHEN** no sandbox exists for the project and the user runs `maki-oss` (or `maki-oss run "<prompt>"`) in the project directory with providers remembered
- **THEN** the sandbox is created with those providers, the project is uploaded once, and Maki runs in the sandbox workspace

#### Scenario: Existing sandbox is reused without upload
- **WHEN** the project sandbox exists in `Ready` phase and the user runs bare `maki-oss`
- **THEN** the existing sandbox is reused and no upload invocation is recorded

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
