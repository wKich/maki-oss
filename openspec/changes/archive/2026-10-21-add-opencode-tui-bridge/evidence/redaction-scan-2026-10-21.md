# Redaction scan (2026-10-21, change task 1.4)

Re-run of the spike's redaction scan (spike `evidence/redaction-scan.md`)
over everything this change copied in: `bridge/` (including `bridge/src/`,
excluding `node_modules/`) and `openspec/changes/add-opencode-tui-bridge/evidence/`.
Sanitization rule is unchanged: captures carry no `Authorization`-style or
key-shaped values; no real credentials were used anywhere (synthetic provider,
local stub).

## Scan 1 — value-shaped credentials over `bridge/` and `evidence/`

    grep -rlE 'sk-[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9._-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|
               ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|
               eyJ[A-Za-z0-9_-]{30,}|hf_[A-Za-z0-9]{20,}' bridge evidence/ --exclude-dir=node_modules

Result: **no matches** (grep exit 1 = nothing found).

## Scan 2 — authorization/api-key keys in code and captures

    grep -rlE '"?(authorization|api[-_]?key|x-api-key)"?[":= ]' bridge evidence/ --exclude-dir=node_modules

Result: one file, `bridge/src/openapi-2.0.32.json` — the pinned upstream
contract text. The only matches are JSON-Schema field names (e.g.
`apiKeySource`, `client_secret` in `Mcp.OAuthConfigEncoded`), never values.
No credential key or value appears in any capture, script, or bridge source.

## Notes

- The maki captures (`evidence/maki-*.jsonl`) are the spike's records against
  `synthetic/syn:small:text`: `apiKeySource: "none"`, no provider tokens on
  the wire.
- `bridge/src/bridge.ts` carries its own runtime redaction
  (`SECRET_KEY` regex → `[REDACTED]`) for `BRIDGE_LOG`/`BRIDGE_SSE_LOG`.
- Re-running the two scans after writing this note adds only this note's own
  pattern line to scan 2's result (pattern text, not values); scan 1 stays
  clean.
