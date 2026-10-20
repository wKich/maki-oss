# Spec Delta

## Purpose

Lets an MCP server configured on the host also work from a Maki session inside
an OpenShell sandbox: the server's config, credential, and network reach are
each supplied by a mechanism the sandbox boundary allows, and every server that
cannot work is reported by name with the reason instead of being silently
absent.

## ADDED Requirements

### Requirement: MCP servers work through profiles, not copied config

An MCP server usable inside the sandbox SHALL be backed by an OpenShell
provider profile that declares the server's endpoint as `protocol: mcp` with
the host, port, and path the server actually serves, and that binds the server's
credential to that endpoint. The helper SHALL lint each MCP profile against the
installed gateway before import and SHALL import it at global scope, exactly as
it does for inference profiles. The base sandbox policy SHALL NOT gain any MCP
endpoint of its own; reach for an MCP server SHALL come only from its attached
provider profile.

#### Scenario: A shipped MCP profile lints and imports
- **WHEN** the user runs `maki-oss provider setup --profile examples/providers/mcp-context7.yaml --env CONTEXT7_API_KEY --yes`
- **THEN** the profile lints against the installed gateway, imports at global scope, creates the provider, and the sandbox's effective policy gains only that profile's endpoint

#### Scenario: The incremental policy path is not used for MCP
- **WHEN** any helper command needs to make an MCP endpoint reachable
- **THEN** no `openshell policy update --add-endpoint` invocation carries an MCP endpoint, because the incremental path cannot express `protocol: mcp`

#### Scenario: A profile that fails lint changes nothing
- **WHEN** an MCP profile's fields do not match the installed gateway's schema
- **THEN** the helper exits non-zero with the lint error and imports no profile and creates no provider

### Requirement: MCP config travels with the sandbox, without credentials

The sandbox SHALL carry each enabled MCP server's definition at the sandbox
user's global Maki MCP config path, and that file SHALL reference credentials
only through `${VAR}` expansion of the placeholder environment variables the
attached provider injects. No credential value, OAuth client secret, or access
token SHALL appear in any file copied or baked into the sandbox, in the image,
or in any helper-generated artifact.

#### Scenario: A header references the placeholder, not the value
- **WHEN** the sandbox config for an HTTP MCP server is rendered
- **THEN** its `headers` expand a `${VAR}` that names a provider-injected placeholder variable, and the file contains no literal token

#### Scenario: A server whose variable is unset fails loudly
- **WHEN** a server's referenced variable is not injected because its provider is detached
- **THEN** that server fails with the variable named in its status, and the other configured servers still work

### Requirement: HTTP transport is supported, stdio is reported unsupported

The sandbox image SHALL support MCP over HTTP only. A stdio MCP server (one
configured with a `command` array) SHALL be reported as unsupported in the
sandbox, with the reason that the image ships no server runtime, and the helper
MUST NOT attempt to install a runtime or run such a server inside the sandbox.

#### Scenario: A stdio server is named as unsupported
- **WHEN** the host config declares a stdio server and the user runs `maki-oss mcp status`
- **THEN** that server is reported unsupported with the no-runtime reason, and no image build or package install is attempted

### Requirement: MCP readiness is reported per server

The helper SHALL report, for every server it checks, one line naming the server
and the state of each gate that decides whether it works in the sandbox: present
in the sandbox's MCP config, provider attached, endpoint present in the
effective policy, and transport supported. The set of servers checked SHALL
include every server enabled in the host's `~/.config/maki/mcp.toml`, so a
server added on the host after the image was built is reported rather than
silently absent. A server missing any gate SHALL be reported with the specific
gate that fails and the command that fixes it. Reporting SHALL be read-only and
MUST NOT mutate the sandbox, the gateway, or any profile.

#### Scenario: A ready server is reported ready
- **WHEN** a server's config, provider, endpoint, and transport all hold
- **THEN** its line reports all gates satisfied and the command exits zero

#### Scenario: An unattached provider is named as the failing gate
- **WHEN** a server's config and endpoint exist but its provider is not attached to the sandbox
- **THEN** its line names the attachment as the failing gate and prints the `maki-oss provider attach` command, and the command exits non-zero

#### Scenario: A server added to the host after the image build is reported
- **WHEN** the host's `~/.config/maki/mcp.toml` enables a server that the baked sandbox config does not contain
- **THEN** the report names that server as absent from the sandbox, with the image-rebuild command as the fix

#### Scenario: Reporting never mutates
- **WHEN** the readiness report runs against a sandbox in any phase
- **THEN** no `sandbox create`, `provider attach`, `profile import`, or policy update invocation is recorded

### Requirement: MCP revisions a gateway cannot serve fail by name

An MCP server whose protocol revision is not in the endpoint's allowed
`mcp.versions` SHALL fail with a named policy error rather than appearing
working or silently disconnected, and the helper's readiness report SHALL
surface that state for the affected server.

#### Scenario: A revision the policy excludes is reported
- **WHEN** a server negotiates a revision excluded by its endpoint policy
- **THEN** the readiness report names the revision mismatch for that server instead of reporting it ready

### Requirement: Shipped MCP profiles match the pinned gateway

Every MCP profile shipped under `examples/providers/` SHALL lint clean against
the OpenShell version this repository pins, and its field spellings SHALL match
that version's schema. When the pinned OpenShell version changes, the shipped
MCP profiles SHALL be re-verified against it.

#### Scenario: Shipped profiles lint against the pinned version
- **WHEN** the pinned OpenShell version is installed and each shipped MCP profile is linted
- **THEN** every profile passes lint with no field-name errors
