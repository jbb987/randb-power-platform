import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { usePowerMap } from '../../hooks/usePowerMap';
import {
  SOURCE_COLORS,
  AVAILABILITY_BINS,
  buildAvailabilityPolygons,
  type MapPowerPlant,
} from '../../lib/powerMapData';
import { US_STATES } from '../../lib/stateBounds';
import MapLegend from './MapLegend';
import MapStats from './MapStats';
import PlantPopup from './PlantPopup';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const US_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 4 };

/** Generate a triangle image for a given color, to use as MapLibre symbol icon. */
function createTriangleImage(color: string, size = 28): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // White border triangle
  const pad = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, pad);
  ctx.lineTo(size - pad, size - pad);
  ctx.lineTo(pad, size - pad);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Colored inner triangle
  const inset = 4;
  ctx.beginPath();
  ctx.moveTo(size / 2, inset + 1);
  ctx.lineTo(size - inset, size - inset);
  ctx.lineTo(inset, size - inset);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

// Build match expression for source triangle icons
const sourceIconMatch: unknown[] = ['match', ['get', 'primarySource']];
for (const source of Object.keys(SOURCE_COLORS)) {
  sourceIconMatch.push(source, `triangle-${source.replace(/\s+/g, '-').toLowerCase()}`);
}
sourceIconMatch.push('triangle-other');

// Build match expression for availability bin colors
const binColorMatch: unknown[] = ['match', ['get', 'bin']];
for (const { bin, color } of AVAILABILITY_BINS) {
  binColorMatch.push(bin, color);
}
binColorMatch.push('#D1D5DB');

