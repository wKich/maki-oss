# Verification log: setup-guide dry run

Recorded dry run of [`docs/setup-guide.md`](setup-guide.md) and
[`docs/verification.md`](verification.md). Actual outputs are trimmed to the
relevant lines.

## Environment

| Component | Value |
|---|---|
| Date | 2026-10-05 |
| Host | macOS 26.5, Apple Silicon (`arm64`) |
| Container engine | Docker Engine 29.4.0 via OrbStack (context `orbstack`) |
| OpenShell | 0.1.2 (Homebrew; local gateway `https://localhost:17670`, `Status: Connected`) |
| Maki | 0.6.0 (pinned in the image) |
| Sandbox image | `maki-agent:local` (built from `examples/maki-image`) |

The OpenShell install used the documented command:

```sh
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
```

## 1. Image build

```sh
docker build --build-arg MAKI_VERSION=0.6.0 -t maki-agent:local examples/maki-image
```

Result: build completed; at the end of the install layer the image itself
printed `maki 0.6.0`. Baked layout and identity:

```text
$ docker run --rm maki-agent:local ls /sandbox/.config/maki
init.lua
permissions.toml

$ docker run --rm maki-agent:local id
uid=1500(sandbox) gid=1500(sandbox) groups=1500(sandbox)
```

Inside the sandbox the toolchain is present: `maki 0.6.0`, `git version
2.43.0`; `iproute2` is installed by the Dockerfile layer.

## 2. Provider profiles

```sh
openshell profile lint -f examples/providers/maki-anthropic.yaml
openshell profile lint -f examples/providers/maki-openrouter.yaml
```

Result: both printed `Provider profile lint passed.`

```sh
openshell profile import -f examples/providers/maki-anthropic.yaml --global
openshell profile import -f examples/providers/maki-openrouter.yaml --global
```

Result: `Imported 1 provider profile.` for each.

Provider creation was tested with a deliberately fake value so no real
credential was needed (the live model call was skipped; see Limitations):

```sh
ANTHROPIC_API_KEY=openshell-dry-run-not-a-real-key \
  openshell provider create --name maki-anthropic --type maki-anthropic --from-existing
```

Result: `✓ Created provider maki-anthropic`; `openshell provider list` showed
`maki-anthropic` with 1 credential key and 0 config keys.

## 3. Sandbox creation and policy acceptance

```sh
openshell sandbox create --name maki --from maki-agent:local \
  --policy examples/policies/maki-minimal.yaml \
  --provider maki-anthropic --detach
```

Result: `Created sandbox: maki`; `openshell sandbox list` reported `Ready`.
`openshell sandbox get maki` reported:

```text
Phase: Ready
Conditions:
  - Ready: True (DependenciesReady) - Supervisor session connected
  - ConfigurationReady: True (ConfigurationAccepted)
Policy source: sandbox
Revision: 2
```

The `landlock: hard_requirement` policy was accepted — no startup failure on
this kernel.

## 4. Isolation checks

```text
$ openshell sandbox exec -n maki --no-login-shell -- id
uid=1500(sandbox) gid=1500(sandbox) groups=1500(sandbox)

$ openshell sandbox exec -n maki --no-login-shell -- printenv ANTHROPIC_API_KEY
openshell:resolve:env:v3789022262450335270_ANTHROPIC_API_KEY

$ openshell sandbox exec -n maki --no-login-shell -- ls /Users
ls: cannot access '/Users': No such file or directory
(exit 2)

$ openshell sandbox exec -n maki --no-login-shell -- /usr/bin/curl -sS --max-time 15 https://example.com
curl: (7) Failed to connect to example.com port 443 after 2 ms: Couldn't connect to server
(exit 7)

$ openshell sandbox exec -n maki --no-login-shell -- touch /usr/probe
touch: cannot touch '/usr/probe': Permission denied
(exit 1)
```

Note the placeholder is revision-scoped (`openshell:resolve:env:v<digits>_<KEY>`)
in this OpenShell release; it still starts with the documented
`openshell:resolve:env:` prefix. `/sandbox` was writable in a separate probe.

Effective policy and attachment:

```text
$ openshell policy get maki --full
network_policies:
  _provider_maki_anthropic:
    name: _provider_maki_anthropic
    endpoints:
      - host: api.anthropic.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-write
    binaries:
      - path: /usr/local/bin/maki

$ openshell sandbox provider list maki
NAME            TYPE            CREDENTIAL_KEYS   CONFIG_KEYS
maki-anthropic  maki-anthropic  1                 0
```

Denial logs:

```text
$ openshell logs maki --since 5m --source sandbox
[1791199570.521] [sandbox] [OCSF ] [ocsf] NET:REFUSE [MED] DENIED example.com [reason:policy_dns_ineligible]
[1791199570.522] [sandbox] [WARN ] [openshell_supervisor_network::proxy] Denied staged transparent connection destination=198.18.0.2:443 reason=endpoint example.com:443 is not allowed by any policy
[1791199570.522] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/bin/curl(0) -> example.com:443 [reason:transparent_tcp_policy_denied]
```

Maki startup inside the sandbox (loads the baked `init.lua` and
`permissions.toml` without a config error; no API request):

```text
$ openshell sandbox exec -n maki --no-login-shell -- maki prompt --tools --names
index
webfetch
websearch
bash
...
```

## 5. Cleanup

The dry-run artifacts were removed so the documented import and create
commands run cleanly for a real key:

```sh
openshell sandbox delete maki
openshell provider delete maki-anthropic
openshell profile delete maki-anthropic maki-openrouter --global
```

Final state: `No sandboxes found.`, `No providers found.`,
`No profiles found.` The `maki-agent:local` image and the OpenShell gateway
were left in place.

## Corrections

None were needed: the guide's commands and both policy files worked as
written. Two notes for readers:

- `openshell profile delete` needs `--global` to remove profiles imported with
  `--global`.
- The placeholder's revision prefix (`v<digits>_`) makes exact-string checks
  brittle; match the `openshell:resolve:env:` prefix.

## Not verified

- **Live model round-trip.** No real Anthropic/OpenRouter key was used, so a
  completed `maki -p` request was not executed. Endpoint binding and proxy
  credential substitution are exercised only insofar as the placeholder and
  provider rule were present.
- **Docker Desktop specifically.** The run used OrbStack. The Docker Desktop
  prerequisites (host networking enabled, Enhanced Container Isolation off) are
  taken from upstream documentation, not exercised here.
- **Linux hosts, MicroVM driver, and GPU paths.**
- **The GitHub push policy end to end.** `examples/policies/maki-git-push.yaml`
  was YAML-parsed and reuses the upstream tutorial's rule shape, but no push
  was attempted (no GitHub token, and the image does not include `gh`).
- **`scripts/check-links.sh`** was run against the docs separately; all 38
  external links resolved.
