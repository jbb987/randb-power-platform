import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { AppraisalResult, BroadbandResult } from '../../types';
import type { InfrastructureData } from '../power-calculator/InfrastructureResults';
import type { AnalysisInputs } from '../../hooks/useSiteAnalysis';
import type { WaterAnalysisResult } from '../../lib/waterAnalysis.types';
import type { GasAnalysisResult } from '../../lib/gasAnalysis';
import type { TransportResult } from '../../types/infrastructure';

// ── Font Registration ──────────────────────────────────────────────────────
Font.register({
  family: 'Sora',
  fonts: [
    { src: '/fonts/Sora-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Sora-SemiBold.ttf', fontWeight: 600 },
    { src: '/fonts/Sora-Bold.ttf', fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBMPlexSans',
  fonts: [
    { src: '/fonts/IBMPlexSans-Light.ttf', fontWeight: 300 },
    { src: '/fonts/IBMPlexSans-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/IBMPlexSans-Medium.ttf', fontWeight: 500 },
    { src: '/fonts/IBMPlexSans-SemiBold.ttf', fontWeight: 600 },
  ],
});

// ── Helpers ────────────────────────────────────────────────────────────────
const BRAND_RED = '#ED202B';
const BRAND_DARK = '#9B0E18';
const TEXT_PRIMARY = '#201F1E';
const TEXT_MUTED = '#7A756E';
const BORDER = '#D8D5D0';
const TABLE_HEADER_BG = '#F5F4F3';
const TABLE_ALT_ROW = '#FAFAF9';

const heading = { fontFamily: 'Sora' as const };
const body = { fontFamily: 'IBMPlexSans' as const };

function fmt$(n: number | undefined | null): string {
  if (n == null) return 'N/A';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtNum(n: number | undefined | null, decimals = 1): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Some interstate segments come back from HPMS without a descriptive route_name.
// Fall back to "I-{number}" so summary lines never read "(2.0 mi)" with no label.
function interstateLabel(r: { routeName: string; routeNumber: string }): string {
  return r.routeName?.trim() || `I-${r.routeNumber}`;
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    ...body,
    color: TEXT_PRIMARY,
    fontSize: 9,
    lineHeight: 1.5,
  },
  pageBrandBarTop: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  pageBrandBarBottom: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    right: -1,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  // Header (non-cover pages)
  pageHeader: {
    position: 'absolute',
    top: 20,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  pageHeaderLeft: { fontSize: 7, color: TEXT_MUTED, ...body },
  pageHeaderRight: { fontSize: 7, color: TEXT_MUTED, ...body },
  // Footer (each element independently fixed + absolutely positioned)
  footerConfidential: {
    position: 'absolute' as const,
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: 'center' as const,
    ...body,
    fontSize: 8,
    fontWeight: 600,
    color: BRAND_DARK,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  // Cover
  coverPage: {
    paddingHorizontal: 50,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  coverBrandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  coverBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  coverTitle: {
    ...heading,
    fontSize: 28,
    fontWeight: 700,
    color: BRAND_RED,
    textAlign: 'center',
    marginBottom: 6,
  },
  coverLogo: {
    width: 140,
    height: 94,
    marginBottom: 40,
    alignSelf: 'center',
  },
  coverCustomerName: {
    ...heading,
    fontSize: 13,
    fontWeight: 600,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  coverSiteName: {
    ...heading,
    fontSize: 22,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 10,
  },
  coverAddress: {
    ...body,
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverDate: {
    ...body,
    fontSize: 10,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 30,
  },
  coverConfidential: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: 'center',
    ...body,
    fontSize: 8,
    fontWeight: 600,
    color: BRAND_DARK,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  coverDivider: {
    width: 60,
    height: 2,
    backgroundColor: BRAND_RED,
    marginBottom: 30,
    alignSelf: 'center',
  },
  // Section headings
  sectionTitle: {
    ...heading,
    fontSize: 16,
    fontWeight: 700,
    color: BRAND_RED,
    marginBottom: 14,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND_RED,
  },
  subsectionTitle: {
    ...heading,
    fontSize: 11,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    marginBottom: 8,
    marginTop: 16,
  },
  // Key-value rows
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  kvLabel: { width: '45%', fontSize: 8.5, color: TEXT_MUTED, ...body },
  kvValue: { width: '55%', fontSize: 9, fontWeight: 500, color: TEXT_PRIMARY, ...body },
  // Tables
  table: { marginTop: 6, marginBottom: 8, borderWidth: 0.5, borderColor: BORDER },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: TABLE_HEADER_BG,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  tableRowAlt: { backgroundColor: TABLE_ALT_ROW },
  tableHeaderCell: { fontSize: 7, fontWeight: 600, color: TEXT_PRIMARY, ...heading, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCell: { fontSize: 8, color: TEXT_PRIMARY, ...body },
  // Executive summary
  summaryBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#FEFEFE',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  summaryLabel: { fontSize: 9, color: TEXT_MUTED, ...body },
  summaryValue: { fontSize: 9, fontWeight: 600, color: TEXT_PRIMARY, ...body },
  summaryHighlight: { fontSize: 9, fontWeight: 600, color: BRAND_RED, ...body },
  // Badge
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: 600,
    ...heading,
  },
  badgeGreen: { backgroundColor: '#ECFDF5', color: '#065F46' },
  badgeAmber: { backgroundColor: '#FFFBEB', color: '#92400E' },
  badgeRed: { backgroundColor: '#FEF2F2', color: '#991B1B' },
  badgeBlue: { backgroundColor: '#EFF6FF', color: '#1E40AF' },
  badgeGray: { backgroundColor: '#F5F5F4', color: '#57534E' },
  // Status pills (for infrastructure tables)
  statusPillWrap: {
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    fontSize: 6.5,
    fontWeight: 600,
    ...heading,
  },
  statusGreenBg: { backgroundColor: '#ECFDF5' },
  statusBlueBg: { backgroundColor: '#EFF6FF' },
  statusRedBg: { backgroundColor: '#FEF2F2' },
  statusGrayBg: { backgroundColor: '#F5F5F4' },
  statusGreenText: { color: '#065F46' },
  statusBlueText: { color: '#1E40AF' },
  statusRedText: { color: '#991B1B' },
  statusGrayText: { color: '#57534E' },
  // Misc
  paragraph: { ...body, fontSize: 9, color: TEXT_PRIMARY, lineHeight: 1.6, marginBottom: 8 },
  noteText: { ...body, fontSize: 7.5, color: TEXT_MUTED, marginTop: 4 },
  noData: { ...body, fontSize: 8.5, color: TEXT_MUTED, marginVertical: 6 },
});

// ── Data Props ─────────────────────────────────────────────────────────────
export interface SiteAnalysisPdfData {
  inputs: AnalysisInputs;
  appraisal: AppraisalResult | null;
  infra: InfrastructureData | null;
  broadband: BroadbandResult | null;
  transport: TransportResult | null;
  water: WaterAnalysisResult | null;
  gas: GasAnalysisResult | null;
  siteMapImage: string | null;
  generatedAt: number;
}

// ── Shared Components ──────────────────────────────────────────────────────
function PageHeader({ siteName }: { siteName: string }) {
  return (
    <>
      <View style={s.pageBrandBarTop} fixed />
      <View style={s.pageHeader} fixed>
        <Text style={s.pageHeaderLeft}>{siteName}</Text>
        <Text style={s.pageHeaderRight}>Power Infrastructure Due Diligence Report</Text>
      </View>
    </>
  );
}

function PageFooter() {
  return (
    <>
      <Text style={s.footerConfidential} fixed>Confidential — For Investor Use Only</Text>
      <Text
        fixed
        style={{ position: 'absolute' as const, top: 766, left: 50, right: 50, textAlign: 'right' as const, fontSize: 7, fontWeight: 500, color: TEXT_MUTED, ...body }}
        render={({ pageNumber }) =>
          pageNumber > 1 ? `Page ${pageNumber - 1}` : ''
        }
      />
      <View style={s.pageBrandBarBottom} fixed />
    </>
  );
}

function KvRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={[s.kvValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

// Broadband availability colors for KvRow
const COLOR_GREEN = '#059669';  // available
const COLOR_BLUE = '#2563EB';   // on request
const COLOR_AMBER = '#D97706';  // county-wide (site not directly served)
const COLOR_RED = '#DC2626';    // not available

// 4-tier fiber/cable availability cascade:
//   site (block) → on-request (adjacent block) → county-wide → none
// The FCC BDC block data can miss providers that serve the county at large,
// so we use countyProviders as the last fallback before "No".
type TechKind = 'Fiber' | 'Cable';
function techAvailability(
  r: BroadbandResult,
  tech: TechKind,
): { label: string; color: string; badge: typeof s.badgeGreen } {
  const atSite = tech === 'Fiber' ? r.fiberAvailable : r.cableAvailable;
  if (atSite) {
    return { label: 'Yes', color: COLOR_GREEN, badge: s.badgeGreen };
  }
  const nearbyHas = r.nearbyServiceBlocks?.some((b) =>
    tech === 'Fiber' ? b.fiberAvailable : b.cableAvailable,
  );
  if (nearbyHas) {
    return { label: 'On Request', color: COLOR_BLUE, badge: s.badgeBlue };
  }
  const inCounty = r.countyProviders?.some((p) => p.technology === tech);
  if (inCounty) {
    return { label: 'Available in County', color: COLOR_AMBER, badge: s.badgeAmber };
  }
  return { label: 'No', color: COLOR_RED, badge: s.badgeRed };
}

function ghiRating(ghi: number): { label: string; style: typeof s.badgeGreen } {
  if (ghi >= 5.0) return { label: 'Excellent', style: s.badgeGreen };
  if (ghi >= 4.5) return { label: 'Good', style: s.badgeGreen };
  if (ghi >= 4.0) return { label: 'Fair', style: s.badgeAmber };
  return { label: 'Poor', style: s.badgeRed };
}

function StatusPill({ status, width }: { status: string | undefined | null; width: string }) {
  let label: string;
  let bgStyle: typeof s.statusGreenBg;
  let textStyle: typeof s.statusGreenText;

  if (!status) {
    label = '—';
    bgStyle = s.statusGrayBg;
    textStyle = s.statusGrayText;
  } else {
    const upper = status.toUpperCase();
    if (upper === 'IN SERVICE' || upper === 'OP') {
      label = status;
      bgStyle = s.statusGreenBg;
      textStyle = s.statusGreenText;
    } else if (upper === 'NOT AVAILABLE') {
      label = 'Capacity Available';
      bgStyle = s.statusBlueBg;
      textStyle = s.statusBlueText;
    } else {
      label = status;
      bgStyle = s.statusRedBg;
      textStyle = s.statusRedText;
    }
  }

  return (
    <View style={[s.statusPillWrap, { width }]}>
      <View style={[s.statusPill, bgStyle]}>
        <Text style={[s.statusPillText, textStyle]}>{label}</Text>
      </View>
    </View>
  );
}

// ── Cover Page ─────────────────────────────────────────────────────────────
function CoverPage({ data }: { data: SiteAnalysisPdfData }) {
  return (
    <Page size="LETTER" style={s.coverPage}>
      <View style={s.coverBrandBar} />
      <View style={{ alignItems: 'center' }}>
        <Image style={s.coverLogo} src="/logo.png" />
        <View style={s.coverDivider} />
        <Text style={s.coverTitle}>Power Infrastructure{'\n'}Due Diligence Report</Text>
        <View style={{ height: 30 }} />
        {data.inputs.customerName ? (
          <Text style={s.coverCustomerName}>{data.inputs.customerName}</Text>
        ) : null}
        <Text style={s.coverSiteName}>{data.inputs.siteName}</Text>
        {(() => {
          const addr = data.inputs.address;
          const coords = data.inputs.coordinates;
          const name = data.inputs.siteName;
          // Show address if different from site name, otherwise show coordinates
          if (addr && addr !== name) return <Text style={s.coverAddress}>{addr}</Text>;
          if (coords && coords !== name) return <Text style={s.coverAddress}>{coords}</Text>;
          return null;
        })()}
        <Text style={s.coverDate}>{fmtDate(data.generatedAt)}</Text>
      </View>
      <Text style={s.coverConfidential}>Confidential — For Investor Use Only</Text>
      <View style={s.coverBottomBar} />
    </Page>
  );
}

// ── Executive Summary ──────────────────────────────────────────────────────
function ExecSummaryPage({ data }: { data: SiteAnalysisPdfData }) {
  const { appraisal, infra, broadband, transport, water, gas, inputs } = data;
  const solar = infra?.solarWind;
  const ghiInfo = solar ? ghiRating(solar.ghi) : null;

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Executive Summary</Text>

      <Text style={s.paragraph}>
        This report presents a comprehensive due diligence analysis for {inputs.siteName}, evaluating land valuation,
        power infrastructure availability, solar and wind resource potential, broadband connectivity,
        transport logistics, water and environmental factors, and gas infrastructure. Key findings are summarized below.
      </Text>

      <View style={s.summaryBox}>
        <Text style={[s.subsectionTitle, { marginTop: 0, marginBottom: 10 }]}>Key Metrics</Text>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Site Capacity</Text>
          <Text style={s.summaryValue}>{inputs.mw} MW</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Acreage</Text>
          <Text style={s.summaryValue}>{fmtNum(inputs.acreage, 0)} acres</Text>
        </View>

        {appraisal && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Current Land Value</Text>
              <Text style={s.summaryValue}>
                {fmt$((appraisal.currentValueLow + appraisal.currentValueHigh) / 2)}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Energized Value</Text>
              <Text style={s.summaryHighlight}>{fmt$(appraisal.energizedValue)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Return Multiple</Text>
              <Text style={s.summaryHighlight}>{appraisal.returnMultiple.toFixed(1)}x</Text>
            </View>
          </>
        )}

        {infra && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>ISO / RTO</Text>
              <Text style={s.summaryValue}>{infra.iso}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Nearest POI</Text>
              <Text style={s.summaryValue}>
                {infra.nearestPoiName ? `${infra.nearestPoiName} (${fmtNum(infra.nearestPoiDistMi)} mi)` : 'N/A'}
              </Text>
            </View>
          </>
        )}

        {solar && ghiInfo && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Solar Resource (GHI)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.summaryValue}>{solar.ghi.toFixed(1)} kWh/m²/day</Text>
              <Text style={[s.badge, ghiInfo.style]}>{ghiInfo.label}</Text>
            </View>
          </View>
        )}

        {broadband && (
          <>
            {(() => {
              const fiber = techAvailability(broadband, 'Fiber');
              return (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Fiber Available</Text>
                  <Text style={[s.badge, fiber.badge]}>{fiber.label}</Text>
                </View>
              );
            })()}
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Max Download Speed</Text>
              <Text style={s.summaryValue}>
                {broadband.maxDownload > 0
                  ? `${fmtNum(broadband.maxDownload, 0)} Mbps`
                  : (() => {
                      const nearbyMax = Math.max(0, ...(broadband.nearbyServiceBlocks ?? []).flatMap(b => b.providers.map(p => p.maxDown)));
                      return nearbyMax > 0 ? `${fmtNum(nearbyMax, 0)} Mbps (on request)` : '0 Mbps';
                    })()
                }
              </Text>
            </View>
          </>
        )}

        {transport && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Nearest Airport</Text>
              <Text style={s.summaryValue}>
                {transport.airports[0]
                  ? `${transport.airports[0].name} (${fmtNum(transport.airports[0].distanceMi)} mi)`
                  : 'None within 50 mi'}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Nearest Interstate</Text>
              <Text style={s.summaryValue}>
                {transport.interstates[0]
                  ? `${interstateLabel(transport.interstates[0])} (${fmtNum(transport.interstates[0].distanceMi)} mi)`
                  : 'None within 20 mi'}
              </Text>
            </View>
          </>
        )}

        {water && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>FEMA Flood Zone</Text>
              <Text style={[s.badge, water.floodZone?.riskLevel === 'minimal' ? s.badgeGreen : water.floodZone?.riskLevel === 'moderate' ? s.badgeAmber : water.floodZone?.riskLevel === 'high' || water.floodZone?.riskLevel === 'very-high' ? s.badgeRed : s.badgeGray]}>
                {water.floodZone ? `${water.floodZone.zone} (${water.floodZone.riskLevel})` : 'N/A'}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Drought Status</Text>
              <Text style={s.summaryValue}>{water.drought?.levelLabel ?? 'N/A'}</Text>
            </View>
          </>
        )}

        {gas && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Nearest Pipeline</Text>
              <Text style={s.summaryValue}>
                {gas.pipelines.length > 0
                  ? `${gas.pipelines[0].operator} (${fmtNum(gas.pipelines[0].distanceMiles)} mi)`
                  : 'None found'}
              </Text>
            </View>
            <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
              <Text style={s.summaryLabel}>Est. Gas Demand</Text>
              <Text style={s.summaryValue}>{gas.gasDemand?.combinedCycle ? `${fmtNum(gas.gasDemand.combinedCycle.dailyDemandMMscf)} MMscf/day` : 'N/A'}</Text>
            </View>
          </>
        )}
      </View>

      <PageFooter />
    </Page>
  );
}

// ── Site Overview ──────────────────────────────────────────────────────────
function SiteOverviewPage({ data }: { data: SiteAnalysisPdfData }) {
  const { inputs } = data;
  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Site Overview</Text>

      {data.siteMapImage && (
        <View style={{ marginBottom: 14, borderRadius: 6, overflow: 'hidden', border: '1pt solid #D8D5D0' }}>
          <Image src={data.siteMapImage} style={{ width: '100%', height: 200 }} />
        </View>
      )}

      <KvRow label="Site Name" value={inputs.siteName} />
      {inputs.address ? <KvRow label="Address" value={inputs.address} /> : null}
      {inputs.coordinates ? <KvRow label="Coordinates" value={inputs.coordinates} /> : null}
      <KvRow label="Acreage" value={`${fmtNum(inputs.acreage, 0)} acres`} />
      <KvRow label="MW Capacity" value={`${inputs.mw} MW`} />
      <KvRow label="Estimated $/Acre" value={inputs.ppaLow ? `${fmt$(inputs.ppaLow)} / acre` : 'Not provided'} />
      {inputs.priorUsage ? <KvRow label="Prior Usage" value={inputs.priorUsage} /> : null}
      {inputs.legalDescription ? <KvRow label="Legal Description" value={inputs.legalDescription} /> : null}
      {inputs.county ? <KvRow label="County" value={inputs.county} /> : null}
      {inputs.parcelId ? <KvRow label="Parcel ID" value={inputs.parcelId} /> : null}
      {inputs.companyName ? (
        <KvRow label="Company" value={inputs.companyName} />
      ) : inputs.owner ? (
        <KvRow label="Owner" value={inputs.owner} />
      ) : null}

      <PageFooter />
    </Page>
  );
}

