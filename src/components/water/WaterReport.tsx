import type {
  WaterAnalysisResult,
  FloodRiskLevel,
  DroughtLevel,
} from '../../lib/waterAnalysis.types';

// ── Risk badge helpers ────────────────────────────────────────────────────────

const RISK_COLORS: Record<FloodRiskLevel, string> = {
  minimal: 'bg-green-50 text-green-700 border border-green-200',
  moderate: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border border-orange-200',
  'very-high': 'bg-red-50 text-red-700 border border-red-200',
  unknown: 'bg-stone-50 text-stone-600 border border-stone-200',
};

const RISK_DOTS: Record<FloodRiskLevel, string> = {
  minimal: 'bg-green-500',
  moderate: 'bg-yellow-500',
  high: 'bg-orange-500',
  'very-high': 'bg-red-600',
  unknown: 'bg-stone-400',
};

const RISK_LABELS: Record<FloodRiskLevel, string> = {
  minimal: 'MINIMAL RISK',
  moderate: 'MODERATE RISK',
  high: 'HIGH RISK',
  'very-high': 'VERY HIGH RISK',
  unknown: 'UNDETERMINED',
};

function RiskBadge({ level }: { level: FloodRiskLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_COLORS[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOTS[level]}`} />
      {RISK_LABELS[level]}
    </span>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      VERIFIED
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-50 text-stone-500 border border-stone-200">
      NOT AVAILABLE
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  badge,
  error,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#D8D5D0]">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] flex-1">{title}</h3>
        {badge}
      </div>
      <div className="px-5 py-4">
        {error ? (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            {error.includes('https://') ? (
              <>
                {error.split('https://')[0]}
                <a
                  href={`https://${error.split('https://')[1]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-[#ED202B] hover:text-[#9B0E18]"
                >
                  {`https://${error.split('https://')[1]}`}
                </a>
              </>
            ) : error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#F5F4F2] last:border-0">
      <span className="text-xs text-[#7A756E] flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-xs font-medium text-[#201F1E] text-right">{value}</span>
    </div>
  );
}

// ── Drought badge ─────────────────────────────────────────────────────────────

const DROUGHT_COLORS: Record<DroughtLevel, string> = {
  none: 'bg-green-50 text-green-700 border border-green-200',
  D0: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  D1: 'bg-orange-50 text-orange-700 border border-orange-200',
  D2: 'bg-red-50 text-red-700 border border-red-200',
  D3: 'bg-red-100 text-red-800 border border-red-300',
  D4: 'bg-stone-800 text-stone-100 border border-stone-900',
};

const DROUGHT_DOTS: Record<DroughtLevel, string> = {
  none: 'bg-green-500',
  D0: 'bg-yellow-500',
  D1: 'bg-orange-500',
  D2: 'bg-red-500',
  D3: 'bg-red-700',
  D4: 'bg-stone-500',
};

function DroughtBadge({ level, label }: { level: DroughtLevel; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${DROUGHT_COLORS[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DROUGHT_DOTS[level]}`} />
      {label}
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FloodIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 6v6m0 0v.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75c.94.31 2.25.75 3.75.75 3 0 3-1.5 6-1.5s3 1.5 6 1.5c1.5 0 2.81-.44 3.75-.75" />
    </svg>
  );
}

function StreamIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
    </svg>
  );
}

function WetlandIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.707.707m12.02 12.02.707.707M3 12H2m20 0h-1M12 8a4 4 0 100 8 4 4 0 000-8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 19c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3-2 4.5 0" />
    </svg>
  );
}

function WellIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8h14M7 12h10M9 16h6" />
      <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DroughtIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      <circle cx="12" cy="12" r="4" strokeLinecap="round" />
    </svg>
  );
}

function PermitIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17a5 5 0 014.9-5.98A7 7 0 0119 14a5 5 0 010 10H6a5 5 0 01-3-9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 19v2M12 19v2M16 19v2" />
    </svg>
  );
}

// ── Flood Zone Section ────────────────────────────────────────────────────────

function FloodZoneSection({ result }: { result: WaterAnalysisResult }) {
  const { floodZone, floodZoneError } = result;

  return (
    <Section
      title="FEMA Flood Zone"
      icon={<FloodIcon />}
      badge={
        floodZone
          ? <RiskBadge level={floodZone.riskLevel} />
          : <StatusBadge ok={false} />
      }
      error={floodZoneError}
    >
      {floodZone ? (
        <div>
          <div className="mb-4 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
            <p className="text-xs text-[#7A756E]">{floodZone.description}</p>
          </div>
          <Row label="Flood Zone" value={
            <span className="font-mono font-bold text-[#201F1E]">{floodZone.zone}</span>
          } />
          {floodZone.zoneSubtype && (
            <Row label="Subtype" value={floodZone.zoneSubtype} />
          )}
          {floodZone.staticBfe !== null && (
            <Row label="Base Flood Elevation" value={`${floodZone.staticBfe} ft NAVD`} />
          )}
          <Row label="Risk Level" value={<RiskBadge level={floodZone.riskLevel} />} />
          <div className="mt-4">
            <a
              href={`https://msc.fema.gov/portal/search#searchresultsanchor`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
            >
              View on FEMA Flood Map Service Center
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#7A756E]">No flood zone data available for this location.</p>
      )}
    </Section>
  );
}

