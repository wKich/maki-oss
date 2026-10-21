#!/bin/zsh
# Capture helper for the spike: boots the stub, drives the real TUI with
# typed prompts, then tears both down. Usage:
#   harness/capture.sh "<prompt text>" <seconds to watch> [LOG] [SSE_LOG]
# Optional second prompt (stub answers it with a permission request):
#   SECOND_PROMPT="..." ANSWER_DELAY=3 ANSWER_KEY='\r' harness/capture.sh ...
# Prompts are typed as fused writes (text + CR); splitting the CR into its
# own write made the TUI drop the submit in testing.
set -e
cd "$(dirname "$0")/.."
PROMPT=$1
WAIT=${2:-10}
export LOG="$PWD/${3:-evidence/prompt-trace.log}"
export SSE_LOG="$PWD/${4:-evidence/sse-events.jsonl}"
export PORT=${PORT:-4599}
# fresh client state/data per run: the TUI restores recent sessions from its
# local state, and stale ones (with dead "sample" locations) block the composer
export XDG_STATE_HOME=${XDG_STATE_HOME:-/tmp/opencode-spike-state}
export XDG_DATA_HOME=${XDG_DATA_HOME:-/tmp/opencode-spike-data}
rm -rf "$XDG_STATE_HOME" "$XDG_DATA_HOME"
SECOND=${SECOND_PROMPT:-}
ANSWER_DELAY=${ANSWER_DELAY:-3}
ANSWER_KEY=${ANSWER_KEY:-'\r'}
rm -f /tmp/tui-run.typescript /tmp/input-phase.log

pkill -f "bun.*harness/stub" 2>/dev/null || true
sleep 1
if [[ -z "$NO_TRUNCATE" ]]; then : > "$LOG"; : > "$SSE_LOG"; fi
bun harness/stub.ts > /tmp/stub.out 2>&1 &
STUB=$!
sleep 1
(
  (
    sleep 8; printf '%s\r' "$PROMPT"; echo "p1 $(date +%T) second=[$SECOND]" >> /tmp/input-phase.log; sleep "$WAIT"
    if [[ -n "$SECOND" ]]; then
      # a "session location unavailable" recovery dialog grabs the composer
      # after the first prompt; esc dismisses it so the second prompt types
      printf '\033'; echo "esc $(date +%T)" >> /tmp/input-phase.log; sleep 1
      printf '%s\r' "$SECOND"; echo "p2 $(date +%T)" >> /tmp/input-phase.log; sleep "$ANSWER_DELAY"; printf "$ANSWER_KEY"; echo "ans $(date +%T)" >> /tmp/input-phase.log
    fi
    sleep 5; echo "done $(date +%T)" >> /tmp/input-phase.log
  ) |
  script -qF /tmp/tui-run.typescript opencode --server "http://127.0.0.1:$PORT" --print-logs \
    > /tmp/tui-stdout.log 2>&1 & )
TAIL=5
[[ -n "$SECOND" ]] && TAIL=$((ANSWER_DELAY + 10))
sleep $((8 + WAIT + TAIL))
pkill -f "opencode --server http://127.0.0.1:$PORT" 2>/dev/null || true
sleep 2   # let script flush the typescript file after the TUI exits
kill "$STUB" 2>/dev/null || true
echo "captured: $LOG ($(wc -l < "$LOG") lines), $SSE_LOG ($(wc -l < "$SSE_LOG") lines), typescript $(wc -c < /tmp/tui-run.typescript) bytes"
