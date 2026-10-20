# Design

## Context

Carried from `add-mcp-sandbox-support` (see its archived design): the sandbox
boundary forbids OAuth flows inside, OpenShell profiles bind a credential to
one endpoint, and gateway-brokered refresh is the documented pattern. What is
new is the live finding recorded in `docs/verification-log.md` §5.2: at
OpenShell v0.1.4 the gateway's refresh exchange is rejected by Linear's token
endpoint, which accepts only a body `client_id` for dynamically registered
public clients (401 `invalid_client` with Basic; 400 "multiple authentication
methods" with both). The identical body-only exchange returns HTTP 200. The
RFC 8707 `resource` parameter is not involved — it succeeds with and without.

Everything else in the mechanism verified: profile lint/import,
`--runtime-credentials` provider creation, `--secret-material-env` refresh
configuration (secret never in argv), attachment, and all four readiness
gates satisfied. With no minted credential OpenShell withholds the placeholder
entirely, so the fail-safe direction is correct: nothing leaks, nothing works.

## Goals / Non-Goals

**Goals:**

- One OAuth-gated MCP server answering a tool call from inside a sandbox with
  no access token in the sandbox environment.
- The host-declaration + login + refresh-configure flow documented end to end,
  with secrets never in argv.
- The Linear client-auth mismatch tracked upstream and recorded until fixed.

**Non-Goals:**

- OAuth flows, callback listeners, or `maki mcp auth` inside the sandbox.
- Dynamic `token_grant` adoption (stays a stretch path until the header
  injection question is settled upstream).
- Servers whose token endpoint requires an RFC 8707 `resource` parameter
  (inexpressible in a profile).

## Decisions

**Keep gateway-brokered refresh as the flow.** Same rationale as the archived
change: the static-placeholder-plus-refresh pattern is documented end to end,
and `token_grant` still has an open upstream question (whether the proxy adds
the header when the client sends none).

**Ship the linear profile now, with the limitation in its header.** The shape
lints and is correct; hiding it would lose the finding. The readiness report
and `openshell provider refresh status` already surface the live state, so no
helper code changes are needed for the blocked case.

**Verification is a live tool call, not a lint.** Accept either Linear after an
upstream fix, or another OAuth MCP server whose token endpoint accepts the
gateway's method (the Microsoft Graph tutorial is the documented working
case). A second server passing also proves the flow is general, not
server-specific.

**Secrets move only through `--secret-material-env` and the child
environment.** The host probes that isolated the Linear rejection read and
wrote tokens without printing them and wrote the rotated refresh token back to
maki's store; that discipline continues.

## Risks / Trade-offs

- [No OAuth server passes on the pinned gateway] → the requirement stays
  blocked-but-tracked with a recorded reason rather than a broken claim; the
  HTTP/API-key path already ships verified.
- [Linear fixes their endpoint or OpenShell fixes the auth method] → re-run
  the live test and lift the limitation note from the profile header.
- [Token rotation during probing invalidates maki's stored token] → probes
  must write rotated tokens back (done in §5.2; keep doing it).

## Open Questions

- Which OAuth MCP server besides Linear is available to prove the live call?
- Upstream: will OpenShell accept body-parameter client authentication for
  public clients, or expose an auth-method knob on the refresh config?
