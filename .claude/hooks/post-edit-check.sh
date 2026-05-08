#!/bin/bash
# PostToolUse hook: after Claude edits a .ts/.tsx file in src/, run eslint --fix
# on it and tsc --noEmit on the project. Surface any TS errors back to Claude.
#
# Wired up in .claude/settings.json under hooks.PostToolUse.
# Documented in CLAUDE.md so future sessions know it exists.

set -u

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_response.filePath // .tool_input.file_path // ""')

# Bail unless this is a .ts/.tsx file inside src/
case "$FILE" in
  */src/*.ts|*/src/*.tsx) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

# Auto-format with Prettier, then auto-fix lint issues. Both silent.
# Order matters: Prettier first (style), ESLint second (semantic + any lint autofixes).
npx --no-install prettier --write "$FILE" >/dev/null 2>&1 || true
npx --no-install eslint --fix "$FILE" >/dev/null 2>&1 || true

# Type-check the app project. tsc exits non-zero on type errors.
# Root tsconfig.json is just a reference shell, so we point at tsconfig.app.json.
TSC_OUT=$(npx --no-install tsc -p tsconfig.app.json --noEmit 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -ne 0 ]; then
  ERRORS=$(echo "$TSC_OUT" | head -40)
  jq -n --arg ctx "TypeScript errors after editing $FILE (run \`npx tsc --noEmit\` for full output):\n\n$ERRORS" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi

exit 0
