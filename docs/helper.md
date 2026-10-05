# maki-oss: the sandbox helper

`bin/maki-oss` is a POSIX sh workflow layer over the OpenShell CLI. It
creates one sandbox per project, moves files in and out without bind mounts,
runs Maki headless or interactively, and encodes the safety rules from the
[setup guide](setup-guide.md) so they are not retyped per project.

The sandbox remains the security boundary:

- no host bind mounts — project files move with `openshell sandbox upload` /
  `download`;
- credentials go through provider profiles, never `--env`;
- `--env` refuses credential-like names unless you pass `--allow-env`;
- `rm` requires confirmation or `--yes`;
- every gateway call uses the configured policy, and no command widens egress.

## Install

Prerequisites:

| Requirement | Check |
|---|---|
| OpenShell CLI and a running gateway | `openshell status` |
| Docker Engine 28+ (or Podman) | `docker version` |
| `jq` (optional, better parsing) | `jq --version` |
| `fish` (optional, for the plugin) | `fish --version` |

From a clone of this repository:

```sh
./bin/maki-oss doctor          # verify prerequisites
./bin/maki-oss image build     # build maki-agent:local from examples/maki-image
```

Either run `./bin/maki-oss` directly or put the repository's `bin/` on `PATH`:

```sh
export PATH="$PWD/bin:$PATH"
maki-oss help
```

Development checks live in the `Makefile`:

```sh
make test     # stub-backed suite: no Docker, no gateway, no network
make lint     # shellcheck + fish -n
```

## Configuration

Settings resolve in this order (first non-empty wins):

1. command-line flags (`--image`, `--provider`, ...);
2. `MAKI_OSS_<KEY>` environment variables;
3. the config file at `${XDG_CONFIG_HOME:-$HOME/.config}/maki-openshell/config.toml`;
4. built-in defaults.

[`examples/config.toml`](../examples/config.toml) documents every supported
key. The file is parsed as data and never sourced: it accepts
`key = "value"` lines, `#` comments, and blank lines, and an unknown key is a
hard error that names the file and the key. Values are single-line quoted
strings; `providers` is a comma-separated list.

| Key | Environment | Default | Meaning |
|---|---|---|---|
| `image` | `MAKI_OSS_IMAGE` | `maki-agent:local` | Sandbox image reference |
| `policy` | `MAKI_OSS_POLICY` | `examples/policies/maki-minimal.yaml` | Policy YAML; relative paths are tried against the current directory first, then the repository root |
| `providers` | `MAKI_OSS_PROVIDERS` | empty | Comma-separated provider names attached at creation |
| `cpu` | `MAKI_OSS_CPU` | empty | CPU limit passed to `sandbox create` |
| `memory` | `MAKI_OSS_MEMORY` | empty | Memory limit passed to `sandbox create` |
| `sandbox_name` | `MAKI_OSS_SANDBOX_NAME` | `maki-{project}` | Name pattern; `{project}` is the sanitized current directory name |
| `engine` | `MAKI_OSS_ENGINE` | `docker` | `docker` or `podman` |
| `gateway` | `MAKI_OSS_GATEWAY` | empty | OpenShell gateway name (`-g`) |
| `workdir` | `MAKI_OSS_WORKDIR` | `/sandbox/project` | In-sandbox project directory used by `upload`, `download`, `maki`, and `run` |

`MAKI_VERSION` (or `--maki-version`) sets the Maki release version passed to
`image build`; when unset, the Dockerfile default applies.

Exit codes: `0` success, `1` usage error, `2` missing local dependency
(CLI, engine, image, policy), `3` gateway or sandbox operation failed.
`run` and `maki` propagate the remote process exit code instead.

## Command reference

### doctor

Checks the `openshell` CLI, gateway connectivity, the configured container
engine, image presence, the policy file, and that configured provider names
exist. Prints one line per check and exits non-zero when any check fails.
When the CLI is missing the suite does not attempt gateway operations.

```sh
maki-oss doctor
maki-oss doctor --provider maki-anthropic
```

