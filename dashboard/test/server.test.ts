// HTTP server tests: routing, JSON payloads against the stub CLI, token and
// read-only guards, and SSE lifecycle. No gateway, no Docker, no network
// beyond loopback.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DashboardConfig } from "../src/config.ts";
import {
  OpenShellClient,
  type LogsProcess,
  type Result,
} from "../src/openshell.ts";
import { createDashboardServer, type DashboardHandle } from "../src/server.ts";

const stubDir = join(import.meta.dir, "stub");

const testConfig: DashboardConfig = {
  image: "maki-agent:local",
  policy: "/repo/examples/policies/maki-minimal.yaml",
  providers: ["maki-anthropic"],
  cpu: "2",
  memory: "4Gi",
  configPath: "/home/test/.config/maki-openshell/config.toml",
};

let workDir: string;
let stateDir: string;
let logPath: string;
let handles: DashboardHandle[];

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "dashboard-server-test-"));
  stateDir = join(workDir, "state");
  logPath = join(workDir, "argv.log");
  mkdirSync(stateDir, { recursive: true });
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.stop();
  rmSync(workDir, { recursive: true, force: true });
});

function seedSandbox(name: string, phase = "Ready"): void {
  mkdirSync(join(stateDir, "sandboxes"), { recursive: true });
  mkdirSync(join(stateDir, "providers"), { recursive: true });
  writeFileSync(join(stateDir, "sandboxes", name), `${phase}\n`);
  writeFileSync(join(stateDir, "providers", name), "maki-anthropic\n");
}

function makeClient(env: Record<string, string | undefined> = {}): OpenShellClient {
  return new OpenShellClient({
    env: {
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      STUB_STATE_DIR: stateDir,
      STUB_LOG: logPath,
      ...env,
    },
  });
}

function start(
  overrides: {
    readOnly?: boolean;
    token?: string;
    config?: DashboardConfig;
    client?: OpenShellClient;
  } = {},
): DashboardHandle {
  const handle = createDashboardServer({
    port: 0,
    client: overrides.client ?? makeClient(),
    config: overrides.config ?? testConfig,
    readOnly: overrides.readOnly,
    token: overrides.token,
  });
  handles.push(handle);
  return handle;
}

function base(handle: DashboardHandle): string {
  return `http://127.0.0.1:${handle.port}`;
}

function authHeaders(handle: DashboardHandle): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-dashboard-token": handle.token ?? "",
  };
}

function argvLog(): string {
  return existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
}

function phase(name: string): string {
  return readFileSync(join(stateDir, "sandboxes", name), "utf8").trim();
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (!predicate(text)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`timed out waiting for SSE output; got: ${JSON.stringify(text)}`);
    }
    const result = await Promise.race([
      reader.read(),
      Bun.sleep(remaining).then(
        (): { done: boolean; value: Uint8Array | undefined } => ({
          done: true,
          value: undefined,
        }),
      ),
    ]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}

