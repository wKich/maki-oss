# Proposal

## Why

Maki sessions launched through `maki-oss` run inside an OpenShell sandbox whose
Maki config directory is baked at image build with `init.lua` and
`permissions.toml` only, so every MCP server the user configured on the host
(`~/.config/maki/mcp.toml`) is silently absent in the sandbox. Nothing tells the
user: the session starts, the tools are simply not there.

Making MCP work in the sandbox needs more than copying a config file. The
endpoint must be reachable (deny-by-default egress), the server's credential
must be present without entering the sandbox (no secrets through `--env`, no
host bind mounts), and OAuth-gated servers cannot complete a browser flow inside
the sandbox's network namespace. OpenShell already supplies the machinery for
all three — MCP-aware network endpoints and gateway-brokered OAuth tokens — but
this repository uses none of it, and the current guidance
(`docs/mcp-migration.md` §4) tells users to keep OAuth servers on the host.

Two verified facts make this change timely: an MCP-shaped provider profile
lint-passes on the installed gateway (`protocol: mcp` with method/tool rules,
`oauth2_refresh_token` and `token_grant` shapes all accepted), and the installed
OpenShell is v0.1.2 while v0.1.4 (2026-10-13) is current. The v0.1.2 gateway
refuses `protocol: mcp` on the incremental `policy update --add-endpoint` path,
so profiles are the only route to MCP egress, and one v0.1.4 field rename
(`token_grant.token_endpoint` → `token_url`) means profiles must be authored
against the version actually installed.

## What Changes

- Ship MCP-shaped OpenShell provider profiles under `examples/providers/`, one
  per supported MCP server, declaring the server's endpoint as `protocol: mcp`
  with the credential bound to that host/port/path. These profiles are both the
  egress rule and the credential boundary; they replace the "copy a network
  policy entry per server" step.
- Add a sandbox-side MCP config step so an enabled server's definition exists at
  `/sandbox/.config/maki/mcp.toml`, referencing its credential only as a
  `${VAR}` placeholder that the proxy resolves at the declared endpoint.
- Add MCP readiness reporting: `maki-oss mcp status` compares the host's
  `~/.config/maki/mcp.toml` against the sandbox's MCP config and prints a
  per-server gate table (present in the sandbox, provider attached, endpoint
  present in the effective policy, transport supported), naming a server added
  on the host after the image build instead of leaving it silently absent. It
  exits non-zero on any failing gate. `maki-oss doctor` prints the same table
  informationally, because MCP is not a prerequisite for running Maki.
- Document OAuth-gated MCP servers as out of scope for this change, deferred
  to the follow-up change `add-oauth-mcp-support`: the required live smoke
  test showed the v0.1.4 gateway's refresh exchange is rejected by at least
  one major OAuth MCP server's token endpoint (client-authentication
  mismatch, recorded in `docs/verification-log.md` §5.2). The "no OAuth flow
  inside the sandbox" invariant stands, and `docs/mcp-migration.md` §4 now
  says the readiness table — not a copied guidance rule — decides per
  server.
- Declare stdio MCP servers out of scope for the sandbox image (no `npx`/`bunx`
  runtime; HTTP transport only), reported as unsupported rather than failing
  silently.
- Upgrade the pinned and documented OpenShell from v0.1.2 to v0.1.4, re-running
  the version-dependent verification (`openshell rule get` JSON output, profile
  field spellings, MCP revision support) and updating
  `docs/ai/references.md`, `docs/verification.md`, and the version notes that
  currently say "verified against v0.1.2".

Upstream behavior this proposal depends on, verified against the installed
gateway v0.1.2 and current docs v0.1.4:

- MCP network endpoints and tool rules:
  <https://docs.nvidia.com/openshell/how-it-works/policies/schema.md> (`protocol: mcp`,
  `mcp.versions`, `mcp.allow_all_known_mcp_methods`, per-tool allow/deny)
- MCP rule examples and the "responses are relayed unparsed" caveat:
  <https://docs.nvidia.com/openshell/how-it-works/policies/network-rules.md>
- Credential endpoint binding, `oauth2_refresh_token`, `token_grant`:
  <https://docs.nvidia.com/openshell/how-it-works/providers/profiles.md>
- Gateway-brokered delegated OAuth walkthrough (the OAuth-in-sandbox pattern):
  <https://docs.nvidia.com/openshell/tutorials/microsoft-graph-provider-refresh.md>
- Maki MCP transports, `${VAR}` expansion, and OAuth commands:
  <https://maki.sh/docs/mcp/>

## Capabilities

### New Capabilities

- `mcp-integration`: MCP servers usable from inside the sandbox — how a server's
  config, credential, and egress are supplied; which transports are supported;
  and what the helper reports when a server cannot work. (OAuth flows moved to
  the follow-up change `add-oauth-mcp-support`.)

### Modified Capabilities

- `helper-cli`: adds `maki-oss mcp status` (non-zero on any failing gate) and an
  informational MCP readiness section in `maki-oss doctor`, so MCP configuration
  problems surface as a named, actionable report without failing a doctor run
  for a project that never set up MCP.
- `fish-integration`: completes the new `mcp` subcommand and its `status`
  subcommand.

## Impact

- `examples/providers/` — new profile files per MCP server; `examples/config.toml`
  unchanged in shape.
- `examples/maki-image/` — the baked config gains an `mcp.toml` (HTTP servers
  only, placeholder headers, no credentials), requiring an image rebuild.
- `bin/maki-oss` — new `mcp status` subcommand, doctor MCP checks, and the
  profile/attachment wiring for MCP providers; `fish/completions/maki-oss.fish`
  gains the new command.
- `docs/mcp-migration.md` §4 rewritten (stdio stance, gate table, OAuth deferred
  to the follow-up change);
  `docs/ai/references.md`, `docs/verification.md`, `docs/setup-guide.md`, and
  `docs/verification-log.md` updated for the v0.1.4 pin.
- `tests/run-tests.sh` — stub tests for the new subcommand and doctor checks.
- Security invariants hold throughout: no bind mounts, no secrets via `--env`,
  egress stays deny-by-default with one narrow endpoint per server, OAuth
  material stays at the gateway, sandbox user stays non-root.
- Known limitation carried forward: MCP servers whose token endpoint requires an
  RFC 8707 `resource` parameter cannot be expressed in a profile and stay
  unsupported; servers needing an MCP revision newer than the gateway supports
  fall back to uninspected traffic or fail with a named policy error.
