import type { SiteInputs, AppraisalResult } from '../../types';
import PresentationView from '../PresentationView';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#E8E6E3] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#C1121F]/40 focus:ring-2 focus:ring-[#C1121F]/10 placeholder:text-[#B5B0A8]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#B5B0A8]">{hint}</span>}
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

      {/* Land / Property Details */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-[#E8E6E3] p-6 md:p-8">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-5">
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

          <Field label="Raw Land Value">
            <input
              type="number"
              className={inputClass}
              value={inputs.rawLandValue || ''}
              onChange={(e) => num('rawLandValue', e.target.value)}
              placeholder="250000"
            />
          </Field>

          <Field label="Tax Est. Value">
            <input
              type="number"
              className={inputClass}
              value={inputs.taxEstValue || ''}
              onChange={(e) => num('taxEstValue', e.target.value)}
              placeholder="180000"
            />
          </Field>
        </div>
      </div>

      {/* Power Infrastructure */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-[#E8E6E3] p-6 md:p-8">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-5">
          Power Infrastructure
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="RTO / ISO">
            <input
              type="text"
              className={inputClass}
              value={inputs.iso}
              onChange={(e) => set('iso', e.target.value)}
              placeholder="e.g. WECC, SPP, ERCOT"
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

          <Field label="Transmission Service Provider (TSP)">
            <input
              type="text"
              className={inputClass}
              value={inputs.tsp}
              onChange={(e) => set('tsp', e.target.value)}
              placeholder="e.g. Western Area Power"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
