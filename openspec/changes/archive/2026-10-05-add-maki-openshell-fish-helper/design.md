# Design

## Context

See proposal.md — Why. OpenShell CLI JSON output (`--output json`) is the interface to the gateway; the helper is a thin workflow layer over it. The setup-guide change owns `examples/`; this change consumes those paths. The dashboard change is independent and does not import the helper.

## Goals / Non-Goals

**Goals:**
- Idempotent lifecycle: running `up` twice never creates two sandboxes.
- Safe defaults (no bind mounts, no plaintext secrets, confirmation for deletion) with per-invocation overrides.
- Testable without Docker, a gateway, or network access, via a stub CLI on `PATH`.

**Non-Goals:**
- Replacing the `openshell` CLI or handling multiple gateways beyond passing `--gateway` through.
- A TUI or a daemon.
- Reimplementing policy authoring; `policy edit` opens `$EDITOR` and delegates validation to OpenShell.

## Decisions

**POSIX sh core, fish wrapper.** The core runs everywhere and is `shellcheck`-able; fish gets a thin exec wrapper plus completions rather than a reimplementation. Alternative: pure fish (rejected: excludes bash/zsh users); Python (rejected: heavier host dependency).

**Config file is `config.toml`, parsed read-only.** A small awk parser accepts `key = "value"`, comments, and blank lines; unknown keys are hard errors; the file is never sourced, so a config cannot execute code. Precedence: flag > `MAKI_OSS_<KEY>` env > config > defaults. Alternative: sourceable `config.env` (rejected: executes user code); JSON + jq (rejected: jq is optional, not required).

**One sandbox per project, named `maki-<repo-dir>` by default.** State is derived from `openshell sandbox list --output json` on every invocation, never cached in local files. Alternative: local state file (rejected: drifts from the gateway).

**Secret hygiene is enforced, not documented.** `--env KEY=VALUE` is refused when KEY contains a credential-like underscore-separated segment (`TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `API_KEY`, `ACCESS_KEY`, `SECRET_KEY`), matching OpenShell's own heuristic, with a pointer to `maki-oss provider add`. `--allow-env KEY` is the single-key escape hatch. Alternative: warning only (rejected: footgun).

**jq optional, graceful degradation.** Structured parsing uses `jq` when present; otherwise the helper falls back to grep-based field extraction for the few values it needs and `doctor` warns. Alternative: require jq (rejected: extra dependency for a convenience tool).

**Tests stub `openshell`.** `tests/run-tests.sh` places `tests/stub/openshell` earlier in `PATH`; the stub records argv to a file and returns canned JSON per subcommand. Assertions cover config precedence, create-or-start idempotence, secret refusal, `--yes` gating, and the no-mount guarantee. Alternative: bats (rejected: adds a test-framework dependency; plain sh keeps `make test` self-contained).

## Risks / Trade-offs

- [OpenShell CLI JSON schema drift] → parsing centralized in one `_json_get` helper covered by stub tests; `doctor` reports the CLI version.
- [Fish plugin lives in a subdirectory of a multi-tool repo] → document `fisher install ./fish` and provide `maki-oss fish install` symlink fallback; test with `fish -n` and a smoke invocation.
- [`--env` heuristic false positives] → error text explains the heuristic and shows `--allow-env KEY`; covered by a test.

## Migration Plan

Not applicable — new tooling. Removal is `maki-oss fish uninstall` plus deleting `bin/maki-oss`; no host state beyond `~/.config/maki-openshell/`.
