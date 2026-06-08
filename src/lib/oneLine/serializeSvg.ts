// Diagram -> SVG string. Pure; no DOM.

import type { Diagram, Primitive, TextP } from './types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function anchor(a: TextP['align']): string {
  return a === 'end' ? 'end' : a === 'middle' ? 'middle' : 'start';
}

function el(p: Primitive): string {
  switch (p.kind) {
    case 'line':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="#000" stroke-width="${p.width ?? 2}" fill="none"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}/>`;
    case 'bus':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="#000" stroke-width="6" fill="none"/>`;
    case 'rect':
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" stroke="#000" stroke-width="${p.width ?? 2}" fill="${p.fill ?? 'none'}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}/>`;
    case 'circle':
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" stroke="#000" stroke-width="${p.width ?? 2}" fill="${p.fill ?? 'none'}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}/>`;
    case 'text':
      return `<text x="${p.x}" y="${p.y}" font-size="${p.size ?? 12}" fill="${p.color ?? '#000'}" text-anchor="${anchor(p.align)}"${p.weight === 'bold' ? ' font-weight="bold"' : ''}${p.italic ? ' font-style="italic"' : ''}>${esc(p.text)}</text>`;
    default: {
      const never: never = p;
      return never;
    }
  }
}

export function toSvg(d: Diagram): string {
  const body = d.primitives.map(el).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" font-family="Helvetica, Arial, sans-serif">\n  ${body}\n</svg>`;
}
