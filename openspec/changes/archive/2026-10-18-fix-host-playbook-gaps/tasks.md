# Tasks

## 1. Shell preparation (Phase 4)

- [x] 1.1 Make `./bin/maki-oss fish install` the documented fish path in
      `docs/ai/host-playbook.md`, presented as runnable from the repository
      root, and demote `fisher install ./fish` to the alternative — verify
      with `grep -Fq './bin/maki-oss fish install' docs/ai/host-playbook.md`
      and
      `awk '/\.\/bin\/maki-oss fish install/{a=NR} /fisher install \.\/fish/{b=NR} END{exit !(a&&b&&a<b)}' docs/ai/host-playbook.md`
      both exiting `0`.
- [x] 1.2 Split the Phase 4 Verify block per shell: `command -v maki-oss`
      for POSIX shells, `fish -c 'type -q maki-oss'` plus the completion-file
      check for fish — verify with
      `grep -Fq "fish -c 'type -q maki-oss'" docs/ai/host-playbook.md`
      exiting `0` and
      `test "$(grep -c 'type -q maki-oss' docs/ai/host-playbook.md)" -eq 1`
      (the only `type -q` line is the `fish -c` one).
- [x] 1.3 Mirror the fish correction in `docs/helper.md`'s "Fish setup"
      section — verify with
      `grep -Fq './bin/maki-oss fish install' docs/helper.md` exiting `0`.

## 2. Host preconditions (Phase 2)

- [x] 2.1 State Homebrew as the macOS precondition before the engine install
      step, with `brew --version` as its check — verify with
      `grep -Fq 'brew --version' docs/ai/host-playbook.md` exiting `0` and
      `awk '/brew --version/{a=NR} /brew install --cask orbstack/{b=NR} END{exit !(a&&b&&a<b)}' docs/ai/host-playbook.md`
      exiting `0` (the precondition precedes the install).
- [x] 2.2 State Linux engine access for a non-root user — docker group
      membership with its required re-login, or a rootless engine — with a
      check, before the engine install step — verify with
      `grep -Fq 'docker group' docs/ai/host-playbook.md` and
      `grep -Fqi 'rootless' docs/ai/host-playbook.md` both exiting `0`.

## 3. Provider step (Phase 3)

- [x] 3.1 State the wizard's required input (a model API key, exported or
      already in a Maki or OpenCode credential store) and name the
      non-interactive forms `--from STORE --credential SLUG --yes`,
      `--env VAR`, `--file PATH`, pointing at `docs/providers.md` for the
      full table — verify with
      `for p in 'API key' '--from STORE' '--env VAR' '--file PATH' 'providers.md'; do grep -Fq -- "$p" docs/ai/host-playbook.md || exit 1; done`
      exiting `0`.
- [x] 3.2 Scope the `maki auth login` restriction to the sandbox, matching
      `AGENTS.md` — verify with
      `grep -n 'maki auth login' docs/ai/host-playbook.md | grep -qi sandbox`
      exiting `0`.

## 4. Verification-block correctness

- [x] 4.1 Phase 5 Verify reports both `maki-oss status` outcomes —
      `Exists: yes` with phase and providers, and `Exists: no` with a
      non-zero exit when the project sandbox is absent or was removed —
      verify with `grep -Fq 'Exists: no' docs/ai/host-playbook.md` exiting
      `0`.
- [x] 4.2 Phase 3's doctor wording tolerates the `warn` line printed when
      `jq` is absent — verify with
      `grep -q 'warn' docs/ai/host-playbook.md` exiting `0` and the sentence
      no longer claiming every non-image line reads `ok` verbatim
      (`grep -c 'every other line must read `ok`' docs/ai/host-playbook.md`
      printing `0`).

## 5. Gates, links, and regression

- [x] 5.1 Keep every external URL inside `docs/ai/references.md` — verify
      with
      `for u in $(grep -o 'https://[^)> ]*' docs/ai/host-playbook.md | sort -u); do grep -Fq "$u" docs/ai/references.md || { echo "unlisted: $u"; exit 1; }; done`
      exiting `0` and `scripts/check-links.sh docs/ai/host-playbook.md`
      exiting `0`.
- [x] 5.2 Confirm no regression in the existing gates — run `make test` and
      `make lint` and verify both exit `0`.
- [x] 5.3 Exercise the corrected paths on this host without touching the
      user's fish config: `make -n install-fish` printing
      `bin/maki-oss fish install`, `command -v maki-oss` resolving after a
      PATH export in a subshell, and (when fish is installed)
      `fish -c 'type -q maki-oss'` exiting `0` — while
      `zsh -c 'type -q maki-oss'` is expected to fail, confirming the split
      was needed.
- [x] 5.4 Confirm the change artifacts validate — run
      `openspec validate fix-host-playbook-gaps --strict` and verify it
      reports the change valid.
