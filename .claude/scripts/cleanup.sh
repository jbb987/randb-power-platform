#!/bin/bash
# Periodic cleanup: prune merged-and-gone branches, remove stale worktrees.
# Run via `npm run cleanup`. Safe to run repeatedly.
#
# What it does:
#   1. Fetches origin and prunes deleted remote refs
#   2. Removes worktrees whose branch no longer exists on origin
#   3. Deletes local branches that are fully merged into main AND gone from origin
#
# What it does NOT do:
#   - Touch branches that still exist on origin (those might be active)
#   - Force-delete unmerged branches (you'd lose work)
#   - Touch `main` or `dev`

set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Fetching origin and pruning gone refs..."
git fetch --prune origin

echo ""
echo "==> Removing worktrees whose branch is gone from origin..."
WORKTREE_REMOVED=0
git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print w" "$2}' | while read -r path ref; do
  # Skip the main worktree
  if [ "$path" = "$REPO_ROOT" ]; then continue; fi

  branch=${ref#refs/heads/}
  # Skip main and dev no matter what
  if [ "$branch" = "main" ] || [ "$branch" = "dev" ]; then continue; fi

  # If branch is gone from remote, remove the worktree
  if ! git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    echo "  removing worktree: $path (branch $branch is gone from origin)"
    git worktree remove --force "$path" 2>&1 | sed 's/^/    /' || true
    WORKTREE_REMOVED=$((WORKTREE_REMOVED + 1))
  fi
done

echo ""
echo "==> Deleting local branches that are fully merged into main AND gone from origin..."
DELETED=0
for branch in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  # Never touch main or dev
  if [ "$branch" = "main" ] || [ "$branch" = "dev" ]; then continue; fi

  # Skip branches still on origin (might be active)
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then continue; fi

  # Skip branches checked out in a worktree
  if git worktree list --porcelain | grep -q "^branch refs/heads/$branch$"; then continue; fi

  # Use -d (safe delete: refuses if not merged into HEAD or upstream)
  if git branch -d "$branch" >/dev/null 2>&1; then
    echo "  deleted: $branch"
    DELETED=$((DELETED + 1))
  else
    echo "  skipped: $branch (not merged into main — use 'git branch -D $branch' to force)"
  fi
done

echo ""
echo "==> Done. Run \`git branch\` to see remaining local branches."
