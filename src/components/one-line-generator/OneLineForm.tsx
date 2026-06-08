import type { OneLineSpec } from '../../lib/oneLine';
import type { SiteRegistryEntry } from '../../types';

/** Utilities offered in the picker. Add more as the platform expands. */
export const UTILITIES = ['Oncor'] as const;

interface Props {
  spec: OneLineSpec;
  onChange: (patch: Partial<OneLineSpec>) => void;
  /** Optional Site Analyzer sites to seed the spec from. */
  sites?: SiteRegistryEntry[];
  onPickSite?: (site: SiteRegistryEntry) => void;
  /** Currently-selected prefill site id, so the dropdown shows the choice. */
  selectedSiteId?: string;
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition';
const labelCls = 'block text-xs font-medium text-[#7A756E] mb-1';

function num(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function OneLineForm({
  spec,
  onChange,
  sites,
  onPickSite,
  selectedSiteId,
}: Props) {
  const Text = (key: keyof OneLineSpec, label: string, placeholder = '') => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        className={inputCls}
        value={(spec[key] as string | undefined) ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<OneLineSpec>)}
      />
    </div>
  );

  const Num = (key: keyof OneLineSpec, label: string, placeholder = '') => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        className={inputCls}
        value={(spec[key] as number | undefined) ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange({ [key]: num(e.target.value) } as Partial<OneLineSpec>)}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {sites && sites.length > 0 && onPickSite && (
        <div>
          <label className={labelCls}>Prefill from an analyzed site (optional)</label>
          <select
            className={inputCls}
            value={selectedSiteId ?? ''}
            onChange={(e) => {
              const s = sites.find((x) => x.id === e.target.value);
              if (s) onPickSite(s);
            }}
          >
            <option value="">— choose a Site Analyzer site —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.mwCapacity ? `· ${s.mwCapacity} MW` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Text('projectName', 'Project / title', 'NTSM Airport Quarry — McKinney, TX')}
        {Text('location', 'Location', 'McKinney, TX 75070')}
        {Text('customer', 'Customer', 'NTNSM, LLC')}
        {Text('drawingNo', 'Drawing no.', 'RB-AQ-E-001')}
        <div>
          <label className={labelCls}>Utility</label>
          <select
            className={inputCls}
            value={spec.utility ?? 'Oncor'}
            onChange={(e) => onChange({ utility: e.target.value })}
          >
            {UTILITIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        {Num('ultimateMW', 'Ultimate MW', '175')}
        {Num('phase1MW', 'Phase-1 MW', '100')}
        {Num('phase1Year', 'Phase-1 year', '2027')}
        {Num('phase2Year', 'Phase-2 year', '2028')}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className={labelCls}>Feed</label>
          <select
            className={inputCls}
            value={spec.feeds ?? 'dual'}
            onChange={(e) => onChange({ feeds: e.target.value as 'single' | 'dual' })}
          >
            <option value="dual">Dual (two-way)</option>
            <option value="single">Single</option>
          </select>
        </div>
        {Num('mvaPerXfmr', 'MVA / unit (auto)', 'auto')}
        {Num('powerFactor', 'Power factor', '0.97')}
        {Text('conductor', 'Conductor (auto)', '1192.5 kcmil ACSR')}
      </div>
    </div>
  );
}
