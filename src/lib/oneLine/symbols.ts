// IEEE-315-ish symbol factories. Each returns Primitive[] positioned around a
// given anchor. The layout draws continuous conductor lines and stamps these
// symbols on top, so connectivity is always visually correct.

import type { Primitive } from './types';

const WHITE = '#fff';

/** Circuit breaker — 20×20 box centered on (cx, cy). */
export function breaker(cx: number, cy: number): Primitive[] {
  return [{ kind: 'rect', x: cx - 10, y: cy - 10, w: 20, h: 20, fill: WHITE }];
}

/** Air-break disconnect switch — hinge dot + open blade. */
export function airSwitch(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'circle', cx, cy: cy + 6, r: 4, fill: WHITE },
    { kind: 'line', x1: cx, y1: cy + 4, x2: cx + 15, y2: cy - 12 },
  ];
}

/** Δ–Y two-winding transformer — two overlapping circles. */
export function transformer(cx: number, cy: number, r = 13): Primitive[] {
  const off = r * 0.62;
  return [
    { kind: 'circle', cx, cy: cy - off, r, fill: 'none' },
    { kind: 'circle', cx, cy: cy + off, r, fill: 'none' },
  ];
}

/** Revenue / utility meter — circle with M. */
export function meter(cx: number, cy: number): Primitive[] {
  return [
    { kind: 'circle', cx, cy, r: 9, fill: WHITE },
    { kind: 'text', x: cx, y: cy + 4, text: 'M', size: 11, weight: 'bold', align: 'middle' },
  ];
}

/** Surge arrester — small block + earth ground, branched to the side. */
export function arrester(cx: number, cy: number, side: 1 | -1 = -1): Primitive[] {
  const bx = cx + side * 30;
  return [
    { kind: 'line', x1: cx, y1: cy, x2: bx, y2: cy },
    { kind: 'rect', x: bx - 5, y: cy, w: 10, h: 15, fill: WHITE },
    { kind: 'line', x1: bx, y1: cy + 15, x2: bx, y2: cy + 20 },
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
