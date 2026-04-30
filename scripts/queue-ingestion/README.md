# ISO Queue Ingestion

Weekly Python pipeline that pulls interconnection queue data from all 7 U.S.
ISOs/RTOs, matches projects to HIFLD substations, and writes per-substation
aggregates to Firestore for the Grid Power Analyzer to display.

## What it does

```
gridstatus + ERCOT archive
        │
        ▼
pull_and_normalize.py    →  ~22,700 queue projects (PJM, MISO, ERCOT, SPP, CAISO, NYISO, ISONE)
        │
pull_hifld_us.py         →  ~74,400 HIFLD substations (50 states + DC)
        │
matcher.py               →  county + voltage + name match queue → HIFLD substation
        │
aggregate.py             →  per-substation rollup + 5-year withdrawal rate + median COD
        │
write_to_firestore.py    →  Firestore: substation_queue_load + iso_queue_projects
```

Output collections in Firestore:

- **`substation_queue_load/{hifld_id}`** — pre-aggregated per-substation queue summary, the only collection the React app reads.
- **`iso_queue_projects/{iso}_{queue_id}`** — raw per-project records, audit/debug only.
- **`iso_queue_meta/run`** — last-run timestamp + counts. Drives the 6-day skip guard.

## Cost-control

- All writes are batched (~450 ops/batch, Firestore native limit is 500).
- 6-day skip guard prevents duplicate weekly runs.
- **`iso_queue_projects` writes are OFF by default** — that collection is audit/debug only (the React app never reads it). Pass `--write-projects` to opt in. Saves ~22K writes per run.
- Frontend reads via single `getDoc` per substation popup (no `onSnapshot`).
- `cleanup_firestore.py` is **manual only** — run it after schema changes that drop substations from the aggregate. Routine weekly runs don't need it.
- Estimated weekly write count: **~12K ops** (substations only, default mode).

## Running locally

Requires Python 3.12+.

```bash
cd scripts/queue-ingestion
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Build ERCOT historical INR→POI registry (slow first time, ~1 min)
python build_ercot_archive.py

# Pull queues + HIFLD + match + aggregate
python pull_and_normalize.py
python pull_hifld_us.py
python matcher.py
python aggregate.py

# Inspect output
ls data/
# substation_queue_load.json  iso_queue_projects.json  ...

# Write to Firestore (requires service-account JSON)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-key.json
python write_to_firestore.py --force   # --force to bypass 6-day guard on first run
```

## Setup: Firebase service-account key

The GitHub Action and any local writes need a Firebase service-account key.

**One-time setup:**

1. Open https://console.firebase.google.com/project/randb-site-valuator
2. Click the gear icon → **Project settings** → **Service accounts** tab
3. Click **"Generate new private key"** → downloads a JSON file
4. Keep that JSON file safe — it grants admin-level Firestore access

**For GitHub Actions** (weekly cron):

5. In GitHub: **Repo → Settings → Secrets and variables → Actions → New repository secret**
6. Name: `FIREBASE_ADMIN_KEY`
7. Value: paste the entire contents of the JSON file
8. Save

The workflow `.github/workflows/queue-ingestion.yml` reads this secret each run.

**For local testing:**

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/randb-site-valuator-firebase-adminsdk-XXXXX.json
python write_to_firestore.py --force --dry-run    # safe preview
python write_to_firestore.py --force              # actually write
```

## Manual trigger of the GitHub Action

In GitHub → Actions tab → "ISO Queue Ingestion" → **Run workflow**. Optional inputs:

- `force` — bypass the 6-day skip guard (use for testing)
- `dry_run` — print what would be written, don't actually write

## Schema reference

`substation_queue_load/{hifld_id}` document:

```jsonc
{
  "hifld_id": 141149,
  "iso": "PJM",
  "name": "LARRABEE",
  "lat": 40.114,
  "lng": -74.192,
  "active_count": 6.0,
  "active_mw": 9390.9,
  "in_service_count": 0.12,
  "in_service_mw": 0.7,
  "withdrawn_count_5y": 7.0,
  "withdrawn_mw_5y": 6218.0,
  "withdrawal_rate_5y": 0.534,         // 0–1, null if no historical data
  "median_time_to_cod_days": null,     // null if <3 completed projects
  "completed_sample_size": 2,
  "earliest_active_cod": "2026-10-21",
  "top_active": [
    { "name": "Larrabee 230 kV", "mw": 2250, "fuel": "WIND", "cod": "2030-02-28" }
  ],
  "updated_at": "2026-04-30"
}
```

## Match-rate caveats

Direct queue→HIFLD substation matching is constrained by HIFLD's name quality:
~23% of substations have real names; the rest are placeholders like
`UNKNOWN118620` or `TAP159169`. Matching strategy is therefore:

1. **State + county + voltage class** (primary) — works for most projects
2. **Name fuzzy match** as tiebreaker — bumps confidence
3. **County+voltage cluster apportionment** — when multiple HIFLD substations
   match the same county+voltage, queue MW is split equally across them

Resulting attribution: ~74% of queue MW lands on a specific substation or
narrow cluster. The remainder is in `iso_queue_projects` but not rolled up
into `substation_queue_load` — these are projects whose POI strings don't
resolve to any HIFLD record.

Per-ISO match rates:

| ISO | Match rate |
|---|---|
| CAISO | 98% |
| ISONE | 79% |
| MISO | 76% |
| NYISO | 74% |
| ERCOT | 72% |
| PJM | 69% |
| SPP | 63% (Plains states have ~3% named HIFLD coverage) |

## Known limitations

- **HIFLD name placeholders** — see above.
- **PJM POI in `Project Name`** — gridstatus doesn't populate `Interconnection Location` for PJM, so we extract from `Project Name`. Works for 88% of PJM rows.
- **ERCOT historical depth** — 36 monthly archives ingested at first run, ~3 years. Older withdrawals lack POI attribution.
