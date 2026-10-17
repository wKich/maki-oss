# Verification log

Recorded dry runs for this repository. Actual outputs are trimmed to the
relevant lines.

## Setup-guide dry run

Run of [`docs/setup-guide.md`](setup-guide.md) and
[`docs/verification.md`](verification.md), recorded on 2026-10-05.

### Environment

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

### 1. Image build

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

### 2. Provider profiles

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

### 3. Sandbox creation and policy acceptance

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

### 4. Isolation checks

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

### 5. Cleanup

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

### Corrections

None were needed: the guide's commands and both policy files worked as
written. Two notes for readers:

- `openshell profile delete` needs `--global` to remove profiles imported with
  `--global`.
- The placeholder's revision prefix (`v<digits>_`) makes exact-string checks
  brittle; match the `openshell:resolve:env:` prefix.

### Not verified

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

## Any-provider wizard dry run

Run of the `add-any-provider-support` wizard against the same local gateway,
recorded on 2026-10-06. It exercises the real Maki credential store and the
real OpenShell CLI; the credential value itself never entered the transcript.

### Environment

| Component | Value |
|---|---|
| Date | 2026-10-06 |
| Host | macOS 26.5, Apple Silicon (`arm64`) |
| OpenShell | 0.1.2 (local gateway `https://localhost:17670`, `Status: Connected`) |
| Maki | 0.6.0 (host store `~/.local/state/maki/auth/opencode-go.json`, `{"api_key": ...}` shape) |
| Helper | `bin/maki-oss` from this change |

### 1. Prior state

```text
$ openshell provider list --names
(no output)

$ openshell profile list --type provider -o json --global
[]
```

### 2. Wizard run

```sh
maki-oss provider setup --from maki --credential opencode-go --yes
```

```text
Using curated profile 'maki-opencode-go'.
Linting profile 'maki-opencode-go'...
Provider profile lint passed.
Importing profile 'maki-opencode-go' globally...
Imported 1 provider profile.
✓ Created provider maki-opencode-go
Provider 'maki-opencode-go' created.

Next steps:
  attach at creation:            maki-oss up --provider maki-opencode-go
  attach to an existing sandbox: maki-oss provider attach maki-opencode-go
  pick a model headless:         maki-oss run --model <provider/model> "..."
(exit 0)
```

stdin was not a terminal and `--attach` was absent, so the run stopped short of
attaching, as documented. The value read from the store was exported only into
the environment of the `openshell` child process: grepping the captured stdout
and stderr for it found no match.

```text
$ openshell provider list
NAME              TYPE              CREDENTIAL_KEYS   CONFIG_KEYS
maki-opencode-go  maki-opencode-go  1                 0
```

The OAuth path was exercised against the same real store (the Maki `openai`
login is an OAuth credential):

```text
$ maki-oss provider setup --from maki --credential openai --yes
maki-oss: credential 'maki:openai' is 'oauth', which this workflow does not support
maki-oss:   API-key credentials are the supported path; for OAuth guidance see docs/migrating-providers.md
(exit 1; the refusal happens before any gateway mutation, and the stub suite
asserts no profile/provider invocation is logged)
```

### 3. Cleanup

```sh
openshell provider delete maki-opencode-go
openshell profile delete maki-opencode-go --global
```

```text
✓ Deleted provider maki-opencode-go
✓ Deleted provider profile maki-opencode-go
```

`openshell provider list --names` was empty and the global profile JSON was
`[]` again — the same as before the run.

### Exercised / not exercised

Exercised on the real gateway:

- curated-catalog resolution for a Maki store credential (`maki:opencode-go`);
- lint before import, in order, with both invocations visible in the transcript;
- `provider create --from-existing --global-profile` with the credential
  delivered through the child environment (1 credential key recorded);
- the non-TTY default of not attaching;
- non-exposure: no credential value in stdout, stderr, or argv;
- the OAuth refusal against a real OAuth store entry, with no gateway change.

Not exercised on the real gateway (covered by the stub suite instead):

- `provider update --from-existing` and `sandbox provider attach --wait`
  against a live sandbox; no sandbox was created for this run;
- custom-profile generation and the hidden-prompt source (`make test` cases
  `setup-custom*` and `setup-prompt`);
- `run --model` end to end inside a sandbox; the stub suite asserts the
  `sandbox exec` argv only.

## Download merge probe

Pins the `add-one-command-session` sync-back assumption against the same local
gateway, recorded on 2026-10-06. The sync design depends on what
`openshell sandbox download` does with a directory and a non-empty destination.

### Setup

A scratch project (`readme.txt` plus a nested `src/`) was uploaded into a fresh
sandbox, then modified inside it:

