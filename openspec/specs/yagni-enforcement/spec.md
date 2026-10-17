# yagni-enforcement Specification

## Purpose

Guarantees that a coding agent working in this repository — OpenCode on the
host or Maki in the sandbox — receives the same ponytail YAGNI guidance from
project-scoped configuration, with each agent seeing the skills exactly once,
an explicit default intensity, and a documented way to verify and refresh the
install.

## Requirements

### Requirement: Project-scoped, version-pinned plugin declaration

The repository SHALL declare the ponytail plugin in a project-local
`opencode.json` at the repository root, pinned to an exact version, and MUST
NOT require or modify any entry in the user's global OpenCode configuration
(`~/.config/opencode/opencode.json`).

#### Scenario: Declared in the project config only

- **WHEN** a maintainer inspects `opencode.json` at the repository root
- **THEN** it contains `@dietrichgebert/ponytail` with an exact version
  (no range, tag, or `latest`) under `plugins`, and the user's global
  OpenCode configuration is unchanged by installing this repository's setup

#### Scenario: Loads on a host without a global install

- **WHEN** OpenCode starts in this repository on a host where ponytail is not
  registered globally (`opencode plugin list` reports no plugins)
- **THEN** the ponytail plugin is loaded for sessions in this repository and
  no other project on that host gains it

### Requirement: YAGNI ruleset active in OpenCode sessions

Every model turn in an OpenCode session in this repository SHALL include the
ponytail ruleset at the active level while that level is not `off`, and the
level commands SHALL be available as commands in the session.

#### Scenario: Ruleset injected at the default level

- **WHEN** a session runs in this repository with no level previously set and
  the default level in effect
- **THEN** each model request carries the ponytail ruleset for level `full`
  in its system context

#### Scenario: Level command switches intensity

- **WHEN** the user runs `/ponytail lite` (or `ultra`, `off`) in a session
- **THEN** subsequent turns use the requested level, and `/ponytail` with no
  argument reports the active level

### Requirement: Ponytail skills visible to Maki exactly once per agent

The repository SHALL provide the six ponytail skills
(`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`,
`ponytail-gain`, `ponytail-help`) as `SKILL.md` directories under
`.maki/skills/`, a path OpenCode does not scan, so Maki discovers them and
OpenCode receives them only from the plugin.

#### Scenario: Maki lists the skills

- **WHEN** Maki runs in this repository (on the host or in the sandbox) and
  its `skill` tool lists available skills
- **THEN** all six ponytail skills appear by name with their descriptions and
  load when requested by ID

#### Scenario: OpenCode does not register duplicates

- **WHEN** OpenCode lists the skills available in this repository
- **THEN** each ponytail skill appears exactly once, sourced from the plugin,
  with no duplicate registration from a scanned project skill directory

### Requirement: Explicit default intensity

This repository SHALL use `full` as its documented default ponytail level,
and `docs/yagni.md` SHALL state that default together with the note that a
level switched during a session persists in host-level ponytail state and
therefore affects other projects on the same machine.

#### Scenario: Default on a fresh checkout

- **WHEN** an agent follows `docs/yagni.md` on a host with no ponytail level
  previously persisted
- **THEN** the active level is `full` without any host-global configuration
  file or environment variable being written by this repository

#### Scenario: Documented caveat is present

- **WHEN** a maintainer reads `docs/yagni.md`
- **THEN** it states that switching levels writes ponytail state outside this
  repository and that the chosen default for this project is `full`

### Requirement: Documented install, verification, and refresh

The repository SHALL document in `docs/yagni.md` how to install, verify, and
refresh this setup, and the README SHALL link that document with the other
guides.

#### Scenario: Verification steps are runnable

- **WHEN** a maintainer runs the verification commands from `docs/yagni.md`
  in this repository
- **THEN** they confirm the plugin is listed for this project, the ruleset is
  active at the default level, and Maki reports the six skills

#### Scenario: Refresh procedure covers both copies

- **WHEN** a maintainer bumps the pinned ponytail version
- **THEN** `docs/yagni.md` describes updating the pinned version and the
  `.maki/skills/` copies in one step, so the two cannot drift silently