// ── Land Valuation ─────────────────────────────────────────────────────────
function LandValuationPage({ data }: { data: SiteAnalysisPdfData }) {
  const { appraisal, inputs } = data;
  if (!appraisal) return null;

  const currentValue = (appraisal.currentValueLow + appraisal.currentValueHigh) / 2;

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Land Valuation</Text>

      <Text style={s.subsectionTitle}>Current Land Value</Text>
      <KvRow label="Current Land Value" value={fmt$(currentValue)} />
      {inputs.acreage > 0 && currentValue > 0 && (
        <KvRow label="Estimated $/Acre" value={fmt$(currentValue / inputs.acreage)} />
      )}
      {inputs.acreage > 0 && (
        <KvRow label="Acreage" value={`${inputs.acreage.toLocaleString()} acres`} />
      )}

      <Text style={s.subsectionTitle}>Energized Value</Text>
      <KvRow label="Energized Value" value={fmt$(appraisal.energizedValue)} />
      <KvRow label="Value Created" value={fmt$(appraisal.valueCreated)} />
      <KvRow label="Return Multiple" value={`${appraisal.returnMultiple.toFixed(1)}x`} />
      {inputs.acreage > 0 && (
        <KvRow label="Energized Value per Acre" value={fmt$(appraisal.energizedValue / inputs.acreage)} />
      )}

      <PageFooter />
    </Page>
  );
}

