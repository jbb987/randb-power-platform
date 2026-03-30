import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { usePowerMap } from '../../hooks/usePowerMap';
import {
  AVAILABILITY_BINS,
  STATUS_COLORS,
  STATUS_LABELS,
  type MapPowerPlant,
} from '../../lib/powerMapData';
import { US_STATES } from '../../lib/stateBounds';
import MapLegend from './MapLegend';
import MapStats from './MapStats';
import PlantPopup from './PlantPopup';

interface LinePopupData {
  owner: string;
  voltage: number;
  status: string;
  lng: number;
  lat: number;
}

interface SubstationPopupData {
  name: string;
  owner: string;
  status: string;
  maxVolt: number;
  lineCount: number;
  availableMW: number;
  lng: number;
  lat: number;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const US_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 4 };

/** Generate a crisp lightning bolt icon (rendered at 2× for retina). */
function createBoltImage(color: string, size = 48): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const s = size / 24; // scale factor from base 24

  ctx.beginPath();
  ctx.moveTo(cx + 2 * s, 2 * s);
  ctx.lineTo(cx - 6 * s, size * 0.48);
  ctx.lineTo(cx - 1 * s, size * 0.48);
  ctx.lineTo(cx - 4 * s, size - 2 * s);
  ctx.lineTo(cx + 6 * s, size * 0.42);
  ctx.lineTo(cx + 1 * s, size * 0.42);
  ctx.closePath();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2 * s;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

// Build match expression for substation availability colors (active only)
const binColorMatch: unknown[] = ['match', ['get', 'bin']];
for (const { bin, color } of AVAILABILITY_BINS) {
  binColorMatch.push(bin, color);
}
binColorMatch.push('#201F1E');

