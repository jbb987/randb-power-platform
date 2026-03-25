import { useState } from 'react';
import type { SiteInputs, AppraisalResult } from '../../types';
import { formatCurrencyShort } from '../../utils/format';
import { useInfraLookup } from '../../hooks/useInfraLookup';
import PresentationView from '../PresentationView';
import SiteMapCard from './SiteMapCard';
import SolarResourceWidget from './SolarResourceWidget';
import ElectricityPriceWidget from './ElectricityPriceWidget';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const readOnlyClass =
  'rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]';

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] pb-2';
const tdClass = 'py-1.5 text-sm text-[#201F1E]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

function TerritoryField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const parts = value ? value.split(' / ').filter(Boolean) : [];
  const hasMultiple = parts.length > 1;

  return (
    <Field label={label}>
      <input
        type="text"
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hasMultiple && (
        <div className="flex flex-wrap gap-1 mt-1">
          {parts.map((p, i) => (
            <span key={i} className="inline-block rounded-full bg-[#F5F4F2] border border-[#D8D5D0] px-2 py-0.5 text-[10px] text-[#201F1E]">
              {p.trim()}
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 font-heading text-xs font-semibold text-[#201F1E] uppercase tracking-wider hover:text-[#ED202B] transition"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        {title} {count > 0 && <span className="text-[10px] font-normal text-[#7A756E]">({count})</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function SiteDetailPanel({ inputs, result, onMWChange, onInputsChange }: Props) {
  const { loading: infraLoading, error: infraError, lookup: infraLookup } = useInfraLookup();
  const [hasRunAnalysis, setHasRunAnalysis] = useState(inputs.lastAnalyzedAt != null);

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    onInputsChange({ ...inputs, [key]: value });
  }

  async function handleInfraLookup() {
    const res = await infraLookup({
      coordinates: inputs.coordinates,
      address: inputs.address,
    });
    if (res) {
      setHasRunAnalysis(true);
      onInputsChange({
        ...inputs,
        lastAnalyzedAt: Date.now(),
        iso: res.iso.length > 0 ? res.iso.join(' / ') : 'Not Available',
        utilityTerritory: res.utilityTerritory.length > 0 ? res.utilityTerritory.join(' / ') : 'Not Available',
        tsp: res.tsp.length > 0 ? res.tsp.join(' / ') : 'Not Available',
        nearestPoiName: res.nearestPoiName,
        nearestPoiDistMi: res.nearestPoiDistMi,
        nearbySubstations: res.nearbySubstations,
        nearbyLines: res.nearbyLines,
        nearbyPowerPlants: res.nearbyPowerPlants,
        floodZone: res.floodZone,
        solarWind: res.solarWind ?? inputs.solarWind,
        electricityPrice: res.electricityPrice ?? inputs.electricityPrice,
        detectedState: res.detectedState ?? inputs.detectedState,
      });
    }
  }

  function num(key: keyof SiteInputs, raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n)) set(key, n);
    if (raw === '') set(key, 0);
  }

  const hasAnalysisData =
    hasRunAnalysis ||
    inputs.nearbySubstations?.length > 0 ||
    inputs.nearbyLines?.length > 0 ||
    inputs.nearbyPowerPlants?.length > 0 ||
    inputs.floodZone != null ||
    inputs.solarWind != null;

  return (
    <div className="space-y-6 max-w-4xl">
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

      {/* Power Infrastructure */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-heading text-base font-semibold text-[#201F1E]">
              Power Infrastructure
            </h3>
            {inputs.lastAnalyzedAt && (
              <p className="text-[10px] text-[#7A756E] mt-0.5">
                Last analyzed {new Date(inputs.lastAnalyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleInfraLookup}
            disabled={infraLoading || (!inputs.address && !inputs.coordinates)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {infraLoading ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </div>

        {infraError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {infraError}
          </div>
        )}

        {/* Territory fields (editable — shows tags when multiple values) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <TerritoryField label="RTO / ISO" value={inputs.iso} onChange={(v) => set('iso', v)} placeholder="e.g. WECC, SPP, ERCOT" />
          <TerritoryField label="Utility Territory" value={inputs.utilityTerritory} onChange={(v) => set('utilityTerritory', v)} placeholder="e.g. PacifiCorp" />
          <TerritoryField label="Transmission Service Provider" value={inputs.tsp} onChange={(v) => set('tsp', v)} placeholder="e.g. Western Area Power" />
        </div>

        {/* Nearest POI */}
        {(inputs.nearestPoiName || hasRunAnalysis) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <Field label="Nearest Point of Interconnection">
              <div className={readOnlyClass}>{inputs.nearestPoiName || 'Not Available'}</div>
            </Field>
            <Field label="Distance to POI">
              <div className={readOnlyClass}>{inputs.nearestPoiDistMi > 0 ? `${inputs.nearestPoiDistMi.toFixed(1)} mi` : '—'}</div>
            </Field>
          </div>
        )}

        {/* ── Analysis results (shown after Analyze) ── */}
        {hasAnalysisData && (
          <>
            {/* Nearby Substations */}
            {inputs.nearbySubstations?.length === 0 && hasRunAnalysis && (
              <CollapsibleSection title="Nearby Substations" count={0}>
                <p className="text-sm text-[#7A756E] italic">Not Available — no substations found within the search radius.</p>
              </CollapsibleSection>
            )}
            {inputs.nearbySubstations?.length > 0 && (
              <CollapsibleSection title="Nearby Substations" count={inputs.nearbySubstations.length}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-[#D8D5D0]">
                        <th className={thClass}>Name</th>
                        <th className={thClass}>Owner</th>
                        <th className={thClass}>Voltage (kV)</th>
                        <th className={thClass}>Lines</th>
                        <th className={thClass}>Status</th>
                        <th className={`${thClass} text-right`}>Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.nearbySubstations.map((sub, i) => (
                        <tr key={i} className="border-b border-[#D8D5D0]/50">
                          <td className={`${tdClass} font-medium`}>{sub.name || '—'}</td>
                          <td className={tdClass}>{sub.owner || '—'}</td>
                          <td className={tdClass}>
                            {sub.minVolt > 0 && sub.maxVolt > 0
                              ? `${sub.minVolt}–${sub.maxVolt}`
                              : sub.maxVolt > 0
                                ? String(sub.maxVolt)
                                : '—'}
                          </td>
                          <td className={tdClass}>{sub.lines || '—'}</td>
                          <td className={tdClass}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              sub.status === 'IN SERVICE'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {sub.status || '—'}
                            </span>
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>{sub.distanceMi > 0 ? `${sub.distanceMi.toFixed(1)} mi` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {/* Nearby Transmission Lines */}
            {inputs.nearbyLines?.length === 0 && hasRunAnalysis && (
              <CollapsibleSection title="Nearby Transmission Lines" count={0}>
                <p className="text-sm text-[#7A756E] italic">Not Available — no transmission lines found within the search radius.</p>
              </CollapsibleSection>
            )}
            {inputs.nearbyLines?.length > 0 && (
              <CollapsibleSection title="Nearby Transmission Lines" count={inputs.nearbyLines.length}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-[#D8D5D0]">
                        <th className={thClass}>Owner</th>
                        <th className={thClass}>Voltage (kV)</th>
                        <th className={thClass}>Class</th>
                        <th className={thClass}>From</th>
                        <th className={thClass}>To</th>
                        <th className={thClass}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.nearbyLines.map((line, i) => (
                        <tr key={i} className="border-b border-[#D8D5D0]/50">
                          <td className={`${tdClass} font-medium`}>{line.owner || '—'}</td>
                          <td className={`${tdClass} tabular-nums`}>{line.voltage > 0 ? line.voltage : '—'}</td>
                          <td className={tdClass}>{line.voltClass || '—'}</td>
                          <td className={tdClass}>{line.sub1 || '—'}</td>
                          <td className={tdClass}>{line.sub2 || '—'}</td>
                          <td className={tdClass}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              line.status === 'IN SERVICE'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {line.status || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {/* Nearby Power Plants */}
            {inputs.nearbyPowerPlants?.length === 0 && hasRunAnalysis && (
              <CollapsibleSection title="Nearby Power Plants" count={0}>
                <p className="text-sm text-[#7A756E] italic">Not Available — no power plants found within the search radius.</p>
              </CollapsibleSection>
            )}
            {inputs.nearbyPowerPlants?.length > 0 && (
              <CollapsibleSection title="Nearby Power Plants" count={inputs.nearbyPowerPlants.length}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-[#D8D5D0]">
                        <th className={thClass}>Name</th>
                        <th className={thClass}>Operator</th>
                        <th className={thClass}>Source</th>
                        <th className={thClass}>Capacity</th>
                        <th className={thClass}>Status</th>
                        <th className={`${thClass} text-right`}>Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.nearbyPowerPlants.map((plant, i) => (
                        <tr key={i} className="border-b border-[#D8D5D0]/50">
                          <td className={`${tdClass} font-medium`}>{plant.name || '—'}</td>
                          <td className={tdClass}>{plant.operator || '—'}</td>
                          <td className={tdClass}>{plant.primarySource || '—'}</td>
                          <td className={`${tdClass} tabular-nums`}>
                            {plant.capacityMW > 0 ? `${plant.capacityMW} MW` : '—'}
                          </td>
                          <td className={tdClass}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              plant.status === 'OP'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {plant.status || '—'}
                            </span>
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>{plant.distanceMi > 0 ? `${plant.distanceMi.toFixed(1)} mi` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {/* Flood Zone */}
            {inputs.floodZone && (
              <div className="mt-6">
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
                  FEMA Flood Zone
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">Zone</span>
                    <span className={`text-sm font-medium ${
                      inputs.floodZone.zone === 'X' || inputs.floodZone.zone === 'C'
                        ? 'text-green-700'
                        : inputs.floodZone.zone === 'D'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}>
                      {inputs.floodZone.zone}
                      {inputs.floodZone.zone === 'X' && ' (Minimal risk)'}
                      {inputs.floodZone.zone === 'A' && ' (High risk)'}
                      {inputs.floodZone.zone === 'AE' && ' (High risk)'}
                      {inputs.floodZone.zone === 'D' && ' (Undetermined)'}
                    </span>
                  </div>
                  {inputs.floodZone.floodwayType && inputs.floodZone.floodwayType !== 'None' && (
                    <div className="flex justify-between">
                      <span className="text-xs text-[#7A756E]">Floodway</span>
                      <span className="text-sm text-[#201F1E]">{inputs.floodZone.floodwayType}</span>
                    </div>
                  )}
                  {inputs.floodZone.panelNumber && (
                    <div className="flex justify-between">
                      <span className="text-xs text-[#7A756E]">DFIRM Panel</span>
                      <span className="text-sm text-[#201F1E]">{inputs.floodZone.panelNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Solar Resource Comparison Widget */}
            {(inputs.solarWind || infraLoading) && (
              <div className="mt-6">
                <SolarResourceWidget
                  solarWind={inputs.solarWind}
                  detectedState={inputs.detectedState ?? null}
                  loading={infraLoading}
                />
              </div>
            )}

            {/* Electricity Price Comparison Widget */}
            {(inputs.detectedState || infraLoading) && (
              <div className="mt-6">
                <ElectricityPriceWidget
                  electricityPrice={inputs.electricityPrice ?? null}
                  detectedState={inputs.detectedState ?? null}
                  loading={infraLoading}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
