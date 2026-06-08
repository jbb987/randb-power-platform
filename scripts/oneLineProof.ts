// Phase-1 proof harness for the One-Line Generator.
// Generates 3 real sites from data, writes .svg + .drawio, and renders each
// to PDF via headless Chrome. Run:  npx tsx scripts/oneLineProof.ts
//
// Output: research/oneline-proof/*.{svg,drawio,pdf}

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateOneLine, type OneLineSpec } from '../src/lib/oneLine/index';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(process.cwd(), 'research', 'oneline-proof');

const specs: OneLineSpec[] = [
  {
    projectName: 'NTSM Airport Quarry — McKinney, TX',
    location: 'McKinney, TX 75070',
    customer: 'NTNSM, LLC',
    drawingNo: 'RB-AQ-E-001',
    oncorWo: 'Oncor WO 32484946',
    substation: '309443',
    rev: '1',
    date: '2026-06-08',
    ultimateMW: 175,
    phase1MW: 100,
    phase1Year: 2027,
    phase2Year: 2028,
    feeds: 'dual',
  },
  {
    projectName: 'NTSM Sherman — Grayson Co., TX',
    location: 'Sherman, TX',
    customer: 'NTNSM, LLC',
    drawingNo: 'RB-SH-E-001',
    oncorWo: 'Oncor (pre-WO)',
    substation: '300694',
    rev: '1',
    date: '2026-06-08',
    ultimateMW: 70,
    feeds: 'dual',
  },
  {
    projectName: 'NTSM Combine Pit — Dallas Co., TX',
    location: 'Combine, TX',
    customer: 'NTNSM, LLC',
    drawingNo: 'RB-CB-E-001',
    substation: '311579',
    rev: '1',
    date: '2026-06-08',
    ultimateMW: 350,
    feeds: 'dual',
  },
  {
    projectName: 'Single-Feed Test — 60 MW',
    location: 'TX',
    customer: 'NTNSM, LLC',
    drawingNo: 'RB-SF-E-001',
    rev: '1',
    date: '2026-06-08',
    ultimateMW: 60,
    feeds: 'single',
  },
];

mkdirSync(OUT, { recursive: true });

for (const spec of specs) {
  const { svg, drawioXml, derived, diagram } = generateOneLine(spec);
  const base = spec.drawingNo;
  writeFileSync(join(OUT, `${base}.svg`), svg);
  writeFileSync(join(OUT, `${base}.drawio`), drawioXml);

  const wIn = (diagram.width / 100).toFixed(2);
  const hIn = (diagram.height / 100).toFixed(2);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:${wIn}in ${hIn}in;margin:0}html,body{margin:0;padding:0}img{width:${wIn}in;height:${hIn}in;display:block}</style></head><body><img src="${base}.svg"></body></html>`;
  writeFileSync(join(OUT, `${base}.html`), html);

  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${join(OUT, base + '.pdf')}`,
      join(OUT, `${base}.html`),
    ],
    { stdio: 'ignore' },
  );

  console.log(
    `${base}: ${spec.ultimateMW} MW → ${derived.xfmrTotal}×${derived.mvaPerXfmr} MVA ` +
      `(phase1 ${derived.xfmrPhase1}, firm ${derived.firmMVA}), conductor ${derived.conductor}, ` +
      `feed ${Math.round(derived.feedAmps)} A, canvas ${diagram.width}×${diagram.height}`,
  );
}

console.log(`\nWrote ${specs.length} sites to ${OUT}`);
