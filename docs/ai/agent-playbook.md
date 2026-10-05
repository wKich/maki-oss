# Agent playbook: stand up a sandboxed Maki

Ordered, executable steps for a coding agent. Run every command from the
repository root. After each phase, run its verification and stop on a
mismatch — do not work around a failed check by weakening isolation.

The only inputs required from the user:

- a model API key exported in the environment (`ANTHROPIC_API_KEY` or
  `OPENROUTER_API_KEY`), and
- the project path to upload (optional; skip the upload steps to work in an
  empty workspace).

If a denial blocks the task, read `docs/setup-guide.md` §8 and
`docs/ai/references.md` before changing anything. Never relax an invariant
listed at the end of this file.

## Phase 0 — Preflight

```sh
docker version --format '{{.Server.Version}}'
openshell status
uname -m
```

Verify: Docker `28.0` or later; `openshell status` shows `Status: Connected`;
`uname -m` is a supported architecture (`arm64` or `x86_64`).

Then choose the provider (decision point A):

- If `ANTHROPIC_API_KEY` is set, use:
  - profile file `examples/providers/maki-anthropic.yaml`
  - profile ID and provider type `maki-anthropic`
- Else if `OPENROUTER_API_KEY` is set, use:
  - profile file `examples/providers/maki-openrouter.yaml`
  - profile ID and provider type `maki-openrouter`
- If neither key is set, stop and ask the user to export one. Do not accept a
  key pasted into the conversation, and do not put a key on a command line.

## Phase 1 — Build the image

```sh
docker build --build-arg MAKI_VERSION=0.6.0 -t maki-agent:local examples/maki-image
docker run --rm maki-agent:local maki --version
```

Verify: the build succeeds and prints `maki 0.6.0`.

## Phase 2 — Load the provider profile and create the provider

Substitute the profile file and type chosen in Phase 0:

```sh
openshell profile lint -f examples/providers/maki-anthropic.yaml
openshell profile import -f examples/providers/maki-anthropic.yaml --global
openshell provider create --name maki-anthropic --type maki-anthropic --from-existing
```

Verify:

```sh
openshell profile describe maki-anthropic
openshell provider list
```

Expected: the profile shows `api.anthropic.com:443` and binary
`/usr/local/bin/maki`; the provider list names `maki-anthropic` and exposes
credential key names only (never values). If `provider create` fails, the key
environment variable is missing for the type's `discovery` section.

## Phase 3 — Choose the sandbox policy

Default: `examples/policies/maki-minimal.yaml` (no network rules of its own;
the provider adds the model endpoint).

Decision point B — does the task need `git push` to GitHub?

- No: keep `maki-minimal.yaml`.
- Yes: copy `examples/policies/maki-git-push.yaml` to a scratch file, replace
  its two repository placeholders (owner and repository name, case-sensitive),
  and import/attach the upstream `github` profile plus a GitHub provider for
  credentials.

Policy choice is fixed into the sandbox at creation; network rules can be
changed later with `openshell policy set`.

## Phase 4 — Create the sandbox

Decision point C — is there a project to upload?

```sh
# With a project (uploads require the create command to have no trailing
# main command; Maki is launched later with sandbox exec):
openshell sandbox create --name maki \
  --from maki-agent:local \
  --policy examples/policies/maki-minimal.yaml \
  --provider maki-anthropic \
  --upload "$PROJECT_PATH:/sandbox/project"

# Without a project:
openshell sandbox create --name maki \
  --from maki-agent:local \
  --policy examples/policies/maki-minimal.yaml \
  --provider maki-anthropic
```

Verify:

```sh
openshell sandbox list
openshell policy get maki --full
```

Expected: the sandbox reaches `Ready`; the effective policy contains
`/usr/local/bin/maki -> api.anthropic.com:443` contributed by the provider
(`_provider_*` rule). A missing provider rule means the provider attachment
failed.

## Phase 5 — Run the isolation checks

Execute every check in `docs/verification.md` and confirm each expected
output. Do not proceed on a failure; report it with the command output.

## Phase 6 — Run Maki

Smoke test first (cheap, proves model access end to end):

```sh
openshell sandbox exec -n maki --workdir /sandbox/project --no-login-shell -- \
  maki -p "Reply with OK." --output-format json
```

Then run the real task the same way: pass the user's task text as the argument
to `-p` in place of the smoke-test string.

`sandbox exec` starts a new process, so it picks up the current provider
placeholders. Use `--output-format json` for machine-readable results.

## Phase 7 — Collect results and clean up

```sh
openshell sandbox download maki /sandbox/project ./project-out
openshell sandbox delete maki
```

Downloads are limited to paths inside the sandbox working directory — keep
results under `/sandbox`.

## Invariants (never relax these to make a command work)

- No host bind mounts. Move files with `sandbox upload` / `sandbox download`.
- No secrets via `openshell sandbox create --env` or `sandbox exec --env`.
  Credentials come from provider profiles only.
- Egress stays deny-by-default. Add the narrowest missing rule, never `tls:
  skip`, `access: full`, or a wildcard host to fix a denial.
- The sandbox process stays non-root (uid/gid 1500).
- Never run `maki auth login` inside a sandbox, and never set
  `ANTHROPIC_BASE_URL` / `OPENROUTER_BASE_URL` there.
- Do not edit `examples/` to match a failing local state; fix the local state
  or report the drift.
