# Glossary

Shared vocabulary for the maki-openshell docs. Each term has one definition;
the same words are used consistently in `docs/`, `examples/`, and the AI
reference pack.

- **Gateway** — the OpenShell control plane that runs on a host or cluster and
  manages sandboxes, policies, providers, and access.
- **Sandbox** — the isolated workload environment (Docker container or MicroVM)
  that OpenShell creates to run an agent such as Maki.
- **Supervisor** — the OpenShell runtime process that starts and watches the
  sandbox workload, mediates DNS and TCP, and enforces policy at the boundary.
- **Base policy** — the sandbox's own policy, before attached providers
  contribute any rules.
- **Effective policy** — the base policy plus the rules contributed by attached
  providers; the policy the sandbox actually enforces.
- **Provider** — a gateway-stored credential instance created from a profile
  and attached to sandboxes (for example, `maki-anthropic`).
- **Profile** — a reusable provider definition naming credentials, network
  endpoints, allowed binaries, and optional refresh behavior (for example,
  `examples/providers/maki-anthropic.yaml`).
- **Generated profile** — a custom provider profile written by
  `maki-oss provider setup` under the helper's config directory
  (`~/.config/maki-openshell/profiles/`); it contains configuration only,
  never a credential value.
- **Catalog mapping** — `examples/providers/catalog.tsv`, the machine-readable
  table that resolves a credential-store slug (`maki`/`opencode` plus the
  provider id) to a curated profile id.
- **Credential store** — a host-side file where an agent keeps its own
  provider credentials, such as Maki's
  (`~/.local/state/maki/auth/<slug>.json`) or OpenCode's
  (`~/.local/share/opencode/auth.json`); the setup wizard scans these without
  printing values.
- **Credential placeholder** — the opaque `openshell:resolve:env:<KEY>` value a
  sandbox process receives instead of a real secret; the proxy substitutes the
  real value only at endpoints the profile authorizes.
- **Landlock** — the Linux security module OpenShell uses to confine sandbox
  processes to the filesystem paths the policy lists; it requires Landlock ABI
  v3 (Linux 6.2 or newer).
- **seccomp** — the syscall filter OpenShell applies to sandbox processes to
  block escape, observation, and filter-evasion primitives such as `mount` and
  `ptrace`.
- **Network namespace** — the isolated Linux networking stack each sandbox gets,
  which forces every outbound connection through OpenShell's proxy.
- **OCSF** — Open Cybersecurity Schema Framework, the structured event format
  OpenShell uses for its policy and activity log lines.
- **Policy advisor** — the optional OpenShell feature that turns denied
  requests into reviewable network-rule proposals through the in-sandbox
  `policy.local` API.
- **Policy prover** — OpenShell's SMT-solver check (`openshell-prover`) that a
  candidate policy grants no more access than a boundary policy.
- **Workspace** — an OpenShell scoping unit for resources such as providers and
  profiles; a local single-user gateway uses the `default` workspace.
- **Template** — a reusable sandbox workload definition (image, resources,
  settings) that `openshell sandbox create --template` can instantiate.
