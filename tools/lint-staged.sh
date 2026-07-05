#!/usr/bin/env bash
# Run ultracite fix on staged files, tolerating the "everything here is
# ultracite-ignored" case (e.g. package.json-only or catalog-only commits),
# which ultracite reports with exit 1 like a real lint failure.
set -uo pipefail

[[ $# -eq 0 ]] && exit 0

output=$(bunx ultracite fix "$@" 2>&1)
code=$?
printf '%s\n' "$output"

if [[ $code -ne 0 ]] && grep -q "No files found to lint" <<<"$output"; then
  exit 0
fi
exit $code
