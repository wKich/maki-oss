# Tasks

## 1. Provider and model memory

- [x] 1.1 Confirm `add-any-provider-support` is archived so `openspec/specs/helper-cli/spec.md` contains the wizard requirements; if not, archive it first and verify `openspec validate --all --strict` passes
- [x] 1.2 Extend the config reader with the `model` key and add a config writer (`remember_provider`, `set_model`) that read-validate-modify-writes only the `providers`/`model` lines atomically; verify with a scratch-home test that comments and unrelated keys are preserved and the result re-parses
- [x] 1.3 Wire `provider setup` and `provider add` to remember the created provider name (deduplicated) and offer to set the model in the interactive wizard; verify a stub test records the config file content and that re-running does not duplicate the name
- [x] 1.4 Document the `model` key in `examples/config.toml`; verify the existing config-acceptance test (`examples/config.toml is accepted unchanged`) still passes

## 2. Shared ensure routine and session command

- [x] 2.1 Implement `ensure_project_sandbox`: remembered-provider check with inline wizard on a TTY and non-TTY actionable exit, create/start/reuse with bounded wait for `Provisioning`/`Starting`, upload only when this invocation created the sandbox, and `--wait` attach of missing providers; verify stub-backed tests assert the recorded invocation order for each branch
- [x] 2.2 Implement the session command used by bare `maki-oss` and `maki-oss maki`, and make `maki-oss run` call the same ensure step; verify stub tests cover create-from-scratch via `run` and reuse without upload
- [x] 2.3 Dispatch a bare invocation (no positional command) to the session command and parse `--no-sync`; verify `maki-oss help` still prints usage and `maki-oss` without a sandbox reaches ensure rather than the usage error
- [x] 2.4 Pass a resolved model (`--model` flag over config `model`) to Maki for bare/maki/run; verify stub tests assert flag precedence in the recorded `sandbox exec` argv

## 3. Session sync-back

- [x] 3.1 Verify real `openshell sandbox download` directory placement against the running gateway on a scratch sandbox and record the result in `docs/verification-log.md`; if the CLI nests the basename, implement a temp-dir download plus contents merge, and verify with a host-only file preserved next to a sandbox-edited file
- [x] 3.2 Implement `sync_back` as an EXIT/INT/TERM trap for bare/maki/run: additive merge into the project directory, `--no-sync` opt-out, single-run guard, stderr-only messages, and preservation of Maki's exit code on sync failure; verify stub tests cover sync-called, no-sync-skipped, and failed-sync-keeps-code
- [x] 3.3 Confirm `maki-oss run` stdout contains only Maki output while sync messages go to stderr; verify with the stub suite capturing both streams separately

## 4. Tests and lint

- [x] 4.1 Extend `tests/stub/openshell` with `sandbox download` recording and any needed phase/config knobs while preserving existing behavior; verify `make test` passes before adding new cases
- [x] 4.2 Add stub-backed scenarios for: fresh create→upload→attach→exec→download order, reuse without upload, stopped→start, missing-provider attach, non-TTY bootstrap refusal with no gateway mutation, missing gateway provider, config-preserving rewrite and dedupe, model precedence, `--no-sync`, and sync-failure exit code; verify `make test` reports all passing
- [x] 4.3 Run `make lint` (shellcheck + `fish -n`) and confirm zero findings

## 5. Documentation

- [x] 5.1 Update `docs/helper.md` (session behavior, auto upload/sync rules, `--no-sync`, `model`, exit codes, simplified cookbook) and verify every command shown matches the implemented helper
- [x] 5.2 Update `README.md`, `docs/setup-guide.md` §6, and `docs/ai/agent-playbook.md` for the two-command flow; verify each rewritten step against the implementation and `scripts/check-links.sh`
- [x] 5.3 Add a sync-back check to `docs/verification.md` and the sync expectations to the isolation checklist; verify the commands produce the documented output on a scratch sandbox
- [x] 5.4 Add `--no-sync` and the new flags to `fish/completions/maki-oss.fish`; verify `fish -n` and the existing completion test pass
- [x] 5.5 Record the real-gateway dry run (provider setup → bare `maki-oss` in a scratch project → exit → synced files → reuse without upload) in `docs/verification-log.md`; if no real credential is available, say so and record how far the fake-credential run got

## 6. End-to-end verification

- [x] 6.1 Run `make test`, `make lint`, `make lint-profiles`, and `openspec validate add-one-command-session --strict`; verify all pass with no skips other than lint-profiles' documented CLI-absent skip
- [x] 6.2 Exercise the full flow on this machine against the real gateway from a scratch project and verify: one bare command creates, uploads, and launches; exiting syncs changes back; the next bare run reuses the sandbox with no upload; transcript recorded in `docs/verification-log.md`
