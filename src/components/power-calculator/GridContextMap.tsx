import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { FeatureCollection, LineString } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { NearbySubstation } from '../../types';
import { cleanGridName } from '../../lib/exhibitA';
import { fetchTransmissionLines } from '../../lib/powerMapData';

interface Props {
  lat: number;
  lng: number;
  substations: NearbySubstation[];
  /** Site registry id — when present the analyzer link targets the site itself. */
  siteId?: string;
  /** Hide the "Grid Context Map" title + analyzer link (e.g. when embedded in the
   *  Site Briefing, which supplies its own caption). */
  hideHeader?: boolean;
  /** Draw the transmission-line backbone (live HIFLD fetch). Opt-in so the
   *  Power section isn't burdened with the extra request. */
  showLines?: boolean;
}

// Same keyless ArcGIS World Imagery tiles the PDF's static maps use.
const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri World Imagery',
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite' }],
};

const voltColor = (kv: number) => (kv >= 300 ? '#7C3AED' : kv >= 100 ? '#2563EB' : '#0D9488');

/**
 * Compact grid-context map for the Power Infrastructure section: site pin +
 * nearby substations colored by voltage class. Read-only companion to the
 * full Grid Power Analyzer — it renders only the analysis result already in
 * memory, no global dataset loads.
 */
export default function GridContextMap({
  lat,
  lng,
  substations,
  siteId,
  hideHeader,
  showLines,
}: Props) {
  const shown = useMemo(
    () => substations.filter((s) => s.lat && s.lng && s.distanceMi <= 8).slice(0, 12),
    [substations],
  );

  const initialViewState = useMemo(() => {
    const lats = [lat, ...shown.map((s) => s.lat)];
    const lngs = [lng, ...shown.map((s) => s.lng)];
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const span = Math.max(latSpan, lngSpan);
    const zoom = span > 0.15 ? 10 : span > 0.07 ? 11 : span > 0.03 ? 12 : 13;
    return {
      latitude: (Math.max(...lats) + Math.min(...lats)) / 2,
      longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2,
      zoom,
    };
  }, [lat, lng, shown]);

  // Transmission-line geometry isn't stored on the site — fetch it live (same
  // HIFLD layer the Grid Analyzer uses) so the map shows the grid backbone, not
  // just substation dots. Each feature carries its voltage color for the paint.
  const [linesGeoJSON, setLinesGeoJSON] = useState<FeatureCollection<LineString> | null>(null);
  useEffect(() => {
    if (!showLines) return;
    const controller = new AbortController();
    const d = 0.12;
    fetchTransmissionLines(
      { west: lng - d, east: lng + d, south: lat - d, north: lat + d },
      controller.signal,
    )
      .then((lines) =>
        setLinesGeoJSON({
          type: 'FeatureCollection',
          features: lines
            .filter((l) => l.coordinates.length >= 2)
            .map((l) => ({
              type: 'Feature',
              properties: { color: voltColor(l.voltage) },
              geometry: { type: 'LineString', coordinates: l.coordinates },
            })),
        }),
      )
      .catch(() => {}); // map still renders without lines
    return () => controller.abort();
  }, [lat, lng, showLines]);

  return (
    <div>
      {!hideHeader && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E]">Grid Context Map</h3>
          <Link
            to={
              siteId
                ? `/grid-power-analyzer?siteId=${siteId}`
                : `/grid-power-analyzer?lat=${lat}&lng=${lng}`
            }
            className="flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition"
          >
            Open in Grid Power Analyzer
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </Link>
        </div>
      )}
      <div className="h-72 overflow-hidden rounded-xl border border-[#D8D5D0]">
        <Map
          initialViewState={initialViewState}
          mapStyle={SATELLITE_STYLE}
          attributionControl={false}
          dragRotate={false}
        >
          {linesGeoJSON && (
            <Source id="grid-lines" type="geojson" data={linesGeoJSON}>
              {/* white casing under the colored line for contrast on satellite */}
              <Layer
                id="grid-lines-casing"
                type="line"
                paint={{ 'line-color': '#FFFFFF', 'line-opacity': 0.55, 'line-width': 3.5 }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              />
              <Layer
                id="grid-lines-color"
                type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              />
            </Source>
          )}
          {shown.map((sub, i) => (
            <Marker key={i} latitude={sub.lat} longitude={sub.lng} anchor="center">
              <div
                title={`${cleanGridName(sub.name)} — ${Math.round(sub.maxVolt)} kV, ${sub.distanceMi.toFixed(1)} mi`}
                className="flex items-center gap-1"
              >
                <span
                  className="block h-3 w-3 border-2 border-white shadow"
                  style={{ backgroundColor: voltColor(sub.maxVolt) }}
                />
                <span
                  className="text-[10px] font-semibold text-white"
                  style={{ textShadow: '0 0 3px rgba(0,0,0,0.9)' }}
                >
                  {Math.round(sub.maxVolt)} kV
                </span>
              </div>
            </Marker>
          ))}
          <Marker latitude={lat} longitude={lng} anchor="bottom">
            <svg width="26" height="32" viewBox="0 0 26 32">
              <path
                d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 19 13 19s13-9.3 13-19C26 5.8 20.2 0 13 0z"
                fill="#ED202B"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
              <circle cx="13" cy="12.5" r="4.5" fill="#FFFFFF" />
            </svg>
          </Marker>
        </Map>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#7A756E]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ED202B]" /> Site
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-[#7C3AED]" /> 345 kV+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-[#2563EB]" /> 100–345 kV
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-[#0D9488]" /> &lt; 100 kV
        </span>
      </div>
    </div>
  );
}
