# fish-integration Specification

## Purpose
The fish plugin makes `maki-oss` a first-class fish command: it exposes the helper as a function, offers subcommand and flag completion, and installs or uninstalls cleanly with or without fisher.

## Requirements

### Requirement: Fisher-compatible plugin layout
The repository SHALL provide a fish plugin at `fish/` containing `functions/maki-oss.fish`, `completions/maki-oss.fish`, and `conf.d/maki-oss.fish`, so that `fisher install ./fish` installs the function and completions into a user's fish configuration.

#### Scenario: Fresh install resolves the command
- **WHEN** a user runs `fisher install ./fish` and opens a new fish session with a stubbed `openshell` on `PATH`
- **THEN** `type maki-oss` reports a function, `fish -n` reports no syntax errors for the installed files, and `maki-oss help` prints usage

### Requirement: Completions for commands and options
The completion file SHALL complete the subcommands `doctor`, `image`, `init`, `up`, `maki`, `run`, `upload`, `download`, `status`, `list`, `logs`, `policy`, `provider`, `start`, `stop`, `rm`, `fish`, and `help`, plus the common flags `--name`, `--image`, `--policy`, `--provider`, `--yes`, and `--allow-env`.

#### Scenario: Subcommand completion
- **WHEN** the user types `maki-oss ` and presses Tab in a fish session with the plugin installed
- **THEN** the completion list includes `doctor`, `up`, `run`, and `status`

#### Scenario: Flag completion
- **WHEN** the user types `maki-oss run --` and presses Tab
- **THEN** the completion list includes `--name` and `--yes`

### Requirement: Symlink fallback install
`maki-oss fish install` SHALL install the plugin without fisher by symlinking the plugin's `functions/` and `completions/` entries into `${XDG_CONFIG_HOME:-$HOME/.config}/fish`, and SHALL be idempotent. `maki-oss fish uninstall` SHALL remove only links that point into this repository and SHALL leave foreign files untouched.

#### Scenario: Idempotent symlink install
- **WHEN** the user runs `maki-oss fish install` twice
- **THEN** both runs exit 0, the second reports the plugin is already installed, and no duplicate or broken links exist

#### Scenario: Uninstall leaves user files alone
- **WHEN** the user has a file in `~/.config/fish/functions/` that was not installed by the helper and runs `maki-oss fish uninstall`
- **THEN** that file is not deleted and the command reports it was skipped
