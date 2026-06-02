import { useState, useCallback, createElement } from 'react';
import type { ExecutiveSummaryPdfData } from '../components/site-analyzer/SiteExecutiveSummaryPdfDocument';

/**
 * Generates the single-page Customer Executive Summary PDF. Lazy-loads
 * `@react-pdf/renderer` so it stays out of the initial bundle.
 */
export function useExecutiveSummaryPdfExport() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = useCallback(async (data: ExecutiveSummaryPdfData): Promise<boolean> => {
    setGenerating(true);
    setError(null);
    try {
      const [{ pdf }, { default: SiteExecutiveSummaryPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/site-analyzer/SiteExecutiveSummaryPdfDocument'),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = createElement(SiteExecutiveSummaryPdfDocument, { data }) as any;
      const blob = await pdf(doc).toBlob();

      const safeName = data.siteName
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 40);
      const dateStr = new Date(data.generatedAt).toISOString().slice(0, 10);
      const filename = `ExecutiveSummary_${safeName}_${dateStr}.pdf`;

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
      console.error('Executive summary PDF export error:', err);
      return false;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generating, generatePdf, error };
}
