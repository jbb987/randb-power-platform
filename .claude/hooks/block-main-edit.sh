#!/bin/bash
# PreToolUse hook: block Write/Edit when the current branch is `main`.
# Forces the user (or Claude) to create a feature branch before touching files.
#
# Wired in .claude/settings.json under hooks.PreToolUse.
# Documented in CLAUDE.md.
#
# Bypass: change branches first, or comment out the hook entry in settings.json.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")

if [ "$BRANCH" = "main" ]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Refusing to edit on `main` directly. `main` is the production branch (Cloudflare Pages deploys from it). Create a feature branch first: `git checkout -b feat/short-description` (or chore/, fix/), then re-try the edit."
    }
  }'
fi

exit 0
