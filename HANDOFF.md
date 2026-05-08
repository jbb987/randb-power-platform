# HANDOFF — last updated 2026-05-08

> **For future Claude sessions:** read this first. It captures the state of the most recent meaningful work session and what should happen next. Replace this content (don't append) at the end of any non-trivial session.

## Situation

Workflow & tooling overhaul session. All work is merged to `main` and deployed (Cloudflare Pages auto-deploys on push to `main`). The repo is in a clean state — no uncommitted changes, no stale branches, only `main` exists locally and on the remote.

Three PRs shipped in this session:

- `chore: add Claude Code hooks, Prettier, and cleanup tooling` → v1.27.1
- `chore: format whole repo with Prettier (baseline)` → v1.27.2
- `docs: add HANDOFF.md` → v1.27.3 (this PR)

## Background

User (Babi) opened the session asking how Claude Code hooks work after watching a video. Two underlying problems surfaced while exploring use cases:

1. **Style inconsistency.** `src/tools/SiteAnalyzerDetail.tsx` had 37 double-quoted + 38 single-quoted strings in the same file. The existing ESLint config didn't enforce style.
2. **Workflow drift.** 69 local branches, 32 remote branches, 26 abandoned worktrees, and uncommitted changes directly on `main`. Root cause: starting work on `main` instead of a feature branch, never pruning merged work.

Scope expanded as we went: typecheck hook → Prettier → fix the workflow itself.

## Assessment

**What works now:**

- **PreToolUse hook** (`.claude/hooks/block-main-edit.sh`) refuses Write/Edit when current branch is `main`. Forces Claude/user to branch first.
- **PostToolUse hook** (`.claude/hooks/post-edit-check.sh`) runs `prettier --write` → `eslint --fix` → `tsc -p tsconfig.app.json --noEmit` after every `.ts`/`.tsx` edit in `src/`. Type errors are fed back to the same Claude turn as `additionalContext`.
- **Prettier 3.8.3** installed with `.prettierrc.json` (single quotes for JS/TS, double for JSX, 100-col, 2-space, trailing commas). Whole repo formatted in baseline commit (170 files).
- **`npm run cleanup`** prunes worktrees and local branches that are merged-and-gone-from-origin. Idempotent. Never touches `main` or unmerged branches.
- All three are documented in `CLAUDE.md` under "Claude Code Hooks."

**Branch policy (decided this session):**

- `main` is the only long-lived branch. `dev` was deleted (had drifted 177 commits behind, abandoned).
- Cloudflare Pages deploys from `main`. Feature branches → `main` directly.
- The PreToolUse hook enforces "branch before editing" mechanically.

**Open risk to verify:**

- The Prettier baseline pass touched 170 files. Logic shouldn't have changed (formatting only) but the deployed app on Cloudflare hasn't been clicked through post-deploy. Recommend visual smoke-test on Site Analyzer, CRM, Dashboard before relying on production.

**Auto-memory was outdated and has been corrected:**

- Old memory claimed `feature/water-analysis-phase1` and `feature/gas-analysis-phase1` were pending merges; both were merged weeks ago.
- Old memory claimed Construction Tracker was mid-PR-2; it's fully shipped (foundation + tasks + photos + docs on `main`). Only a JobTimelineSection appears to not exist yet.

## Recommendation

**Next session (today / tomorrow per Babi's stated plan):**

1. Use Claude normally on small tasks. See how the typecheck + Prettier hooks feel in practice.
2. Visually verify the deployed app at the production Cloudflare URL — confirm nothing regressed from the Prettier baseline reformat.
3. Daily flow:
   ```bash
   git pull                              # sync main
   npm run cleanup                       # prune yesterday's cruft
   git checkout -b feat/whatever-today   # branch BEFORE editing — hook will refuse otherwise
   ```

**Deferred from this session (when Babi is ready):**

- **SBAR / handoff system design.** This `HANDOFF.md` is the first manual instance, written at the user's request. The full system would automate writing/finding these per session and per research topic, with a `/sbar` slash command, an `INDEX.md` for past research, and possibly a Stop hook to nag if not updated. Revisit after living with the new hooks for a couple of days.

**Don't suggest unless asked:**

- Reviving the `dev` branch — explicitly rejected this session.
