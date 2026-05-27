#!/usr/bin/env bash
# SessionStart hook: surface TODO.md content into the model's context.
# Output is JSON with hookSpecificOutput.additionalContext, which Claude Code
# concatenates onto the system prompt for the new session.

set -euo pipefail

# Resolve the repo root from this script's location (.claude/hooks/ -> ../../).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TODO_PATH="${REPO_ROOT}/TODO.md"

if [[ ! -f "${TODO_PATH}" ]]; then
  # No TODO file — exit silently, nothing to inject.
  exit 0
fi

TODO_CONTENT="$(cat "${TODO_PATH}")"

# Escape for JSON: convert to a single-line JSON string via python (always present on macOS).
ADDITIONAL_CONTEXT=$(python3 -c "
import json, sys
header = '# TODO.md (auto-loaded by SessionStart hook)\n\nThe live task list for this project. When the user mentions something they need to do, add it here as a default behavior. Source the TODO from \`'+'${TODO_PATH}'+'\`.\n\n---\n\n'
with open('${TODO_PATH}', 'r') as f:
    body = f.read()
print(json.dumps(header + body))
")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": ${ADDITIONAL_CONTEXT}
  }
}
EOF
