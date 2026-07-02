import { useState } from 'react';
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/powerMapData';
import { lineDeliveryMW } from '../../lib/gridAnalysis';
import { estimateStation, screeningGrab, type GrabBinding } from '../../lib/ringBus';
import type { GeoLocation } from '../../lib/reverseGeocode';
import QueueCard from './QueueCard';

export interface SubstationPopupInfo {
  hifldId?: number;
  name: string;
  owner: string;
  status: string;
  maxVolt: number;
  lineCount: number;
  availableMW: number;
  lng: number;
  lat: number;
}

type TabId = 'now' | 'verify' | 'incoming';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'now', label: 'Now' },
  { id: 'verify', label: 'Verify' },
  { id: 'incoming', label: 'Incoming' },
];

const BINDING_COPY: Record<GrabBinding, string> = {
  station: 'Station iron is the cap — building unlocks more.',
  area: "Area supply is the cap — more equipment won't help here.",
  lines: 'The tie lines are the cap — a new or upgraded line unlocks more.',
  aligned: 'All three methods agree — higher confidence in this range.',
};

const fmtRange = (low: number, high: number) =>
  low === high ? low.toLocaleString() : `${low.toLocaleString()}–${high.toLocaleString()}`;

const isPlaceholderName = (name: string) =>
  /^UNKNOWN\d+$/i.test(name) || name.toUpperCase() === 'NOT AVAILABLE';

