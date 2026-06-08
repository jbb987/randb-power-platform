import { useState } from 'react';
import Button from '../ui/Button';

interface Props {
  svg: string;
  width: number;
  height: number;
  /** Base filename (no extension), e.g. the drawing number. */
  name: string;
}

const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v12m0 0l-4-4m4 4l4-4M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"
    />
  </svg>
);

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterize an SVG string to a PNG data URL via an offscreen canvas. */
function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export default function DownloadButtons({ svg, width, height, name }: Props) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'one-line';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ jsPDF }, png] = await Promise.all([
        import('jspdf'),
        svgToPng(svg, width, height, 2),
      ]);
      const w = Math.round(width);
      const h = Math.round(height);
      const pdf = new jsPDF({
        orientation: w >= h ? 'landscape' : 'portrait',
        unit: 'px',
        format: [w, h],
      });
      pdf.addImage(png, 'PNG', 0, 0, w, h);
      pdf.save(`${safe}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={downloadPdf} disabled={busy}>
        <DownloadIcon />
        {busy ? 'Rendering PDF…' : 'Download PDF'}
      </Button>
      <Button onClick={() => triggerDownload(`${safe}.svg`, svg, 'image/svg+xml')}>
        <DownloadIcon />
        Download SVG
      </Button>
      {error && <span className="text-xs text-[#ED202B]">{error}</span>}
    </div>
  );
}
