# Policy Review Specification

## Purpose

Lets a human see and answer agent-authored network-rule proposals: list
pending proposals for the project sandbox, approve or reject them by chunk
id, and keep the review loop deny-by-default with the human as the only
approver.

## Requirements

### Requirement: Policy review commands
The helper SHALL provide `maki-oss policy review` to list the project
sandbox's pending network-rule proposals (a passthrough to `openshell rule
get <name> --status pending`), `maki-oss policy approve <chunk-id>` to
approve one proposal, and `maki-oss policy reject <chunk-id> --reason
"<text>"` to reject one proposal with a reason. `policy review` SHALL print
each pending proposal's chunk id, rule name, binary, endpoint(s), and
prover verdict, including when the underlying `openshell rule get` output
is text-only (gateway v0.1.2 has no JSON output). When no proposals are
pending, `policy review` SHALL report that and exit zero.

#### Scenario: Pending proposals are listed with actionable ids
- **WHEN** the sandbox has pending proposals and the user runs `maki-oss policy review`
- **THEN** each proposal's chunk id, rule name, binary, endpoint, and prover verdict are printed, and no gateway mutation is recorded

#### Scenario: Empty inbox is not an error
- **WHEN** no proposals are pending and the user runs `maki-oss policy review`
- **THEN** the helper reports no pending proposals and exits zero

#### Scenario: Approve targets exactly one chunk
- **WHEN** the user runs `maki-oss policy approve <chunk-id>`
- **THEN** the helper invokes `openshell rule approve <name> --chunk-id <chunk-id>` for that chunk only, never a bulk approve

### Requirement: Approval confirmation
`maki-oss policy approve` SHALL require interactive confirmation of the
exact sandbox name and chunk id, or an explicit `--yes` flag. When stdin is
not a TTY and `--yes` is absent, it SHALL exit non-zero without invoking the
approve command. `maki-oss policy reject` SHALL require a non-empty
`--reason` and SHALL pass it through to the agent.

#### Scenario: Interactive approve confirms first
- **WHEN** the user runs `maki-oss policy approve <chunk-id>` on a TTY
- **THEN** the helper prints the sandbox name and chunk id and waits for confirmation before invoking `openshell rule approve`

#### Scenario: Non-interactive approve without --yes fails
- **WHEN** stdin is not a TTY and `--yes` is absent
- **THEN** the helper exits non-zero and no approve invocation is recorded

#### Scenario: Reject without a reason is a usage error
- **WHEN** the user runs `maki-oss policy reject <chunk-id>` with no `--reason`
- **THEN** the helper exits non-zero with usage pointing at `--reason`

#### Scenario: Rejection reason reaches the agent
- **WHEN** the user rejects a chunk with a reason
- **THEN** the helper invokes `openshell rule reject <name> --chunk-id <chunk-id> --reason "<text>"` so the agent receives the reason

### Requirement: Review posture stays deny-by-default
The helper SHALL NOT provide bulk approval or bulk rejection commands, SHALL
NOT enable any automatic proposal approval mode, and SHALL NOT approve,
reject, or modify proposals on any automatic path (session start, session
exit, or otherwise). Proposals take effect only through an explicit human
approve.

#### Scenario: No automatic approvals anywhere
- **WHEN** any helper command runs, including session ensure and session exit
- **THEN** no `openshell rule approve` or `openshell rule reject` invocation is recorded as a side effect
