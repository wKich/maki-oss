# maki-oss

**Your AI coding agent, locked in a sandbox.**

Run [Maki](https://maki.sh) coding agents inside NVIDIA OpenShell sandboxes —
fully isolated from your machine. The agent gets a real shell, your project
files, and nothing else: filesystem access is confined with Landlock, egress is
deny-by-default, and your model credentials never enter the sandbox. The agent
sees opaque placeholders that OpenShell's proxy resolves only at approved
endpoints.

One command. From anywhere:

```sh
maki-oss provider setup        # once per machine: wizard for any provider
cd ~/code/myproject
maki-oss                       # ensure the sandbox, run Maki, sync back
```

That's it. Bare `maki-oss` creates or reuses the project's sandbox, uploads the
project on first create, attaches remembered providers, launches Maki, and
downloads every change back into your project directory on exit.
`maki-oss run "<prompt>"` is the headless variant, and
`maki-oss --continue` / `maki-oss --resume <ID>` pick up where the last
session left off. Full reference: [`docs/helper.md`](docs/helper.md).

## Why?

Because giving an AI agent full run of your laptop is a bad idea, and running
sandboxes by hand is a chore. maki-oss gives you:

- 🔒 **Real isolation** — Landlock-confined filesystem, non-root sandbox user,
  deny-by-default egress. Break-ins stay inside the box.
- 🔑 **Zero credential exposure** — keys live in OpenShell provider profiles
  on the host; the sandbox only ever sees placeholders.
- 🧩 **Any provider** — a `provider setup` wizard plus a curated profile
  catalog, with a migration guide for keys currently stored in Maki or
  OpenCode.
- 🔄 **Seamless file sync** — upload on create, download on exit. Your project
  directory stays the source of truth.
- 🐟 **Fish-native** — a fisher-compatible plugin with completions, plus a
  plain POSIX `sh` helper for everyone else.
- 📊 **Dashboard** — a minimal [Bun](https://bun.sh) web UI to monitor and
  manage your OpenShell sandboxes.

## Status

All five changes are implemented and verified — evidence in
[`docs/verification-log.md`](docs/verification-log.md) and
[`dashboard/README.md`](dashboard/README.md). OpenSpec plans live under
[`openspec/`](openspec/); accepted plans are archived under
`openspec/changes/archive/`.

| Change | Delivers |
|---|---|
| `add-maki-openshell-setup-guide` | Canonical setup guide, glossary, verifiable examples, AI-agent reference pack |
| `add-maki-openshell-fish-helper` | `maki-oss` helper CLI (POSIX sh) + fisher-compatible fish plugin |
| `add-openshell-bun-dashboard` | Minimal Bun web dashboard to monitor and manage OpenShell |
| `add-any-provider-support` | `provider setup` wizard, curated profile catalog, credential-store migration guide |
| `add-one-command-session` | Bare `maki-oss` session: ensure sandbox, upload on create, sync back on exit, provider/model memory |

## Guides

- [`docs/setup-guide.md`](docs/setup-guide.md) — clean machine to a running
  sandboxed Maki, step by step.
- [`docs/providers.md`](docs/providers.md) — any-provider catalog, the
  `provider setup` wizard, and custom profiles.
- [`docs/migrating-providers.md`](docs/migrating-providers.md) — move keys out
  of Maki and OpenCode stores, and the OAuth limitation.
- [`docs/dogfood-migration.md`](docs/dogfood-migration.md) — the audit →
  migrate → verify loop run against a real host, and how to re-sync after a
  key rotates.
- [`docs/verification.md`](docs/verification.md) — isolation checklist with
  exact commands and expected output.
- [`docs/glossary.md`](docs/glossary.md) — shared vocabulary for these docs.
- [`docs/yagni.md`](docs/yagni.md) — project-local ponytail YAGNI ruleset:
  install, verify, and refresh the pinned plugin and skill copies.
- [`docs/ai/agent-playbook.md`](docs/ai/agent-playbook.md) — ordered,
  executable steps for a coding agent.
- [`docs/ai/host-playbook.md`](docs/ai/host-playbook.md) — agent-executable
  host setup: bare machine to a daily-driver `maki-oss`.
- [`docs/ai/references.md`](docs/ai/references.md) — curated upstream links,
  the only index of external documentation in this repository.

Canonical configuration lives under [`examples/`](examples/): the Maki image
([`examples/maki-image`](examples/maki-image)), provider profiles
([`examples/providers`](examples/providers)), and sandbox policies
([`examples/policies`](examples/policies)). The docs reference these files
instead of copying them, so verification catches drift.

## Repo layout

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
