# Implementation evidence — implement-opencode-tui-bridge

Every task verify in `tasks.md` and where it is proven. Captures are from
2026-10-20 against the pinned versions (`opencode v2.0.32`, `maki 0.6.4`).

## How the captures were taken

- `harness/capture-bridge.sh` — boots `src/bridge.ts`, points the **real**
  `opencode --server` TUI at it (fresh client state; the XDG isolation is
  applied to the TUI only — maki keeps the real `XDG_STATE_HOME`, which is
  where its saved credentials live), and drives three prompts: a plain turn, a
  failing-tool turn (`false`), and a permission-gated turn (`rm`, answered
  from the TUI). It also opens a `curl -N /api/event` subscriber so the raw
  SSE bytes are captured, not just the frames the bridge logs.
- `harness/api-check.ts` — drives the same HTTP surface directly for the
  behaviors a single scripted TUI run cannot force deterministically:
  bridge-minted ids, delete, the **reject** permission answer, the
  **always** re-ask policy, and a failing tool call.
- `harness/validate-bridge.mjs` — validates what the bridge actually emitted
  (logged responses + raw SSE bytes) against the pinned OpenAPI contract with
  `ajv/dist/2020`, and checks the wire format and id patterns.

## Task → evidence

| Task | Evidence |
|---|---|
| 1.1 pinned-version re-capture | `openapi-reverify-note.md`: `/api/info` reported `2.0.32`, capture exit 0 |
| 1.2 A/B diff | same note: normalized diff vs the spike's baseline is **0 lines**; mapping still holds |
| 2.1 boot/config surface | `bridge-requests.jsonl` (40 requests, every one 2xx), `validate-bridge.log` ("no unhandled 404", "35 bodies" valid); TUI reached the composer and submitted prompts (`tui-run.typescript`) |
| 2.2 self-consistent location | `tui-run.typescript` contains no "location unavailable"; `src/spec-answers.ts` collapses synthesized relative dirs onto the canonical directory and empties `subpath`; `GET /api/location` / `/api/project` show `canonical == session directory` in the request log |
| 2.3 non-hostile enums | request log: `migration/v1 → {"status":"completed"}`, agents `mode:"primary"`, `config → []`; status line in the transcript renders "Sample · sample" (selected agent/model) and prompts submit |
| 3.1 one Maki process per session | `api-check.log`: create returns a minted `ses_` and every later turn runs on that process (one `session_id` for the session's lifetime) |
| 3.2 stable minted ids | `validate-bridge.log`: "assistant message ids seen: 3 (8+15+15 frames each)" — one `msg_` per turn, distinct `evt_` per frame, `per_`/`ses_` patterns hold |
| 3.3 read/list/delete | `api-check.log`: create/read/list PASS; delete 204 and the session reads back `SessionNotFoundError` (maki child killed) |
| 4.1 prompt → maki | prompt POSTs in `bridge-requests.jsonl`; every turn's frames follow (`session.execution.started` …) |
| 4.2 buffered assistant mapping | `bridge-sse-frames.jsonl` (reasoning/text/tool frames per turn) + transcript: "PONG", "+1 command, 2 thoughts", "DONE", "Sample · sample · 5.3s" |
| 4.3 tool_result mapping | `api-check.log`: "failing tool call maps to tool.failed (Exit code: 1)" and the deny maps to `tool.failed` with the spec `{type,message}` shape; the TUI rendered the turn's `+1 command` row and finished — no crash |
| 4.4 turn completion | `session.step.ended` frames carry `finish:"stop"`, `tokens`, `cost`; transcript status line shows the turn duration; `session.execution.succeeded` per turn |
| 4.5 stream deltas | buffered floor proven by the two captures above. **Caveat:** the `stream_event` enhancement is implemented (`src/translator.ts`, envelope spellings accepted, unknown shapes dropped) but not wire-verified — the synthetic model never streams, which is the spike's accepted cost 6. A non-streaming provider degrades to the buffered path, which is what both captures exercise |
| 5.1 permission.asked | `bridge-sse-frames.jsonl`: object-form `source {type:"tool", messageID, id}`; the TUI answered it (`{"decision":"once"}` → 204 in the request log), so the prompt was displayed |
| 5.2 allow/reject | allow: TUI run deleted the probe file after the reply; reject: `api-check.log` — `tool.failed` "Permission denied … rejected by the user", probe file untouched, turn completes |
| 5.3 always re-asks | `api-check.log`: after `always`, a later matching `can_use_tool` asks again (3rd `permission.asked`), nothing cached |
| 6.1 wire format | `validate-bridge.log`: 47 raw SSE lines are bare `data:` frames, first is `server.connected`, no `event:`/`id:` lines |
| 6.2 deferred routes | request log answers form/permission/terminal/inbox/message/vcs/plugin/mcp/shell/… with spec-valid bodies; nothing blocked boot, a prompt, or the permission round trip |
| 6.3 contract validation | `validate-bridge.log`: every logged bridge response body validates against the pinned OpenAPI response schema |
| 6.4 end to end | `tui-run.typescript` (real TUI: boot → plain turn → failing-tool turn → permission dialog → answered → DONE), `bridge-sse-frames.jsonl`, `api-check.log`; redaction scan over `evidence/` (Authorization/Bearer/`sk-`/password patterns) is clean — no credential in any capture |

## Files

- `openapi-fresh-2.0.32.json` — cost-5 re-capture (identical to the spike baseline)
- `openapi-reverify-note.md` — tasks 1.1/1.2
- `bridge-requests.jsonl` — redacted request/response log of the TUI run
- `bridge-sse-frames.jsonl` — every frame the bridge emitted during the TUI run
- `bridge-sse-raw.txt` — raw SSE bytes of a live subscriber
- `bridge-stdout.log` — bridge console (per-request lines)
- `tui-run.typescript` — the real TUI session (raw terminal bytes)
- `api-check-frames.jsonl`, `api-check.log` — API-level behavior checks
- `validate-bridge.log` — contract + wire validation
