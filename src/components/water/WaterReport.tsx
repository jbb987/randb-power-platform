import type {
  WaterAnalysisResult,
  FloodRiskLevel,
  DroughtLevel,
} from '../../lib/waterAnalysis.types';

// ── Badges & Colors ──────────────────────────────────────────────────────────

const RISK_STYLES: Record<FloodRiskLevel, string> = {
  minimal:     'bg-green-100 text-green-800',
  moderate:    'bg-amber-100 text-amber-800',
  high:        'bg-orange-100 text-orange-800',
  'very-high': 'bg-red-100 text-red-800',
  unknown:     'bg-stone-100 text-stone-600',
};

const RISK_LABELS: Record<FloodRiskLevel, string> = {
  minimal: 'Minimal',
  moderate: 'Moderate',
  high: 'High',
  'very-high': 'Very High',
  unknown: 'N/A',
};

const RISK_VALUE_COLORS: Record<FloodRiskLevel, string> = {
  minimal:     'text-green-600',
  moderate:    'text-amber-600',
  high:        'text-orange-600',
  'very-high': 'text-red-600',
  unknown:     'text-[#7A756E]',
};

const DROUGHT_STYLES: Record<DroughtLevel, string> = {
  none: 'bg-green-100 text-green-800',
  D0:   'bg-amber-100 text-amber-800',
  D1:   'bg-orange-100 text-orange-800',
  D2:   'bg-red-100 text-red-800',
  D3:   'bg-red-200 text-red-900',
  D4:   'bg-stone-800 text-stone-100',
};

const DROUGHT_DESCRIPTIONS: Record<DroughtLevel, string> = {
  none: 'No drought conditions present.',
  D0: 'Abnormally dry — short-term dryness slowing planting or growth.',
  D1: 'Moderate drought — some water shortages developing.',
  D2: 'Severe drought — water shortages common, restrictions likely.',
  D3: 'Extreme drought — major water shortages, crop losses likely.',
  D4: 'Exceptional drought — widespread losses, water emergencies.',
};

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

function precipRiskLevel(inches: number): FloodRiskLevel {
  if (inches > 60) return 'very-high';
  if (inches > 40) return 'high';
  if (inches > 20) return 'moderate';
  return 'minimal';
}

