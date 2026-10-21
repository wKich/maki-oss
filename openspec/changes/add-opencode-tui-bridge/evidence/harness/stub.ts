// Observational logging stub for spike-opencode-tui-bridge (task 2.1).
// Ugly by design (design.md Non-Goals): it records what the TUI calls and
// answers from the captured OpenAPI spec; it is not bridge code.
//
//   bun harness/stub.ts            # PORT=4599 LOG=<jsonl> overridable
//
// Every request is appended to LOG as one JSON line (secrets redacted).
// Routes present in the spec get a synthesized 2xx body derived from the
// response schema; unknown routes get 404 so they show up in the trace.
// GET /api/event streams queued frames as SSE {id,event,data}; queue more
// with POST /__stub/event {"id","event","data"} (internal control route).

import spec from "../evidence/openapi-2.0.32.json";

const PORT = Number(process.env.PORT ?? 4599);
const LOG = process.env.LOG ?? new URL("./requests.jsonl", import.meta.url).pathname;

const specDoc = spec as OpenAPI;
type AnyObj = Record<string, any>;

// ---------- redaction (design decision 6: capture-time sanitization) ----------
const SECRET_KEY = /\b(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|cookie|credential)\b/i;
const SECRET_VALUE = /\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g;
function redact(v: any): any {
  if (typeof v === "string") return v.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    const out: AnyObj = {};
    for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : redact(val);
    return out;
  }
  return v;
}

// ---------- logging ----------
import { appendFileSync, existsSync, readdirSync } from "node:fs";
function log(entry: AnyObj) {
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

// ---------- spec routing ----------
type PathItem = AnyObj;
type OpenAPI = { paths: Record<string, PathItem>; components: { schemas: Record<string, any> } };

const routeMatchers = Object.keys(specDoc.paths).map((template) => {
  const rx = new RegExp(
    "^" + template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^/]+\\\}/g, "[^/]+") + "$",
  );
  return { template, rx };
});

function matchRoute(path: string): { template: string; item: PathItem } | null {
  for (const { template, rx } of routeMatchers) {
    const m = path.match(rx);
    if (m) return { template, item: specDoc.paths[template] };
  }
  return null;
}

function resolveRef(ref: string): any {
  if (!ref.startsWith("#/")) throw new Error(`external $ref: ${ref}`);
  let node: any = specDoc;
  for (const part of ref.slice(2).split("/")) node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  return node;
}

// ---------- JSON Schema (2020-12) → minimal instance ----------
function sample(schema: any): any {
  if (!schema || typeof schema !== "object") return null;
  if (schema.const !== undefined) return schema.const;
  // enums first: many TUI-facing fields are string enums (status, type,
  // delivery, mode...) and a generic "sample" string fails client decoding
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.$ref) return sample(resolveRef(schema.$ref));
  if (Array.isArray(schema.allOf)) {
    const merged: AnyObj = {};
    for (const s of schema.allOf) Object.assign(merged, sample(s) ?? {});
    return merged;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    if (Array.isArray(schema[key])) {
      const branch = schema[key].find((s: any) => s?.type !== "null") ?? schema[key][0];
      return sample(branch);
    }
  }
  const isObject = schema.type === "object" || (!schema.type && (schema.properties || schema.required));
  if (isObject) {
    const out: AnyObj = {};
    for (const key of schema.required ?? []) out[key] = sample(schema.properties?.[key]);
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      if (!(k in out) && (v as any)?.default !== undefined) out[k] = (v as any).default;
    }
    if (!Object.keys(out).length && schema.additionalProperties === false) {
      for (const [k, v] of Object.entries(schema.properties ?? {})) { out[k] = sample(v); break; }
    }
    return out;
  }
  switch (schema.type) {
    case "array": {
      if (Array.isArray(schema.prefixItems)) return schema.prefixItems.map(sample);
      return schema.items ? [sample(schema.items)] : [];
    }
    case "string": return patternSample(schema.pattern) ?? "sample";
    case "integer": case "number": return 0;
    case "boolean": return false;
    case "null": return null;
    default: return null;
  }
}

// literal-prefix patterns (^ses, ^msg_) are satisfiable; the rest get "sample"
function patternSample(pattern?: string): string | null {
  if (!pattern) return null;
  const lit = /^\^([A-Za-z0-9_-]+)/.exec(pattern);
  return lit ? `${lit[1]}_stub1` : "sample";
}

