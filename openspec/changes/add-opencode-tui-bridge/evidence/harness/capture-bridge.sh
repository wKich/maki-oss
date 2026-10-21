#!/bin/zsh
# End-to-end capture of this repository's bridge against the real OpenCode TUI
# (task 4.2). Adapted from the spike's capture-bridge.sh: same prompts and
# timing, but the Maki backend is the sandbox-adapted bridge/src/bridge.ts
# driven by the scripted SDK child (evidence/harness/fake-maki.ts via
# MAKI_CHILD_CMD) — the injectable-child seam, so the contract capture needs
# no live model. Prompts are typed as fused writes (text + CR).
#
#   harness/capture-bridge.sh [P1] [P2] [P3]
#
# Artifacts land in this change's evidence/: bridge request log, SSE frame
# log, raw SSE bytes, TUI typescript transcript, bridge stdout.
set -e
cd "$(dirname "$0")/../../../../.."   # repo root (script lives in evidence/harness/)
EV="$PWD/openspec/changes/add-opencode-tui-bridge/evidence"
mkdir -p "$EV"

export MAKI_CHILD_CMD="$EV/harness/fake-maki.ts"
export PORT=${PORT:-4622}
export OPENMAKI_CWD=${OPENMAKI_CWD:-$PWD}
export BRIDGE_LOG="$EV/bridge-requests.jsonl"
export BRIDGE_SSE_LOG="$EV/bridge-sse-frames-run.jsonl"
RAW_SSE="$EV/bridge-sse-raw.txt"
TUI_TYPESCRIPT="$EV/tui-run-repo.typescript"

P1=${1:-"Reply with the word PONG only."}
P2=${2:-"Use your shell tool to run exactly: false . Then reply with the single word DONE."}
P3=${3:-"Use your shell tool to run exactly: rm -f /tmp/maki-bridge-perm.txt . Then reply with the single word DONE."}

# fresh client state per run: the TUI restores recent sessions from its local
# state, and stale ones (with dead locations) block the composer
STATE_HOME=${XDG_STATE_HOME:-/tmp/maki-bridge-state}
DATA_HOME=${XDG_DATA_HOME:-/tmp/maki-bridge-data}
rm -rf "$STATE_HOME" "$DATA_HOME"
: > "$BRIDGE_LOG"; : > "$BRIDGE_SSE_LOG"; : > "$RAW_SSE"
rm -f /tmp/maki-bridge-perm.txt

pkill -f "bun.*src/bridge.ts" 2>/dev/null || true
sleep 1
bun bridge/src/bridge.ts > "$EV/bridge-stdout.log" 2>&1 &
BRIDGE=$!
for i in {1..30}; do
  sleep 1
  curl -sf "http://127.0.0.1:$PORT/api/info" -o /dev/null && break
done

# a second subscriber records the raw bytes the TUI's stream would carry
curl -sN "http://127.0.0.1:$PORT/api/event" > "$RAW_SSE" &
CURL=$!

(
  (
    # no esc between prompts: with self-consistent location data there is no
    # recovery dialog to dismiss, and esc would interrupt a running turn
    sleep 12; printf '%s\r' "$P1"
    sleep 20; printf '%s\r' "$P2"
    sleep 20; printf '%s\r' "$P3"
    sleep 10; printf '\r'        # answer the permission dialog (accept once)
    sleep 15
  ) |
  script -qF "$TUI_TYPESCRIPT" env XDG_STATE_HOME="$STATE_HOME" XDG_DATA_HOME="$DATA_HOME" \
    opencode --server "http://127.0.0.1:$PORT" \
    > /dev/null 2>&1 & )

sleep 95
pkill -f "opencode --server http://127.0.0.1:$PORT" 2>/dev/null || true
sleep 2   # let script flush the typescript file after the TUI exits
kill $CURL 2>/dev/null || true
kill $BRIDGE 2>/dev/null || true
pkill -f "bun.*src/bridge.ts" 2>/dev/null || true
sleep 1

echo "captured:"
echo "  requests: $BRIDGE_LOG ($(wc -l < "$BRIDGE_LOG" | tr -d ' ') lines)"
echo "  sse frames: $BRIDGE_SSE_LOG ($(wc -l < "$BRIDGE_SSE_LOG" | tr -d ' ') lines)"
echo "  raw sse: $RAW_SSE ($(wc -c < "$RAW_SSE" | tr -d ' ') bytes)"
echo "  transcript: $TUI_TYPESCRIPT ($(wc -c < "$TUI_TYPESCRIPT" | tr -d ' ') bytes)"
