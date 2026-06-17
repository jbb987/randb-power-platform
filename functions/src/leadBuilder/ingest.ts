/**
 * Tax-roll ingestion (P5). Fires when a `lead-pipeline-jobs` doc is created with
 * status 'ingesting' (the Lead Builder UI writes it). Pulls the county's roll via
 * the state source adapter, runs the classifier (keep COMPANY/REVIEW, drop
 * PERSON/EXEMPT + 74x energy-infra classes), dedupes to one row per company with
 * aggregated parcels + market value, tiers + routes them, and writes them to
 * `lead-pipeline-companies` at stage 'ingested'. Then advances the job to the
 * first cost gate. Firestore-triggered → no public HTTP surface.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { fetchNyCountyParcels, type RawParcel } from './sources/nySocrata';
import { classifyEntity, tierFor, isLandlordName } from './classify';

const COMPANIES = 'lead-pipeline-companies';
const INFRA_CLASSES = new Set(['741', '742', '743']); // gas/water/brine — energy infra, not power customers
const BATCH = 450;

interface Agg {
  name: string;
  taxOwner: string;
  marketValue: number;
  nParcels: number;
  topValue: number;
  parcelAddress: string;
  city: string;
  classDesc: string;
  mailing: string;
  classes: Set<string>;
  ownerOccupied: boolean;
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function joinAddr(...parts: (string | undefined)[]): string {
  return parts.map((p) => s(p)).filter(Boolean).join(' ');
}
function cleanUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export const ingestCountyTaxRoll = onDocumentWritten(
  { document: 'lead-pipeline-jobs/{jobId}', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deleted
    const job = after.data();
    if (!job || job.status !== 'ingesting') return;
    // Fire only on the TRANSITION into 'ingesting' (initial create, or a
    // Re-run that flips status back) — not on the many other writes to this
    // doc (gate approvals, count refreshes), which would otherwise re-trigger.
    const before = event.data?.before;
    const beforeStatus = before?.exists ? before.data()?.status : undefined;
    if (beforeStatus === 'ingesting') return;

    const snap = after;
    const jobId = event.params.jobId;
    const county = s(job.county);
    const state = s(job.state) || 'NY';
    const db = admin.firestore();

    if (state !== 'NY') {
      await snap.ref.update({ status: 'error', error: `No source adapter for ${state} yet.`, updatedAt: Date.now() });
      return;
    }

    try {
      // Re-run support: wipe any companies from a prior build of this job so we
      // start from a clean slate (deterministic ids would otherwise leave stale
      // rows from a different roll/scope behind).
      const prior = await db.collection(COMPANIES).where('jobId', '==', jobId).get();
      if (!prior.empty) {
        let delBatch = db.batch();
        let delPending = 0;
        for (const d of prior.docs) {
          delBatch.delete(d.ref);
          if (++delPending >= BATCH) {
            await delBatch.commit();
            delBatch = db.batch();
            delPending = 0;
          }
        }
        if (delPending > 0) await delBatch.commit();
        logger.info(`[ingest] job ${jobId}: cleared ${prior.size} prior companies (re-run)`);
      }

      // 'commercial-industrial' = 400-499 + 700-799; default = industrial 700-799.
      const ranges: [string, string][] =
        job.scope === 'commercial-industrial' ? [['400', '500'], ['700', '800']] : [['700', '800']];
      const raw = (await fetchNyCountyParcels(county, s(job.rollYear) || '2025', ranges)) as RawParcel[];

      // Classify + keep operating companies; dedupe to one row per owner.
      const groups = new Map<string, Agg>();
      for (const r of raw) {
        const pc = s(r.property_class);
        if (INFRA_CLASSES.has(pc)) continue;
        const last = s(r.primary_owner_last_name);
        const first = s(r.primary_owner_first_name);
        const { cls, name } = classifyEntity(last, first);
        if (cls === 'PERSON' || cls === 'EXEMPT') continue;

        const mv = Number(r.full_market_value ?? 0) || 0;
        const paddr = joinAddr(r.parcel_address_number, r.parcel_address_street, r.parcel_address_suff);
        const maddr = joinAddr(r.mailing_address_number, r.mailing_address_street);
        const occ = paddr !== '' && paddr.toUpperCase() === maddr.toUpperCase();

        const g = groups.get(name);
        if (!g) {
          groups.set(name, {
            name,
            taxOwner: (last + (first ? ` ${first}` : '')).trim(),
            marketValue: mv,
            nParcels: 1,
            topValue: mv,
            parcelAddress: paddr,
            city: s(r.municipality_name),
            classDesc: s(r.property_class_description),
            mailing: `${maddr}, ${s(r.mailing_address_city)} ${s(r.mailing_address_state)}`.trim(),
            classes: new Set([pc]),
            ownerOccupied: occ,
          });
        } else {
          g.marketValue += mv;
          g.nParcels += 1;
          g.classes.add(pc);
          if (occ) g.ownerOccupied = true;
          if (mv > g.topValue) {
            g.topValue = mv;
            g.parcelAddress = paddr;
            g.city = s(r.municipality_name);
            g.classDesc = s(r.property_class_description);
          }
        }
      }

      // Write companies (deterministic ids → re-ingest is idempotent).
      let batch = db.batch();
      let pending = 0;
      let written = 0;
      for (const g of groups.values()) {
        const industrial = [...g.classes].some((c) => c.startsWith('7'));
        const protectedHi = g.marketValue >= 5_000_000 || industrial;
        const route =
          g.ownerOccupied || protectedHi
            ? 'owner_operator'
            : isLandlordName(g.name)
              ? 'find_tenant_by_address'
              : 'owner_operator';
        const id = `${state}_${county}_${g.name}`.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 1400);
        batch.set(
          db.collection(COMPANIES).doc(id),
          cleanUndefined({
            id,
            jobId,
            county,
            state,
            stage: 'ingested',
            taxOwner: g.taxOwner,
            parcelAddress: g.parcelAddress,
            mailingAddress: g.mailing,
            city: g.city,
            propertyClasses: [...g.classes].sort().join('|'),
            classDesc: g.classDesc,
            marketValue: g.marketValue,
            nParcels: g.nParcels,
            tier: tierFor(g.marketValue),
            contactRoute: route,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
          { merge: true },
        );
        pending++;
        written++;
        if (pending >= BATCH) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
      if (pending > 0) await batch.commit();

      await snap.ref.update({
        status: 'awaiting_perplexity_approval',
        counts: { ingested: written },
        updatedAt: Date.now(),
      });
      logger.info(`[ingest] job ${jobId}: ${county}, ${state} -> ${written} companies`);
    } catch (err) {
      logger.error('[ingest] failed', err);
      await snap.ref.update({ status: 'error', error: String(err).slice(0, 200), updatedAt: Date.now() });
    }
  },
);
