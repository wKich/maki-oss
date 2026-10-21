# Mapping table: OpenCode 2.0.32 ↔ Maki 0.6.4 (task 4.1)

Field-by-field mapping between the OpenCode server contract (as measured by
the TUI against the stub) and the Maki SDK wire (as measured live with
`maki -p --input-format stream-json --output-format stream-json`).

Evidence: `evidence/sse-events.jsonl`, `evidence/prompt-trace.log`,
`evidence/permission-trace.log`, `evidence/tui-route-inventory.md`,
`evidence/maki-plain.jsonl`, `evidence/maki-precheck.jsonl`,
`evidence/maki-tool.jsonl`, `evidence/maki-permission.jsonl`,
`evidence/openapi-2.0.32.json`.

## 0. Transport frames

| OpenCode | Maki | notes |
|---|---|---|
| `GET /api/event` → SSE: **one bare `data: <json>\n\n` per frame** (no `id:`/`event:` lines; `: heartbeat` comments between frames) | stdout: one JSON object per line | measured on the wire (real service capture + stub). The OpenAPI `text/event-stream` schema declares a frame `{id?, event, data}` with `event` **required** — the shipped server does not emit `event:`; the `type` lives inside the JSON envelope instead. Contract-vs-wire discrepancy, recorded for the follow-up. |
| frame JSON envelope: `{id:"evt_…", created:<ms>, type:"…", location?:{directory}, durable?:{aggregateID, seq, version}, data:{…}}`; first frame **must** be `{"id":…,"type":"server.connected","data":{}}` (client: "Event stream did not start with server.connected") | n/a (maki has no server side in this design) | durable events carry `durable.version` (1 or 2 per event type, binary-derived; `session.tool.success|failed` and `session.deleted` are v2); delta/permission events are ephemeral (no `durable`). |

## 1. Maki outbound wire types → OpenCode side (each type exactly once)

| # | Maki outbound type (stdout) | Measured shape | OpenCode counterpart |
|---|---|---|---|
| 1 | `system` | `{"type":"system","subtype":"init","cwd","tools":[…],"model":"syn:small:text","permissionMode":"default","apiKeySource":"none","session_id":"CgD…","uuid":"…"}` (`evidence/maki-plain.jsonl`) | no event; feeds the bridge's boot answers: `model` → `GET /api/model` entries + session `model:{providerID,id}`; `tools` → tool names in `session.tool.*`; `cwd` → session `location.directory`; `session_id` → minted `ses_…` |
| 2 | `user` | `{"type":"user","message":{"role":"user","content":[…]}}` (inbound, echoed) and maki→stdout user messages carrying `tool_result` parts (`evidence/maki-tool.jsonl`) | `tool_result` part → `session.tool.success` (`content`) / `session.tool.failed` (`error`, `is_error:true`); `tool_use_id` → tool part `id`. Plain user text is **not** echoed by maki in `-p` mode; the bridge renders the prompt from its own request. |
| 3 | `assistant` | message with parts `thinking`, `text`, `tool_use` (`{"type":"tool_use","id":"chatcmpl-tool-…","name":"Bash","input":{…}}`) | `thinking` → `session.reasoning.started/delta/ended`; `text` → `session.text.started/delta/ended`; `tool_use` → `session.tool.input.started` + `session.tool.called` (field map in §3) |
| 4 | `stream_event` | **not observed** in `-p` output with the synthetic model (plain turn emitted `system`/`assistant`/`result`). sdk_mode strings name the variants: `content_block_start`, `content_block_delta`, `content_block_stop`, `message_start`, `message_delta`, `message_stop`, `thinking_delta`, `input_json_delta`, `text_delta` | deltas map 1:1: `text_delta` → `session.text.delta`, `thinking_delta` → `session.reasoning.delta`, `input_json_delta` → `session.tool.input.delta`. Marked unverified on the wire; the bridge should accept both streamed and non-streamed maki output. |
| 5 | `result` | `{"type":"result","subtype":"success","duration_ms","duration_api_ms","num_turns","result","total_cost_usd","usage",…}` (`permission_denial` field present, null on success) | `subtype:"success"` → `session.execution.succeeded` + `session.step.ended{finish:"stop"}`; error subtypes → `session.execution.failed{error}`; `usage` → `TokenUsage.Info` on `session.step.ended`; `duration_ms` → step time |
| 6 | `control_request` | `{"type":"control_request","request_id":"req_1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -f …"},"tool_use_id":"chatcmpl-tool-…"}}` (`evidence/maki-permission.jsonl`) | OpenCode: `permission.asked` event + `Permission.Request` (`GET/POST /api/session/{ses_}/permission`); answer path in §4 |