function Row({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-[#7A756E]" title={title}>
        {label}
      </span>
      <span className="font-medium text-[#201F1E] text-right">{value}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-snug text-[#7A756E]">{children}</p>;
}

function AerialLinks({ lat, lng }: { lat: number; lng: number }) {
  const links = [
    { label: 'Google Maps', href: `https://www.google.com/maps/@${lat},${lng},19z/data=!3m1!1e3` },
    {
      label: 'Google Earth',
      href: `https://earth.google.com/web/@${lat},${lng},500a,500d,35y,0h,0t,0r`,
    },
    { label: 'Bing 3D', href: `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=20&style=o` },
  ];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Aerial view</div>
      <div className="flex gap-3 text-xs">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ED202B] hover:underline"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function CountInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <label htmlFor={id} className="text-[#7A756E]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={40}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-14 rounded-md border border-[#D8D5D0] px-1.5 py-0.5 text-right text-xs text-[#201F1E] focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none"
      />
    </div>
  );
}

/**
 * Tabbed substation popup: Now (the results — area availability + the
 * grabbable minimum), Verify (aerial links + Bailey's field counts + the
 * ring-bus derivation), Incoming (generation coming online via the queue).
 * Count state lives here so numbers entered in Verify feed Now instantly.
 */
export default function SubstationPopupCard({
  sub,
  geo,
}: {
  sub: SubstationPopupInfo;
  geo: GeoLocation | null;
}) {
  const [tab, setTab] = useState<TabId>('now');
  const [breakersRaw, setBreakersRaw] = useState('');
  const [xfmrRaw, setXfmrRaw] = useState('');

  const active = sub.status === 'active';
  const kV = sub.maxVolt || 0;
  const breakers = Number.parseInt(breakersRaw, 10);
  const transformersSeen = Number.parseInt(xfmrRaw, 10);
  const estimate = estimateStation({
    breakers: Number.isFinite(breakers) ? breakers : undefined,
    transformersSeen: Number.isFinite(transformersSeen) ? transformersSeen : undefined,
    lines: sub.lineCount,
    maxVoltKV: kV,
  });
  const lineMW = kV > 0 ? lineDeliveryMW(kV, sub.lineCount) : 0;
  const grab = estimate && active ? screeningGrab(estimate, sub.availableMW, lineMW) : null;

  const availColor =
    sub.availableMW >= 200 ? '#3B82F6' : sub.availableMW > 0 ? '#F97316' : '#EF4444';
  const availLabel =
    sub.availableMW <= 0 ? 'No capacity' : `${sub.availableMW.toLocaleString()} MW`;

  return (
    <div className="p-2 min-w-[240px] max-w-[280px]">
      {/* ── Header ── */}
      <h4 className="font-heading font-semibold text-sm text-[#201F1E]">
        {isPlaceholderName(sub.name) ? `Unnamed ${kV ? `${kV} kV ` : ''}substation` : sub.name}
      </h4>
      <div className="text-xs text-[#7A756E] mt-0.5">
        {kV ? `${kV.toLocaleString()} kV` : 'kV N/A'} · {sub.lineCount} line
        {sub.lineCount === 1 ? '' : 's'} ·{' '}
        <span
          className="font-semibold"
          style={{
            color: STATUS_COLORS[sub.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.active,
          }}
        >
          {STATUS_LABELS[sub.status] ?? 'In Service'}
        </span>
      </div>
      {(geo?.county || geo?.city) && (
        <div className="text-xs text-[#7A756E] truncate">
          {[geo?.county, geo?.city ? `near ${geo.city}` : null].filter(Boolean).join(' · ')}
        </div>
      )}
      {sub.owner && !isPlaceholderName(sub.owner) && (
        <div className="text-xs text-[#7A756E] truncate" title="Owner (HIFLD) — who to call">
          Owner: <span className="text-[#201F1E]">{sub.owner}</span>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mt-2 border-b border-[#D8D5D0]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2 py-1 text-xs font-medium -mb-px border-b-2 ${
              tab === t.id
                ? 'border-[#ED202B] text-[#ED202B]'
                : 'border-transparent text-[#7A756E] hover:text-[#201F1E]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-2 space-y-1.5">
        {/* ── Tab: Now ── */}
        {tab === 'now' &&
          (active ? (
            <>
              <Row
                label="Available in the area"
                title="Existing capacity headroom from current generation/demand (model). Excludes queued projects."
                value={
                  <span className="font-semibold" style={{ color: availColor }}>
                    {availLabel}
                  </span>
                }
              />
              {grab ? (
                <>
                  <div className="flex justify-between gap-2 text-xs pt-1 mt-0.5 border-t border-dashed border-[#D8D5D0]">
                    <span className="text-[#7A756E]">You can grab (screening)</span>
                    <span className="font-semibold text-[#ED202B]">
                      ~{fmtRange(grab.grabMW.low, grab.grabMW.high)} MW
                    </span>
                  </div>
                  <Note>{BINDING_COPY[grab.binding]}</Note>
                  <Note>
                    caps — station {fmtRange(grab.stationMW.low, grab.stationMW.high)} · area{' '}
                    {Math.max(0, sub.availableMW).toLocaleString()} · lines ~
                    {lineMW.toLocaleString()} MW
                  </Note>
                </>
              ) : estimate && estimate.transformers === 0 ? (
                <Note>
                  Switching station per your count — no transformers to take service from. Still a
                  possible tap point for a build.
                </Note>
              ) : (
                <>
                  <div className="flex justify-between gap-2 text-xs pt-1 mt-0.5 border-t border-dashed border-[#D8D5D0]">
                    <span className="text-[#7A756E]">You can grab (screening)</span>
                    <span className="font-semibold text-[#ED202B]">
                      ~{Math.min(Math.max(0, sub.availableMW), lineMW).toLocaleString()} MW
                    </span>
                  </div>
                  <Note>
                    Area and line caps only — not verified against the yard. Count the station in
                    the Verify tab to firm this up.
                  </Note>
                </>
              )}
            </>
          ) : (
            <Note>
              This substation is {STATUS_LABELS[sub.status] ?? sub.status} — capacity figures apply
              to in-service stations only.
            </Note>
          ))}

        {/* ── Tab: Verify ── */}
        {tab === 'verify' && (
          <>
            <AerialLinks lat={sub.lat} lng={sub.lng} />
            <CountInput
              id="ring-bus-breakers"
              label="Breakers counted"
              value={breakersRaw}
              onChange={setBreakersRaw}
            />
            <CountInput
              id="ring-bus-xfmrs"
              label="Transformers seen (optional)"
              value={xfmrRaw}
              onChange={setXfmrRaw}
            />
            {estimate ? (
              <>
                <div className="pt-1 mt-0.5 border-t border-dashed border-[#D8D5D0] space-y-1">
                  <Row
                    label="Transformers"
                    value={
                      <>
                        {estimate.transformers}
                        {estimate.transformers > 0 && (
                          <span className="text-[#7A756E] font-normal">
                            {' '}
                            × {estimate.mvaPerXfmr.low}–{estimate.mvaPerXfmr.high} MVA
                          </span>
                        )}
                        {estimate.source === 'transformers' && (
                          <span className="text-[#7A756E] font-normal"> (seen)</span>
                        )}
                      </>
                    }
                  />
                  {estimate.transformers > 0 && (
                    <>
                      <Row
                        label="Station max"
                        value={`${fmtRange(estimate.capacityMVA.low, estimate.capacityMVA.high)} MVA`}
                      />
                      <Row
                        label="Firm (N-1, utility view)"
                        title="Utilities keep one transformer in reserve; firm service is what remains with the largest unit out."
                        value={
                          estimate.firmMVA
                            ? `${fmtRange(estimate.firmMVA.low, estimate.firmMVA.high)} MVA`
                            : '— (no backup unit)'
                        }
                      />
                    </>
                  )}
                </div>
                {estimate.caveats.map((c) => (
                  <Note key={c}>{c}</Note>
                ))}
              </>
            ) : (
              <Note>
                On a ring bus, breakers = lines + transformers — so transformers ≈ breakers −{' '}
                {sub.lineCount} known line{sub.lineCount === 1 ? '' : 's'}. If the transformers are
                visible (big tanks with cooling fins by the control house), count them directly
                instead.
              </Note>
            )}
          </>
        )}

        {/* ── Tab: Incoming ── */}
        {tab === 'incoming' && <QueueCard hifldId={sub.hifldId} bare />}
      </div>
    </div>
  );
}
