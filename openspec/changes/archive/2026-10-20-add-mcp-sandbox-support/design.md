# Design

## Context

See proposal.md for motivation. The state that shapes this design:

- `examples/maki-image/Dockerfile` bakes exactly two files into
  `/sandbox/.config/maki/`: `init.lua` and `permissions.toml`. Maki inside the
  sandbox therefore has global config but no MCP config, and the host's
  `~/.config/maki/mcp.toml` never crosses the boundary (no bind mounts; files
  only move through `openshell sandbox upload`).
- `bin/maki-oss` already owns a complete credential pipeline: catalog lookup
  (`examples/providers/catalog.tsv`), `profile lint` before import, provider
  create/update from a child-process environment, and attach with `--wait`.
- The installed gateway and CLI are v0.1.2; v0.1.4 was released 2026-10-13.
  Version-dependent facts were verified on this machine: `openshell policy
  update --add-endpoint` accepts only `tcp`, `rest`, `websocket`, `sql` (so it
  cannot express `protocol: mcp`), and a v0.1.2 `token_grant` requires
  `token_endpoint` where v0.1.4 docs spell it `token_url`. A v0.1.2 lint run
  accepts MCP-shaped profiles: `protocol: mcp` with `mcp.versions`,
  `allow_all_known_mcp_methods`, per-tool `deny_rules`, `category: knowledge`,
  and no `inference_capable`.
- Maki's binary (0.6.4 on this host) speaks MCP over Streamable HTTP — it sends
  `Accept: application/json, text/event-stream` and the `mcp-protocol-version`
  header — so `protocol: mcp` inspection can parse its requests. The image pins
  Maki 0.6.0.

## Goals / Non-Goals

**Goals:**

- An HTTP MCP server backed by a shipped profile works from a sandbox session
  with no credential value inside the sandbox.
- An OAuth-gated HTTP MCP server works when the login is done once on the host.
- Every configured server is reported by name, with the gate that fails and the
  command that fixes it.
- The repository's pinned OpenShell version is current, and everything whose
  behavior depends on that version is re-verified against it.

**Non-Goals:**

- Running stdio MCP servers in the sandbox (no runtime in the image).
- OAuth flows, callback listeners, or `maki mcp auth` inside the sandbox.
- Per-project MCP scoping, or a generic importer that parses the host's
  `mcp.toml`.
- MCP servers whose token endpoint requires an RFC 8707 `resource` parameter.

## Decisions

**Upgrade OpenShell to v0.1.4 inside this change, before the MCP work.**
Rationale: the profile field spellings and MCP revision support that shipped
profiles must match are version-specific, and authoring them against a version
we are about to replace means authoring them twice. Alternative — stay on
v0.1.2 — was rejected because v0.1.4 is a patch release in the same series and
the docs this repo quotes are already v0.1.4-shaped. The upgrade is
verification-gated: re-run `openshell rule get` to learn whether v0.1.4 emits
JSON (the `policy review` text-parsing note in `openspec/specs/policy-review/spec.md`
assumes it does not), re-lint the shipped MCP profiles, and re-run the
isolation checklist in `docs/verification.md`.

**MCP egress and credentials come only from provider profiles.**
Rationale: verified that `policy update --add-endpoint` cannot express
`protocol: mcp`, so the incremental policy path is not an option; and a profile
already binds a credential to one host/port/path, which is the narrowest
credential boundary OpenShell offers. Alternative — a `network_policies` block
in the base policy plus `credential_binding.provider` — requires an
endpointless profile and a sandbox-scoped policy that must be re-applied on
every policy edit, so it duplicates what a profile gives for free.

**OAuth-gated servers use gateway-brokered refresh tokens, not dynamic grants.**
Rationale: the static-placeholder-plus-refresh pattern is documented end to end
for v0.1.2 (the Microsoft Graph tutorial pattern) and needs no header to be
absent-safe. `token_grant` is more attractive — the token never enters the
sandbox environment — but the docs never state whether the proxy adds the header
when the client sends none, and Maki will not send one it has no placeholder for.
`token_grant` stays a documented stretch path, to be adopted once a live test
settles the injection question. Update at close: the live OAuth smoke test
(then task 5.2) showed the v0.1.4 gateway's refresh exchange is rejected by
Linear's token endpoint (client-authentication mismatch; isolated and recorded
in `docs/verification-log.md` §5.2), so OAuth-gated MCP delivery moved to the
follow-up change `add-oauth-mcp-support`; this change ships the HTTP/API-key
path, which is fully verified.

**MCP config is baked into the image at `/sandbox/.config/maki/mcp.toml`.**
Rationale: the image is where this repo already keeps the sandbox's global Maki
config, it survives `stop`/`start` and sandbox recreation, and it needs no new
helper code path. The file carries `${VAR}` placeholder headers only. Alternatives
rejected: project `.maki/mcp.toml` (goes stale when a session reuses a sandbox
without re-upload, and scopes MCP to a repo); a helper push at every session
start (a per-launch gateway call, TOML handling in POSIX sh, and lost on
recreation). Consequence accepted: changing the server set means rebuilding the
image, which `maki-oss image build` already makes a one-command step.

