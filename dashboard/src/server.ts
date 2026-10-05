// HTTP server: Bun.serve routes for the page, the JSON API, and the log SSE
// stream.
//
// Safety model (see the change design):
//   - loopback bind by default; any other host requires an explicit token;
//   - mutating routes require the session token in `X-Dashboard-Token`, which
//     also blocks cross-site form posts;
//   - `--read-only` rejects every mutating route with 403.

import { loadConfig, type DashboardConfig } from "./config.ts";
import { LogHub } from "./logs.ts";
import {
  OpenShellClient,
  type OpenShellClientOptions,
  type OpenShellError,
  type Result,
} from "./openshell.ts";
import { renderPage } from "./page.ts";
import { join } from "node:path";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
export const REFRESH_MS = 3000;

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const JS_HEADERS = {
  "content-type": "application/javascript; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export interface DashboardServerOptions {
  host?: string;
  port?: number;
  token?: string;
  readOnly?: boolean;
  config?: DashboardConfig;
  client?: OpenShellClient;
  clientOptions?: OpenShellClientOptions;
}

export interface DashboardHandle {
  port: number;
  hostname: string;
  token: string | null;
  readOnly: boolean;
  stop(): void;
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function mintToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/** HTTP status for a normalized CLI error. */
export function errorStatus(error: OpenShellError): number {
  switch (error.kind) {
    case "invalid_request":
      return 400;
    case "missing_cli":
      return 503;
    case "timeout":
      return 504;
    case "exit":
    case "invalid_json":
      return 502;
    default:
      return 500;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(error: OpenShellError, status = errorStatus(error)): Response {
  return json({ error }, status);
}

function forbidden(kind: string, message: string): Response {
  return json({ error: { kind, message } }, 403);
}

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

interface CreateBody {
  name?: unknown;
  image?: unknown;
  policy?: unknown;
  providers?: unknown;
  cpu?: unknown;
  memory?: unknown;
}

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardHandle {
  const hostname = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? DEFAULT_PORT;
  const readOnly = options.readOnly ?? false;
  const explicitToken = options.token?.trim() || null;

  if (!isLoopbackHost(hostname) && !explicitToken) {
    throw new Error(
      `binding to non-loopback host '${hostname}' requires an explicit --token`,
    );
  }
  if (!isLoopbackHost(hostname)) {
    console.warn(
      `warning: dashboard bound to ${hostname}; it is reachable beyond this machine`,
    );
  }

  const token = readOnly ? null : (explicitToken ?? mintToken());
  const config = options.config ?? loadConfig();
  const client = options.client ?? new OpenShellClient(options.clientOptions);
  const hubs = new Map<string, LogHub>();

  const guardMutation = (request: Request): Response | null => {
    if (readOnly) {
      return forbidden("read_only", "dashboard is running in read-only mode");
    }
    const provided = request.headers.get("x-dashboard-token") ?? "";
    if (!token || !provided || !tokensEqual(provided, token)) {
      return forbidden("forbidden", "missing or invalid session token");
    }
    return null;
  };

  const serveLogs = (url: URL, request: Request): Response => {
    const name = (url.searchParams.get("name") ?? "").trim();
    if (!name) {
      return json(
        { error: { kind: "invalid_request", message: "name query parameter is required" } },
        400,
      );
    }
    let hub = hubs.get(name);
    if (!hub) {
      hub = new LogHub(client, name);
      hubs.set(name, hub);
    }
    const subscription = hub.subscribe();
    if (request.signal.aborted) {
      subscription.unsubscribe();
    } else {
      request.signal.addEventListener("abort", () => subscription.unsubscribe());
    }
    return new Response(subscription.stream, { headers: SSE_HEADERS });
  };

  const handleApi = async (request: Request, segments: string[]): Promise<Response> => {
    const method = request.method.toUpperCase();

    if (method === "GET" && segments.length === 2 && segments[1] === "doctor") {
      const result = await client.doctor();
      if (!result.ok) return errorResponse(result.error);
      return json({ ...result.value, readOnly, tokenRequired: !readOnly });
    }

    if (segments[1] !== "sandboxes") {
      return json({ error: { kind: "not_found", message: "unknown route" } }, 404);
    }

    // Collection: GET /api/sandboxes, POST /api/sandboxes
    if (segments.length === 2) {
      if (method === "GET") {
        const result = await client.listSandboxes();
        if (!result.ok) return errorResponse(result.error);
        return json({ sandboxes: result.value });
      }
      if (method === "POST") {
        const denied = guardMutation(request);
        if (denied) return denied;
        let body: CreateBody;
        try {
          body = (await request.json()) as CreateBody;
        } catch {
          return errorResponse({ kind: "invalid_request", message: "request body must be JSON" }, 400);
        }
        const asText = (value: unknown): string =>
          typeof value === "string" ? value.trim() : "";
        const providers = Array.isArray(body.providers)
          ? body.providers.map((entry) => String(entry)).filter(Boolean)
          : config.providers;
        const result = await client.createSandbox({
          name: asText(body.name),
          image: asText(body.image) || config.image,
          policy: asText(body.policy) || config.policy || undefined,
          providers,
          cpu: asText(body.cpu) || config.cpu || undefined,
          memory: asText(body.memory) || config.memory || undefined,
        });
        if (!result.ok) return errorResponse(result.error);
        return json(result.value, 201);
      }
      return json({ error: { kind: "not_found", message: "unknown route" } }, 404);
    }

    const name = segments[2] ?? "";
    if (!name) {
      return json({ error: { kind: "invalid_request", message: "sandbox name is required" } }, 400);
    }

    // GET /api/sandboxes/:name
    if (segments.length === 3 && method === "GET") {
      const [sandbox, providers, revisions] = await Promise.all([
        client.getSandbox(name),
        client.listProviders(name),
        client.policyList(name),
      ]);
      if (!sandbox.ok) return errorResponse(sandbox.error);
      const errors: Record<string, string> = {};
      if (!providers.ok) errors.providers = providers.error.message;
      if (!revisions.ok) errors.revisions = revisions.error.message;
      return json({
        sandbox: sandbox.value,
        providers: providers.ok ? providers.value : [],
        revisions: revisions.ok ? revisions.value : [],
        errors,
      });
    }

    // GET /api/sandboxes/:name/policy
    if (segments.length === 4 && segments[3] === "policy" && method === "GET") {
      const view = new URL(request.url).searchParams.get("view") === "base" ? "base" : "full";
      const result = await client.policyGet(name, view);
      if (!result.ok) return errorResponse(result.error);
      return json({ policy: result.value });
    }

    // GET /api/sandboxes/:name/rules
    if (segments.length === 4 && segments[3] === "rules" && method === "GET") {
      const status = new URL(request.url).searchParams.get("status") ?? "pending";
      const result = await client.rules(name, status);
      if (!result.ok) return errorResponse(result.error);
      return json({ rules: result.value });
    }

    // POST /api/sandboxes/:name/start|stop|delete
    if (
      segments.length === 4 &&
      method === "POST" &&
      (segments[3] === "start" || segments[3] === "stop" || segments[3] === "delete")
    ) {
      const denied = guardMutation(request);
      if (denied) return denied;
      const result = await client.sandboxAction(segments[3], name);
      if (!result.ok) return errorResponse(result.error);
      return json(result.value);
    }

    // POST /api/sandboxes/:name/rules/:chunkId/approve|reject
    if (
      segments.length === 6 &&
      segments[3] === "rules" &&
      method === "POST" &&
      (segments[5] === "approve" || segments[5] === "reject")
    ) {
      const denied = guardMutation(request);
      if (denied) return denied;
      const chunkId = segments[4] ?? "";
      if (segments[5] === "approve") {
        const result = await client.approveRule(name, chunkId);
        if (!result.ok) return errorResponse(result.error);
        return json(result.value);
      }
      let reason = "";
      try {
        const body = (await request.json()) as { reason?: unknown };
        reason = typeof body.reason === "string" ? body.reason : "";
      } catch {
        return errorResponse({ kind: "invalid_request", message: "request body must be JSON" }, 400);
      }
      const result = await client.rejectRule(name, chunkId, reason);
      if (!result.ok) return errorResponse(result.error);
      return json(result.value);
    }

    return json({ error: { kind: "not_found", message: "unknown route" } }, 404);
  };

  const server = Bun.serve({
    hostname,
    port: requestedPort,
    async fetch(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const method = request.method.toUpperCase();

        if (method === "GET" && (segments.length === 0 || segments[0] === "index.html")) {
          return new Response(renderPage({ token, readOnly, refreshMs: REFRESH_MS, config }), {
            headers: HTML_HEADERS,
          });
        }
        if (method === "GET" && segments[0] === "app.js") {
          const source = await Bun.file(join(import.meta.dir, "app.js")).text();
          return new Response(source, { headers: JS_HEADERS });
        }
        if (method === "GET" && segments[0] === "favicon.ico") {
          return new Response(null, { status: 204 });
        }
        if (segments[0] === "api") {
          return await handleApi(request, segments);
        }
        if (method === "GET" && segments[0] === "events" && segments[1] === "logs") {
          return serveLogs(url, request);
        }
        return json({ error: { kind: "not_found", message: "unknown route" } }, 404);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return json(
          { error: { kind: "internal", message: "unexpected dashboard error", detail } },
          500,
        );
      }
    },
  });

  return {
    port: server.port,
    hostname: server.hostname,
    token,
    readOnly,
    stop: () => {
      for (const hub of hubs.values()) hub.stop();
      hubs.clear();
      server.stop(true);
    },
  };
}

export type { Result };
