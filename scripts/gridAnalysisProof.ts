/**
 * Proof harness for demand-first Grid Analysis.
 *   npx tsx scripts/gridAnalysisProof.ts
 *
 * Three real sites: Sherman (70 MW, fits nearest), Crowell (1,500 MW, fits the
 * 345 kV hub), Denison Pit North (350 MW, needs upgrades).
 */
import { analyzeGrid } from '../src/lib/gridAnalysis';
import type { NearbySubstation, NearbyLine } from '../src/types';

function sub(name: string, maxVolt: number, lines: number, distanceMi: number, status = 'IN SERVICE'): NearbySubstation {
  return { name, owner: 'ONCOR', maxVolt, minVolt: 69, status, lines, distanceMi, lat: 0, lng: 0 };
}
const NL: NearbyLine[] = [];

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, tol = 0.3) => Math.abs(a - b) <= tol;

// ── Sherman: target 70 → fits via nearest 138 kV/2-line ──
{
  const r = analyzeGrid(
    { nearbySubstations: [sub('UNKNOWN300366', 138, 2, 1.51), sub('UNKNOWN304094', 138, 3, 3.74)], nearbyLines: NL },
    { targetMW: 70, currentYear: 2026 },
  )!;
  check('Sherman target fits', r.targetFits === true && r.target!.fits === true);
  check('Sherman delivered via nearest 1.5 mi node', r.target!.basis.distanceMi === 1.51);
  check('Sherman target construction ≈ $10M', near(r.target!.cost.construction, 10.1, 0.4), `got ${r.target!.cost.construction}`);
  // The delivery node is excluded from nearby → alternatives use a clean sequence, NOT a global rank with a gap.
  check('Nearby alternatives labeled "Option 1…" (no missing-#1 gap)', r.nearbyOptions[0].label === 'Option 1', `got "${r.nearbyOptions[0].label}"`);
}

// ── lines=0 node: treated conservatively (firmMult 0.5), NOT inflated to a 2-line node ──
{
  const z = analyzeGrid({ nearbySubstations: [sub('Z', 138, 0, 1)], nearbyLines: NL }, { targetMW: 60, currentYear: 2026 })!;
  check('lines=0 node does NOT falsely fit 60 MW (conservative firmMult)', z.targetFits === false);
  check('lines=0 shown consistently as 0 lines', z.target!.basis.lines === 0);
}

// ── Crowell: target 1,500 → fits via the 8-line 345 kV hub (NOT the nearest 2-line node) ──
{
  const r = analyzeGrid(
    {
      nearbySubstations: [
        sub('TESLA', 345, 2, 1.2),
        sub('UNKNOWN999', 345, 2, 1.2), // duplicate (345,2) — must be deduped
        sub('EDITH CLARK', 345, 8, 1.2),
      ],
      nearbyLines: NL,
    },
    { targetMW: 1500, currentYear: 2026 },
  )!;
  check('Crowell 1500 MW IS deliverable (was wrongly flagged before)', r.targetFits === true && r.target!.fits === true);
  check('Crowell delivered via the 8-line hub (EDITH CLARK), not the 2-line nearest', r.target!.basis.lines === 8);
  check('Crowell target justification names the hub capacity', /1,?180.*2,?025|EDITH/i.test(r.target!.justification));
  check('Crowell nearby deduped + excludes the delivery node (only TESLA left)', r.nearbyOptions.length === 1 && r.nearbyOptions[0].basis.lines === 2, `got ${r.nearbyOptions.length}`);
  check('Crowell delivery node (EDITH CLARK) NOT repeated in nearby', !r.nearbyOptions.some((o) => o.basis.lines === 8));
  check('Crowell target construction ≈ $158.9M', near(r.target!.cost.construction, 158.9, 0.5), `got ${r.target!.cost.construction}`);
}

// ── Denison Pit North: target 350 → no nearby node can deliver it ──
{
  const r = analyzeGrid(
    {
      nearbySubstations: [
        sub('UNKNOWN300694', 138, 2, 3.7),
        sub('UNKNOWN304380', 138, 7, 9.7), // strongest 138 ≈ 270 MW high
        sub('UNKNOWN305745', 230, 2, 10.3), // ≈ 252 MW high
      ],
      nearbyLines: NL,
    },
    { targetMW: 350, currentYear: 2026 },
  )!;
  check('Denison 350 MW NOT deliverable nearby', r.targetFits === false && r.target!.fits === false);
  check('Denison target flags "needs upgrades"', /upgrade|higher-voltage/i.test(r.target!.justification));
}

// ── Empty ──
{
  const none = analyzeGrid({ nearbySubstations: [sub('x', 138, 2, 1, 'RETIRED')], nearbyLines: NL }, { currentYear: 2026 });
  check('No in-service substation → null', none === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
