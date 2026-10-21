# Live smoke note (task 4.1, 2026-10-21)

One live OpenCode TUI session against the real gateway with `tui = "opencode"`,
run through the helper end to end.

## Setup

- Host: macOS, `openshell` 0.1.4 (connected, mTLS), `opencode v2.0.32`,
  `bun 1.4.2`, image `maki-agent:local` present.
- Scratch project `/tmp/tui-live-smoke/project` with a scratch config
  (`XDG_CONFIG_HOME=/tmp/tui-live-smoke/config`, carrying a copy of the
  gateway registration so the CLI stays usable):

  ```toml
  providers = "maki-synthetic"
  model = "synthetic/syn:small:text"
  tui = "opencode"
  ```

- **Sandbox name: `maki-tui-smoke`** — created by the helper's ensure routine,
  deleted after the run (`openshell sandbox delete maki-tui-smoke`: "deletion
  accepted; cleanup is pending"). The gateway's long-lived sandbox
  `maki-maki-openshell` was never touched.

## Commands

```sh
cd /tmp/tui-live-smoke/project
script -qF tui-run.typescript \
  /Users/ki/Projects/experiments/maki-openshell/bin/maki-oss --name maki-tui-smoke
# driver keystrokes into the TUI's PTY:
#   "Reply with the word PONG only."            (plain prompt)
#   "Use your shell tool to run exactly: rm -f /tmp/maki-tui-smoke-perm.txt .
#    Then reply with the single word DONE."     (tool prompt)
#   Enter                                       (permission dialog, accept once)
#   ctrl+x ctrl+x, then SIGTERM as fallback     (end the TUI)
openshell sandbox delete maki-tui-smoke
```

`BRIDGE_LOG` / `BRIDGE_SSE_LOG` pointed at `/tmp/tui-live-smoke/`; the TUI
used isolated `XDG_STATE_HOME` / `XDG_DATA_HOME`.

## What happened

1. **Ensure → bridge → attach**: the helper created the sandbox, attached the
   provider, uploaded the project, started `bun bridge/src/bridge.ts` on
   loopback, and attached `opencode --server http://127.0.0.1:4600`
   (helper note after ~5 s of sandbox reuse, ~90 s of fresh create).
2. **Plain prompt**: the bridge logged `POST /api/session` + `POST .../prompt`
   (200) and emitted the full turn — `session.execution.started`,
   `session.step.started`, `session.reasoning.*` (3 parts),
   `session.text.started/delta/ended`, `session.step.ended`,
   `session.execution.succeeded` — with Maki answering "PONG" through
   `openshell sandbox exec` inside the sandbox.
3. **Tool prompt**: second turn completed with
   `session.tool.input.started/ended`, `session.tool.called`,
   `session.tool.success` (the `rm` ran in the sandbox) and
   `session.execution.succeeded`.
4. **Exit and sync-back**: ctrl+x ctrl+x did not quit this TUI build, so the
   run ended with SIGTERM on the TUI — the documented Ctrl-C teardown path:
   the helper killed the bridge, then ran the exit sync
   ("Downloading sandbox:/sandbox/project -> /tmp/tui-live-smoke/project,
   ✓ Download complete, Synced sandbox changes back"), then exited.
5. **Requests**: 165 logged requests, statuses only `200`/`204` — no 404, no
   5xx.

## Bridge defect found and fixed by this smoke

The TUI sends its own **host** cwd as the session location at
`POST /api/session`; the bridge honored it, so the child was started with
`--workdir /private/tmp/tui-live-smoke/project`, which does not exist inside
the sandbox. The captured bridge log shows the failure:

```
[maki] /bin/bash: line 1: cd: /private/tmp/tui-live-smoke/project: No such file or directory
[bridge] maki exited behind session ses_...
```

This violates design decision 5 (the sandbox workdir is canonical, no host
path enters the sandbox). Fixed in `bridge/src/bridge.ts`: every bridge
session now runs in the canonical (sandbox-workdir) directory, ignoring the
TUI's requested host directory. All runs after the fix show the child
starting and completing turns.

## Permission round trip did not fire live (recorded, not fixed)

No `permission.asked` was emitted for the `rm` prompt: the sandbox image's
baked config (`examples/maki-image/config/init.lua`) sets `always_yolo =
true`, so Maki never raises `can_use_tool` in the sandbox (only the explicit
deny rules apply). A direct probe with `maki -p --trust --permission-mode
default ...` confirmed the SDK flag does not override it. The bridge's
permission round trip is therefore exercised deterministically by
`evidence/harness/api-check.ts` (allow-once, reject, and always-re-asks all
PASS — see `evidence/validate-bridge.log`) and live in the spike's host-mode
capture. Reconciling the bridge's "prompts must keep firing" expectation with
the image's `always_yolo` is a design question for a later change; the
image's config is deliberately out of scope here.

## Credential check

Both redaction-scan patterns (value-shaped credentials; authorization/api-key
keys) were run over every captured file —
`bridge-requests.jsonl`, `bridge-sse-frames.jsonl`, `bridge-stdout.log`,
`tui-run.typescript`, and the helper output. **No credential appears in any
captured log**: value scan no matches, key scan no matches. The Maki child
authenticates in-sandbox through the attached provider profile; the bridge
and TUI hold no credential (`apiKeySource: "none"` in Maki's init frame).

## Attempts record

- Attempt 1 failed before the session: the scratch `XDG_CONFIG_HOME` also
  moved the openshell CLI's gateway registration (fixed by copying it into
  the scratch config dir).
- Attempts 2–4 reproduced the host-cwd defect above (child exit ~250 ms after
  spawn); their captures are the source of the error line quoted here.
- Attempt 5 (after the fix) is the successful run described above.
