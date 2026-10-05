# Proposal

## Why

The setup guide is a sequence of roughly fifteen commands with predictable footguns: sandbox naming collisions, attaching providers after Maki already started, uploading into the wrong directory, forgetting which sandbox is running, and cleanup that leaks sandboxes. Fish users also get no completion or discoverability. The safe path should be encoded once, not retyped per project.

## What Changes

- Add `bin/maki-oss`, a POSIX sh CLI wrapping the OpenShell + Maki workflow:
  - `doctor` verifies prerequisites (openshell CLI, gateway reachable, Docker, image present, configured policy/provider names resolve).
  - `image build` builds the Maki sandbox image from `examples/maki-image/`.
  - `init` / `up` create-or-start a per-project sandbox (idempotent) with configurable image, policy, providers, CPU, and memory.
  - `maki` attaches an interactive session; `run "<prompt>"` executes headless with JSON passthrough and exit-code propagation.
  - `upload` / `download` copy a project in and results out; `status`, `list`, `logs`, `start`, `stop`, `rm` manage lifecycle; `policy` and `provider` wrap the corresponding `openshell` commands.
- Configuration resolution: flags > `MAKI_OSS_*` environment > `~/.config/maki-openshell/config.toml` > defaults. The file is parsed as data and never executed.
- Add a fisher-compatible fish plugin under `fish/` (`functions/maki-oss.fish`, `completions/maki-oss.fish`, `conf.d/maki-oss.fish`) plus `maki-oss fish install|uninstall` (idempotent symlinks) for users without fisher.
- Add `tests/` with a stubbed `openshell` binary so lifecycle, config precedence, and safety behavior are tested without Docker or a gateway.

Safety behavior is part of the deliverable: refuse credential-like `--env` keys (with an explicit `--allow-env` escape hatch), never bind-mount host directories, require confirmation for destructive commands, and fail with actionable messages when OpenShell is missing.

## Capabilities

### New Capabilities
- `helper-cli`: the `maki-oss` command surface, configuration resolution, sandbox lifecycle, execution and transfer behavior, prerequisite diagnostics, and safety invariants.
- `fish-integration`: fish plugin layout, install/uninstall behavior, command resolution, and completions.

## Impact

- New files: `bin/maki-oss`, `fish/**`, `tests/**`, `examples/config.toml`, `docs/helper.md`.
- Consumes `examples/maki-image/`, `examples/providers/`, and `examples/policies/` from `add-maki-openshell-setup-guide`. Until that change is applied, tests use the stub and `image build` reports the missing example directory with a pointer.
- Development-time verification needs `shellcheck` and `fish`; runtime needs only `openshell` and Docker/Podman for image builds (`jq` optional for structured parsing).
