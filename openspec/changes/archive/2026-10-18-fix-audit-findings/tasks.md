# Tasks

## 1. Helper: secret hygiene on every creation path

- [x] 1.1 Call `check_env_hygiene` at the top of `run_sandbox_create` in `bin/maki-oss`, keeping `cmd_up`'s early call; verify with a new stub test that `maki-oss run --env ANTHROPIC_API_KEY=sk-secret "hi"` exits 1 before any `sandbox create` in the stub log (`make test`)
- [x] 1.2 Verify the existing env tests (`test_env_refusal`, `test_env_allow_override`, `test_env_lookalike`) still pass unchanged (`make test`)

## 2. Helper: announce sync-back overwrite on reuse

- [x] 2.1 Add one stderr `note` in the `ensure_project_sandbox` reuse branches (existing `Ready` sandbox and started-stopped sandbox) saying sync-back overwrites matching host files and `maki-oss upload` refreshes; verify with a new test that the warning appears on reuse and does not appear on the create path (`make test`)

## 3. Helper: correct no-jq JSON parsing

- [x] 3.1 Fix the `sandbox_phase` awk fallback: match `"name":[ ]*"target"` (optional space after the colon) and take the first `"phase"` value after that match, on the same line or following lines; verify with two new `test_no_jq_fallback` cases — compact single-sandbox JSON reports the right phase, and single-line JSON with a `Stopped` target plus a later `Ready` sandbox reports `Stopped` (`make test`)
- [x] 3.2 Replace the greedy `sed` in the `attached_providers` fallback with a form that returns every `"name"` value (e.g. `grep -o`); verify with a new no-jq case where `maki-oss status` lists two attached providers (`make test`)
- [x] 3.3 Confirm `make lint` (shellcheck) stays clean for `bin/maki-oss`

## 4. Helper: signals terminate the program

- [x] 4.1 Replace the line-1291 trap with `trap setup_cleanup EXIT`, `trap 'setup_cleanup; exit 130' INT`, `trap 'setup_cleanup; exit 143' TERM`; verify with a new test that SIGINT during `provider setup` exits non-zero and leaves no `maki-oss-setup.*` temp dir, and that the existing interrupt-still-syncs session tests still pass (`make test`)
- [x] 4.2 Apply the same exit-after-cleanup trap shape to `tests/run-tests.sh` and `dashboard/scripts/smoke.sh`; verify both scripts still clean their temp dirs on normal and interrupted exit (`make test`, `dashboard/scripts/smoke.sh`)

## 5. Helper: concurrent create race resolves to reuse

- [x] 5.1 In `ensure_project_sandbox`, when `sandbox create` fails, re-check `sandbox_phase` and continue as reuse (wait for `Ready`, no upload) when the sandbox now exists, otherwise keep the hard failure; verify with a new stub test where the stub reports "already exists" on create but the sandbox is present in state — the session proceeds to exec and download with no gateway-error exit (`make test`)

## 6. Dashboard: token-gated streams and idle hub release

- [x] 6.1 Mint the session token in all modes (read-only uses it for streams only), guard `/events/logs` with a constant-time comparison of the `token` query parameter (403 and no process spawn when absent or wrong), and append the token to the stream URL in `app.js`; verify with new `bun test` cases: 403 without token with no CLI spawn recorded, stream works with token in read-write and read-only modes, and every mutation still returns 403 in read-only
- [x] 6.2 Add an `onIdle` callback to `LogHub` (last subscriber gone and child dead) and use it in `server.ts` to delete the hub from the map; verify with a new `bun test` case that the hub count returns to zero after a disconnect and that a later stream for another name starts clean
- [x] 6.3 Confirm the smoke script still passes after the SSE guard (`dashboard/scripts/smoke.sh`), updating any stream request it makes to carry the token

## 7. Docs

- [x] 7.1 Add the reuse/sync-overwrite warning note to the session section of `docs/helper.md` and a short "log streams require the page token; read-only mints a read token" note to `dashboard/README.md`; verify external links still resolve (`scripts/check-links.sh docs`)

## 8. Full verification

- [x] 8.1 `make test` and `make lint` pass with the whole suite green
- [x] 8.2 `cd dashboard && bun test` passes
- [x] 8.3 `dashboard/scripts/smoke.sh` passes
- [x] 8.4 `openspec validate --all` reports the change valid
