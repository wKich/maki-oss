# Proposal

## Why

Maki can resume a previous conversation (`-c`, `-r <id>`, `--session-id`),
but `maki-oss` never forwards any of it: every `maki-oss`, `maki-oss maki`,
and `maki-oss run` invocation starts a brand-new session inside the sandbox,
so a user who exits a session and comes back loses the whole conversation
even though the transcript is sitting in the sandbox state directory.

## What Changes

- Add three session flags to the helper's option parser and forward them to
  the `maki` process it execs inside the sandbox:
  - `--continue` → Maki `-c` (resume the most recent session in the workdir)
  - `--resume <ID>` → Maki `-r` (resume a specific session)
  - `--session-id <ID>` → Maki `--session-id` (write the run under a chosen id)
- Accept the flags on bare `maki-oss`, `maki-oss maki`, and `maki-oss run`,
  the three commands that launch Maki. They keep the existing global-parser
  style: on other commands they are parsed and have no effect, exactly like
  `--model` and `--no-sync` today.
- Reject the combination `--continue` with `--resume` as a usage error
  (exit 1) instead of forwarding an ambiguous pair; `--session-id` combines
  with either, since Maki documents that pairing.
- Document the lifetime caveat: sessions live in the sandbox's container
  filesystem, so they survive `stop`/`start` but are lost when the sandbox is
  deleted and recreated. Nothing about sync, upload, providers, or the
  security posture changes — no new network endpoints, no state moved onto
  the host, no credentials touched.
- Extend the fish completions and `docs/helper.md` with the new flags.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `helper-cli`: new requirement covering session-resume flag pass-through on
  the three session commands, including flag combinations and the
  sandbox-lifetime caveat.
- `fish-integration`: the enumerated completion list gains `--continue`,
  `--resume`, and `--session-id`.

## Impact

- `bin/maki-oss` — three new `opt_*` variables and parser cases, argv
  assembly in `cmd_maki` and `cmd_run`, `usage()` text.
- `fish/completions/maki-oss.fish` — three completion entries.
- `docs/helper.md`, `README.md` — flag docs plus the session-lifetime caveat.
- `tests/run-tests.sh` — assertions on the exec argv for each flag, the
  rejected combination, and `run` prompt/flag separation.
- `openspec/specs/helper-cli/spec.md`, `openspec/specs/fish-integration/spec.md`
  — updated after the change is applied (via the sync workflow).

Upstream behavior this depends on (verified against Maki v0.6.0):

- Flag reference: <https://maki.sh/docs/cli/>
- Session semantics, locks, `session_id` output: <https://maki.sh/docs/headless/#sessions>
