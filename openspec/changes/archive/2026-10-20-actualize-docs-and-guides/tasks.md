# Tasks

## 1. Setup guide matches the shipped image

- [x] 1.1 In `docs/setup-guide.md` §3, change the `ls /sandbox/.config/maki`
      expectation to list `init.lua`, `mcp.toml`, and `permissions.toml`, and
      mention that `mcp.toml` carries the MCP servers baked at image build —
      verify with
      `grep -n 'mcp.toml' docs/setup-guide.md` returning the expectation line,
      and `grep -n 'COPY.*config/mcp.toml' examples/maki-image/Dockerfile`
      confirming the file really ships.
- [x] 1.2 Add an MCP step/pointer in `docs/setup-guide.md` (after the image
      build section): run `maki-oss mcp status` to check readiness, link
      `docs/mcp-migration.md`, and state that the server set is baked so
      changing it means `maki-oss image build` — verify with
      `grep -n 'mcp status' docs/setup-guide.md` and
      `grep -n 'mcp-migration.md' docs/setup-guide.md` both returning a match,
      and with the helper's own help text: `./bin/maki-oss help | grep -c 'mcp status'`
      returning 1.

## 2. Curated profile lists are complete

- [x] 2.1 Extend the `## Curated catalog` table in `docs/providers.md` with
      `maki-xiaomi-token-plan-sgp`, `maki-minimax-coding-plan`,
      `maki-kimi-for-coding`, `maki-nano-gpt`, `mcp-context7`, and
      `mcp-synthetic` (environment variable and endpoint read from each
      `examples/providers/<id>.yaml`) — verify with a loop that every
      `examples/providers/*.yaml` except `template.yaml` is named in
      `docs/providers.md`:
      `for f in examples/providers/*.yaml; do b=$(basename "$f" .yaml); [ "$b" = template ] && continue; grep -q "$b" docs/providers.md || echo "missing $b"; done`
      printing nothing.
- [x] 2.2 Extend the curated-profile sentence in `docs/setup-guide.md` §4 to
      cover the same profiles — verify with the same loop from 2.1 substituting
      `docs/setup-guide.md`, printing nothing (or, where the guide deliberately
      stays prose, a `grep -c 'Kimi\|MiniMax\|NanoGPT\|Xiaomi' docs/setup-guide.md`
      returning at least 1).
- [x] 2.3 Confirm every profile row's `mcp-*` entry also appears in
      `docs/mcp-migration.md`'s profile table — verify with
      `grep -c 'mcp-context7' docs/mcp-migration.md` returning at least 1.

## 3. Glossary and helper reference

- [x] 3.1 Add glossary entries to `docs/glossary.md` for the MCP vocabulary the
      guides use (baked MCP config, MCP readiness, stdio runtime gate), phrased
      in prose with no credential placeholder spelling — verify with
      `grep -ni 'mcp readiness\|mcp config' docs/glossary.md` returning matches
      and `sh tests/run-tests.sh` passing (its `test_no_placeholder_spelling`
      case covers this file).
- [x] 3.2 Document `provider add`'s `--config`, `--runtime-credentials`, and
      `--global-profile` flags in the `### provider add / attach / list`
      section of `docs/helper.md` — verify with
      `for f in --config --runtime-credentials --global-profile; do grep -q "$f" docs/helper.md || echo "missing $f"; done`
      printing nothing, and each flag still appearing in
      `./bin/maki-oss help | grep -- '--runtime-credentials'`.

## 4. README audit

- [x] 4.1 Compare `README.md` against `usage()` in `bin/maki-oss` and correct
      only actual drift (commands, flags, or claims that no longer hold),
      keeping it end-user trimmed — verify by extracting the command tokens the
      README names and checking each exists in `./bin/maki-oss help`
      output, plus `git diff --stat README.md` showing only the lines that
      drifted.

## 5. Spec deltas land in the main specs

- [x] 5.1 Confirm the two delta files under this change's `specs/` still match
      the archived source of truth — verify with
      `diff openspec/changes/archive/2026-10-20-add-stdio-mcp-runtime-support/specs/mcp-integration/spec.md openspec/changes/actualize-docs-and-guides/specs/mcp-integration/spec.md`
      and the same `diff` for `specs/helper-cli/spec.md`, both printing nothing.
- [x] 5.2 Verify every MODIFIED block's header exists in the current main spec
      — verify with
      `grep -c '^### Requirement: MCP servers work through profiles, not copied config$' openspec/specs/mcp-integration/spec.md`,
      `grep -c '^### Requirement: MCP readiness is reported per server$' openspec/specs/mcp-integration/spec.md`,
      and `grep -c '^### Requirement: MCP readiness command$' openspec/specs/helper-cli/spec.md`
      each returning 1.
- [x] 5.3 Validate the change — verify with
      `openspec validate "actualize-docs-and-guides" --strict` printing
      `Change 'actualize-docs-and-guides' is valid`.

## 6. Final verification

- [x] 6.1 Run the full suite so no doc edit broke the repository's own checks —
      verify with `sh tests/run-tests.sh` reporting all tests passing (93 at
      the last run).
- [x] 6.2 Confirm the change touched no code — verify with
      `git status --short` listing only `docs/`, `README.md`, and
      `openspec/` paths, and `git diff --stat bin/ examples/ fish/ tests/`
      printing nothing.
