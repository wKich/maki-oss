# Design

## Context

See proposal.md for motivation. The state that shapes this design:

- `examples/maki-image/Dockerfile` installs no server runtime; the baked
  `examples/maki-image/config/mcp.toml` declares HTTP servers only, and
  `bin/maki-oss`'s parser reduces a stdio `command` array to a boolean before
  the readiness gate short-circuits `transport != http` to an unconditional
  "unsupported" line — no other gate is ever evaluated for a stdio server.
- Maki in the image supports stdio servers natively: `command` + `environment`,
  with both `headers` and `environment` values expanding `${VAR}` from the
  environment, and an unset variable failing that server with the variable
  named (<https://maki.sh/docs/mcp/#configuration>). That expansion is the same
  seam OpenShell provider placeholders inject into sandbox processes.
- The host's one enabled stdio server is `synthetic`
  (`bunx -y synthetic-search-mcp`), whose package exists only on npm — PyPI
  returns 404 for it (verified 2026-10-20) — so uv cannot run it; the npm
  package ships a `bin` (`synthetic-search-mcp`) and is a bun-built bundle.
- The host's `~/.config/maki/mcp.toml` holds that server's API key as a
  literal in `environment`; the spec forbids any such value crossing into the
  image.
- All sandbox egress traverses the gateway proxy (network namespace,
  `docs/glossary.md`), and provider profiles bind a credential to an endpoint
  of the protocol that traffic actually speaks
  (<https://docs.nvidia.com/openshell/how-it-works/providers/profiles.md>).

## Goals / Non-Goals

**Goals:**

- The declared stdio server works from a sandbox session with no credential
  value in the image and no package fetch at session time.
- `maki-oss mcp status` judges a stdio server by the same gate model as an
  HTTP one, naming a missing runtime with the image-build fix.
- Adding another runtime later (uv, node) is a Dockerfile change, not a code
  change.

**Non-Goals:**

- Installing a runtime no declared server uses (uv ships when a PyPI-hosted
  server is actually configured).
- Gateway-side MCP protocol inspection for stdio servers — the Maki↔server leg
  is a pipe the gateway never sees.
- Running `bunx`/`uvx` resolvers, or any registry-backed package fetch, inside
  a running sandbox.
- Changing the host's own `mcp.toml` or the host's literal credential (migration
  input only; out of this repo's scope).

## Decisions

**bun ships now; the readiness gate is runtime-agnostic; uv is deferred.**
Rationale: the only declared stdio server is npm-only, so bun is the runtime
that fixes it, while an unused uv install would violate the repo's yagni rule
(`openspec/specs/yagni-enforcement`). Alternatives: ship both now — one extra
rebuild avoided, but an image that ships a runtime nothing declares; ship
neither — leaves the failure this change exists to fix. Because the gate keys
on the command the config names (`argv[0]`), adding uv later needs no helper
change.

**The package is installed at image build; the baked config names the
installed binary; session start resolves nothing.** Rationale: a session-time
`bunx -y pkg` needs an npm registry endpoint in policy (an egress decision
under deny-by-default) and fetches whatever the registry serves that day (a
moving trust target inside the boundary). Pre-installing pins the direct
package in the image — its transitive dependencies still resolve at each
build, recorded under Risks — consistent with the already-accepted "config is
baked; change = rebuild" decision. Alternatives: `bunx` with a warmed cache — inherits
re-resolution risk that was never verified; helper-side install — rejected
outright: the helper never adds code to a running sandbox.

**The stdio server's profile declares its upstream API with the protocol that
API serves (`protocol: rest`), not `protocol: mcp`.** Rationale: for stdio the
gateway sees only the child process's outbound API calls, which are plain REST;
`protocol: mcp` would claim an inspection the gateway cannot perform. The
consequence is stated, not hidden: gateway MCP tool policy (`mcp.versions`,
per-tool deny) does not apply to stdio servers, and tool-level control is Maki's
`permissions.toml` `[mcp.<server>]` rules. Alternative: a nominal `mcp` profile
for symmetry — rejected: it would misrepresent what policy enforces.

**The runtime gate is checked read-only inside the running sandbox.**
`mcp status` already runs `sandbox exec -- cat` for the config; the runtime
check adds `sandbox exec -- command -v <argv[0]>` on the same read-only path.
Rationale: a sandbox that predates the image rebuild is exactly the drift this
command exists to catch — trusting the baked config alone would pass a server
whose runtime is absent. The parser change records `argv[0]` instead of a
boolean. Presence means resolvable on the sandbox's PATH: the image defines
one `ENV PATH` including the runtime's bin dir, so the baked command, the
gate's `command -v`, and Maki's spawned child resolve the same name — and the
smoke test verifies resolution inside a live sandbox rather than assuming the
exec path inherits the image's PATH. Alternative: infer from transport alone —
that is today's broken assumption.

**No endpoint gate for stdio servers.** Rationale: a stdio `command` entry
names no URL, so there is no host to grep the effective policy for; provider
attachment *is* the profile import whose endpoint lands in that policy, so the
attach gate already covers the state an endpoint gate would check. Alternative:
parse the shipped profile file for its host — couples the read-only report to
the repo's examples layout at runtime for a state the attach gate implies.

**The host's literal key crosses only as a placeholder reference.** The baked
`environment` entry expands `${VAR}`; the value reaches the provider via
`provider setup --env MCP_SYNTHETIC_API_KEY` on the host; the child process sends
the stand-in and the proxy substitutes at the profile's endpoint like any other
sandbox process. No copy step exists that could carry the literal over.

**The stdio server's credential variable is `MCP_SYNTHETIC_API_KEY`, not the
host's `SYNTHETIC_API_KEY`.** Rationale: a sandbox attaches one provider per
credential key — OpenShell refuses to attach two providers that export the
same variable (verified live 2026-10-20: `maki-synthetic` and `mcp-synthetic`,
both binding `SYNTHETIC_API_KEY`, fail to co-attach with `provider attachment
failed (The system is not in a state required for the operation's execution)`,
while `afk-synthetic` — same host `api.synthetic.new` under `LLM_API_KEY` —
attaches beside either, so the collision is the key, not the endpoint).
`maki-synthetic` needs the original name (Maki resolves its inference provider
by it), so the new profile takes a unique one: same real key value, two
sandbox-side names, and the helper's ensure-attach keeps working with both
providers configured. The baked `mcp.toml` keeps the child-facing table key
`SYNTHETIC_API_KEY` — the package hard-codes the name it reads (proved live
2026-10-20: with the table key renamed too, the tool call failed with
`Error: SYNTHETIC_API_KEY environment variable not set`) — and expands
`${MCP_SYNTHETIC_API_KEY}` into it: a maki `environment` entry's key and its
expansion source are independent. Alternative: document the two as mutually
exclusive —
rejected: it permanently bars Synthetic inference and the synthetic MCP server
from one sandbox and breaks `maki-oss run` whenever both appear in the
helper's `providers` list.

## Risks / Trade-offs

- [Placeholder substitution on a child process's non-MCP REST call is
  structurally sound but never observed live] → the smoke test in
  `docs/verification.md` is required before the server is called supported; if
  substitution does not occur, the credential path (not the gate design) is
  what changes, and the server stays reported rather than silently broken.
- [The pin covers only the direct package; transitive dependencies (`zod`,
  the MCP SDK) resolve fresh at each image build] → accepted npm reality; the
  task 1.2 run check catches a break at build time, never at session time.
- [Pinned package diverges from the host's floating `bunx -y` version] →
  accepted: the sandbox pins the top-level package for reproducibility; the
  host stays unpinned; updating the pin is an image rebuild.
- [Image grows by the runtime's size (~90 MB for bun)] → accepted; one runtime,
  installed from bun's pinned zip release (its releases are not tarballs).
- [Two in-flight changes delta `mcp-integration` (`add-oauth-mcp-support`
  touches the OAuth requirement only)] → requirements are disjoint, so apply
  order between them does not matter; neither change may restate the other's
  requirement text wholesale.

## Migration Plan

1. Add the pinned bun block and the pre-warm step to
   `examples/maki-image/Dockerfile`; rebuild (`maki-oss image build`) and
   verify the binary runs from the baked config's command.
2. Add the stdio entry with placeholder-only `environment` to
   `examples/maki-image/config/mcp.toml`.
3. Author `examples/providers/mcp-synthetic.yaml` (`protocol: rest`, credential
   bound to the upstream host), lint, and attach through the existing
   `provider setup` flow.
4. Change the helper's parser and gates; extend stub tests; `make test`.
5. Live smoke test: `mcp status` reports all gates, a sandbox session calls the
   `synthetic__search` tool; record shape-only in `docs/verification-log.md`.
6. Update `docs/mcp-migration.md` §4 (stdio stance), `docs/helper.md` (gate
   list), `docs/verification.md` (smoke test).

Rollback: rebuild the image from the pre-change Dockerfile, revert the helper
commit, detach the provider (and delete the imported profile). No gateway-side
data is destroyed; the sandbox's baked config reverts with the rebuild.

## Open Questions

- Which host serves Synthetic's `/v2/search` API for the profile's endpoint
  field — confirm from the package's source or Synthetic's docs at
  implementation time. It sets one field in one shipped profile; it changes no
  spec, decision, or task.
