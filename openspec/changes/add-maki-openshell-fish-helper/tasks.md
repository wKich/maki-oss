# Tasks

## 1. Scaffold and configuration

- [ ] 1.1 Create `bin/maki-oss` skeleton with `set -eu`, subcommand dispatch, `help`/`usage`, and an exit-code convention (0 success, 1 usage error, 2 dependency error, 3 gateway error); verify `./bin/maki-oss help` prints usage and `shellcheck bin/maki-oss` passes
- [ ] 1.2 Implement configuration resolution (flags > `MAKI_OSS_*` env > `~/.config/maki-openshell/config.toml` > defaults) with the read-only awk parser and hard error on unknown keys; verify precedence and unknown-key cases in `tests/run-tests.sh`
- [ ] 1.3 Add `examples/config.toml` documenting every supported key (image, policy, providers, cpu, memory, sandbox name pattern, engine); verify the helper accepts it unchanged and that an unknown key in a fixture is rejected with the key named in the error

## 2. Lifecycle and execution

- [ ] 2.1 Implement `up`/`init` create-or-start using `openshell sandbox list --output json` (jq when present, grep fallback) plus configured image/policy/providers; verify idempotence (second run starts, never duplicates) with the stub
- [ ] 2.2 Implement `maki` (interactive attach through `openshell sandbox exec --tty`) and `run` (headless `--print --yolo --trust --output-format json`, stdout passthrough, exit-code propagation); verify both with the stub and record one manual run on a host with OpenShell
- [ ] 2.3 Implement `upload`/`download` delegating to `openshell sandbox upload|download` with workdir handling; verify a test asserts the emitted argv never contains `driver-config-json`, `mounts`, or `bind`
- [ ] 2.4 Implement `status`, `list`, `logs`, `start`, `stop`, and `rm` with confirmation (`--yes` required when stdin is not a TTY); verify non-TTY `rm` without `--yes` exits non-zero and deletes nothing
- [ ] 2.5 Implement `policy show|edit|apply` and `provider add|attach|list` wrappers over the `openshell` commands, with `--from-existing` secret capture that never echoes the value; verify argv capture for each wrapper in tests

## 3. Safety and diagnostics

- [ ] 3.1 Implement credential-like `--env` refusal plus the `--allow-env KEY` override; verify refusal and override scenarios in tests, including a false-positive name like `TOKENIZERS_PARALLELISM` (segment match, not substring)
- [ ] 3.2 Implement `doctor` checks (openshell CLI, gateway reachability, docker/podman, image presence, policy file, provider names) with one line per check and non-zero aggregate exit; verify with stub variants for a missing CLI, an unreachable gateway, and an all-pass state
- [ ] 3.3 Implement `image build` wrapping `docker build` (or `podman build` when configured) against `examples/maki-image/` with `MAKI_VERSION` passthrough; verify argv capture in tests and one real build when Docker is available

## 4. Fish integration

- [ ] 4.1 Create `fish/functions/maki-oss.fish` (thin exec wrapper preserving arguments and exit codes) and `fish/conf.d/maki-oss.fish`; verify `fish -n` reports no syntax errors and `fish -c 'maki-oss help'` works with the stub on `PATH`
- [ ] 4.2 Create `fish/completions/maki-oss.fish` covering all subcommands and the common flags (`--name`, `--image`, `--policy`, `--provider`, `--yes`, `--allow-env`); verify `complete -C 'maki-oss '` lists the expected subcommands in a fish session
- [ ] 4.3 Implement `maki-oss fish install|uninstall` symlink mode: idempotent, only creates/removes links pointing into this repository; verify by installing twice, checking `~/.config/fish/**` contents, and uninstalling while leaving foreign files untouched

## 5. Tests, docs, packaging

- [ ] 5.1 Create `tests/run-tests.sh` and `tests/stub/openshell`; cover every scenario in both spec files; verify the suite exits 0 locally and fails when a deliberately broken assertion is introduced
- [ ] 5.2 Verify the suite runs with no network access and no Docker (`env -i PATH=... tests/run-tests.sh` style check)
- [ ] 5.3 Write `docs/helper.md` (install, configuration reference, command reference, cookbook for init → run → collect → cleanup, fish setup) plus complete `help` text in the script; verify every documented command has a passing stub-backed test
- [ ] 5.4 Add a `Makefile` with `test`, `lint`, and `install-fish` targets; verify `make lint` runs shellcheck plus `fish -n`, and `make test` runs `tests/run-tests.sh`
- [ ] 5.5 Run `openspec validate add-maki-openshell-fish-helper --strict` and fix any reported issue
