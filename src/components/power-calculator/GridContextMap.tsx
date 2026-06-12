import { useMemo } from 'react';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { NearbySubstation } from '../../types';
import { cleanGridName } from '../../lib/exhibitA';

interface Props {
  lat: number;
  lng: number;
  substations: NearbySubstation[];
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
export default function GridContextMap({ lat, lng, substations }: Props) {
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

  return (
    <div>
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">Grid Context Map</h3>
      <div className="h-72 overflow-hidden rounded-xl border border-[#D8D5D0]">
        <Map
          initialViewState={initialViewState}
          mapStyle={SATELLITE_STYLE}
          attributionControl={false}
          dragRotate={false}
        >
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
