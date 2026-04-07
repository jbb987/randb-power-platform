import { useState, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import PiddrPdfDocument from '../components/piddr/PiddrPdfDocument';
import type { PiddrPdfData } from '../components/piddr/PiddrPdfDocument';
import { buildStaticMap } from '../utils/buildStaticMap';
import { parseCoordinates } from '../utils/parseCoordinates';

export function usePdfExport() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = useCallback(async (data: PiddrPdfData) => {
    setGenerating(true);
    setError(null);

    try {
      // Generate satellite map image before PDF render (needs DOM canvas)
      let siteMapImage: string | null = null;
      const coords = parseCoordinates(data.inputs.coordinates);
      if (coords) {
        siteMapImage = await buildStaticMap(coords.lat, coords.lng, 15);
      }
      const pdfData: PiddrPdfData = { ...data, siteMapImage };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = createElement(PiddrPdfDocument, { data: pdfData }) as any;
      const blob = await pdf(doc).toBlob();

      // Build filename: PIDDR_{SiteName}_{Date}.pdf
      const safeName = data.inputs.siteName
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 40);
      const dateStr = new Date(data.generatedAt).toISOString().slice(0, 10);
      const filename = `PIDDR_${safeName}_${dateStr}.pdf`;

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
