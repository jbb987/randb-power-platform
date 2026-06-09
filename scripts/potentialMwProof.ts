/**
 * Proof harness for the grid Potential MW estimator.
 *   npx tsx scripts/potentialMwProof.ts
 *
 * Feeds synthetic InfraResult-shaped fixtures (mirroring the live Asherton +
 * Texoma validation) and asserts the estimate matches the frozen methodology.
 */
import { estimatePotentialMW } from '../src/lib/potentialMW';
import type { NearbySubstation, NearbyLine } from '../src/types';

function sub(p: Partial<NearbySubstation>): NearbySubstation {
  return {
    name: 'UNKNOWN000001',
    owner: '',
    maxVolt: 138,
    minVolt: 69,
    status: 'IN SERVICE',
    lines: 2,
    distanceMi: 1,
    lat: 0,
    lng: 0,
    ...p,
  };
}
function line(voltage: number): NearbyLine {
  return { owner: 'AEP', voltage, voltClass: '', sub1: '', sub2: '', status: 'IN SERVICE' };
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

// 1. Asherton: 138 kV, 4 lines, placeholder, 138 kV line → ~340, 225–450, MED, no upside
{
  const e = estimatePotentialMW({ nearbySubstations: [sub({ lines: 4, distanceMi: 0.2 })], nearbyLines: [line(138)] })!;
  check('Asherton expected ≈ 340', e.expected === 338 || e.expected === 337 || e.expected === 340, `got ${e.expected}`);
  check('Asherton range 225–450', e.low === 225 && e.high === 450, `got ${e.low}–${e.high}`);
  check('Asherton MEDIUM', e.confidence === 'medium');
  check('Asherton no upside', !e.basis.upside);
}

// 2. Sherman: 138 kV/2 lines + 345 kV corridor → expected 225, high widened to 600, MED, upside flagged
{
  const e = estimatePotentialMW({
    nearbySubstations: [sub({ lines: 2, distanceMi: 1.6 })],
    nearbyLines: [line(69), line(138), line(230), line(345)],
  })!;
  check('Sherman expected 225', e.expected === 225, `got ${e.expected}`);
  check('Sherman high widened to 600', e.high === 600, `got ${e.high}`);
  check('Sherman low 150', e.low === 150, `got ${e.low}`);
  check('Sherman upside flagged @345', e.basis.upside?.lineVoltageKV === 345);
  check('Sherman still MEDIUM (upside ≠ confidence)', e.confidence === 'medium');
}

// 3. Kenefic: 138 kV/1 line + 345 corridor → base 75–150, high 600, factor 0.5
{
  const e = estimatePotentialMW({
    nearbySubstations: [sub({ lines: 1, distanceMi: 3.2 })],
    nearbyLines: [line(138), line(345)],
  })!;
  check('Kenefic factor 0.5 → low 75', e.low === 75, `got ${e.low}`);
  check('Kenefic high widened to 600', e.high === 600, `got ${e.high}`);
  check('Kenefic expected 112', e.expected === 112 || e.expected === 113, `got ${e.expected}`);
}

// 4. Driver rule: prefers higher-voltage sub within 5 mi over a closer weak one
{
  const e = estimatePotentialMW({
    nearbySubstations: [sub({ name: 'A', maxVolt: 69, lines: 2, distanceMi: 0.5 }), sub({ name: 'B', maxVolt: 230, lines: 2, distanceMi: 3 })],
    nearbyLines: [line(230)],
  })!;
  check('Driver picks 230 kV sub (not nearest 69)', e.basis.maxVoltKV === 230, `got ${e.basis.maxVoltKV}`);
  check('Driver 230 → expected 450', e.expected === 450, `got ${e.expected}`);
}

// 5. Sentinel / sanitize: -999999 maxVolt ignored, falls to valid one
{
  const e = estimatePotentialMW({
    nearbySubstations: [sub({ name: 'bad', maxVolt: -999999, distanceMi: 0.1 }), sub({ name: 'C', maxVolt: 138, lines: 3, distanceMi: 2 })],
    nearbyLines: [line(138)],
  })!;
  check('Sentinel skipped → uses 138 kV', e.basis.maxVoltKV === 138, `got ${e.basis.maxVoltKV}`);
}

// 6. No substation → null
{
  const e = estimatePotentialMW({ nearbySubstations: [], nearbyLines: [line(138)] });
  check('No substation → null', e === null);
}

// 7. Named substation + confirmed + (still no queue) → MEDIUM, substationNamed true
{
  const e = estimatePotentialMW({ nearbySubstations: [sub({ name: 'MINES ROAD SUBST', lines: 4 })], nearbyLines: [line(138)] })!;
  check('Real name → substationNamed true', e.basis.substationNamed === true);
  check('Named but no queue → still MEDIUM', e.confidence === 'medium');
}

// 8. No line confirmation → LOW
{
  const e = estimatePotentialMW({ nearbySubstations: [sub({ maxVolt: 138 })], nearbyLines: [] })!;
  check('No confirming line → LOW', e.confidence === 'low');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
