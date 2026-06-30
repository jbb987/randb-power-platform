import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
  ElectricityPrice,
} from '../../types';
import type { RetailUtilityResolution } from '../../lib/retailUtility';
import TerritorySection from './TerritorySection';
import GridContextMap from './GridContextMap';
import PoiSection from './PoiSection';
import SubstationsTable from './SubstationsTable';
import TransmissionLinesTable from './TransmissionLinesTable';
import PowerPlantsTable from './PowerPlantsTable';
import ElectricityPriceWidget from '../appraiser/ElectricityPriceWidget';
import FuelMixCard from '../site-analyzer/FuelMixCard';

export interface InfrastructureData {
  iso: string;
  utilityTerritory: string;
  tsp: string;
  /** Serving retail/distribution utility from service-territory polygons (added v1.65). */
  retailUtility?: RetailUtilityResolution | null;
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  /** Expanded-radius substations (set when nearbySubstations is empty). */
  expandedSubstations?: NearbySubstation[];
  /** Radius (mi) the expanded substations were found at. */
  expandedSubstationRadiusMi?: number;
  /** Expanded-radius transmission lines (set when nearbyLines is empty). */
  expandedLines?: NearbyLine[];
  /** Radius (mi) the expanded lines were found at. */
  expandedLineRadiusMi?: number;
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
  /** Site coordinates — when provided, renders the grid context map after Territory. */
  siteCoordinates?: { lat: number; lng: number } | null;
  /** Site registry id — powers the "Open in Grid Power Analyzer" deep link. */
  siteId?: string;
  /** Human-confirmed serving retail utility (authoritative over the auto result). */
  retailUtilityConfirmedName?: string | null;
  /** When provided, the Territory section renders a confirm/override control. */
  onConfirmRetailUtility?: (name: string | null) => void;
}

const cardClass = 'bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6';

export default function InfrastructureResults({
  data,
  loading,
  hasRunAnalysis,
  collapsible = true,
  cardWrap = false,
  siteCoordinates,
  siteId,
  retailUtilityConfirmedName,
  onConfirmRetailUtility,
}: Props) {
  const hasAnalysisData =
    hasRunAnalysis ||
    data.nearbySubstations?.length > 0 ||
    data.nearbyLines?.length > 0 ||
    data.nearbyPowerPlants?.length > 0 ||
    data.floodZone != null ||
    data.solarWind != null;

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
            retailUtility={data.retailUtility}
            retailUtilityConfirmedName={retailUtilityConfirmedName}
            onConfirmRetailUtility={onConfirmRetailUtility}
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
            retailUtility={data.retailUtility}
            retailUtilityConfirmedName={retailUtilityConfirmedName}
            onConfirmRetailUtility={onConfirmRetailUtility}
          />
          {(data.nearestPoiName || hasRunAnalysis) && (
            <PoiSection
              nearestPoiName={data.nearestPoiName}
              nearestPoiDistMi={data.nearestPoiDistMi}
            />
          )}
        </>
      )}

      {/* Grid context map — site pin + nearby substations by voltage class */}
      {siteCoordinates && hasAnalysisData && (data.nearbySubstations ?? []).length > 0 && (
        <>
          {wrap(
            <GridContextMap
              lat={siteCoordinates.lat}
              lng={siteCoordinates.lng}
              substations={data.nearbySubstations ?? []}
              siteId={siteId}
            />,
          )}
        </>
      )}

      {/* Analysis results */}
      {hasAnalysisData && (
        <>
          {wrap(
            <SubstationsTable
              substations={data.nearbySubstations ?? []}
              expanded={data.expandedSubstations ?? null}
              expandedRadiusMi={data.expandedSubstationRadiusMi}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />,
          )}

          {wrap(
            <TransmissionLinesTable
              lines={data.nearbyLines ?? []}
              expanded={data.expandedLines ?? null}
              expandedRadiusMi={data.expandedLineRadiusMi}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />,
          )}

          {wrap(
            <PowerPlantsTable
              plants={data.nearbyPowerPlants ?? []}
              hasRunAnalysis={hasRunAnalysis}
              collapsible={collapsible}
            />,
          )}

          {/* Flood Zone */}
          {data.floodZone &&
            wrap(
              <div className={cardWrap ? '' : 'mt-6'}>
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
                  FEMA Flood Zone
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">Zone</span>
                    <span
                      className={`text-sm font-medium ${
                        data.floodZone.zone === 'X' || data.floodZone.zone === 'C'
                          ? 'text-green-700'
                          : data.floodZone.zone === 'D'
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
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
              </div>,
            )}

          {wrap(
            <FuelMixCard
              nearbyPowerPlants={data.nearbyPowerPlants ?? []}
              stateGenerationByFuel={data.stateGenerationByFuel ?? null}
              detectedState={data.detectedState ?? null}
              loading={loading}
            />,
          )}

          {/* Electricity Price Widget */}
          {(data.detectedState || loading) &&
            wrap(
              <div className={cardWrap ? '' : 'mt-6'}>
                <ElectricityPriceWidget
                  electricityPrice={data.electricityPrice ?? null}
                  detectedState={data.detectedState ?? null}
                  loading={loading}
                />
              </div>,
            )}
        </>
      )}
    </div>
  );
}