### image build

Builds `examples/maki-image/` with the configured engine and tags it as the
configured image. `MAKI_VERSION` is passed as a build argument.

```sh
maki-oss image build
MAKI_VERSION=0.6.1 maki-oss image build
maki-oss image build --engine podman
```

### init / up

Creates the project's sandbox when it does not exist, or starts it when it is
stopped. Running `up` twice never creates a second sandbox. The sandbox is
created detached, from the configured image, policy, providers, CPU, and
memory.

```sh
maki-oss up
maki-oss up --name maki-other-project
```

### maki

Attaches an interactive Maki session in the sandbox workdir through
`openshell sandbox exec --tty`.

```sh
maki-oss maki
```

### run

Runs Maki headless with `--print --yolo --trust --output-format json`,
streams stdout unchanged, and exits with Maki's exit code.

```sh
maki-oss run "fix the failing tests"
```

### upload / download

`upload [LOCAL_PATH] [SANDBOX_DEST]` copies local files into the sandbox. The
default local path is `.` and the default destination is the workdir.
`download [SANDBOX_PATH] DEST` copies files out to an explicit host
destination; with one argument that argument is the destination and the
workdir is downloaded.

Both delegate to `openshell sandbox upload` / `download`; neither creates a
bind mount or exposes any other host path.

```sh
maki-oss upload .                          # project -> /sandbox/project
maki-oss upload ./dist /sandbox/project/dist
maki-oss download /sandbox/project/out ./out
```

### status / list / logs

`status` reports the project sandbox's existence, phase, configured image,
and attached providers. `list` delegates to `openshell sandbox list`. `logs`
forwards `--tail`, `--since`, `--source`, `--level`, and `-n`.

```sh
maki-oss status
maki-oss list
maki-oss logs --since 5m --tail
```

`status` marks the image `(configured)` because OpenShell's CLI JSON does not
report the booted sandbox image; the value shown is what this helper would
use for the next `up`.

### start / stop / rm

`start` and `stop` delegate to the gateway. `rm` prints the exact sandbox
name and asks for confirmation; when stdin is not a terminal it refuses
unless `--yes` is passed, and it never sends a delete request otherwise.

```sh
maki-oss stop
maki-oss start
maki-oss rm            # prompts
maki-oss rm --yes      # non-interactive
```

### policy show / edit / apply

`show` prints the base policy by default (`--full` for the effective policy,
`--global` for the gateway-global policy). `edit` opens the policy file in
`$EDITOR`. `apply` runs `openshell policy set` (add `--wait` to wait for the
sandbox to load it; `--global` requires `--yes`).

```sh
maki-oss policy show
maki-oss policy show --full
maki-oss policy edit
maki-oss policy apply --wait
```

### provider add / attach / list

`add` creates a provider. Credentials are captured from the environment with
`--from-existing` (or `--credential KEY`, which reads `KEY` from the
environment). Inline `--credential KEY=VALUE` is refused so secrets never
appear in shell history or process arguments. `attach` attaches a provider to
the project sandbox; `list` lists providers known to the gateway. Attached
providers also appear in `maki-oss status`.

```sh
maki-oss provider add maki-anthropic --type maki-anthropic --from-existing
maki-oss provider attach maki-anthropic
maki-oss provider list
```

### fish install / uninstall

Installs the fish plugin without fisher by symlinking
`fish/functions/maki-oss.fish` and `fish/completions/maki-oss.fish` into
`${XDG_CONFIG_HOME:-$HOME/.config}/fish`. The install is idempotent, refuses
to overwrite foreign files, and uninstall removes only symlinks that point
into this repository.

```sh
maki-oss fish install
maki-oss fish uninstall
```

### help

```sh
maki-oss help
```

## Cookbook: create, run, collect, clean

