# Design

## Context

See proposal.md — Why. OpenShell's available interfaces today: CLI (`--output json`), TUI (`openshell term`), SDKs (Python/TypeScript/Go/Rust), and OCSF export. The TypeScript SDK is distributed via GitHub Packages and needs registry authentication; the CLI is already installed and authenticated on any machine running a gateway. Bun (1.4.2 locally) provides both an HTTP server and a process spawner with no extra dependencies.

## Goals / Non-Goals

**Goals:**
- Start with one command from the repo: no build step, no database, no daemon.
- Accurate state by delegating to the CLI, never reimplementing gateway logic.
- Safe by default on a developer laptop.
- Testable without a gateway via a stub CLI, mirroring the helper's test strategy.

**Non-Goals:**
- Replacing `openshell term` or the CLI; no attempt at command parity.
- Authentication, TLS, or non-loopback exposure in v1.
- Editing policy YAML in the browser (view-only in v1; edits stay file-based).

## Decisions

**CLI adapter over SDK for v1.** `dashboard/src/openshell.ts` exposes `listSandboxes()`, `getSandbox()`, `sandboxAction()`, `policyGet()`, `logs(args)`, `rules(args)`, and `doctor()`; each spawns `openshell` with an argv array (no shell) and parses JSON. Swapping in the SDK later touches only this module. Alternative: TypeScript SDK (rejected for v1: GitHub Packages auth adds setup friction to a local tool).

**SSE for logs, polling for lists.** Log streaming is one-way and long-lived → SSE with a bounded in-memory ring buffer (2,000 lines) and child-process cleanup on disconnect. Inventory and detail poll every 3 seconds — simple and robust to gateway restarts. Alternative: WebSocket (rejected: bidirectional is not needed); SSE everywhere (rejected: reconnection bookkeeping with no benefit).

**Server-rendered HTML + vanilla JS.** `Bun.serve` routes: `/`, `/api/*`, `/events/logs`. Rendering goes through a single `escapeHtml` helper; no framework or bundler. Alternative: React/Vite (rejected: a build step and dependencies for five views).

**Mutations enabled on loopback with a session token; `--read-only` disables.** At startup the server mints a random token, embeds it in the served page, and requires it as a header on mutating routes (which also blocks cross-site form posts). `--host` other than loopback requires an explicit `--token` and prints a warning. Alternative: read-only by default (rejected: "manage" is a stated goal, and loopback plus token is adequate for a local tool).

**Destructive actions are two-step.** Delete requires typing the exact sandbox name; start/stop re-render from the gateway response (no optimistic UI). Alternative: `confirm()` only (rejected: too easy to click through).

**Config: read the helper's `config.toml` fields relevant to creation** (image, policy, providers, cpu, memory), overridden by `DASHBOARD_PORT`, `DASHBOARD_HOST`, and `DASHBOARD_READ_ONLY`. Parsed independently; the dashboard must not depend on the shell helper. Alternative: dashboard-only config (rejected: divergent defaults across tools).

## Risks / Trade-offs

- [`openshell` output changes] → adapter tests pin consumed JSON shapes; CLI version shown in the banner; failures render as error panels, not crashes.
- [Log child processes leak on disconnect] → kill the spawned process on SSE `close` and on server shutdown; covered by a test with a long-lived stub.
- [Long streams grow memory] → ring buffer plus client-side pause; only the last N lines replay on connect.
- [Loopback service reachable by other local processes] → documented threat model in `dashboard/README.md`; token gate and read-only mode as mitigations; the dashboard exposes no secrets.