// ── Power Infrastructure ───────────────────────────────────────────────────
function InfrastructurePages({ data }: { data: SiteAnalysisPdfData }) {
  const { infra, inputs } = data;
  if (!infra) return null;

  const substations = infra.nearbySubstations ?? [];
  const lines = infra.nearbyLines ?? [];
  const plants = infra.nearbyPowerPlants ?? [];

  return (
    <>
      {/* Infrastructure Page 1: Territory, POI, Substations, Lines */}
      <Page size="LETTER" style={s.page}>
        <PageHeader siteName={inputs.siteName} />
        <Text style={s.sectionTitle}>Power Infrastructure</Text>

        <Text style={s.subsectionTitle}>Territory</Text>
        <KvRow label="ISO / RTO" value={infra.iso} />
        <KvRow label="Utility Territory" value={infra.utilityTerritory} />
        <KvRow label="Transmission Service Provider" value={infra.tsp} />

        <Text style={s.subsectionTitle}>Point of Interconnection</Text>
        {infra.nearestPoiName ? (
          <>
            <KvRow label="Nearest POI" value={infra.nearestPoiName} />
            <KvRow label="Distance" value={`${fmtNum(infra.nearestPoiDistMi)} miles`} />
          </>
        ) : (
          <Text style={s.noData}>No POI data available</Text>
        )}

        {/* Flood Zone */}
        {infra.floodZone && (
          <>
            <Text style={s.subsectionTitle}>FEMA Flood Zone</Text>
            <KvRow label="Zone" value={infra.floodZone.zone} />
            {infra.floodZone.floodwayType && infra.floodZone.floodwayType !== 'None' && (
              <KvRow label="Floodway" value={infra.floodZone.floodwayType} />
            )}
          </>
        )}

        {/* Substations Table */}
        <Text style={s.subsectionTitle}>Nearby Substations ({substations.length})</Text>
        {substations.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '28%' }]}>Name</Text>
              <Text style={[s.tableHeaderCell, { width: '22%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Max kV</Text>
              <Text style={[s.tableHeaderCell, { width: '10%' }]}>Lines</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Dist (mi)</Text>
              <Text style={[s.tableHeaderCell, { width: '13%' }]}>Status</Text>
            </View>
            {substations.slice(0, 15).map((sub, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '28%' }]}>{sub.name || 'Unknown'}</Text>
                <Text style={[s.tableCell, { width: '22%' }]}>{sub.owner || '—'}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(sub.maxVolt, 0)}</Text>
                <Text style={[s.tableCell, { width: '10%' }]}>{sub.lines}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(sub.distanceMi)}</Text>
                <StatusPill status={sub.status} width="13%" />
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby substations found</Text>
        )}

        <PageFooter />
      </Page>

      {/* Infrastructure Page 2: Transmission Lines, Power Plants, Solar/Wind, Electricity */}
      <Page size="LETTER" style={s.page}>
        <PageHeader siteName={inputs.siteName} />
        <Text style={[s.sectionTitle, { fontSize: 14 }]}>Power Infrastructure (continued)</Text>

        {/* Transmission Lines */}
        <Text style={s.subsectionTitle}>Nearby Transmission Lines ({lines.length})</Text>
        {lines.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>kV</Text>
              <Text style={[s.tableHeaderCell, { width: '23%' }]}>From</Text>
              <Text style={[s.tableHeaderCell, { width: '23%' }]}>To</Text>
              <Text style={[s.tableHeaderCell, { width: '17%' }]}>Status</Text>
            </View>
            {lines.slice(0, 15).map((line, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '25%' }]}>{line.owner || '—'}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(line.voltage, 0)}</Text>
                <Text style={[s.tableCell, { width: '23%' }]}>{line.sub1 || '—'}</Text>
                <Text style={[s.tableCell, { width: '23%' }]}>{line.sub2 || '—'}</Text>
                <StatusPill status={line.status} width="17%" />
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby transmission lines found</Text>
        )}

        {/* Power Plants */}
        <Text style={s.subsectionTitle}>Nearby Power Plants ({plants.length})</Text>
        {plants.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Name</Text>
              <Text style={[s.tableHeaderCell, { width: '22%' }]}>Operator</Text>
              <Text style={[s.tableHeaderCell, { width: '17%' }]}>Source</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>MW</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Dist (mi)</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Status</Text>
            </View>
            {plants.slice(0, 15).map((plant, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '25%' }]}>{plant.name}</Text>
                <Text style={[s.tableCell, { width: '22%' }]}>{plant.operator || '—'}</Text>
                <Text style={[s.tableCell, { width: '17%' }]}>{plant.primarySource}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(plant.capacityMW, 0)}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(plant.distanceMi)}</Text>
                <StatusPill status={plant.status} width="12%" />
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby power plants found</Text>
        )}

        {/* Solar & Wind Resource */}
        {infra.solarWind && (
          <>
            <Text style={s.subsectionTitle}>Solar & Wind Resource</Text>
            <KvRow label="Global Horizontal Irradiance (GHI)" value={`${infra.solarWind.ghi.toFixed(2)} kWh/m\u00B2/day`} />
            <KvRow label="Direct Normal Irradiance (DNI)" value={`${infra.solarWind.dni.toFixed(2)} kWh/m\u00B2/day`} />
            <KvRow label="Wind Speed (hub height)" value={`${infra.solarWind.windSpeed.toFixed(1)} m/s`} />
            <KvRow label="Est. Capacity Factor" value={`${infra.solarWind.capacity.toFixed(1)}%`} />
          </>
        )}

        {/* Electricity Prices */}
        {infra.electricityPrice && (
          <>
            <Text style={s.subsectionTitle}>Electricity Prices{infra.detectedState ? ` (${infra.detectedState})` : ''}</Text>
            <KvRow label="Commercial" value={`${infra.electricityPrice.commercial.toFixed(2)} \u00A2/kWh`} />
            <KvRow label="Industrial" value={`${infra.electricityPrice.industrial.toFixed(2)} \u00A2/kWh`} />
            <KvRow label="All Sectors" value={`${infra.electricityPrice.allSectors.toFixed(2)} \u00A2/kWh`} />
          </>
        )}

        <PageFooter />
      </Page>
    </>
  );
}

