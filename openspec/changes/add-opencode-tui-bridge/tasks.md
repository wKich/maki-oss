# Tasks

## 1. Move the bridge into this repository

- [x] 1.1 Copy the spike's `src/` (bridge, translator, maki child, ids,
      spec-answers) into `bridge/src/` with a `package.json` and `tsconfig.json`
      shaped like `dashboard/` (private, no runtime dependencies, `ajv`
      dev-only) (verify: `cd bridge && bunx tsc --noEmit` exits 0 and
      `bun --version` runs `bridge/src/bridge.ts --help`-style startup far
      enough to print its listen line without the sandbox env)
- [x] 1.2 Copy the spike harness and fixtures used for evidence into this
      change: `harness/` scripts, the recorded maki jsonl samples, and
      `mapping-table.md` (verify: the copied files exist under
      `openspec/changes/add-opencode-tui-bridge/evidence/` and
      `evidence/mapping-table.md` opens with the OpenCode 2.0.32 ↔ Maki 0.6.4 header)
- [x] 1.3 Write `evidence/known-defects.md` recording the two observed
      transcript defects — user prompts rendering after assistant responses
      (A-A-A-Q-Q-Q) and the synthesized "sample" model name — each with the
      capture that demonstrates it and a pointer that fixing them belongs to a
      later change (verify: the file names both defects and cites at least one
      evidence file per defect)
- [x] 1.4 Run the spike's redaction scan over the copied evidence
      (verify: the scan command reports no credential pattern in
      `bridge/` or the change's `evidence/`, and the result is appended to
      `evidence/` as a dated note)

## 2. Sandbox adaptation inside the bridge

- [x] 2.1 Make the Maki child executable injectable via `MAKI_CHILD_CMD`
      (default `maki`) with the SDK flags appended by the bridge (verify:
      `MAKI_CHILD_CMD=/path/to/argv-echo bun bridge/src/bridge.ts` records the
      appended `-p --input-format stream-json --output-format stream-json`
      argv on the stub's stderr log)
- [x] 2.2 Build the default child argv from helper-supplied environment:
      `OPENSHELL_BIN`, sandbox name, workdir, and `MAKI_MODEL`, producing
      `<openshell> sandbox exec -n <name> --no-login-shell --workdir <workdir>
      -- maki -p --trust --input-format stream-json --output-format stream-json
      [-m <model>]`, with no `--env` flag anywhere (verify: with `OPENSHELL_BIN`
      pointing at a stub that echoes argv, the recorded line matches the shape
      exactly and `grep -c -- --env` over it is 0)
- [x] 2.3 Keep the child's stdin pipe open for the session lifetime and kill
      the child on session delete and on bridge exit (verify: a scripted child
      stays running across two prompts, exits after a session delete returns
      204, and a SIGTERM on the bridge leaves no orphaned child — `pgrep -f`
      finds none)
- [x] 2.4 Answer location/project reads from the sandbox workdir (canonical
      path passed by the helper, cross-checked against Maki's
      `system.init.cwd` when present) (verify: the bridge's request log shows
      `GET /api/location` and `/api/project` returning the sandbox workdir and
      an empty `subpath`)

## 3. Helper integration: config-gated OpenCode TUI session

- [x] 3.1 Add the `tui` config key (values: unset or `opencode`) with
      `MAKI_OSS_TUI` overriding the file, and a usage error (exit 1) naming
      the key and accepted values for anything else (verify: a stub-backed
      test in `tests/run-tests.sh` covers unset, `opencode`, and `tui = "vim"`,
      and `make test` passes)
- [x] 3.2 In OpenCode mode, refuse `--continue`, `--resume`, and `--session-id`
      on bare `maki-oss` and `maki-oss maki` with an error naming OpenCode TUI
      mode, while `maki-oss run` keeps them (verify: stub-backed tests cover
      both the refusal and the unchanged headless path, `make test` passes)
- [x] 3.3 Wire the session flow: existing ensure routine, `arm_sync`, export
      bridge environment (`OPENSHELL_BIN`, name, workdir, `MAKI_MODEL`,
      `PORT` when set), start `bun bridge/...` in the background, wait for the
      listen line, attach `opencode --server http://127.0.0.1:<port>` on the
      TTY, and on exit kill the bridge, run the exit sync and proposal check
      (verify: a stub-backed test records the order — ensure, bridge start,
      TUI attach, bridge kill, sync — and the same test passes with `--no-sync`)
- [x] 3.4 Extend `maki-oss doctor` with the conditional TUI checks (`bun`,
      `opencode`, bridge entrypoint) that run only when `tui` resolves to
      `opencode` (verify: stub-backed tests show the checks fail the run when
      configured and are absent from the output when unset, `make test` passes)
- [x] 3.5 Document the mode: `tui` key in `examples/config.toml`, the config
      table and a session example in `docs/helper.md`, and the known-defects
      caveat with a pointer to the change's evidence (verify:
      `scripts/check-links.sh` (if touching linked docs) exits 0 and
      `grep -n 'tui' docs/helper.md examples/config.toml` shows key, values,
      and caveat)

## 4. Live smoke and wrap-up

- [x] 4.1 Run one live session against the real gateway: `tui = "opencode"`,
      a plain prompt, one permission-gated prompt, clean exit with sync-back
      (verify: `evidence/live-smoke-note.md` records the commands, the sandbox
      name, and confirms no credential appears in any captured log; when no
      gateway is available the note must instead record that and the task
      stays open)
- [x] 4.2 Re-run the spike's contract validator against a bridge session in
      this repo and store its log (verify: `evidence/validate-bridge.log`
      shows the same PASS lines as the spike — no unhandled 404, valid bodies,
      bare `data:` frames, `server.connected` first — and the log is referenced
      from the task list; the log was produced by `evidence/harness/capture-bridge.sh`
      (real TUI over this repo's bridge) plus `evidence/harness/validate-bridge.mjs`,
      both run on 2026-10-21)
- [x] 4.3 Final gate: `make test`, `make lint`, `openspec validate
      "add-opencode-tui-bridge"`, and `cd bridge && bunx tsc --noEmit` all
      exit 0 (verify: the four commands are run in one pass and print no
      failures)
