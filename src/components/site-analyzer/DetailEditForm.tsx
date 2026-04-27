import { useState } from 'react';
import PowerSlider from '../PowerSlider';
import CompanyPicker from '../crm-directory/CompanyPicker';
import type { SiteRegistryEntry } from '../../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const MW_MIN = 10;
const MW_MAX = 1000;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export interface EditFormValues {
  name: string;
  address: string;
  coordinates: string;
  acreage: number;
  mwCapacity: number;
  dollarPerAcreLow: number;
  dollarPerAcreHigh: number;
  priorUsage: string;
  legalDescription: string;
  county: string;
  parcelId: string;
  companyId: string | null;
}

interface Props {
  site: SiteRegistryEntry;
  onSave: (values: EditFormValues) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * Edit-mode form for a saved site. Mirrors the New page form, but pre-fills
 * from the current site and exposes Save / Cancel buttons. Saving updates the
 * site record only — re-analysis is a separate explicit action.
 */
export default function DetailEditForm({ site, onSave, onCancel, saving }: Props) {
  const [name, setName] = useState(site.name || '');
  const [address, setAddress] = useState(site.address || '');
  const [coordinates, setCoordinates] = useState(
    `${site.coordinates.lat}, ${site.coordinates.lng}`,
  );
  const [acreage, setAcreage] = useState(site.acreage || 0);
  const [mw, setMw] = useState(site.mwCapacity || 50);
  const [ppaLow, setPpaLow] = useState(site.dollarPerAcreLow || 0);
  const [ppaHigh, setPpaHigh] = useState(site.dollarPerAcreHigh || 0);
  const [priorUsage, setPriorUsage] = useState(site.priorUsage || '');
  const [legalDescription, setLegalDescription] = useState(site.legalDescription || '');
  const [county, setCounty] = useState(site.county || '');
  const [parcelId, setParcelId] = useState(site.parcelId || '');
  const [companyId, setCompanyId] = useState<string | null>(site.companyId ?? null);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError('Site name is required.');
      return;
    }
    if (!coordinates.trim()) {
      setError('Coordinates are required.');
      return;
    }
    void onSave({
      name: name.trim(),
      address: address.trim(),
      coordinates: coordinates.trim(),
      acreage: acreage || 0,
      mwCapacity: mw,
      dollarPerAcreLow: ppaLow || 0,
      dollarPerAcreHigh: ppaHigh || 0,
      priorUsage: priorUsage.trim(),
      legalDescription: legalDescription.trim(),
      county: county.trim(),
      parcelId: parcelId.trim(),
      companyId,
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-[#D8D5D0] p-4 sm:p-5 mb-5">
      <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Edit site</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Field label="Site Name *">
          <input
            type="text"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunrise Solar Farm"
          />
        </Field>
        <Field label="Coordinates *">
          <input
            type="text"
            className={inputClass}
            value={coordinates}
            onChange={(e) => setCoordinates(e.target.value)}
            placeholder={'28°39\'22"N 98°50\'38"W'}
          />
        </Field>
        <Field label="Address">
          <input
            type="text"
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="Acreage">
          <input
            type="number"
            className={inputClass}
            value={acreage || ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setAcreage(isNaN(v) ? 0 : v);
            }}
          />
        </Field>
        <Field label="$/Acre Low">
          <input
            type="number"
            className={inputClass}
            value={ppaLow || ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPpaLow(isNaN(v) ? 0 : v);
            }}
          />
        </Field>
        <Field label="$/Acre High">
          <input
            type="number"
            className={inputClass}
            value={ppaHigh || ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPpaHigh(isNaN(v) ? 0 : v);
            }}
          />
        </Field>
      </div>

      <div className="max-w-md mb-5">
        <PowerSlider value={mw} min={MW_MIN} max={MW_MAX} step={5} label="MW Capacity" onChange={setMw} />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#7A756E]">{MW_MIN} MW</span>
          <span className="text-sm font-heading font-semibold text-[#ED202B]">{mw} MW</span>
          <span className="text-[10px] text-[#7A756E]">{MW_MAX} MW</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Field label="Prior Usage / Property Type">
          <input
            type="text"
            className={inputClass}
            value={priorUsage}
            onChange={(e) => setPriorUsage(e.target.value)}
          />
        </Field>
        <Field label="Legal Description">
          <input
            type="text"
            className={inputClass}
            value={legalDescription}
            onChange={(e) => setLegalDescription(e.target.value)}
          />
        </Field>
        <Field label="County">
          <input
            type="text"
            className={inputClass}
            value={county}
            onChange={(e) => setCounty(e.target.value)}
          />
        </Field>
        <Field label="Parcel ID">
          <input
            type="text"
            className={inputClass}
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
          />
        </Field>
        <Field label="Company">
          <CompanyPicker
            value={companyId}
            onChange={setCompanyId}
            placeholder="Link to a company…"
          />
        </Field>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-[#D8D5D0] bg-white px-4 py-2 text-sm text-[#7A756E] hover:bg-stone-50 transition disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition disabled:opacity-40"
        >
          {saving ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </section>
  );
}
