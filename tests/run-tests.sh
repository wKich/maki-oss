#!/bin/sh
# Stub-backed test suite for bin/maki-oss, the fish plugin, and the safety
# rules in specs/helper-cli and specs/fish-integration.
#
# Runs with only a POSIX shell and the stubs under tests/stub: no Docker, no
# gateway, no network. Run it with `make test` or directly:
#
#   tests/run-tests.sh

set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)
MAKI=$ROOT/bin/maki-oss
STUB_DIR=$ROOT/tests/stub

WORK=$(mktemp -d "${TMPDIR:-/tmp}/maki-oss-tests.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM

PASS=0
FAIL=0
SKIP=0
CURRENT=
RC=0
LOG=
OUT=
ERR=

begin() { CURRENT=$1; }

run_test() {
    before_fail=$FAIL
    before_skip=$SKIP
    "$1"
    if [ "$FAIL" -ne "$before_fail" ]; then
        return 0
    fi
    if [ "$SKIP" -ne "$before_skip" ]; then
        return 0
    fi
    PASS=$((PASS + 1))
    printf 'ok   %s\n' "$CURRENT"
}

bad() {
    FAIL=$((FAIL + 1))
    printf 'FAIL %s\n' "$CURRENT"
    if [ -n "${1:-}" ]; then
        printf '     %s\n' "$1"
    fi
}

skipped() { SKIP=$((SKIP + 1)); printf 'skip %s (%s)\n' "$CURRENT" "$1"; }

new_case() {
    CASE=$WORK/$1
    mkdir -p "$CASE/home" "$CASE/project" "$CASE/state"
    XDG_CONFIG_HOME=$CASE/home/.config
    HOME=$CASE/home
    STUB_LOG=$CASE/stub.log
    STUB_STATE_DIR=$CASE/state
    LOG=$STUB_LOG
    OUT=$CASE/out
    ERR=$CASE/err
    RUN_DIR=
    ENV_NAME=
    ENV_IMAGE=
    ENV_POLICY=
    ENV_PROVIDERS=
    ENV_MAKI_VERSION=
    ENV_EDITOR=
    EXEC_STDOUT=
    EXEC_EXIT=
    GATEWAY_DOWN=
    PROVIDER_NAMES=
    PATH_OVERRIDE=
    FISH_PATH=
    RC=0
}

run_maki() {
    RC=0
    (
        cd "${RUN_DIR:-$CASE/project}"
        PATH="${PATH_OVERRIDE:-$STUB_DIR:$PATH}" \
        HOME="$HOME" \
        XDG_CONFIG_HOME="$XDG_CONFIG_HOME" \
        STUB_LOG="$STUB_LOG" \
        STUB_STATE_DIR="$STUB_STATE_DIR" \
        STUB_EXEC_STDOUT="${EXEC_STDOUT:-stub-exec-output}" \
        STUB_EXEC_EXIT="${EXEC_EXIT:-0}" \
        STUB_GATEWAY_DOWN="${GATEWAY_DOWN:-0}" \
        STUB_PROVIDER_NAMES="${PROVIDER_NAMES:-}" \
        MAKI_OSS_SANDBOX_NAME="${ENV_NAME:-}" \
        MAKI_OSS_IMAGE="${ENV_IMAGE:-}" \
        MAKI_OSS_POLICY="${ENV_POLICY:-}" \
        MAKI_OSS_PROVIDERS="${ENV_PROVIDERS:-}" \
        MAKI_VERSION="${ENV_MAKI_VERSION:-}" \
        EDITOR="${ENV_EDITOR:-true}" \
        "$MAKI" "$@" >"$OUT" 2>"$ERR" </dev/null
    ) || RC=$?
}

run_fish() {
    RC=0
    FISH_OUT=$CASE/fish.out
    (
        unset MAKI_OSS_BIN
        PATH="${FISH_PATH:-$STUB_DIR:$PATH}" \
        HOME="$HOME" \
        XDG_CONFIG_HOME="$XDG_CONFIG_HOME" \
        fish -c "$1" >"$FISH_OUT" 2>&1
    ) || RC=$?
}

reset_log() { : >"$LOG"; }

reset_state() {
    rm -rf "$STUB_STATE_DIR"
    mkdir -p "$STUB_STATE_DIR"
}

seed_sandbox() {
    mkdir -p "$STUB_STATE_DIR/sandboxes" "$STUB_STATE_DIR/providers"
    printf '%s\n' "${2:-Ready}" >"$STUB_STATE_DIR/sandboxes/$1"
    : >"$STUB_STATE_DIR/providers/$1"
}

assert_rc() {
    if [ "$RC" -ne "$1" ]; then
        bad "expected exit $1, got $RC (stderr: $(head -n 1 "$ERR" 2>/dev/null))"
    fi
}

assert_out_has() {
    if ! grep -Fq -- "$1" "$OUT" 2>/dev/null; then
        bad "stdout missing: $1"
    fi
}

assert_err_has() {
    if ! grep -Fq -- "$1" "$ERR" 2>/dev/null; then
        bad "stderr missing: $1"
    fi
}

assert_log_line() {
    if ! grep -Fxq -- "$1" "$LOG" 2>/dev/null; then
        bad "argv log missing argument: $1"
    fi
}

assert_log_has() {
    if ! grep -Fq -- "$1" "$LOG" 2>/dev/null; then
        bad "argv log missing: $1"
    fi
}

assert_log_missing() {
    if [ -f "$LOG" ] && grep -Fq -- "$1" "$LOG"; then
        bad "argv log unexpectedly contains: $1"
    fi
}

assert_log_line_missing() {
    if [ -f "$LOG" ] && grep -Fxq -- "$1" "$LOG"; then
        bad "argv log unexpectedly contains argument: $1"
    fi
}

assert_fish_out_has() {
    if ! grep -Fq -- "$1" "$FISH_OUT" 2>/dev/null; then
        bad "fish output missing: $1"
    fi
}

# ---------------------------------------------------------------------------

test_help() {
    begin "help prints usage"
    new_case help
    run_maki help
    assert_rc 0
    assert_out_has "Usage:"
    assert_out_has "doctor"
    assert_out_has "provider add|attach|list"
}

test_usage_errors() {
    begin "usage errors exit 1"
    new_case usage
    run_maki frobnicate
    assert_rc 1
    run_maki up --definitely-not-an-option
    assert_rc 1
    run_maki download
    assert_rc 1
    reset_log
    run_maki download
    assert_log_missing "download"
}

test_config_precedence() {
    begin "configuration precedence: flag > env > config > default"
    new_case precedence
    mkdir -p "$XDG_CONFIG_HOME/maki-openshell"
    printf 'sandbox_name = "a"\n' >"$XDG_CONFIG_HOME/maki-openshell/config.toml"

    run_maki up
    assert_rc 0
    assert_log_line "a"

    reset_state
    reset_log
    ENV_NAME=b
    run_maki up
    assert_rc 0
    assert_log_line "b"
    assert_log_line_missing "a"

    reset_state
    reset_log
    run_maki up --name c
    assert_rc 0
    assert_log_line "c"
    assert_log_line_missing "b"
}

test_config_unknown_key() {
    begin "unknown config key names file and key"
    new_case unknown-key
    mkdir -p "$XDG_CONFIG_HOME/maki-openshell"
    printf 'opennshell_path = "/x"\n' >"$XDG_CONFIG_HOME/maki-openshell/config.toml"
    run_maki status
    assert_rc 1
    assert_err_has "opennshell_path"
    assert_err_has "config.toml"
}

test_up_creates() {
    begin "first up creates maki-<project> with image, policy, providers"
    new_case create
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    run_maki up --provider maki-anthropic --cpu 2 --memory 4Gi
    assert_rc 0
    assert_log_has "create"
    assert_log_line "--name"
    assert_log_line "maki-myproject"
    assert_log_line "--from"
    assert_log_line "maki-agent:local"
    assert_log_line "--policy"
    assert_log_line "$ROOT/examples/policies/maki-minimal.yaml"
    assert_log_line "--detach"
    assert_log_line "--provider"
    assert_log_line "maki-anthropic"
    assert_log_line "--cpu"
    assert_log_line "--memory"
    if [ ! -e "$STUB_STATE_DIR/sandboxes/maki-myproject" ]; then
        bad "sandbox state was not created"
    fi
}

test_up_idempotent() {
    begin "up is idempotent: starts instead of recreating"
    new_case idempotent
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready

    run_maki up
    assert_rc 0
    assert_log_missing "create"
    assert_log_missing "sandbox start"

    printf 'Stopped\n' >"$STUB_STATE_DIR/sandboxes/maki-myproject"
    reset_log
    run_maki up
    assert_rc 0
    assert_log_has "start"
    assert_log_missing "create"
    count=0
    for entry in "$STUB_STATE_DIR/sandboxes"/*; do
        if [ -e "$entry" ]; then
            count=$((count + 1))
        fi
    done
    if [ "$count" -ne 1 ]; then
        bad "expected exactly 1 sandbox, found $count"
    fi
}

test_run_passthrough() {
    begin "run streams stdout and propagates exit codes"
    new_case run
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready
    EXEC_STDOUT='{"result":"stub-ok"}'

    run_maki run "fix the tests"
    assert_rc 0
    assert_out_has '{"result":"stub-ok"}'
    assert_log_has "exec"
    assert_log_line "--print"
    assert_log_line "--yolo"
    assert_log_line "--trust"
    assert_log_line "--output-format"
    assert_log_line "json"
    assert_log_line "fix the tests"

    EXEC_STDOUT='partial-output'
    EXEC_EXIT=1
    reset_log
    run_maki run "fail please"
    assert_rc 1
    assert_out_has "partial-output"
}

test_maki_attach() {
    begin "maki attaches interactively through exec --tty"
    new_case maki
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready
    run_maki maki
    assert_rc 0
    assert_log_has "exec"
    assert_log_line "--tty"
    assert_log_line "maki"
}

test_upload_no_mount() {
    begin "upload delegates and never mounts"
    new_case upload
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready
    run_maki upload .
    assert_rc 0
    assert_log_has "upload"
    assert_log_line "."
    assert_log_line "/sandbox/project"
    assert_log_missing "driver-config-json"
    assert_log_missing "mounts"
    assert_log_missing "bind"
}

test_download() {
    begin "download delegates to the gateway with an explicit destination"
    new_case download
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready
    run_maki download /sandbox/project/out ./out
    assert_rc 0
    assert_log_has "download"
    assert_log_line "/sandbox/project/out"
    assert_log_line "./out"
}

test_env_refusal() {
    begin "--env refuses credential-like keys"
    new_case env-refusal
    run_maki init --env ANTHROPIC_API_KEY=test
    assert_rc 1
    assert_err_has "ANTHROPIC_API_KEY"
    assert_err_has "provider"
    assert_log_missing "create"
}

test_env_allow_override() {
    begin "--allow-env overrides the refusal for one key"
    new_case env-allow
    run_maki init --env MY_TOKEN=x --allow-env MY_TOKEN
    assert_rc 0
    assert_log_has "--env"
    assert_log_line "MY_TOKEN=x"
}

test_env_lookalike() {
    begin "segment matching avoids TOKENIZERS-style false positives"
    new_case env-lookalike
    run_maki init --env TOKENIZERS_PARALLELISM=false
    assert_rc 0
    assert_log_line "TOKENIZERS_PARALLELISM=false"
}

test_rm_confirmation() {
    begin "rm requires --yes when stdin is not a TTY"
    new_case rm
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready

    run_maki rm
    if [ "$RC" -eq 0 ]; then
        bad "rm without --yes should fail on a non-TTY stdin"
    fi
    assert_log_missing "delete"

    reset_log
    run_maki rm --yes
    assert_rc 0
    assert_log_has "delete"
    assert_log_line "maki-myproject"
    if [ -e "$STUB_STATE_DIR/sandboxes/maki-myproject" ]; then
        bad "sandbox state should be deleted"
    fi
}

test_doctor_missing_cli() {
    begin "doctor reports a missing openshell CLI first"
    new_case doctor-nocli
    mkdir -p "$CASE/nobin"
    PATH_OVERRIDE="$CASE/nobin:/usr/bin:/bin"
    run_maki doctor
    assert_rc 2
    assert_out_has "openshell CLI: not found"
    assert_log_missing "sandbox"
}

test_doctor_gateway_down() {
    begin "doctor fails when the gateway is unreachable"
    new_case doctor-down
    GATEWAY_DOWN=1
    run_maki doctor
    assert_rc 3
    assert_out_has "gateway: unreachable"
}

test_doctor_all_pass() {
    begin "doctor passes with all prerequisites present"
    new_case doctor-ok
    PROVIDER_NAMES=maki-anthropic
    run_maki doctor --provider maki-anthropic
    assert_rc 0
    assert_out_has "openshell CLI:"
    assert_out_has "gateway: connected"
    assert_out_has "container engine: docker"
    assert_out_has "image: maki-agent:local present"
    assert_out_has "policy file:"
    assert_out_has "providers: maki-anthropic"
}

test_image_build_argv() {
    begin "image build passes MAKI_VERSION and tags the image"
    new_case image-build
    ENV_MAKI_VERSION=9.9.9
    run_maki image build
    assert_rc 0
    assert_log_has "build"
    assert_log_line "--build-arg"
    assert_log_line "MAKI_VERSION=9.9.9"
    assert_log_line "-t"
    assert_log_line "maki-agent:local"
    assert_log_has "examples/maki-image"
}

test_status_list_logs() {
    begin "status, list, and logs report and delegate"
    new_case status
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready
    printf 'maki-anthropic\n' >>"$STUB_STATE_DIR/providers/maki-myproject"

    run_maki status
    assert_rc 0
    assert_out_has "Sandbox:   maki-myproject"
    assert_out_has "Exists:    yes"
    assert_out_has "Phase:     Ready"
    assert_out_has "Image:     maki-agent:local (configured)"
    assert_out_has "Providers: maki-anthropic"

    run_maki list
    assert_rc 0
    assert_log_has "list"

    run_maki logs --tail --since 5m --level info -n 50
    assert_rc 0
    assert_log_has "logs"
    assert_log_line "--tail"
    assert_log_line "--since"
    assert_log_line "5m"
    assert_log_line "--level"
    assert_log_line "info"
    assert_log_line "-n"
    assert_log_line "50"
}

test_start_stop() {
    begin "start and stop delegate to the gateway"
    new_case lifecycle
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready

    run_maki stop
    assert_rc 0
    assert_log_has "stop"
    assert_log_line "maki-myproject"

    reset_log
    run_maki start
    assert_rc 0
    assert_log_has "start"
    assert_log_line "maki-myproject"
}

test_policy_wrappers() {
    begin "policy show, edit, and apply wrap the openshell commands"
    new_case policy
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready

    run_maki policy show
    assert_rc 0
    assert_log_has "policy"
    assert_log_has "get"
    assert_log_line "--base"
    assert_log_line "maki-myproject"

    reset_log
    run_maki policy apply
    assert_rc 0
    assert_log_has "set"
    assert_log_line "--policy"
    assert_log_line "$ROOT/examples/policies/maki-minimal.yaml"
    assert_log_line "maki-myproject"

    reset_log
    ENV_EDITOR=true
    run_maki policy edit
    assert_rc 0
}

test_provider_wrappers() {
    begin "provider add, attach, and list wrap the openshell commands"
    new_case provider
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    seed_sandbox maki-myproject Ready

    run_maki provider add my-anthropic --type maki-anthropic --from-existing
    assert_rc 0
    assert_log_has "create"
    assert_log_line "--name"
    assert_log_line "my-anthropic"
    assert_log_line "--type"
    assert_log_line "maki-anthropic"
    assert_log_line "--from-existing"

    reset_log
    run_maki provider attach maki-anthropic
    assert_rc 0
    assert_log_has "attach"
    assert_log_line "maki-myproject"
    assert_log_line "maki-anthropic"

    reset_log
    run_maki provider list
    assert_rc 0
    assert_log_has "provider"
    assert_log_has "list"
}

test_provider_inline_secret_rejected() {
    begin "provider add rejects inline credential values"
    new_case provider-secret
    run_maki provider add my-anthropic --type maki-anthropic --credential ANTHROPIC_API_KEY=super-secret
    assert_rc 1
    assert_err_has "inline KEY=VALUE"
    assert_log_missing "super-secret"
}

test_no_jq_fallback() {
    begin "sandbox parsing works without jq"
    new_case no-jq
    RUN_DIR=$CASE/project/myproject
    mkdir -p "$RUN_DIR"
    PATH_OVERRIDE="$STUB_DIR:/usr/bin:/bin"

    run_maki up
    assert_rc 0
    assert_log_has "create"

    reset_log
    run_maki up
    assert_rc 0
    assert_log_missing "create"
    assert_out_has "already exists"

    reset_log
    run_maki status
    assert_rc 0
    assert_out_has "Phase:     Ready"
}

test_missing_policy_dependency() {
    begin "up fails as a dependency error when the policy file is missing"
    new_case missing-policy
    run_maki up --policy "$CASE/does-not-exist.yaml"
    assert_rc 2
}

test_fish_plugin() {
    begin "fish install, idempotence, resolution, and uninstall"
    new_case fish-plugin
    if ! command -v fish >/dev/null 2>&1; then
        skipped "fish is not installed"
        return 0
    fi

    run_maki fish install
    assert_rc 0
    assert_out_has "linked:"
    if [ ! -L "$XDG_CONFIG_HOME/fish/functions/maki-oss.fish" ]; then
        bad "mutations symlink was not created"
    fi

    run_maki fish install
    assert_rc 0
    assert_out_has "already installed"

    run_fish "type -q maki-oss; and maki-oss help"
    assert_rc 0
    assert_fish_out_has "Usage:"

    mkdir -p "$XDG_CONFIG_HOME/fish/functions"
    printf 'keep me\n' >"$XDG_CONFIG_HOME/fish/functions/foreign.fish"
    run_maki fish uninstall
    assert_rc 0
    assert_out_has "removed:"
    if [ ! -f "$XDG_CONFIG_HOME/fish/functions/foreign.fish" ]; then
        bad "foreign file was deleted"
    fi
    if [ -e "$XDG_CONFIG_HOME/fish/functions/maki-oss.fish" ]; then
        bad "managed symlink was not removed"
    fi
}

test_fish_fisher_layout() {
    begin "fisher-style copy (not symlink) resolves via PATH"
    new_case fish-fisher
    if ! command -v fish >/dev/null 2>&1; then
        skipped "fish is not installed"
        return 0
    fi

    # fisher expands plugins into the fish config directory (copies, not
    # symlinks); the wrapper then finds the helper on PATH.
    mkdir -p "$XDG_CONFIG_HOME/fish/functions" "$XDG_CONFIG_HOME/fish/completions"
    cp "$ROOT/fish/functions/maki-oss.fish" "$XDG_CONFIG_HOME/fish/functions/maki-oss.fish"
    cp "$ROOT/fish/completions/maki-oss.fish" "$XDG_CONFIG_HOME/fish/completions/maki-oss.fish"
    FISH_PATH="$STUB_DIR:$ROOT/bin:$PATH"

    run_fish "type -q maki-oss; and maki-oss help"
    assert_rc 0
    assert_fish_out_has "Usage:"
}

test_fish_completions() {
    begin "fish completions list subcommands and flags"
    new_case fish-completions
    if ! command -v fish >/dev/null 2>&1; then
        skipped "fish is not installed"
        return 0
    fi

    run_maki fish install
    assert_rc 0

    run_fish "complete -C 'maki-oss '"
    assert_rc 0
    assert_fish_out_has "doctor"
    assert_fish_out_has "up"
    assert_fish_out_has "run"
    assert_fish_out_has "status"

    run_fish "complete -C 'maki-oss run --'"
    assert_rc 0
    assert_fish_out_has "--name"
    assert_fish_out_has "--yes"
}

test_example_config() {
    begin "examples/config.toml is accepted unchanged"
    new_case example-config
    mkdir -p "$XDG_CONFIG_HOME/maki-openshell"
    cp "$ROOT/examples/config.toml" "$XDG_CONFIG_HOME/maki-openshell/config.toml"
    run_maki up
    assert_rc 0
    assert_log_has "--provider"
    assert_log_line "maki-anthropic"
    assert_log_line "2"
    assert_log_line "4Gi"
    assert_log_has "maki-minimal.yaml"
}

# ---------------------------------------------------------------------------

run_test test_help
run_test test_usage_errors
run_test test_config_precedence
run_test test_config_unknown_key
run_test test_up_creates
run_test test_up_idempotent
run_test test_run_passthrough
run_test test_maki_attach
run_test test_upload_no_mount
run_test test_download
run_test test_env_refusal
run_test test_env_allow_override
run_test test_env_lookalike
run_test test_rm_confirmation
run_test test_doctor_missing_cli
run_test test_doctor_gateway_down
run_test test_doctor_all_pass
run_test test_image_build_argv
run_test test_status_list_logs
run_test test_start_stop
run_test test_policy_wrappers
run_test test_provider_wrappers
run_test test_provider_inline_secret_rejected
run_test test_no_jq_fallback
run_test test_missing_policy_dependency
run_test test_fish_plugin
run_test test_fish_fisher_layout
run_test test_fish_completions
run_test test_example_config

printf '\n%d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -ne 0 ]; then
    exit 1
fi