```sh
openshell sandbox create --name maki-oss-sync-probe \
  --from maki-agent:local \
  --policy examples/policies/maki-minimal.yaml \
  --detach \
  --upload "$SCRATCH/src:/sandbox/project"
openshell sandbox exec -n maki-oss-sync-probe --no-login-shell -- \
  sh -c 'echo sandbox-new > /sandbox/project/new.txt; echo changed > /sandbox/project/readme.txt'
openshell sandbox download maki-oss-sync-probe /sandbox/project "$EMPTY_DEST"
```

### Observed

- Downloading into an empty directory placed the source's **contents** directly
  in the destination (no `project/` nesting): `DEST/readme.txt`,
  `DEST/new.txt`, `DEST/src/sub/nested.txt`.
- Downloading into a non-empty destination merged additively: a host-only
  `hostonly.txt` was preserved, a modified `src/readme.txt` was overwritten
  with the sandbox version, and `src/sandboxonly.txt` was added.

Conclusion (also in the change design): sync-back is a direct
`sandbox download <name> <workdir> "$PWD"`; matching paths are overwritten,
host-only files are preserved, sandbox-side deletions are not propagated, and
no temp-dir re-merge is needed. Both probe sandboxes were deleted afterwards.

## One-command session dry run

Run of the `add-one-command-session` flow against the same local gateway,
recorded on 2026-10-06. Interactive bare `maki-oss` needs a TTY, so the
automated transcript uses `maki-oss run`, which shares the ensure/execute/sync
path; the stub suite covers the `--tty` argv for bare/interactive runs.

### Environment

| Component | Value |
|---|---|
| Date | 2026-10-06 |
| Host | macOS 26.5, Apple Silicon (`arm64`) |
| OpenShell | 0.1.2 (local gateway, `Status: Connected`) |
| Maki | 0.6.0 (`maki-agent:local`) |
| Helper | `bin/maki-oss` from this change |

### 1. Provider setup (one-time, remembered)

```text
$ maki-oss provider setup --from opencode --credential deepseek --yes
Imported 1 provider profile.
✓ Created provider maki-deepseek
Provider 'maki-deepseek' created.
Remembered provider 'maki-deepseek' in ~/.config/maki-openshell/config.toml.

$ cat ~/.config/maki-openshell/config.toml
# maki-oss configuration. See the repository examples/config.toml.
providers = "maki-opencode-go,maki-deepseek"
```

(`maki-opencode-go` was registered from the Maki store earlier in the same
session; both names persist in the config list.)

### 2. Fresh project: create, upload, run, sync

```sh
cd "$SCRATCH/dryrun2"          # contains host-only.txt
maki-oss run --model deepseek/deepseek-chat \
  "Create a file named done.txt in the project root containing the word OK, then reply with OK."
```

```text
stdout: {"type":"result","subtype":"success","is_error":false,...,"result":"OK",...}
stderr: Creating sandbox 'maki-dryrun2'...
        Uploading the project to 'maki-dryrun2:/sandbox/project'...
        ✓ Upload complete
        Synced sandbox changes back to .../dryrun2.

$ ls -A
done.txt  host-only.txt
$ cat done.txt
OK
$ cat host-only.txt
host-only
```

### 3. Reuse without upload

```text
$ maki-oss run --no-sync --model deepseek/deepseek-chat "Reply with OK."
stdout: {"type":"result","subtype":"success",...,"result":"OK",...}
stderr: Reusing sandbox 'maki-dryrun2'.
        Skipped download (--no-sync); copy changes with 'maki-oss download'.
```

No upload invocation appeared on the second run. A missing remembered
provider was attached with `--wait` earlier in the same session (the existing
`maki-dryrun` sandbox gained `maki-deepseek` before its next run).

### 4. Cleanup

```sh
openshell sandbox delete maki-dryrun maki-dryrun2
```

Result: `No sandboxes found.` The two providers and the config entries were
left in place so the machine is ready for real sessions.

### Exercised / not exercised

Exercised on the real gateway:

- provider setup remembering names in the config, deduplicated across runs;
- create → upload → execute → download order on a fresh project;
- host-only file preserved by the sync; sandbox-created file present on the
  host with its content;
- reuse without upload, `--no-sync` hint, and stdout purity (JSON only);
- live `sandbox provider attach --wait` repair for a missing provider.

Not exercised on the real gateway (stub suite instead):

- interactive `--tty` session and the SIGINT sync path;
- sync failure exit-code preservation.

### Known limitation surfaced

Maki 0.6.0 inside the sandbox rejected the documented
`opencode-go/deepseek-v4.1-flash` model spec (`unknown provider 'opencode-go'`,
then `provider 'opencode' not found in catalog`) even though models.dev lists
both providers. Egress is deny-by-default, so Maki cannot refresh its model
catalog from models.dev inside the sandbox; it can only use providers and
models already in its built-in catalog. The dry run therefore used
`deepseek/deepseek-chat`. Baking a models.dev snapshot into the image or
adding a narrow catalog rule is a follow-up change, not part of this one; the
documented examples were corrected to the verified spec.
