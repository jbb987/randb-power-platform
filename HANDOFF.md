# HANDOFF — 2026-06-12 (evening)

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first. Replace this content
> (don't append) at the end of any non-trivial session.

## Situation

Built **v1.61.0 — Collaborative To-Do List** on branch `feat/todo-collaborative`
and merged to `main` (JB approved direct merge; Cloudflare Pages deploys from
`main`). The per-user private to-do tool became a company collaboration tool:
single-assignee delegation (anyone → anyone), company/private visibility, three
views (My Work / Team / Week), a fullscreen Present mode for weekly meetings,
and a full `/code-review high` pass with all 10 findings fixed.

**Backend was deployed mid-session** (backward-compatible throughout): hardened
`user-tasks` Firestore rules, the `onUserTaskWrite` activity trigger, and the
data backfill.

## Background — what shipped

### Feature (decided with JB through iterative design)

- Schema (additive): `assigneeUid` (single assignee), `visibility:
  'company'|'private'` (absent ⇒ private), `archived` boolean + `archivedAt`
  (soft archive; hard delete removed, rules `delete: false`).
- Full-trust model: any authed user reads AND edits company-visible tasks.
  `ownerUid` is **immutable after create** (rule-enforced) so no edit can lock
  a creator out. Private tasks: creator + assignee only — and they are
  **skipped by the activity trigger** (admin-readable log must not leak them).
- UI (researched against Things 3 / Trello / Todoist principles, per JB):
  one calm container, hairline rows, click-row-opens-read-view (visual:
  category-tinted band, status pill, people row with initials avatars, signal
  chips), Edit as explicit step writing **only changed fields**. Creation only
  via "+ New task" window (Enter submits). Week sections in My Work
  (Overdue/Today/This week/…/No date; done by completion week), Today/Tomorrow
  relative dates, search, person-grouped Team view with "Assigned by me"
  delegation filter, **Week** meeting view (people × days grid, weekend columns
  on demand, No-date column, week nav, Present overlay at z-60 above the
  navbar; task window at z-70). Date math via calendar-safe `addDays` (DST).
- Subscriptions: main listener `and(archived==false, or(company, mine,
  assigned-to-me))` — bounded forever; archived in a separate on-demand
  subscription. Disjuncts mirror the read rule 1:1; no composite index.

### Production state (all deployed 2026-06-12)

- `firestore.rules` now **versioned in-repo** (closes a macro-review item),
  wired into firebase.json; deploy via `firebase deploy --only firestore:rules`.
- `onUserTaskWrite` (us-central1) live with the privacy guard + 'to-do' noun.
- Data: all 49 legacy `user-tasks` docs stamped `archived:false` (required by
  the bounded listener); visibility was first stamped 'company' then
  **reverted to 'private' on JB's decision** (owners opt in per task, new
  tasks default to company). Backfills ran via Firestore REST + JB's gcloud
  token — **org policy forbids service-account key creation** on this project;
  `scripts/migrate-user-tasks.mjs` holds the same logic for future use.
- CLI note: firebase-tools + gcloud reauthed under jb@randbpowerinc.us.

## Assessment — known limitations / deferred

- Deliberately excluded by JB: notifications, comments, multi-assignee,
  platform-object linkage, status-setter UI for 'doing', dashboard-card counts.
- Review cleanup findings logged but not blockers: modal scaffold could reuse
  ui/Modal.tsx, lock SVG ×2, initialsFor vs navbar getInitials divergence,
  formatShortDate/DAY_MS are the Nth file-local copies, single ~1300-line tool
  file vs the components/ split convention, week-grouping logic could be a
  pure src/lib helper (rampSchedule/executiveSummary precedent).
- PR #125 (`feat/task-foundation`) still open — close or salvage.

## Recommendation — next session

1. Demo to Bailey: the Team board + Week Present mode are his asks.
2. Optional cleanup pass on the review's non-blocker findings.
3. Exhibit A follow-ups from the morning session remain in TODO.md (NTNSM
   pre-export checklist, Joshua water re-run once NWI recovers, etc.).
