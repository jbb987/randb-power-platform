import { Fragment } from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import type { ExecutiveSummaryModel, ValuationViz } from '../../lib/executiveSummary';
import { formatCurrencyShort } from '../../utils/format';

// ── Font Registration (same families as the full report) ────────────────────
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
    { src: '/fonts/IBMPlexSans-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/IBMPlexSans-Medium.ttf', fontWeight: 500 },
    { src: '/fonts/IBMPlexSans-SemiBold.ttf', fontWeight: 600 },
  ],
});

const BRAND_RED = '#ED202B';
const BRAND_DARK = '#9B0E18';
const TEXT_PRIMARY = '#201F1E';
const TEXT_MUTED = '#7A756E';
const BORDER = '#D8D5D0';

const heading = { fontFamily: 'Sora' as const };
const body = { fontFamily: 'IBMPlexSans' as const };

export interface ExecutiveSummaryPdfData {
  model: ExecutiveSummaryModel;
  siteName: string;
  address: string;
  coordinates: string;
  companyName: string | null;
  generatedAt: number;
}

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 36, ...body, color: TEXT_PRIMARY },
  brandBarTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: BRAND_RED },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  siteName: { ...heading, fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY },
  subLine: { ...body, fontSize: 8, color: TEXT_MUTED, marginTop: 2 },
  kicker: { ...body, fontSize: 8, color: BRAND_RED, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' },
  // Hero
  hero: { backgroundColor: BRAND_DARK, borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 },
  heroLabel: { ...body, fontSize: 7, color: '#FFFFFF', opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 },
  heroMw: { ...heading, fontSize: 40, fontWeight: 700, color: '#FFFFFF' },
  heroMwUnit: { ...heading, fontSize: 16, fontWeight: 600, color: '#FFFFFF' },
  heroBy: { ...heading, fontSize: 20, fontWeight: 600, color: '#FFFFFF' },
  // Ramp bars (inside the Ramp Schedule block)
  rampBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 52, marginTop: 2 },
  rampBarCol: { width: 26, alignItems: 'center', justifyContent: 'flex-end', marginRight: 6 },
  rampBarCum: { ...heading, fontSize: 7, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 1 },
  rampBarFill: { width: 16, backgroundColor: BRAND_RED, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  rampBarYear: { ...body, fontSize: 6.5, color: TEXT_MUTED, marginTop: 2 },
  rampNote: { ...body, fontSize: 6.5, color: BRAND_DARK, marginTop: 4 },
  // Valuation bars
  valBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 50, marginTop: 2 },
  valBarCol: { width: 56, alignItems: 'center', justifyContent: 'flex-end', marginRight: 12 },
  valBarAmt: { ...heading, fontSize: 7.5, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 1 },
  valBarFill: { width: 28, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  valBarLabel: { ...body, fontSize: 6.5, color: TEXT_MUTED, marginTop: 2 },
  valCreated: { ...body, fontSize: 7, color: TEXT_MUTED, marginTop: 5 },
  // Section blocks
  blockGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  blockWrap: { width: '50%', padding: 4 },
  block: { borderWidth: 0.5, borderColor: BORDER, borderRadius: 6, padding: 10 },
  blockTitle: { ...heading, fontSize: 10, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  rowLabel: { ...body, fontSize: 7.5, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { ...body, fontSize: 8.5, fontWeight: 500, color: TEXT_PRIMARY, textAlign: 'right', maxWidth: '62%' },
  footer: { position: 'absolute', bottom: 16, left: 36, right: 36, textAlign: 'center', ...body, fontSize: 7, fontWeight: 600, color: BRAND_DARK, letterSpacing: 1.5, textTransform: 'uppercase' },
});

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Valuation block: current land value vs energized value, as bars. */
function ValuationPdfBlock({ valuation }: { valuation: ValuationViz | null }) {
  if (!valuation) {
    return (
      <View style={s.blockWrap}>
        <View style={s.block}>
          <Text style={s.blockTitle}>Valuation</Text>
          <Text style={s.rowValue}>Not available</Text>
        </View>
      </View>
    );
  }
  const max = Math.max(valuation.currentValue, valuation.energizedValue, 1);
  const bars = [
    { label: 'Current', value: valuation.currentValue, accent: false },
    { label: 'Energized', value: valuation.energizedValue, accent: true },
  ];
  return (
    <View style={s.blockWrap}>
      <View style={s.block}>
        <Text style={s.blockTitle}>Valuation</Text>
        <View style={s.valBarsRow}>
          {bars.map((b) => (
            <View key={b.label} style={s.valBarCol}>
              <Text style={s.valBarAmt}>{formatCurrencyShort(b.value)}</Text>
              <View
                style={[
                  s.valBarFill,
                  { height: Math.max((b.value / max) * 38, 4), backgroundColor: b.accent ? BRAND_RED : BORDER },
                ]}
              />
              <Text style={s.valBarLabel}>{b.label}</Text>
            </View>
          ))}
        </View>
        {valuation.valueCreated > 0 ? (
          <Text style={s.valCreated}>Value created +{formatCurrencyShort(valuation.valueCreated)}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function SiteExecutiveSummaryPdfDocument({ data }: { data: ExecutiveSummaryPdfData }) {
  const { model } = data;

  return (
    <Document title={`${data.siteName} — Executive Summary`}>
      <Page size="A4" style={s.page}>
        <View style={s.brandBarTop} fixed />

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.kicker}>Executive Summary</Text>
            <Text style={s.siteName}>{data.siteName}</Text>
            <Text style={s.subLine}>
              {[data.companyName, data.address, data.coordinates].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
          <Text style={s.subLine}>{fmtDate(data.generatedAt)}</Text>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <View>
            <Text style={s.heroLabel}>Target Capacity</Text>
            <Text style={s.heroMw}>
              {model.targetMW}
              <Text style={s.heroMwUnit}> MW</Text>
            </Text>
          </View>
          <View style={{ marginLeft: 28 }}>
            <Text style={s.heroLabel}>Full capacity by</Text>
            <Text style={s.heroBy}>{model.fullByLabel}</Text>
          </View>
        </View>

        {/* Section mini-summaries (Location, Valuation, Power, Ramp after Power, …) */}
        <View style={s.blockGrid}>
          {model.sections.map((section) => (
            <Fragment key={section.key}>
              <View style={s.blockWrap}>
                <View style={s.block}>
                  <Text style={s.blockTitle}>{section.title}</Text>
                  {section.rows.map((r) => (
                    <View key={r.label} style={s.row}>
                      <Text style={s.rowLabel}>{r.label}</Text>
                      <Text style={[s.rowValue, r.accent ? { color: BRAND_RED } : {}]}>
                        {r.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              {section.key === 'location' ? <ValuationPdfBlock valuation={model.valuation} /> : null}
              {section.key === 'power' ? (
                <View style={s.blockWrap}>
                  <View style={s.block}>
                    <Text style={s.blockTitle}>Ramp Schedule</Text>
                    <View style={s.rampBarsRow}>
                      {model.ramp.map((p) => (
                        <View key={p.index} style={s.rampBarCol}>
                          <Text style={s.rampBarCum}>{p.cumulativeMW}</Text>
                          <View
                            style={[
                              s.rampBarFill,
                              { height: Math.max((p.cumulativeMW / model.rampPeak) * 36, 4) },
                            ]}
                          />
                          <Text style={s.rampBarYear}>{p.year}</Text>
                        </View>
                      ))}
                    </View>
                    {!model.rampReachesTarget ? (
                      <Text style={s.rampNote}>
                        Ramp reaches {model.rampPeak.toLocaleString()} MW of{' '}
                        {model.targetMW.toLocaleString()} MW target.
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Fragment>
          ))}
        </View>

        <Text style={s.footer} fixed>
          Confidential — Prepared by R&amp;B Power Inc.
        </Text>
      </Page>
    </Document>
  );
}
