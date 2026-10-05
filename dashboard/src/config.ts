// Dashboard configuration.
//
// Create-time defaults come from the helper's config file
// (`${XDG_CONFIG_HOME:-~/.config}/maki-openshell/config.toml`) so both tools
// use the same image, policy, providers, and resources. Parsing is
// independent of the shell helper and tolerant: unknown keys (validated
// strictly by the helper) are ignored here because the dashboard only reads
// the subset it needs.
//
// Server settings come from flags and DASHBOARD_* environment variables in
// main.ts, not from this file.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_IMAGE = "maki-agent:local";

export interface DashboardConfig {
  /** Container image for `sandbox create --from`. */
  image: string;
  /** Policy YAML path, or null to let the gateway use its default. */
  policy: string | null;
  /** Provider profile names attached at creation. */
  providers: string[];
  cpu: string | null;
  memory: string | null;
  /** Config file that was read (for diagnostics), or null when absent. */
  configPath: string | null;
}

/** Path of the shared helper/dashboard config file. */
export function configFilePath(env: Record<string, string | undefined>): string {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const base = env.XDG_CONFIG_HOME || join(home || "/tmp", ".config");
  return join(base, "maki-openshell", "config.toml");
}

/**
 * Parse `key = "value"` lines, comments, and blank lines.
 *
 * Mirrors the helper's accepted value syntax (`\"` and `\\` escapes, a
 * trailing comment is allowed) but skips lines it does not understand instead
 * of failing: the helper is the strict validator for this file.
 */
export function parseConfig(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
    const rest = line.slice(eq + 1).trim();
    const match = /^"((?:[^"\\]|\\.)*)"/.exec(rest);
    if (!match) continue;
    const value = (match[1] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    values[key] = value;
  }
  return values;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolvePolicy(
  value: string,
  cwd: string,
  repoRoot: string,
): string {
  if (value.startsWith("/")) return value;
  const fromCwd = join(cwd, value);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRepo = join(repoRoot, value);
  if (existsSync(fromRepo)) return fromRepo;
  return value;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  repoRoot: string = join(import.meta.dir, "..", ".."),
): DashboardConfig {
  const path = configFilePath(env);
  let values: Record<string, string> = {};
  let configPath: string | null = null;
  if (existsSync(path)) {
    try {
      values = parseConfig(readFileSync(path, "utf8"));
      configPath = path;
    } catch {
      values = {};
    }
  }

  const configuredPolicy = values.policy;
  let policy: string | null;
  if (configuredPolicy) {
    policy = resolvePolicy(configuredPolicy, cwd, repoRoot);
  } else {
    // Same built-in fallback as the helper, but only when it exists: the
    // dashboard can run outside this repository.
    const fallback = join(repoRoot, "examples", "policies", "maki-minimal.yaml");
    policy = existsSync(fallback) ? fallback : null;
  }

  return {
    image: values.image || DEFAULT_IMAGE,
    policy,
    providers: splitCsv(values.providers ?? ""),
    cpu: values.cpu || null,
    memory: values.memory || null,
    configPath,
  };
}
