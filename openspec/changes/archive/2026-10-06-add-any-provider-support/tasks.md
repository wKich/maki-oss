# Tasks

## 1. Provider profiles and catalog

- [x] 1.1 Add the ten curated profiles (`maki-deepseek`, `maki-synthetic`, `maki-openai`, `maki-google`, `maki-mistral`, `maki-xai`, `maki-zai`, `maki-zai-coding`, `maki-opencode`, `maki-opencode-go`) under `examples/providers/` following the existing header-comment and schema conventions, and verify each with `openshell profile lint -f <file>`
- [x] 1.2 Add `examples/providers/template.yaml` as a valid inert profile (`api.example.com`, `EXAMPLE_API_KEY`, `kebab-case` id and placeholder comments) and verify it lints cleanly
- [x] 1.3 Add `examples/providers/catalog.tsv` mapping `store<TAB>slug<TAB>profile-id<TAB>note` (including `opencode:zai-coding-plan` and `maki:zhipuai-coding-plan`) and verify every referenced profile file exists
- [x] 1.4 Add a `lint-profiles` Makefile target that runs `openshell profile lint` over `examples/providers/*.yaml` and skips with a clear message when the CLI is absent; verify `make lint-profiles` exits 0 on this machine

## 2. Credential sources

- [x] 2.1 Implement Maki and OpenCode store scanners in `bin/maki-oss` that emit `store`, `slug`, and auth type only, mark OAuth entries unsupported, and never read values into output; verify with stub-backed scanner tests over fixture HOME directories
- [x] 2.2 Implement the generic sources (JSON file + field path with jq and single-level fallback, host environment variable, hidden prompt with `stty -echo` only on a TTY); verify with tests for the file and env paths and a manual check of the prompt path

## 3. Profile resolution and generation

- [x] 3.1 Implement resolution order (`--profile` file, catalog mapping, custom generation) and custom-profile generation with id/env/host/path validation into `${XDG_CONFIG_HOME:-$HOME/.config}/maki-openshell/profiles/`, never overwriting without confirmation; verify with tests for each branch plus invalid input
- [x] 3.2 Implement lint-before-import (`openshell profile lint` then `profile import --global`) and abort with no gateway mutation on lint failure; verify by test with a stub that fails lint and assert no import is recorded

## 4. Provider setup wizard

- [x] 4.1 Wire `provider setup` into the command dispatch and usage text with the interactive prompt flow and the non-interactive flags (`--from`, `--credential`, `--file`, `--field`, `--env`, `--profile`, `--name`, `--attach`/`--no-attach`, `--yes`), including the non-TTY refusal before any gateway mutation; verify with scripted-stdin tests and a non-TTY test asserting no `profile`/`provider` invocation is logged
- [x] 4.2 Implement create-or-update (`provider create` when absent, offer `provider update --from-existing` when present) and optional `sandbox provider attach --wait`; verify with stub tests asserting the recorded argv for each branch
- [x] 4.3 Confirm credential values are only ever placed in the child environment (never argv, stdout, stderr, or generated files) and verify with a test that greps stub log, stdout, stderr, and generated profile output for the fixture value

## 5. Headless model selection

- [x] 5.1 Add `--model` to `maki-oss run` and pass it through to Maki's `--model`; verify with a stub test asserting the model id appears in the `sandbox exec` argv

## 6. Test infrastructure

- [x] 6.1 Extend `tests/stub/openshell` with `profile lint|import|list` and `provider update` behavior (configurable lint failure and provider list names) while preserving existing stub knobs; verify `make test` still passes before adding new cases
- [x] 6.2 Add fixture credential stores to `tests/run-tests.sh` (Maki built-in, Maki plugin, OpenCode api, OpenCode oauth) and an interactive runner that feeds scripted stdin; verify the new wizard and scanner tests pass
- [x] 6.3 Add a test that selecting an OAuth-listed credential exits non-zero with guidance and records no `provider create`/`provider update` invocation

## 7. Fish integration

- [x] 7.1 Add `setup` completion under `provider` and the new flags (`--model`, `--from`, `--credential`, `--profile`) to `fish/completions/maki-oss.fish`; verify with `fish -n` and a completion smoke test in the existing fish test cases

## 8. Documentation

- [x] 8.1 Write `docs/providers.md` covering the profile/provider/placeholder model, the curated catalog table, wizard usage, the custom-profile flow with `template.yaml`, verification commands, and troubleshooting; verify every command in it against the implemented helper and link the Maki provider docs
- [x] 8.2 Write `docs/migrating-providers.md` covering supported stores and paths, the wizard walkthrough, manual `jq → one-shot env → provider add --from-existing` recipes, the OAuth limitation with guidance, and security rationale; verify commands against a fixture store
- [x] 8.3 Update `docs/setup-guide.md` (§4 provider section, §10 links), `docs/helper.md` (wizard, `--model`, exit codes), `docs/ai/agent-playbook.md` (provider decision point), `examples/config.toml` (provider comment), `README.md` (guides and status), and `docs/glossary.md` (terms if missing); verify no page still implies Anthropic/OpenRouter are the only options
- [x] 8.4 Record the real-gateway dry run of the wizard (Maki `opencode-go` migration) in `docs/verification-log.md`; verify the recorded commands match the shipped interface and the log names what was and was not exercised

## 9. End-to-end verification

- [x] 9.1 Run `make test`, `make lint`, `fish -n fish/completions/maki-oss.fish`, and `openspec validate add-any-provider-support --strict`; confirm all pass
- [x] 9.2 Manually exercise `maki-oss provider setup --from maki --credential opencode-go --yes` on this machine up to (but not including) attaching to a sandbox, then delete the created provider; verify the gateway provider list returns to its prior state and no secret appears in the terminal transcript
