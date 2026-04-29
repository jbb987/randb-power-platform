import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
  ElectricityPrice,
} from '../../types';
import TerritorySection from './TerritorySection';
import PoiSection from './PoiSection';
import SubstationsTable from './SubstationsTable';
import TransmissionLinesTable from './TransmissionLinesTable';
import PowerPlantsTable from './PowerPlantsTable';
import SolarResourceWidget from '../appraiser/SolarResourceWidget';
import ElectricityPriceWidget from '../appraiser/ElectricityPriceWidget';
import FuelMixCard from '../site-analyzer/FuelMixCard';

export interface InfrastructureData {
  iso: string;
  utilityTerritory: string;
  tsp: string;
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: FloodZoneInfo | null;
  solarWind: SolarWindResource | null;
  electricityPrice: ElectricityPrice | null;
  stateGenerationByFuel: Record<string, number> | null;
  detectedState: string | null;
  lastAnalyzedAt: number | null;
}

interface Props {
  data: InfrastructureData;
  loading: boolean;
  hasRunAnalysis: boolean;
  collapsible?: boolean;
  cardWrap?: boolean;
  context?: 'site-analyzer' | 'power-calculator';
}

const cardClass = 'bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6';

export default function InfrastructureResults({ data, loading, hasRunAnalysis, collapsible = true, cardWrap = false, context = 'power-calculator' }: Props) {
  const hasAnalysisData =
    hasRunAnalysis ||
    data.nearbySubstations?.length > 0 ||
    data.nearbyLines?.length > 0 ||
    data.nearbyPowerPlants?.length > 0 ||
    data.floodZone != null ||
    data.solarWind != null;

  const isSiteAnalyzer = context === 'site-analyzer';

  const wrap = (children: React.ReactNode) =>
    cardWrap ? <div className={cardClass}>{children}</div> : <>{children}</>;

  return (
    <div className={cardWrap ? 'space-y-5' : ''}>
      {/* Territory + POI */}
      {cardWrap ? (
        <div className={cardClass}>
          <TerritorySection
            iso={data.iso}
            utilityTerritory={data.utilityTerritory}
            tsp={data.tsp}
          />
          {(data.nearestPoiName || hasRunAnalysis) && (
            <PoiSection
              nearestPoiName={data.nearestPoiName}
              nearestPoiDistMi={data.nearestPoiDistMi}
            />
          )}
        </div>
      ) : (
        <>
          <TerritorySection
            iso={data.iso}
            utilityTerritory={data.utilityTerritory}
            tsp={data.tsp}
          />
          {(data.nearestPoiName || hasRunAnalysis) && (
            <PoiSection
              nearestPoiName={data.nearestPoiName}
              nearestPoiDistMi={data.nearestPoiDistMi}
            />
          )}
        </>
      )}

      {/* Analysis results */}
      {hasAnalysisData && (
        <>
          {wrap(
            <SubstationsTable
              substations={data.nearbySubstations ?? []}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />
          )}

          {wrap(
            <TransmissionLinesTable
              lines={data.nearbyLines ?? []}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />
          )}

          {wrap(
            <PowerPlantsTable
              plants={data.nearbyPowerPlants ?? []}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />
          )}

          {/* Flood Zone */}
          {data.floodZone && wrap(
            <div className={cardWrap ? '' : 'mt-6'}>
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
                FEMA Flood Zone
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[#7A756E]">Zone</span>
                  <span className={`text-sm font-medium ${
                    data.floodZone.zone === 'X' || data.floodZone.zone === 'C'
                      ? 'text-green-700'
                      : data.floodZone.zone === 'D'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}>
                    {data.floodZone.zone}
                    {data.floodZone.zone === 'X' && ' (Minimal risk)'}
                    {data.floodZone.zone === 'A' && ' (High risk)'}
                    {data.floodZone.zone === 'AE' && ' (High risk)'}
                    {data.floodZone.zone === 'D' && ' (Undetermined)'}
                  </span>
                </div>
                {data.floodZone.floodwayType && data.floodZone.floodwayType !== 'None' && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">Floodway</span>
                    <span className="text-sm text-[#201F1E]">{data.floodZone.floodwayType}</span>
                  </div>
                )}
                {data.floodZone.panelNumber && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">DFIRM Panel</span>
                    <span className="text-sm text-[#201F1E]">{data.floodZone.panelNumber}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fuel Mix — Site Analyzer only */}
          {isSiteAnalyzer && wrap(
            <FuelMixCard
              nearbyPowerPlants={data.nearbyPowerPlants ?? []}
              stateGenerationByFuel={data.stateGenerationByFuel ?? null}
              detectedState={data.detectedState ?? null}
              loading={loading}
            />
          )}

          {/* Solar Resource Widget — Power Calculator only */}
          {!isSiteAnalyzer && (data.solarWind || loading) && wrap(
            <div className={cardWrap ? '' : 'mt-6'}>
              <SolarResourceWidget
                solarWind={data.solarWind}
                detectedState={data.detectedState ?? null}
                loading={loading}
              />
            </div>
          )}

          {/* Electricity Price Widget */}
          {(data.detectedState || loading) && wrap(
            <div className={cardWrap ? '' : 'mt-6'}>
              <ElectricityPriceWidget
                electricityPrice={data.electricityPrice ?? null}
                detectedState={data.detectedState ?? null}
                loading={loading}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
