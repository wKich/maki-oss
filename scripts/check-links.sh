#!/bin/sh
# check-links.sh - check the external links in Markdown docs.
#
# Extracts Markdown link targets (inline `](URL)` and reference
# `[label]: URL` definitions) from every *.md file under the given paths
# (default: docs) and requests each URL once.
#
# Each URL is checked with `curl -fsSL --head` first. Some servers reject
# HEAD while serving GET normally (the OpenShell docs MCP endpoint answers
# HEAD with 500 and GET with 200), so a failed HEAD falls back to a GET that
# discards the body. Only a failed GET is reported as FAIL.
#
# Exit status: 0 when every link resolves, 1 when any link fails, 2 on usage.
# POSIX sh only: no bash arrays, no pipefail, no local.

set -u

usage() {
    printf 'usage: %s [PATH ...]\n' "$0" >&2
    printf '  PATH is a Markdown file or a directory searched recursively.\n' >&2
    printf '  Default: docs\n' >&2
    exit 2
}

if [ "$#" -gt 0 ]; then
    paths="$*"
else
    paths="docs"
fi

work_dir=$(mktemp -d) || {
    printf 'check-links: cannot create a temporary directory\n' >&2
    exit 2
}
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

file_list="$work_dir/files"
url_list="$work_dir/urls"
: > "$file_list"
: > "$url_list"

for path in $paths; do
    if [ -d "$path" ]; then
        find "$path" -type f -name '*.md' -print
    elif [ -f "$path" ]; then
        printf '%s\n' "$path"
    else
        printf 'check-links: not a file or directory: %s\n' "$path" >&2
        usage
    fi
done > "$file_list"

while IFS= read -r file; do
    # Inline links: [label](https://example.com/path)
    grep -Eo '\]\(https?://[^)]+\)' "$file" 2>/dev/null \
        | sed -e 's/^](//' -e 's/)$//' -e 's/[[:space:]].*$//' >> "$url_list" || true
    # Reference definitions: [label]: https://example.com/path
    grep -Eo '^\[[^]]+\]:[[:space:]]*https?://[^[:space:]>]+' "$file" 2>/dev/null \
        | sed -e 's/^\[[^]]*\]:[[:space:]]*//' >> "$url_list" || true
done < "$file_list"

sort -u "$url_list" > "$work_dir/sorted_urls"

total=0
failures=0
while IFS= read -r url; do
    [ -n "$url" ] || continue
    total=$((total + 1))
    if curl -fsSL --head --max-time 30 -o /dev/null "$url" >/dev/null 2>&1; then
        printf 'OK   %s\n' "$url"
    elif curl -fsSL --max-time 30 -o /dev/null "$url" >/dev/null 2>&1; then
        printf 'OK   %s (HEAD rejected; GET resolves)\n' "$url"
    else
        printf 'FAIL %s\n' "$url"
        failures=$((failures + 1))
    fi
done < "$work_dir/sorted_urls"

printf '\nchecked %s link(s); %s failure(s)\n' "$total" "$failures"
[ "$failures" -eq 0 ]
