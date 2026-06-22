import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { ExecutiveSummaryModel, Verdict } from '../../lib/executiveSummary';

// Asset base: '' in the browser (Vite serves /fonts + /logo.png from public/);
// a headless render harness can set globalThis.__RBP_PDF_ASSET_BASE__ to an
// absolute public/ path so react-pdf resolves the same files off disk in Node.
const ASSET_BASE =
  (globalThis as { __RBP_PDF_ASSET_BASE__?: string }).__RBP_PDF_ASSET_BASE__ ?? '';

// ── Font Registration (same families as the full report) ────────────────────
Font.register({
  family: 'Sora',
  fonts: [
    { src: `${ASSET_BASE}/fonts/Sora-Regular.ttf`, fontWeight: 400 },
    { src: `${ASSET_BASE}/fonts/Sora-SemiBold.ttf`, fontWeight: 600 },
    { src: `${ASSET_BASE}/fonts/Sora-Bold.ttf`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBMPlexSans',
  fonts: [
    { src: `${ASSET_BASE}/fonts/IBMPlexSans-Regular.ttf`, fontWeight: 400 },
    { src: `${ASSET_BASE}/fonts/IBMPlexSans-Medium.ttf`, fontWeight: 500 },
    { src: `${ASSET_BASE}/fonts/IBMPlexSans-SemiBold.ttf`, fontWeight: 600 },
  ],
});

const BRAND_RED = '#ED202B';
const BRAND_DARK = '#9B0E18';
const TEXT_PRIMARY = '#201F1E';
const TEXT_MUTED = '#7A756E';
const BORDER = '#D8D5D0';
const INK = '#201F1E';

// Verdict accents (GO green / conditional amber / no-go red).
const GRADE_COLOR: Record<string, string> = {
  go: '#0E7C4B',
  'conditional-go': '#B45309',
  'no-go': '#B91C1C',
};
const GRADE_TINT: Record<string, string> = {
  go: '#E7F4EE',
  'conditional-go': '#FBF1E3',
  'no-go': '#FBE9EA',
};

const heading = { fontFamily: 'Sora' as const };
const body = { fontFamily: 'IBMPlexSans' as const };

export interface ExecutiveSummaryPdfData {
  model: ExecutiveSummaryModel;
  siteName: string;
  address: string;
  coordinates: string;
  county: string | null;
  companyName: string | null;
  /** Satellite + substation map (PNG data URL from buildGridStaticMap); null in headless. */
  gridMapImage?: string | null;
  generatedAt: number;
}

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 38, paddingHorizontal: 36, ...body, color: TEXT_PRIMARY },
  brandBarTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: BRAND_RED },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logo: { height: 26, width: 39 },
  confidentialTag: {
    ...body, fontSize: 7, fontWeight: 600, color: BRAND_DARK, letterSpacing: 1,
    textTransform: 'uppercase', borderWidth: 0.75, borderColor: BRAND_DARK, borderRadius: 3,
    paddingVertical: 2, paddingHorizontal: 6,
  },
  headerDate: { ...body, fontSize: 7, color: TEXT_MUTED, marginTop: 4, textAlign: 'right' },

  // Hero: site identity (left) + verdict badge (right)
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  heroLeft: { flex: 1, paddingRight: 16 },
  siteName: { ...heading, fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.1 },
  mwLine: { ...heading, fontSize: 30, fontWeight: 700, color: BRAND_RED, marginTop: 8, lineHeight: 1 },
  mwUnit: { ...heading, fontSize: 14, fontWeight: 600, color: BRAND_RED },
  metaLine: { ...body, fontSize: 9, color: TEXT_MUTED, marginTop: 6 },

  // Verdict badge
  badge: { width: 132, borderRadius: 8, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' },
  badgeGrade: { ...heading, fontSize: 26, fontWeight: 700, lineHeight: 1 },
  badgeReviewed: { ...body, fontSize: 7.5, fontWeight: 600, marginTop: 5, textAlign: 'center' },
  badgeEnergized: { ...heading, fontSize: 13, fontWeight: 700, color: INK, textAlign: 'center' },
  badgeEnergizedSub: { ...body, fontSize: 6.5, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 1, marginTop: 7, textAlign: 'center' },

  // Map band
  mapWrap: { borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: BORDER, marginBottom: 4 },
  mapImage: { width: '100%', height: 230, objectFit: 'cover' },
  mapFallback: { height: 230, backgroundColor: '#F2F0ED', alignItems: 'center', justifyContent: 'center' },
  mapFallbackText: { ...body, fontSize: 8, color: TEXT_MUTED },
  mapCaption: { ...body, fontSize: 8, color: TEXT_MUTED, marginBottom: 16 },
  mapCaptionStrong: { ...body, fontSize: 8.5, fontWeight: 600, color: BRAND_RED },

  // Benefits
  whyHeading: { ...body, fontSize: 8, fontWeight: 600, color: BRAND_RED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  tileWrap: { width: '33.333%', padding: 5 },
  tile: { borderLeftWidth: 2.5, borderLeftColor: BRAND_RED, paddingLeft: 9, paddingVertical: 2 },
  tileHeadline: { ...heading, fontSize: 10.5, fontWeight: 600, color: INK },
  tileDetail: { ...body, fontSize: 8, color: TEXT_MUTED, marginTop: 2 },

  // Power ramp — fixed-width, left-aligned bars so a short ramp stays compact
  rampSection: { marginTop: 14 },
  rampRow: { flexDirection: 'row', alignItems: 'flex-end' },
  rampCol: { width: 34, alignItems: 'center', marginRight: 8 },
  rampValue: { ...heading, fontSize: 7, fontWeight: 600, color: INK, marginBottom: 2 },
  rampBar: { width: 18, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: BRAND_RED },
  rampYear: { ...body, fontSize: 6.5, color: TEXT_MUTED, marginTop: 3 },
  rampNote: { ...body, fontSize: 7.5, color: BRAND_DARK, marginTop: 6 },

  // CTA
  ctaRow: { marginTop: 18, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 12 },
  ctaContact: { ...body, fontSize: 8, color: TEXT_MUTED },

  footer: { position: 'absolute', bottom: 16, left: 36, right: 36, textAlign: 'center', ...body, fontSize: 7, fontWeight: 600, color: BRAND_DARK, letterSpacing: 1.5, textTransform: 'uppercase' },
});

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** GO / CONDITIONAL GO / NO-GO badge. */
function VerdictBadge({ verdict, energizedBy }: { verdict: Verdict | null; energizedBy: string }) {
  const color = verdict ? GRADE_COLOR[verdict.grade] : TEXT_MUTED;
  const tint = verdict ? GRADE_TINT[verdict.grade] : '#F2F0ED';
  return (
    <View style={[s.badge, { borderColor: color, backgroundColor: tint }]}>
      <Text style={[s.badgeGrade, { color }]}>{verdict ? verdict.label : '—'}</Text>
      <Text style={[s.badgeReviewed, { color }]}>
        {verdict ? (verdict.reviewed ? 'Engineer-reviewed' : 'Preliminary grade') : 'Not yet graded'}
      </Text>
      {energizedBy && energizedBy !== '—' ? (
        <>
          <Text style={s.badgeEnergizedSub}>Target Energization</Text>
          <Text style={s.badgeEnergized}>{energizedBy}</Text>
        </>
      ) : null}
    </View>
  );
}