(Inbound maki types, for completeness: `control_response`, `control_cancel_request`, `user`.)

## 2. Turn/step boundaries

| OpenCode event (data fields) | Maki source |
|---|---|
| `session.execution.started{sessionID}` | turn start (no maki frame; bridge-local, before first assistant output) |
| `session.step.started{sessionID, assistantMessageID, agent, model:{providerID,id}, started}` | `system.init` (model/agent) + prompt admission; `assistantMessageID` minted `msg_…` |
| `session.step.streamed` (spec-only; not needed for a buffering client) | `stream_event.content_block_start` |
| `session.step.ended{…, finish:"stop"\|"length"\|"tool-calls"\|"content-filter"\|"error"\|"unknown", cost?, tokens?}` | `result` (`subtype`, `usage`, `total_cost_usd`); finish enum from spec `Kv` |
| `session.step.failed{…, error}` | `result` with error subtype |
| `session.execution.succeeded{sessionID}` / `execution.failed{error}` / `execution.interrupted{reason}` | `result.subtype` success / error_* / user interrupt |

## 3. Part kinds (every kind in `evidence/sse-events.jsonl` has a row)

| OpenCode event (data fields, measured) | Maki source (measured unless noted) |
|---|---|
| `server.connected{}` (first frame, no `created`) | n/a — bridge-generated handshake |
| `session.renamed{sessionID, title}` | n/a — bridge-local (title from prompt) |
| `session.reasoning.started{sessionID, assistantMessageID, ordinal}` | `assistant` part `{type:"thinking"}` (or `stream_event.thinking_delta`) |
| `session.reasoning.delta{…, ordinal, delta}` | `thinking` text (or `thinking_delta`) |
| `session.reasoning.ended{…, ordinal, text}` | full `thinking` text at part end |
| `session.text.started{sessionID, assistantMessageID, ordinal}` | `assistant` part `{type:"text"}` |
| `session.text.delta{…, ordinal, delta}` | `text` chunk (or `stream_event.text_delta`) |
| `session.text.ended{…, ordinal, text}` | full `text` |
| `session.tool.input.started{sessionID, assistantMessageID, id, name}` | `tool_use.id` → `id`, `tool_use.name` → `name` (maki tool names remapped: `Bash`↔`bash`, `Read`↔`read` — `maki_to_claude_tool_name` in sdk_mode) |
| `session.tool.input.delta{…, id, delta}` | `stream_event.input_json_delta` (unobserved with synthetic) |
| `session.tool.input.ended{…, id, text}` | serialized `tool_use.input` JSON text |
| `session.tool.called{…, id, input, executed?}` | `tool_use.input` object (`executed` = maki ran it locally) |
| `session.tool.progress{…, id, metadata}` | no maki source (bridge-local, e.g. shell output ticks) |
| `session.tool.success{…, id, content:[{type:"text",text}\|{type:"file",…}]}` (**durable v2**) | `user` message `tool_result{tool_use_id, content, is_error:false}` |
| `session.tool.failed{…, id, error:{type,message,…}, content?}` (**durable v2**) | `tool_result{is_error:true}` (content string → `error.message`; `Session.StructuredError{type,message,status?,response?}` — validated in task 4.2; the spike's stub emitted `{name,data}` and the TUI tolerated it, but the spec shape is `{type,message}`) |
| `permission.asked` (ephemeral; `Permission.Request` fields: `id:"per…"`, `sessionID`, `action`, `resources[]`, `save[]?`, `message?`, `source:[{type:"tool",messageID,id}]`) | `control_request{request_id, request:{subtype:"can_use_tool", tool_name, input, tool_use_id}}` — field map: `tool_name`→`resources[0]`+`action:"allow"`, `input`→message, `tool_use_id`→`source.id`. Spec `Permission.Source` is an **object** `{type:"tool",messageID,id}`; the spike emitted an array and the TUI accepted it — the bridge should emit the object form (spec-valid, 4.2) |
| `permission.replied{sessionID, requestID, reply:"once"\|"always"\|"reject"}` (ephemeral) | the `control_response` the bridge sent (§4) |

## 4. Permission answers (measured correction to the design's assumption)

Design.md expected maki answers `AllowOnce | AllowSession | AllowAlwaysProject
| AllowAlwaysGlobal | Deny | DenyWithGuidance | DenyAlwaysProject |
DenyAlwaysGlobal` on the wire. Measured (live both ways +
disassembled `maki::sdk_mode::run`): the SDK wire answer is

```json
{"type":"control_response","response":{"request_id":"req_1","behavior":"allow"|"deny"}}
```

i.e. **only `allow` and `deny`** are representable; maki blocks the tool until
this line arrives (verified with delayed and withheld answers: the tool result
appears only after the response), and anything that is not `behavior:"allow"`
becomes "rejected by the user".

| OpenCode TUI reply (`POST …/permission/{per_}/reply` body, measured `{"decision":…}`) | OpenCode `permission.replied.reply` | Maki SDK wire `behavior` | maki internal enum (binary) |
|---|---|---|---|
| `{"decision":"once"}` | `once` | `allow` | `AllowOnce` |
| `{"decision":"always"}` | `always` | `allow` ⚠ scope lost | `AllowAlways*` |
| `{"decision":"reject"}` | `reject` | `deny` | `Deny*` |

⚠ **Finding / cost:** there is no "always"/session-scoped answer on maki's SDK
wire, so a bridge cannot honor OpenCode's `save:["once"|"always"]` rules
through this channel without extending maki (or answering `allow` per call and
re-asking every time — the safe default).

## 5. Id minting map (`ses_` / `msg_` / `per_` / `evt_`)

Schema patterns (2.0.32 spec): `Session.ID ^ses`, `Session.Message.ID ^msg_`,
`Permission.ID ^per`, `Event.ID ^evt_`; tool part ids are unpatterned strings.
Maki ids have none of these shapes, so the bridge mints and maps both ways:

| OpenCode id (minted) | Maki id (observed) | direction |
|---|---|---|
| `ses_<base58-or-uuid>` | `system.init.session_id` = `CgDMTPvaaggLhtd2NChwU` (base58) | one OpenCode session per maki session; keep maki's id as the map key, expose `ses_` + suffix (pattern `^ses` is prefix-only) |
| `msg_<…>` (per assistant message) | maki emits no message ids in `-p` output | bridge mints `msg_` per turn (assistant) and per prompt (user); `assistantMessageID` in every part event must be the same minted id for the turn |
| `per_<…>` (permission request) | `control_request.request_id` = `req_1` (counter per process) | bridge mints `per_` per ask; keep `req_1`↔`per_…` for the reply POST → `control_response.response.request_id` |
| `evt_<…>` (event envelope id) | none (maki has no event ids) | bridge mints per emitted frame |
| tool part `id` (free string) | `tool_use_id` = `chatcmpl-tool-b88fb5338f8…` (provider-prefixed) | pass through unchanged (spec allows any string) |

All OpenCode ids minted by the bridge must satisfy the 2.0.32 schemas —
validated in task 4.2 (`harness/validate-samples.mjs`).

## 6. Known gaps for the implementation change

- `always`/session-scoped permission answers are not expressible over maki's
  SDK wire (§4) — needs an maki extension or an always-re-ask bridge policy.
- `stream_event` shapes are sdk_mode-string-derived, not captured (synthetic
  model answered without streaming); capture once with a streaming provider.
- The OpenAPI SSE frame schema requires an `event` field the real server never
  sends; the bridge should follow the wire, not the schema.
- `session.step.streamed`, `session.tool.progress`, forms, inbox, worktrees,
  PTY/tunnel routes: no maki source; bridge-local or faked (out of scope by
  design).
