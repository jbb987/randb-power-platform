// IEEE-315 / ANSI Y32.2 symbol factories, matched to JH Operating Co's house
// style. Each returns Primitive[] around a given anchor; the layout draws the
// connecting conductors and stamps these on top.
//
// Paths (transformer windings) start with an absolute `M x y` moveto followed by
// relative arc commands, so layout's shiftX can translate them by adjusting only
// the leading x.

import type { Primitive } from './types';

const WHITE = '#fff';
const BLACK = '#000';

/** Circuit breaker — square box with ANSI device number 52 (JH / IEEE). */
export function breaker(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'rect', x: cx - 9, y: cy - 9, w: 18, h: 18, fill: WHITE },
    { kind: 'text', x: cx, y: cy + 3, text: '52', size: 9, align: 'middle' },
  ];
}

/** Disconnect / air-break switch — knife switch: two open contacts + open blade.
 *  `flip` mirrors the blade vertically (hinge at top), for the isolator below a
 *  breaker so its blade opens toward the bus, like JH draws it. */
export function disconnect(cx: number, cy: number, flip = false): Primitive[] {
  const hingeY = flip ? cy - 8 : cy + 8;
  const tipY = flip ? cy + 6 : cy - 6;
  return [
    { kind: 'circle', cx, cy: cy + 8, r: 2.5, fill: WHITE }, // lower fixed contact
    { kind: 'circle', cx, cy: cy - 8, r: 2.5, fill: WHITE }, // upper fixed contact
    { kind: 'line', x1: cx, y1: hingeY, x2: cx + 10, y2: tipY }, // open blade
  ];
}

/** Disconnect switch drawn horizontally — for in-line bus devices (e.g. the
 *  isolators flanking a bus-tie breaker). */
export function disconnectH(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'circle', cx: cx - 8, cy, r: 2.5, fill: WHITE }, // left fixed contact
    { kind: 'circle', cx: cx + 8, cy, r: 2.5, fill: WHITE }, // right fixed contact
    { kind: 'line', x1: cx - 8, y1: cy, x2: cx + 6, y2: cy - 10 }, // open blade
  ];
}

/** Δ–Y two-winding power transformer — delta + winding coils + wye (IEEE / JH).
 *  `hh` = half-height; the symbol spans cy ± hh and connects there. */
export function transformer(cx: number, cy: number, hh = 18): Primitive[] {
  const leadLen = 3;
  const coreGap = Math.min(3, hh - leadLen - 2);
  const coil = (yTop: number, yBot: number): Primitive => {
    const step = (yBot - yTop) / 3;
    const r = step / 2;
    return {
      kind: 'path',
      d: `M ${cx} ${yTop} a ${r} ${r} 0 0 1 0 ${step} a ${r} ${r} 0 0 1 0 ${step} a ${r} ${r} 0 0 1 0 ${step}`,
    };
  };
  return [
    { kind: 'line', x1: cx, y1: cy - hh, x2: cx, y2: cy - hh + leadLen }, // top lead
    coil(cy - hh + leadLen, cy - coreGap), // primary winding
    { kind: 'line', x1: cx - 3, y1: cy - coreGap, x2: cx - 3, y2: cy + coreGap }, // core
    { kind: 'line', x1: cx + 3, y1: cy - coreGap, x2: cx + 3, y2: cy + coreGap }, // core
    coil(cy + coreGap, cy + hh - leadLen), // secondary winding
    { kind: 'line', x1: cx, y1: cy + hh - leadLen, x2: cx, y2: cy + hh }, // bottom lead
    // Δ (delta) — primary connection
    { kind: 'line', x1: cx - 13, y1: cy - 5, x2: cx - 7, y2: cy - 5 },
    { kind: 'line', x1: cx - 7, y1: cy - 5, x2: cx - 10, y2: cy - 11 },
    { kind: 'line', x1: cx - 10, y1: cy - 11, x2: cx - 13, y2: cy - 5 },
    // Y (wye) — secondary connection
    { kind: 'line', x1: cx - 10, y1: cy + 5, x2: cx - 10, y2: cy + 8 },
    { kind: 'line', x1: cx - 10, y1: cy + 8, x2: cx - 13, y2: cy + 11 },
    { kind: 'line', x1: cx - 10, y1: cy + 8, x2: cx - 7, y2: cy + 11 },
  ];
}

/** Revenue / utility meter — circle with M. */
export function meter(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'circle', cx, cy, r: 9, fill: WHITE },
    { kind: 'text', x: cx, y: cy + 4, text: 'M', size: 11, weight: 'bold', align: 'middle' },
  ];
}

/** Surge arrester — MOV block + internal diagonal + earth ground, branched aside. */
export function arrester(cx: number, cy: number, side: 1 | -1 = -1): Primitive[] {
  const bx = cx + side * 28;
  return [
    { kind: 'line', x1: cx, y1: cy, x2: bx, y2: cy },
    { kind: 'rect', x: bx - 5, y: cy, w: 10, h: 16, fill: WHITE },
    { kind: 'line', x1: bx - 3, y1: cy + 3, x2: bx + 3, y2: cy + 13 },
    { kind: 'line', x1: bx, y1: cy + 16, x2: bx, y2: cy + 20 },
    ...ground(bx, cy + 20),
  ];
}

/** Earth ground — three decreasing horizontal bars. */
export function ground(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'line', x1: cx - 7, y1: cy, x2: cx + 7, y2: cy },
    { kind: 'line', x1: cx - 4, y1: cy + 3, x2: cx + 4, y2: cy + 3 },
    { kind: 'line', x1: cx - 2, y1: cy + 6, x2: cx + 2, y2: cy + 6 },
  ];
}

/** Capacitor bank — two plates + short leads. */
export function capBank(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'line', x1: cx - 12, y1: cy, x2: cx + 12, y2: cy },
    { kind: 'line', x1: cx - 12, y1: cy + 6, x2: cx + 12, y2: cy + 6 },
  ];
}

/** Fuse — small rectangle. */
export function fuse(cx: number, cy: number): Primitive[] {
  return [{ kind: 'rect', x: cx - 4, y: cy - 6, w: 8, h: 12, fill: WHITE }];
}

/** Standby generator — circle with G. */
export function generator(cx: number, cy: number, r = 18): Primitive[] {
  return [
    { kind: 'circle', cx, cy, r, fill: WHITE },
    { kind: 'text', x: cx, y: cy + 5, text: 'G', size: 14, weight: 'bold', align: 'middle' },
  ];
}

/** Connection junction — filled dot (IEEE: filled = connected, none = crossover). */
export function junctionDot(cx: number, cy: number): Primitive[] {
  return [{ kind: 'circle', cx, cy, r: 2.5, fill: BLACK }];
}
