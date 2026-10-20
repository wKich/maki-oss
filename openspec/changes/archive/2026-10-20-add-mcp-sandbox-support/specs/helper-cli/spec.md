# Spec Delta

## ADDED Requirements

### Requirement: MCP readiness command
`maki-oss mcp status` SHALL compare the servers enabled in the host's
`~/.config/maki/mcp.toml` against the servers present in the project sandbox's
MCP config, and SHALL report one line per server naming each gate that decides
whether the server works in the sandbox: present in the sandbox config, provider
attached to the project sandbox, endpoint present in the effective policy, and
transport supported. A server enabled on the host but absent from the sandbox
SHALL be reported by name as missing from the sandbox, together with the command
that rebuilds the image. It SHALL exit non-zero when any server fails a gate,
and SHALL print the command that fixes each failing gate. When no sandbox exists
for the project, or neither the host config nor the sandbox config declares an
enabled server, it SHALL report that and exit zero. It SHALL NOT mutate the
sandbox, gateway, profiles, or policy, and MUST NOT print any credential value.

#### Scenario: All gates satisfied exits zero
- **WHEN** a server's config, provider attachment, endpoint, and transport all hold and the user runs `maki-oss mcp status`
- **THEN** the output names the server with every gate satisfied and the command exits 0

#### Scenario: A failing gate names its fix
- **WHEN** a server's provider is not attached and the user runs `maki-oss mcp status`
- **THEN** the output names the attachment as the failing gate, prints the `maki-oss provider attach` command, and the command exits non-zero

#### Scenario: A host server missing from the sandbox is named
- **WHEN** the host's `~/.config/maki/mcp.toml` enables a server that the sandbox's MCP config does not contain, and the user runs `maki-oss mcp status`
- **THEN** that server is reported by name as missing from the sandbox with the image-rebuild command, and the command exits non-zero

#### Scenario: No sandbox reports cleanly
- **WHEN** the user runs `maki-oss mcp status` with no project sandbox
- **THEN** the command reports no sandbox and exits 0 without attempting sandbox operations

#### Scenario: Report performs no mutation
- **WHEN** `maki-oss mcp status` runs against a `Ready` sandbox
- **THEN** no `sandbox create`, `provider attach`, `profile import`, or policy update invocation is recorded, and no credential value appears in the output

### Requirement: Doctor reports MCP readiness
`maki-oss doctor` SHALL include the MCP readiness table after its existing
prerequisite checks, reusing the same per-server gate output as
`maki-oss mcp status`. MCP readiness is not a prerequisite for running Maki, so
the doctor exit code SHALL be decided only by its prerequisite checks: an MCP
gate failure SHALL be reported but MUST NOT make doctor exit non-zero.

#### Scenario: Doctor reports an MCP failure without failing
- **WHEN** a configured MCP server's provider is not attached and the user runs `maki-oss doctor`
- **THEN** the doctor output includes that server's failing gate, and the doctor exit code is decided by its prerequisite checks alone

#### Scenario: No MCP servers is not a doctor failure
- **WHEN** the user runs `maki-oss doctor` with no MCP servers configured
- **THEN** the MCP section reports none configured and the doctor run's exit code is decided by its other checks
