// Parametric layout. Builds the electrical primitives in a local coordinate
// space (positions derived from lane pitch + fixed tier bands), normalizes the
// horizontal origin, then places content-sized margin panels. Overlaps are
// impossible by construction: device spacing >= label width, tiers are reserved
// vertical bands, panel heights are computed from line counts.

import type { Derived } from './derive';
import type { Diagram, Primitive, TextP } from './types';
import type { OneLineSpec } from './types';
import * as S from './symbols';

// ---- vertical tier bands (fixed) ----
const FEED_LABEL_Y = 70;
const OH_TOP_Y = 84;
const OH_SOLID_Y = 116;
const ARRESTER_Y = 100;
const METER_Y = 120;
const POI_Y = 150;
const AS_Y = 176;
const CB_Y = 210;
const BUS138_Y = 252;
const XFMR_CB_Y = 288;
const XFMR_CY = 332;
const BUS13_Y = 432;
const CELL_TOP_Y = 480;
const CELL_LBS_Y = 496;
const CELL_FUSE_Y = 512;
const CELL_XFMR_CY = 548;
const BUS480_Y = 636;
const DISC_Y = 664;
const MDP_TOP_Y = 692;
const GEN_CY = 792;
const ELEC_BOTTOM = 850;

const PX = 210; // transformer / cell lane pitch
const TIE = 150; // tie gap between the two halves
const PANEL_W = 360;
const HEIGHT = 1080;

const r0 = (n: number) => Math.round(n);

function withDash(prims: Primitive[], dash: string): Primitive[] {
  return prims.map((p) =>
    p.kind === 'text' ? p : ({ ...p, dash } as Primitive),
  );
}

function geomBBox(prims: Primitive[]): { minX: number; maxX: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  const seen = (x: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  };
  for (const p of prims) {
    switch (p.kind) {
      case 'line':
      case 'bus':
        seen(p.x1);
        seen(p.x2);
        break;
      case 'rect':
        seen(p.x);
        seen(p.x + p.w);
        break;
      case 'circle':
        seen(p.cx - p.r);
        seen(p.cx + p.r);
        break;
      case 'text': {
        // estimate glyph extent so labels are inside the normalized canvas
        const w = p.text.length * (p.size ?? 12) * 0.6;
        const left = p.align === 'middle' ? p.x - w / 2 : p.align === 'end' ? p.x - w : p.x;
        seen(left);
        seen(left + w);
        break;
      }
    }
  }
  return { minX, maxX };
}

function shiftX(prims: Primitive[], dx: number): Primitive[] {
  return prims.map((p) => {
    switch (p.kind) {
      case 'line':
      case 'bus':
        return { ...p, x1: p.x1 + dx, x2: p.x2 + dx };
      case 'rect':
        return { ...p, x: p.x + dx };
      case 'circle':
        return { ...p, cx: p.cx + dx };
      case 'text':
        return { ...p, x: p.x + dx };
      case 'path':
        // paths start with an absolute `M x y`; shift only that leading x.
        return { ...p, d: p.d.replace(/^M\s*(-?[\d.]+)/, (_m, x: string) => `M ${Number(x) + dx}`) };
    }
  });
}

