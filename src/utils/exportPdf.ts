import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

const PDF_PADDING = 24; // points
const A4_WIDTH = 595.28; // points
const A4_HEIGHT = 841.89; // points
const CAPTURE_WIDTH = 900; // px — fixed width for consistent PDF layout

/**
 * Fetch an image URL and return it as a data URL to avoid CORS issues
 * with html2canvas. Returns null on failure.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
 * Compose a static map from OpenStreetMap tiles drawn onto a canvas,
 * then return as a data URL. This avoids any CORS/third-party service issues
 * since OSM tiles have proper CORS headers.
 */
async function buildStaticMap(
  lat: number,
  lng: number,
  zoom = 14,
  width = 800,
  height = 350,
): Promise<string | null> {
  try {
    // Convert lat/lng to tile coordinates
    const n = Math.pow(2, zoom);
    const centerTileX = ((lng + 180) / 360) * n;
    const centerTileY =
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;

    const tileSize = 256;
    const tilesX = Math.ceil(width / tileSize) + 1;
    const tilesY = Math.ceil(height / tileSize) + 1;

    const startTileX = Math.floor(centerTileX - tilesX / 2);
    const startTileY = Math.floor(centerTileY - tilesY / 2);

    // Pixel offset of the center
    const offsetX = width / 2 - (centerTileX - startTileX) * tileSize;
    const offsetY = height / 2 - (centerTileY - startTileY) * tileSize;

    // Load all tiles in parallel as data URLs
    const tilePromises: Promise<{ img: HTMLImageElement; x: number; y: number } | null>[] = [];

    for (let tx = 0; tx < tilesX + 1; tx++) {
      for (let ty = 0; ty < tilesY + 1; ty++) {
        const tileXCoord = startTileX + tx;
        const tileYCoord = startTileY + ty;

        if (tileXCoord < 0 || tileYCoord < 0 || tileXCoord >= n || tileYCoord >= n) continue;

        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileYCoord}/${tileXCoord}`;
        const px = Math.round(offsetX + tx * tileSize);
        const py = Math.round(offsetY + ty * tileSize);

        tilePromises.push(
          fetchImageAsDataUrl(url).then((dataUrl) => {
            if (!dataUrl) return null;
            return new Promise<{ img: HTMLImageElement; x: number; y: number } | null>((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ img, x: px, y: py });
              img.onerror = () => resolve(null);
              img.src = dataUrl;
            });
          }),
        );
      }
    }

    const tiles = (await Promise.all(tilePromises)).filter(Boolean) as {
      img: HTMLImageElement;
      x: number;
      y: number;
    }[];

    if (tiles.length === 0) return null;

    // Draw onto a canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#E8E5E0';
    ctx.fillRect(0, 0, width, height);

    for (const tile of tiles) {
      ctx.drawImage(tile.img, tile.x, tile.y, tileSize, tileSize);
    }

    // Draw a red marker at center
    const cx = width / 2;
    const cy = height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ED202B';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Pin point
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 6);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 5, cy - 6);
    ctx.fillStyle = '#ED202B';
    ctx.fill();

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
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
    const sectionTops = collectSectionTops(clone, canvas.height, imgHeight);

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
  canvasHeight: number,
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