// ── Broadband OSP Assessment (pure functions, mirrored from BroadbandReport.tsx) ──

function bbGetScadaAssessment(r: BroadbandResult): string {
  if (r.fiberAvailable) return 'Fiber available on-site — ideal for SCADA/telemetry with high reliability and low latency.';
  if (r.cableAvailable) return 'Cable broadband available — sufficient for SCADA/telemetry. Consider cellular backup.';
  if (r.fixedWirelessAvailable) return 'Fixed wireless available — viable for basic SCADA/monitoring. Recommend cellular or satellite backup.';
  if (r.providers.length > 0) return 'Satellite-only coverage — high latency limits real-time SCADA. Cellular (LTE/5G) recommended as primary.';
  return 'No fixed broadband coverage detected. Cellular (LTE/5G) or private radio network required for SCADA/telemetry.';
}

function bbGetFiberAssessment(r: BroadbandResult): string {
  const fiberProviders = r.providers.filter(p => p.technology === 'Fiber');
  if (fiberProviders.length > 0) {
    const names = fiberProviders.map(p => p.providerName).join(', ');
    return `Fiber available from ${names} (up to ${Math.max(...fiberProviders.map(p => p.maxDown))} Mbps). Direct interconnection possible.`;
  }
  const nearbyFiber = r.nearbyServiceBlocks?.find(b => b.fiberAvailable);
  if (nearbyFiber) {
    const names = nearbyFiber.providers.filter(p => p.technology === 'Fiber').map(p => p.providerName).join(', ') || 'nearby provider(s)';
    return `No fiber at site, but available ~${nearbyFiber.distanceMi} mi away from ${names}. Contact provider for service extension.`;
  }
  const countyFiber = r.countyProviders?.filter(p => p.technology === 'Fiber') ?? [];
  if (countyFiber.length > 0) {
    const names = countyFiber.map(p => p.providerName).join(', ');
    const county = r.countyName || 'the county';
    return `No fiber at site or adjacent blocks, but ${names} report fiber service in ${county}. Parcel-level availability not confirmed by FCC block data — contact provider to verify feasibility.`;
  }
  return 'No fiber service reported. Last-mile fiber construction may be required.';
}

