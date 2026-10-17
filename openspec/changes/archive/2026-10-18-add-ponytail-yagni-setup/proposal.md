# Proposal

## Why

Every coding agent that works in this repository — OpenCode on the host, Maki
in the sandbox, or anything else that reads the standard instruction and skill
paths — currently starts with no engineering-style guidance beyond
`AGENTS.md`'s security invariants. Nothing asks an agent to check whether code
needs to exist before writing it, and the helper script, fish plugin, and
dashboard are exactly the kind of small shell/TypeScript surface where an
agent will happily add a wrapper, a config layer, or an abstraction that no
one asked for. Ponytail is an established, upstream-maintained YAGNI ruleset
with adapters for OpenCode and for the shared skill format Maki already reads;
installing it locally makes minimal-code guidance a property of the repository
rather than of whichever host it happens to be run from.

## What Changes

- Add a project-local `opencode.json` that pins the OpenCode plugin
  `@dietrichgebert/ponytail@5.3.2` under the V2 `plugins` key. Installation is
  project-scoped: the machine's global `~/.config/opencode/opencode.json` is
  not modified, and no other project on this host gains the plugin.
- Copy ponytail's six skills (`ponytail`, `ponytail-review`, `ponytail-audit`,
  `ponytail-debt`, `ponytail-gain`, `ponytail-help`) into `.opencode/skills/`
  so Maki discovers them through its native skill search path, while OpenCode
  discovers the same directories.
- Verify the plugin actually loads and injects the ruleset under the host's
  OpenCode V2 runtime (`opencode v2.0.21`), including the `/ponytail`
  level command; ponytail's plugin export is a plain `{ id, setup }` object
  rather than `Plugin.define(...)`, which is expected to be equivalent but is
  not yet confirmed on this runtime.
- Document the install and the verification steps for this repository (how to
  refresh the pinned version and the skill copies together).

Explicitly out of scope: no Maki Lua bridge for persistent level switching, no
edits to this repository's `AGENTS.md`, no host-level provisioning or shell
setup (tracked separately as the host-setup playbook change).

## Capabilities

### New Capabilities

- `yagni-enforcement`: the guarantees this repository makes about the
  YAGNI/minimal-code guidance available to coding agents working in it —
  which agents receive the ruleset, where the skill files live, that the
  plugin is project-scoped and version-pinned, and that the installation is
  verifiable.

### Modified Capabilities

_None._ The existing `dashboard`, `fish-integration`, and `helper-cli`
capabilities describe shipped behavior of the helper, fish plugin, and
dashboard; none of their requirements change.

## Impact

- **New files:** `opencode.json` (repository root — first one in this repo),
  `.opencode/skills/ponytail*/SKILL.md` (six vendored copies), plus a
  documentation note.
- **Depends on upstream behavior:**
  OpenCode plugin configuration and `.opencode/plugins/` / `.opencode/skills/`
  discovery — https://opencode.ai/v2/docs/plugins and
  https://opencode.ai/v2/docs/build/plugins;
  Maki's skill search paths (`.opencode/skills/` project-side, walked up to
  the `.git` root) — https://maki.sh/docs/skills/; Maki's always-on
  `AGENTS.md` instruction loading — https://maki.sh/docs/context/;
  ponytail's own OpenCode instructions —
  https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md.
- **Network:** the plugin package resolves from npm the first time OpenCode
  loads the project; the vendored skill copies do not.
- **Token cost:** the six skill name/description lines become part of Maki's
  startup context for every session in this repository; the ruleset itself is
  injected per turn only in OpenCode.
- **Possible overlap:** OpenCode may register the skills twice (once from
  `.opencode/skills/`, once from the plugin's `skill.transform`); if that
  produces duplicates or errors, the resolution is a design decision, not a
  reason to drop the Maki-visible copies.
- **No effect on:** the sandbox boundary, provider profiles, policies,
  `bin/maki-oss`, `fish/`, `dashboard/`, or the test suite.
