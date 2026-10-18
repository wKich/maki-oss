# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Wizard terminates on interrupt
The provider setup wizard and every other `maki-oss` command SHALL terminate when the helper process receives SIGINT or SIGTERM, after removing its temporary files. The commands MUST NOT continue to the next step after handling the signal.

#### Scenario: SIGINT stops the wizard
- **WHEN** the user presses Ctrl-C while `maki-oss provider setup` is prompting or waiting on the gateway
- **THEN** the helper removes its temporary directory and exits with the interrupt status, without issuing further gateway commands

#### Scenario: SIGTERM stops the helper
- **WHEN** the helper receives SIGTERM during `maki-oss provider setup`
- **THEN** the process exits and does not continue to the next setup step
