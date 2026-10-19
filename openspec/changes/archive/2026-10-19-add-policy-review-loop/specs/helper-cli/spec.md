# Spec Delta

## ADDED Requirements

### Requirement: Agent policy proposal loop is enabled per sandbox
Session ensure (bare `maki-oss`, `maki-oss maki`, `maki-oss run`) SHALL set
the sandbox setting `agent_policy_proposals_enabled=true` on the project
sandbox before Maki attaches, so an agent that hits a denied network request
can submit a network-rule proposal and wait for the human decision. The
enable SHALL happen on fresh creation and on reuse of an existing sandbox,
SHALL be idempotent, and SHALL NOT set any approval mode (proposals stay in
manual review). `maki-oss up` SHALL NOT set the setting. A failure to set
the setting SHALL warn on stderr and continue the session rather than
abort it.

#### Scenario: Fresh sandbox gets the advisor before Maki starts
- **WHEN** session ensure creates the project sandbox and launches Maki
- **THEN** `openshell settings set <name> --key agent_policy_proposals_enabled --value true` is invoked before the Maki exec, and no `--approval-mode` or `proposal_approval_mode` change is recorded

#### Scenario: Reused sandbox is enabled too
- **WHEN** session ensure reuses an existing sandbox that predates this behavior
- **THEN** the setting is set before Maki attaches, without recreating the sandbox

#### Scenario: Setting failure does not kill the session
- **WHEN** the settings command fails (for example, an older gateway)
- **THEN** a warning goes to stderr and the session proceeds as before

#### Scenario: Explicit up stays settings-free
- **WHEN** the user runs `maki-oss up`
- **THEN** no `openshell settings set` invocation is recorded

### Requirement: Pending proposals surfaced at session exit
When a Maki session launched by bare `maki-oss`, `maki-oss maki`, or
`maki-oss run` ends — including non-zero exits and interrupts, alongside the
existing sync-back — the helper SHALL check the project sandbox for pending
network-rule proposals and, when any exist, print to stderr the count and
the `maki-oss policy review` command. The check SHALL NOT mutate proposals
and SHALL fail soft (a warning at most) when the gateway is unreachable or
the `openshell rule` subcommand is unavailable. The note SHALL NOT appear on
the `--no-sync` path or on commands that did not launch Maki.

#### Scenario: Exit with pending proposals warns
- **WHEN** a session ends and the sandbox has two pending proposals
- **THEN** stderr carries a count of pending proposals and the review command, before or after the sync note

#### Scenario: Empty inbox prints nothing extra
- **WHEN** a session ends and no proposals are pending
- **THEN** no policy note is printed

#### Scenario: Interrupted session still surfaces
- **WHEN** the interactive session is interrupted with SIGINT
- **THEN** the pending-proposal check still runs on the exit path

#### Scenario: Gateway trouble never masks Maki's exit code
- **WHEN** the pending check itself fails (gateway down, command missing)
- **THEN** at most a warning is printed and the helper exits with Maki's exit code unchanged
