# Proposal

## Why

The guide and helper currently demonstrate only Anthropic and OpenRouter, both fed through a hand-typed `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`. Users arriving from Maki or OpenCode already hold working provider credentials in local credential stores, and forcing them to re-obtain or re-type a key pushes secrets through shell history and makes the common case awkward. The profile mechanism itself is provider-agnostic — OpenShell binds credentials to endpoints regardless of vendor ([Profiles](https://docs.nvidia.com/openshell/how-it-works/providers/profiles.md)) — but the project only documents it through two examples, so "use any provider" is invisible and manual.

## What Changes

- Add `maki-oss provider setup`: an interactive wizard that scans local credential stores (Maki, OpenCode), resolves or generates the matching OpenShell provider profile, lints and imports it, creates or updates the gateway provider, and optionally attaches it to the project sandbox — without ever printing a credential value, placing one in argv or shell history, or writing one to disk.
- Add generic credential sources for anything not covered by a store scanner: JSON file + field path, host environment variable, or hidden interactive prompt.
- Ship a curated set of canonical provider profiles under `examples/providers/` (deepseek, synthetic, openai, google, mistral, xai, zai, zai-coding, opencode, opencode-go — plus the existing anthropic and openrouter), a store-slug → profile mapping file, and a valid inert `template.yaml` for custom providers. `maki-oss provider setup` also generates custom profiles from user-entered values into the helper's config directory.
- Add `maki-oss run --model <provider/model>` passthrough so any credentialed provider can be selected headless.
- Add `docs/providers.md` (any-provider guide, catalog, template, wizard reference) and `docs/migrating-providers.md` (per-agent store paths, wizard walkthrough, manual recipes, OAuth limitation); update the setup guide, helper reference, agent playbook, config example, README, and glossary to stop being Anthropic/OpenRouter-specific.
- List OAuth-based credentials found in stores as explicitly unsupported in this change, with documented guidance; API-key credentials are the supported path.
- Extend the stub-backed test suite for store scanning, wizard flows, generated profiles, and credential non-exposure; add a `make lint-profiles` target that lints every example profile with the real `openshell` CLI.

## Capabilities

### New Capabilities

None — the change extends existing helper and fish behavior; documentation is a deliverable, not a spec-level capability.

### Modified Capabilities

- `helper-cli`: adds requirements for the provider setup wizard, credential-store scanning and generic credential sources, profile resolution/import/generation, create-or-update provider flows, and `run --model`; extends the secret-hygiene requirement to cover store-sourced credentials.
- `fish-integration`: the completion list gains the `provider setup` subcommand and its flags.

## Impact

- `bin/maki-oss`: new `provider setup` command, sourcing helpers, profile handling; `run` option addition.
- `examples/providers/`: 10 new curated profiles, `catalog.tsv`, `template.yaml`; `examples/config.toml` comment update.
- `tests/`: `tests/stub/openshell` gains `profile` handling; `tests/run-tests.sh` gains wizard/store tests; `Makefile` gains `lint-profiles`.
- `fish/completions/maki-oss.fish`: new completions.
- `docs/`: two new guides plus updates to `setup-guide.md`, `helper.md`, `ai/agent-playbook.md`, `glossary.md`; `README.md` guide list and status.
- Security posture is unchanged: credentials stay gateway-side, the sandbox still receives placeholders only, egress stays deny-by-default, and no host bind mounts are introduced.
