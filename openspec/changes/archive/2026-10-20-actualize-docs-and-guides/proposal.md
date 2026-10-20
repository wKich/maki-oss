# Proposal

## Why

The last feature commits moved shipped behavior past what the guides state:
the image now bakes `mcp.toml` and a `bun` runtime for stdio MCP servers, the
setup guide's verify block still expects the pre-MCP config listing and never
mentions MCP at all, and the curated-profile lists omit profiles that
`examples/providers/catalog.tsv` already maps. Separately, the archived
`add-stdio-mcp-runtime-support` change's spec deltas were never synced into the
main specs, so `openspec/specs/mcp-integration/spec.md` and the `MCP readiness
command` requirement in `openspec/specs/helper-cli/spec.md` still describe a
stdio behavior the helper no longer has.

## What Changes

- `docs/setup-guide.md` §3: the `ls /sandbox/.config/maki` expectation lists
  `mcp.toml` alongside `init.lua` and `permissions.toml`.
- `docs/setup-guide.md`: add MCP coverage — `maki-oss mcp status` after the
  image build, a pointer to `docs/mcp-migration.md`, and the note that the MCP
  server set is baked at image build so changing it means `maki-oss image build`.
- `docs/setup-guide.md` §4 and `docs/providers.md` "Curated catalog": list every
  curated profile actually shipped under `examples/providers/` — the four added
  by `f0ccb7e` (`maki-xiaomi-token-plan-sgp`, `maki-minimax-coding-plan`,
  `maki-kimi-for-coding`, `maki-nano-gpt`) and the two MCP profiles
  (`mcp-context7`, `mcp-synthetic`), each with its environment variable and
  endpoint as the table already reports for the others.
- `docs/glossary.md`: add entries for the MCP terms the guides now use — the
  baked MCP config, MCP readiness, and the stdio runtime gate.
- `docs/helper.md`: document `provider add`'s `--config`, `--runtime-credentials`,
  and `--global-profile` flags, which today appear only in `usage()`.
- `README.md`: audit against the current command set and refresh what is stale
  (it is deliberately end-user trimmed; only actual drift is corrected).
- Spec deltas bring the main specs back in line with shipped behavior:
  `mcp-integration` (profile requirement covers stdio upstream endpoints,
  "HTTP transport is supported, stdio is reported unsupported" removed,
  "A stdio MCP server works when the image provides its runtime" added,
  readiness gates carry the runtime gate) and `helper-cli` (`MCP readiness
  command` gate list and scenarios).

No helper, image, policy, or dashboard code changes: this change corrects
documentation and spec text to describe behavior that already ships.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `mcp-integration`: the stdio stance moves from "reported unsupported" to
  runtime-gated support, the profile requirement covers a stdio server's
  upstream API endpoint, and the readiness requirement names the runtime gate.
- `helper-cli`: the `MCP readiness command` requirement's gate list splits into
  HTTP gates and stdio gates (config, runtime, provider) and gains the missing
  runtime scenario.

## Impact

- Docs only: `docs/setup-guide.md`, `docs/providers.md`, `docs/glossary.md`,
  `docs/helper.md`, `README.md`.
- Specs: `openspec/specs/mcp-integration/spec.md`,
  `openspec/specs/helper-cli/spec.md` (delta text copied from the archived
  `2026-10-20-add-stdio-mcp-runtime-support` change, which is the source of
  truth for what was meant to be synced).
- No code, config, policy, or test changes. Verification is doc-against-code
  comparison plus `openspec validate`.
- The in-flight `add-oauth-mcp-support` change also has a `mcp-integration`
  delta, but it only adds a requirement, so the two do not collide.
