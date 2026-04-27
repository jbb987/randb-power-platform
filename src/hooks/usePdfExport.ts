import { useState, useCallback, createElement } from 'react';
import type { SiteAnalysisPdfData } from '../components/site-analyzer/SiteAnalysisPdfDocument';
import { buildStaticMap } from '../utils/buildStaticMap';
import { parseCoordinates } from '../utils/parseCoordinates';

export function usePdfExport() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = useCallback(async (data: SiteAnalysisPdfData) => {
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

      // Generate satellite map image before PDF render (needs DOM canvas)
      let siteMapImage: string | null = null;
      const coords = parseCoordinates(data.inputs.coordinates);
      if (coords) {
        siteMapImage = await buildStaticMap(coords.lat, coords.lng, 15);
      }
      const pdfData: SiteAnalysisPdfData = { ...data, siteMapImage };

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      setError(msg);
      console.error('PDF export error:', err);
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generating, generatePdf, error };
}
