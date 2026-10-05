# Proposal

## Why

OpenShell ships no web UI. Operators monitor sandboxes with the CLI or the `openshell term` TUI, one terminal at a time. With several Maki sandboxes running in parallel, seeing which one is running, what it was denied, which policy revision loaded, and which rule proposals wait for review is slow. A minimal local dashboard shortens that loop without replacing the CLI or the TUI.

## What Changes

- Add `dashboard/`, a Bun + TypeScript app started with `bun run start` that serves a dashboard on `http://127.0.0.1:8787` (loopback only by default).
- v1 capabilities:
  - Sandbox inventory with phase, image, labels, and notes, refreshed automatically; sandbox detail with attached providers and policy source.
  - Lifecycle actions: create from configured defaults (image/policy/providers), start, stop, delete (typed confirmation).
  - Logs: live tail over Server-Sent Events from `openshell logs --tail`, with source/level filters and pause/resume.
  - Policy: read-only base and effective policy views, plus revision list and load status.
  - Rules advisor: list pending proposals; approve; reject with a required reason.
  - Status banner: `openshell` CLI presence, gateway reachability, and read-only state.
- Backend uses a CLI adapter (`Bun.spawn` with argument arrays and `--output json`) behind a small module interface so a future `@nvidia/openshell-sdk` implementation can replace it without touching routes.
- Frontend is server-rendered HTML plus vanilla JS and SSE — no framework, no bundler, no build step.
- Explicitly not in v1: authentication/multi-user, remote gateways, web terminal, agent chat, file browser, OCSF viewer.

## Capabilities

### New Capabilities
- `dashboard`: the local web dashboard's behavior — serving guarantees, inventory refresh, lifecycle actions, log streaming, policy inspection, rule-proposal review, read-only mode, and failure surfacing.

## Impact

- New files under `dashboard/` only; no changes to OpenShell, the helper, or the examples.
- Runtime requirements: Bun ≥ 1.2 (developed against 1.4), and a working `openshell` CLI with gateway credentials on the same host. The dashboard reads gateway JSON through the CLI and never reads or stores credential values.
- Reuses the same defaults as the helper by reading `~/.config/maki-openshell/config.toml` for create-time values (image, policy, providers, resources), parsed independently of the shell helper.