// ── Stream / Basin Section ────────────────────────────────────────────────────

function StreamSection({ result }: { result: WaterAnalysisResult }) {
  const { stream, streamError } = result;

  return (
    <Section
      title="Stream / Basin Analysis"
      icon={<StreamIcon />}
      badge={<StatusBadge ok={!!stream && stream.navigationStatus === 'found'} />}
      error={streamError}
    >
      {stream ? (
        stream.navigationStatus === 'found' ? (
          <div>
            {stream.streamName && (
              <div className="mb-4 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
                <p className="text-xs font-semibold text-[#201F1E]">{stream.streamName}</p>
                <p className="text-xs text-[#7A756E] mt-0.5">NHD+ Reach — USGS Water Resources</p>
              </div>
            )}
            <Row label="COMID" value={<span className="font-mono text-xs">{stream.comid}</span>} />
            {stream.reachCode && (
              <Row label="Reach Code" value={<span className="font-mono text-xs">{stream.reachCode}</span>} />
            )}
            {stream.streamOrder !== null && (
              <Row label="Stream Order" value={`Order ${stream.streamOrder} (Strahler)`} />
            )}
            {stream.basinAreaKm2 !== null && (
              <Row
                label="Drainage Basin Area"
                value={`${stream.basinAreaKm2.toLocaleString()} km²`}
              />
            )}

            {stream.monitoringStations.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[#201F1E] mb-2">
                  Upstream USGS Monitoring Stations ({stream.monitoringStations.length})
                </p>
                <div className="space-y-1.5">
                  {stream.monitoringStations.map((s) => (
                    <a
                      key={s.identifier}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0] hover:border-[#ED202B]/30 transition group"
                    >
                      <div>
                        <p className="text-xs font-medium text-[#201F1E] group-hover:text-[#ED202B] transition">
                          {s.name || s.identifier}
                        </p>
                        <p className="text-xs text-[#7A756E]">{s.type}</p>
                      </div>
                      <svg className="h-3.5 w-3.5 text-[#7A756E] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[#7A756E]">
            No NHD+ stream reach found at this location. The site may be in an area without mapped stream networks.
          </p>
        )
      ) : (
        <p className="text-xs text-[#7A756E]">No stream data available for this location.</p>
      )}
    </Section>
  );
}

// ── Wetlands Section ──────────────────────────────────────────────────────────

function WetlandsSection({ result }: { result: WaterAnalysisResult }) {
  const { wetlands, wetlandsError } = result;

  const wetlandRisk = wetlands?.hasWetlands
    ? wetlands.nearestWetlandFt != null && wetlands.nearestWetlandFt < 200
      ? 'high'
      : 'moderate'
    : null;

  return (
    <Section
      title="National Wetlands Inventory"
      icon={<WetlandIcon />}
      badge={
        wetlands != null
          ? wetlands.hasWetlands
            ? <RiskBadge level={wetlandRisk ?? 'moderate'} />
            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                NONE FOUND
              </span>
          : <StatusBadge ok={false} />
      }
      error={wetlandsError}
    >
      {wetlands ? (
        wetlands.hasWetlands ? (
          <div>
            <div className="mb-4 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
              <p className="text-xs text-[#7A756E]">
                {wetlands.wetlands.length} wetland feature{wetlands.wetlands.length !== 1 ? 's' : ''} found
                within ~500 ft of the site.
                {wetlands.nearestWetlandFt != null && (
                  <> Nearest is approximately <span className="font-semibold text-[#201F1E]">{wetlands.nearestWetlandFt.toLocaleString()} ft</span> away.</>
                )}
              </p>
            </div>

            <div className="space-y-2">
              {wetlands.wetlands.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#201F1E] truncate">{w.wetlandType}</p>
                    <p className="text-xs text-[#7A756E] font-mono">{w.attribute}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {w.acres !== null && (
                      <p className="text-xs font-medium text-[#201F1E]">{w.acres.toFixed(1)} ac</p>
                    )}
                    {w.distanceFt !== null && (
                      <p className="text-xs text-[#7A756E]">{w.distanceFt.toLocaleString()} ft</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <a
                href={`https://www.fws.gov/program/national-wetlands-inventory/wetlands-mapper`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
              >
                Open NWI Wetlands Mapper
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-green-700">
              No NWI wetland features found within ~500 ft of this location. Verify with a site-level jurisdictional wetland determination for regulatory certainty.
            </p>
          </div>
        )
      ) : (
        <p className="text-xs text-[#7A756E]">No wetlands data available for this location.</p>
      )}
    </Section>
  );
}

// ── Groundwater Monitoring Section ───────────────────────────────────────────

function GroundwaterSection({ result }: { result: WaterAnalysisResult }) {
  const { groundwater, groundwaterError } = result;

  return (
    <Section
      title="USGS Groundwater Monitoring"
      icon={<WellIcon />}
      badge={
        groundwater != null
          ? groundwater.wellCount > 0
            ? <StatusBadge ok={true} />
            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-50 text-stone-500 border border-stone-200">NO WELLS FOUND</span>
          : <StatusBadge ok={false} />
      }
      error={groundwaterError}
    >
      {groundwater ? (
        groundwater.wells.length > 0 ? (
          <div>
            <div className="mb-3 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
              <p className="text-xs text-[#7A756E]">
                {groundwater.wellCount} active groundwater monitoring well{groundwater.wellCount !== 1 ? 's' : ''} within ~35 miles.
                Showing up to {Math.min(groundwater.wells.length, 10)} with recent readings.
              </p>
            </div>
            <div className="space-y-2">
              {groundwater.wells.map((well) => (
                <a
                  key={well.siteNo}
                  href={well.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0] hover:border-[#ED202B]/30 transition group"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#201F1E] truncate group-hover:text-[#ED202B] transition">
                      {well.name || well.siteNo}
                    </p>
                    {well.siteNo && (
                      <p className="text-xs text-[#7A756E] font-mono">{well.siteNo}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {well.depthToWaterFt !== null ? (
                      <>
                        <p className="text-xs font-medium text-[#201F1E]">{well.depthToWaterFt.toFixed(1)} ft</p>
                        <p className="text-xs text-[#7A756E]">below surface</p>
                      </>
                    ) : (
                      <p className="text-xs text-[#7A756E]">No reading</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
            <div className="mt-3">
              <a
                href="https://groundwaterwatch.usgs.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
              >
                USGS Groundwater Watch
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#7A756E]">
            No active USGS groundwater monitoring wells found within ~35 miles of this location.
          </p>
        )
      ) : (
        <p className="text-xs text-[#7A756E]">No groundwater data available for this location.</p>
      )}
    </Section>
  );
}

// ── Drought Risk Section ──────────────────────────────────────────────────────

const DROUGHT_DESCRIPTIONS: Record<DroughtLevel, string> = {
  none: 'No drought conditions are currently present at this location.',
  D0: 'Abnormally dry — short-term dryness slowing planting, growth, or limiting fire season. Some lingering water deficits.',
  D1: 'Moderate drought — some water shortages developing or imminent, voluntary water use restrictions possible.',
  D2: 'Severe drought — water shortages common; water restrictions likely. Significant impacts to agriculture and outdoor water use.',
  D3: 'Extreme drought — major water shortages, crop/pasture losses likely, water emergencies possible.',
  D4: 'Exceptional drought — exceptional and widespread crop/pasture losses; water shortages in reservoirs, streams, and wells.',
};

function DroughtSection({ result }: { result: WaterAnalysisResult }) {
  const { drought, droughtError } = result;

  return (
    <Section
      title="US Drought Monitor"
      icon={<DroughtIcon />}
      badge={
        drought != null
          ? <DroughtBadge level={drought.currentLevel} label={drought.levelLabel} />
          : <StatusBadge ok={false} />
      }
      error={droughtError}
    >
      {drought ? (
        <div>
          <div className="mb-3 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
            <p className="text-xs text-[#7A756E]">{DROUGHT_DESCRIPTIONS[drought.currentLevel]}</p>
          </div>
          <Row label="Current Severity" value={<DroughtBadge level={drought.currentLevel} label={drought.levelLabel} />} />
          {drought.measureDate && (
            <Row label="USDM Release Date" value={drought.measureDate} />
          )}
          <div className="mt-4">
            <a
              href="https://droughtmonitor.unl.edu/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
            >
              US Drought Monitor
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#7A756E]">No drought data available for this location.</p>
      )}
    </Section>
  );
}

// ── Discharge Permits Section ─────────────────────────────────────────────────

function DischargePermitsSection({ result }: { result: WaterAnalysisResult }) {
  const { dischargePermits, dischargePermitsError } = result;

  return (
    <Section
      title="NPDES Discharge Permits (EPA ECHO)"
      icon={<PermitIcon />}
      badge={
        dischargePermits != null
          ? dischargePermits.totalCount > 0
            ? <RiskBadge level="moderate" />
            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                NONE FOUND
              </span>
          : <StatusBadge ok={false} />
      }
      error={dischargePermitsError}
    >
      {dischargePermits ? (
        dischargePermits.totalCount > 0 ? (
          <div>
            <div className="mb-3 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
              <p className="text-xs text-[#7A756E]">
                {dischargePermits.totalCount.toLocaleString()} NPDES CWA permit{dischargePermits.totalCount !== 1 ? 's' : ''} found within {dischargePermits.radiusMi} miles.
                Showing up to {dischargePermits.permits.length}.
              </p>
            </div>
            <div className="space-y-2">
              {dischargePermits.permits.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#201F1E] truncate">{p.facilityName || '(unnamed)'}</p>
                    <p className="text-xs text-[#7A756E]">{[p.city, p.state].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {p.permitNumber && (
                      <p className="text-xs font-medium text-[#201F1E] font-mono">{p.permitNumber}</p>
                    )}
                    {p.permitStatus && (
                      <p className="text-xs text-[#7A756E]">{p.permitStatus}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <a
                href={`https://echo.epa.gov/facilities/facility-search/results?p_lat=${result.lat}&p_long=${result.lng}&p_radius=10&p_act=Y&p_media=Water`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
              >
                View on EPA ECHO
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-green-700">
              No NPDES CWA discharge permits found within {dischargePermits.radiusMi} miles of this location.
            </p>
          </div>
        )
      ) : (
        <p className="text-xs text-[#7A756E]">No discharge permit data available for this location.</p>
      )}
    </Section>
  );
}

// ── Precipitation Section ─────────────────────────────────────────────────────

function precipRiskLevel(inches: number): FloodRiskLevel {
  if (inches > 60) return 'very-high';
  if (inches > 40) return 'high';
  if (inches > 20) return 'moderate';
  return 'minimal';
}

function PrecipitationSection({ result }: { result: WaterAnalysisResult }) {
  const { precipitation, precipitationError } = result;

  return (
    <Section
      title="Historical Precipitation"
      icon={<RainIcon />}
      badge={
        precipitation != null
          ? <RiskBadge level={precipRiskLevel(precipitation.avgAnnualInches)} />
          : <StatusBadge ok={false} />
      }
      error={precipitationError}
    >
      {precipitation ? (
        <div>
          <div className="mb-3 p-3 rounded-lg bg-[#FAFAF9] border border-[#D8D5D0]">
            <p className="text-3xl font-heading font-bold text-[#201F1E]">
              {precipitation.avgAnnualInches}
              <span className="text-sm font-normal text-[#7A756E] ml-1">in / yr</span>
            </p>
            <p className="text-xs text-[#7A756E] mt-0.5">
              Average annual precipitation ({precipitation.dataYearsRange})
            </p>
          </div>
          <Row label="Average Annual" value={`${precipitation.avgAnnualInches} inches`} />
          <Row label="Period" value={precipitation.dataYearsRange} />
          <Row label="Source" value={precipitation.dataSource} />
        </div>
      ) : (
        <p className="text-xs text-[#7A756E]">No precipitation data available for this location.</p>
      )}
    </Section>
  );
}

// ── Main Report ───────────────────────────────────────────────────────────────

export default function WaterReport({ result }: { result: WaterAnalysisResult }) {
  const ts = new Date(result.analyzedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div>
      {/* Metadata header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-[#7A756E]">
            Coordinates: <span className="font-mono font-medium text-[#201F1E]">{result.lat.toFixed(6)}, {result.lng.toFixed(6)}</span>
          </p>
          <p className="text-xs text-[#7A756E] mt-0.5">Analyzed {ts}</p>
        </div>
      </div>

      <div className="space-y-4">
        <FloodZoneSection result={result} />
        <StreamSection result={result} />
        <WetlandsSection result={result} />
        <GroundwaterSection result={result} />
        <DroughtSection result={result} />
        <DischargePermitsSection result={result} />
        <PrecipitationSection result={result} />
      </div>

      <p className="mt-6 text-xs text-[#7A756E] text-center">
        Data sources: FEMA NFHL · USGS NLDI · USFWS NWI · USGS NWIS Groundwater ·
        USDM via ESRI Live Feed · EPA ECHO · NOAA ACIS/PRISM.
        This report is for due diligence purposes only and does not constitute a formal regulatory determination.
      </p>
    </div>
  );
}
