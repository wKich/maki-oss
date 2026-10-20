# Migrating MCP servers from OpenCode to Maki

A checklist for copying the `mcp` block of OpenCode's global config into
Maki's global `mcp.toml`, so a host that ran OpenCode keeps the same MCP
servers in Maki. This is server configuration only — model credentials are a
separate migration, see [`docs/dogfood-migration.md`](dogfood-migration.md).
Maki's MCP reference is indexed in [`docs/ai/references.md`](ai/references.md).

| | OpenCode | Maki |
|---|---|---|
| File | `~/.config/opencode/opencode.json`, key `mcp` | `~/.config/maki/mcp.toml`, table `mcp.<name>` |
| Per-project | `.opencode/opencode.json` | `.maki/mcp.toml` (needs folder trust) |

## 1. Field mapping

| OpenCode | Maki | Note |
|---|---|---|
| `"type": "remote"` + `url` | `url = "..."` | Maki picks the transport from `command` vs `url` — never set both |
| `headers` | `headers = { KEY = "value" }` | values may reference the environment as `${VAR}`; an unset variable fails that server loudly |
| `oauth.clientId` / `oauth.clientSecret` | `oauth = { client_id = "...", client_secret = "..." }` | snake_case; `callback_*` keys pin the loopback redirect URI |
| `"type": "local"` + `command` | `command = ["bunx", "-y", "pkg"]` | keep it an argument array, not a shell string |
| `environment` | `environment = { KEY = "value" }` | stdio only. Maki does not forward provider API keys to child processes, so a stdio server that needs one names it here explicitly |
| `enabled` | `enabled` | defaults to `true` in Maki; omit for enabled servers |

Copy every server, keeping its enabled/disabled state — a disabled server is
documentation, not attack surface. Server names are ASCII alphanumeric and
hyphens; tool names become `<server>__<tool>` and permission rules for them go
under `[mcp.<server>]` in `permissions.toml`.

## 2. Migrate

Edit the two files side by side. The Maki file is a plain TOML table per
server, so a server moves in one block; nothing else in either file changes.

## 3. Verify

Parse the result and diff the server names against the source:

```sh
python3 -c 'import json,tomllib,sys,pathlib; o=json.load(open(sys.argv[1]))["mcp"]; m=tomllib.load(open(sys.argv[2],"rb"))["mcp"]; print("opencode:", *sorted(o)); print("maki:", *sorted(m))' \
  ~/.config/opencode/opencode.json ~/.config/maki/mcp.toml
```

Expected: every server you meant to keep appears on both lines with the same
enabled state; the diff names anything that dropped out on either side. A
Maki-only server is fine when it is deliberately there.
Tool names come from a one-turn headless run — `maki prompt --names --tools`
lists built-in tools only, MCP tools do not appear there:

```sh
maki -p "List every tool name available to you, one per line. Do not call any tool." \
  --max-turns 1 -m <cheap-model>
```

Expected: the built-in names, then one `<server>__<tool>` line per tool of each
enabled server. A server that is missing is `Disabled` or `Failed` in Maki's
`/mcp` picker — check that the command exists on the host (stdio) or that the
endpoint answers (HTTP) before touching the config again.

## 4. Keep the sandbox out of scope

The OpenShell sandbox has its own `/sandbox/.config/maki`, baked from
[`examples/maki-image`](../examples/maki-image), and never reads the host's
`mcp.toml`. To use an MCP server inside a sandbox, all four must hold:

1. **Config** — bake a `mcp.toml` next to the image's `init.lua` and copy it to
   `/sandbox/.config/maki/mcp.toml` in
   [`examples/maki-image/Dockerfile`](../examples/maki-image/Dockerfile).
   Prefer the HTTP transport: the image ships no `npx`/`bunx`, so a stdio
   server needs its runtime baked in too.
2. **Egress** — every server endpoint needs its own narrow `network_policies`
   entry (host, port 443, the exact paths) in the sandbox policy; copy the
   shape of [`examples/policies/maki-git-push.yaml`](../examples/policies/maki-git-push.yaml).
   Never widen with a wildcard host or `tls: skip`.
3. **Credentials** — pass a token through an OpenShell provider profile, not
   `--env`: sandbox environment variables are readable by the agent, and
   `maki-oss` refuses credential-looking keys anyway
   ([`docs/providers.md`](providers.md)).
4. **No OAuth** — the callback binds to `127.0.0.1` inside the sandbox's
   network namespace, so `maki mcp auth <server>` cannot complete there. Use a
   token, and keep the OAuth servers to the host.

## This machine's run — 2026-10-19

Source: `~/.config/opencode/opencode.json` against `~/.config/maki/mcp.toml`.

| Server | Transport | State | Note |
|---|---|---|---|
| `context7` | HTTP | enabled | header auth; verified loaded in step 3 |
| `synthetic` | stdio (`bunx -y synthetic-search-mcp`) | enabled | key passed through `environment`; verified loaded in step 3 |
