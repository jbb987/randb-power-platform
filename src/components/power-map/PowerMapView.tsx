import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { usePowerMap } from '../../hooks/usePowerMap';
import {
  AVAILABILITY_BINS,
  type MapPowerPlant,
} from '../../lib/powerMapData';
import { US_STATES } from '../../lib/stateBounds';
import MapLegend from './MapLegend';
import MapStats from './MapStats';
import PlantPopup from './PlantPopup';

/** Escape HTML special characters to prevent XSS in setHTML() popups. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const US_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 4 };

/** Generate a crisp lightning bolt icon (rendered at 2× for retina). */
function createBoltImage(size = 48): ImageData {
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
  ctx.fillStyle = '#F59E0B';
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

// Build match expression for substation availability colors
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
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const [showGenerators, setShowGenerators] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showSubstations, setShowSubstations] = useState(true);
  const [showAvailability, setShowAvailability] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && !map.hasImage('bolt')) {
      map.addImage('bolt', createBoltImage(), { pixelRatio: 2 });
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
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [US_VIEW.longitude, US_VIEW.latitude], zoom: US_VIEW.zoom, duration: 1000 });
    }
  }, [clearState]);

  // Substation counts by availability bin (single pass)
  const { subsRed, subsBlue, subsGreen } = useMemo(() => {
    let red = 0, blue = 0, green = 0;
    for (const s of substations) {
      if (s.availabilityBin === 0) red++;
      else if (s.availabilityBin === 1) blue++;
      else if (s.availabilityBin === 2) green++;
    }
    return { subsRed: red, subsBlue: blue, subsGreen: green };
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
        availableMW: s.availableMW,
        bin: s.availabilityBin,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  }), [substations]);

  // 10-mile radius zones around green substations (200+ MW available)
  const greenZonesGeoJSON: GeoJSON.FeatureCollection = useMemo(() => {
    const RADIUS_MI = 10;
    const MI_TO_DEG_LAT = 1 / 69.0; // ~69 miles per degree latitude
    const SEGMENTS = 48;

    const greenSubs = substations.filter((s) => s.availabilityBin === 2);
    const features: GeoJSON.Feature[] = greenSubs.map((s, i) => {
      const dLat = RADIUS_MI * MI_TO_DEG_LAT;
      const dLng = dLat / Math.cos((s.lat * Math.PI) / 180);
      const coords: [number, number][] = [];
      for (let j = 0; j <= SEGMENTS; j++) {
        const angle = (j / SEGMENTS) * 2 * Math.PI;
        coords.push([
          s.lng + dLng * Math.cos(angle),
          s.lat + dLat * Math.sin(angle),
        ]);
      }
      return {
        type: 'Feature' as const,
        id: i,
        properties: {
          name: s.name,
          availableMW: s.availableMW,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };
    });
    return { type: 'FeatureCollection', features };
  }, [substations]);

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

    // Remove any existing native popup before creating a new one
    activePopupRef.current?.remove();
    activePopupRef.current = null;

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
      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family: IBM Plex Sans, sans-serif; font-size: 13px;">
            <strong>${escapeHtml(props.owner || 'Unknown')}</strong><br/>
            Voltage: ${props.voltage ? `${escapeHtml(String(props.voltage))} kV` : 'N/A'}
          </div>`,
        )
        .addTo(map);
      activePopupRef.current = popup;
    }

    if (layer === 'substations') {
      const props = feature.properties;
      if (!props) return;
      const map = mapRef.current?.getMap();
      if (!map) return;
      const avail = Number(props.availableMW);
      const statusColor = avail >= 200 ? '#3B82F6' : avail > 0 ? '#F97316' : '#EF4444';
      const statusLabel = avail >= 200
        ? `${avail.toLocaleString()} MW`
        : avail > 0
          ? `${avail.toLocaleString()} MW`
          : 'No capacity';
      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family: IBM Plex Sans, sans-serif; font-size: 13px;">
            <strong>${escapeHtml(props.name || 'Unknown')}</strong><br/>
            Owner: ${escapeHtml(props.owner || 'N/A')}<br/>
            Max Voltage: ${props.maxVolt ? `${Number(props.maxVolt).toLocaleString()} kV` : 'N/A'}<br/>
            Lines: ${props.lineCount || 0}<br/>
            <span style="color: ${statusColor}; font-weight: 600;">
              Available: ${statusLabel}
            </span>
          </div>`,
        )
        .addTo(map);
      activePopupRef.current = popup;
    }
  }, []);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (showGenerators) ids.push('plant-points');
    if (showLines) ids.push('transmission-lines');
    if (showSubstations) ids.push('substations');
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

            {/* 10-mile radius zones around green substations */}
            {showAvailability && greenZonesGeoJSON.features.length > 0 && (
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

            {/* Transmission lines */}
            {showLines && lines.length > 0 && (
              <Source id="transmission-lines" type="geojson" data={linesGeoJSON}>
                <Layer
                  id="transmission-lines"
                  type="line"
                  paint={{
                    'line-color': '#201F1E',
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['get', 'voltage'],
                      0, 1,
                      100, 1.5,
                      345, 2.5,
                      765, 4,
                    ],
                    'line-opacity': 0.7,
                  }}
                />
              </Source>
            )}

            {/* Substations — colored by availability */}
            {showSubstations && substations.length > 0 && (
              <Source id="substations" type="geojson" data={substationsGeoJSON}>
                <Layer
                  id="substations"
                  type="circle"
                  paint={{
                    'circle-radius': showAvailability ? 6 : 3,
                    'circle-color': showAvailability
                      ? (binColorMatch as never)
                      : '#201F1E',
                    'circle-stroke-color': '#FFFFFF',
                    'circle-stroke-width': showAvailability ? 1.5 : 1,
                  }}
                />
              </Source>
            )}

            {/* Power plants — bolt icons sized by capacity */}
            {showGenerators && plants.length > 0 && (
              <Source id="power-plants" type="geojson" data={plantsGeoJSON}>
                <Layer
                  id="plant-points"
                  type="symbol"
                  layout={{
                    'icon-image': 'bolt',
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

          {/* Sidebar toggle (top-right, below nav controls) */}
          <div className="absolute top-[7.5rem] right-3 z-10">
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
            className={`absolute top-14 left-3 z-10 w-56 space-y-3 transition-all duration-300 max-h-[calc(100%-4.5rem)] overflow-y-auto ${
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
              showAvailability={showAvailability}
              onToggleAvailability={() => setShowAvailability(!showAvailability)}
              subsRed={subsRed}
              subsBlue={subsBlue}
              subsGreen={subsGreen}
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
