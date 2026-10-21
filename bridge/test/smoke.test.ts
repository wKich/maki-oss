// Smoke test: proves `cd bridge && bun test` discovers and runs tests in
// this directory (task 1.3) and that the committed fixtures are in place.
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

test("fixtures are in place", () => {
  for (const f of ["maki-plain", "maki-tool", "maki-precheck", "maki-permission"]) {
    expect(existsSync(new URL(`./fixtures/${f}.jsonl`, import.meta.url))).toBe(true);
  }
});
