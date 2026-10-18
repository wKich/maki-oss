# Host playbook: provision a bare host for maki-oss

Ordered, executable steps for a coding agent that starts from a bare macOS
(Apple Silicon) or Linux machine. Work from the repository root once the
repository exists (Phase 3). After each phase, run its `### Verify` block and
**stop on a mismatch** — report the failing command and its output instead of
working around it or continuing.

> **Verified against OpenShell v0.1.2 and Maki v0.6.0.** The Maki version
> below is the one pinned by `examples/maki-image/Dockerfile`; re-verify after
> either upstream publishes a release. External documentation links live only
> in [`docs/ai/references.md`](references.md) — this playbook restates the
> commands to type and points there for background.

This playbook covers host setup only. Sandbox phases (provider profiles,
policy choice, creation, isolation checks) continue in
[`docs/ai/agent-playbook.md`](agent-playbook.md); the two read as one
sequence. Never relax the security invariants listed at the end.

## Phase 1 — Preflight

Report which tools are already present; on a bare host every command below is
absent, which is expected:

```sh
docker version --format '{{.Server.Version}}'
openshell status
maki --version
uname -m
```

### Verify

Expected when a tool is present: the engine prints `28.0` or later;
`openshell status` shows `Status: Connected`; `maki --version` prints
`maki 0.6.0`; `uname -m` is `arm64` or `x86_64`. An absent command means the
matching step in Phase 2 installs it; a present tool whose version or status
does not match is a mismatch — fix it in Phase 2 rather than skipping ahead.

## Phase 2 — Host tooling install

### Container engine (Docker Engine 28+ or OrbStack)

macOS (Homebrew):

```sh
brew install --cask orbstack      # or Docker Desktop
```

Linux: install Docker Engine 28+ from your distribution's packages. Engine
background and the Docker Desktop networking toggles OpenShell needs are in
[`docs/setup-guide.md`](../setup-guide.md) §2; the OpenShell
[support matrix](https://docs.nvidia.com/openshell/about/support-matrix.md)
lists supported hosts.

### OpenShell CLI + gateway

Install via the upstream installer (CLI, policy prover, and local gateway in
one step; details in the OpenShell
[installation doc](https://docs.nvidia.com/openshell/about/installation.md)):

```sh
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
openshell status
```

If `openshell status` is not `Connected`, restart the gateway service and
re-verify before proceeding — never continue on a disconnected gateway:

```sh
brew services restart openshell             # macOS
systemctl --user restart openshell-gateway  # Linux
```

### Maki CLI

```sh
curl -LsSf https://maki.sh/install.sh | sh
maki --version
```

The host Maki must be the release pinned by
[`examples/maki-image/Dockerfile`](../../examples/maki-image/Dockerfile)
(`ARG MAKI_VERSION`); Maki's [quick start](https://maki.sh/docs/quick-start/)
covers other install options. Do not run `maki auth login` — model credentials
go through OpenShell provider profiles (Phase 3), never Maki's own store.

### Verify

```sh
docker version --format '{{.Server.Version}}'
openshell status
maki --version
```

Expected: `28.0` or later; `Status: Connected`; `maki 0.6.0`. Stop on any
mismatch.

## Phase 3 — Repository and helper setup

Clone this repository and work from its root:

```sh
git clone <repository-url> maki-openshell
cd maki-openshell
```

Run the executable preflight. On a fresh machine the image check fails until
the next step builds it; every other line must read `ok`:

```sh
./bin/maki-oss doctor
```

Build the sandbox image (bakes the pinned Maki release) and verify it:

```sh
./bin/maki-oss image build
docker run --rm maki-agent:local maki --version
```

Then the one-time provider wizard — it scans the Maki and OpenCode credential
stores, lints and imports a profile, and creates the provider; the credential
never appears in argv, output, or this repository:

```sh
./bin/maki-oss provider setup
```

One provider is enough to start. To migrate a host that already holds many
credentials — audit both stores, classify each slug, and re-sync after a key
rotates — follow [`docs/dogfood-migration.md`](../dogfood-migration.md).

### Verify

```sh
./bin/maki-oss doctor
openshell provider list
```

Expected: every doctor line reads `ok` and it exits `0` (the image now
exists); the provider list names the provider you created. Stop on any
failure.

## Phase 4 — Shell preparation

Choose exactly one primary path per shell; verify it before moving on.

**zsh (and other POSIX shells)** — put the repository's `bin/` on `PATH`
(for example in `~/.zshrc`):

```sh
export PATH="/absolute/path/to/maki-openshell/bin:$PATH"
```

**fish** — install the plugin with fisher, from the repository root:

```sh
fisher install ./fish
```

Without fisher, the helper symlinks the function and completions itself:

```sh
maki-oss fish install
```

**Fallback:** if neither the `PATH` entry nor the fish function resolves the
helper, set `MAKI_OSS_BIN` to the absolute path of this repository's
`bin/maki-oss` — the wrapper resolves `$MAKI_OSS_BIN` first, then the source
repository, then `PATH`.

### Verify

```sh
command -v maki-oss                        # zsh
type -q maki-oss                           # fish
ls ~/.config/fish/completions/maki-oss.fish  # fish completions
```

Expected: `command -v maki-oss` (zsh) or `type -q maki-oss` (fish) resolves
to this repository's `bin/maki-oss`, and the fish completion file exists.
Stop on any mismatch.

## Phase 5 — Daily driver

**Once per machine** (completed in Phase 3; listed here only to keep it
separate from the loop): `maki-oss doctor`, `maki-oss image build`,
`maki-oss provider setup`.

**Every project** — the everyday loop:

```sh
cd ~/code/myproject
maki-oss                              # interactive session
maki-oss run "fix the failing tests"  # headless variant
maki-oss status                       # project sandbox state
maki-oss stop                         # park the sandbox
maki-oss rm                           # delete it (prompts; --yes non-interactive)
```

Bare `maki-oss` creates or reuses the project sandbox, uploads the project on
first creation, attaches remembered providers, launches Maki, and syncs
changes back into the project directory on exit (`--no-sync` opts out). A
reused sandbox is not re-uploaded — run `maki-oss upload` first to refresh it
from the current host tree. Full reference: [`docs/helper.md`](../helper.md).

### Verify

```sh
cd ~/code/myproject
maki-oss status
```

Expected: the project sandbox is reported with its phase and attached
providers. Stop on any mismatch.

### Handoff

Sandbox phases — provider profiles, policy choice, sandbox creation, isolation
checks, and running Maki with the raw commands — continue in
[`docs/ai/agent-playbook.md`](agent-playbook.md). This playbook ends here by
design; do not improvise sandbox steps from this file.

## Invariants (never relax these to make a command work)

- No host bind mounts — project files move with upload/download.
- No secrets through `--env`; credentials come from provider profiles only.
- Egress stays deny-by-default; add the narrowest missing rule, never a
  wildcard or `tls: skip`, to fix a denial.
- Sandbox processes stay non-root (uid/gid 1500).
- Never run `maki auth login` inside a sandbox, and never set a provider
  base-URL override there.