```sh
cd ~/code/myproject

# 1. One-time prerequisites.
maki-oss doctor
maki-oss image build
ANTHROPIC_API_KEY=... maki-oss provider add maki-anthropic \
    --type maki-anthropic --from-existing

# 2. Create the sandbox and attach the provider.
maki-oss up --provider maki-anthropic

# 3. Move the project in and run Maki headless.
maki-oss upload .
maki-oss run "explain this project and fix the failing tests"

# 4. Collect results (paths must stay under /sandbox).
maki-oss download /sandbox/project ./project-out

# 5. Clean up.
maki-oss rm --yes
```

Alternatively set `providers = "maki-anthropic"` in the config file and drop
`--provider` from `up`.

## Fish setup

With fisher (the fish plugin manager):

```sh
fisher install ./fish
```

Without fisher:

```sh
maki-oss fish install
```

Both install the `maki-oss` function plus completions. The wrapper locates the
helper via `$MAKI_OSS_BIN`, then the source repository (symlink install), then
`maki-oss` on `PATH`. Fisher copies plugin files into the fish config
directory, so with fisher put the repository's `bin/` on `PATH` (the install
step above) or set `MAKI_OSS_BIN=/path/to/repo/bin/maki-oss`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `openshell CLI not found on PATH` | Install OpenShell; see the [setup guide](setup-guide.md) |
| `gateway: unreachable` | Start the gateway service, then rerun `maki-oss doctor` |
| `refusing --env ANTHROPIC_API_KEY` | Use `provider add --from-existing` and `provider attach`, or `--allow-env KEY` for genuinely non-secret values |
| `policy file not found` | Point `--policy` / the config at an existing YAML file |
| `sandbox '<name>' not found` | Run `maki-oss up` first |
| `image ... not found` | Run `maki-oss image build` |

The test suite (`make test`) covers every command above with a stubbed
OpenShell binary, so it runs without Docker, a gateway, or network access.

## Manual verification

A full dry run against a real OpenShell 0.1.2 gateway (macOS 26.5, Apple
Silicon, Docker Engine 29.4.0 via OrbStack, `maki-agent:local` built from
Maki 0.6.0) produced:

```text
$ maki-oss doctor --provider maki-anthropic
ok    openshell CLI: /opt/homebrew/bin/openshell
ok    gateway: connected
ok    container engine: docker (/usr/local/bin/docker)
ok    image: maki-agent:local present
ok    policy file: .../examples/policies/maki-minimal.yaml
ok    providers: maki-anthropic
(exit 0)

$ maki-oss up --provider maki-anthropic
Creating sandbox 'maki-maki-openshell' from maki-agent:local...
Created sandbox: maki-maki-openshell
(exit 0)

$ maki-oss up --provider maki-anthropic     # idempotent
Sandbox 'maki-maki-openshell' already exists (phase: Ready).
(exit 0)

$ maki-oss status
Sandbox:   maki-maki-openshell
Exists:    yes
Phase:     Ready
Image:     maki-agent:local (configured)
Providers: maki-anthropic

$ maki-oss upload /tmp/maki-oss-smoke
✓ Upload complete
(exit 0; `openshell sandbox exec -n ... -- ls /sandbox/project` shows the
uploaded directory and no host mount exists)

$ maki-oss run "Reply with OK."
{"type":"result","subtype":"error","is_error":true,
 "result":"authentication failed, run `maki auth login` or check your API key", ...}
(exit 0, exactly Maki's code: JSON output mode reports the error in-band and
exits 0; the helper did not rewrite stdout)

$ maki-oss stop && maki-oss up
Starting sandbox 'maki-maki-openshell' (phase: Stopped)...
✓ Started sandbox maki-maki-openshell
(exit 0; no second sandbox was created)
```

No real Anthropic/OpenRouter key was available, so — as in the setup-guide
dry run — the provider was created with a deliberately fake credential and
deleted afterwards. The run exercises the full path (placeholder injection,
policy, proxy, Maki execution) up to the vendor returning an authentication
error. Interactive `maki` attachment is covered by the stub suite (its TTY
session is not automatable); the headless `run` above used the same exec
plumbing. The sandbox, provider, and profile were removed after the run;
`maki-agent:local` was left in place.

