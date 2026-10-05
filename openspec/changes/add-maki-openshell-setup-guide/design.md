# Design

## Context

See proposal.md — Why. Two upstream sources drive content: NVIDIA OpenShell docs (v0.1.x: gateway/sandbox/policy/provider model, kernel-level isolation) and Maki docs (maki.sh: install, providers, headless mode, folder trust, permissions). The guide must be reproducible on macOS/Apple Silicon with Docker Desktop while flagging Linux and MicroVM differences. Later changes consume `examples/` as fixtures, so its paths are a de facto interface.

## Goals / Non-Goals

**Goals:**
- One canonical setup path with copy-pasteable commands and pinned versions where drift hurts.
- Examples that are directly verifiable with `docker build`, `openshell profile lint`, and YAML parsing.
- An AI-readable reference pack an agent can follow without re-researching upstream docs.

**Non-Goals:**
- Installing OpenShell or Maki for the user.
- Windows/WSL, Kubernetes, or GPU setups.
- Providers other than Anthropic and OpenRouter (the profile pattern is documented so others can be added).
- Automating the workflow (that is `add-maki-openshell-fish-helper`).

## Decisions

**Docs in `docs/`, configs in `examples/`, one canonical copy each.** The guide references example paths instead of inlining duplicate YAML; drift is caught when later changes consume the examples. Alternative: inline snippets in the guide (rejected: two sources of truth).

**Pin the Maki version via a Dockerfile `ARG MAKI_VERSION`; state "verified against OpenShell v0.1.2".** Reproducibility matters more than tracking latest for a setup guide. Alternative: always-latest (rejected: nondeterministic builds).

**Encode provider plumbing rules in the guide, not as reader assumptions:** no `--env` secrets; no `*_BASE_URL` overrides (they make credentials endpointless and the placeholder will not resolve); provider `binaries` must match the real Maki path, found with `readlink -f` inside the image.

**AI pack structure:** `docs/ai/references.md` is the only file containing external URLs; `docs/ai/agent-playbook.md` is ordered and executable; root `AGENTS.md` points to both. Alternative: links spread through all docs (rejected: link rot scattered, harder to re-verify).

**Glossary separate from the guide** so later tooling and specs can reference stable term anchors. Alternative: guide appendix (rejected: reuse and discoverability).

**Isolation claims are paired with a verification command.** Every isolation statement in the guide links to the corresponding check in `docs/verification.md`; claims without a check are removed.

## Risks / Trade-offs

- [Upstream docs drift] → all external URLs live in one index with a "verified against" version; `scripts/check-links.sh` detects rot.
- [Examples rot when OpenShell schema changes] → verification tasks run `openshell profile lint` and policy parsing; later changes consume the same files.
- [Guide verified only on macOS Apple Silicon] → platform differences called out inline where commands diverge (build engine, MicroVM driver); a task records what was not verified.

## Migration Plan

Not applicable — additive documentation only.
