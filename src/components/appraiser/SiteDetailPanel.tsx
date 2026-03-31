import { useState, useRef } from 'react';
import type { SiteInputs, AppraisalResult } from '../../types';
import { formatCurrencyShort } from '../../utils/format';
import { exportElementToPdf } from '../../utils/exportPdf';
import PresentationView from '../PresentationView';
import SiteMapCard from './SiteMapCard';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export default function SiteDetailPanel({ inputs, result, onMWChange, onInputsChange }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportPdf() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const name = inputs.siteName?.trim() || 'Site Appraisal';
      await exportElementToPdf(captureRef.current, name);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    onInputsChange({ ...inputs, [key]: value });
  }

  function num(key: keyof SiteInputs, raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n)) set(key, n);
    if (raw === '') set(key, 0);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Download PDF button */}
      <div className="flex justify-end no-print">
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exporting…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
              </svg>
              Download PDF
            </>
          )}
        </button>
      </div>

      <div ref={captureRef} className="space-y-6">
      {/* Site Location Map */}
      <SiteMapCard coordinates={inputs.coordinates} />

      {/* Calculator (existing PresentationView) */}
      <PresentationView
        inputs={inputs}
        result={result}
        onMWChange={onMWChange}
        onSiteNameChange={(name) => set('siteName', name)}
      />

      {/* Land / Property Details */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">
          Land / Property
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Address">
            <input
              type="text"
              className={inputClass}
              value={inputs.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="123 Main St, Cheyenne, WY"
            />
          </Field>

          <Field label="Coordinates" hint="Decimal or DMS format">
            <input
              type="text"
              className={inputClass}
              value={inputs.coordinates}
              onChange={(e) => set('coordinates', e.target.value)}
              placeholder="28°39'22.0&quot;N 98°50'38.3&quot;W"
            />
          </Field>

          <Field label="Prior Usage / Property Type">
            <input
              type="text"
              className={inputClass}
              value={inputs.priorUsage}
              onChange={(e) => set('priorUsage', e.target.value)}
              placeholder="e.g. Agricultural, Vacant, Ranch"
            />
          </Field>

          <Field label="Legal Description">
            <input
              type="text"
              className={inputClass}
              value={inputs.legalDescription}
              onChange={(e) => set('legalDescription', e.target.value)}
              placeholder="Lot 1, Block 2, Section 14"
            />
          </Field>

          <Field label="County">
            <input
              type="text"
              className={inputClass}
              value={inputs.county}
              onChange={(e) => set('county', e.target.value)}
              placeholder="Laramie County, WY"
            />
          </Field>

          <Field label="Acreage">
            <input
              type="number"
              className={inputClass}
              value={inputs.totalAcres || ''}
              onChange={(e) => num('totalAcres', e.target.value)}
              placeholder="414"
            />
          </Field>

          <Field label="Parcel ID">
            <input
              type="text"
              className={inputClass}
              value={inputs.parcelId}
              onChange={(e) => set('parcelId', e.target.value)}
              placeholder="00014006623014"
            />
          </Field>

          <Field label="Owner">
            <input
              type="text"
              className={inputClass}
              value={inputs.owner}
              onChange={(e) => set('owner', e.target.value)}
              placeholder="John Doe"
            />
          </Field>

          <Field label="$/Acre Low" hint="From land comps">
            <input
              type="number"
              className={inputClass}
              value={inputs.ppaLow || ''}
              onChange={(e) => num('ppaLow', e.target.value)}
              placeholder="5000"
            />
          </Field>

          <Field label="$/Acre High" hint="From land comps">
            <input
              type="number"
              className={inputClass}
              value={inputs.ppaHigh || ''}
              onChange={(e) => num('ppaHigh', e.target.value)}
              placeholder="8000"
            />
          </Field>

          <Field label="Raw Land Value" hint="Computed from acreage × $/acre">
            <div className="rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]">
              {result.currentValueLow > 0 || result.currentValueHigh > 0
                ? `Est. ${formatCurrencyShort(result.currentValueLow)} – ${formatCurrencyShort(result.currentValueHigh)}`
                : '—'}
            </div>
          </Field>

        </div>
      </div>
      </div>
    </div>
  );
}
