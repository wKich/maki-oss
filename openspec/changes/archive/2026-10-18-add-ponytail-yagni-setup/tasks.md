# Tasks

## 1. Project-local plugin declaration

- [x] 1.1 Create `opencode.json` at the repository root containing only
      `$schema` and `"plugins": ["@dietrichgebert/ponytail@5.3.2"]` — verify
      with `grep -c '"@dietrichgebert/ponytail@5.3.2"' opencode.json` printing
      `1` (exact pin, no range) and
      `grep -c ponytail ~/.config/opencode/opencode.json` printing `0`
      (global configuration untouched).
- [x] 1.2 Confirm the plugin loads under OpenCode V2 with its plain-object
      export (design D5) — run `opencode service restart`, then from the
      repository root run `opencode plugin list` and verify `ponytail` is
      reported active; if that listing covers global plugins only, verify
      instead from a session opened in this repository with
      `opencode api get /api/plugin`, checking for an entry with
      `"id":"ponytail"` and `"status":"active"`.
- [x] 1.3 Confirm the ruleset and level command work at the default level —
      open `opencode` in this repository, run `/ponytail`, and verify it
      reports level `full`, then run `/ponytail-review` and verify the command
      is offered (it must be registered by the plugin, not a file in
      `.opencode/commands/`).

## 2. Skills visible to Maki, once per agent

- [x] 2.1 Extract the pinned package (`npm pack @dietrichgebert/ponytail@5.3.2`
      into a temporary directory) and copy its six `skills/<name>/` directories
      to `.maki/skills/` — verify with
      `for s in ponytail ponytail-review ponytail-audit ponytail-debt ponytail-gain ponytail-help; do test -f ".maki/skills/$s/SKILL.md" || exit 1; done`
      exiting `0`, and `ls .maki/skills | wc -l` printing `6`.
- [x] 2.2 Confirm Maki discovers the copied skills without a model call — run
      `maki prompt --tools` from the repository root and verify the output
      contains all six ids (`ponytail`, `ponytail-review`, `ponytail-audit`,
      `ponytail-debt`, `ponytail-gain`, `ponytail-help`).
- [x] 2.3 Confirm OpenCode receives the skills only from the plugin — verify
      `test ! -d .opencode/skills/ponytail` exits `0` (no ponytail copy in any
      project skill directory OpenCode scans), and from a session opened in
      this repository verify `opencode api get /api/skill` lists each ponytail
      id exactly once (count occurrences per id equals 1).

## 3. Documentation

- [x] 3.1 Write `docs/yagni.md` covering
      install (project-local `opencode.json` and `.maki/skills/` copy), the
      verification commands from tasks 1 and 2, the refresh procedure that
      bumps the pinned version and re-copies the six skills in one step, the
      default level `full`, and the caveat that `/ponytail <level>` persists
      host-level state outside this repository — verify with
      `grep -c '5.3.2' docs/yagni.md` printing at least `1`,
      `for s in ponytail-review ponytail-audit ponytail-debt ponytail-gain ponytail-help; do grep -q "$s" docs/yagni.md || exit 1; done`
      exiting `0`, and `scripts/check-links.sh docs/yagni.md` exiting `0`.
- [x] 3.2 Add a Guides link for `docs/yagni.md` to the README — verify with
      `grep -c 'docs/yagni.md' README.md` printing at least `1` and
      `scripts/check-links.sh README.md` exiting `0`.

## 4. Regression and change hygiene

- [x] 4.1 Confirm the existing suites still pass with the new files present —
      run `make test` and verify it exits `0`.
- [x] 4.2 Confirm the lint gate is unaffected — run `make lint` and verify it
      exits `0`.
- [x] 4.3 Confirm the change artifacts validate — run
      `openspec validate add-ponytail-yagni-setup --strict` and verify it
      reports the change valid.
