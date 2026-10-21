# Spec Delta

## Purpose

Lets the OpenCode TUI render its compact transcript over a live Maki session
running inside the project's OpenShell sandbox by serving the OpenCode
HTTP+SSE contract and translating Maki's SDK stream into it, without forking
either upstream project.

## ADDED Requirements

### Requirement: Serve the OpenCode boot and config surface
The bridge SHALL answer the OpenCode `2.0.32` boot and config reads the TUI
performs — `/api/info`, agent/model/config reads, and the session/worktree list
routes — with spec-valid, internally consistent payloads so the TUI reaches a
usable composer without a "session location unavailable" dialog.

#### Scenario: TUI boots against the bridge
- **WHEN** the OpenCode TUI is started with `--server` pointed at the bridge
- **THEN** every route it calls during boot is answered with a 2xx and a
  schema-valid body, and none returns an unhandled 404

#### Scenario: Location data is self-consistent
- **WHEN** the TUI reads session, project, and subpath location data
- **THEN** the project canonical equals the session directory, all paths are
  absolute, and `subpath` is empty, so the composer is not blocked

#### Scenario: Enum-bearing responses decode
- **WHEN** the TUI reads agent, model, or migration status enums
- **THEN** the primary agent is selectable (mode not `subagent`), migration
  status does not block submission, and no first-enum-value default prevents
  the user from sending a prompt

### Requirement: Maintain one Maki session behind one OpenCode session
The bridge SHALL run one Maki SDK session per OpenCode session — Maki running
inside the project sandbox, reached over `openshell sandbox exec` stdio — and
SHALL mint and map OpenCode-shaped ids (`ses_`, `msg_`, `per_`, `evt_`) to and
from Maki's ids.

#### Scenario: Session lifecycle maps one-to-one
- **WHEN** the TUI lists, reads, creates, or deletes a session
- **THEN** the bridge performs the corresponding operation on the Maki session
  it owns and returns ids that satisfy the OpenCode id patterns

#### Scenario: Minted ids are stable within a session
- **WHEN** the bridge emits multiple event frames for one turn
- **THEN** the assistant message id is the same minted `msg_` in every part
  event for that turn, and each frame carries a distinct `evt_` id

### Requirement: Translate the prompt into an OpenCode transcript
The bridge SHALL accept a prompt on the OpenCode prompt endpoint and emit SSE
event frames covering reasoning, text, tool, step, and execution boundaries as
Maki reports them, for both streamed and non-streamed Maki output.

#### Scenario: Plain text turn renders
- **WHEN** the user submits a prompt and Maki returns an assistant text part
- **THEN** the bridge emits `session.text.started`, one or more
  `session.text.delta`, and `session.text.ended` carrying the full text

#### Scenario: Reasoning and tool parts render
- **WHEN** the assistant message carries thinking and tool_use parts
- **THEN** the bridge emits the corresponding `session.reasoning.*` and
  `session.tool.input.*`/`session.tool.called` frames, and maps each
  tool_result to `session.tool.success` or `session.tool.failed`

#### Scenario: Turn completion is reported
- **WHEN** Maki emits a `result` frame
- **THEN** the bridge emits the matching `session.step.ended` with usage and
  finish status, and `session.execution.succeeded` or `session.execution.failed`

#### Scenario: Event stream opens correctly
- **WHEN** the TUI connects to the event stream
- **THEN** the first frame is `server.connected` and subsequent frames follow
  the wire format the real server uses

### Requirement: Round-trip tool permissions
The bridge SHALL forward each Maki `can_use_tool` control request to the TUI as
a permission request, block that tool call until the TUI answers, and map the
TUI's reply onto Maki's `allow`/`deny` wire answer. A reply of `always` SHALL be
honored for that one call only; every later tool call re-prompts.

#### Scenario: User allows one call
- **WHEN** Maki requests permission and the user answers "allow once"
- **THEN** the bridge answers Maki `behavior: allow` and the tool executes

#### Scenario: User rejects
- **WHEN** the user rejects the request
- **THEN** the bridge answers Maki `behavior: deny` and Maki reports the call
  as rejected

#### Scenario: Always re-prompts the next call
- **WHEN** the user answers "always" and a later matching tool call requests
  permission
- **THEN** the bridge asks the TUI again rather than auto-allowing

### Requirement: Follow the wire, not the schema, for SSE frames
The bridge SHALL emit event frames in the format the measured server uses — bare
`data:` frames with the event type inside the JSON envelope — rather than the
`event:` field the OpenAPI frame schema requires.

#### Scenario: Frames match the measured wire
- **WHEN** the TUI consumes a bridge event stream
- **THEN** each frame is a bare `data:` frame the TUI accepts, and no frame is
  rejected for a missing `event:` line

### Requirement: Sandbox transport and host exposure
The bridge SHALL run Maki by spawning `openshell sandbox exec` for the project
sandbox with `--no-login-shell`, the configured workdir, Maki's SDK flags
(`-p --input-format stream-json --output-format stream-json`), and the
configured model, over a stdin/stdout pipe that stays open for the session's
lifetime. The exec invocation MUST NOT pass any `--env` value. The Maki child
command SHALL be overridable through one environment variable so a scripted
process can replace it. The bridge SHALL listen on loopback only by default;
binding to any other address SHALL require a configured password and print a
warning. Bridge logs MUST NOT contain credential material.

#### Scenario: Exec carries no environment values
- **WHEN** the bridge starts a Maki child for a session
- **THEN** the recorded `openshell sandbox exec` argv contains
  `--input-format stream-json`, `--output-format stream-json`, `--no-login-shell`
  and the workdir, and contains no `--env` flag

#### Scenario: A scripted child replaces the sandbox transport
- **WHEN** the Maki child override environment variable points at a scripted
  process that speaks the Maki SDK wire
- **THEN** the bridge drives that process exactly as it drives the sandbox
  child, with no other code path difference

#### Scenario: Default bind is loopback
- **WHEN** the bridge starts with no address configured
- **THEN** it listens only on `127.0.0.1` and the startup output states the URL

#### Scenario: Logs are free of credentials
- **WHEN** a full session has run with bridge logging enabled
- **THEN** the request, SSE, and stdout logs match a credential-pattern scan
  with no finding
