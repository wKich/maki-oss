# AI reference pack: external sources

Curated upstream documentation for running Maki inside NVIDIA OpenShell
sandboxes. This is the only index of external documentation links in this
repository, so `scripts/check-links.sh` can keep link rot in one place.

**Verified against OpenShell v0.1.2 and Maki v0.6.0 on 2026-10-05.** Maki
`v0.6.0` is pinned in `examples/maki-image/Dockerfile`; re-verify the links and
version notes after either project publishes a release.

How to use this pack:

- `docs/ai/agent-playbook.md` is the executable path — exact commands in order.
- This file is the lookup table when a command fails or a concept is unclear.
- `docs/glossary.md` defines the shared vocabulary once.

## NVIDIA OpenShell

| Topic | Link | Verified against |
|---|---|---|
| Overview: isolation model, threat controls, protection layers | [OpenShell overview](https://docs.nvidia.com/openshell/about/overview.md) | v0.1.2 |
| Architecture: gateway, supervisor, sandbox boundary, network namespace | [Architecture](https://docs.nvidia.com/openshell/about/architecture.md) | v0.1.2 |
| Installation: CLI, policy prover, local gateway | [Installation](https://docs.nvidia.com/openshell/about/installation.md) | v0.1.2 |
| Support matrix: host platforms and Landlock / seccomp kernel requirements | [Support matrix](https://docs.nvidia.com/openshell/about/support-matrix.md) | v0.1.2 |
| Run your first agent: provider, image, policy workflow | [Run your first agent](https://docs.nvidia.com/openshell/about/run-your-first-agent.md) | v0.1.2 |
| Gateways: register, select, and inspect the gateway | [Manage gateways](https://docs.nvidia.com/openshell/how-it-works/gateways/overview.md) | v0.1.2 |
| Workspaces: resource scoping and roles | [Workspaces](https://docs.nvidia.com/openshell/how-it-works/workspaces.md) | v0.1.2 |
| Sandboxes: create, exec, upload/download, lifecycle | [Manage sandboxes](https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md) | v0.1.2 |
| Sandbox templates: reusable workload settings | [Sandbox templates](https://docs.nvidia.com/openshell/how-it-works/sandboxes/templates.md) | v0.1.2 |
| Providers: credential placeholders and attachment | [Providers](https://docs.nvidia.com/openshell/how-it-works/providers/overview.md) | v0.1.2 |
| Profiles: credential, endpoint, and binary definitions | [Profiles](https://docs.nvidia.com/openshell/how-it-works/providers/profiles.md) | v0.1.2 |
| Policies: base policy vs effective policy, source order | [Sandbox policies](https://docs.nvidia.com/openshell/how-it-works/policies/overview.md) | v0.1.2 |
| Network rules: binary matching, L7 inspection, common service examples | [Network rules](https://docs.nvidia.com/openshell/how-it-works/policies/network-rules.md) | v0.1.2 |
| Policy schema: every field, default, and constraint | [Policy schema reference](https://docs.nvidia.com/openshell/how-it-works/policies/schema.md) | v0.1.2 |
| Default policy: fallback policy and baseline filesystem paths | [Default policy](https://docs.nvidia.com/openshell/how-it-works/policies/default-policy.md) | v0.1.2 |
| Policy advisor: agent-proposed network rules | [Policy advisor](https://docs.nvidia.com/openshell/how-it-works/policies/advisor.md) | v0.1.2 |
| Policy prover: boundary checks with `openshell-prover` | [Policy prover](https://docs.nvidia.com/openshell/how-it-works/policies/prover.md) | v0.1.2 |
| Sandbox upload / download: gitignore filtering, symlink handling | [Manage sandboxes](https://docs.nvidia.com/openshell/how-it-works/sandboxes/overview.md) | v0.1.2 |
| Inference: attach model providers and call native endpoints | [Inference](https://docs.nvidia.com/openshell/how-it-works/inference.md) | v0.1.2 |
| Security best practices: Landlock, seccomp, network namespace, credentials | [Security best practices](https://docs.nvidia.com/openshell/security/best-practices.md) | v0.1.2 |
| Accessing logs: CLI, TUI, OCSF events, denial lines | [Accessing logs](https://docs.nvidia.com/openshell/observability/accessing-logs.md) | v0.1.2 |
| OCSF JSON export: structured logging for SIEMs | [OCSF JSON export](https://docs.nvidia.com/openshell/observability/ocsf-json-export.md) | v0.1.2 |
| Python SDK | [Python SDK](https://docs.nvidia.com/openshell/sdk/python.md) | v0.1.2 |
| TypeScript SDK | [TypeScript SDK](https://docs.nvidia.com/openshell/sdk/typescript.md) | v0.1.2 |
| Go SDK | [Go SDK](https://docs.nvidia.com/openshell/sdk/go.md) | v0.1.2 |
| Rust SDK | [Rust SDK](https://docs.nvidia.com/openshell/sdk/rust.md) | v0.1.2 |
| Docs MCP endpoint for AI clients (no `.md` variant; answers GET, not HEAD) | [OpenShell docs MCP server](https://docs.nvidia.com/openshell/_mcp/server) | v0.1.2 |
| Install script used by the setup guide | [OpenShell install.sh](https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh) | v0.1.2 |
| Source repository | [NVIDIA/OpenShell](https://github.com/NVIDIA/OpenShell) | v0.1.2 |

**Verification baseline — `maki-oss policy review` was built against OpenShell
v0.1.2**, where `openshell rule get` emits human-readable text only and has no
JSON output mode. The helper therefore parses `Chunk:` lines from that text to
count pending proposals; the `policy review` command itself is a plain
passthrough, so its displayed output never depends on the parser. Upstream docs
may describe newer behavior (JSON output, other fields); when the gateway floor
rises, swap the text parse for JSON without changing behavior.

## Maki

| Topic | Link | Verified against |
|---|---|---|
| Docs index | [Maki docs](https://maki.sh/docs/) | v0.6.0 |
| Quick start: install, connect a provider, first session | [Quick start](https://maki.sh/docs/quick-start/) | v0.6.0 |
| Configuration: `init.lua`, `always_yolo`, trust policy, directory layout | [Configuration](https://maki.sh/docs/configuration/) | v0.6.0 |
| Providers: env vars, base URLs, `providers.toml` | [Providers](https://maki.sh/docs/providers/) | v0.6.0 |
| Headless mode: `--print`, output formats, sessions | [Headless mode](https://maki.sh/docs/headless/) | v0.6.0 |
| Folder trust: gated project files and trust policy | [Folder trust](https://maki.sh/docs/folder-trust/) | v0.6.0 |
| Permissions: rule layers, YOLO mode, deny rules | [Permissions](https://maki.sh/docs/permissions/) | v0.6.0 |
| CLI: flags, subcommands, run paths | [CLI](https://maki.sh/docs/cli/) | v0.6.0 |
| Install script | [Maki install.sh](https://maki.sh/install.sh) | v0.6.0 |
| Source repository | [tontinton/maki](https://github.com/tontinton/maki) | v0.6.0 |

## Ponytail (project-local YAGNI ruleset)

Used by `docs/yagni.md`; installed via the project-scoped `opencode.json`
plugin pin and the vendored `.maki/skills/ponytail*/` copies.

| Topic | Link | Verified against |
|---|---|---|
| OpenCode plugin configuration (`plugins` key, project scope) | [OpenCode plugins](https://opencode.ai/v2/docs/plugins) | v2.0.21 |
| OpenCode plugin API (`{ id, setup }`, skill/command transforms) | [Building plugins](https://opencode.ai/v2/docs/build/plugins) | v2.0.21 |
| Ponytail install notes for OpenCode | [Ponytail INSTALL.md](https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md) | v5.3.2 |
| Ponytail source repository | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | v5.3.2 |
