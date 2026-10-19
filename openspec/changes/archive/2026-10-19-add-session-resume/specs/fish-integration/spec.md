# Spec Delta

## MODIFIED Requirements

### Requirement: Completions for commands and options
The completion file SHALL complete the subcommands `doctor`, `image`, `init`, `up`, `maki`, `run`, `upload`, `download`, `status`, `list`, `logs`, `policy`, `provider`, `start`, `stop`, `rm`, `fish`, and `help`, plus the provider subcommands `add`, `attach`, `list`, and `setup`, and the common flags `--name`, `--image`, `--policy`, `--provider`, `--yes`, `--allow-env`, `--model`, `--from`, `--credential`, `--profile`, `--continue`, `--resume`, and `--session-id`.

#### Scenario: Subcommand completion
- **WHEN** the user types `maki-oss ` and presses Tab in a fish session with the plugin installed
- **THEN** the completion list includes `doctor`, `up`, `run`, and `status`

#### Scenario: Flag completion
- **WHEN** the user types `maki-oss run --` and presses Tab
- **THEN** the completion list includes `--name`, `--yes`, `--model`, and `--continue`

#### Scenario: Session resume completion
- **WHEN** the user types `maki-oss maki --res` and presses Tab
- **THEN** the completion list offers `--resume`, and `--continue` and `--session-id` are both offered after `maki-oss maki --`

#### Scenario: Provider setup completion
- **WHEN** the user types `maki-oss provider ` and presses Tab
- **THEN** the completion list includes `setup`
