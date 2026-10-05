# maki-openshell

Run Maki coding agents inside NVIDIA OpenShell sandboxes, fully isolated from the host system.

## Status

Planning. Three OpenSpec changes are proposed under `openspec/changes/`:

| Change | Delivers |
|---|---|
| `add-maki-openshell-setup-guide` | Canonical setup guide, glossary, verifiable examples, AI-agent reference pack |
| `add-maki-openshell-fish-helper` | `maki-oss` helper CLI (POSIX sh) + fisher-compatible fish plugin |
| `add-openshell-bun-dashboard` | Minimal Bun web dashboard to monitor and manage OpenShell |

## Target repo layout

```
docs/       guides, glossary, verification checklist, AI reference pack
examples/   canonical image / provider / policy configs
bin/        maki-oss helper
fish/       fish function + completions
dashboard/  Bun web dashboard
openspec/   OpenSpec specs and proposed changes
```

## Working with OpenSpec

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) configured for OpenCode (`.opencode/`):

- `/opsx-propose "idea"` — create a change with proposal, specs, design, and tasks
- `/opsx-apply` — implement an approved change
- `openspec list`, `openspec view`, `openspec validate --all`

## Security invariants

The OpenShell sandbox is the security boundary:

- no host bind mounts — project files move in and out through upload/download;
- no secrets through `--env` — model credentials go through OpenShell provider profiles (placeholder + proxy substitution);
- egress stays deny-by-default — every endpoint is an explicit policy decision;
- sandbox processes run as a non-root user with a minimal filesystem policy.
