# Proposal

## Why

Running Maki inside an OpenShell sandbox requires combining two moving documentation sets (NVIDIA OpenShell, maki.sh) with undocumented glue: image layout, provider binary paths, placeholder-friendly auth, headless folder trust. Without one canonical guide, every setup attempt rediscovers the same decisions and drifts toward insecure defaults — host bind mounts, secrets passed through `--env`, root identities, and wide-open egress. The result is neither reproducible nor reviewable.

## What Changes

- Add `docs/setup-guide.md`: the single path from a clean macOS/Apple-Silicon machine to a running sandboxed Maki — prerequisites (Docker Desktop settings, OpenShell install), Maki image build, model access via provider profiles, sandbox policy, run workflows, isolation verification, troubleshooting, and next steps.
- Add `docs/glossary.md`: shared terms (gateway, sandbox, supervisor, base/effective policy, provider, profile, credential placeholder, Landlock, seccomp, OCSF, policy advisor, policy prover, workspace, template) so docs and later tooling use one vocabulary.
- Add `examples/` as the canonical, lintable configuration set:
  - `examples/maki-image/Dockerfile` plus baked Maki config (`config/init.lua`, `config/permissions.toml`),
  - `examples/providers/maki-anthropic.yaml`, `examples/providers/maki-openrouter.yaml`,
  - `examples/policies/maki-minimal.yaml`, `examples/policies/maki-git-push.yaml`.
- Add `docs/ai/references.md`: the only place external URLs live, with `.md`-suffixed OpenShell URLs, Maki docs, and the OpenShell docs MCP endpoint, each with a "verified against" version.
- Add `docs/ai/agent-playbook.md`: ordered, executable steps for a coding agent (exact commands, decision points, verification after each phase) and a root `AGENTS.md` pointer to it.
- Add `docs/verification.md`: the isolation checklist with exact commands and expected output.
- Add `scripts/check-links.sh` to detect link rot in `docs/`.

No runtime behavior changes: this change ships documentation and example configuration only.

## Capabilities

None. This is a docs-and-examples change with no observable system behavior; `.openspec.yaml` sets `skip_specs: true`.

## Impact

- New files only: `docs/`, `examples/`, `scripts/check-links.sh`, root `AGENTS.md` and `README.md`.
- `examples/` becomes the canonical configuration source consumed by the later helper (`add-maki-openshell-fish-helper`) and dashboard (`add-openshell-bun-dashboard`) changes.
- End-to-end verification requires Docker Desktop plus a running OpenShell gateway; where absent, the affected verification task records the limitation in `docs/verification-log.md`.