function bbGetRedundancyAssessment(r: BroadbandResult): string {
  const techTypes = new Set(r.providers.map(p => p.technology));
  if (techTypes.size >= 3) return `${techTypes.size} technology types — excellent path diversity for redundant connectivity.`;
  if (techTypes.size === 2) return `${techTypes.size} technology types — adequate for primary/backup configuration.`;
  if (techTypes.size === 1) return 'Single technology type — limited redundancy. Consider adding cellular or satellite backup.';
  return 'No providers detected — plan for dual-path deployment (cellular + satellite).';
}

function bbGetRecommendation(r: BroadbandResult): string {
  if (r.tier === 'Served' && r.fiberAvailable) return 'Well-connected site. Fiber as primary, cable or fixed wireless as backup. Low telecom risk.';
  if (r.tier === 'Served') return 'Adequate connectivity. Cable/fixed wireless as primary. Budget for potential fiber extension if needed.';
  const nearby = r.nearbyServiceBlocks ?? [];
  if (nearby.length > 0 && nearby[0].distanceMi <= 3) {
    const c = nearby[0];
    return `${[...new Set(c.providers.map(p => p.technology))].join('/') || 'Wired service'} available ${c.distanceMi} mi away. Budget $30K-50K/mi for last-mile build.`;
  }
  if (r.tier === 'Underserved') return 'Limited connectivity. Fixed wireless or cellular as primary. Budget $30K-50K/mi for fiber last-mile build.';
  return 'Remote/unserved area. Cellular (LTE/5G) as primary, LEO satellite as backup. Budget for telecom infrastructure.';
}

// ── Broadband & Connectivity ───────────────────────────────────────────────
function BroadbandPage({ data }: { data: SiteAnalysisPdfData }) {
  const { broadband, inputs } = data;
  if (!broadband) return null;

  const providers = broadband.providers ?? [];
  const mobileProviders = broadband.mobileProviders ?? [];
  const countyProviders = broadband.countyProviders ?? [];

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Broadband & Connectivity</Text>

      <Text style={s.subsectionTitle}>Overview</Text>
      <KvRow label="Connectivity Tier" value={broadband.tier} valueColor={broadband.tier === 'Served' ? COLOR_GREEN : broadband.tier === 'Underserved' ? COLOR_AMBER : COLOR_RED} />
      <KvRow label="Total Providers" value={String(broadband.totalProviders)} />
      {(() => {
        const fiber = techAvailability(broadband, 'Fiber');
        const cable = techAvailability(broadband, 'Cable');
        return (
          <>
            <KvRow label="Fiber Available" value={fiber.label} valueColor={fiber.color} />
            <KvRow label="Cable Available" value={cable.label} valueColor={cable.color} />
          </>
        );
      })()}
      <KvRow
        label="Fixed Wireless Available"
        value={broadband.fixedWirelessAvailable ? 'Yes' : broadband.nearbyServiceBlocks?.some(b => b.fixedWirelessAvailable) ? 'On Request' : 'No'}
        valueColor={broadband.fixedWirelessAvailable ? COLOR_GREEN : broadband.nearbyServiceBlocks?.some(b => b.fixedWirelessAvailable) ? COLOR_BLUE : COLOR_RED}
      />
      {(() => {
        const nearbyProviders = (broadband.nearbyServiceBlocks ?? []).flatMap(b => b.providers);
        const potentialDown = nearbyProviders.length > 0 ? Math.max(...nearbyProviders.map(p => p.maxDown)) : 0;
        const potentialUp = nearbyProviders.length > 0 ? Math.max(...nearbyProviders.map(p => p.maxUp)) : 0;
        return (
          <>
            <KvRow
              label="Max Download"
              value={broadband.maxDownload > 0 ? `${fmtNum(broadband.maxDownload, 0)} Mbps` : potentialDown > 0 ? `${fmtNum(potentialDown, 0)} Mbps (on request)` : '0 Mbps'}
              valueColor={broadband.maxDownload > 0 ? undefined : potentialDown > 0 ? COLOR_BLUE : undefined}
            />
            <KvRow
              label="Max Upload"
              value={broadband.maxUpload > 0 ? `${fmtNum(broadband.maxUpload, 0)} Mbps` : potentialUp > 0 ? `${fmtNum(potentialUp, 0)} Mbps (on request)` : '0 Mbps'}
              valueColor={broadband.maxUpload > 0 ? undefined : potentialUp > 0 ? COLOR_BLUE : undefined}
            />
          </>
        );
      })()}

      {/* Fixed Broadband Providers Table */}
      <Text style={s.subsectionTitle}>Fixed Broadband Providers ({providers.length})</Text>
      {providers.length > 0 ? (
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Provider</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>Technology</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Down (Mbps)</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Up (Mbps)</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>Low Latency</Text>
          </View>
          {providers.slice(0, 20).map((p, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: '30%' }]}>{p.providerName}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.technology}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxDown, 0)}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxUp, 0)}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.lowLatency ? 'Yes' : 'No'}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noData}>No fixed broadband providers found at this location</Text>
      )}

      {/* Service Available on Request */}
      {(broadband.nearbyServiceBlocks?.length ?? 0) > 0 && (
        <>
          <Text style={s.subsectionTitle}>Service Available on Request ({broadband.nearbyServiceBlocks!.length} nearby blocks)</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '22%' }]}>Block GEOID</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Distance</Text>
              <Text style={[s.tableHeaderCell, { width: '24%' }]}>Provider</Text>
              <Text style={[s.tableHeaderCell, { width: '14%' }]}>Technology</Text>
              <Text style={[s.tableHeaderCell, { width: '14%' }]}>Down (Mbps)</Text>
              <Text style={[s.tableHeaderCell, { width: '14%' }]}>Up (Mbps)</Text>
            </View>
            {broadband.nearbyServiceBlocks!.slice(0, 10).map((block) =>
              block.providers.length > 0
                ? block.providers.map((p, pi) => (
                    <View key={`${block.geoid}-${pi}`} style={[s.tableRow, pi % 2 === 1 ? s.tableRowAlt : {}]}>
                      {pi === 0 && <Text style={[s.tableCell, { width: '22%', fontSize: 7 }]}>{block.geoid}</Text>}
                      {pi !== 0 && <Text style={[s.tableCell, { width: '22%' }]} />}
                      {pi === 0 && <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(block.distanceMi)} mi</Text>}
                      {pi !== 0 && <Text style={[s.tableCell, { width: '12%' }]} />}
                      <Text style={[s.tableCell, { width: '24%' }]}>{p.providerName}</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>{p.technology}</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>{fmtNum(p.maxDown, 0)}</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>{fmtNum(p.maxUp, 0)}</Text>
                    </View>
                  ))
                : (
                    <View key={block.geoid} style={s.tableRow}>
                      <Text style={[s.tableCell, { width: '22%', fontSize: 7 }]}>{block.geoid}</Text>
                      <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(block.distanceMi)} mi</Text>
                      <Text style={[s.tableCell, { width: '24%', fontStyle: 'italic' }]}>Service reported</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>—</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>—</Text>
                      <Text style={[s.tableCell, { width: '14%' }]}>—</Text>
                    </View>
                  )
            )}
          </View>
        </>
      )}

      {/* Mobile Broadband */}
      {mobileProviders.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Mobile Broadband Coverage ({mobileProviders.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '35%' }]}>Provider</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Technology</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Down (Mbps)</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Up (Mbps)</Text>
            </View>
            {mobileProviders.slice(0, 15).map((p, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '35%' }]}>{p.providerName}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{p.technology}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtNum(p.maxDown, 0)}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtNum(p.maxUp, 0)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* County-Wide Providers */}
      {countyProviders.length > 0 && (
        <>
          <Text style={s.subsectionTitle} break>County-Wide Providers — {broadband.countyName} ({countyProviders.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '30%' }]}>Provider</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Technology</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Down (Mbps)</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Up (Mbps)</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Low Latency</Text>
            </View>
            {countyProviders.slice(0, 30).map((p, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '30%' }]}>{p.providerName}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{p.technology}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxDown, 0)}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxUp, 0)}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{p.lowLatency ? 'Yes' : 'No'}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* OSP Engineer Assessment */}
      <Text style={s.subsectionTitle}>OSP Engineer Assessment</Text>
      <KvRow label="SCADA / Telemetry" value={bbGetScadaAssessment(broadband)} />
      <KvRow label="Fiber Backhaul" value={bbGetFiberAssessment(broadband)} />
      <KvRow label="Redundancy" value={bbGetRedundancyAssessment(broadband)} />
      <KvRow label="Recommendation" value={bbGetRecommendation(broadband)} />

      <PageFooter />
    </Page>
  );
}

