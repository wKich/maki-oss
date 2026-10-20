# Design

## Context

The helpers, image, and specs all describe the same shipped behavior from
three directions: code (`bin/maki-oss`, `examples/maki-image/`), prose
(`docs/`), and specs (`openspec/specs/`). The last feature commits updated
code and prose but left two doc gaps and an unsynced spec pair. See
proposal.md for the exact list.

Two constraints shape the approach:

- `AGENTS.md` forbids ever spelling the OpenShell credential placeholder
  literally in any file the agent may load — every doc edit must describe it
  in prose, as the surrounding text already does.
- The archived change `openspec/changes/archive/2026-10-20-add-stdio-mcp-runtime-support/`
  already contains the exact delta text that was meant to reach the main
  specs; it is the source of truth for what the specs should say.

## Goals / Non-Goals

**Goals:**

- Every documented expected output matches what the shipped commands and image
  produce today.
- The curated-profile lists account for every profile file under
  `examples/providers/` (minus `template.yaml` and the `catalog.tsv` header).
- The main specs describe the runtime-gated stdio behavior that ships.

**Non-Goals:**

- No change to helper behavior, image contents, policy, tests, or completions.
- No rewrite of guide structure, ordering, or scope; README stays end-user
  trimmed rather than becoming a full command reference.
- No re-verification of upstream versions (OpenShell/Maki pins) beyond what
  the current commits already state.

## Decisions

**1. Copy the archived delta text instead of re-authoring it.**
The two spec delta files are copied verbatim from the archived stdio change,
which was reviewed and validated at archive time. Re-authoring would risk
drifting from what that change actually decided. Alternative considered:
re-derive the deltas from current behavior by hand — rejected, it reintroduces
exactly the transcription error this change exists to fix.

**2. The profile tables are generated from the filesystem, not from memory.**
Each curated-profile row is checked against `examples/providers/*.yaml` and
`catalog.tsv` (env var and endpoint read from the profile file itself), so a
future profile addition shows up as a diff rather than a silent omission.
Alternative: link to `catalog.tsv` as the single source and delete the tables —
rejected, the tables carry per-profile notes the catalog does not.

**3. MCP coverage in the setup guide points rather than duplicates.**
`docs/setup-guide.md` gains one verify step (`maki-oss mcp status`) and a link
to `docs/mcp-migration.md`, which is the checklist for MCP. The gate list,
example output, and failure fixes stay in `docs/helper.md` and the migration
guide. Alternative: restate the gate documentation in the setup guide —
rejected, it would create a second copy to keep in sync.

**4. README edits are limited to drift.**
The README is compared against `usage()` in `bin/maki-oss`; only commands,
flags, or claims that no longer hold are corrected. Alternative: expand the
README to cover new commands such as `mcp status` — rejected unless a line is
actually wrong, per commit `223ebda` ("trim README to end-user install,
usage, and prompts").

## Risks / Trade-offs

- [Copying archived deltas could miss later edits to the main spec] →
  `openspec validate --strict` plus a diff of each MODIFIED block against the
  main spec's current block before finishing.
- [The doc lists drift again with the next profile or MCP addition] → the
  verification commands in tasks.md are cheap `grep`/`find` one-liners that
  compare docs against `examples/providers/` and `usage()`.
- [A doc claim is written that the code does not actually do] → every expected
  output in this change is copied from real command output or from the
  Dockerfile, not paraphrased.
- [`add-oauth-mcp-support` is in flight on the same capability] → its delta
  only adds a requirement, so archiving order does not affect this change's
  blocks; verify after any archive that both are still valid.

## Migration Plan

Docs and specs only — nothing to deploy. Apply, run `openspec validate --strict`
and the doc-check commands in tasks.md, then archive the change so the deltas
land in `openspec/specs/`.

## Open Questions

None.
