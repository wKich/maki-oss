# Design

## Context

`add-opencode-tui-bridge` shipped `bridge/` with exported seams that this
change builds on without touching runtime code: `childArgv()` /
`MAKI_CHILD_CMD` (the fake-child test seam) and the helper's listen-line
contract (`bridge listening on http://127.0.0.1:<port>`). Verification
artifacts exist but are frozen: the harness (`fake-maki.ts`, `api-check.ts`,
`validate-bridge.mjs`, `stub.ts`) and fixtures live under
`openspec/changes/archive/2026-10-21-add-opencode-tui-bridge/evidence/`, and
the only automated bridge-side coverage is the helper stub suite
(`tests/stub/bun`, `tests/stub/opencode`) which asserts the helper, not the
bridge. The repository rule stands: `make test` needs no Docker, gateway, or
network (tests/run-tests.sh header), and `lint-profiles` shows the pattern
for gated targets that skip when a local tool is missing. See
`proposal.md` for motivation; requirements are in the delta spec.

## Goals / Non-Goals

Goals: one offline command proves the bridge's translation, contract, and
session behavior; one generated file states compatibility with evidence
behind every row; a repeatable pass finds new defects and files them; drift
in the upstream contract is detected by a script instead of a person.

Non-goals: changing `bridge/` runtime code or `bin/maki-oss`; fixing any
inventoried defect; making the gated paths run in a hosted CI (this repo has
no CI service — gates are make targets); auto-flipping statuses without a
human edit (a fix changes data, the gate forces the report to follow).

## Decisions

1. **Black-box process tests, no refactor of `bridge.ts`.** Each API test
   spawns `bun bridge/src/bridge.ts` with `PORT=0`, `MAKI_CHILD_CMD` pointed
   at a scripted fake child, and the sandbox env the helper exports, then
   parses the listen line exactly the way `wait_for_bridge_port` does.
   *Alternative: export a programmatic server factory — rejected: changes
   shipped code for test convenience and diverges from the path the helper
   actually runs.*

2. **Test home mirrors the dashboard**: `bridge/test/*.test.ts` with
   `bun test` run from `bridge/`, fixtures as committed jsonl under
   `bridge/test/fixtures/`, copied (not moved) out of the archive. The spike
   harness is converted into tests in that layout: `fake-maki.ts` becomes the
   scripted child fixture, `api-check.ts` scenarios become API tests,
   `validate-bridge.mjs` logic becomes the contract test using the vendored
   `bridge/src/openapi-2.0.32.json`. `make test` stays the sh suite;
   `make test-bridge` runs `cd bridge && bun test` and needs nothing else.

3. **Golden comparisons use a semantic projection, not raw bytes.** Frame
   sequences are reduced to `{type, event-shape, part-order, text}` (ids,
   timestamps, and durations stripped) before diffing against committed
   goldens, because minted `evt_`/`msg_` ids are deliberately random.
   *Alternative: seedable ids — rejected: touches runtime code and weakens
   the id-pattern tests.*

4. **One machine-readable status file feeds the report.**
   `bridge/compat/statuses.json` holds the three lenses (routes with
   `served-live|served-faked|deferred|unhandled`, features with
   `verified|unverified|degraded|buggy` plus an evidence key, and the pinned
   versions/transport), and `bridge/defects.json` is the inventory
   (id, title, status, capture) seeded from the archived `known-defects.md`.
   The renderer (`bun scripts/gen-compat.ts`) joins them: a feature with an
   open inventory entry is forced to `buggy` (spec scenario), so the report
   cannot disagree with the inventory. `make compat` renders to
   `docs/compatibility.md` and fails on `git diff --exit-code`.
   *Alternative: derive statuses from test results at render time —
   rejected: it makes `make compat` depend on running the suite and buries
   evidence links in test names instead of one reviewable file.*

5. **Tests and statuses are cross-checked, not auto-synced.** A consistency
   test asserts every `verified` feature names an existing test or fixture,
   every inventory entry names an existing capture, and every
   expected-failure marker names an *open* inventory entry (and vice versa);
   flipping a status or closing a defect is a human edit that the
   cross-check plus `make compat` keep honest. The fix workflow is: fix →
   update `defects.json` (status + marker removal) → `make compat` fails →
   regenerate → commit.

6. **The UI smoke is invariant-plus-recording.** `make test-ui` (gated on
   `opencode` and `bun`, skips with a message otherwise, never part of
   `make test`) drives the real TUI for boot → prompt → permission, asserts
   the invariants that must always hold (no boot 404, composer accepts a
   prompt, permission dialog round-trips), and commits the transcript capture
   as evidence. Defect-specific expectations (message order, model name) are
   read from `defects.json`: while an entry is open the smoke records the
   reproduction, it does not fail on it — failures of open defects are the
   discovery pass's output, not red builds.

7. **The discovery pass is a scripted run producing inventory appends.**
   `bun bridge/test/discovery.ts` runs the repeatable explorational matrix
   (API-level always; TUI-level when the binary is present): multi-turn
   Q-A-Q-A ordering, model-name rendering, tool error rows, permission
   prompts, session delete/recreate — comparing observed frames/transcripts
   against expectations and appending new defects (id, title, capture path)
   to `defects.json` without touching existing entries. Re-running with
   nothing new is a no-op (spec scenario).

8. **Drift gate is a separate gated target.** `make compat-drift` re-captures
   `/api/info` + `/openapi.json` from the installed OpenCode (the spike's
   capture flow), A/Bs against the vendored copy, prints route/schema deltas
   and `opencode`/`maki --version`, exits non-zero on drift, and skips
   cleanly without the binaries. Deliberately not folded into `make compat`
   so the fast, offline gate stays fast.

## Risks / Trade-offs

- [Golden tests freeze current behavior, including defects] → defect-case
  goldens encode the *desired* frame order from the spec, run as expected
  failures linked to their `defects.json` entry, so the suite stays green
  while the defect is open and the cross-check (decision 5) forces the
  expected-failure marker to be dropped the moment the defect closes — never
  a silent skip, never a permanently red gate.
- [Status file rots away from the code] → cross-check test (decision 5) +
  `make compat` in the wrap-up gate; every row must carry an evidence key.
- [Spawning the bridge per test is slower than in-process] → one process per
  test file, not per assertion; suite stays seconds-scale on bun.
- [`bun` or `opencode` absent on a host] → `test-bridge`/`test-ui` print a
  skip message and exit 0 the way `lint-profiles` does; `make test` never
  touches them.
- [Archive-path link rot already present in `docs/helper.md`] → fixed in
  this change's docs task; `check-links.sh` gains an internal relative-link
  check so this class of breakage is caught by the gate.

## Migration Plan

Additive only. First run: copy fixtures from the archive, seed
`defects.json`, render `docs/compatibility.md`, commit. Rollback: delete the
new targets/files; runtime behavior is untouched.

## Open Questions

None blocking. Deferred: hosted CI wiring (no CI service exists yet),
auto-generation of route statuses from a live TUI boot (needs the gated path
to be deterministic first), and any decision about flipping the default TUI.
