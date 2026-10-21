# Tasks

## 1. Promote the harness into a durable test home

- [x] 1.1 Copy the archived fixtures and harness sources into `bridge/test/`
      (fixtures under `bridge/test/fixtures/`, the fake child, the API-check
      scenarios, and the validator logic) without touching the archive
      (verify: `diff -r` between each archived source and its copy reports no
      difference, and `openspec/changes/archive/2026-10-21-*/evidence/` is
      unchanged in `git status`)
- [x] 1.2 Seed `bridge/defects.json` from the archived `known-defects.md`
      (verify: a bun one-liner asserts exactly two entries — message-order
      inversion and synthesized model name — each with `status: "known"` and
      a capture reference pointing at an existing archived file)
- [x] 1.3 Stand up the test runner: `bridge/test/` executes with `cd bridge
      && bun test` and one trivial passing test (verify: the command exits 0
      and prints the test count)

## 2. Offline test suite (`make test-bridge`)

- [x] 2.1 Golden translation tests: for each recorded maki jsonl fixture,
      assert the projected OpenCode frame sequence (ids/timestamps stripped:
      event types, part order, text) against committed goldens, including the
      desired-order goldens for the two open defects running as expected
      failures that name their `defects.json` entry (verify: the suite is
      green with both defects open; editing a golden's expected order makes
      the suite exit non-zero and name the fixture and frames)
- [x] 2.2 Contract and wire tests: validate bridge response bodies against
      the vendored `openapi-2.0.32.json` with `ajv/dist/2020`, and assert the
      first SSE frame is `server.connected`, every frame is a bare `data:`
      frame, and minted ids match the OpenCode patterns (verify: tests pass
      against a live bridge process and fail when a body fixture is
      deliberately corrupted)
- [x] 2.3 Session API tests over the black-box bridge (spawn
      `bun bridge/src/bridge.ts` with `PORT=0` and `MAKI_CHILD_CMD` set,
      parse the listen line): boot routes answer 2xx, a prompt turn renders,
      a failing tool maps to `tool.failed`, the permission round trip blocks
      then answers `allow`/`deny` on the child's stdin, delete returns 204,
      and no child process survives teardown (verify: each case passes and a
      post-suite `pgrep -f` finds no fake child)
- [x] 2.4 Cross-check test: `verified` statuses name an existing test or
      fixture, inventory entries name an existing capture, expected-failure
      markers pair with open inventory entries (verify: temporarily pointing
      a status at a nonexistent test makes the suite fail with that name)
- [x] 2.5 Makefile target: `test-bridge` runs `cd bridge && bun test`,
      prints a skip message and exits 0 when `bun` is absent, and `make test`
      is unchanged (verify: `make test` output is byte-identical in scope to
      before (sh suite only), `make test-bridge` exits 0 with bun, and
      `PATH` without bun gives the skip line and exit 0)

## 3. Generated compatibility report

- [x] 3.1 Add `bridge/compat/statuses.json` (routes, features, pinned
      versions/transport) and `scripts/gen-compat.ts`, rendering
      `docs/compatibility.md` with the three lenses, evidence keys on every
      row, and open inventory entries forcing `buggy` (verify: the first
      render commits; `bun scripts/gen-compat.ts --check` exits 0 on it)
- [x] 3.2 Add the `compat` Make target: regenerate and fail on
      `git diff --exit-code docs/compatibility.md` (verify: on a clean tree
      `make compat` exits 0; changing one status makes it exit non-zero until
      the report is regenerated and committed)
- [x] 3.3 Fix the two broken archive links in `docs/helper.md` (lines ~214
      and ~554: `changes/add-opencode-tui-bridge/...` →
      `changes/archive/2026-10-21-add-opencode-tui-bridge/...`) and link
      `docs/compatibility.md` from the OpenCode mode section (verify:
      `grep -n 'archive/2026-10-21-add-opencode-tui-bridge' docs/helper.md`
      shows both paths and the compatibility link resolves)
- [x] 3.4 Extend `scripts/check-links.sh` with an internal relative-link
      check for `docs/` (verify: the script exits 0 on the current tree and
      exits non-zero when run with a deliberately broken relative link)

## 4. Contract drift gate

- [x] 4.1 Add `make compat-drift`: capture the installed OpenCode
      `/api/info` and `/openapi.json` using the spike's capture flow, A/B
      against the vendored copy, print route/schema deltas plus
      `opencode --version` and `maki --version`, exit non-zero on drift, and
      skip with a named message when binaries are absent (verify: with the
      pinned host binaries it reports the versions and no unexpected drift;
      with `PATH` stripped of `opencode` it prints the skip and exits 0;
      `make test` never invokes it)

## 5. Discovery loop

- [x] 5.1 Add `bridge/test/discovery.ts`: the API-level explorational matrix
      (multi-turn Q-A-Q-A ordering, status-line model name, tool error rows,
      permission prompts, session delete/recreate) comparing observations to
      expectations and appending new defects — id, title, capture path — to
      `bridge/defects.json` without modifying existing entries (verify: two
      consecutive runs on the current build leave the inventory byte-identical
      (the two known defects dedupe), and a deliberately wrong expectation
      appends exactly one entry with a capture that exists)
- [x] 5.2 Wire the TUI-level discovery pass into `make test-ui` (gated on
      `opencode` + `bun`, skip message otherwise): boot → prompt → permission
      invariants asserted, transcript captured and compared against the
      inventory (verify: on a host with `opencode` the target records a
      transcript and passes while both defects are open; without the binary
      it skips with exit 0; the target is not referenced by `make test`)
- [x] 5.3 Document the loop in `bridge/test/README.md`: run discovery →
      triage appended entries → open one change per fix → fix flips the
      inventory status and its expected-failure marker → `make compat` →
      commit (verify: every command in the README runs as written from the
      repository root)

## 6. Wrap-up

- [x] 6.1 One-pass gate: `make test`, `make test-bridge`, `make compat`,
      `make lint`, and `openspec validate "add-bridge-verification"` all
      exit 0 (verify: the five commands run in one shell pass with no
      failures, and `git status` shows no uncommitted generated drift)
