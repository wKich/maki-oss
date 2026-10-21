# Known defects (spike-observed, deferred)

Two rendering defects were observed in the spike's live TUI runs and are
recorded here as evidence, not fixed by this change (`proposal.md` "What
Changes"; `design.md` decision 8). Fixing them belongs to a later change —
each entry names the acceptance criteria that change inherits.

Captures below were taken against the pinned versions (`opencode v2.0.32`,
`maki 0.6.4`) and were copied into this change's `evidence/` by task 1.2.

## Defect 1 — user prompts render after assistant responses (A-A-A-Q-Q-Q)

**Observed:** the transcript shows assistant turns first and the user's
prompts afterwards (A-A-A-Q-Q-Q) instead of interleaved (Q-A-Q-A).

**Cause (as measured):** the bridge emits assistant-side frames only — the
frame stream carries `session.execution.*`, `session.step.*`,
`session.reasoning.*`, `session.text.*`, `session.tool.*` and
`permission.*`, and no frame represents the user's submitted prompt, so the
TUI's renderer places the prompt after the assistant output it caused.

**Captures:**

- `evidence/bridge-sse-frames.jsonl` — every frame the bridge emitted during
  the captured run; the per-turn sequence contains no user-message frame
  between `session.execution.started` groups.
- `evidence/tui-run.typescript` — the raw terminal bytes of the real TUI run,
  showing the rendered order.
- `evidence/e2e-note.md` — task → evidence table for that run.

**Fixed by:** a later change (transcript-polish), out of scope here.

## Defect 2 — status line shows a synthesized model name

**Observed:** the TUI status line renders `Sample · sample` (agent · model)
instead of Maki's real model.

**Cause (as measured):** the bridge answers OpenCode's model/config reads
from the pinned OpenAPI schema by synthesis (`bridge/src/spec-answers.ts`,
string case returns `"sample"`), and the model recorded on session events is
that synthesized value — Maki's actual model never reaches the model answer.

**Captures:**

- `evidence/bridge-sse-frames.jsonl` — session frames carry
  `"model":{"providerID":"sample","id":"sample"}`.
- `evidence/tui-run.typescript` — the rendered status line `Sample · sample`.
- `evidence/e2e-note.md` — records the same status line in the run summary.

**Fixed by:** a later change (transcript-polish), out of scope here.

## Why they are not fixed in this change

This change adopts the spike's bridge and moves its backend into the sandbox;
the rendering polish, the test tiers, and the compatibility report were split
into later changes by agreement (`design.md` "Non-goals"). The mode is
opt-in (`tui = "opencode"`), so no existing behavior is affected.
