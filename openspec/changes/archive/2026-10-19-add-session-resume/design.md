# Design

## Context

`maki-oss` launches Maki with `os sandbox exec … -- maki [--model …]` (see
`cmd_maki`, `cmd_run` in `bin/maki-oss`). The option parser is one flat loop
over all argv that runs before subcommand dispatch, which is how `--model`
and `--no-sync` already work on commands that do not use them.

Maki v0.6.0 owns session storage inside the sandbox: `$HOME/.local/state/maki/`
(`sessions/*.jsonl`, `sessions/cwd_latest.json`, `projects/<key>/`) with
`HOME=/sandbox`, keyed by the absolute cwd — always `/sandbox/project` inside
the sandbox. Its flags are `-c/--continue`, `-r/--resume <ID>` (alias
`--session`), `--session-id <ID>`, `--fork-session`; one process per session
is enforced by a lock file (see <https://maki.sh/docs/cli/> and
<https://maki.sh/docs/headless/#sessions>).

The helper syncs only the sandbox workspace (`/sandbox/project`) in and out.
The session store never crosses that boundary today, and this change keeps it
that way.

## Goals / Non-Goals

**Goals:**

- Let a user resume the previous conversation (`--continue`) or a specific
  session (`--resume <ID>`) through `maki-oss`, and pick a session id for a
  headless run (`--session-id <ID>`), without weakening any security invariant.
- Keep the existing exit-code, stdout/stderr, and sync contracts untouched.

**Non-Goals:**

- Persisting sessions across sandbox deletion (`rm` → recreate), importing
  host sessions into the sandbox, or any new host-side session storage.
- `--fork-session` or a `maki-oss sessions` listing command.
- Changing where Maki stores state, or how the workspace sync works.

## Decisions

### 1. Long-only flags, one name per concept

`--continue`, `--resume <ID>`, `--session-id <ID>` — no short forms.

- *Why:* the helper's flag namespace currently exposes only `-h`; Maki's own
  aliases (`-c`, `-r`, `-s`, `--session`) are its namespace, not ours, and
  `-s` would read as `--session-id` here while meaning `--session` there.
- *Alternative:* mirror Maki's short flags exactly — rejected: invites
  ambiguity between `-s`, `--session`, and `--session-id`, and buys nothing
  the long form does not.

### 2. Validate conflicts in the helper, forward everything else verbatim

`--continue` + `--resume` → `die_usage` (exit 1) naming both flags, before
any gateway call. Missing/empty values → `die_usage`. Every other combination
is forwarded as-is, including `--session-id` with either resume flag.

- *Why:* upstream's behavior when both `-c` and `-r` are present is
  unspecified in the Maki docs; forwarding an ambiguous pair could resume the
  wrong conversation, which is a silent-wrong-result class of bug. An empty
  value forwarded to Maki would produce an opaque upstream error.
- *Alternative:* let Maki decide everything — rejected for the conflict case
  only; the ambiguity is cheap to catch one layer earlier.

### 3. Same parser slot as `--model`: global loop, inert on non-session commands

Three new `opt_*` variables and three `case` arms in the existing option loop,
consumed before dispatch; `cmd_maki` and `cmd_run` append them to the exec
argv the way they already append `--model`.

- *Why:* consistent with `--model` / `--no-sync`, which are also parsed
  globally and used by the session commands only. Per-subcommand parsing would
  restructure the parser for no observable gain.
- *Alternative:* reject session flags on commands that cannot use them —
  rejected: would break the established precedent and add a rule to maintain
  for `--model`, `--no-sync`, `--tail`, … that already behave this way.

### 4. Ids travel as single argv elements

`openshell sandbox exec … -- maki --resume "$id"` passes argv, not a shell
string, so an id with spaces or metacharacters cannot be reinterpreted.

- *Why:* no validation of id format is needed for safety, only for emptiness
  (decision 2).
- *Trade-off:* a syntactically odd id reaches Maki and fails there with
  Maki's error — acceptable, the helper is a pass-through layer.

### 5. Document the sandbox lifetime instead of engineering around it

`docs/helper.md` states that sessions live in the sandbox's container
filesystem: they survive `stop`/`start`, and are lost when the sandbox is
deleted and recreated. Nothing is uploaded, downloaded, or stored on the host.

- *Why:* durable sessions would need a host-side state location outside the
  repository, explicit exclusion of `auth/` and `locks/`, restore-on-create
  ordering to avoid clobbering newer sandbox history, and new `--no-sync`
  semantics — a substantially larger change with real security surface.
  Deferred as its own change if the loss ever hurts.
- *Alternative considered:* back sessions up on exit and restore on create
  (rejected for this change as out of scope; recorded in the exploration and
  proposal).

## Risks / Trade-offs

- [A user expects `--continue` to work after `maki-oss rm`] → the docs caveat
  makes the lifetime explicit; Maki's own "no session to resume" error and
  exit code pass through unchanged, which is the existing contract for
  Maki output.
- [Two commands resume the same session: a TUI `maki-oss maki --continue`
  and a `maki-oss run --continue` at once] → Maki's one-process-per-session
  lock refuses the second run before it sends a request; the helper surfaces
  that output and exit code. No helper-side lock handling.
- [`--model` together with `--resume`] → both are upstream flags and Maki
  resolves precedence; the helper documents neither as exclusive.
- [Flat parser pairs `--resume` with whatever follows, e.g.
  `maki-oss run --resume "fix the tests"`] → the value flag consumes the
  prompt and `run` then fails its own "prompt required" usage error. Same
  behavior `--model` already has; docs examples show the value flag with an
  explicit id followed by the quoted prompt.
- [Session transcripts remain only in the sandbox] → accepted trade-off of
  scope, stated in the docs rather than hidden.

## Migration Plan

None: additive flags, no config keys, no schema or `.openspec.yaml` changes,
no behavior change for existing invocations. Rollback is reverting the
helper, completions, and docs.

## Open Questions

- Whether Maki's `-c` failure message ("no session to continue") is clear
  enough in a fresh sandbox to stand alone in `docs/helper.md`, or the docs
  should quote it. Answerable by running `maki-oss maki --continue` once
  after implementation; either answer changes only prose, not the specs,
  approach, or task breakdown.