// ── Shared components ────────────────────────────────────────────────────────

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-base font-heading font-semibold mt-1 ${accent || 'text-[#201F1E]'}`}>{value}</p>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E]">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#D8D5D0]/40 last:border-0">
      <span className="text-xs text-[#7A756E]">{label}</span>
      <span className="text-sm font-medium text-[#201F1E]">{value}</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      {message}
    </div>
  );
}

// ── Main Report ──────────────────────────────────────────────────────────────

export default function WaterReport({ result }: { result: WaterAnalysisResult }) {
  const { floodZone, stream, wetlands, groundwater, drought, dischargePermits, precipitation } = result;

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat
            label="Flood Risk"
            value={floodZone ? RISK_LABELS[floodZone.riskLevel] : 'N/A'}
            accent={floodZone ? RISK_VALUE_COLORS[floodZone.riskLevel] : undefined}
          />
          <MiniStat
            label="Wetlands"
            value={wetlands ? wetlands.hasWetlands ? `${wetlands.wetlands.length} Found` : 'None' : 'N/A'}
            accent={wetlands?.hasWetlands ? 'text-amber-600' : 'text-green-600'}
          />
          <MiniStat
            label="Drought"
            value={drought ? drought.levelLabel : 'N/A'}
            accent={drought ? (drought.currentLevel === 'none' ? 'text-green-600' : 'text-amber-600') : undefined}
          />
          <MiniStat
            label="Precipitation"
            value={precipitation ? `${precipitation.avgAnnualInches} in/yr` : 'N/A'}
          />
        </div>
      </div>

      {/* Flood Zone */}
      <Card
        title="Flood Zone"
        badge={floodZone ? <Badge label={`Zone ${floodZone.zone}`} style={RISK_STYLES[floodZone.riskLevel]} /> : undefined}
      >
        {result.floodZoneError ? (
          <ErrorState message={result.floodZoneError} />
        ) : floodZone ? (
          floodZone.zone === 'UNMAPPED' ? (
            <p className="text-sm text-[#7A756E]">This area is not mapped by FEMA. No flood zone determination available.</p>
          ) : (
            <div>
              <p className="text-xs text-[#7A756E] mb-3">{floodZone.description}</p>
              <Row label="Zone" value={<span className="font-mono font-bold">{floodZone.zone}</span>} />
              {floodZone.zoneSubtype && <Row label="Subtype" value={floodZone.zoneSubtype} />}
              {floodZone.staticBfe !== null && <Row label="Base Flood Elevation" value={`${floodZone.staticBfe} ft NAVD`} />}
            </div>
          )
        ) : (
          <p className="text-sm text-[#7A756E]">No flood zone data available.</p>
        )}
      </Card>

      {/* Stream / Basin */}
      <Card
        title="Stream / Basin"
        badge={stream?.navigationStatus === 'found'
          ? <Badge label="Verified" style="bg-green-100 text-green-800" />
          : undefined}
      >
        {result.streamError ? (
          <ErrorState message={result.streamError} />
        ) : stream?.navigationStatus === 'found' ? (
          <div>
            {stream.streamName && <Row label="Stream" value={<span className="font-semibold">{stream.streamName}</span>} />}
            <Row label="COMID" value={<span className="font-mono text-xs">{stream.comid}</span>} />
            {stream.reachCode && <Row label="Reach Code" value={<span className="font-mono text-xs">{stream.reachCode}</span>} />}
            {stream.streamOrder !== null && <Row label="Stream Order" value={`Order ${stream.streamOrder} (Strahler)`} />}
            {stream.basinAreaKm2 !== null && <Row label="Drainage Basin" value={`${stream.basinAreaKm2.toLocaleString()} km²`} />}

            {stream.monitoringStations.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#D8D5D0]/60">
                <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium mb-2">
                  Upstream Monitoring Stations ({stream.monitoringStations.length})
                </p>
                {stream.monitoringStations.map((s) => (
                  <div key={s.identifier} className="flex items-center justify-between py-1.5 border-b border-[#D8D5D0]/30 last:border-0">
                    <span className="text-sm text-[#201F1E]">{s.name || s.identifier}</span>
                    <span className="text-xs text-[#7A756E]">{s.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#7A756E]">No stream reach found at this location.</p>
        )}
      </Card>

      {/* Wetlands */}
      <Card
        title="Wetlands"
        badge={wetlands != null
          ? wetlands.hasWetlands
            ? <Badge label={`${wetlands.wetlands.length} Found`} style="bg-amber-100 text-amber-800" />
            : <Badge label="None Found" style="bg-green-100 text-green-800" />
          : undefined}
      >
        {result.wetlandsError ? (
          <ErrorState message={result.wetlandsError} />
        ) : wetlands ? (
          wetlands.hasWetlands ? (
            <div>
              <p className="text-xs text-[#7A756E] mb-3">
                {wetlands.wetlands.length} wetland feature{wetlands.wetlands.length !== 1 ? 's' : ''} within ~500 ft.
                {wetlands.nearestWetlandFt != null && ` Nearest: ${wetlands.nearestWetlandFt.toLocaleString()} ft.`}
              </p>
              {wetlands.wetlands.map((w, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#D8D5D0]/40 last:border-0">
                  <div>
                    <span className="text-sm text-[#201F1E]">{w.wetlandType}</span>
                    <span className="text-xs text-[#7A756E] font-mono ml-2">{w.attribute}</span>
                  </div>
                  <div className="text-right text-xs text-[#7A756E] tabular-nums flex gap-3">
                    {w.acres !== null && <span>{w.acres.toFixed(1)} ac</span>}
                    {w.distanceFt !== null && <span>{w.distanceFt.toLocaleString()} ft</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#7A756E]">No wetland features found within ~500 ft.</p>
          )
        ) : (
          <p className="text-sm text-[#7A756E]">Wetlands data unavailable.</p>
        )}
      </Card>

      {/* Groundwater */}
      <Card
        title="Groundwater Monitoring"
        badge={groundwater != null
          ? groundwater.wellCount > 0
            ? <Badge label={`${groundwater.wellCount} Wells`} style="bg-green-100 text-green-800" />
            : <Badge label="No Wells" style="bg-stone-100 text-stone-600" />
          : undefined}
      >
        {result.groundwaterError ? (
          <ErrorState message={result.groundwaterError} />
        ) : groundwater?.wells.length ? (
          <div>
            <p className="text-xs text-[#7A756E] mb-3">
              {groundwater.wellCount} monitoring well{groundwater.wellCount !== 1 ? 's' : ''} within ~35 miles.
            </p>
            {groundwater.wells.map((well) => (
              <div key={well.siteNo} className="flex items-center justify-between py-2 border-b border-[#D8D5D0]/40 last:border-0">
                <div>
                  <span className="text-sm text-[#201F1E]">{well.name || well.siteNo}</span>
                  {well.siteNo && well.name && <span className="text-xs text-[#7A756E] font-mono ml-2">{well.siteNo}</span>}
                </div>
                <span className="text-sm font-medium text-[#201F1E] tabular-nums">
                  {well.depthToWaterFt !== null ? `${well.depthToWaterFt.toFixed(1)} ft` : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#7A756E]">No monitoring wells found within ~35 miles.</p>
        )}
      </Card>

      {/* Drought */}
      <Card
        title="Drought Monitor"
        badge={drought ? <Badge label={drought.levelLabel} style={DROUGHT_STYLES[drought.currentLevel]} /> : undefined}
      >
        {result.droughtError ? (
          <ErrorState message={result.droughtError} />
        ) : drought ? (
          <div>
            <p className="text-xs text-[#7A756E] mb-3">{DROUGHT_DESCRIPTIONS[drought.currentLevel]}</p>
            {drought.measureDate && <Row label="USDM Date" value={drought.measureDate} />}
          </div>
        ) : (
          <p className="text-sm text-[#7A756E]">No drought data available.</p>
        )}
      </Card>

      {/* Discharge Permits */}
      <Card
        title="Discharge Permits"
        badge={dischargePermits != null
          ? dischargePermits.totalCount > 0
            ? <Badge label={`${dischargePermits.totalCount} Found`} style="bg-amber-100 text-amber-800" />
            : <Badge label="None Found" style="bg-green-100 text-green-800" />
          : undefined}
      >
        {result.dischargePermitsError ? (
          <ErrorState message={result.dischargePermitsError} />
        ) : dischargePermits?.totalCount ? (
          <div>
            <p className="text-xs text-[#7A756E] mb-3">
              {dischargePermits.totalCount} NPDES permit{dischargePermits.totalCount !== 1 ? 's' : ''} within {dischargePermits.radiusMi} miles.
              {dischargePermits.permits.length > 10 && ` Showing 10 of ${dischargePermits.permits.length}.`}
            </p>
            {dischargePermits.permits.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[#D8D5D0]/40 last:border-0">
                <div>
                  <span className="text-sm font-medium text-[#201F1E]">{p.facilityName || '(unnamed)'}</span>
                  <span className="text-xs text-[#7A756E] ml-2">{[p.city, p.state].filter(Boolean).join(', ')}</span>
                </div>
                <div className="text-right flex items-center gap-3">
                  {p.permitNumber && <span className="text-xs text-[#201F1E] font-mono">{p.permitNumber}</span>}
                  {p.permitStatus && (
                    <Badge
                      label={p.permitStatus}
                      style={p.permitStatus === 'Effective' ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#7A756E]">No discharge permits found within {dischargePermits?.radiusMi ?? 10} miles.</p>
        )}
      </Card>

      {/* Precipitation */}
      <Card
        title="Precipitation"
        badge={precipitation ? <Badge label={RISK_LABELS[precipRiskLevel(precipitation.avgAnnualInches)]} style={RISK_STYLES[precipRiskLevel(precipitation.avgAnnualInches)]} /> : undefined}
      >
        {result.precipitationError ? (
          <ErrorState message={result.precipitationError} />
        ) : precipitation ? (
          <div>
            <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center mb-3">
              <span className="text-3xl font-heading font-bold text-[#201F1E]">
                {precipitation.avgAnnualInches}
              </span>
              <span className="text-sm text-[#7A756E] ml-1">in / yr</span>
            </div>
            <Row label="Period" value={precipitation.dataYearsRange} />
            <Row label="Source" value={precipitation.dataSource} />
          </div>
        ) : (
          <p className="text-sm text-[#7A756E]">No precipitation data available.</p>
        )}
      </Card>
    </div>
  );
}
