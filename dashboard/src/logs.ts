// SSE log hub.
//
// One hub per sandbox. The hub owns at most one `openshell logs --tail`
// child, fans its stdout lines out to every connected browser, keeps a
// bounded ring buffer for reconnect replay, and kills the child as soon as
// the last subscriber disconnects. The buffer survives disconnects so a
// reconnect can replay recent lines before new ones arrive.

import { type LogsProcess, type OpenShellClient, type Result } from "./openshell.ts";

/** Number of log lines retained for reconnect replay. */
export const LOG_BUFFER_LIMIT = 2000;

/** Heartbeat interval for SSE comments, milliseconds. */
const HEARTBEAT_MS = 15_000;

interface Subscriber {
  enqueue(chunk: Uint8Array): void;
  close(): void;
}

export interface LogSubscription {
  stream: ReadableStream<Uint8Array>;
  unsubscribe(): void;
}

export class LogHub {
  private readonly client: OpenShellClient;
  private readonly name: string;
  private readonly heartbeatMs: number;
  private readonly buffer: string[] = [];
  private readonly subscribers = new Set<Subscriber>();
  private readonly encoder = new TextEncoder();
  private proc: LogsProcess | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    client: OpenShellClient,
    name: string,
    options: { heartbeatMs?: number } = {},
  ) {
    this.client = client;
    this.name = name;
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  }

  /** Lines currently retained for replay (oldest first). */
  snapshot(): string[] {
    return [...this.buffer];
  }

  /** True while the tail child is running. */
  isRunning(): boolean {
    return this.proc !== null;
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  subscribe(): LogSubscription {
    let subscriber: Subscriber;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        subscriber = {
          enqueue: (chunk) => {
            try {
              controller.enqueue(chunk);
            } catch {
              this.removeSubscriber(subscriber);
            }
          },
          close: () => {
            try {
              controller.close();
            } catch {
              // Already closed by the client side.
            }
          },
        };
        this.subscribers.add(subscriber);
        this.start();
        this.send(subscriber, { event: "ready", data: this.name });
        for (const line of this.snapshot()) {
          this.send(subscriber, { data: line });
        }
      },
      cancel: () => {
        this.removeSubscriber(subscriber);
      },
    });
    return { stream, unsubscribe: () => this.removeSubscriber(subscriber) };
  }

  private removeSubscriber(subscriber: Subscriber): void {
    if (!this.subscribers.delete(subscriber)) return;
    if (this.subscribers.size === 0) this.stopChild();
  }

  private start(): void {
    if (this.stopped || this.proc) return;
    const spawned: Result<LogsProcess> = this.client.spawnLogs(this.name);
    if (!spawned.ok) {
      this.broadcast({ event: "failure", data: spawned.error.message });
      this.closeAll();
      return;
    }
    this.proc = spawned.value;
    this.heartbeat = setInterval(() => this.sendHeartbeat(), this.heartbeatMs);
    void this.pump(spawned.value);
  }

  private sendHeartbeat(): void {
    for (const subscriber of [...this.subscribers]) {
      subscriber.enqueue(this.encoder.encode(": ping\n\n"));
    }
  }

  private async pump(proc: LogsProcess): Promise<void> {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let index = pending.indexOf("\n");
        while (index !== -1) {
          const line = pending.slice(0, index).replace(/\r$/, "");
          pending = pending.slice(index + 1);
          this.push(line);
          index = pending.indexOf("\n");
        }
      }
      if (pending) this.push(pending);
    } catch {
      // The child was killed; nothing to drain.
    }

    const exitCode = await proc.exited;
    if (this.proc !== proc) return;
    this.stopChild();
    this.broadcast({ event: "end", data: String(exitCode) });
    this.closeAll();
  }

  private push(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length > LOG_BUFFER_LIMIT) {
      this.buffer.splice(0, this.buffer.length - LOG_BUFFER_LIMIT);
    }
    this.broadcast({ data: line });
  }

  private send(
    subscriber: Subscriber,
    message: { event?: string; data: string },
  ): void {
    subscriber.enqueue(this.encoder.encode(this.frame(message)));
  }

  private frame(message: { event?: string; data: string }): string {
    const event = message.event ? `event: ${message.event}\n` : "";
    // One SSE data line per log line; embedded newlines are gone by now.
    return `${event}data: ${message.data}\n\n`;
  }

  private broadcast(message: { event?: string; data: string }): void {
    for (const subscriber of [...this.subscribers]) this.send(subscriber, message);
  }

  private closeAll(): void {
    for (const subscriber of [...this.subscribers]) {
      this.subscribers.delete(subscriber);
      subscriber.close();
    }
  }

  private stopChild(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try {
        proc.kill();
      } catch {
        // Already exited.
      }
    }
  }

  /** Server shutdown: stop the child and end every stream. */
  stop(): void {
    this.stopped = true;
    this.stopChild();
    this.closeAll();
  }
}
