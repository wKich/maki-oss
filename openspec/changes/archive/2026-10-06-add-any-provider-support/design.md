# Design

## Context

See proposal.md — Why. This change extends `bin/maki-oss`, the canonical profiles under `examples/providers/`, the docs, and the stub-backed test suite. Constraints that shape the approach:

- The helper is POSIX sh with an awk config parser and optional `jq` (grep fallback). New code must fit that model and stay `shellcheck`-clean.
- OpenShell profiles bind credentials, endpoints, and allowed binaries; `provider create --from-existing` scans the environment variables declared by the profile's `discovery` section ([Profiles](https://docs.nvidia.com/openshell/how-it-works/providers/profiles.md)).
- Maki reads provider keys from its own environment variables (for example `OPENCODE_API_KEY` for the built-in OpenCode Go provider) and stores them host-side under `~/.local/state/maki/auth/` ([Providers](https://maki.sh/docs/providers/)).
- Tests must run without Docker, a gateway, or network access through `tests/stub/openshell`.

## Goals / Non-Goals

**Goals:**

- One command that takes any API-key credential the user already holds — from a detected store or a generic source — and produces a working, linted, imported OpenShell provider.
- Canonical, reviewable provider profiles for the common Maki providers, with a machine-readable mapping from credential-store slugs to profiles.
- Credential handling that is safe by construction: no value in argv, output, files, or shell history.
- Documentation that makes the profile mechanism the primary story instead of the two shipped examples.

**Non-Goals:**

- OAuth credentials and gateway-managed token refresh (listed and documented, not implemented).
- Writing `providers.toml` into a sandbox (the z.ai coding-plan step is printed for the user to apply).
- A general profile-authoring TUI; the custom flow collects a fixed field set.
- Changing the manual `provider add` / `provider attach` commands.

## Decisions

**Catalog as example files plus a mapping file.** Curated profiles stay one YAML per provider under `examples/providers/`, lintable as files and referenced by docs. `examples/providers/catalog.tsv` maps `store<TAB>slug<TAB>profile-id<TAB>note`, including OpenCode aliases such as `zai-coding-plan` and `zhipuai-coding-plan`. The wizard resolves credentials through this table. Alternative: embed the catalog in the script (rejected — docs would duplicate it and profiles would stop being reviewable artifacts).

**`provider setup` as a first-class helper command, interactive by default.** Prompts use `read`; hidden input uses `stty -echo` only when stdin is a TTY. Each prompt has a non-interactive flag equivalent (`--from`, `--credential`, `--file`, `--field`, `--env`, `--profile`, `--name`, `--yes`, `--attach`/`--no-attach`), matching the existing option parser. Non-TTY without a complete flag set fails before any gateway mutation, like `rm`. Alternative: a fish-only wizard (rejected — the helper is the cross-shell layer).

**Credentials move only through the child-process environment.** The wizard reads the selected value, exports it as the profile's declared discovery variable, and invokes `openshell provider create|update --from-existing`. Values are never arguments, never written to disk, and never printed; failures name the source, not the secret. `jq` is used when available; the grep fallback covers the observed single-level shapes (`api_key`, `key`) with a warning. Alternative: `--credential KEY=VALUE` (rejected — argv exposure).

**Two first-class store scanners plus generic sources.** Scanners for the Maki store (`~/.local/state/maki/auth/*.json`, `auth/plugins/*.json`) and the OpenCode store (`~/.local/share/opencode/auth.json`) read only the fields they need (`api_key`, `type`, `key`). Listings show store, slug, and auth type; OAuth entries are selectable only to print an explanation. Generic sources — JSON file + field path, host env var, hidden prompt — cover every other agent without format-specific code. Adding another agent later is one scanner plus fixtures.

**Profile resolution order: explicit file, curated catalog, generated custom.** An explicit `--profile` wins. Otherwise the catalog maps the credential to a shipped profile. Unknown providers enter a custom flow that validates the kebab-case id, environment variable name, host, and API path, then fills `examples/providers/template.yaml` into `${XDG_CONFIG_HOME:-$HOME/.config}/maki-openshell/profiles/<id>.yaml`. Generated files are never overwritten without confirmation. Every profile is linted before `profile import --global`; lint failure aborts with no gateway change. The shipped `template.yaml` is a valid, inert profile (`api.example.com`, `EXAMPLE_API_KEY`) so it lints and can be copied safely.

**Create or update, then optional attach.** The wizard checks provider names, creates when absent, offers `provider update --from-existing` when present, and — if a project sandbox exists and the user confirms — attaches with `--wait` using the existing `provider attach` path.

**`run --model` passthrough.** `cmd_run` gains a `--model` option appended to Maki's `--model`; the interactive `maki` command keeps using Maki's picker. This is the only change to existing commands.

**z.ai coding plan is shipped but completed by hand.** `maki-zai-coding.yaml` targets the coding endpoint; the wizard prints the required `[zai] plan = "coding"` line for the sandbox's Maki configuration instead of writing into the sandbox. This keeps the helper's file-transfer-only model intact.

**Documentation structure.** `docs/providers.md` owns the concept, catalog, template, and wizard reference; `docs/migrating-providers.md` owns store paths, walkthroughs, manual recipes, and the OAuth limitation. The setup guide, helper reference, agent playbook, config example, README, and glossary link to those instead of duplicating commands; `examples/providers/catalog.tsv` remains the machine-readable mapping source of truth.

**Testing through the existing stub.** `tests/stub/openshell` gains `profile lint|import|list` and `provider update`. Wizard tests run with fixture HOME directories containing Maki/OpenCode stores, piped stdin for interactive cases, and flag-driven non-interactive cases; assertions cover invocation order, create-vs-update behavior, generated profile paths, and the absence of credential values from argv, stdout, stderr, and generated files. `make lint-profiles` lints every shipped profile against a real `openshell` when available; it is not part of `make test`.

## Risks / Trade-offs

- [External store formats drift] → scanners read the minimum fields and are pinned by fixtures; unreadable shapes produce an explicit error naming the file.
- [jq absence limits file sources] → fallback handles single-level keys; the wizard warns and recommends installing jq for nested paths.
- [Credential visible in the child process environment] → inherent to OpenShell's `--from-existing` discovery flow; values are ephemeral and never persisted or logged.
- [Catalog drift with upstream Maki/OpenShell releases] → profile comments cite the Maki provider docs; `make lint-profiles` catches schema drift; `docs/ai/references.md` pins the verified versions.
- [z.ai coding plan left half-configured] → the wizard prints the `providers.toml` step and the migration guide repeats it next to the endpoint rule.
- [Generated custom profiles are user-specific] → linted before import and scoped to one endpoint, binary, and credential var; failures surface at import time.

## Migration Plan

Repository-only change; no deployed service. Existing sandboxes are unaffected: profiles join the catalog only when imported, and providers are created only when the wizard runs. Rollback is reverting the commit; user-generated profile files under the helper config directory are additive and inert without a provider. The new `provider setup` command never modifies or deletes existing providers or profiles without confirmation.

## Open Questions

None — the two open points (z.ai coding-plan handling, curated list) were resolved during design review.