**Shipped profiles declare all three MCP revisions the gateway supports**
(`2025-03-26`, `2025-06-18`, `2025-11-25`). Rationale: a server pinned to a
revision the endpoint excludes fails with `mcp_protocol_version_not_allowed`,
and Maki's own revision varies by release. The documented fallback for a server
needing something newer is to omit `protocol`/`mcp` so traffic passes
uninspected — a decision the profile comment must surface, not hide.

**Readiness reporting is a read-only report; `mcp status` fails, `doctor` only
reports.** Rationale: the gates live in three different places (sandbox
filesystem, gateway provider attachment, effective policy), so the value is in
assembling them, not in any one command. `mcp status` exits non-zero on any
failing gate so it is scriptable. `doctor` prints the same table but its exit
code stays decided by prerequisite checks: MCP is not a prerequisite for running
Maki, and the baked config means every project has enabled servers whether or
not its provider is attached, so a non-zero doctor exit would fail every project
that never set up MCP. Alternative — doctor also exits non-zero — rejected for
that reason.

**Readiness also diffs the host config against the sandbox's.** Rationale: the
failure this change exists to end is "my host has MCP, the sandbox doesn't".
Because the config is baked at image build, a server added to
`~/.config/maki/mcp.toml` afterwards is absent from the sandbox and would be
invisible to a report that only reads the sandbox's config. The report therefore
reads both and names the drift, with the image-rebuild command as the fix. This
also covers an existing sandbox that predates an image rebuild.

**MCP profiles are not added to `examples/providers/catalog.tsv`.** Rationale:
that catalog is keyed `<store>:<slug>` and resolved only from the Maki and
OpenCode credential stores, and `maki:synthetic` / `opencode:synthetic` already
resolve to the inference profile `maki-synthetic`; a second row for the same key
would make the wizard's lookup ambiguous. No MCP server has a store credential,
so a row for one could never match. MCP setup goes through
`provider setup --env VAR --profile examples/providers/mcp-<server>.yaml`,
which the spec already exercises.

**This change's fish-completion delta applies after `add-session-resume`.** That
in-flight change MODIFIES the same "Completions for commands and options"
requirement and its text does not contain `mcp`. Deltas replace a requirement
wholesale, so whichever applies second silently drops the other's content; this
change's text is a superset (it carries the session flags plus `mcp`), so it
must be applied second, and at apply time the current main spec is re-read so
nothing already landed is lost.

## Risks / Trade-offs

- [Profile field spellings differ between gateway versions] → lint before import
  (already the helper's behavior), and author every shipped profile against the
  pinned version; the version bump makes one spelling set authoritative.
- [A live MCP server may reject OpenShell's L7 rewrite] → the required smoke test
  (context7 from inside the sandbox) runs before the profiles are called
  "supported"; if a server breaks under inspection, its profile falls back to an
  endpoint with `protocol` omitted, which trades tool-level policy for reach.
- [MCP revision mismatch makes a server unreachable] → ship all three revisions
  in every profile and surface the named policy error in the readiness report.
- [RFC 8707 `resource`-parameter token endpoints are inexpressible] → report the
  server as unsupported with that reason rather than letting it fail at request
  time.
- [Image rebuild is required for any config change] → accepted; the alternative
  (per-session push) adds a code path and a failure mode to every launch.
- [Host Maki 0.6.4 vs image-pinned 0.6.0] → the smoke test runs against the
  image's binary, and the version notes in `docs/ai/references.md` state which
  Maki each profile was verified against.

## Migration Plan

1. Upgrade the gateway and CLI to v0.1.4, re-run `maki-oss doctor`, and record
   the new version in `docs/ai/references.md`.
2. Re-verify version-dependent behavior: `openshell rule get` output format,
   MCP profile field spellings, and `mcp.versions` support. Adjust the
   `policy-review` note if the output format changed.
3. Add the shipped MCP profiles and the baked `mcp.toml`, rebuild the image.
4. Run the live smoke test, then document.

Rollback: reinstall OpenShell v0.1.2 (the previous install command with the
older version), and rebuild the image from the pre-change Dockerfile. No
gateway-side data is destroyed by the downgrade; profiles imported at v0.1.4
field spellings must be deleted before a v0.1.2 lint would see them.

## Open Questions

- Does v0.1.4's `openshell rule get` emit JSON? Answerable by running it after
  the upgrade; the `policy-review` spec already tolerates text-only output, so
  either answer leaves the specs unchanged and only adjusts a doc note.
- Does Maki inside the image (0.6.0) negotiate the same MCP revisions as the
  host binary (0.6.4)? Answerable during the smoke test; it changes only the
  `mcp.versions` list in the shipped profiles, not the approach.