// ── Transport Infrastructure ──────────────────────────────────────────────
function TransportPage({ data }: { data: SiteAnalysisPdfData }) {
  const { transport, inputs } = data;
  if (!transport) return null;

  const { airports, interstates, ports, railroads } = transport;

  function fmtDist(mi: number): string {
    return mi < 1 ? '< 1 mi' : `${fmtNum(mi)} mi`;
  }

  function hubLabel(hub: string): string {
    switch (hub) {
      case 'L': return 'Large Hub';
      case 'M': return 'Medium Hub';
      case 'S': return 'Small Hub';
      case 'N': return 'Non-Hub';
      default: return hub || 'N/A';
    }
  }

  function fmtTonnage(t: number): string {
    if (t >= 1_000_000) return `${fmtNum(t / 1_000_000)}M`;
    if (t >= 1_000) return `${fmtNum(t / 1_000, 0)}K`;
    return String(t);
  }

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Transport Infrastructure</Text>

      {/* Summary */}
      <KvRow label="Nearest Airport" value={airports[0] ? `${airports[0].name} (${fmtDist(airports[0].distanceMi)})` : 'None within 50 mi'} />
      <KvRow label="Nearest Interstate" value={interstates[0] ? `${interstateLabel(interstates[0])} (${fmtDist(interstates[0].distanceMi)})` : 'None within 20 mi'} />
      <KvRow label="Nearest Port" value={ports[0] ? `${ports[0].name} (${fmtDist(ports[0].distanceMi)})` : 'None within 100 mi'} />
      <KvRow label="Nearest Railroad" value={railroads[0] ? `${railroads[0].owner} (${fmtDist(railroads[0].distanceMi)})` : 'None within 10 mi'} />

      {/* Airports Table */}
      <Text style={s.subsectionTitle}>Airports ({airports.length})</Text>
      {airports.length > 0 ? (
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Name</Text>
            <Text style={[s.tableHeaderCell, { width: '10%' }]}>FAA ID</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Hub</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>City</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Comm. Ops</Text>
            <Text style={[s.tableHeaderCell, { width: '10%' }]}>Dist</Text>
          </View>
          {airports.slice(0, 10).map((a, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: '30%' }]}>{a.name}</Text>
              <Text style={[s.tableCell, { width: '10%' }]}>{a.locId}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{hubLabel(a.hub)}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{a.city}, {a.state}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{a.commercialOps.toLocaleString()}</Text>
              <Text style={[s.tableCell, { width: '10%' }]}>{fmtDist(a.distanceMi)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noData}>No airports found within 50 miles</Text>
      )}

      {/* Interstates Table */}
      <Text style={s.subsectionTitle}>Interstates ({interstates.length})</Text>
      {interstates.length > 0 ? (
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, { width: '25%' }]}>Route</Text>
            <Text style={[s.tableHeaderCell, { width: '50%' }]}>Name</Text>
            <Text style={[s.tableHeaderCell, { width: '25%' }]}>Distance</Text>
          </View>
          {interstates.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: '25%' }]}>I-{r.routeNumber}</Text>
              <Text style={[s.tableCell, { width: '50%' }]}>{r.routeName?.trim() || '—'}</Text>
              <Text style={[s.tableCell, { width: '25%' }]}>{fmtDist(r.distanceMi)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noData}>No interstates found within 20 miles</Text>
      )}

      {/* Ports Table */}
      {ports.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Major Ports ({ports.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '35%' }]}>Port</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Total Tonnage</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Imports</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Exports</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Dist</Text>
            </View>
            {ports.map((p, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '35%' }]}>{p.name}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtTonnage(p.totalTonnage)}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtTonnage(p.imports)}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtTonnage(p.exports)}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtDist(p.distanceMi)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Railroads Table */}
      {railroads.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Class I Railroads ({railroads.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Subdivision</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Tracks</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Passenger</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Dist</Text>
            </View>
            {railroads.map((r, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '25%' }]}>{r.owner}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{r.subdivision || '\u2014'}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{String(r.tracks)}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{r.passenger === 'Y' ? 'Yes' : 'No'}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtDist(r.distanceMi)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <PageFooter />
    </Page>
  );
}

// ── Water & Environmental ─────────────────────────────────────────────────
function WaterPage({ data }: { data: SiteAnalysisPdfData }) {
  const { water, inputs } = data;
  if (!water) return null;

  const wetlands = water.wetlands?.wetlands ?? [];
  const wells = water.groundwater?.wells ?? [];
  const permits = water.dischargePermits?.permits ?? [];

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Water & Environmental</Text>

      {/* Flood Zone */}
      <Text style={s.subsectionTitle}>FEMA Flood Zone</Text>
      {water.floodZone ? (
        <>
          <KvRow label="Zone Designation" value={water.floodZone.zone} />
          <KvRow label="Zone Subtype" value={water.floodZone.zoneSubtype || 'N/A'} />
          <KvRow label="Risk Level" value={water.floodZone.riskLevel.toUpperCase()} />
          <KvRow label="Description" value={water.floodZone.description} />
          {water.floodZone.staticBfe != null && (
            <KvRow label="Base Flood Elevation" value={`${water.floodZone.staticBfe} ft`} />
          )}
        </>
      ) : (
        <Text style={s.noData}>{water.floodZoneError || 'Flood zone data not available'}</Text>
      )}

      {/* Stream & Basin */}
      <Text style={s.subsectionTitle}>Stream & Basin</Text>
      {water.stream ? (
        <>
          <KvRow label="Stream Name" value={water.stream.streamName || 'Unnamed'} />
          <KvRow label="COMID" value={water.stream.comid || 'N/A'} />
          {water.stream.streamOrder != null && (
            <KvRow label="Stream Order" value={String(water.stream.streamOrder)} />
          )}
          {water.stream.basinAreaKm2 != null && (
            <KvRow label="Basin Area" value={`${fmtNum(water.stream.basinAreaKm2, 0)} km\u00B2`} />
          )}
          <KvRow label="Monitoring Stations" value={String(water.stream.monitoringStations.length)} />
        </>
      ) : (
        <Text style={s.noData}>{water.streamError || 'Stream data not available'}</Text>
      )}

      {/* Wetlands */}
      <Text style={s.subsectionTitle}>Wetlands</Text>
      {water.wetlands ? (
        <>
          <KvRow label="Wetlands Present" value={water.wetlands.hasWetlands ? 'Yes' : 'No'} />
          {water.wetlands.nearestWetlandFt != null && (
            <KvRow label="Nearest Wetland" value={`${fmtNum(water.wetlands.nearestWetlandFt, 0)} ft`} />
          )}
          {wetlands.length > 0 && (
            <View style={s.table}>
              <View style={s.tableHeaderRow}>
                <Text style={[s.tableHeaderCell, { width: '25%' }]}>Attribute</Text>
                <Text style={[s.tableHeaderCell, { width: '35%' }]}>Type</Text>
                <Text style={[s.tableHeaderCell, { width: '20%' }]}>Acres</Text>
                <Text style={[s.tableHeaderCell, { width: '20%' }]}>Dist (ft)</Text>
              </View>
              {wetlands.slice(0, 10).map((w, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: '25%' }]}>{w.attribute}</Text>
                  <Text style={[s.tableCell, { width: '35%' }]}>{w.wetlandType}</Text>
                  <Text style={[s.tableCell, { width: '20%' }]}>{w.acres != null ? fmtNum(w.acres, 1) : '\u2014'}</Text>
                  <Text style={[s.tableCell, { width: '20%' }]}>{w.distanceFt != null ? fmtNum(w.distanceFt, 0) : '\u2014'}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={s.noData}>{water.wetlandsError || 'Wetlands data not available'}</Text>
      )}

      {/* Groundwater */}
      <Text style={s.subsectionTitle}>Groundwater</Text>
      {water.groundwater ? (
        <>
          <KvRow label="Monitoring Wells Found" value={String(water.groundwater.wellCount)} />
          {wells.length > 0 && (
            <View style={s.table}>
              <View style={s.tableHeaderRow}>
                <Text style={[s.tableHeaderCell, { width: '35%' }]}>Name</Text>
                <Text style={[s.tableHeaderCell, { width: '25%' }]}>Site No.</Text>
                <Text style={[s.tableHeaderCell, { width: '20%' }]}>Depth (ft)</Text>
                <Text style={[s.tableHeaderCell, { width: '20%' }]}>Date</Text>
              </View>
              {wells.slice(0, 8).map((w, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: '35%' }]}>{w.name}</Text>
                  <Text style={[s.tableCell, { width: '25%' }]}>{w.siteNo}</Text>
                  <Text style={[s.tableCell, { width: '20%' }]}>{w.depthToWaterFt != null ? fmtNum(w.depthToWaterFt, 1) : '\u2014'}</Text>
                  <Text style={[s.tableCell, { width: '20%' }]}>{w.measurementDate ?? '\u2014'}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={s.noData}>{water.groundwaterError || 'Groundwater data not available'}</Text>
      )}

      {/* Drought */}
      <Text style={s.subsectionTitle}>Drought Conditions</Text>
      {water.drought ? (
        <>
          <KvRow label="Current Level" value={water.drought.levelLabel} />
          <KvRow label="Measurement Date" value={water.drought.measureDate} />
        </>
      ) : (
        <Text style={s.noData}>{water.droughtError || 'Drought data not available'}</Text>
      )}

      {/* Precipitation */}
      {water.precipitation && (
        <>
          <Text style={s.subsectionTitle}>Precipitation</Text>
          <KvRow label="Avg. Annual" value={`${fmtNum(water.precipitation.avgAnnualInches, 1)} inches`} />
          <KvRow label="Data Period" value={water.precipitation.dataYearsRange} />
        </>
      )}

      {/* Discharge Permits */}
      {permits.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>NPDES Discharge Permits ({water.dischargePermits?.totalCount ?? permits.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '35%' }]}>Facility</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Permit #</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Status</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Location</Text>
            </View>
            {permits.slice(0, 8).map((p, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '35%' }]}>{p.facilityName}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{p.permitNumber}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{p.permitStatus}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{p.city}, {p.state}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <PageFooter />
    </Page>
  );
}

// ── Gas Infrastructure ────────────────────────────────────────────────────
function GasPage({ data }: { data: SiteAnalysisPdfData }) {
  const { gas, inputs } = data;
  if (!gas) return null;

  const pipelines = gas.pipelines ?? [];

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Gas Infrastructure</Text>

      {/* Nearby Pipelines */}
      <Text style={s.subsectionTitle}>Nearby Pipelines ({pipelines.length})</Text>
      {pipelines.length > 0 ? (
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Operator</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>Type</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Status</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Dist (mi)</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>System</Text>
          </View>
          {pipelines.slice(0, 15).map((p, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: '30%' }]}>{p.operator}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.type}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{p.status}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.distanceMiles)}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.system}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noData}>No nearby gas pipelines found</Text>
      )}

      {/* Gas Demand */}
      {gas.gasDemand && (
        <>
          <Text style={s.subsectionTitle}>Gas Demand Calculation</Text>
          <KvRow label="Target Capacity" value={`${gas.gasDemand.targetMW} MW @ ${Math.round(gas.gasDemand.capacityFactor * 100)}% CF`} />
          <KvRow label="CC Daily Demand" value={`${fmtNum(gas.gasDemand.combinedCycle.dailyDemandMMscf)} MMscf/day`} />
          <KvRow label="CC Annual Demand" value={`${fmtNum(gas.gasDemand.combinedCycle.annualDemandBcf, 2)} Bcf/year`} />
          <KvRow label="CC Heat Rate" value={`${fmtNum(gas.gasDemand.combinedCycle.heatRate, 0)} BTU/kWh`} />
          <KvRow label="SC Daily Demand" value={`${fmtNum(gas.gasDemand.simpleCycle.dailyDemandMMscf)} MMscf/day`} />
          <KvRow label="Pressure Req." value={gas.gasDemand.pressureRequirementPSIG} />
        </>
      )}

      {/* Lateral Estimate */}
      {gas.lateralEstimate && (
        <>
          <Text style={s.subsectionTitle}>Lateral Cost Estimate</Text>
          <KvRow label="Distance to Pipeline" value={`${fmtNum(gas.lateralEstimate.distanceToNearestPipeline)} miles`} />
          <KvRow label="Pipeline Diameter" value={`${gas.lateralEstimate.pipelineDiameterInches ?? 'N/A'}" NPS`} />
          <KvRow label="Cost Estimate" value={`${fmt$(gas.lateralEstimate.estimatedTotalCost?.low)} \u2014 ${fmt$(gas.lateralEstimate.estimatedTotalCost?.high)}`} />
          <KvRow label="Construction Timeline" value={gas.lateralEstimate.timelineMonths ? `${gas.lateralEstimate.timelineMonths.low}\u2013${gas.lateralEstimate.timelineMonths.high} months` : 'N/A'} />
          <KvRow label="Risk Level" value={gas.lateralEstimate.riskLevel ?? 'N/A'} />
        </>
      )}

      {/* LDC Assessment */}
      {gas.ldcAssessment && (
        <>
          <Text style={s.subsectionTitle}>Local Distribution</Text>
          <KvRow label="Detected State" value={gas.detectedState ?? 'Unknown'} />
          <KvRow label="Note" value={gas.ldcAssessment.note ?? 'N/A'} />
        </>
      )}

      {/* Production Context */}
      {gas.productionContext && (
        <>
          <Text style={s.subsectionTitle}>Production Context</Text>
          <KvRow label="Nearest Basin" value={gas.productionContext.nearestBasin ?? 'N/A'} />
          <KvRow label="Distance to Basin" value={`${fmtNum(gas.productionContext.basinProximityMiles)} miles`} />
        </>
      )}

      {/* Gas Quality */}
      {gas.gasQuality && (
        <>
          <Text style={s.subsectionTitle}>Gas Quality Assessment</Text>
          <KvRow label="Rating" value={gas.gasQuality.rating ?? 'N/A'} />
          <KvRow label="BTU Content" value={`${fmtNum(gas.gasQuality.btuContent?.typical, 0)} BTU/scf (range: ${fmtNum(gas.gasQuality.btuContent?.min, 0)}\u2013${fmtNum(gas.gasQuality.btuContent?.max, 0)})`} />
          <KvRow label="H2S Limit" value={`${fmtNum(gas.gasQuality.h2sLimit?.maxPpm, 0)} ppm max`} />
          <KvRow label="Wobbe Index" value={`${fmtNum(gas.gasQuality.wobbeIndex?.typical, 0)} BTU/scf`} />
        </>
      )}

      {/* Supply Reliability */}
      {gas.supplyReliability && (
        <>
          <Text style={s.subsectionTitle}>Supply Reliability</Text>
          <KvRow label="Overall Rating" value={gas.supplyReliability.rating?.toUpperCase() ?? 'N/A'} />
          <KvRow label="Score" value={`${gas.supplyReliability.overallScore ?? 'N/A'} / 100`} />
        </>
      )}

      {/* Gas Pricing */}
      {gas.gasPricing && (
        <>
          <Text style={s.subsectionTitle}>Gas Pricing Context</Text>
          <KvRow label="Henry Hub Benchmark" value={gas.gasPricing.henryHubBenchmark ?? 'N/A'} />
          <KvRow label="Nearest Hub" value={gas.gasPricing.nearestHub?.name ?? 'N/A'} />
          <KvRow label="Basis Differential" value={gas.gasPricing.basisDifferential ? `$${fmtNum(gas.gasPricing.basisDifferential.low, 2)}\u2013$${fmtNum(gas.gasPricing.basisDifferential.high, 2)} ${gas.gasPricing.basisDifferential.unit}` : 'N/A'} />
          <KvRow label="Transport Adder" value={gas.gasPricing.transportAdder ? `$${fmtNum(gas.gasPricing.transportAdder.low, 2)}\u2013$${fmtNum(gas.gasPricing.transportAdder.high, 2)} ${gas.gasPricing.transportAdder.unit}` : 'N/A'} />
        </>
      )}

      {/* Environmental Compliance */}
      {gas.environmentalCompliance && (
        <>
          <Text style={s.subsectionTitle}>Environmental Compliance</Text>
          <KvRow label="State" value={gas.environmentalCompliance.state ?? 'N/A'} />
          {gas.environmentalCompliance.items?.map((item: { item: string; authority: string; status: string }, i: number) => (
            <KvRow key={i} label={item.item} value={`${item.status} (${item.authority})`} />
          ))}
        </>
      )}

      <PageFooter />
    </Page>
  );
}

