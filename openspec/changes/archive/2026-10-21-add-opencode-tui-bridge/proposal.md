# Proposal

## Why

Maki's own TUI cannot produce OpenCode's compact transcript rendering (no
config key and no plugin seam — `ui.*` slots are reserved for Maki itself), so
the compact look is unreachable without forking an upstream. The sibling
spike repo (`~/Projects/experiments/openmaki`, changes
`spike-opencode-tui-bridge` and `implement-opencode-tui-bridge`) measured a
GO: OpenCode's TUI is a client of an HTTP+SSE server
(https://opencode.ai/docs/cli/, `opencode attach` / `--server`) and its
contract can be served over Maki's bidirectional SDK stream
(https://maki.sh/docs/headless/). This change adopts that proven bridge into
this repository and moves its Maki backend from a host process into the
project's OpenShell sandbox — the sandbox remains the only place the agent
runs, which is this repository's entire premise.

## What Changes

- A new `bridge/` directory (Bun + TypeScript, sibling of `dashboard/`): the
  OpenCode `2.0.32` HTTP+SSE server over one live Maki SDK session per bridge
  session — boot/config answers, session lifecycle, prompt→transcript event
  translation, permission round trip. Moved from the spike repo, unchanged in
  behavior.
- The bridge's Maki child becomes an injectable command; its default is the
  sandbox transport: `openshell sandbox exec -n <name> --no-login-shell
  --workdir <workdir> -- maki -p --input-format stream-json
  --output-format stream-json [-m <model>]`
  (exec stdin streaming and `--no-tty` NDJSON behavior per
  https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md).
- **Config-gated interactive mode (no new subcommand):** the existing bare
  `maki-oss` / `maki-oss maki` interactive session gains `tui = "opencode"`
  (config key, `MAKI_OSS_TUI` environment). The default stays Maki's own TUI,
  so no existing behavior or spec scenario changes until a later change flips
  the default. The bridge session reuses the helper's ensure/sync lifecycle
  (sandbox create/start, provider attach, exit sync, `--no-sync`).
- `maki-oss doctor` gains checks for the TUI mode: `bun`, the `opencode`
  binary, and the bridge entrypoint, enforced only when `tui = "opencode"`.
- The bridge binds loopback only (same rule as the `dashboard` capability),
  passes no `--env` values, and logs stay redacted (the spike's
  redaction-scan practice becomes a task).
- Known rendering defects found by the spike author are recorded as evidence
  for later changes, not fixed here: user prompts render after assistant
  responses (A-A-A-Q-Q-Q instead of Q-A-Q-A), and the status line shows a
  synthesized model name instead of Maki's real model.
- Spike harness, fixtures, and the mapping table are copied into this change's
  `evidence/`; the openmaki repo stays untouched as the spike's historical
  record.

Explicitly out of scope for this change: the test tiers and generated
compatibility report (next change, split by agreement), fixing the known
rendering defects or adding missing features (later changes), bridge session
resume (`--continue`/`--resume`), running the bridge against a host-side
Maki, and removing or changing Maki's own TUI session.

## Capabilities

### New Capabilities

- `opencode-tui-bridge`: serving the OpenCode TUI's measured HTTP+SSE surface
  over one live Maki SDK session running inside the project sandbox —
  boot/config answers, one bridge session per Maki session, prompt→transcript
  event translation, the tool-permission round trip, and wire-faithful SSE
  framing. Ported from the spike repo's `opencode-tui-bridge` spec and
  adapted to the sandbox transport.

### Modified Capabilities

- `helper-cli`: the interactive session requirement (`Headless and
  interactive execution`) gains the config-gated `tui = "opencode"` mode with
  its doctor checks and the `tui` configuration key; `run` (headless) and all
  existing session scenarios stay unchanged.

## Impact

- **Code**: new `bridge/` (moved from the spike: `bridge.ts`, `translator.ts`,
  `maki.ts` → sandbox child, `ids.ts`, `spec-answers.ts`); `bin/maki-oss`
  (interactive-session branch, config key, doctor); `fish/` only if
  completion output changes.
- **Config**: new optional key `tui` in `examples/config.toml` and the config
  table in `docs/helper.md`.
- **Dependencies**: `bun` becomes a prerequisite for the opt-in TUI mode only
  (`doctor` reports it as missing otherwise); `opencode` binary pinned to
  `2.0.32` (the contract the mapping was measured against, re-verified in the
  spike at implementation time with a 0-line A/B diff); `ajv` remains a
  test-time validator, never a runtime dependency.
- **Security invariants**: unchanged by design — no bind mounts (everything
  moves over `sandbox exec` stdio), no `--env` values, no secrets on the host
  (Maki authenticates in-sandbox through provider profiles; the bridge fakes
  OpenCode's provider/config answers so OpenCode never holds a credential),
  loopback-only serving, redacted bridge logs.
- **Upstream coupling**: the bridge tracks OpenCode's server contract
  (https://opencode.ai/docs/server/) and Maki's SDK wire
  (https://maki.sh/docs/headless/); drift handling and the compatibility
  report belong to the next change.
