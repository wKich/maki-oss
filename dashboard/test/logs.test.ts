// LogHub tests: stream fan-out, ring buffer, reconnect replay, heartbeat,
// cleanup on unsubscribe, and child exit. Uses a fake `LogsProcess` so the
// lifecycle is deterministic; server.test.ts covers the real stub end to end.

import { describe, expect, test } from "bun:test";
import { LOG_BUFFER_LIMIT, LogHub } from "../src/logs.ts";
import type { LogsProcess, OpenShellClient, Result } from "../src/openshell.ts";

const encoder = new TextEncoder();

interface FakeProcess {
  proc: LogsProcess;
  killed: () => boolean;
  emit(line: string): void;
  end(code: number): void;
}

function fakeProcess(): FakeProcess {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stdout = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  let killed = false;
  return {
    proc: {
      pid: 4242,
      stdout,
      exited,
      kill: () => {
        killed = true;
      },
    },
    killed: () => killed,
    emit: (line) => controller?.enqueue(encoder.encode(`${line}\n`)),
    end: (code) => {
      controller?.close();
      resolveExit(code);
    },
  };
}

function hubWith(
  factory: () => FakeProcess | Result<LogsProcess>,
  options: { heartbeatMs?: number; onIdle?: () => void } = {},
): { hub: LogHub; spawned: FakeProcess[] } {
  const spawned: FakeProcess[] = [];
  const client = {
    spawnLogs: (): Result<LogsProcess> => {
      const result = factory();
      if ("ok" in result) return result;
      spawned.push(result);
      return { ok: true, value: result.proc };
    },
  } as unknown as OpenShellClient;
  const hub = new LogHub(client, "demo", options);
  return { hub, spawned };
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
      throw new Error(`timed out waiting for stream output; got: ${JSON.stringify(text)}`);
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

describe("LogHub", () => {
  test("streams lines, buffers them, and replays them on reconnect", async () => {
    const { hub, spawned } = hubWith(fakeProcess);

    const first = hub.subscribe();
    const firstReader = first.stream.getReader();
    await readUntil(firstReader, (text) => text.includes("event: ready"));
    spawned[0]!.emit("alpha");
    await readUntil(firstReader, (text) => text.includes("data: alpha"));
    first.unsubscribe();
    expect(hub.isRunning()).toBe(false);

    // Reconnect: the retained buffer replays before any new lines.
    const second = hub.subscribe();
    const secondReader = second.stream.getReader();
    const replay = await readUntil(secondReader, (text) => text.includes("data: alpha"));
    expect(replay).toContain('event: ready');
    expect(replay).toContain("data: alpha");
    second.unsubscribe();
    hub.stop();
  });

  test("unsubscribe kills the tail child once the last client leaves", async () => {
    const { hub, spawned } = hubWith(fakeProcess);

    const a = hub.subscribe();
    const b = hub.subscribe();
    expect(hub.isRunning()).toBe(true);
    expect(hub.subscriberCount()).toBe(2);

    a.unsubscribe();
    expect(spawned[0]!.killed()).toBe(false);
    b.unsubscribe();
    expect(spawned[0]!.killed()).toBe(true);
    expect(hub.isRunning()).toBe(false);
    hub.stop();
  });

  test("sends heartbeat comments", async () => {
    const { hub } = hubWith(fakeProcess, { heartbeatMs: 20 });

    const subscription = hub.subscribe();
    const text = await readUntil(subscription.stream.getReader(), (value) =>
      value.includes(": ping"),
    );
    expect(text).toContain(": ping");
    subscription.unsubscribe();
    hub.stop();
  });

  test("closes subscribers with an end event when the tail exits", async () => {
    const { hub, spawned } = hubWith(fakeProcess);

    const subscription = hub.subscribe();
    const reader = subscription.stream.getReader();
    spawned[0]!.emit("before exit");
    spawned[0]!.end(0);
    const text = await readUntil(reader, (value) => value.includes("event: end"));
    expect(text).toContain("data: before exit");
    expect(text).toContain("event: end");
    expect(text).toContain("data: 0");
    expect(hub.isRunning()).toBe(false);
    hub.stop();
  });

  test("surfaces spawn errors as an SSE failure event", async () => {
    const { hub } = hubWith(() => ({
      ok: false,
      error: { kind: "missing_cli", message: "openshell CLI not found: openshell" },
    }));

    const subscription = hub.subscribe();
    const text = await readUntil(subscription.stream.getReader(), (value) =>
      value.includes("event: failure"),
    );
    expect(text).toContain("openshell CLI not found");
    hub.stop();
  });

  test("reports idle once the last subscriber leaves and the child is dead", async () => {
    let idle = 0;
    const { hub, spawned } = hubWith(fakeProcess, { onIdle: () => (idle += 1) });

    const a = hub.subscribe();
    const b = hub.subscribe();
    a.unsubscribe();
    expect(idle).toBe(0);

    b.unsubscribe();
    expect(spawned[0]!.killed()).toBe(true);
    expect(idle).toBe(1);

    // Repeated disconnects must not fire the callback again.
    b.unsubscribe();
    hub.stop();
    expect(idle).toBe(1);
  });

  test("reports idle when the tail exits on its own", async () => {
    let idle = 0;
    const { hub, spawned } = hubWith(fakeProcess, { onIdle: () => (idle += 1) });

    const subscription = hub.subscribe();
    const reader = subscription.stream.getReader();
    spawned[0]!.end(0);
    await readUntil(reader, (value) => value.includes("event: end"));
    expect(idle).toBe(1);
    subscription.unsubscribe();
    hub.stop();
    expect(idle).toBe(1);
  });

  test("ring buffer retains only the most recent lines", async () => {
    const { hub, spawned } = hubWith(fakeProcess);
    const subscription = hub.subscribe();
    const reader = subscription.stream.getReader();
    for (let index = 0; index < LOG_BUFFER_LIMIT + 5; index += 1) {
      spawned[0]!.emit(`line ${index}`);
    }
    // Wait until the last line has flowed through the pump.
    await readUntil(reader, (text) => text.includes(`line ${LOG_BUFFER_LIMIT + 4}`));
    const snapshot = hub.snapshot();
    expect(snapshot).toHaveLength(LOG_BUFFER_LIMIT);
    expect(snapshot[0]).toBe("line 5");
    expect(snapshot[snapshot.length - 1]).toBe(`line ${LOG_BUFFER_LIMIT + 4}`);
    subscription.unsubscribe();
    hub.stop();
  });
});
