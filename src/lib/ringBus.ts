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
 * Each inferred transformer is then sized by the typical MVA range for the
 * substation's high-side voltage class, a screening read of how much
 * transformation capacity sits at the station. Pure compute, no I/O.
 */

export interface RingBusEstimate {
  transformers: number;
  /** Typical single-transformer MVA range for the voltage class. */
  mvaPerXfmr: { low: number; high: number };
  /** Total estimated transformation capacity (MVA ≈ MW at screening precision). */
  capacityMVA: { low: number; high: number };
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

export function estimateRingBus(
  breakersCounted: number,
  lines: number,
  maxVoltKV: number,
): RingBusEstimate | null {
  if (!Number.isFinite(breakersCounted) || breakersCounted <= 0) return null;
  const breakers = Math.round(breakersCounted);
  const knownLines = Math.max(0, lines || 0);
  const transformers = Math.max(0, breakers - knownLines);
  const caveats: string[] = [];

  if (breakers < knownLines) {
    caveats.push(
      `Fewer breakers (${breakers}) than connected lines (${knownLines}) — this yard is likely not a ring bus, or lines share bays. Transformer estimate floored at 0.`,
    );
  } else if (transformers === 0) {
    caveats.push('No transformers inferred — likely a pure switching station (no step-down).');
  }
  if (breakers > RING_BUS_MAX_ELEMENTS) {
    caveats.push(
      `${breakers} breakers exceeds the usual ring-bus size (~${RING_BUS_MAX_ELEMENTS}); large yards are often breaker-and-a-half (1.5 breakers per element), which would overcount transformers here.`,
    );
  }

  const mvaPerXfmr = typicalXfmrMVA(maxVoltKV);
  return {
    transformers,
    mvaPerXfmr,
    capacityMVA: {
      low: transformers * mvaPerXfmr.low,
      high: transformers * mvaPerXfmr.high,
    },
    caveats,
  };
}
