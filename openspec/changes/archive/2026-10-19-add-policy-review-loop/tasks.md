# Tasks

## 1. Session ensure: advisor enable

- [x] 1.1 Add a `settings_set_advisor` helper in `bin/maki-oss` that runs `openshell settings set <name> --key agent_policy_proposals_enabled --value true`, warns on stderr and returns non-zero on failure without aborting the caller (verify: `sh -n bin/maki-oss` passes and the function is defined once, used by ensure)
- [x] 1.2 Call it from `ensure_project_sandbox` on both the created and reused-sandbox paths, after readiness and before the upload/attach phase, and verify `maki-oss up` records no `settings set` invocation (stub test asserting argv)
- [x] 1.3 Add stub-backed tests in `tests/run-tests.sh`: fresh-create records the settings call before the Maki exec; reuse records it too; a failing settings command warns and the session still proceeds; `up` never sets it (verify: `make test` passes)

## 2. Exit-time surfacing

- [x] 2.1 Add a `pending_proposals_count` function parsing `openshell rule get <name> --status pending` text output with awk (count `Chunk:` lines; empty output or command failure → empty count), following the `sandbox_phase` parsing pattern (verify: feed it captured v0.1.2 output and the live sandbox's four-chunk output)
- [x] 2.2 Hook it into the sync exit path (`sync_project_back` or its caller) so that after the download, a non-zero count prints a stderr note with the count and `maki-oss policy review`; suppress on `--no-sync` and on non-session commands; a failing check warns at most and never changes the exit code (verify: stub tests for pending/empty/failure/interrupt cases and exit-code preservation)
- [x] 2.3 Run `make lint` and confirm shellcheck is clean for the new code

## 3. Policy commands

- [x] 3.1 Add `cmd_policy_review`: `require_openshell`, resolve name, `require_sandbox`, run `os rule get <name> --status pending` as a text passthrough (verify: stub test records argv; empty inbox prints a "no pending proposals" line and exits 0)
- [x] 3.2 Add `cmd_policy_approve <chunk-id>`: confirm sandbox name + chunk id interactively, require `--yes` when stdin is not a TTY (same contract as `cmd_rm`), then run `os rule approve <name> --chunk-id <id>` (verify: stub tests for prompt/yes/non-TTY-fail; no bulk flags ever passed)
- [x] 3.3 Add `cmd_policy_reject <chunk-id> --reason "<text>"`: usage error on missing/empty reason, then run `os rule reject <name> --chunk-id <id> --reason <text>` (verify: stub tests for usage error and argv passthrough of the reason)
- [x] 3.4 Wire the `policy` subcommand dispatch, update `usage()` text, and verify `maki-oss help` lists the three subcommands with an example each (verify: `make test`, `maki-oss policy` with no args exits EX_USAGE)

## 4. Docs and conventions

- [x] 4.1 Update `docs/helper.md`: new `policy` command section (review/approve/reject, the exit note, the manual-review posture and that no bulk/auto approval exists), and note that approval of a private-address host stays blocked by the SSRF guard (verify: link check via `scripts/check-links.sh`)
- [x] 4.2 Update `docs/ai/host-playbook.md` / `docs/ai/agent-playbook.md`: add the "target project must be a git repo with dependency dirs gitignored" step with the mlx-optiq 491MB `.venv` round-trip as the rationale, and a short "reviewing access" workflow (review → approve/reject → agent continues or narrows) (verify: both playbooks still pass their per-step verification-gate convention)
- [x] 4.3 Record the verification baseline in `docs/ai/references.md` or helper.md: advisor flow verified against gateway/CLI v0.1.2; `rule get` has no JSON output there; upstream docs describe v0.1.4 (verify: the note names the version explicitly)
- [x] 4.4 Final `make test && make lint` and a live smoke against the existing `maki-mlx-optiq` sandbox: `maki-oss policy review` lists the four known pending chunks; approving one chunk with `--yes` is recorded once and no other chunk changes (verify: output diff before/after)

## 5. Out-of-scope markers (no code)

- [x] 5.1 Confirm in `docs/helper.md` a short "known limitations" note: sandbox `$HOME` writes (e.g. `~/.optiq`) are not synced back; sandbox-created large artifacts are not filtered on download — deferred by decision, pointer to the change record (verify: note exists and names both limitations)
