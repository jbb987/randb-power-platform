import type { LeadPipelineCompany } from '../types';
import { companyReason, droppedStep } from '../lib/leadPipeline';

// Full per-company export so a build can be reviewed in detail outside the app
// (the Lead Builder is admin-only and has no other way out today). One column
// per pipeline field across all three stages + the human-readable reason.
const HEADERS = [
  'Stage',
  'Tier',
  'Energy Intensity',
  'Tax Owner',
  'Operating Company',
  'City',
  'Parcel Address',
  'Mailing Address',
  'Property Classes',
  'Class Description',
  'Market Value',
  'Parcels',
  'Website',
  'Industry',
  'NAICS',
  'Perplexity Status',
  'Perplexity Confidence',
  'Description',
  'Decision Maker',
  'Title',
  'Email',
  'LinkedIn',
  'Org Phone',
  'Qualified',
  'Dropped Step',
  'Reason',
  'Stage Error',
];

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str === '') return '';
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildLeadPipelineCsv(companies: LeadPipelineCompany[]): string {
  const rows: string[] = [HEADERS.join(',')];

  for (const c of companies) {
    rows.push(
      [
        escapeCell(c.stage),
        escapeCell(c.tier),
        escapeCell(c.energyIntensity),
        escapeCell(c.taxOwner),
        escapeCell(c.operatingCompany),
        escapeCell(c.city),
        escapeCell(c.parcelAddress),
        escapeCell(c.mailingAddress),
        escapeCell(c.propertyClasses),
        escapeCell(c.classDesc),
        escapeCell(c.marketValue),
        escapeCell(c.nParcels),
        escapeCell(c.website),
        escapeCell(c.industry),
        escapeCell(c.naics),
        escapeCell(c.pplxStatus),
        escapeCell(c.pplxConfidence),
        escapeCell(c.description),
        escapeCell(c.decisionMaker),
        escapeCell(c.decisionMakerTitle),
        escapeCell(c.email),
        escapeCell(c.linkedinUrl),
        escapeCell(c.orgPhone),
        escapeCell(c.qualified),
        escapeCell(droppedStep(c) ?? ''),
        escapeCell(companyReason(c)),
        escapeCell(c.stageError),
      ].join(','),
    );
  }

  return rows.join('\n');
}

export function downloadLeadPipelineCsv(
  companies: LeadPipelineCompany[],
  meta: { county: string; state: string; tab: string },
): void {
  const csv = buildLeadPipelineCsv(companies);
  // BOM so Excel detects UTF-8 correctly when opening directly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = url;
  link.download = `lead-builder_${slug(meta.county)}-${slug(meta.state)}_${slug(meta.tab)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
