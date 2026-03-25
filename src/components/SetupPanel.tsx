import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SiteInputs } from '../types';
import { formatCurrencyShort } from '../utils/format';

interface Props {
  inputs: SiteInputs;
  onChange: (inputs: SiteInputs) => void;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export default function SetupPanel({ inputs, onChange, onClose }: Props) {
  const [showOptional, setShowOptional] = useState(
    !!(inputs.parcelId || inputs.county || inputs.address || inputs.coordinates || inputs.priorUsage)
  );

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    onChange({ ...inputs, [key]: value });
  }

  function num(key: keyof SiteInputs, raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n)) set(key, n);
    if (raw === '') set(key, 0);
  }

  const energizedValue = inputs.mw * 1_000_000;

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-[#D8D5D0] shadow-2xl z-50 overflow-y-auto"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-[#201F1E]">Setup</h2>
            <p className="text-xs text-[#7A756E]">Configure site details before presenting</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-stone-100 transition"
            aria-label="Close setup panel"
          >
            <svg className="w-5 h-5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Required fields */}
        <div className="space-y-4 mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A756E]">Required</h3>

          <Field label="Site Name / Location">
            <input
              type="text"
              className={inputClass}
              value={inputs.siteName}
              onChange={(e) => set('siteName', e.target.value)}
              placeholder="Whitney Rd, Cheyenne, WY"
            />
          </Field>

          <Field label="Total Acres">
            <input
              type="number"
              className={inputClass}
              value={inputs.totalAcres || ''}
              onChange={(e) => num('totalAcres', e.target.value)}
              placeholder="414"
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
        </div>

        {/* Valuation info — read-only, derived from MW */}
        <div className="mb-8 rounded-xl bg-stone-50 border border-stone-100 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A756E] mb-3">
            Energized Valuation (auto-calculated)
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#7A756E]">Current MW</span>
              <span className="font-medium text-[#201F1E]">{inputs.mw} MW</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A756E]">Rate</span>
              <span className="font-medium text-[#201F1E]">$1M / MW</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A756E]">Energized value</span>
              <span className="font-medium text-emerald-600">
                {formatCurrencyShort(energizedValue)}
              </span>
            </div>
          </div>
        </div>

        {/* Optional metadata */}
        <div className="mb-8">
          <button
            onClick={() => setShowOptional(!showOptional)}
            className="flex items-center gap-2 text-xs font-semibold text-[#7A756E] hover:text-[#201F1E] transition mb-3"
          >
            <motion.span animate={{ rotate: showOptional ? 90 : 0 }} className="text-[10px]">
              ▶
            </motion.span>
            Optional Metadata
          </button>

          <AnimatePresence initial={false}>
            {showOptional && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3">
                  <Field label="Coordinates" hint="Latitude, Longitude">
                    <input
                      type="text"
                      className={inputClass}
                      value={inputs.coordinates}
                      onChange={(e) => set('coordinates', e.target.value)}
                      placeholder="41.1400, -104.8200"
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
                  <Field label="Parcel ID">
                    <input
                      type="text"
                      className={inputClass}
                      value={inputs.parcelId}
                      onChange={(e) => set('parcelId', e.target.value)}
                      placeholder="00014006623014"
                    />
                  </Field>
                  <Field label="TSP">
                    <input
                      type="text"
                      className={inputClass}
                      value={inputs.tsp}
                      onChange={(e) => set('tsp', e.target.value)}
                      placeholder="e.g. Western Area Power"
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Present button */}
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] py-3.5 text-sm font-bold transition active:scale-[0.98]"
        >
          Present
        </button>
      </div>
    </motion.div>
  );
}