describe("page and doctor", () => {
  test("GET / serves the shell with the session bootstrap", async () => {
    const handle = start();
    const response = await fetch(`${base(handle)}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("dashboard-bootstrap");
    expect(html).toContain('src="/app.js"');
    expect(html).toContain(`"token":"${handle.token}"`);
    expect(html).toContain('"readOnly":false');
    expect(html).toContain('"refreshMs":3000');
    expect(html).toContain(testConfig.image);
  });

  test("read-only mode serves a page without a token", async () => {
    const handle = start({ readOnly: true });
    expect(handle.token).toBeNull();
    const html = await (await fetch(`${base(handle)}/`)).text();
    expect(html).toContain('"readOnly":true');
    expect(html).toContain('"token":null');
  });

  test("GET /api/doctor reports CLI and gateway status", async () => {
    const handle = start();
    const body = await (await fetch(`${base(handle)}/api/doctor`)).json();
    expect(body.cli.ok).toBe(true);
    expect(body.cli.version).toContain("openshell");
    expect(body.gateway.ok).toBe(true);
    expect(body.readOnly).toBe(false);
    expect(body.tokenRequired).toBe(true);
  });

  test("non-loopback bind requires an explicit token", () => {
    expect(() => createDashboardServer({ host: "0.0.0.0", port: 0 })).toThrow(/token/);
  });
});

describe("read routes", () => {
  test("GET /api/sandboxes lists inventory", async () => {
    seedSandbox("demo");
    const handle = start();
    const body = await (await fetch(`${base(handle)}/api/sandboxes`)).json();
    expect(body.sandboxes).toHaveLength(1);
    expect(body.sandboxes[0].name).toBe("demo");
    expect(body.sandboxes[0].phase).toBe("Ready");
  });

  test("GET /api/sandboxes/:name bundles detail, providers, and revisions", async () => {
    seedSandbox("demo");
    const handle = start();
    const response = await fetch(`${base(handle)}/api/sandboxes/demo`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sandbox.name).toBe("demo");
    expect(body.sandbox.policySource).toBe("sandbox");
    expect(body.providers[0].name).toBe("maki-anthropic");
    expect(body.revisions).toHaveLength(3);
    expect(body.errors).toEqual({});
  });

  test("policy view selects base or effective payload", async () => {
    seedSandbox("demo");
    const handle = start();
    const full = await (await fetch(`${base(handle)}/api/sandboxes/demo/policy`)).json();
    const baseView = await (
      await fetch(`${base(handle)}/api/sandboxes/demo/policy?view=base`)
    ).json();
    const fullKeys = Object.keys(full.policy.policy.network_policies);
    const baseKeys = Object.keys(baseView.policy.policy.network_policies);
    expect(fullKeys).toContain("provider:stub");
    expect(baseKeys).not.toContain("provider:stub");
  });

  test("rules list parses pending proposals", async () => {
    seedSandbox("demo");
    const handle = start();
    const body = await (
      await fetch(`${base(handle)}/api/sandboxes/demo/rules?status=pending`)
    ).json();
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0].chunkId).toBe("chunk-pending-1");
    expect(body.rules[0].status).toBe("pending");
  });

  test("unknown routes return 404 JSON", async () => {
    const handle = start();
    const response = await fetch(`${base(handle)}/api/nope`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.kind).toBe("not_found");
  });
});

describe("mutation guards", () => {
  test("mutating routes reject a missing or wrong token", async () => {
    seedSandbox("demo");
    const handle = start();

    const noToken = await fetch(`${base(handle)}/api/sandboxes/demo/stop`, { method: "POST" });
    expect(noToken.status).toBe(403);
    expect(phase("demo")).toBe("Ready");

    const wrongToken = await fetch(`${base(handle)}/api/sandboxes/demo/stop`, {
      method: "POST",
      headers: { "x-dashboard-token": "not-the-token" },
    });
    expect(wrongToken.status).toBe(403);
    expect(phase("demo")).toBe("Ready");

    const ok = await fetch(`${base(handle)}/api/sandboxes/demo/stop`, {
      method: "POST",
      headers: authHeaders(handle),
    });
    expect(ok.status).toBe(200);
    expect(phase("demo")).toBe("Stopped");
  });

  test("read-only mode rejects every mutation and performs no action", async () => {
    seedSandbox("demo");
    const handle = start({ readOnly: true });
    const response = await fetch(`${base(handle)}/api/sandboxes/demo/delete`, {
      method: "POST",
      headers: { "x-dashboard-token": "anything" },
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.kind).toBe("read_only");
    expect(existsSync(join(stateDir, "sandboxes", "demo"))).toBe(true);
  });

  test("create uses configured defaults and requires the token", async () => {
    seedSandbox("demo");
    const handle = start();

    const denied = await fetch(`${base(handle)}/api/sandboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "scratch" }),
    });
    expect(denied.status).toBe(403);
    expect(existsSync(join(stateDir, "sandboxes", "scratch"))).toBe(false);

    const created = await fetch(`${base(handle)}/api/sandboxes`, {
      method: "POST",
      headers: authHeaders(handle),
      body: JSON.stringify({ name: "scratch" }),
    });
    expect(created.status).toBe(201);
    expect(existsSync(join(stateDir, "sandboxes", "scratch"))).toBe(true);

    const log = argvLog();
    expect(log).toContain("--from");
    expect(log).toContain(testConfig.image);
    expect(log).toContain("--policy");
    expect(log).toContain(testConfig.policy!);
    expect(log).toContain("--provider");
    expect(log).toContain("maki-anthropic");
    expect(log).toContain("--cpu");
    expect(log).toContain("--memory");
  });

  test("rule approve and reject-with-reason hit the CLI; empty reason does not", async () => {
    seedSandbox("demo");
    const handle = start();

    const approve = await fetch(
      `${base(handle)}/api/sandboxes/demo/rules/chunk-pending-1/approve`,
      { method: "POST", headers: authHeaders(handle) },
    );
    expect(approve.status).toBe(200);
    expect(argvLog()).toContain("chunk-pending-1");

    const empty = await fetch(
      `${base(handle)}/api/sandboxes/demo/rules/chunk-pending-1/reject`,
      {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ reason: "   " }),
      },
    );
    expect(empty.status).toBe(400);
    expect(argvLog()).not.toContain("reject");

    const rejected = await fetch(
      `${base(handle)}/api/sandboxes/demo/rules/chunk-pending-1/reject`,
      {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ reason: "narrow the path" }),
      },
    );
    expect(rejected.status).toBe(200);
    expect(argvLog()).toContain("narrow the path");
  });

  test("malformed JSON bodies return 400", async () => {
    seedSandbox("demo");
    const handle = start();
    const response = await fetch(`${base(handle)}/api/sandboxes`, {
      method: "POST",
      headers: authHeaders(handle),
      body: "not json",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.kind).toBe("invalid_request");
  });
});