// ── Closing Page ──────────────────────────────────────────────────────────
function ClosingPage({ data }: { data: SiteAnalysisPdfData }) {
  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={data.inputs.siteName} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ ...heading, fontSize: 11, fontWeight: 700, color: BRAND_RED, letterSpacing: 1, marginBottom: 24 }}>
          CONTACT
        </Text>

        <View style={{
          width: 320,
          backgroundColor: '#FAFAF9',
          borderWidth: 0.5,
          borderColor: BORDER,
          borderRadius: 6,
          paddingVertical: 28,
          paddingHorizontal: 32,
          alignItems: 'center',
        }}>
          <Text style={{ ...heading, fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
            Bailey West
          </Text>
          <Text style={{ ...body, fontSize: 9, fontWeight: 500, color: BRAND_RED, marginBottom: 2 }}>
            CEO & Founder
          </Text>
          <Text style={{ ...heading, fontSize: 10, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 2 }}>
            R&B Power Inc.
          </Text>
          <Text style={{ ...body, fontSize: 8, color: TEXT_MUTED, marginBottom: 18 }}>
            Power Infrastructure Development & Due Diligence
          </Text>

          <View style={{ width: '100%', borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text style={{ ...body, fontSize: 8, color: TEXT_MUTED, width: 50, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</Text>
              <Text style={{ ...body, fontSize: 9, fontWeight: 500, color: TEXT_PRIMARY }}>(972) 979-5124</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ ...body, fontSize: 8, color: TEXT_MUTED, width: 50, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</Text>
              <Text style={{ ...body, fontSize: 9, fontWeight: 500, color: TEXT_PRIMARY }}>bwest@randbpowersolutions.com</Text>
            </View>
          </View>
        </View>

        <Text style={{ ...body, fontSize: 7.5, color: TEXT_MUTED, textAlign: 'center', marginTop: 30 }}>
          This report was prepared by R&B Power Inc. for {data.inputs.customerName || data.inputs.siteName}.
        </Text>
      </View>
      <PageFooter />
    </Page>
  );
}

// ── Main Document ──────────────────────────────────────────────────────────
export default function SiteAnalysisPdfDocument({ data }: { data: SiteAnalysisPdfData }) {
  return (
    <Document
      title={`Site Analysis — ${data.inputs.siteName}`}
      author="R&B Power"
      subject="Site Analysis Report"
      creator="R&B Power Platform"
    >
      <CoverPage data={data} />
      <ExecSummaryPage data={data} />
      <SiteOverviewPage data={data} />
      <LandValuationPage data={data} />
      <InfrastructurePages data={data} />
      <BroadbandPage data={data} />
      <TransportPage data={data} />
      <WaterPage data={data} />
      <GasPage data={data} />
      <ClosingPage data={data} />
    </Document>
  );
}
