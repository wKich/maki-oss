# Tasks

## 1. Playbook structure

- [x] 1.1 Create `docs/ai/host-playbook.md` with five phases in order —
      preflight, host tooling, repository and helper setup, shell
      preparation, daily driver with handoff — plus the stop-on-mismatch rule
      — verify with
      `for h in Preflight "Host tooling" Repository "Shell preparation" "Daily driver"; do grep -q "$h" docs/ai/host-playbook.md || exit 1; done`
      exiting `0` and `grep -qi 'stop' docs/ai/host-playbook.md` finding the
      rule.
- [x] 1.2 End every phase with a `### Verify` block giving the command and
      its expected output — verify with
      `test "$(grep -c '^### Verify' docs/ai/host-playbook.md)" -ge 5`
      exiting `0`.

## 2. Host tooling phases

- [x] 2.1 Add the container-engine step with its install command and gate —
      verify with `grep -q "docker version --format" docs/ai/host-playbook.md`
      and `grep -q '28.0' docs/ai/host-playbook.md` both succeeding.
- [x] 2.2 Add the OpenShell step: install via the upstream `install.sh` URL,
      gate on `openshell status` expecting `Connected`, and include both
      gateway recovery commands — verify with
      `grep -q 'https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh' docs/ai/host-playbook.md`,
      `grep -q 'brew services restart openshell' docs/ai/host-playbook.md`,
      and
      `grep -q 'systemctl --user restart openshell-gateway' docs/ai/host-playbook.md`
      all succeeding.
- [x] 2.3 Add the Maki step with `maki --version` gated on the version pinned
      by the image — verify with
      `v=$(sed -n 's/^ARG MAKI_VERSION=\(.*\)/\1/p' examples/maki-image/Dockerfile); grep -q "$v" docs/ai/host-playbook.md`
      exiting `0`.

## 3. Repository, helper, and shell preparation

- [x] 3.1 Add the repository/helper phase in dependency order: clone, then
      `maki-oss doctor`, then `maki-oss image build`, then
      `maki-oss provider setup`, each with its own gate — verify with
      `awk '/maki-oss doctor/{if(!a)a=NR} /maki-oss image build/{if(!b)b=NR} /maki-oss provider setup/{if(!c)c=NR} END{exit !(a&&b&&c&&a<b&&b<c)}' docs/ai/host-playbook.md`
      exiting `0`.
- [x] 3.2 Add shell preparation with exactly one primary path per shell —
      `bin/` on `PATH` for zsh, `fisher install ./fish` for fish, the
      `maki-oss fish install` alternative noted, and `MAKI_OSS_BIN` as the
      last-resort fallback — verify with
      `for p in 'command -v maki-oss' 'type -q maki-oss' 'fisher install ./fish' 'maki-oss fish install' 'MAKI_OSS_BIN'; do grep -Fq "$p" docs/ai/host-playbook.md || exit 1; done`
      exiting `0`.

## 4. Daily driver and handoff

- [x] 4.1 Add the daily-driver section separating the one-time machine setup
      (`maki-oss doctor`, `maki-oss image build`, `maki-oss provider setup`)
      from the per-project loop (`cd <project> && maki-oss`,
      `maki-oss run "<prompt>"`, `maki-oss status`, cleanup) and state the
      bare command's outcome (create or reuse the sandbox, upload on first
      creation, attach remembered providers, launch Maki, sync back on exit)
      — verify with
      `for p in 'maki-oss run' 'maki-oss status' 'upload' 'sync'; do grep -qi "$p" docs/ai/host-playbook.md || exit 1; done`
      exiting `0`.
- [x] 4.2 Add the handoff to `docs/ai/agent-playbook.md` and keep the sandbox
      boundary — no `openshell sandbox create`, `openshell sandbox exec`, or
      `openshell policy set` anywhere in the file — verify with
      `grep -q 'docs/ai/agent-playbook.md' docs/ai/host-playbook.md` exiting
      `0` and
      `test "$(grep -cE 'openshell sandbox (create|exec)|openshell policy set' docs/ai/host-playbook.md)" -eq 0`
      exiting `0`.

## 5. Discoverability

- [x] 5.1 Link the playbook from the README Guides list — verify with
      `grep -c 'docs/ai/host-playbook.md' README.md` printing at least `1`
      and `scripts/check-links.sh README.md` exiting `0`.
- [x] 5.2 Add the pointer to the start-here list in `AGENTS.md` — verify with
      `grep -c 'host-playbook' AGENTS.md` printing at least `1`.

## 6. Drift, links, and regression

- [x] 6.1 State the pinned Maki and OpenShell versions so they match their
      canonical sources — verify with
      `v=$(sed -n 's/^ARG MAKI_VERSION=\(.*\)/\1/p' examples/maki-image/Dockerfile); grep -q "$v" docs/ai/host-playbook.md`
      exiting `0`, and
      `grep -o 'OpenShell v[0-9.]*' docs/ai/references.md` and
      `grep -o 'OpenShell v[0-9.]*' docs/ai/host-playbook.md` printing the
      same value.
- [x] 6.2 Keep every external URL in the playbook inside
      `docs/ai/references.md` — verify with
      `for u in $(grep -o 'https://[^)> ]*' docs/ai/host-playbook.md | sort -u); do grep -Fq "$u" docs/ai/references.md || { echo "unlisted: $u"; exit 1; }; done`
      exiting `0`.
- [x] 6.3 Check the new document's links resolve — verify with
      `scripts/check-links.sh docs/ai/host-playbook.md` exiting `0`.
- [x] 6.4 Confirm no regression in the existing gates — run `make test` and
      `make lint` and verify both exit `0`.
- [x] 6.5 Confirm the change artifacts validate — run
      `openspec validate add-host-setup-agent-playbook --strict` and verify
      it reports the change valid.
- [x] 6.6 Run the playbook's preflight end to end on this already-provisioned
      host — `docker version --format '{{.Server.Version}}'`, `openshell status`,
      `maki --version`, and `./bin/maki-oss doctor` all report present and
      `./bin/maki-oss doctor` exits `0`.
