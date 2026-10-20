# Tasks

## 1. Upgrade OpenShell to v0.1.4

- [x] 1.1 Upgrade the gateway and CLI to v0.1.4 with the upstream install path, then verify `openshell --version` and `openshell status` both report `0.1.4` and `openshell gateway info` reports a healthy gateway — verify by running both commands and recording their output in `docs/verification-log.md`
- [x] 1.2 Re-run `maki-oss doctor` against the upgraded gateway and confirm every existing check still passes; verify by the command exiting 0 with no new failures
- [x] 1.3 Check whether `openshell rule get <sandbox> --status pending` emits JSON at v0.1.4 and record the answer; verify by the command's actual output, and update the version note in `openspec/specs/policy-review/spec.md` only if the format changed — verify with `openspec validate`
- [x] 1.4 Update the OpenShell version references from v0.1.2 to v0.1.4 in the three files that pin it — `docs/ai/references.md`, `docs/verification.md`, `docs/setup-guide.md`; verify with `grep -n "0\.1\.2" docs/ai/references.md docs/verification.md docs/setup-guide.md | grep -iv "history\|was verified\|previous"` returning no stale pins, and `scripts/check-links.sh` passing. `docs/verification-log.md` keeps its historical v0.1.2 entries: they record what actually ran, and are not pins
- [x] 1.5 Record the upgrade and the version-dependent re-verification in `docs/verification-log.md`; verify by a dated section naming the old and new versions and the checks re-run

## 2. Shipped MCP profiles and sandbox config

- [x] 2.1 Author `examples/providers/mcp-context7.yaml` with `protocol: mcp`, all three supported revisions, a per-tool deny rule, `category: knowledge`, and `binaries: [/usr/local/bin/maki]`; verify with `openshell profile lint -f examples/providers/mcp-context7.yaml` passing against the v0.1.4 gateway
- [x] 2.2 Add an OAuth-gated exemplar profile under `examples/providers/` using `refresh: oauth2_refresh_token` with `token_url` spelled for v0.1.4; verify by `openshell profile lint` passing and by `grep -n "token_endpoint" <file>` returning nothing
- [x] 2.3 Add `examples/maki-image/config/mcp.toml` with the HTTP servers, each `headers` entry expanding a `${VAR}` placeholder only, and `enabled` reflecting support; verify with `python3 -c 'import tomllib; tomllib.load(open("examples/maki-image/config/mcp.toml","rb"))'` parsing, and `grep -Ei "sk-|ghp_|Bearer [A-Za-z0-9]" examples/maki-image/config/mcp.toml` returning nothing
- [x] 2.4 COPY the MCP config into the image at `/sandbox/.config/maki/mcp.toml` in `examples/maki-image/Dockerfile`; verify with `docker run --rm maki-agent:local ls /sandbox/.config/maki` listing `mcp.toml`, and `docker run --rm maki-agent:local cat /sandbox/.config/maki/mcp.toml` showing no credential value
- [x] 2.5 Confirm the MCP profiles are NOT added to `examples/providers/catalog.tsv`, since that catalog is keyed `<store>:<slug>` and `synthetic` already resolves to the inference profile; MCP setup uses `provider setup --env VAR --profile examples/providers/mcp-<server>.yaml`; verify by `awk -F'\t' '/^[^#]/ && NF>=3 {print $1":"$2}' examples/providers/catalog.tsv | sort | uniq -d` printing nothing, and `grep -c "mcp-" examples/providers/catalog.tsv` printing `0`

## 3. Helper: MCP readiness reporting

- [x] 3.1 Implement `maki-oss mcp status` reading BOTH the host `~/.config/maki/mcp.toml` and the project sandbox's MCP config, reporting per-server gates (present in the sandbox, provider attached, endpoint present in the effective policy, transport supported) with the fix command for each failing gate, and naming any host-enabled server absent from the sandbox with the image-rebuild command; verify with new stub tests in `tests/run-tests.sh` asserting the all-gates-satisfied line and exit 0, a failing-gate line with the printed fix and exit non-zero, and a host-only server reported missing with the rebuild command
- [x] 3.2 Cover the no-sandbox and neither-side-declares-servers cases in `mcp status`; verify with stub tests asserting a clean report and exit 0, and `assert_log_missing` for any gateway mutation
- [x] 3.3 Extend `maki-oss doctor` to print the same MCP readiness table informationally after its existing checks, leaving the doctor exit code decided only by prerequisite checks; verify with a stub test asserting the MCP section appears, that a failing MCP gate is printed and doctor still exits 0 when prerequisites pass, and that "none configured" also leaves the exit code untouched
- [x] 3.4 Add `mcp status` to the command list in `usage()` in `bin/maki-oss` and `assert_out_has "mcp"` to `test_help` in `tests/run-tests.sh`; verify by `./bin/maki-oss help | grep -n "mcp"` finding it and the `test_help` case passing under `make test`
- [x] 3.5 Add `mcp` and its `status` subcommand to `fish/completions/maki-oss.fish`; this task applies AFTER the `add-session-resume` change is archived, and starts by re-reading `openspec/specs/fish-integration/spec.md` so its already-landed flags are kept; verify with `make lint` (`fish -n`), the existing completion test passing, and `grep -c "continue\|mcp" openspec/specs/fish-integration/spec.md` showing both survived
- [x] 3.6 Document `maki-oss mcp status`, the doctor MCP section, and the host-vs-sandbox drift check in `docs/helper.md`; verify with `grep -n "mcp status" docs/helper.md` finding the section and `scripts/check-links.sh` passing

## 4. Documentation

- [x] 4.1 Rewrite `docs/mcp-migration.md` §4: profiles carry egress and credential, OAuth works via gateway-brokered refresh (login on the host), stdio is unsupported in the sandbox, and the readiness table is the verification step; verify by the section stating all four and linking `docs/providers.md`
- [x] 4.2 Add the MCP smoke-test walkthrough to `docs/verification.md` (attach profile, run `mcp status`, call a tool from a session); verify by each step naming a command and its expected output
- [x] 4.3 Document the RFC 8707 `resource`-parameter limitation and the uninspected-traffic fallback for unsupported MCP revisions in `docs/mcp-migration.md`; verify by `grep -n "resource" docs/mcp-migration.md` finding the limitation

## 5. Live verification

- [x] 5.1 Smoke test context7 end to end against the live gateway: attach the profile, `maki-oss mcp status` reports all gates satisfied, and a session lists `context7__*` tools; verify by the tool names appearing in one headless run's output, recorded in `docs/verification-log.md`
- [x] 5.3 Negative test: detach an MCP provider and confirm `maki-oss mcp status` names the attachment gate with its fix command, and that the sandbox session still starts with the other servers working; verify by both observations recorded in `docs/verification-log.md`
- [x] 5.4 Confirm the stdio server is reported unsupported with the no-runtime reason and that no package install or image change was made for it; verify by `maki-oss mcp status` output and a clean `git status` in `examples/`

Note: the OAuth-gated smoke test (former task 5.2) moved to the follow-up
change `add-oauth-mcp-support`: the v0.1.4 gateway's refresh exchange is
rejected by Linear's token endpoint (client-authentication mismatch, isolated
and recorded in `docs/verification-log.md` section 5.2), so OAuth-gated MCP
servers are out of scope for this change.
