import type { SiteInputs, AppraisalResult } from '../../types';
import PresentationView from '../PresentationView';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#C1121F]/40 focus:ring-2 focus:ring-[#C1121F]/10 placeholder:text-[#7A756E]';

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
      {/* Calculator (existing PresentationView) */}
      <PresentationView
        inputs={inputs}
        result={result}
        onMWChange={onMWChange}
        onSiteNameChange={(name) => set('siteName', name)}
      />

      {/* Site Details */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-[#D8D5D0] p-6 md:p-8">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-5">
          Site Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <Field label="Total Acres">
            <input
              type="number"
              className={inputClass}
              value={inputs.totalAcres || ''}
              onChange={(e) => num('totalAcres', e.target.value)}
              placeholder="414"
            />
          </Field>

          <Field label="Current $/Acre" hint="From Land ID comps">
            <input
              type="number"
              className={inputClass}
              value={inputs.currentPPA || ''}
              onChange={(e) => num('currentPPA', e.target.value)}
              placeholder="6400"
            />
          </Field>

          <Field label="Utility Territory">
            <input
              type="text"
              className={inputClass}
              value={inputs.utilityTerritory}
              onChange={(e) => set('utilityTerritory', e.target.value)}
              placeholder="e.g. PacifiCorp"
            />
          </Field>

          <Field label="ISO / RTO">
            <input
              type="text"
              className={inputClass}
              value={inputs.iso}
              onChange={(e) => set('iso', e.target.value)}
              placeholder="e.g. WECC, SPP, ERCOT"
            />
          </Field>

          <Field label="County / State">
            <input
              type="text"
              className={inputClass}
              value={inputs.county}
              onChange={(e) => set('county', e.target.value)}
              placeholder="Laramie County, WY"
            />
          </Field>

          <Field label="Substation Name">
            <input
              type="text"
              className={inputClass}
              value={inputs.substationName}
              onChange={(e) => set('substationName', e.target.value)}
              placeholder="Willard"
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
        </div>

        {/* Description */}
        <Field label="Description / Notes">
          <textarea
            className={`${inputClass} resize-none`}
            value={inputs.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Any additional details about this site..."
            rows={3}
          />
        </Field>
      </div>
    </div>
  );
}
