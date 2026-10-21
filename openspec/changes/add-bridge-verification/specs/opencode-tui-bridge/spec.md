# Spec Delta

## ADDED Requirements

### Requirement: Offline verification gate
The repository SHALL provide `make test-bridge`, which runs the bridge's test
suite with no Docker, no gateway, and no network: golden tests asserting the
translated OpenCode frames for recorded Maki SDK fixtures, contract tests
validating bridge response bodies against the vendored OpenAPI 2.0.32 schema
and the measured wire rules, and session API tests driving a full turn
(including a permission round trip) through the `MAKI_CHILD_CMD` seam with a
scripted child. `make test` SHALL remain the POSIX-shell stub suite.

#### Scenario: Suite passes without external services
- **WHEN** a maintainer runs `make test-bridge` on a host with `bun` but no
  running gateway, no Docker, and no network
- **THEN** every test passes and the command exits 0

#### Scenario: A translation regression fails the gate
- **WHEN** a recorded Maki fixture produces a frame sequence that differs from
  the committed golden output (for example, part events reordered)
- **THEN** the suite exits non-zero and names the fixture and the mismatching
  frames

#### Scenario: Contract and wire rules are enforced
- **WHEN** the suite runs against the bridge's emitted responses and SSE bytes
- **THEN** every validated body conforms to the vendored schema, the first SSE
  frame is `server.connected`, all frames are bare `data:` frames, and minted
  ids satisfy the OpenCode patterns

#### Scenario: The permission round trip runs offline
- **WHEN** the scripted child emits a `can_use_tool` control request during a
  session API test
- **THEN** the test answers it through the OpenCode permission endpoints,
  observes the `allow`/`deny` control_response on the child's stdin, and no
  real Maki process or sandbox is involved

### Requirement: Generated compatibility report
The repository SHALL keep `docs/compatibility.md` as a generated artifact with
three lenses: served routes with a status (served-live, served-faked,
deferred, unhandled), wire features with a status (verified, unverified,
degraded, buggy) and a link to the evidence or test that justifies it, and a
version matrix recording the pinned OpenCode version, Maki version, and
transport mode. The report SHALL be rendered by a script from a
machine-readable status file, and `make compat` SHALL regenerate it and exit
non-zero when the committed report differs from the regenerated output.

#### Scenario: Regeneration is a no-op on a clean tree
- **WHEN** a maintainer runs `make compat` with statuses unchanged
- **THEN** the committed `docs/compatibility.md` matches the regenerated file
  and the command exits 0

#### Scenario: A status change fails the gate until the report is refreshed
- **WHEN** a test run flips a feature status (for example, a `buggy` entry
  whose fix now passes its golden test)
- **THEN** `make compat` exits non-zero, and committing the regenerated report
  makes it pass again

#### Scenario: Every row carries its evidence
- **WHEN** a maintainer reads any route or feature row in the report
- **THEN** the row links the capture, log, or test name that produced its
  status, and the version matrix names the pinned OpenCode and Maki versions
  and the sandbox transport

### Requirement: Contract drift gate
The repository SHALL provide a gated script that re-captures the OpenCode
`/openapi.json` from the installed binary, diffs it against the vendored
2.0.32 copy, and reports added or removed routes and schema changes together
with the installed OpenCode and Maki versions. The script SHALL skip with an
explicit message when the required binaries are absent, and MUST NOT be part
of `make test`.

#### Scenario: Drift is reported with the delta
- **WHEN** the gate runs on a host whose installed OpenCode serves a contract
  that differs from the vendored copy
- **THEN** the output lists the route and schema differences and exits
  non-zero so the mapping and report can be revisited

#### Scenario: Missing binaries skip cleanly
- **WHEN** the gate runs without `opencode` on `PATH`
- **THEN** it prints a skip message naming the missing binary and exits 0
  without touching the vendored copy

### Requirement: Defect inventory and discovery loop
The repository SHALL maintain a machine-checkable defect inventory for the
OpenCode TUI bridge, seeded from the archived `known-defects.md` entries
(message-order inversion and synthesized model name), and SHALL provide a
scripted discovery pass that runs repeatable explorational sessions against
the bridge and appends each newly observed rendering or protocol defect with
its capture reference and a status. Each inventory entry SHALL link the
evidence that reproduces it; fixing an entry belongs to a later change, which
flips its status.

#### Scenario: The seed entries are present
- **WHEN** the inventory is read after this change lands
- **THEN** it contains both archived known defects with their capture
  references and a `known` status

#### Scenario: A discovery pass appends findings deterministically
- **WHEN** the scripted discovery pass runs and a session exhibits a rendering
  or protocol surprise not already listed
- **THEN** a new entry is appended with the session capture, and re-running
  without a new surprise adds nothing

#### Scenario: Inventory status feeds the report
- **WHEN** the compatibility report is generated
- **THEN** features with open inventory entries are reported as `buggy` with a
  link to the entry
