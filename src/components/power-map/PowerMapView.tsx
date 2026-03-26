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
  type MapBounds,
} from '../../lib/powerMapData';
import MapLegend from './MapLegend';
import MapStats from './MapStats';
import PlantPopup from './PlantPopup';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const INITIAL_VIEW = {
  longitude: -98.5,
  latitude: 39.8,
  zoom: 5,
};

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

// Build match expression for source colors
const sourceColorMatch: unknown[] = ['match', ['get', 'primarySource']];
for (const [source, color] of Object.entries(SOURCE_COLORS)) {
  sourceColorMatch.push(source, color);
}
sourceColorMatch.push('#9CA3AF'); // fallback

// Build match expression for source triangle icons
const sourceIconMatch: unknown[] = ['match', ['get', 'primarySource']];
for (const source of Object.keys(SOURCE_COLORS)) {
  sourceIconMatch.push(source, `triangle-${source.replace(/\s+/g, '-').toLowerCase()}`);
}
sourceIconMatch.push('triangle-other'); // fallback

// Build match expression for availability bin colors
const binColorMatch: unknown[] = ['match', ['get', 'bin']];
for (const { bin, color } of AVAILABILITY_BINS) {
  binColorMatch.push(bin, color);
}
binColorMatch.push('#D1D5DB'); // fallback

export default function PowerMapView() {
  const mapRef = useRef<MapRef>(null);
  const {
    plants,
    lines,
    substations,
    availability,
    totalAvailableMW,
    loading,
    loadData,
    zoomLevel,
    dataTruncated,
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

  const getBounds = useCallback((): MapBounds | null => {
    const map = mapRef.current;
    if (!map) return null;
    const bounds = map.getBounds();
    if (!bounds) return null;
    return {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
  }, []);

  const handleMoveEnd = useCallback(() => {
    const bounds = getBounds();
    const zoom = mapRef.current?.getZoom() ?? 5;
    if (bounds) loadData(bounds, zoom);
  }, [getBounds, loadData]);

  const handleLoad = useCallback(() => {
    // Register triangle icons for each source type
    const map = mapRef.current?.getMap();
    if (map) {
      for (const [source, color] of Object.entries(SOURCE_COLORS)) {
        const id = `triangle-${source.replace(/\s+/g, '-').toLowerCase()}`;
        if (!map.hasImage(id)) {
          map.addImage(id, createTriangleImage(color), { sdf: false });
        }
      }
    }

    const bounds = getBounds();
    const zoom = mapRef.current?.getZoom() ?? 5;
    if (bounds) loadData(bounds, zoom);
  }, [getBounds, loadData]);

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

  // Power plants as GeoJSON (for circle layer + clustering)
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

  // Substations as GeoJSON
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

  // Transmission lines as GeoJSON
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

  // Voronoi availability zones
  const availabilityGeoJSON = useMemo(() => {
    const bounds = dataBounds ?? getBounds();
    if (!bounds || availability.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return buildAvailabilityPolygons(availability, bounds);
  }, [availability, dataBounds, getBounds]);

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

    // Plant click
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

    // Cluster click — zoom in
    if (layer === 'plant-clusters') {
      const map = mapRef.current;
      if (map && feature.geometry.type === 'Point') {
        map.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: (map.getZoom() ?? 5) + 2,
        });
      }
      return;
    }

    // Transmission line click
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
    const ids: string[] = ['plant-points', 'plant-clusters'];
    if (showLines) ids.push('transmission-lines');
    return ids;
  }, [showLines]);

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        onMoveEnd={handleMoveEnd}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        cursor="default"
      >
        <NavigationControl position="top-right" />

        {/* Availability zones (Voronoi polygons) — render below everything */}
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

        {/* Substations (small dots) */}
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

        {/* Power plants (clustered GeoJSON layer) */}
        <Source
          id="power-plants"
          type="geojson"
          data={plantsGeoJSON}
          cluster={true}
          clusterMaxZoom={12}
          clusterRadius={50}
        >
          {/* Cluster circles */}
          <Layer
            id="plant-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': '#ED202B',
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                14, 10, 18, 50, 22, 100, 26,
              ],
              'circle-opacity': 0.85,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            }}
          />
          {/* Cluster count labels */}
          <Layer
            id="plant-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': '{point_count_abbreviated}',
              'text-size': 11,
            }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
          {/* Individual plant triangles */}
          <Layer
            id="plant-points"
            type="symbol"
            filter={['all', ['!', ['has', 'point_count']], sourceFilter] as never}
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
      </Map>

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-3 left-3 z-10 bg-white rounded-lg shadow-sm border border-[#D8D5D0] p-2 hover:bg-stone-50 transition"
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

      {/* Sidebar */}
      <div
        className={`absolute top-3 left-14 z-10 w-56 space-y-3 transition-all duration-300 max-h-[calc(100%-1.5rem)] overflow-y-auto ${
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
          dataTruncated={dataTruncated}
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

      {/* Zoom in banner */}
      {zoomLevel < 5 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-[#D8D5D0] px-6 py-4 text-center">
            <p className="font-heading font-semibold text-[#201F1E]">Zoom in to view power data</p>
            <p className="text-sm text-[#7A756E] mt-1">Power infrastructure loads at closer zoom levels</p>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-[#D8D5D0] px-4 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
          <span className="text-sm text-[#7A756E]">Loading power data...</span>
        </div>
      )}
    </div>
  );
}
