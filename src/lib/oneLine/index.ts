// One-Line Generator — public entry point.
//   const { svg, drawioXml, derived } = generateOneLine(spec)

import { deriveElectrical, type Derived } from './derive';
import { buildDiagram } from './layout';
import { toSvg } from './serializeSvg';
import { toDrawio } from './serializeDrawio';
import type { Diagram, OneLineSpec } from './types';

export type { OneLineSpec } from './types';
export type { Derived } from './derive';

export interface GeneratedOneLine {
  svg: string;
  drawioXml: string;
  derived: Derived;
  diagram: Diagram;
}

export function generateOneLine(spec: OneLineSpec): GeneratedOneLine {
  const derived = deriveElectrical(spec);
  const diagram = buildDiagram(spec, derived);
  return {
    svg: toSvg(diagram),
    drawioXml: toDrawio(diagram),
    derived,
    diagram,
  };
}
