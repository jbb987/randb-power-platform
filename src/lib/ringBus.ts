/**
 * Ring-bus substation X-ray — Bailey's field rule.
 *
 * In a ring bus, breakers = circuit elements on the ring: every intake line,
 * outtake line, and transformer occupies one ring position. Breakers are the
 * one component you can count on satellite imagery, and HIFLD already gives
 * the connected-line count — so the rule runs in reverse to expose what the
 * imagery can't show directly:
 *
 *   transformers ≈ breakers (counted) − lines (HIFLD)
 *
 * When the transformers themselves are visible on the aerial (big tanks with
 * radiator fins next to the control house), a direct transformer count
 * overrides the breaker subtraction — it's the stronger observation.
 *
 * Each transformer is sized by the typical MVA range for the substation's
 * high-side voltage class, giving station max; N-1 (utilities keep one unit
 * in reserve) gives the firm figure a utility engineer would quote.
 * Pure compute, no I/O.
 */

export interface RingBusEstimate {
  transformers: number;
  /** Which observation produced the count. */
  source: 'transformers' | 'breakers';
  /** Typical single-transformer MVA range for the voltage class. */
  mvaPerXfmr: { low: number; high: number };
  /** Station max: total estimated transformation capacity (MVA ≈ MW at screening precision). */
  capacityMVA: { low: number; high: number };
  /** Firm (N-1) capacity — null when there's no backup unit to lose (< 2 transformers). */
  firmMVA: { low: number; high: number } | null;
  caveats: string[];
}

/** Typical step-down / auto transformer MVA range by high-side kV. */
function typicalXfmrMVA(kV: number): { low: number; high: number } {
  if (kV <= 69) return { low: 10, high: 25 };
  if (kV <= 115) return { low: 30, high: 60 };
  if (kV <= 138) return { low: 40, high: 90 };
  if (kV <= 161) return { low: 50, high: 100 };
  if (kV <= 230) return { low: 100, high: 300 };
  if (kV <= 345) return { low: 300, high: 650 };
  return { low: 600, high: 1200 }; // 500 kV
}

/** Ring buses stay practical up to ~6 elements; bigger yards are usually breaker-and-a-half. */
const RING_BUS_MAX_ELEMENTS = 6;

export interface StationCounts {
  /** Breakers counted on the aerial (ring-bus rule input). */
  breakers?: number;
  /** Transformers seen directly on the aerial — overrides the breaker math. */
  transformersSeen?: number;
  /** Connected-line count from HIFLD. */
  lines: number;
  /** High-side voltage (kV). */
  maxVoltKV: number;
}

export function estimateStation({
  breakers,
  transformersSeen,
  lines,
  maxVoltKV,
}: StationCounts): RingBusEstimate | null {
  const caveats: string[] = [];
  let transformers: number;
  let source: RingBusEstimate['source'];

  if (Number.isFinite(transformersSeen) && (transformersSeen as number) >= 0) {
    transformers = Math.round(transformersSeen as number);
    source = 'transformers';
    if (transformers === 0) {
      caveats.push('No transformers — a pure switching station (no step-down to serve load).');
    }
  } else if (Number.isFinite(breakers) && (breakers as number) > 0) {
    const b = Math.round(breakers as number);
    const knownLines = Math.max(0, lines || 0);
    transformers = Math.max(0, b - knownLines);
    source = 'breakers';
    if (b < knownLines) {
      caveats.push(
        `Fewer breakers (${b}) than connected lines (${knownLines}) — this yard is likely not a ring bus, or lines share bays. Transformer estimate floored at 0.`,
      );
    } else if (transformers === 0) {
      caveats.push('No transformers inferred — likely a pure switching station (no step-down).');
    }
    if (b > RING_BUS_MAX_ELEMENTS) {
      caveats.push(
        `${b} breakers exceeds the usual ring-bus size (~${RING_BUS_MAX_ELEMENTS}); large yards are often breaker-and-a-half (1.5 breakers per element), which would overcount transformers here. Counting the transformers directly is more reliable.`,
      );
    }
  } else {
    return null;
  }

  if (transformers === 1) {
    caveats.push(
      'Single transformer — no N-1 backup; the utility may limit firm service from this station.',
    );
  }

  const mvaPerXfmr = typicalXfmrMVA(maxVoltKV);
  return {
    transformers,
    source,
    mvaPerXfmr,
    capacityMVA: {
      low: transformers * mvaPerXfmr.low,
      high: transformers * mvaPerXfmr.high,
    },
    firmMVA:
      transformers >= 2
        ? {
            low: (transformers - 1) * mvaPerXfmr.low,
            high: (transformers - 1) * mvaPerXfmr.high,
          }
        : null,
    caveats,
  };
}

// ── Combine with the map availability model + line delivery ─────────────────
//
// Three independent caps meet here: the map's top-down energy balance ("how
// much surplus power is in the area"), the field-count read ("how much this
// station's iron can firmly hand over"), and the tie-line thermal limit ("can
// the wires even carry it in"). The grabbable number is the smallest, and
// WHICH one binds tells the user the fix: station → build to unlock;
// lines → new/upgraded tie; area → no construction helps, look elsewhere.

export type GrabBinding = 'station' | 'area' | 'lines' | 'aligned';

export interface ScreeningGrab {
  /** min(area availability, firm station capacity, line delivery), per bound. */
  grabMW: { low: number; high: number };
  binding: GrabBinding;
  /** The station range used in the min (firm when it exists, else station max). */
  stationMW: { low: number; high: number };
}

export function screeningGrab(
  estimate: RingBusEstimate,
  availableMW: number,
  lineDeliveryMW: number,
): ScreeningGrab | null {
  if (estimate.transformers <= 0 || !Number.isFinite(availableMW)) return null;
  const station = estimate.firmMVA ?? estimate.capacityMVA;
  const avail = Math.max(0, availableMW);
  const line = Math.max(0, lineDeliveryMW);

  let binding: GrabBinding;
  if (station.high <= Math.min(avail, line)) binding = 'station';
  else if (avail <= Math.min(line, station.low)) binding = 'area';
  else if (line <= Math.min(avail, station.low)) binding = 'lines';
  else binding = 'aligned';

  return {
    grabMW: {
      low: Math.min(avail, station.low, line),
      high: Math.min(avail, station.high, line),
    },
    binding,
    stationMW: station,
  };
}