export default function PowerMapView() {
  const mapRef = useRef<MapRef>(null);
  const {
    plants,
    lines,
    substations,
    availability,
    totalAvailableMW,
    loading,
    loadState,
    clearState,
    selectedState,
    bounds: dataBounds,
  } = usePowerMap();

  const [selectedPlant, setSelectedPlant] = useState<MapPowerPlant | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<string>>(
    new Set(Object.keys(SOURCE_COLORS)),
  );
  const [showLines, setShowLines] = useState(true);
  const [showSubstations, setShowSubstations] = useState(true);
  const [showAvailability, setShowAvailability] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Register triangle icons on map load
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      for (const [source, color] of Object.entries(SOURCE_COLORS)) {
        const id = `triangle-${source.replace(/\s+/g, '-').toLowerCase()}`;
        if (!map.hasImage(id)) {
          map.addImage(id, createTriangleImage(color), { sdf: false });
        }
      }
      setImagesLoaded(true);
    }
  }, []);

  // Select a state — zoom to it and load data
  const selectState = useCallback((abbr: string) => {
    const st = US_STATES.find((s) => s.abbr === abbr);
    if (!st) return;

    const map = mapRef.current;
    if (map) {
      map.fitBounds(
        [[st.lngMin, st.latMin], [st.lngMax, st.latMax]],
        { padding: 40, duration: 1000 },
      );
    }

    loadState(abbr);
  }, [loadState]);

  // Back to US view
  const backToUS = useCallback(() => {
    clearState();
    setSelectedPlant(null);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [US_VIEW.longitude, US_VIEW.latitude], zoom: US_VIEW.zoom, duration: 1000 });
    }
  }, [clearState]);

  const toggleSource = useCallback((source: string) => {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  // Filter plants by visible sources (for stats)
  const filteredPlants = useMemo(
    () => plants.filter((p) => visibleSources.has(p.primarySource)),
    [plants, visibleSources],
  );
  const filteredGenerationMW = useMemo(
    () => Math.round(filteredPlants.reduce((sum, p) => sum + p.capacityMW, 0)),
    [filteredPlants],
  );

  // Build source filter expression for MapLibre layer
  const sourceFilter = useMemo(
    (): maplibregl.FilterSpecification =>
      ['in', ['get', 'primarySource'], ['literal', [...visibleSources]]],
    [visibleSources],
  );

  // ── GeoJSON Sources ──────────────────────────────────────────────────────

  const plantsGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: plants.map((p, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        name: p.name,
        operator: p.operator,
        primarySource: p.primarySource,
        capacityMW: p.capacityMW,
        totalMW: p.totalMW,
        lat: p.lat,
        lng: p.lng,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat],
      },
    })),
  }), [plants]);

  const substationsGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: substations.map((s, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        name: s.name,
        owner: s.owner,
        maxVolt: s.maxVolt,
        lineCount: s.lineCount,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  }), [substations]);

  const linesGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: lines.map((line, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        voltage: line.voltage,
        owner: line.owner,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: line.coordinates,
      },
    })),
  }), [lines]);

  const availabilityGeoJSON = useMemo(() => {
    if (!dataBounds || availability.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return buildAvailabilityPolygons(availability, dataBounds);
  }, [availability, dataBounds]);

  // Close popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPlant(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle clicking on map layers
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    if (!e.features?.length) return;
    const feature = e.features[0];
    const layer = feature.layer?.id;

    if (layer === 'plant-points') {
      const props = feature.properties;
      if (props) {
        setSelectedPlant({
          name: props.name,
          operator: props.operator,
          primarySource: props.primarySource,
          capacityMW: Number(props.capacityMW),
          totalMW: Number(props.totalMW),
          lat: Number(props.lat),
          lng: Number(props.lng),
        });
      }
      return;
    }

    if (layer === 'transmission-lines') {
      const props = feature.properties;
      if (!props) return;
      const map = mapRef.current?.getMap();
      if (!map) return;
      new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family: IBM Plex Sans, sans-serif; font-size: 13px;">
            <strong>${props.owner || 'Unknown'}</strong><br/>
            Voltage: ${props.voltage ? `${props.voltage} kV` : 'N/A'}
          </div>`,
        )
        .addTo(map);
    }
  }, []);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = ['plant-points'];
    if (showLines) ids.push('transmission-lines');
    return ids;
  }, [showLines]);

  const stateLabel = selectedState
    ? US_STATES.find((s) => s.abbr === selectedState)?.name ?? selectedState
    : null;

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={US_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        interactiveLayerIds={selectedState ? interactiveLayerIds : []}
        onClick={selectedState ? handleClick : undefined}
        cursor="default"
      >
        <NavigationControl position="top-right" />

        {/* ── State data layers (only when a state is selected) ── */}
        {selectedState && imagesLoaded && (
          <>
            {/* Availability zones (Voronoi polygons) */}
            {showAvailability && (
              <Source id="availability-zones" type="geojson" data={availabilityGeoJSON}>
                <Layer
                  id="availability-zones-fill"
                  type="fill"
                  paint={{
                    'fill-color': binColorMatch as never,
                    'fill-opacity': 0.35,
                  }}
                />
                <Layer
                  id="availability-zones-outline"
                  type="line"
                  paint={{
                    'line-color': '#FFFFFF',
                    'line-width': 0.5,
                    'line-opacity': 0.3,
                  }}
                />
              </Source>
            )}

            {/* Transmission lines */}
            {showLines && (
              <Source id="transmission-lines" type="geojson" data={linesGeoJSON}>
                <Layer
                  id="transmission-lines"
                  type="line"
                  paint={{
                    'line-color': [
                      'interpolate',
                      ['linear'],
                      ['get', 'voltage'],
                      0, '#D8D5D0',
                      69, '#F59E0B',
                      138, '#F97316',
                      230, '#EF4444',
                      345, '#DC2626',
                      500, '#991B1B',
                      765, '#7F1D1D',
                    ],
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['get', 'voltage'],
                      0, 1.5,
                      100, 2.5,
                      345, 4,
                      765, 6,
                    ],
                    'line-opacity': 0.8,
                  }}
                />
              </Source>
            )}

            {/* Substations */}
            {showSubstations && (
              <Source id="substations" type="geojson" data={substationsGeoJSON}>
                <Layer
                  id="substations"
                  type="circle"
                  paint={{
                    'circle-radius': 3,
                    'circle-color': '#201F1E',
                    'circle-stroke-color': '#FFFFFF',
                    'circle-stroke-width': 1,
                  }}
                />
              </Source>
            )}

            {/* Power plants (no clustering — all rendered directly) */}
            <Source
              id="power-plants"
              type="geojson"
              data={plantsGeoJSON}
            >
              <Layer
                id="plant-points"
                type="symbol"
                filter={sourceFilter as never}
                layout={{
                  'icon-image': sourceIconMatch as never,
                  'icon-size': [
                    'interpolate',
                    ['linear'],
                    ['get', 'capacityMW'],
                    0, 0.6,
                    100, 0.9,
                    500, 1.2,
                    1000, 1.6,
                  ],
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                }}
              />
            </Source>

            {/* Selected plant popup */}
            {selectedPlant && (
              <Popup
                longitude={selectedPlant.lng}
                latitude={selectedPlant.lat}
                anchor="bottom"
                onClose={() => setSelectedPlant(null)}
                closeButton={false}
                offset={15}
              >
                <PlantPopup plant={selectedPlant} onClose={() => setSelectedPlant(null)} />
              </Popup>
            )}
          </>
        )}
      </Map>

      {/* ── State selection overlay (when no state is selected) ── */}
      {!selectedState && !loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-[#D8D5D0] p-6 max-w-md w-full mx-4 pointer-events-auto max-h-[80vh] flex flex-col">
            <h3 className="font-heading text-lg font-semibold text-[#201F1E] mb-1">
              Select a State
            </h3>
            <p className="text-sm text-[#7A756E] mb-4">
              Choose a state to load its power generators, transmission lines, and available capacity.
            </p>
            <div className="overflow-y-auto flex-1 -mx-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 px-1">
                {US_STATES
                  .filter((s) => s.abbr !== 'AK' && s.abbr !== 'HI')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <button
                      key={s.abbr}
                      onClick={() => selectState(s.abbr)}
                      className="px-2 py-2 text-sm text-[#201F1E] bg-stone-50 rounded-lg hover:bg-[#ED202B]/10 hover:text-[#ED202B] transition font-medium text-left truncate"
                      title={s.name}
                    >
                      {s.abbr}
                      <span className="text-xs text-[#7A756E] ml-1 hidden sm:inline">
                        {s.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar (only when state is selected) ── */}
      {selectedState && (
        <>
          {/* Back button + sidebar toggle */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <button
              onClick={backToUS}
              className="bg-white rounded-lg shadow-sm border border-[#D8D5D0] px-3 py-2 hover:bg-stone-50 transition flex items-center gap-1.5 text-sm font-medium text-[#201F1E] hover:text-[#ED202B]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {stateLabel}
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="bg-white rounded-lg shadow-sm border border-[#D8D5D0] p-2 hover:bg-stone-50 transition"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg
                className={`w-5 h-5 text-[#201F1E] transition-transform ${sidebarOpen ? 'rotate-0' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Sidebar panels */}
          <div
            className={`absolute top-14 left-3 z-10 w-56 space-y-3 transition-all duration-300 max-h-[calc(100%-4.5rem)] overflow-y-auto ${
              sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'
            }`}
          >
            <MapStats
              totalPlants={filteredPlants.length}
              totalGenerationMW={filteredGenerationMW}
              totalSubstations={substations.length}
              totalLines={lines.length}
              totalAvailableMW={totalAvailableMW}
              loading={loading}
            />
            <MapLegend
              visibleSources={visibleSources}
              onToggleSource={toggleSource}
              showLines={showLines}
              onToggleLines={() => setShowLines(!showLines)}
              showSubstations={showSubstations}
              onToggleSubstations={() => setShowSubstations(!showSubstations)}
              showAvailability={showAvailability}
              onToggleAvailability={() => setShowAvailability(!showAvailability)}
            />
          </div>
        </>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-[#D8D5D0] px-4 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
          <span className="text-sm text-[#7A756E]">Loading {stateLabel ?? 'state'} power data...</span>
        </div>
      )}
    </div>
  );
}
