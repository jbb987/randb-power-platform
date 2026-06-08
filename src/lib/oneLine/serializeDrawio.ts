// Diagram -> draw.io (.drawio / mxGraph XML) string. Same coordinates as the
// SVG, so the two outputs are identical. Every primitive becomes a movable
// mxCell, so the file opens editable in draw.io / diagrams.net.

import type { Diagram, Primitive, TextP } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function align(a: TextP['align']): string {
  return a === 'end' ? 'right' : a === 'middle' ? 'center' : 'left';
}

function cell(id: number, p: Primitive): string {
  const open = `<mxCell id="c${id}" parent="1"`;
  switch (p.kind) {
    case 'line':
    case 'bus': {
      const w = p.kind === 'bus' ? 6 : (p.width ?? 2);
      const dash = p.kind === 'line' && p.dash ? 'dashed=1;' : '';
      return `${open} style="endArrow=none;html=1;strokeWidth=${w};${dash}" edge="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${p.x1}" y="${p.y1}" as="sourcePoint"/><mxPoint x="${p.x2}" y="${p.y2}" as="targetPoint"/></mxGeometry></mxCell>`;
    }
    case 'rect': {
      const fill = p.fill && p.fill !== 'none' ? p.fill : 'none';
      const dash = p.dash ? 'dashed=1;' : '';
      return `${open} value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeWidth=${p.width ?? 2};${dash}" vertex="1"><mxGeometry x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" as="geometry"/></mxCell>`;
    }
    case 'circle': {
      const fill = p.fill && p.fill !== 'none' ? p.fill : 'none';
      return `${open} value="" style="ellipse;html=1;fillColor=${fill};strokeWidth=${p.width ?? 2};" vertex="1"><mxGeometry x="${p.cx - p.r}" y="${p.cy - p.r}" width="${p.r * 2}" height="${p.r * 2}" as="geometry"/></mxCell>`;
    }
    case 'text': {
      const size = p.size ?? 12;
      const bold = p.weight === 'bold' ? 'fontStyle=1;' : '';
      const w = Math.max(40, p.text.length * size * 0.62);
      // anchor the text box so its baseline roughly matches the SVG (x,y)
      const bx = p.align === 'middle' ? p.x - w / 2 : p.align === 'end' ? p.x - w : p.x;
      return `${open} value="${esc(p.text)}" style="text;html=1;align=${align(p.align)};verticalAlign=middle;fontSize=${size};${bold}" vertex="1"><mxGeometry x="${bx}" y="${p.y - size}" width="${w}" height="${size + 6}" as="geometry"/></mxCell>`;
    }
    default: {
      const never: never = p;
      return never;
    }
  }
}

export function toDrawio(d: Diagram): string {
  const cells = d.primitives.map((p, i) => cell(i + 2, p)).join('');
  const model = `<mxGraphModel dx="${d.width}" dy="${d.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${d.width}" pageHeight="${d.height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
  return `<mxfile host="app.diagrams.net"><diagram name="One-Line" id="oneline">${model}</diagram></mxfile>`;
}
