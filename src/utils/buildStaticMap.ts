/**
 * Build a static satellite map image from ArcGIS World Imagery tiles.
 * Returns a PNG data URL string, or null on failure.
 *
 * Shared between the HTML-to-PDF fallback (exportPdf.ts) and
 * the react-pdf export (usePdfExport → PiddrPdfDocument).
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
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;

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