function successResponse(item: PathItem, method: string): { status: number; content: AnyObj } | null {
  const responses = item[method]?.responses;
  if (!responses) return null;
  const status = ["200", "201", "202", "204", "206"].find((s) => responses[s]) ?? Object.keys(responses)[0];
  return { status: Number(status), content: responses[status]?.content ?? {} };
}

// ---------- SSE fan-out ----------
const SSE_LOG = process.env.SSE_LOG ?? new URL("./sse-frames.jsonl", import.meta.url).pathname;
const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
let seq = 0;
const seenFrames: AnyObj[] = [];

function recordFrame(frame: AnyObj) {
  appendFileSync(SSE_LOG, JSON.stringify({ ts: new Date().toISOString(), ...frame }) + "\n");
}

function pushFrame(frame: AnyObj) {
  // encode exactly like the real 2.0.32 server: a bare `data:` line with the
  // JSON envelope, blank-line separated (no id:/event: fields)
  const f = { id: frame.id ?? `seq_${++seq}`, event: frame.event ?? "message", data: frame.data };
  seenFrames.push(f);
  recordFrame(f);
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify(f.data)}\n\n`);
  for (const c of subscribers) { try { c.enqueue(bytes); } catch { subscribers.delete(c); } }
}

// ---------- scripted turn (the stub plays the model) ----------
const LOC = process.cwd();
// Every directory answer resolves to an existing absolute path (see the
// resolveDir rule below); this is the fallback when a request names none.
const SYNTH_DIR = LOC;
// directories the client has told us about, keyed by session id — events
// must carry the same location as the session they belong to
const sessionLoc = new Map<string, string>();
// Envelope requirements are binary-derived: durable events need
// {id, created, type, durable:{aggregateID, seq, version}, data};
// ephemeral ones (deltas, permission.*) omit `durable`.
const DURABLE_VERSION: Record<string, number> = {
  "session.execution.started": 1, "session.execution.succeeded": 1,
  "session.step.started": 1, "session.step.ended": 1,
  "session.reasoning.started": 1, "session.reasoning.ended": 1,
  "session.text.started": 1, "session.text.ended": 1,
  "session.tool.input.started": 1, "session.tool.input.ended": 1,
  "session.tool.called": 1, "session.tool.success": 2, "session.tool.failed": 2,
};
let evtSeq = 0;
let durableSeq = 0;
function ev(type: string, data: AnyObj, delayMs: number) {
  setTimeout(() => {
    const event: AnyObj = { id: `evt_${++evtSeq}`, created: Date.now(), type };
    if (data.sessionID) event.location = { directory: sessionLoc.get(data.sessionID) ?? SYNTH_DIR };
    event.data = data;
    const version = DURABLE_VERSION[type];
    if (version) event.durable = { aggregateID: data.sessionID, seq: durableSeq++, version };
    // also land in the request log so a trace shows what was emitted (2.5)
    log({ note: "event-emitted", method: "-", path: "-", status: null, event });
    pushFrame({ id: event.id, event: type, data: event });
  }, delayMs);
}

function assistantIntro(sessionID: string, am: string, t: (n: number) => number) {
  ev("session.execution.started", { sessionID }, t(1));
  ev("session.step.started", {
    sessionID, assistantMessageID: am, agent: "agentprobe",
    model: { providerID: "sample", id: "modelprobe" }, started: Date.now(),
  }, t(2));
}

function assistantOutro(sessionID: string, am: string, t: (n: number) => number, text: string) {
  ev("session.text.started", { sessionID, assistantMessageID: am, ordinal: 0 }, t(10));
  ev("session.text.delta", { sessionID, assistantMessageID: am, ordinal: 0, delta: text }, t(11));
  ev("session.text.ended", { sessionID, assistantMessageID: am, ordinal: 0, text }, t(12));
  ev("session.step.ended", { sessionID, assistantMessageID: am, finish: "stop" }, t(13));
  ev("session.execution.succeeded", { sessionID }, t(14));
}

// First prompt of a run: a full turn with reasoning, tool and text parts so
// every part kind the mapping table needs is captured (tasks 2.3/2.4).
function scriptedTurn(sessionID: string, userMsgID: string) {
  const am = `msg_${userMsgID.replace(/^msg_/, "")}a`;
  const t = (n: number) => n * 60;
  ev("session.renamed", { sessionID, title: "RENAME_OK" }, t(0));
  assistantIntro(sessionID, am, t);
  ev("session.reasoning.started", { sessionID, assistantMessageID: am, ordinal: 0 }, t(3));
  ev("session.reasoning.delta", { sessionID, assistantMessageID: am, ordinal: 0, delta: "REASONINGPROBE" }, t(4));
  ev("session.reasoning.ended", { sessionID, assistantMessageID: am, ordinal: 0, text: "REASONINGPROBE" }, t(5));
  ev("session.tool.input.started", { sessionID, assistantMessageID: am, id: "tool_stub1", name: "toolprobe" }, t(6));
  ev("session.tool.input.ended", { sessionID, assistantMessageID: am, id: "tool_stub1", text: "TOOLINPUTPROBE" }, t(7));
  ev("session.tool.called", { sessionID, assistantMessageID: am, id: "tool_stub1", input: { command: "TOOLCALLPROBE" } }, t(8));
  ev("session.tool.success", { sessionID, assistantMessageID: am, id: "tool_stub1", content: [{ type: "text", text: "TOOLOUTPUTPROBE" }] }, t(9));
  // second tool ends in the Error state so the Streaming→Running→Completed
  // AND Streaming→Running→Error paths are both captured (design rubric 7)
  ev("session.tool.input.started", { sessionID, assistantMessageID: am, id: "tool_stub2", name: "toolprobe" }, t(9) + 30);
  ev("session.tool.called", { sessionID, assistantMessageID: am, id: "tool_stub2", input: { command: "TOOLFAILPROBE" } }, t(9) + 60);
  ev("session.tool.failed", {
    sessionID, assistantMessageID: am, id: "tool_stub2",
    error: { name: "Error", data: { message: "TOOLFAILPROBE: exit 1" } },
  }, t(9) + 90);
  assistantOutro(sessionID, am, t, "TEXTPROBE_ONE TEXTPROBE_TWO");
}

// Second prompt of a run: raise a permission request and wait for the TUI's
// reply POST; the turn finishes once that reply arrives (task 2.5).
const amBySession = new Map<string, string>();

function permissionAsk(sessionID: string, userMsgID: string) {
  const am = `msg_${userMsgID.replace(/^msg_/, "")}a`;
  amBySession.set(sessionID, am);
  const t = (n: number) => n * 60;
  assistantIntro(sessionID, am, t);
  ev("permission.asked", {
    id: "per_stub1",
    sessionID,
    action: "allow",
    resources: ["Bash"],
    save: ["once"],
    message: "Stub wants to run: echo probe",
    source: [{ type: "tool", messageID: am, id: "tool_stub1" }],
  }, t(5));
}

function permissionAnswered(sessionID: string, requestID: string, reply: string) {
  const t = (n: number) => n * 60;
  const am = amBySession.get(sessionID);
  ev("permission.replied", { sessionID, requestID, reply }, t(1));
  if (am) assistantOutro(sessionID, am, t, `PERMISSION_${String(reply).toUpperCase()}_OK`);
}

// ---------- server ----------
// first prompt of a run plays a full turn; later prompts raise a permission
let promptCount = 0;
Bun.serve({
  port: PORT,
  // SSE connections are long-lived; Bun's default idle timeout would cut them
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const path = url.pathname;
    const bodyText = method === "GET" || method === "HEAD" ? "" : await req.text();
    let body: any = bodyText;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* keep raw */ }

    const headers: AnyObj = {};
    req.headers.forEach((v, k) => { headers[k] = v; });

    if (path === "/api/event" && method === "GET") {
      log({ method, path, query: Object.fromEntries(url.searchParams), headers: redact(headers), body: null, status: 200, matched: true, route: "/api/event", note: "sse-open" });
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      const enc = new TextEncoder();
      // the client refuses a stream that does not start with server.connected
      // (binary: "Event stream did not start with server.connected")
      // byte-for-byte shape of the real 2.0.32 server's first frame
      const connectedPayload = { id: "evt_conn_1", type: "server.connected", data: {} };
      const connected = `data: ${JSON.stringify(connectedPayload)}\n\n`;
      recordFrame({ id: "conn_1", event: "server.connected", data: connectedPayload });
      // flush headers immediately: without an early byte Bun buffers the
      // response and the client treats the stream as dead and reconnects
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c; subscribers.add(c);
          c.enqueue(enc.encode(connected));
          const replay = seenFrames.map((f) => `data: ${JSON.stringify(f.data)}\n\n`).join("");
          if (replay) c.enqueue(enc.encode(replay));
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    }

    if (path === "/__stub/event" && method === "POST") {
      pushFrame(body ?? {});
      log({ method, path, headers: redact(headers), body: redact(body), status: 200, note: "frame-injected" });
      return new Response(null, { status: 200 });
    }

    const match = matchRoute(path);
    const op = match && match.item[method.toLowerCase()];
    let status: number, payload: any = null, matched = Boolean(op);

    if (!op) {
      status = 404;
    } else {
      const res = successResponse(match.item, method.toLowerCase());
      status = res?.status ?? 200;
      const json = res?.content?.["application/json"]?.schema;
      if (json && status !== 204) payload = sample(json);
      // identify as the pinned server: a mismatched version makes the TUI warn
      if (path === "/api/info") payload = { ...payload, version: "2.0.32" };
      // synthesized ids must not invent sessions: an empty active map keeps
      // the TUI in its own new session, and echoing request ids keeps the
      // client's session state keyed to what it just created
      if (path === "/api/session/active") payload = { data: {} }; // set late: the session-by-id rule matches "active" too
      // synthesized list items act as phantom forms/permission prompts and
      // block the transcript; the spike drives those deliberately instead
      // first enum value here is "required", which makes the TUI wait for a
      // migration and never submit; say the migration is done
      if (path === "/api/experimental/migration/v1") payload = { status: "completed" };
      // a synthesized config document (path "sample") makes the TUI try to
      // load a config file that does not exist and it stalls before submit
      if (method === "GET" && path === "/api/config") payload = [];
      // enum order puts "subagent" first: with no primary agent the composer
      // has nothing to submit as and Enter does nothing
      if (method === "GET" && path === "/api/agent" && Array.isArray((payload as AnyObj)?.data)) {
        payload = { ...(payload as AnyObj), data: (payload as AnyObj).data.map((a: AnyObj) => ({ ...a, mode: "primary" })) };
      }
      if (method === "GET" && /\/(form|permission|terminal)$/.test(path) && payload && typeof payload === "object") {
        payload = { ...(payload as AnyObj), data: [] }; // keep required `location`
      }
      // Synthesized phantom sessions/messages block input (the TUI hydrates
      // them and spins): empty lists, and single-session reads echo the id
      if (method === "GET" && path === "/api/session") payload = { ...payload, data: [] };
      if (method === "GET" && /\/(message|inbox)$/.test(path)) payload = { ...payload, data: [] };
      // Every response that names a directory must agree with the directory
      // the TUI asked for: a mismatch (or a relative path that resolves
      // nowhere) makes it treat the location as unavailable and the composer
      // stops accepting submits. Relative requests resolve into the fixture
      // directory harness/sample/, which exists on disk.
      const qLoc = url.searchParams.get("location[directory]");
      const resolveDir = (d?: string | null) => (d ? (d.startsWith("/") ? d : `${LOC}/${d}`) : SYNTH_DIR);
      if (path === "/api/location") {
        const dir = resolveDir(qLoc ?? (payload as AnyObj)?.directory);
        payload = { directory: dir, project: { id: "sample", directory: LOC, canonical: LOC } };
      } else if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const loc = (payload as AnyObj).location;
        if (loc && typeof loc === "object") (payload as AnyObj).location = { ...loc, directory: resolveDir(qLoc ?? loc.directory) };
      }
      if (method === "GET" && path === "/api/project") {
        // the single synthetic project is the cwd itself: a project canonical
        // pointing at a subdirectory makes the TUI move the session into it
        // and then declare the location unavailable
        // synthetic sandbox paths ("sample") read as an unusable project
        const patch = (pr: AnyObj) => ({ ...pr, canonical: LOC, sandboxes: [] });
        if (Array.isArray(payload)) payload = payload.map(patch);
        else if (Array.isArray((payload as AnyObj)?.data)) payload = { ...payload, data: (payload as AnyObj).data.map(patch) };
      }
      if (method === "POST" && path === "/api/session" && payload?.data) {
        const dir = resolveDir(body?.location?.directory);
        const data: AnyObj = { ...payload.data, location: { directory: dir } };
        if (body?.id) { data.id = body.id; sessionLoc.set(body.id, dir); }
        payload = { ...payload, data };
      }
      if (method === "GET" && /^\/api\/session\/(?!active$)[^/]+$/.test(path) && payload?.data) {
        const sid = path.split("/")[3];
        // prefer what the create call told us: re-resolving the synthesized
        // value re-introduces "sample" and the location-unavailable modal
        const dir = sessionLoc.get(sid) ?? resolveDir(payload.data?.location?.directory);
        sessionLoc.set(sid, dir);
        payload = { ...payload, data: { ...payload.data, id: sid, location: { directory: dir } } };
      }
      if (method === "POST" && path.endsWith("/prompt") && payload?.data) {
        payload = { ...payload, data: { ...payload.data, id: body?.id ?? payload.data.id, sessionID: path.split("/")[3] } };
      }
      // synthesized strings love the value "sample"; any directory-shaped
      // field pointing nowhere sends the TUI chasing a move it then refuses
      // as unavailable, so normalize every directory/canonical to an
      // existing absolute path (relative values land in harness/sample/)
      if (path === "/api/session/active") payload = { data: {} };
      const absDirs = (o: any): any => {
        if (Array.isArray(o)) return o.map(absDirs);
        if (o && typeof o === "object") {
          const out: AnyObj = {};
          for (const [k, v] of Object.entries(o)) {
            // a synthesized subpath like "sample" makes the TUI join it onto
            // the session directory and then fail its existence check
            if (k === "subpath" && typeof v === "string") out[k] = "";
            else out[k] = (k === "directory" || k === "canonical") && typeof v === "string" ? resolveDir(v) : absDirs(v);
          }
          return out;
        }
        return o;
      };
      if (payload && typeof payload === "object") payload = absDirs(payload);
      if (method === "GET" && path === "/api/fs/list" && payload && typeof payload === "object") {
        // The TUI's "session location unavailable" check reads this listing:
        // synthesized entries (type "sample") or an empty listing for a
        // directory that should have contents both read as unavailable.
        // Serve the real listing for directories inside this change dir only
        // (names + type, nothing else leaves the harness).
        const base = resolveDir(url.searchParams.get("location[directory]"));
        const rel = url.searchParams.get("path");
        const target = rel ? (rel.startsWith("/") ? rel : `${base}/${rel}`) : base;
        const inside = target === LOC || target.startsWith(`${LOC}/`);
        let entries: AnyObj[] = [];
        if (inside && existsSync(target)) {
          entries = readdirSync(target, { withFileTypes: true })
            .map((d) => ({ path: d.name, type: d.isDirectory() ? "directory" : "file" }))
            .sort((a, b) => String(a.path).localeCompare(String(b.path)));
        }
        payload = { location: { directory: target }, data: entries };
      }
      if (method === "GET" && path === "/api/worktree") {
        payload = Array.isArray(payload) ? [] : { ...(payload as AnyObj), data: [] };
      }
    }

    log({
      method, path, query: Object.fromEntries(url.searchParams), headers: redact(headers),
      body: redact(body), resp: redact(payload), matched, route: match?.template ?? null, status,
    });

    if (method === "POST" && path.endsWith("/prompt")) {
      const sid = path.split("/")[3];
      const mid = typeof body?.id === "string" ? body.id : `msg_stub${sid.slice(-6)}`;
      promptCount += 1;
      if (promptCount === 1) scriptedTurn(sid, mid);
      else permissionAsk(sid, mid);
    }

    if (method === "POST" && /\/permission\/[^/]+\/reply$/.test(path)) {
      const sid = path.split("/")[3];
      const reqId = path.split("/")[5];
      permissionAnswered(sid, reqId, body?.decision ?? "once");
    }

    if (status === 404) return new Response(JSON.stringify({ error: "stub: no spec route for " + method + " " + path }), { status, headers: { "content-type": "application/json" } });
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(payload ?? null), { status, headers: { "content-type": "application/json" } });
  },
});

console.log(`stub listening on http://127.0.0.1:${PORT} (log: ${LOG})`);