export function buildDiagram(spec: OneLineSpec, d: Derived): Diagram {
  const E: Primitive[] = [];
  const add = (...p: Primitive[]) => E.push(...p);
  const txt = (x: number, y: number, text: string, o: Partial<TextP> = {}) =>
    add({ kind: 'text', x, y, text, ...o });
  const wire = (x1: number, y1: number, x2: number, y2: number, dash?: string) =>
    add({ kind: 'line', x1, y1, x2, y2, ...(dash ? { dash } : {}) });
  const bus = (x1: number, y: number, x2: number) =>
    add({ kind: 'bus', x1, y1: y, x2, y2: y });

  const dual = d.feeds === 2;
  const nX = d.xfmrTotal;
  const leftN = dual ? Math.ceil(nX / 2) : nX;
  const rightN = nX - leftN;

  // transformer lane centers (local coords)
  const xfmrX: number[] = [];
  for (let i = 0; i < leftN; i++) xfmrX.push(i * PX);
  const rightStart = leftN * PX + (rightN > 0 ? TIE : 0);
  for (let j = 0; j < rightN; j++) xfmrX.push(rightStart + j * PX);

  const spanCenter = (xfmrX[0] + xfmrX[nX - 1]) / 2;

  // 4 representative RMU cells, centered under the transformer span
  const nC = d.rmuCellsShown;
  const cellStart = spanCenter - ((nC - 1) / 2) * PX;
  const cellX = Array.from({ length: nC }, (_, k) => cellStart + k * PX);

  const leftXs = xfmrX.slice(0, leftN);
  const rightXs = xfmrX.slice(leftN);
  const leftCells = cellX.filter((x) => x <= spanCenter);
  const rightCells = cellX.filter((x) => x > spanCenter);

  const min = (a: number[]) => Math.min(...a);
  const max = (a: number[]) => Math.max(...a);

  // ---- 138 kV buses (main-tie-main if dual) ----
  const feed1X = leftXs.reduce((a, b) => a + b, 0) / leftXs.length;
  const bus1L = min([...leftXs, feed1X]) - 45;
  const bus1R = max([...leftXs, feed1X]) + 45;
  let feed2X = 0;
  let bus2L = 0;
  let bus2R = 0;
  if (dual && rightN > 0) {
    feed2X = rightXs.reduce((a, b) => a + b, 0) / rightXs.length;
    bus2L = min([...rightXs, feed2X]) - 45;
    bus2R = max([...rightXs, feed2X]) + 45;
  }

  // ---- 13.8 kV buses (cover their transformers AND their cells) ----
  // Single feed has no Bus B, so Bus A must span ALL cells, not just the left half.
  const aCells = dual && rightN > 0 ? leftCells : cellX;
  const busAL = min([...leftXs, ...aCells]) - 30;
  const busAR = max([...leftXs, ...aCells]) + 30;
  let busBL = 0;
  let busBR = 0;
  if (dual && rightN > 0) {
    busBL = min([...rightXs, ...rightCells]) - 30;
    busBR = max([...rightXs, ...rightCells]) + 30;
  }

  // ===== FEEDS =====
  const drawFeed = (fx: number, idx: number) => {
    const feedLabel = !dual
      ? '138 kV UTILITY FEED'
      : idx === 0
        ? 'FEED 1 (PREFERRED)'
        : 'FEED 2 (ALTERNATE)';
    txt(fx, FEED_LABEL_Y, feedLabel, { size: 11, weight: 'bold', align: 'middle' });
    wire(fx, OH_TOP_Y, fx, OH_SOLID_Y, '5 4'); // Oncor O/H (dashed)
    wire(fx, OH_SOLID_Y, fx, BUS138_Y); // down to bus
    add(...S.arrester(fx, ARRESTER_Y, -1));
    txt(fx - 38, ARRESTER_Y + 6, `SA-${idx + 1}`, { size: 10, align: 'end' });
    add(...S.meter(fx, METER_Y));
    txt(fx + 16, METER_Y - 2, `M-${idx + 1} Oncor`, { size: 10 });
    txt(fx + 16, METER_Y + 10, 'rev. meter', { size: 10 });
    add(...S.disconnect(fx, AS_Y));
    txt(fx + 22, AS_Y, `AS-${idx + 1}`, { size: 11, weight: 'bold' });
    txt(fx + 22, AS_Y + 12, '245 kV · 1200 A', { size: 10 });
    add(...S.breaker(fx, CB_Y));
    txt(fx + 22, CB_Y + 4, `CB-${idx + 1}`, { size: 11, weight: 'bold' });
  };
  drawFeed(feed1X, 0);
  if (dual && rightN > 0) drawFeed(feed2X, 1);

  // ===== 138 kV BUSES + tie =====
  bus(bus1L, BUS138_Y, bus1R);
  txt(bus1L - 6, BUS138_Y + 4, dual ? '138 kV BUS 1' : '138 kV BUS', {
    size: 12,
    weight: 'bold',
    align: 'end',
  });
  if (dual && rightN > 0) {
    bus(bus2L, BUS138_Y, bus2R);
    txt(bus2R + 6, BUS138_Y + 4, '138 kV BUS 2', {
      size: 12,
      weight: 'bold',
      align: 'start',
    });
    const tcx = (bus1R + bus2L) / 2;
    wire(bus1R, BUS138_Y, tcx - 10, BUS138_Y);
    add(...S.breaker(tcx, BUS138_Y));
    wire(tcx + 10, BUS138_Y, bus2L, BUS138_Y);
    txt(tcx, BUS138_Y - 16, 'CB-T1', { size: 10, weight: 'bold', align: 'middle' });
    txt(tcx, BUS138_Y + 26, '138 kV tie', { size: 10, align: 'middle' });
  }

  // cap bank on bus 1
  const capx = bus1L + 24;
  wire(capx, BUS138_Y, capx, BUS138_Y + 26);
  add(...S.capBank(capx, BUS138_Y + 28));
  txt(capx - 14, BUS138_Y + 52, 'CAP-1/2', { size: 10, align: 'end' });

  // ===== STEP-DOWN TRANSFORMERS =====
  for (let i = 0; i < nX; i++) {
    const x = xfmrX[i];
    const isP2 = d.phased && i >= d.xfmrPhase1;
    const dash = isP2 ? '5 3' : undefined;
    wire(x, BUS138_Y, x, XFMR_CB_Y - 10, dash);
    const cbp = S.breaker(x, XFMR_CB_Y);
    add(...(isP2 ? withDash(cbp, '4 3') : cbp));
    wire(x, XFMR_CB_Y + 10, x, XFMR_CY - 18, dash);
    const tp = S.transformer(x, XFMR_CY);
    add(...(isP2 ? withDash(tp, '4 3') : tp));
    wire(x, XFMR_CY + 18, x, BUS13_Y, dash);
    txt(x + 20, XFMR_CY - 6, `XFMR-${i + 1}`, { size: 11, weight: 'bold' });
    txt(x + 20, XFMR_CY + 7, `${d.mvaPerXfmr} MVA · ${d.deliveryKV}/${d.mvKV} kV`, {
      size: 10,
    });
    txt(
      x + 20,
      XFMR_CY + 19,
      isP2 ? 'Δ–Y · (Phase 2)' : `Δ–Y · ${r0(d.xfmrPriA)}/${r0(d.xfmrSecA)} A`,
      { size: 10 },
    );
  }

  // ===== 13.8 kV BUSES + tie + ground =====
  bus(busAL, BUS13_Y, busAR);
  txt(busAL - 6, BUS13_Y + 4, dual ? '13.8 kV BUS A · 3000 A' : '13.8 kV BUS · 3000 A', {
    size: 12,
    weight: 'bold',
    align: 'end',
  });
  // Y-neutral ground reference off bus A
  wire(busAL + 14, BUS13_Y, busAL + 14, BUS13_Y + 18);
  add(...S.ground(busAL + 14, BUS13_Y + 18));
  if (dual && rightN > 0) {
    bus(busBL, BUS13_Y, busBR);
    txt(busBR + 6, BUS13_Y + 4, '13.8 kV BUS B · 3000 A', {
      size: 12,
      weight: 'bold',
      align: 'start',
    });
    const tcx = (busAR + busBL) / 2;
    wire(busAR, BUS13_Y, tcx - 6, BUS13_Y, '7 4');
    add({ kind: 'circle', cx: tcx, cy: BUS13_Y, r: 4, fill: '#fff' });
    wire(tcx + 6, BUS13_Y, busBL, BUS13_Y, '7 4');
    txt(tcx, BUS13_Y - 14, 'N.O. TIE', { size: 10, weight: 'bold', align: 'middle' });
  }

  // ===== RMU CELLS =====
  for (let k = 0; k < nC; k++) {
    const x = cellX[k];
    wire(x, BUS13_Y, x, CELL_TOP_Y);
    // cell internals: load-break switch + fuse + pad transformer
    add(...S.disconnect(x, CELL_LBS_Y));
    wire(x, CELL_LBS_Y + 6, x, CELL_FUSE_Y - 6);
    add(...S.fuse(x, CELL_FUSE_Y));
    wire(x, CELL_FUSE_Y + 6, x, CELL_XFMR_CY - 16);
    add(...S.transformer(x, CELL_XFMR_CY, 16));
    wire(x, CELL_XFMR_CY + 16, x, BUS480_Y);
    txt(x + 20, CELL_TOP_Y + 6, `CELL-${k + 1}`, { size: 11, weight: 'bold' });
    txt(x + 20, CELL_XFMR_CY - 2, `XFMR-${101 + k}`, { size: 11, weight: 'bold' });
    txt(x + 20, CELL_XFMR_CY + 11, `${d.padMVA} MVA · ${d.mvKV}/0.48 kV`, { size: 10 });
  }
  txt(max(cellX) + 40, 596, '… cells repeat to full load', { size: 9, italic: true });

  // 13.8 kV URD feeders leaving the substation bus down to the RMU/cells —
  // what JH labels "13.8 kV URD POWER LINE #1/#2" (the underground distribution
  // cables, distinct from the switchgear bus they tap off).
  const URD_Y = 452;
  txt(leftCells[0] + 6, URD_Y, '13.8 kV URD #1', { size: 9, italic: true });
  if (dual && rightN > 0) {
    txt(rightCells[0] + 6, URD_Y, '13.8 kV URD #2', { size: 9, italic: true });
  }

  // ===== 480 V MDP =====
  const b480L = min(cellX) - 30;
  const b480R = max(cellX) + 30;
  bus(b480L, BUS480_Y, b480R);
  txt(b480L - 6, BUS480_Y + 4, '480 V MDP · 3000 A', {
    size: 11,
    weight: 'bold',
    align: 'end',
  });
  for (let k = 0; k < nC; k++) {
    const x = cellX[k];
    wire(x, BUS480_Y, x, DISC_Y - 11);
    add({ kind: 'rect', x: x - 17, y: DISC_Y - 11, w: 34, h: 22, fill: '#fff' });
    txt(x + 22, DISC_Y - 2, `DISC-${100 + k}`, { size: 10, weight: 'bold' });
    txt(x + 22, DISC_Y + 10, '3000 A · SE-rated', { size: 10 });
    wire(x, DISC_Y + 11, x, MDP_TOP_Y);
    add({ kind: 'rect', x: x - 27, y: MDP_TOP_Y, w: 54, h: 30, fill: '#fff' });
    txt(x, MDP_TOP_Y + 19, `MDP-${k + 1}`, { size: 10, align: 'middle' });
  }

  // ===== STANDBY GENERATION =====
  const genX = (b480L + b480R) / 2;
  wire(genX, BUS480_Y, genX, GEN_CY - 18);
  add(...S.generator(genX, GEN_CY));
  txt(genX, GEN_CY + 30, 'GEN-1…N', { size: 11, weight: 'bold', align: 'middle' });
  txt(genX, GEN_CY + 43, 'Standby diesel · N+1 (by others)', { size: 10, align: 'middle' });

  // ===== junction dots (filled = electrical connection at a bus tap) =====
  const dot = (x: number, y: number) => add(...S.junctionDot(x, y));
  dot(feed1X, BUS138_Y);
  dot(capx, BUS138_Y);
  if (dual && rightN > 0) dot(feed2X, BUS138_Y);
  for (const x of xfmrX) {
    dot(x, BUS138_Y); // transformer primary on the 138 kV bus
    dot(x, BUS13_Y); // transformer secondary on the 13.8 kV bus
  }
  for (const x of cellX) {
    dot(x, BUS13_Y); // cell tap on the 13.8 kV bus
    dot(x, BUS480_Y); // cell tap on the 480 V bus
  }
  dot(genX, BUS480_Y);

  // ===== normalize horizontal origin =====
  const bb = geomBBox(E);
  const dx = 60 - bb.minX;
  const elec = shiftX(E, dx);
  const sbb = geomBBox(elec);
  const drawingRight = sbb.maxX + 30;

  // ===== margin panels (absolute, post-shift) =====
  const P: Primitive[] = [];
  const padd = (...p: Primitive[]) => P.push(...p);
  const ptxt = (x: number, y: number, text: string, o: Partial<TextP> = {}) =>
    padd({ kind: 'text', x, y, text, ...o });

  // POI demarcation across the substation
  padd({ kind: 'line', x1: 52, y1: POI_Y, x2: drawingRight, y2: POI_Y, width: 1.6, dash: '7 3' });
  // Place the POI caption in clear space: dual → the central gap between the
  // two feeds; single → the right end past the lone feed. Avoids the vertical
  // feed conductors and the feed meter labels either way.
  const poiText = 'POINT OF DELIVERY (POI) — Oncor above / customer below';
  if (dual && rightN > 0) {
    ptxt((feed1X + feed2X) / 2 + dx, POI_Y - 6, poiText, { size: 9, italic: true, align: 'middle' });
  } else {
    ptxt(drawingRight - 8, POI_Y - 6, poiText, { size: 9, italic: true, align: 'end' });
  }
  ptxt(60, 44, 'BY ONCOR — utility side (above POI)', { size: 9, italic: true, color: '#555' });
  // scope / battery-limit boxes — who builds & owns what (mirrors JH's sheet):
  //   upper = substation package (138 kV → 13.8 kV switchgear, in the E-house)
  //   lower = R&B's MV/LV distribution (13.8 kV feeders → pad xfmrs → 480 V MDP)
  // The 13.8 kV feeders dropping between them are the handoff / battery limit.
  const SUB_BOTTOM = 458; // just below the 13.8 kV bus + neutral ground
  const RB_TOP = 466; // R&B distribution begins at the 13.8 kV feeders
  padd({ kind: 'rect', x: 48, y: 158, w: drawingRight - 48, h: SUB_BOTTOM - 158, width: 1.2, dash: '10 6' });
  ptxt(56, 172, 'MAIN SUBSTATION & E-HOUSE', { size: 10, weight: 'bold' });
  padd({ kind: 'rect', x: 48, y: RB_TOP, w: drawingRight - 48, h: ELEC_BOTTOM - RB_TOP, width: 1.2, dash: '10 6' });
  ptxt(56, RB_TOP + 14, 'R&B POWER INC.', { size: 10, weight: 'bold' });

  const mva = r0(d.ultimateMVA);
  const panelX = drawingRight + 40;
  const width = panelX + PANEL_W + 30;

  // --- General Notes (content-sized) ---
  const notes: string[] = [
    `1. Service: ${dual ? 'dual (two-way)' : 'single'} ${d.deliveryKV} kV feed; Oncor`,
    '   revenue metering (xfmr-rated) & arresters above POI.',
    `2. Ultimate ${d.ultimateMW} MW (~${mva} MVA @ ${d.pf} pf), data center.`,
    ...(d.phased
      ? [
          `   Phased: ${d.phase1MW} MW${d.phase1Year ? ` (${d.phase1Year})` : ''} → ${d.ultimateMW} MW${d.phase2Year ? ` (${d.phase2Year})` : ''}.`,
        ]
      : []),
    `3. ${d.xfmrTotal} × ${d.mvaPerXfmr} MVA (N-1 firm ${d.firmMVA} MVA);`,
    '   dashed transformers = future phase.',
    ...(dual && rightN > 0
      ? [
          '4. 138 kV main-tie-main + 13.8 kV N.O. tie; no parallel',
          '   of feeds without Oncor approval.',
        ]
      : ['4. Single 138 kV feed; radial customer substation.']),
    '5. %Z, tap range, kA, CT/PT & relays — by final design.',
  ];
  const nH = 52 + (notes.length - 1) * 14;
  padd({ kind: 'rect', x: panelX, y: 40, w: PANEL_W, h: nH, width: 1.5 });
  ptxt(panelX + 10, 60, 'GENERAL NOTES', { size: 12, weight: 'bold' });
  padd({ kind: 'line', x1: panelX, y1: 68, x2: panelX + PANEL_W, y2: 68, width: 1 });
  notes.forEach((line, i) => ptxt(panelX + 10, 84 + i * 14, line, { size: 10 }));

  // --- Legend (symbols reused) ---
  const legY = 40 + nH + 20;
  const legItems: Array<[(cx: number, cy: number) => Primitive[], string]> = [
    [(cx, cy) => S.disconnect(cx, cy), 'Disconnect switch'],
    [(cx, cy) => S.breaker(cx, cy), 'Circuit breaker'],
    [(cx, cy) => S.transformer(cx, cy, 11), 'Power transformer (Δ–Y)'],
    [(cx, cy) => S.fuse(cx, cy), 'Fuse'],
    [(cx, cy) => S.capBank(cx, cy - 3), 'Capacitor bank'],
    [(cx, cy) => S.generator(cx, cy, 9), 'Generator'],
    [
      (cx, cy) => [
        { kind: 'rect', x: cx - 5, y: cy - 8, w: 10, h: 16, fill: '#fff' },
        { kind: 'line', x1: cx - 3, y1: cy - 5, x2: cx + 3, y2: cy + 5 },
        ...S.ground(cx, cy + 11),
      ],
      'Surge arrester',
    ],
    [(cx, cy) => S.meter(cx, cy), 'Revenue meter'],
    [(cx, cy) => S.junctionDot(cx, cy), 'Connection (junction)'],
  ];
  const legH = 26 + legItems.length * 32 + 8;
  padd({ kind: 'rect', x: panelX, y: legY, w: PANEL_W, h: legH, width: 1.5 });
  ptxt(panelX + 10, legY + 20, 'LEGEND', { size: 12, weight: 'bold' });
  padd({ kind: 'line', x1: panelX, y1: legY + 28, x2: panelX + PANEL_W, y2: legY + 28, width: 1 });
  legItems.forEach(([sym, label], i) => {
    const cy = legY + 50 + i * 32;
    padd(...sym(panelX + 26, cy));
    ptxt(panelX + 56, cy + 4, label, { size: 10 });
  });

  // --- Load caption (bottom-left, no box) ---
  ptxt(60, HEIGHT - 46, `TOTAL CONNECTED LOAD: ${d.ultimateMW} MW (~${mva} MVA @ ${d.pf} pf) · data center`, {
    size: 12,
    weight: 'bold',
  });
  ptxt(
    60,
    HEIGHT - 28,
    `Service: ${dual ? 'dual ' : ''}${d.deliveryKV} kV feed · ${d.conductor} · ${d.xfmrTotal} × ${d.mvaPerXfmr} MVA (N-1 firm ${d.firmMVA}) · per-feed ${r0(d.feedAmps)} A`,
    { size: 10 },
  );

  // --- Title block (bottom-right) ---
  const tbW = 480;
  const tbH = 104;
  const tbX = width - 30 - tbW;
  const tbY = HEIGHT - 30 - tbH;
  // revision row above
  padd({ kind: 'rect', x: tbX, y: tbY - 30, w: tbW, h: 28, width: 1 });
  ptxt(tbX + 8, tbY - 12, `REV ${spec.rev ?? '1'}  ·  Issued for Interconnection Study  ·  RBP  ·  ${spec.date ?? ''}`, {
    size: 10,
  });
  padd({ kind: 'rect', x: tbX, y: tbY, w: tbW, h: tbH, width: 1.5 });
  padd({ kind: 'line', x1: tbX, y1: tbY + 26, x2: tbX + tbW, y2: tbY + 26, width: 1 });
  padd({ kind: 'line', x1: tbX + tbW - 200, y1: tbY + 26, x2: tbX + tbW - 200, y2: tbY + tbH, width: 1 });
  ptxt((tbX + tbX + tbW) / 2, tbY + 18, 'ELECTRICAL ONE-LINE DIAGRAM', {
    size: 13,
    weight: 'bold',
    align: 'middle',
  });
  ptxt(tbX + 10, tbY + 46, spec.projectName, { size: 11, weight: 'bold' });
  ptxt(tbX + 10, tbY + 64, spec.location, { size: 10 });
  ptxt(tbX + 10, tbY + 82, `${spec.oncorWo ?? ''}${spec.substation ? ' · Sub ' + spec.substation : ''}`, {
    size: 9,
  });
  ptxt(tbX + 10, tbY + 96, `Customer: ${spec.customer}`, { size: 9 });
  ptxt(tbX + tbW - 190, tbY + 46, 'R&B Power Inc.', { size: 11, weight: 'bold' });
  ptxt(tbX + tbW - 190, tbY + 64, `Dwg ${spec.drawingNo} · Rev ${spec.rev ?? '1'}`, { size: 10, weight: 'bold' });
  ptxt(tbX + tbW - 190, tbY + 82, 'Scale: AS SHOWN · Sheet 1 of 1', { size: 9 });
  ptxt(tbX + tbW - 190, tbY + 96, 'Study-stage · not for construction', { size: 9, italic: true });

  return { width, height: HEIGHT, primitives: [...elec, ...P] };
}
