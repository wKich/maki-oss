# Design

## Context

See `proposal.md` — Why. What shapes the approach:

- Host runtime is OpenCode **v2.0.21**; its V2 plugin API is a `plugins`
  array in `opencode.json(c)` plus `{ id, setup(ctx) }` plugins registering
  through `ctx.skill.transform`, `ctx.command.transform`, and
  `ctx.session.hook("context")`
  (<https://opencode.ai/v2/docs/build/plugins>).
- OpenCode loads plugins and skills from project-local locations only when
  they sit in a discovered path: `.opencode/plugins/` and the project skill
  sources `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`
  (<https://opencode.ai/v2/docs/plugins>,
  <https://opencode.ai/v2/docs/skills>). There is no config switch that turns
  project skill discovery off — only precedence by skill ID.
- Maki scans its own skill paths in order: `.maki/skills/`, `.claude/skills/`,
  `.opencode/skills/`, `.agents/skills/` walking up to the git root, then
  `~/.config/maki/skills/`, `~/.claude/skills/`, `~/.config/opencode/skills/`,
  `~/.agents/skills/` (<https://maki.sh/docs/skills/>). Folder trust does not
  gate skills. Maki loads `AGENTS.md` on every session
  (<https://maki.sh/docs/context/>), which this repository already owns.
- Ponytail's OpenCode adapter
  (<https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md>) ships
  `.opencode/plugins/ponytail.mjs` with one default export serving both plugin
  APIs ("V2 reads `id` + `setup`, V1 calls `server()`") and publishes
  `@dietrichgebert/ponytail` (5.3.2 at time of writing). Its level state for
  OpenCode lives in `$XDG_CONFIG_HOME/opencode/.ponytail-active`, and its
  defaults come from `PONYTAIL_DEFAULT_MODE` or `~/.config/ponytail/config.json`
  — both host-global.

## Goals / Non-Goals

**Goals:**

- One project-local, version-pinned declaration that makes OpenCode sessions
  here run with ponytail's ruleset, commands, and skills.
- The same six skills available to Maki, with each agent seeing them once.
- An explicit, documented default level and a way to refresh pin and skill
  copies together.

**Non-Goals:**

- No host-global install (`opencode plugin add` writes the global config, so
  it is deliberately not used).
- No Maki Lua bridge for per-session level injection or persistence; no edit
  to this repository's `AGENTS.md`.
- No host provisioning or shell-setup playbook (separate change).

## Decisions

### D1 — npm package entry in a project `opencode.json`, not a vendored checkout, not a global install

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@dietrichgebert/ponytail@5.3.2"]
}
```

- **Why:** project-scoped (global config untouched), one-line pin, updates go
  through `opencode plugin update`, and ponytail's README asks users to
  install only from its GitHub repo or the npm package. This repo is
  documentation and shell; vendoring a large JS checkout (clone or submodule)
  to avoid a five-line package entry is more surface, not less.
- **Alternatives rejected:** `opencode plugin add @dietrichgebert/ponytail` —
  writes `~/.config/opencode/opencode.json`, so it is a host-global install
  and violates the project-local requirement; vendored checkout under
  `vendor/ponytail/` — reproducible offline but adds a dependency tree to a
  docs-heavy repo and needs a subdirectory path entry (`plugins` entries that
  point at a *file* are rejected by V2; a path must resolve to a directory).

### D2 — skills go in `.maki/skills/`, not `.opencode/skills/`

- **Why:** OpenCode cannot be told to skip project skill discovery, so any
  `SKILL.md` under `.opencode/skills/` is discovered by OpenCode *and*
  registered by the plugin — two sources for one ID. `.maki/skills/` is
  scanned by Maki only, so the two agents partition cleanly: Maki reads the
  vendored copies, OpenCode reads only the plugin's registrations. Same
  IDs, same content, no precedence gamble, no duplicate listing.
- **Note:** `.maki/skills/` is a new top-level directory for this repository.
  It is uploaded with the project by `maki-oss`, which is desirable — a Maki
  session in the sandbox gets the same skills.
- **Alternatives rejected:** `.opencode/skills/` — the duplicate-registration
  problem this decision exists to avoid; suppressing OpenCode's discovery via
  `permissions` deny or `opencode/autoinvoke: false` — hides the skills from
  the model in OpenCode while still registering them, which is a different
  behavior than "plugin only" and adds config that must be maintained.

### D3 — default level `full`, documented; no host-global knob written

- **Why:** `full` is ponytail's own default, so a fresh checkout needs no
  state to be correct, and the project stays self-contained: nothing in this
  repository writes `~/.config/ponytail/config.json` or an environment
  variable, which would leak the choice into every other project. `docs/yagni.md`
  records `full` as this repository's level and records the caveat that
  `/ponytail <level>` persists to `$XDG_CONFIG_HOME/opencode/.ponytail-active`
  and therefore changes the level for other projects on the same machine.
- **Alternatives rejected:** `PONYTAIL_DEFAULT_MODE` in the shell — host-wide
  and shell-specific, i.e. the host playbook's problem; a `direnv` `.envrc` —
  adds a tool dependency for one variable; writing
  `~/.config/ponytail/config.json` — out of project scope by construction.

### D4 — documentation lives in `docs/yagni.md`, linked from the README

- **Why:** `docs/helper.md` is the `maki-oss` command reference and mixing in
  agent-tooling install steps would break its single topic; a short dedicated
  page keeps the README's Guides list honest. The refresh procedure (bump pin
  and re-copy skills together) belongs there because it is maintainer-facing.
- **Scope note:** the README gains one Guides link. `AGENTS.md` is untouched
  per the proposal's exclusions, so discovery of this page is via the README
  and the change itself.

### D5 — verify the plain-object export before declaring the install correct

- Ponytail exports `{ id, setup }` directly instead of calling
  `Plugin.define(...)`. The V2 docs use `Plugin.define`, so equivalence is
  expected but unconfirmed on 2.0.21. Verification is empirical: load the
  project, list plugins, confirm the ruleset appears in system context and the
  `/ponytail` commands exist. If it fails, the fallback is D1's local-path
  form pointed at an installed directory plus an issue upstream — not a
  switch to a global install.

## Risks / Trade-offs

- **Skill copies drift from the pinned package** (bump the pin, forget the
  copies) → the refresh procedure in `docs/yagni.md` treats them as one step,
  and the verification step re-lists all six skills by name.
- **The plugin package resolves from npm on first load** (network needed once
  per host, and a supply-chain trust decision on `@dietrichgebert/ponytail`)
  → exact-version pin, official package name only, no `.exe`/`.dll` payloads
  per upstream's own install warning.
- **Level state is host-global upstream** → documented caveat; the repository
  never writes it, so a fresh checkout always behaves as specified.
- **`.maki/` is a new top-level directory** readers may not expect →
  `docs/yagni.md` explains why the skills sit there instead of
  `.opencode/skills/`.
- **Ruleset injected every turn costs tokens** in OpenCode sessions here →
  that is the point of the change; `/ponytail off` is the documented escape
  hatch.

## Migration Plan

Additive only: create `opencode.json`, `.maki/skills/ponytail*/SKILL.md`,
`docs/yagni.md`, and the README link. Nothing existing changes, so rollback is
deleting those files (and running `opencode service restart` if the plugin was
loaded). The sandbox image, policies, and provider profiles are unaffected.

## Open Questions

None that would change the specs, the approach, or the task breakdown. The
V2 load check (D5) is a verification step, not an unknown to defer — if it
fails, the design's fallback applies.
