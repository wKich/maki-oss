# Spec Delta

## ADDED Requirements

### Requirement: OAuth-gated MCP servers authenticate outside the sandbox

An OAuth-gated MCP server SHALL be supported by completing the login on the
host and handing the gateway a refresh token, so the gateway mints and rotates
the access token and the sandbox receives only a placeholder. The helper MUST
NOT run an OAuth callback, browser flow, or `maki mcp auth` inside the sandbox.
A server whose token endpoint requires an RFC 8707 `resource` parameter SHALL
be reported as unsupported. A server whose token endpoint rejects the
gateway's client authentication SHALL be reported with that reason rather
than appearing broken without cause, and its profile SHALL remain a shipped,
lint-clean exemplar of the correct shape until the mismatch is resolved.

#### Scenario: A refresh-token-backed server is reachable with no token in the sandbox
- **WHEN** the user completes the host-side login and attaches the resulting provider
- **THEN** the sandbox process env holds a placeholder rather than an access token, and requests to the server reach it with a gateway-minted token

#### Scenario: No OAuth flow runs in the sandbox
- **WHEN** any helper command sets up an OAuth-gated MCP server
- **THEN** no command launches a callback listener or browser inside the sandbox, and the login step is printed as a host command for the user to run

#### Scenario: The host login resolves against the host config
- **WHEN** the user runs `maki mcp auth <server>` for a server declared only in the sandbox's baked config
- **THEN** the command reports the server as unknown, and the documented flow has the user declare it in the host's `~/.config/maki/mcp.toml` (url only) first

#### Scenario: A token endpoint that rejects the gateway is named
- **WHEN** the gateway's refresh exchange is rejected by the server's token endpoint
- **THEN** `openshell provider refresh status` shows the failure code, `maki-oss mcp status` keeps reporting the attachment gates, and the limitation is recorded in `docs/verification-log.md` rather than hidden
