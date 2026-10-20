# Tasks

## 1. Image runtime and baked config

- [x] 1.1 Add a pinned bun install block to `examples/maki-image/Dockerfile`
      (`ARG BUN_VERSION`; bun's Linux releases are zip archives, not tarballs —
      unpack with `unzip` or the official installer under `BUN_INSTALL=/usr/local`,
      binary to `/usr/local/bin`) and extend `ENV PATH` with the directory
      `bun add -g` links executables into (commonly `/sandbox/.bun/bin`), keeping
      the image free of any credential; verify with `docker build` succeeding,
      `docker run --rm maki-agent:local bun --version` printing the pinned
      version, and `docker run --rm maki-agent:local sh -c 'case ":$PATH:" in *:/sandbox/.bun/bin:*) exit 0;; *) exit 1;; esac'`
      confirming the bin dir is on the image's default PATH
- [x] 1.2 Pre-install the stdio server's package at image build as uid 1500
      (`bun add -g synthetic-search-mcp@<pin>` under the sandbox user so the
      cache and global install live under `/sandbox`); verify with
      `docker run --rm maki-agent:local command -v synthetic-search-mcp`
      printing a path on the image's default PATH, and by RUNNING the binary
      itself: `docker run --rm --network none maki-agent:local timeout 5 synthetic-search-mcp`
      must stay up until the timeout (exit 124), proving it starts with no
      registry access; an `env: node: no such file` or similar shebang failure
      means the package cannot run standalone — record it and switch task 1.3's
      `command` to `["bun", "<installed script path>"]`
- [x] 1.3 Add the stdio entry to `examples/maki-image/config/mcp.toml` naming
      the installed binary from task 1.2 in `command` (or
      `["bun", "<installed script path>"]` if 1.2's run check failed on a
      shebang) and referencing the credential only as
      a `${VAR}` expansion in `environment`, with a comment stating the
      pre-warm and no-session-fetch rule; verify with
      `python3 -c 'import tomllib; tomllib.load(open("examples/maki-image/config/mcp.toml","rb"))'`
      parsing and `grep -Ei "syn_[A-Za-z0-9]|sk-|ghp_|Bearer [A-Za-z0-9]" examples/maki-image/config/mcp.toml`
      returning nothing

## 2. Helper: runtime gate

- [x] 2.1 Extend `mcp_servers_in_toml` in `bin/maki-oss` to record the stdio
      command's `argv[0]` instead of a bare boolean (keeping the existing
      `name<TAB>transport<TAB>enabled<TAB>host` contract for HTTP servers);
      verify with `make test` passing, including the existing parser-dependent
      `mcp status` stub tests unchanged
- [x] 2.2 First extend the test harness's `sandbox exec` stub
      (`tests/run-tests.sh:74-75, 108-109`) so its output and exit can vary per
      command — the current single `EXEC_STDOUT`/`EXEC_EXIT` cannot express a
      passing `cat` beside a failing `command -v`; then replace the transport
      short-circuit in `mcp_readiness_report` with
      per-transport gates: for stdio, config present, runtime present (a
      read-only `sandbox exec -- command -v <argv[0]>` on the path the status
      command already uses), provider attached, and no separate endpoint gate;
      a failing runtime gate prints the missing command and the image-build
      command as the fix; verify with new stub tests asserting the
      all-gates-satisfied stdio line with exit 0, a missing-runtime line
      naming the command and the fix with exit non-zero, `assert_log_missing`
      for any gateway or sandbox mutation, and no credential value in output
- [x] 2.3 Confirm the HTTP path and the doctor MCP section are untouched by the
      branch change; verify with the HTTP-path and doctor stub suites passing
      under `make test` with no fixture edits — `test_mcp_status_stdio_unsupported`
      (`tests/run-tests.sh:775-790`) is replaced, not kept: its assertions
      encode the requirement this change removes, so rewrite or delete it as
      part of 2.2

## 3. Shipped upstream profile

- [x] 3.1 Confirm the host serving Synthetic's `/v2/search` API from the
      package's source or Synthetic's docs, then author
      `examples/providers/mcp-synthetic.yaml` declaring that endpoint with the
      protocol it actually serves, the credential bound to it, and
      `binaries: [/usr/local/bin/maki]`; verify with
      `openshell profile lint -f examples/providers/mcp-synthetic.yaml`
      passing against the pinned gateway
- [x] 3.2 Keep the MCP-adjacent profiles out of `examples/providers/catalog.tsv`
      (keyed `<store>:<slug>`; `synthetic` already resolves to the inference
      profile); verify with `grep -c "mcp-synthetic" examples/providers/catalog.tsv`
      printing `0`, and record the setup command
      (`maki-oss provider setup --profile examples/providers/mcp-synthetic.yaml --env MCP_SYNTHETIC_API_KEY`;
      the variable is MCP_SYNTHETIC_API_KEY rather than the host's
      SYNTHETIC_API_KEY because a sandbox attaches one provider per credential
      key and `maki-synthetic` owns SYNTHETIC_API_KEY)
      in the docs task below

## 4. Documentation

- [x] 4.1 Rewrite the stdio stance in `docs/mcp-migration.md` §4: stdio works
      when the image provides the command and the package is pre-installed at
      build, the helper never installs into a running sandbox, credentials
      cross only as `${VAR}` (a host literal is migration input for
      `provider setup --env`, never a value to copy), and the upstream API is
      reached through its profile; verify by the section stating all of these,
      `grep -n "stdio is unsupported" docs/mcp-migration.md` returning nothing,
      and `scripts/check-links.sh` passing
- [x] 4.2 Update the gate list and example output in `docs/helper.md` and the
      stdio paragraph in `docs/verification.md`; verify with
      `grep -n "runtime" docs/helper.md` finding the runtime gate in the `mcp
      status` section, `grep -rn "transport=stdio (unsupported" docs/` matching
      only `docs/verification-log.md` historical entries (it catches the stale
      copies in `docs/helper.md` and `docs/verification.md` that the
      `no server runtime` phrase misses), and
      `scripts/check-links.sh` passing
- [x] 4.3 Add the stdio smoke-test walkthrough to `docs/verification.md`
      (rebuild image, attach the upstream profile, `maki-oss mcp status` all
      gates, call the tool from a session); verify by each step naming a
      command and its expected output

## 5. Live verification

- [x] 5.1 Rebuild the image and smoke test `synthetic` end to end:
      `maki-oss mcp status` reports all gates satisfied for it, and a headless
      session lists and successfully calls `synthetic__search`; verify by the
      tool call succeeding and a dated section in `docs/verification-log.md`
      recording only the shape (gates satisfied, tool called; no credential
      value, no placeholder prefix spelled)
- [x] 5.2 Negative test: detach the `mcp-synthetic` provider and confirm
      `mcp status` names the attachment gate with its fix command while the
      HTTP servers keep working; verify by both observations recorded in
      `docs/verification-log.md`, then re-attach
- [x] 5.3 Confirm no registry egress was added: `openshell policy get <sandbox> --full`
      contains no npm/registry host, the session makes no package fetch, and
      `git status` in `examples/` shows only the intended Dockerfile and
      config changes; verify by the policy grep returning nothing and the
      clean status recorded in `docs/verification-log.md`
