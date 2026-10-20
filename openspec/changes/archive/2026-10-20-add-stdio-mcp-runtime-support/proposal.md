# Proposal

## Why

The sandbox image ships no server runtime, so `maki-oss mcp status` reports
every stdio MCP server as unsupported — and on this host that is not a
hypothetical: `synthetic` (`bunx -y synthetic-search-mcp`) is enabled on the
host and dead in the sandbox, with no path forward. The wall is thinner than
the current stance suggests. Maki itself fully supports stdio in the sandbox —
its docs state that `headers` **and** `environment` values expand `${VAR}` from
the environment (<https://maki.sh/docs/mcp/#configuration>), which is exactly
the placeholder seam OpenShell providers inject, and both candidate runtimes
(bun, uv) are single binaries the Dockerfile can pin and download in one build
step — bun ships zip archives, not tarballs, so its install differs from
`maki`'s. The only code standing between
"unsupported" and "works" is one hard-coded gate short-circuiting on
`transport != http` before any other gate is evaluated.

Two verified facts fix the scope: `synthetic-search-mcp` exists **only on npm**
(PyPI returns 404; the npm package is a bun-built ESM bundle with a `bin`), so
uv alone cannot run this host's failing server — bun can; and uv remains the
one-line key to the entire PyPI MCP server class whenever a Python server
appears.

## What Changes

- **The image gains a runtime**: a pinned bun binary installed in
  `examples/maki-image/Dockerfile`, with the server's package pre-installed at
  build time (`bun add -g`) as uid 1500, so a session never resolves or
  downloads code from a registry — consistent with the repo's existing "config
  is baked; change = rebuild" decision and keeping egress deny-by-default with
  no npm endpoint in any policy.
- **The baked `mcp.toml` gains a stdio entry** whose `environment` references
  only a `${VAR}` placeholder — the host's literal key never crosses the
  boundary. The helper never copies a credential, in keeping with the existing
  no-credentials-in-image rule.
- **The server's upstream API is reached through a provider profile**, not an
  MCP profile: for a stdio server the Maki↔server leg is a local pipe the
  gateway never inspects, so the profile declaring its API host carries
  `protocol: rest` with the credential bound to that endpoint. Gateway-side MCP
  tool policy (`mcp.versions`, per-tool deny) does not apply to stdio servers;
  tool-level control stays with Maki's `permissions.toml` `[mcp.<server>]`
  rules.
- **The helper's transport gate becomes a runtime gate**: the TOML parser
  records the command's `argv[0]` instead of collapsing it to a boolean, and a
  stdio server is judged by the same per-server gates as an HTTP one — present
  in the sandbox config, runtime present in the sandbox (checked read-only via
  the `sandbox exec` path the status command already uses), provider attached —
  with the image-build command printed as the fix for a missing runtime.
  HTTP servers' behavior is unchanged.
- **Docs**: `docs/mcp-migration.md` §4's stdio stance is replaced by the
  runtime requirement; `docs/helper.md` and `docs/verification.md` document the
  new gate and a stdio smoke test (attach profile → `mcp status` all gates →
  a session calls the tool).
- **Scope note on uv**: the gate is runtime-agnostic by construction — `uv`
  support later is a Dockerfile block plus a pre-warm line, no code change —
  but uv itself ships only when a PyPI-hosted server is actually configured,
  rather than installing a runtime no declared server uses.

## Capabilities

### New Capabilities

(none — this widens an existing capability's transport boundary)

### Modified Capabilities

- `mcp-integration`: the requirement "HTTP transport is supported, stdio is
  reported unsupported" is replaced — a stdio server works when the image
  provides its command and the package is pre-installed, and a missing runtime
  is reported by name with the image-build fix instead of a blanket rejection.
  The "MCP readiness is reported per server" requirement's gate list changes
  from "transport supported" to the runtime gate for stdio servers.
- `helper-cli`: the "MCP readiness command" requirement's gate list changes
  from "transport supported" to the runtime gate (present-in-config, runtime
  present, provider attached for stdio; unchanged four gates for HTTP).

## Impact

- `examples/maki-image/Dockerfile` — pinned bun install block (bun's releases
  are zip archives, not tarballs); an `ENV PATH` including the directory
  `bun add -g` links executables into, so the gate's `command -v` and Maki's
  spawn resolve the same name; pre-warm of the declared stdio server's package
  as uid 1500; image rebuild required.
- `examples/maki-image/config/mcp.toml` — gains the stdio server entry with a
  `${VAR}` `environment` only.
- `examples/providers/` — one new `protocol: rest` profile binding the stdio
  server's upstream API credential to its host (lint + import through the
  existing `provider setup` flow).
- `bin/maki-oss` — parser records `argv[0]`; readiness gate logic branches on
  transport; no new subcommands, so no fish-completion delta.
- `tests/run-tests.sh` — stub tests for the runtime gate (present/missing) and
  the unchanged HTTP path.
- `docs/mcp-migration.md`, `docs/helper.md`, `docs/verification.md`,
  `docs/verification-log.md` — stance, gate documentation, smoke-test record.
- Security invariants hold: no bind mounts; the host file's literal key never
  enters the image or any generated artifact; every new endpoint (the stdio
  server's API) comes from a profile, not the base policy; no registry egress
  at session time (pre-warmed); sandbox user stays non-root.
- Sequencing: in-flight `add-oauth-mcp-support` modifies a different
  requirement of `mcp-integration` (OAuth), so the two deltas do not collide;
  `add-session-resume` does not touch any requirement this change modifies.
- Known limitations carried into design, not hidden: placeholder substitution
  on a child process's non-MCP REST call is structurally sound (all sandbox
  egress traverses the proxy) but gets its first live proof in this change's
  smoke test; whether `bunx`/installed binaries re-resolve at session start is
  settled by preferring the pre-installed binary in the baked config.
