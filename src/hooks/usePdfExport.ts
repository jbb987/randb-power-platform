import { useState, useCallback, createElement } from 'react';
import type { SiteAnalysisPdfData } from '../components/site-analyzer/SiteAnalysisPdfDocument';
import { buildStaticMap, buildGridStaticMap } from '../utils/buildStaticMap';
import { parseCoordinates } from '../utils/parseCoordinates';
import { buildExhibitAModel } from '../lib/exhibitA';

export function usePdfExport() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = useCallback(async (data: SiteAnalysisPdfData): Promise<boolean> => {
    setGenerating(true);
    setError(null);

    try {
      // Lazy-load @react-pdf/renderer and the PDF document component so the
      // library (which references Node's Buffer at module load) doesn't ship
      // in the initial bundle or log "Buffer is not defined" on every page.
      const [{ pdf }, { default: SiteAnalysisPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/site-analyzer/SiteAnalysisPdfDocument'),
      ]);

      // Generate map images before PDF render (needs DOM canvas)
      let siteMapImage: string | null = null;
      let gridMapImage: string | null = null;
      const coords = parseCoordinates(data.inputs.coordinates);
      if (coords) {
        const substations = data.infra?.nearbySubstations ?? [];
        [siteMapImage, gridMapImage] = await Promise.all([
          buildStaticMap(coords.lat, coords.lng, 15),
          substations.length > 0
            ? buildGridStaticMap(coords.lat, coords.lng, substations)
            : Promise.resolve(null),
        ]);
      }

      // Exhibit A (Phase A deliverables) synthesis — pure compute from the
      // same analysis payloads the section pages render.
      const exhibitA = buildExhibitAModel({
        siteName: data.inputs.siteName,
        address: data.inputs.address,
        coordinates: coords ? { lat: coords.lat, lng: coords.lng } : null,
        acreage: data.inputs.acreage,
        targetMW: data.inputs.mw,
        county: data.inputs.county,
        customRamp: data.customRamp,
        generatedAt: data.generatedAt,
        appraisal: data.appraisal,
        infra: data.infra
          ? {
              iso: data.infra.iso,
              utilityTerritory: data.infra.utilityTerritory,
              tsp: data.infra.tsp,
              nearbySubstations: data.infra.nearbySubstations ?? [],
              nearbyLines: data.infra.nearbyLines ?? [],
              detectedState: data.infra.detectedState,
              electricityPrice: data.infra.electricityPrice ?? null,
            }
          : null,
        broadband: data.broadband,
        water: data.water,
        gas: data.gas,
        labor: data.labor,
        countyQueue: data.countyQueue,
        llrGrade: data.llrGrade ?? null,
      });

      const pdfData: SiteAnalysisPdfData = { ...data, siteMapImage, gridMapImage, exhibitA };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = createElement(SiteAnalysisPdfDocument, { data: pdfData }) as any;
      const blob = await pdf(doc).toBlob();

      // Build filename: SiteAnalysis_{SiteName}_{Date}.pdf
      const safeName = data.inputs.siteName
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 40);
      const dateStr = new Date(data.generatedAt).toISOString().slice(0, 10);
      const filename = `SiteAnalysis_${safeName}_${dateStr}.pdf`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      setError(msg);
      console.error('PDF export error:', err);
      return false;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generating, generatePdf, error };
}
