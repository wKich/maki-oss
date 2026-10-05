# maki-openshell

Run [Maki](https://maki.sh) coding agents inside NVIDIA OpenShell sandboxes,
fully isolated from the host system. The sandbox is the security boundary:
filesystem access is confined with Landlock, egress is deny-by-default, and
model credentials never enter the sandbox — the agent sees opaque placeholders
that OpenShell's proxy resolves only at approved endpoints.

## Status

All three changes are implemented and verified — evidence in
[`docs/verification-log.md`](docs/verification-log.md) and
[`dashboard/README.md`](dashboard/README.md). OpenSpec plans live under
[`openspec/`](openspec/); accepted plans are archived under
`openspec/changes/archive/`.

The three changes:

| Change | Delivers |
|---|---|
| `add-maki-openshell-setup-guide` | Canonical setup guide, glossary, verifiable examples, AI-agent reference pack |
| `add-maki-openshell-fish-helper` | `maki-oss` helper CLI (POSIX sh) + fisher-compatible fish plugin |
| `add-openshell-bun-dashboard` | Minimal Bun web dashboard to monitor and manage OpenShell |

## Guides

- [`docs/setup-guide.md`](docs/setup-guide.md) — clean machine to a running
  sandboxed Maki, step by step.
- [`docs/verification.md`](docs/verification.md) — isolation checklist with
  exact commands and expected output.
- [`docs/glossary.md`](docs/glossary.md) — shared vocabulary for these docs.
- [`docs/ai/agent-playbook.md`](docs/ai/agent-playbook.md) — ordered,
  executable steps for a coding agent.
- [`docs/ai/references.md`](docs/ai/references.md) — curated upstream links,
  the only index of external documentation in this repository.

Canonical configuration lives under [`examples/`](examples/): the Maki image
([`examples/maki-image`](examples/maki-image)), provider profiles
([`examples/providers`](examples/providers)), and sandbox policies
([`examples/policies`](examples/policies)). The docs reference these files
instead of copying them, so verification catches drift.

## Target repo layout

```
docs/       guides, glossary, verification checklist, AI reference pack
examples/   canonical image / provider / policy configs
bin/        maki-oss helper
fish/       fish function + completions
dashboard/  Bun web dashboard
scripts/    check-links.sh
openspec/   OpenSpec specs and proposed changes
```

## Working with OpenSpec

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) configured
for OpenCode (`.opencode/`):

- `/opsx-propose "idea"` — create a change with proposal, specs, design, and tasks
- `/opsx-apply` — implement an approved change
- `openspec list`, `openspec view`, `openspec validate --all`

## Security invariants

The OpenShell sandbox is the security boundary:

- no host bind mounts — project files move in and out through upload/download;
- no secrets through `--env` — model credentials go through OpenShell provider
  profiles (placeholder + proxy substitution);
- egress stays deny-by-default — every endpoint is an explicit policy or
  provider-profile decision;
- sandbox processes run as a non-root user with a minimal filesystem policy.
