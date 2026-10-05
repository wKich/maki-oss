# dashboard Specification

## Purpose
A local web dashboard for OpenShell that turns the CLI's fleet view into a live browser page: sandbox state and lifecycle, streamed logs, policy inspection, and rule-proposal review, without replacing `openshell term` or the CLI.

## Requirements

### Requirement: Local-only serving
The dashboard MUST bind to `127.0.0.1` by default. Binding to any other address MUST require an explicit token and MUST print a warning at startup.

#### Scenario: Default bind is loopback
- **WHEN** the server starts with no host argument
- **THEN** it listens only on `127.0.0.1` and the startup output states the URL

#### Scenario: Non-loopback bind demands a token
- **WHEN** the server is started with non-loopback host and no token
- **THEN** startup fails with an error that explains the requirement

### Requirement: Sandbox inventory
The dashboard MUST show every sandbox visible to the configured gateway with name, phase, image, labels, and notes (for example, invalid configuration), and MUST refresh this view at least every 5 seconds without a full page reload.

#### Scenario: New sandbox appears
- **WHEN** a sandbox is created through the CLI while the dashboard is open
- **THEN** the inventory shows it within one refresh interval without user action

#### Scenario: Invalid configuration note is visible
- **WHEN** a sandbox reports an invalid-configuration note
- **THEN** the inventory displays that note next to the sandbox

### Requirement: Lifecycle actions
The dashboard MUST support starting, stopping, and deleting an existing sandbox, and creating one from the configured defaults (image, policy, providers). Deleting MUST require the user to type the sandbox name. Every action MUST surface the gateway's success or error response in the UI.

#### Scenario: Stop reports the new phase
- **WHEN** the user stops a `Ready` sandbox
- **THEN** the action reports success and the inventory reflects the sandbox's new phase on a later refresh

#### Scenario: Delete requires typed confirmation
- **WHEN** the user activates delete without typing the exact sandbox name
- **THEN** no delete request is sent

#### Scenario: Gateway error is surfaced
- **WHEN** an action fails (for example, the sandbox was already deleted elsewhere)
- **THEN** the UI shows the CLI's error message and the inventory stays consistent with the gateway

### Requirement: Live log streaming
The dashboard MUST stream live logs for a selected sandbox, support client-side filtering by source and level, allow pause and resume, and replay a bounded recent buffer on reconnect. A stream MUST stop when its client disconnects or the sandbox is deleted.

#### Scenario: Logs flow end to end
- **WHEN** the user opens the logs view for a running sandbox
- **THEN** new log lines appear in the browser within two seconds

#### Scenario: Disconnect stops the tail
- **WHEN** the client disconnects
- **THEN** the dashboard terminates the spawned log process for that client

### Requirement: Policy inspection
The dashboard MUST display the base and effective policy of a selected sandbox as read-only text and MUST list policy revisions with their load status.

#### Scenario: Effective policy includes provider rules
- **WHEN** a sandbox has an attached provider that contributes network rules
- **THEN** the effective view shows the provider-contributed entries that the base view does not

### Requirement: Rule proposal review
The dashboard MUST list pending rule proposals for a sandbox, allow approving one, and allow rejecting one with a required reason. A rejection without a reason MUST NOT be sent.

#### Scenario: Approve clears the pending item
- **WHEN** the user approves a pending proposal
- **THEN** the proposal leaves the pending list and the dashboard reports the gateway's acceptance

#### Scenario: Rejection requires a reason
- **WHEN** the user submits a rejection with an empty reason
- **THEN** no request is sent and the UI prompts for a reason

### Requirement: Read-only mode
The dashboard MUST provide a read-only mode (flag or environment) in which every mutating route fails and the UI disables or hides mutating controls.

#### Scenario: Mutations rejected
- **WHEN** read-only mode is active and a client posts to a start, stop, delete, or approve route
- **THEN** the server responds 403 and performs no gateway action

### Requirement: CLI failure surfacing
The dashboard MUST show a prominent status when the `openshell` CLI is missing, the gateway is unreachable, or a command's output cannot be parsed, and MUST keep serving previously fetched data where available.

#### Scenario: Gateway unreachable
- **WHEN** the gateway becomes unreachable while the dashboard is open
- **THEN** the banner reports the failure with the CLI's error text and the page does not crash
