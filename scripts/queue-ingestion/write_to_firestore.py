"""
Write the queue ingestion outputs to Firestore.

Collections written:
  - substation_queue_load   (one doc per HIFLD substation with attributed queue
                             load — read by the React app)
  - iso_queue_projects      (one doc per individual queue project — AUDIT/DEBUG
                             ONLY; the React app does not read this. Skipped by
                             default; opt in with --write-projects.)
  - iso_queue_meta/run      (single doc with last-run timestamp and counts;
                             drives the 6-day skip guard)

Cost-control:
  - Batch writes (max 500 ops per batch) — Firestore native limit.
  - 6-day skip guard: if iso_queue_meta/run.lastRunAt < 6 days ago, exit.
    Override with --force flag.
  - iso_queue_projects writes default OFF — that collection adds ~22K writes
    per run for data nothing currently reads. Pass --write-projects to refresh
    it (e.g., for an admin debugging session).
  - All writes are atomic doc.set() — no read-modify-write loops.

Auth:
  - Reads service account JSON from GOOGLE_APPLICATION_CREDENTIALS env var
    (or the path passed via --credentials).

Usage:
  python write_to_firestore.py [--force] [--write-projects] [--credentials path.json] [--dry-run]
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

DATA = Path(__file__).parent / "data"

SUBSTATION_COLL = "substation_queue_load"
PROJECTS_COLL = "iso_queue_projects"
META_COLL = "iso_queue_meta"
META_DOC = "run"

SKIP_WINDOW = timedelta(days=6)
BATCH_LIMIT = 450  # leave headroom under Firestore's 500/batch hard cap


def init_firebase(creds_path):
    if creds_path:
        cred = credentials.Certificate(creds_path)
    else:
        # Use GOOGLE_APPLICATION_CREDENTIALS env var
        cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
    return firestore.client()


def check_skip_guard(db, force):
    """Return True if we should skip (last run < 6 days ago and not forced)."""
    if force:
        print("Skip guard bypassed (--force).")
        return False
    snap = db.collection(META_COLL).document(META_DOC).get()
    if not snap.exists:
        print("No prior run recorded — proceeding.")
        return False
    last = snap.to_dict().get("lastRunAt")
    if not last:
        return False
    if isinstance(last, datetime):
        last_dt = last
    else:
        last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - last_dt
    if age < SKIP_WINDOW:
        days_left = (SKIP_WINDOW - age).total_seconds() / 86400
        print(f"Last run was {age.total_seconds() / 86400:.1f} days ago (<6). Skipping. Use --force to override.")
        return True
    print(f"Last run was {age.total_seconds() / 86400:.1f} days ago — proceeding.")
    return False


def write_collection(db, coll_name, docs, key_fn, dry_run=False):
    """Write docs to a collection in batches. key_fn(doc) -> str document ID."""
    total = len(docs)
    if total == 0:
        print(f"  {coll_name}: nothing to write")
        return 0
    if dry_run:
        print(f"  {coll_name}: DRY RUN — would write {total} docs")
        return total

    coll = db.collection(coll_name)
    batch = db.batch()
    pending = 0
    written = 0
    t0 = time.time()
    for d in docs:
        doc_id = key_fn(d)
        if not doc_id:
            continue
        ref = coll.document(str(doc_id))
        batch.set(ref, d)
        pending += 1
        if pending >= BATCH_LIMIT:
            batch.commit()
            written += pending
            pending = 0
            batch = db.batch()
            if written % 5000 == 0:
                print(f"    {coll_name}: {written:,}/{total:,} ({time.time()-t0:.1f}s)")
    if pending:
        batch.commit()
        written += pending
    print(f"  {coll_name}: wrote {written:,} docs ({time.time()-t0:.1f}s)")
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Bypass 6-day skip guard")
    ap.add_argument("--credentials", help="Path to service-account JSON")
    ap.add_argument("--dry-run", action="store_true", help="Don't actually write")
    ap.add_argument("--write-projects", action="store_true",
                    help="Also refresh iso_queue_projects collection (~22K extra writes). "
                         "Off by default since the React app doesn't read it.")
    args = ap.parse_args()

    # Load inputs
    sub_load_path = DATA / "substation_queue_load.json"
    projects_path = DATA / "all_normalized.json"
    if not sub_load_path.exists() or not projects_path.exists():
        print(f"ERROR: missing inputs in {DATA}. Run pull_and_normalize.py + matcher.py + aggregate.py first.")
        return 1
    sub_load = json.loads(sub_load_path.read_text())
    projects = json.loads(projects_path.read_text()) if args.write_projects else None
    if args.write_projects:
        print(f"Loaded: {len(sub_load):,} substation aggregates, {len(projects):,} projects (--write-projects on)")
    else:
        print(f"Loaded: {len(sub_load):,} substation aggregates "
              f"(skipping iso_queue_projects — pass --write-projects to refresh it)")

    db = init_firebase(args.credentials)

    if check_skip_guard(db, args.force):
        return 0

    print("\nWriting to Firestore...")

    # Substation aggregates: doc id = HIFLD ID (string). The only collection the app reads.
    sub_written = write_collection(db, SUBSTATION_COLL, sub_load,
                                    key_fn=lambda d: d.get("hifld_id"),
                                    dry_run=args.dry_run)

    # Raw projects (audit/debug only) — opt-in via --write-projects.
    proj_written = 0
    if args.write_projects:
        proj_written = write_collection(
            db, PROJECTS_COLL, projects,
            key_fn=lambda d: f"{d.get('iso')}_{d.get('queue_id')}" if d.get("queue_id") else None,
            dry_run=args.dry_run,
        )

    # Meta
    if not args.dry_run:
        meta_payload = {
            "lastRunAt": firestore.SERVER_TIMESTAMP,
            "substationCount": sub_written,
            "totalActiveMW": int(sum(s.get("active_mw", 0) for s in sub_load)),
        }
        if args.write_projects:
            meta_payload["projectCount"] = proj_written
        db.collection(META_COLL).document(META_DOC).set(meta_payload, merge=True)
        print(f"\nUpdated {META_COLL}/{META_DOC}")

    proj_msg = f" + {proj_written:,} project docs" if args.write_projects else " (projects skipped)"
    print(f"\n✓ Done. {sub_written:,} substation docs{proj_msg}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