export default function SiteExecutiveSummaryPdfDocument({ data }: { data: ExecutiveSummaryPdfData }) {
  const { model } = data;
  const metaBits = [model.rto, data.county ? `${data.county} County` : null, data.coordinates]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Document title={`${data.siteName} — Site Briefing`}>
      <Page size="A4" style={s.page}>
        <View style={s.brandBarTop} fixed />

        {/* Header */}
        <View style={s.header}>
          <Image style={s.logo} src={`${ASSET_BASE}/logo.png`} />
          <View>
            <Text style={s.confidentialTag}>Confidential · Investor Only</Text>
            <Text style={s.headerDate}>{fmtDate(data.generatedAt)}</Text>
          </View>
        </View>

        {/* Hero: deliverable MW (left) + verdict (right) — seller not named */}
        <View style={s.hero}>
          <View style={s.heroLeft}>
            <Text style={s.siteName}>{data.siteName}</Text>
            <Text style={s.mwLine}>
              {model.heroMW > 0 ? model.heroMW.toLocaleString() : '—'}
              <Text style={s.mwUnit}> MW</Text>
            </Text>
            <Text style={s.metaLine}>{metaBits}</Text>
          </View>
          <VerdictBadge verdict={model.verdict} energizedBy={model.fullByLabel} />
        </View>

        {/* Power-context map band */}
        <View style={s.mapWrap}>
          {data.gridMapImage ? (
            <Image style={s.mapImage} src={data.gridMapImage} />
          ) : (
            <View style={s.mapFallback}>
              <Text style={s.mapFallbackText}>Power-context map (site · substations · grid)</Text>
            </View>
          )}
        </View>
        <Text style={s.mapCaption}>
          Nearest substation{'  '}
          <Text style={s.mapCaptionStrong}>{model.nearestSubstation ?? 'Not Available'}</Text>
          {model.utility ? `   ·   Served by ${model.utility}` : ''}
        </Text>

        {/* Site highlights — benefit tiles */}
        <Text style={s.whyHeading}>Site Highlights</Text>
        <View style={s.tileGrid}>
          {model.benefits.map((b) => (
            <View key={b.key} style={s.tileWrap}>
              <View style={s.tile}>
                <Text style={s.tileHeadline}>{b.headline}</Text>
                <Text style={s.tileDetail}>{b.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Power ramp — cumulative MW energized per year */}
        {model.ramp.length > 0 ? (
          <View style={s.rampSection}>
            <Text style={s.whyHeading}>Power Ramp</Text>
            <View style={s.rampRow}>
              {model.ramp.map((p) => {
                const h = Math.max((p.cumulativeMW / model.rampPeak) * 40, 3);
                return (
                  <View key={p.index} style={s.rampCol}>
                    <Text style={s.rampValue}>{p.cumulativeMW.toLocaleString()}</Text>
                    <View style={[s.rampBar, { height: h }]} />
                    <Text style={s.rampYear}>{p.year}</Text>
                  </View>
                );
              })}
            </View>
            {!model.rampReachesTarget ? (
              <Text style={s.rampNote}>
                Ramp reaches {model.rampPeak.toLocaleString()} MW of the{' '}
                {model.targetMW.toLocaleString()} MW target.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Attribution — reads as an executive summary, not a sales CTA */}
        <View style={s.ctaRow}>
          <Text style={s.ctaContact}>
            Prepared by R&amp;B Power Inc.
          </Text>
        </View>

        <Text style={s.footer} fixed>
          Confidential — For Investor Use Only
        </Text>
      </Page>
    </Document>
  );
}
