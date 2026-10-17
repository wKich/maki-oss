# Proposal

## Why

Starting work in an existing project currently takes a sequence of hand-typed steps: register providers, create the sandbox, attach providers, upload the project, launch Maki, and later download results. The goal is two commands total: a one-time `maki-oss provider setup`, then `maki-oss` from any project directory doing the rest.

## What Changes

- Bare `maki-oss` (no subcommand), `maki-oss maki`, and `maki-oss run "<prompt>"` share one idempotent ensure routine: resolve remembered providers, create or start the project sandbox, attach missing providers, upload the project only when the sandbox was just created, then launch Maki.
- With no provider remembered, the helper offers the provider setup wizard inline on a TTY; on a non-TTY it exits with the exact command to run, before any sandbox mutation.
- `provider setup` and `provider add` remember the created provider instance name in the config file's `providers` list. A new optional `model` config key selects the model; `--model` overrides it; unset means Maki's own picker.
- Every Maki session (interactive or headless) downloads the workspace back to the local project directory on exit, including on non-zero exit and interrupts, as an additive merge that never deletes host-only files. `--no-sync` opts out. A failed sync warns on stderr but preserves Maki's exit code.
- `maki-oss up` stays create/start-only; explicit `upload`, `download`, and `provider attach` keep their manual semantics.
- Docs, fish completions, and the stub test suite are updated accordingly.

Non-breaking for explicit commands; bare `maki-oss` changes from a usage error to the session launcher.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `helper-cli`: adds requirements for the one-command project session, inline provider bootstrap, provider/model memory in the config file, and session sync-back. Existing lifecycle/transfer/execution requirements are unchanged.

## Impact

- `bin/maki-oss`: new ensure/session/sync helpers, config read-modify-write for remembering providers and model, new `--no-sync` flag, bare-invocation dispatch.
- `examples/config.toml`: documents the new `model` key.
- `tests/stub/openshell` and `tests/run-tests.sh`: ordered ensure/sync traces, config rewrite and merge scenarios.
- Docs: `README.md`, `docs/helper.md`, `docs/setup-guide.md` §6, `docs/ai/agent-playbook.md`, `docs/verification.md` (sync check), `docs/verification-log.md` (dry run).
- `fish/completions/maki-oss.fish`: complete the new flags.
- Depends on the `add-any-provider-support` change being archived first, since provider memory layers on its wizard behavior.
- Security invariants hold: no host bind mounts (sync is `openshell sandbox download`), no credential values in config or argv, no widened egress, non-root sandbox unchanged.
- Upstream behavior these decisions rely on: OpenShell transfer merge semantics and workspace-restricted download (`https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md`), provider attachment (`https://docs.nvidia.com/openshell/how-it-works/providers/overview.md`), and config/profile conventions (`https://maki.sh/docs/configuration/`).