describe("page assets and DOM safety", () => {
  test("GET /app.js serves the client without HTML sinks", async () => {
    const handle = start();
    const response = await fetch(`${base(handle)}/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    const source = await response.text();
    expect(source).toContain("document.createElement");
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
      expect(source).not.toContain(sink);
    }
  });

  test("page and script carry hardening headers", async () => {
    const handle = start();
    const page = await fetch(`${base(handle)}/`);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    const script = await fetch(`${base(handle)}/app.js`);
    expect(script.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("bootstrap data block parses as JSON", async () => {
    const handle = start();
    const html = await (await fetch(`${base(handle)}/`)).text();
    const match = /<script id="dashboard-bootstrap" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.token).toBe(handle.token);
    expect(parsed.readOnly).toBe(false);
    expect(parsed.refreshMs).toBe(3000);
    expect(parsed.defaults.image).toBe(testConfig.image);
    expect(parsed.defaults.providers).toEqual(["maki-anthropic"]);
  });
});

describe("SSE logs", () => {
  test("streams stub log lines over SSE", async () => {
    seedSandbox("demo");
    const handle = start({
      client: makeClient({
        STUB_LOG_LINES: "3",
        STUB_LOG_INTERVAL: "0.01",
        STUB_LOG_KEEPALIVE: "0",
      }),
    });
    const response = await fetch(`${base(handle)}/events/logs?name=demo`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await readUntil(response.body!.getReader(), (value) =>
      value.includes("sandbox log line 2"),
    );
    expect(text).toContain("event: ready");
    expect(text).toContain("gateway log line 1");
    expect(text).toContain("sandbox log line 2");
  });

  test("client disconnect kills the tail child", async () => {
    seedSandbox("demo");
    let killed = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const fakeProcess: LogsProcess = {
      pid: 77,
      stdout,
      exited: new Promise<number>(() => {}),
      kill: () => {
        killed = true;
      },
    };
    const fakeClient = {
      spawnLogs: (): Result<LogsProcess> => ({ ok: true, value: fakeProcess }),
    } as unknown as OpenShellClient;
    const handle = start({ client: fakeClient });

    const abort = new AbortController();
    const response = await fetch(`${base(handle)}/events/logs?name=demo`, {
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    streamController?.enqueue(new TextEncoder().encode("through the stream\n"));
    await readUntil(reader, (value) => value.includes("through the stream"));
    expect(killed).toBe(false);

    abort.abort();
    const deadline = Date.now() + 2000;
    while (!killed && Date.now() < deadline) await Bun.sleep(10);
    expect(killed).toBe(true);
  });

  test("SSE without a name returns 400", async () => {
    const handle = start();
    const response = await fetch(`${base(handle)}/events/logs`);
    expect(response.status).toBe(400);
  });
});
