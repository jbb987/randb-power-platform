// One-Line Generator — geometry primitives + input spec.
//
// The engine builds a single list of `Primitive`s with COMPUTED coordinates,
// then two serializers (SVG + draw.io) render the same coordinates. Because
// positions come from formulas (lane pitch, tier bands, content-sized panels)
// rather than hand-placed numbers, overlaps are structurally impossible.

export type Align = 'start' | 'middle' | 'end';

export interface Line {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  dash?: string;
}

export interface Rect {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  width?: number;
  dash?: string;
  fill?: string;
}

export interface Circle {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  width?: number;
  dash?: string;
  fill?: string;
}

export interface TextP {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: 'normal' | 'bold';
  align?: Align;
  italic?: boolean;
  color?: string;
}

/** Thick horizontal/vertical conductor (busbar). */
export interface Bus {
  kind: 'bus';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type Primitive = Line | Rect | Circle | TextP | Bus;

export interface Diagram {
  width: number;
  height: number;
  primitives: Primitive[];
}

export type FeedKind = 'single' | 'dual';

/** Everything that varies per site. Sensible defaults fill the rest. */
export interface OneLineSpec {
  // identity / title block
  projectName: string;
  location: string;
  customer: string;
  drawingNo: string;
  oncorWo?: string;
  substation?: string;
  utility?: string;
  rev?: string;
  date?: string; // ISO yyyy-mm-dd

  // electrical
  ultimateMW: number;
  phase1MW?: number;
  phase1Year?: number;
  phase2Year?: number;
  deliveryKV?: number; // default 138
  utilizationV?: number; // default 480
  mvKV?: number; // default 13.8
  powerFactor?: number; // default 0.97
  feeds?: FeedKind; // default 'dual'
  mvaPerXfmr?: number; // default 75
  padMVA?: number; // default 2.5
  mainBusA?: number; // default 1200
  conductor?: string; // override; else derived from MW
}
