# Tasks

## 1. Scaffold

- [x] 1.1 Create `dashboard/package.json` (Bun scripts `start`, `dev`, `test`), `tsconfig.json`, and `.gitignore`; verify `bun install` resolves with zero dependencies and `bun run start` serves a placeholder page on `127.0.0.1:8787`
- [x] 1.2 Create `dashboard/README.md` documenting requirements (Bun ≥ 1.2, `openshell` CLI), flags (`--port`, `--host`, `--token`, `--read-only`), security notes, and threat model; verify every documented flag changes behavior in smoke tests

## 2. CLI adapter

- [x] 2.1 Implement `dashboard/src/openshell.ts`: argv-array spawning (no shell), JSON parsing, timeouts, and typed results for list/get/create/start/stop/delete, `policy get`, `rule get|approve|reject`, `settings get`, and `logs`; verify with `bun test` against the stub CLI
- [x] 2.2 Create the stub `openshell` fixture at `dashboard/test/stub/openshell` that records argv and returns canned JSON per subcommand; verify tests run with a prefixed `PATH` and never touch a real gateway
- [x] 2.3 Implement error normalization (missing CLI, non-zero exit, invalid JSON) into structured errors the UI can render; verify each case has a test

## 3. HTTP API and SSE

- [x] 3.1 Implement `Bun.serve` routing for `/`, `/api/sandboxes`, `/api/sandboxes/:name`, `/api/sandboxes/:name/policy`, `/api/sandboxes/:name/rules`, and `/api/doctor`; verify JSON responses against the stub
- [x] 3.2 Implement mutating routes (create, start, stop, delete, rule approve, rule reject) guarded by the session token and read-only mode; verify 403 for a missing token and for read-only, and success with a valid token
- [x] 3.3 Implement `GET /events/logs?name=...` SSE streaming from a spawned `openshell logs --tail` with a 2,000-line ring buffer, heartbeat comments, and child kill on disconnect; verify with a timed stub emitter and a test client that disconnects

## 4. Frontend

- [x] 4.1 Implement the inventory view (table with phase/labels/notes, 3-second refresh, error banner); verify in a browser with the stub and verify no unescaped gateway data reaches the DOM
- [x] 4.2 Implement sandbox detail (providers, policy source, revision list, action buttons, typed delete confirmation); verify start/stop/delete end to end with the stub and confirm read-only mode disables the controls
- [x] 4.3 Implement the logs view (source/level filters, pause/resume, reconnect) with `EventSource`; verify buffered replay on reconnect and clean stop when the tab closes
- [x] 4.4 Implement the policy view (base/effective tabs) and rules view (pending list, approve, reject-with-required-reason); verify approve/reject hit the correct routes and surface gateway errors

## 5. Verification and docs

- [x] 5.1 Write `bun test` coverage for adapter parsing, route guards, and SSE lifecycle; verify `bun test` passes with no network access
- [x] 5.2 Add `dashboard/scripts/smoke.sh` that starts the server with the stub on `PATH`, curls the API routes, and asserts expected payloads; verify it exits 0
- [x] 5.3 Manual verification against a real gateway: create, stop, start, and delete a scratch sandbox; confirm logs, policy, and pending-proposal views match CLI output; record results in `dashboard/README.md`
- [x] 5.4 Run `openspec validate add-openshell-bun-dashboard --strict` and fix any reported issue