export default function PowerMapView() {
  const mapRef = useRef<MapRef>(null);
  const {
    plants,
    lines,
    substations,
    totalCapacityMW,
    totalDemandMW,
    stateBoundary,
    loading,
    error,
    loadState,
    clearState,
    selectedState,
  } = usePowerMap();

  const [selectedPlant, setSelectedPlant] = useState<MapPowerPlant | null>(null);
  const [selectedLine, setSelectedLine] = useState<LinePopupData | null>(null);
  const [selectedSubstation, setSelectedSubstation] = useState<SubstationPopupData | null>(null);
  const [showGenerators, setShowGenerators] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showSubstations, setShowSubstations] = useState(true);
  /** Which availability bins are visible (all on by default) */
  const [visibleBins, setVisibleBins] = useState<Set<number>>(new Set([0, 1, 2]));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      // Active plant bolt (green)
      if (!map.hasImage('bolt')) {
        map.addImage('bolt', createBoltImage('#22C55E'), { pixelRatio: 2 });
      }
      // Planned plant bolt (yellow)
      if (!map.hasImage('bolt-planned')) {
        map.addImage('bolt-planned', createBoltImage(STATUS_COLORS.planned), { pixelRatio: 2 });
      }
      // Retired plant bolt (grey)
      if (!map.hasImage('bolt-retired')) {
        map.addImage('bolt-retired', createBoltImage(STATUS_COLORS.retired), { pixelRatio: 2 });
      }
    }
    setMapReady(true);
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
    setSelectedLine(null);
    setSelectedSubstation(null);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [US_VIEW.longitude, US_VIEW.latitude], zoom: US_VIEW.zoom, duration: 1000 });
    }
  }, [clearState]);

  // Substation counts by availability bin (active substations only)
  const { subsRed, subsOrange, subsBlue } = useMemo(() => {
    let red = 0, orange = 0, blue = 0;
    for (const s of substations) {
      if (s.status !== 'active') continue;
      if (s.availabilityBin === 0) red++;
      else if (s.availabilityBin === 1) orange++;
      else if (s.availabilityBin === 2) blue++;
    }
    return { subsRed: red, subsOrange: orange, subsBlue: blue };
  }, [substations]);

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
        status: p.status,
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
        status: s.status,
        maxVolt: s.maxVolt,
        lineCount: s.lineCount,
        availableMW: s.availableMW,
        bin: s.availabilityBin,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  }), [substations]);

  // 10-mile radius zones around bin-2 active substations (200+ MW available).
  const greenZonesGeoJSON: GeoJSON.FeatureCollection = useMemo(() => {
    const RADIUS_MI = 10;
    const MI_TO_DEG_LAT = 1 / 69.0;
    const SEGMENTS = 48;

    const bin2Features = substationsGeoJSON.features.filter(
      (f) => f.properties?.bin === 2 && f.properties?.status === 'active',
    );
    const features: GeoJSON.Feature[] = bin2Features.map((f, i) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const dLat = RADIUS_MI * MI_TO_DEG_LAT;
      const dLng = dLat / Math.cos((lat * Math.PI) / 180);
      const coords: [number, number][] = [];
      for (let j = 0; j <= SEGMENTS; j++) {
        const angle = (j / SEGMENTS) * 2 * Math.PI;
        coords.push([
          lng + dLng * Math.cos(angle),
          lat + dLat * Math.sin(angle),
        ]);
      }
      return {
        type: 'Feature' as const,
        id: i,
        properties: {
          name: f.properties?.name ?? '',
          availableMW: f.properties?.availableMW ?? 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };
    });
    return { type: 'FeatureCollection', features };
  }, [substationsGeoJSON]);

  const linesGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: lines.map((line, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        voltage: line.voltage,
        owner: line.owner,
        status: line.status,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: line.coordinates,
      },
    })),
  }), [lines]);

  // Close popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPlant(null);
        setSelectedLine(null);
        setSelectedSubstation(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close all popups, then open the one for the clicked layer
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    setSelectedPlant(null);
    setSelectedLine(null);
    setSelectedSubstation(null);

    if (!e.features?.length) return;
    const feature = e.features[0];
    const layer = feature.layer?.id;
    const props = feature.properties;
    if (!props) return;

    if (layer === 'plant-points') {
      setSelectedPlant({
        name: props.name,
        operator: props.operator,
        primarySource: props.primarySource,
        capacityMW: Number(props.capacityMW),
        totalMW: Number(props.totalMW),
        status: props.status ?? 'active',
        lat: Number(props.lat),
        lng: Number(props.lng),
      });
    } else if (layer === 'transmission-lines') {
      setSelectedLine({
        owner: props.owner || 'Unknown',
        voltage: Number(props.voltage) || 0,
        status: props.status ?? 'active',
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    } else if (layer === 'substations' || layer === 'substations-inactive') {
      setSelectedSubstation({
        name: props.name || 'Unknown',
        owner: props.owner || 'N/A',
        status: props.status ?? 'active',
        maxVolt: Number(props.maxVolt) || 0,
        lineCount: Number(props.lineCount) || 0,
        availableMW: Number(props.availableMW) || 0,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    }
  }, []);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (showGenerators) ids.push('plant-points');
    if (showLines) ids.push('transmission-lines');
    if (showSubstations) {
      ids.push('substations');
      ids.push('substations-inactive');
    }
    return ids;
  }, [showGenerators, showLines, showSubstations]);

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
        aria-label="Interactive power generation and transmission map"
      >
        <NavigationControl position="top-right" />

        {/* ── State data layers (only when a state is selected) ── */}
        {selectedState && mapReady && (
          <>
            {/* State boundary — dotted red outline */}
            {stateBoundary.features.length > 0 && (
              <Source id="state-boundary" type="geojson" data={stateBoundary}>
                <Layer
                  id="state-boundary-line"
                  type="line"
                  paint={{
                    'line-color': '#ED202B',
                    'line-width': 2,
                    'line-opacity': 0.5,
                  }}
                  layout={{
                    'line-cap': 'round',
                    'line-join': 'round',
                  }}
                />
              </Source>
            )}

            {/* 10-mile radius zones around bin-2 active substations */}
            {visibleBins.has(2) && greenZonesGeoJSON.features.length > 0 && (
              <Source id="green-zones" type="geojson" data={greenZonesGeoJSON}>
                <Layer
                  id="green-zones-fill"
                  type="fill"
                  paint={{
                    'fill-color': '#3B82F6',
                    'fill-opacity': 0.1,
                  }}
                />
                <Layer
                  id="green-zones-outline"
                  type="line"
                  paint={{
                    'line-color': '#3B82F6',
                    'line-width': 1,
                    'line-opacity': 0.4,
                  }}
                />
              </Source>
            )}

            {/* Transmission lines — color by status */}
            {showLines && lines.length > 0 && (
              <Source id="transmission-lines" type="geojson" data={linesGeoJSON}>
                <Layer
                  id="transmission-lines"
                  type="line"
                  paint={{
                    'line-color': [
                      'match',
                      ['get', 'status'],
                      'planned', STATUS_COLORS.planned,
                      'retired', STATUS_COLORS.retired,
                      STATUS_COLORS.active,
                    ] as never,
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['get', 'voltage'],
                      0, 1,
                      100, 1.5,
                      345, 2.5,
                      765, 4,
                    ],
                    'line-opacity': [
                      'match',
                      ['get', 'status'],
                      'planned', 0.6,
                      'retired', 0.4,
                      0.7,
                    ] as never,
                    'line-dasharray': [1, 0], // solid by default; see below
                  }}
                />
                {/* Dashed overlay for non-active lines */}
                <Layer
                  id="transmission-lines-dashed"
                  type="line"
                  filter={['!=', ['get', 'status'], 'active']}
                  paint={{
                    'line-color': [
                      'match',
                      ['get', 'status'],
                      'planned', STATUS_COLORS.planned,
                      'retired', STATUS_COLORS.retired,
                      STATUS_COLORS.active,
                    ] as never,
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['get', 'voltage'],
                      0, 1,
                      100, 1.5,
                      345, 2.5,
                      765, 4,
                    ],
                    'line-opacity': [
                      'match',
                      ['get', 'status'],
                      'planned', 0.6,
                      'retired', 0.4,
                      0.7,
                    ] as never,
                    'line-dasharray': [4, 3],
                  }}
                />
              </Source>
            )}

            {/* Substations — inactive (planned/retired) as outline circles */}
            {showSubstations && substations.length > 0 && (
              <Source id="substations" type="geojson" data={substationsGeoJSON}>
                {/* Inactive substations: yellow or grey dashed outline, no fill */}
                <Layer
                  id="substations-inactive"
                  type="circle"
                  filter={['!=', ['get', 'status'], 'active']}
                  paint={{
                    'circle-radius': 5,
                    'circle-color': 'transparent',
                    'circle-stroke-color': [
                      'match',
                      ['get', 'status'],
                      'planned', STATUS_COLORS.planned,
                      'retired', STATUS_COLORS.retired,
                      '#201F1E',
                    ] as never,
                    'circle-stroke-width': 2,
                    'circle-opacity': 0.6,
                    'circle-stroke-opacity': 0.6,
                  }}
                />
                {/* Active substations: solid fill by availability bin */}
                <Layer
                  id="substations"
                  type="circle"
                  filter={[
                    'all',
                    ['==', ['get', 'status'], 'active'],
                    ...(visibleBins.size < 3
                      ? [['in', ['get', 'bin'], ['literal', [...visibleBins]]]]
                      : []),
                  ] as never}
                  paint={{
                    'circle-radius': 6,
                    'circle-color': binColorMatch as never,
                    'circle-stroke-color': '#FFFFFF',
                    'circle-stroke-width': 1.5,
                  }}
                />
              </Source>
            )}

            {/* Power plants — bolt icons colored by status */}
            {showGenerators && plants.length > 0 && (
              <Source id="power-plants" type="geojson" data={plantsGeoJSON}>
                <Layer
                  id="plant-points"
                  type="symbol"
                  layout={{
                    'icon-image': [
                      'match',
                      ['get', 'status'],
                      'planned', 'bolt-planned',
                      'retired', 'bolt-retired',
                      'bolt',
                    ] as never,
                    'icon-size': [
                      'interpolate',
                      ['linear'],
                      ['get', 'capacityMW'],
                      0, 0.5,
                      100, 0.8,
                      500, 1.2,
                      1000, 1.6,
                    ],
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{
                    'icon-opacity': [
                      'match',
                      ['get', 'status'],
                      'planned', 0.6,
                      'retired', 0.4,
                      1,
                    ] as never,
                  }}
                />
              </Source>
            )}

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

            {/* Selected transmission line popup */}
            {selectedLine && (
              <Popup
                longitude={selectedLine.lng}
                latitude={selectedLine.lat}
                anchor="bottom"
                onClose={() => setSelectedLine(null)}
                closeButton
                offset={10}
              >
                <div className="p-2 min-w-[180px]">
                  <h4 className="font-heading font-semibold text-sm text-[#201F1E] mb-1">
                    {selectedLine.owner}
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#7A756E]">Voltage</span>
                      <span className="font-medium text-[#201F1E]">
                        {selectedLine.voltage ? `${selectedLine.voltage.toLocaleString()} kV` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#7A756E]">Status</span>
                      <span
                        className="font-semibold text-xs"
                        style={{ color: STATUS_COLORS[selectedLine.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.active }}
                      >
                        {STATUS_LABELS[selectedLine.status] ?? 'In Service'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            )}

            {/* Selected substation popup */}
            {selectedSubstation && (
              <Popup
                longitude={selectedSubstation.lng}
                latitude={selectedSubstation.lat}
                anchor="bottom"
                onClose={() => setSelectedSubstation(null)}
                closeButton
                offset={10}
              >
                <div className="p-2 min-w-[200px]">
                  <h4 className="font-heading font-semibold text-sm text-[#201F1E] mb-2">
                    {selectedSubstation.name}
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#7A756E]">Status</span>
                      <span
                        className="font-semibold text-xs"
                        style={{ color: STATUS_COLORS[selectedSubstation.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.active }}
                      >
                        {STATUS_LABELS[selectedSubstation.status] ?? 'In Service'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#7A756E]">Max Voltage</span>
                      <span className="font-medium text-[#201F1E]">
                        {selectedSubstation.maxVolt ? `${selectedSubstation.maxVolt.toLocaleString()} kV` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#7A756E]">Lines</span>
                      <span className="font-medium text-[#201F1E]">{selectedSubstation.lineCount}</span>
                    </div>
                    {selectedSubstation.status === 'active' && (() => {
                      const avail = selectedSubstation.availableMW;
                      const color = avail >= 200 ? '#3B82F6' : avail > 0 ? '#F97316' : '#EF4444';
                      const label = avail <= 0 ? 'No capacity' : `${avail.toLocaleString()} MW`;
                      return (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#7A756E]">Available</span>
                          <span className="font-semibold" style={{ color }}>{label}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
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
          {/* Back button (top-left) */}
          <div className="absolute top-3 left-3 z-10">
            <button
              onClick={backToUS}
              className="bg-white rounded-lg shadow-sm border border-[#D8D5D0] px-3 py-2 hover:bg-stone-50 transition flex items-center gap-1.5 text-sm font-medium text-[#201F1E] hover:text-[#ED202B]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {stateLabel}
            </button>
          </div>

          {/* Sidebar toggle (left side, below back button) */}
          <div className="absolute top-14 left-3 z-10">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="bg-white rounded-lg shadow-sm border border-[#D8D5D0] p-2 hover:bg-stone-50 transition"
              title={sidebarOpen ? 'Hide legend' : 'Show legend'}
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
            className={`absolute top-[5.5rem] left-3 z-10 w-56 space-y-3 transition-all duration-300 max-h-[calc(100%-6rem)] overflow-y-auto ${
              sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'
            }`}
          >
            <MapStats
              totalPlants={plants.length}
              totalCapacityMW={totalCapacityMW}
              totalDemandMW={totalDemandMW}
              totalSubstations={substations.length}
              totalLines={lines.length}
              loading={loading}
            />
            <MapLegend
              showGenerators={showGenerators}
              onToggleGenerators={() => setShowGenerators(!showGenerators)}
              showLines={showLines}
              onToggleLines={() => setShowLines(!showLines)}
              showSubstations={showSubstations}
              onToggleSubstations={() => setShowSubstations(!showSubstations)}
              subsRed={subsRed}
              subsOrange={subsOrange}
              subsBlue={subsBlue}
              visibleBins={visibleBins}
              onToggleBin={(bin) => {
                const next = new Set(visibleBins);
                if (next.has(bin)) next.delete(bin);
                else next.add(bin);
                setVisibleBins(next);
              }}
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

      {/* Error banner */}
      {error && !loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-sm border border-[#ED202B]/30 px-5 py-3 max-w-md text-center">
          <p className="text-sm font-medium text-[#ED202B] mb-1">Failed to load power data</p>
          <p className="text-xs text-[#7A756E]">{error}</p>
        </div>
      )}
    </div>
  );
}
