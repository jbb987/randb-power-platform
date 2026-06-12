/**
 * Build a static satellite map image from ArcGIS World Imagery tiles.
 * Returns a PNG data URL string, or null on failure.
 *
 * Shared between the HTML-to-PDF fallback (exportPdf.ts) and
 * the react-pdf export (usePdfExport → SiteAnalysisPdfDocument).
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

export async function buildStaticMap(
  lat: number,
  lng: number,
  zoom = 14,
  width = 800,
  height = 350,
): Promise<string | null> {
  try {
    const n = Math.pow(2, zoom);
    const centerTileX = ((lng + 180) / 360) * n;
    const centerTileY =
      ((1 -
        Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
        2) *
      n;

    const tileSize = 256;
    const tilesX = Math.ceil(width / tileSize) + 1;
    const tilesY = Math.ceil(height / tileSize) + 1;

    const startTileX = Math.floor(centerTileX - tilesX / 2);
    const startTileY = Math.floor(centerTileY - tilesY / 2);

    const offsetX = width / 2 - (centerTileX - startTileX) * tileSize;
    const offsetY = height / 2 - (centerTileY - startTileY) * tileSize;

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
            return new Promise<{ img: HTMLImageElement; x: number; y: number } | null>(
              (resolve) => {
                const img = new Image();
                img.onload = () => resolve({ img, x: px, y: py });
                img.onerror = () => resolve(null);
                img.src = dataUrl;
              },
            );
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

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#E8E5E0';
    ctx.fillRect(0, 0, width, height);

    for (const tile of tiles) {
      ctx.drawImage(tile.img, tile.x, tile.y, tileSize, tileSize);
    }

    // Red marker pin at center
    const cx = width / 2;
    const cy = height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ED202B';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
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

// ── Grid context map (satellite + substation overlay) ──────────────────────

export interface GridMapSubstation {
  name: string;
  maxVolt: number;
  status: string;
  distanceMi: number;
  lat: number;
  lng: number;
}

function lngToTileX(lng: number, n: number): number {
  return ((lng + 180) / 360) * n;
}

function latToTileY(lat: number, n: number): number {
  return (
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
    n
  );
}

/**
 * Satellite map centered on the site with the nearby substations drawn on
 * top — markers colored by voltage class, labeled with kV. Zoom is fitted so
 * the site plus its closest transmission context is visible. Same ArcGIS
 * World Imagery tiles as buildStaticMap (no key, no per-request cost); the
 * PNG data URL drops straight into react-pdf and the result is deterministic,
 * unlike snapshotting a live WebGL map.
 */
export async function buildGridStaticMap(
  lat: number,
  lng: number,
  substations: GridMapSubstation[],
  width = 800,
  height = 420,
): Promise<string | null> {
  try {
    // Fit zoom to the site + substations within 8 mi (fall back to ~5 mi view).
    const shown = substations.filter((s) => s.distanceMi <= 8 && s.lat && s.lng).slice(0, 12);
    let zoom = 12;
    if (shown.length > 0) {
      const lats = [lat, ...shown.map((s) => s.lat)];
      const lngs = [lng, ...shown.map((s) => s.lng)];
      const lngSpan = Math.max(...lngs) - Math.min(...lngs);
      for (zoom = 14; zoom > 9; zoom--) {
        const n = Math.pow(2, zoom);
        const pxX = lngSpan * (n / 360) * 256;
        const pxY =
          Math.abs(latToTileY(Math.max(...lats), n) - latToTileY(Math.min(...lats), n)) * 256;
        if (pxX < width * 0.8 && pxY < height * 0.8) break;
      }
    }

    const n = Math.pow(2, zoom);
    const centerTileX = lngToTileX(lng, n);
    const centerTileY = latToTileY(lat, n);

    const tileSize = 256;
    const tilesX = Math.ceil(width / tileSize) + 1;
    const tilesY = Math.ceil(height / tileSize) + 1;
    const startTileX = Math.floor(centerTileX - tilesX / 2);
    const startTileY = Math.floor(centerTileY - tilesY / 2);
    const offsetX = width / 2 - (centerTileX - startTileX) * tileSize;
    const offsetY = height / 2 - (centerTileY - startTileY) * tileSize;

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
            return new Promise<{ img: HTMLImageElement; x: number; y: number } | null>(
              (resolve) => {
                const img = new Image();
                img.onload = () => resolve({ img, x: px, y: py });
                img.onerror = () => resolve(null);
                img.src = dataUrl;
              },
            );
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

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#E8E5E0';
    ctx.fillRect(0, 0, width, height);
    for (const tile of tiles) {
      ctx.drawImage(tile.img, tile.x, tile.y, tileSize, tileSize);
    }

    const project = (pLat: number, pLng: number) => ({
      x: width / 2 + (lngToTileX(pLng, n) - centerTileX) * tileSize,
      y: height / 2 + (latToTileY(pLat, n) - centerTileY) * tileSize,
    });

    const voltColor = (kv: number) => (kv >= 300 ? '#7C3AED' : kv >= 100 ? '#2563EB' : '#0D9488');

    // Substation markers: square, colored by voltage class, kV label with halo.
    for (const sub of shown) {
      const { x, y } = project(sub.lat, sub.lng);
      if (x < 8 || y < 8 || x > width - 8 || y > height - 8) continue;
      ctx.fillStyle = voltColor(sub.maxVolt);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.strokeRect(x - 6, y - 6, 12, 12);

      const label = `${Math.round(sub.maxVolt)} kV`;
      ctx.font = '600 11px Arial';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(label, x + 10, y);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, x + 10, y);
    }

    // Site pin (drawn last so it stays on top).
    const cx = width / 2;
    const cy = height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ED202B';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 6);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 5, cy - 6);
    ctx.fillStyle = '#ED202B';
    ctx.fill();

    // Legend chip (bottom-left).
    const legend: Array<[string, string]> = [
      ['#ED202B', 'Site'],
      ['#7C3AED', '345 kV+'],
      ['#2563EB', '100–345 kV'],
      ['#0D9488', '< 100 kV'],
    ];
    const lh = 18;
    const lw = 118;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(8, height - 8 - legend.length * lh - 8, lw, legend.length * lh + 8);
    legend.forEach(([color, label], i) => {
      const ly = height - 8 - (legend.length - i) * lh;
      ctx.fillStyle = color;
      ctx.fillRect(16, ly + 4, 10, 10);
      ctx.fillStyle = '#201F1E';
      ctx.font = '11px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 32, ly + 3);
    });

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
