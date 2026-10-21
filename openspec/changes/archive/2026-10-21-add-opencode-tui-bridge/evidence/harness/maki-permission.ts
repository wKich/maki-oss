// Drives one maki SDK session that must ask permission (task 3.3), answers
// the control_request from stdin, and records both directions into
// evidence/maki-permission.jsonl.
//
// Wire format (reverse-engineered from the maki binary's sdk_mode::run and
// confirmed live):
//   in : {"type":"control_request","request_id":"req_1",
//         "request":{"subtype":"can_use_tool","tool_name":"Bash",
//                    "input":{...},"tool_use_id":"..."}}
//   out: {"type":"control_response",
//         "response":{"request_id":"req_1","behavior":"allow"|"deny"}}
// maki blocks the tool until the response line arrives (verified with a
// delayed and a withheld answer); anything but `behavior: "allow"` maps to
// "rejected by the user".
//
// Forcing the ask (design.md decision 3, option a): the host
// ~/.config/maki/init.lua rm-escalation layer answers `ask` for any command
// containing `rm`, which fires even under always_yolo. Option (b) — a scratch
// XDG_CONFIG_HOME without always_yolo — is used via the XDG_CONFIG_HOME env.
//
//   bun harness/maki-permission.ts            # BEHAVIOR=deny for a deny round trip
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync, unlinkSync } from "node:fs";

const OUT = new URL("../evidence/maki-permission.jsonl", import.meta.url).pathname;
if (!process.env.APPEND) writeFileSync(OUT, "");

const PROBE = process.env.PROBE_FILE ?? "/tmp/maki-permission-probe.txt";
const BEHAVIOR = process.env.BEHAVIOR ?? "allow";
const PROMPT = process.env.PROMPT
  ?? "Use your shell tool to run exactly: rm -f /tmp/maki-permission-probe.txt . Then reply with the single word DONE.";

try { unlinkSync(PROBE); } catch { /* absent */ }
writeFileSync(PROBE, "probe\n");

function record(dir: "in" | "out", obj: any) {
  appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), dir, ...obj }) + "\n");
}

const child = spawn("maki", [
  "-p",
  "--input-format", "stream-json",
  "--output-format", "stream-json",
  "-m", "synthetic/syn:small:text",
], { stdio: ["pipe", "pipe", "pipe"] });

child.stderr.on("data", (d) => process.stderr.write(d));

let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let obj: any;
    try { obj = JSON.parse(line); } catch { record("out", { raw: line }); continue; }
    record("out", obj);

    if (obj.type === "control_request" && obj.request?.subtype === "can_use_tool") {
      const reply = {
        type: "control_response",
        response: { request_id: obj.request_id, behavior: BEHAVIOR },
      };
      record("in", reply);
      child.stdin.write(JSON.stringify(reply) + "\n");
    }
    if (obj.type === "result") setTimeout(() => child.kill(), 500);
  }
});

child.on("exit", (code) => {
  record("out", { type: "driver.exit", code });
  console.log(`maki exited with ${code}; behavior=${BEHAVIOR}; capture: ${OUT}`);
  process.exit(0);
});

const userMsg = {
  type: "user",
  message: { role: "user", content: [{ type: "text", text: PROMPT }] },
};
record("in", userMsg);
child.stdin.write(JSON.stringify(userMsg) + "\n");

setTimeout(() => { child.kill(); record("out", { type: "driver.timeout" }); }, 180_000);
