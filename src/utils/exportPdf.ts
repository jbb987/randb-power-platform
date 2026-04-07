import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { buildStaticMap } from './buildStaticMap';

const PDF_PADDING = 24; // points
const A4_WIDTH = 595.28; // points
const A4_HEIGHT = 841.89; // points
const CAPTURE_WIDTH = 900; // px — fixed width for consistent PDF layout

/**
 * Extract lat,lng from a Google Maps embed iframe src.
 */
function parseCoordsFromIframeSrc(src: string): { lat: number; lng: number } | null {
  const match = src.match(/[?&]q=([-\d.]+),([-\d.]+)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Capture a DOM element and save it as a multi-page PDF.
 *
 * Clones the element into an off-screen container at a fixed width
 * so the PDF layout is consistent regardless of the current viewport.
 * Hides `.no-print` elements, replaces iframes with static map images,
 * and restyled inputs as plain text.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Clone into an off-screen wrapper at a fixed width
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${CAPTURE_WIDTH}px;
    background: #FAFAF9;
    z-index: -1;
  `;
  const clone = element.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Hide non-printable elements
    clone.querySelectorAll<HTMLElement>('.no-print').forEach((el) => {
      el.style.display = 'none';
    });

    // Replace iframes with static map images (or a fallback placeholder)
    const iframePromises: Promise<void>[] = [];
    clone.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe) => {
      const coords = parseCoordsFromIframeSrc(iframe.src);

      const promise = (async () => {
        let replacement: HTMLElement;

        if (coords) {
          const dataUrl = await buildStaticMap(coords.lat, coords.lng);

          if (dataUrl) {
            const imgEl = document.createElement('img');
            imgEl.src = dataUrl;
            imgEl.style.cssText = `
              width: 100%;
              height: 350px;
              object-fit: cover;
              border-radius: 12px;
              display: block;
            `;
            replacement = imgEl;
          } else {
            replacement = createMapPlaceholder(coords);
          }
        } else {
          replacement = createMapPlaceholder(null);
        }

        iframe.parentNode!.replaceChild(replacement, iframe);
      })();

      iframePromises.push(promise);
    });

    // Wait for all static map images to load
    await Promise.all(iframePromises);

    // Hide "Open in Google Maps" links
    clone.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      if (a.textContent?.includes('Open in Google Maps')) {
        a.style.display = 'none';
      }
    });

    // Restyle inputs as plain text for a clean report look
    clone.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      const span = document.createElement('span');
      span.textContent = input.value || '—';
      span.style.cssText = `
        display: block;
        font-size: 14px;
        color: #201F1E;
        font-family: 'IBM Plex Sans', sans-serif;
        padding: 6px 0;
        border-bottom: 1px solid #E8E5E0;
      `;
      input.parentNode!.replaceChild(span, input);
    });

    // Force 2-column grid on grid containers (md: breakpoints don't apply to clones)
    clone.querySelectorAll<HTMLElement>('[class*="md:grid-cols-2"]').forEach((el) => {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat(2, 1fr)';
      el.style.gap = '20px';
    });
    clone.querySelectorAll<HTMLElement>('[class*="md:grid-cols-3"]').forEach((el) => {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat(3, 1fr)';
      el.style.gap = '20px';
    });

    // Force desktop layout for the value cards (hide mobile, show desktop)
    clone.querySelectorAll<HTMLElement>('[class*="hidden md:grid"]').forEach((el) => {
      el.style.display = 'grid';
    });
    clone.querySelectorAll<HTMLElement>('[class*="flex md:hidden"]').forEach((el) => {
      el.style.display = 'none';
    });

    // Add page-break hints: each top-level card section should avoid breaking
    Array.from(clone.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        child.style.breakInside = 'avoid';
        child.style.pageBreakInside = 'avoid';
      }
    });

    // Wait for styles + images to settle
    await new Promise((r) => setTimeout(r, 200));

    const canvas = await html2canvas(clone, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#FAFAF9',
      logging: false,
      width: CAPTURE_WIDTH,
    });

    const imgWidth = A4_WIDTH - PDF_PADDING * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = A4_HEIGHT - PDF_PADDING * 2;

    // Collect Y positions of top-level sections for smart page breaks
    const sectionTops = collectSectionTops(clone, imgHeight);

    const pdf = new jsPDF('p', 'pt', 'a4');
    let yOffset = 0;

    while (yOffset < imgHeight) {
      if (yOffset > 0) pdf.addPage();

      // Find the best slice height that avoids cutting through a section
      let sliceHeight = Math.min(pageHeight, imgHeight - yOffset);
      const sliceEnd = yOffset + sliceHeight;

      if (sliceEnd < imgHeight) {
        // Look for a section boundary to break at
        const bestBreak = findBestBreak(sectionTops, yOffset, sliceEnd, pageHeight * 0.25);
        if (bestBreak !== null) {
          sliceHeight = bestBreak - yOffset;
        }
      }

      const sourceY = (yOffset / imgHeight) * canvas.height;
      const sourceH = (sliceHeight / imgHeight) * canvas.height;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.max(1, Math.round(sourceH));

      const ctx = pageCanvas.getContext('2d')!;
      ctx.drawImage(
        canvas,
        0, Math.round(sourceY), canvas.width, Math.round(sourceH),
        0, 0, canvas.width, Math.round(sourceH),
      );

      const pageData = pageCanvas.toDataURL('image/jpeg', 0.85);
      pdf.addImage(pageData, 'JPEG', PDF_PADDING, PDF_PADDING, imgWidth, sliceHeight);

      yOffset += sliceHeight;
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Create a simple fallback placeholder for the map.
 */
function createMapPlaceholder(coords: { lat: number; lng: number } | null): HTMLDivElement {
  const placeholder = document.createElement('div');
  placeholder.style.cssText = `
    width: 100%;
    height: 60px;
    background: #F5F4F2;
    border: 1px solid #D8D5D0;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #7A756E;
    font-size: 12px;
    font-family: 'IBM Plex Sans', sans-serif;
  `;
  placeholder.textContent = coords
    ? `Site location: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
    : 'See site on Google Maps';
  return placeholder;
}

/**
 * Collect the Y positions (in PDF points) of top-level card sections
 * inside the captured clone, so we can avoid slicing through them.
 */
function collectSectionTops(
  clone: HTMLElement,
  imgHeight: number,
): number[] {
  const tops: number[] = [];
  const cloneRect = clone.getBoundingClientRect();
  const cloneH = cloneRect.height;
  if (cloneH <= 0) return tops;

  Array.from(clone.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      const rect = child.getBoundingClientRect();
      const relY = rect.top - cloneRect.top;
      const pdfY = (relY / cloneH) * imgHeight;
      tops.push(pdfY);
    }
  });

  return tops.sort((a, b) => a - b);
}

/**
 * Find the best section boundary to break at, within the last portion of the page.
 * Returns the Y position to break at, or null if no good break found.
 */
function findBestBreak(
  sectionTops: number[],
  pageStart: number,
  pageEnd: number,
  minKeep: number,
): number | null {
  // Look for section tops that fall in the bottom 75% of the page
  // and pick the one closest to the end (to maximize content per page)
  const candidates = sectionTops.filter(
    (y) => y > pageStart + minKeep && y < pageEnd,
  );
  if (candidates.length === 0) return null;
  // Pick the last candidate (most content on this page)
  return candidates[candidates.length - 1];
}
