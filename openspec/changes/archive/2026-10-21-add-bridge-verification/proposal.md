# Proposal

## Why

Change `add-opencode-tui-bridge` shipped the bridge with its behavior proven
by one hand-run capture set (now archived), and that proof is static: the two
known transcript defects were found by eyeballing a session, contract drift is
only noticed when someone re-runs the validator by hand, and the harness that
could catch more of this lives inside an archive instead of the test suite.
The agreed polish strategy is a loop — scripted sessions find defects,
identify them, fixes land — and that loop needs three things this repository
does not have yet: an offline test suite for the bridge, a compatibility
picture generated from machine output instead of prose, and a repeatable
discovery pass that turns rendering surprises into a tracked inventory.

## What Changes

- The archived spike harness and fixtures are promoted into a durable test
  home (`bridge/test/` + fixtures), copied — the archive itself stays
  untouched as the historical record.
- An offline test suite runnable as `make test-bridge` with no Docker, no
  gateway, no network: golden translation tests (recorded Maki jsonl →
  emitted OpenCode frames), contract tests (bridge response bodies against
  the vendored OpenAPI 2.0.32 with `ajv/dist/2020`, plus the wire rules:
  bare `data:` frames, `server.connected` first, id patterns), and session
  API tests driven through the `MAKI_CHILD_CMD` seam with a scripted fake
  child (boot, prompt turn, failing tool, permission round trip, delete,
  no-orphan teardown).
- A gated TUI smoke (`make test-ui`) that drives the real `opencode` binary
  when it is installed, asserts transcript expectations seeded from
  `known-defects.md` (message order, status-line model name), and skips
  cleanly with a message when the binary is absent — the `lint-profiles`
  pattern.
- A generated compatibility report at `docs/compatibility.md`: three lenses —
  served routes (live/faked/deferred), wire features (verified/unverified/
  degraded/buggy with evidence links), and the version matrix (opencode ×
  maki × transport) — rendered from a machine-readable status file that the
  test and harness runs produce, with `make compat` regenerating it and
  failing when the committed file differs.
- A drift gate script: re-capture the OpenCode `/openapi.json`, A/B it
  against the vendored copy, and report route/schema deltas plus the pinned
  versions; gated on the binaries being present.
- A scripted discovery loop: repeatable explorational sessions (API-level
  and, when available, TUI-level) that append every rendering or protocol
  surprise to a defect inventory seeded from the archived `known-defects.md`,
  each entry with its capture — the feed for later polish changes.

Explicitly out of scope: fixing any defect in the inventory (later changes),
changing `bridge/` runtime behavior or `bin/maki-oss` (helper stub tests
already cover the helper side), flipping the default TUI, bridge session
resume, and any live-gateway requirement in the default test paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `opencode-tui-bridge`: two ADDED requirements on maintainer-observable
  verification behavior — an offline verification gate for the bridge
  (`make test-bridge`, no Docker/gateway/network) and a generated,
  drift-checked compatibility report (`docs/compatibility.md` via
  `make compat`). No existing bridge requirement changes.

## Impact

- **Code**: new `bridge/test/` (bun test, mirroring `dashboard/test/`), a
  status/render script for the report (under `scripts/`), a drift-gate
  script; `Makefile` gains `test-bridge`, `test-ui`, and `compat` targets.
- **Docs**: new generated `docs/compatibility.md` (committed), linked from
  `docs/helper.md`'s OpenCode mode section; `docs/helper.md` also gains the
  corrected archive paths for the known-defects links broken by the archive.
- **Dependencies**: none new at runtime; `ajv` stays dev-only in
  `bridge/package.json`; `bun` required to run the suite (already a
  prerequisite of the opt-in TUI mode), `opencode` binary only for the
  gated smoke.
- **Upstream coupling**: the vendored contract is OpenCode `2.0.32`
  (https://opencode.ai/docs/server/), the wire is Maki's SDK stream
  (https://maki.sh/docs/headless/), and the sandbox transport is unchanged
  (https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md) —
  the drift gate is what notices when the first of those moves.
