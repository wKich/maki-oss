# Tasks

## 1. Helper flags

- [x] 1.1 Add `opt_continue`, `opt_resume`, `opt_session_id` and their `case` arms in the global option loop of `bin/maki-oss`, with `--resume` and `--session-id` requiring a non-empty value like `--model` — verify with `make test` (existing parser tests still pass).
- [x] 1.2 Refuse `--continue` together with `--resume` via `die_usage` (exit 1) naming both flags before any gateway call, and refuse empty values with a usage error naming the flag — verify with new tests in `tests/run-tests.sh` asserting exit 1 and `assert_log_missing "exec"`.
- [x] 1.3 Append the three flags to the exec argv in `cmd_maki` (bare `maki-oss` uses it too) and in `cmd_run`, exactly as `--model` is appended — verify with new tests asserting `assert_log_line "--continue"`, `assert_log_line "--resume"`, `assert_log_line "<id>"`, and `assert_log_line "--session-id"` in the stub argv log.
- [x] 1.4 List the three flags in `usage()` under `Common options`, including a one-line session-lifetime caveat — verify with a test asserting `bin/maki-oss help` output contains all three flag names.

## 2. Behavior tests

- [x] 2.1 Interactive pass-through test `test_maki_resume`: `maki-oss maki --continue` forwards `--continue` to `maki` after `--tty` and the exit sync still runs — verify with `assert_log_before "exec" "download"`.
- [x] 2.2 Headless pass-through and prompt separation test: `maki-oss run --continue "fix the tests"`, `maki-oss run --resume <id> "keep going"`, and `maki-oss run --session-id <id> "start"` each pass the flag and value as their own argv elements with the prompt as a separate element — verify by asserting those exact argv lines and exit code 0.
- [x] 2.3 Session state never crosses the boundary: in the resume-flag tests, assert the download source argv element is the configured workspace and no `.local/state` path appears in the argv log — verify with `assert_log_line` on `/sandbox/project` and `assert_log_line_missing` on the state path.
- [x] 2.4 Rejected combinations and inert flags: `--continue --resume <id>` exits 1 without an exec, and `maki-oss status --continue` runs `status` with no Maki process — verify with exit-code assertions, stderr naming both flags, and `assert_log_missing "exec"`.

## 3. Completions and docs

- [x] 3.1 Add `--continue`, `--resume`, `--session-id` completions under the "run and session options" block of `fish/completions/maki-oss.fish`, with `--resume` and `--session-id` taking a value — verify with `make lint` (`fish -n fish/completions/maki-oss.fish`).
- [x] 3.2 Document the three flags for `maki-oss`, `maki-oss maki`, and `run` in `docs/helper.md`, plus the caveat that sessions live in the sandbox's container filesystem: they survive `stop`/`start` and are lost when the sandbox is deleted and recreated, and the helper stores no session state on the host — verify with `grep` for each flag name and the caveat in `docs/helper.md` and `scripts/check-links.sh` passing.
- [x] 3.3 Add the resume flags to the README's flag overview — verify with `grep -- "--continue" README.md` returning a match.

## 4. Final verification

- [x] 4.1 `make test && make lint` both green from the repository root.
- [x] 4.2 `openspec validate add-session-resume --strict` reports the change valid.
- [ ] 4.3 Manual smoke against the live gateway: `maki-oss run --session-id resume-smoke-<date> "say ok"` then `maki-oss run --resume <that id> "what did you just say?"` must answer from the first transcript, keep stdout Maki-only, and still print the sync-back note on stderr — verify by running both commands against the `maki-maki-openshell` sandbox in `Ready` phase.
