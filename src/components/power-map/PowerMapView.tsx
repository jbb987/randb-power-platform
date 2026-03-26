import { useRef, useState, useCallback, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { usePowerMap } from '../../hooks/usePowerMap';
import {
  getSourceColor,
  SOURCE_COLORS,
  type MapPowerPlant,
  type MapBounds,
} from '../../lib/powerMapData';
import MapLegend from './MapLegend';
import MapStats from './MapStats';
import PlantPopup from './PlantPopup';

// Free tile provider — OpenFreeMap (no API key)
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const INITIAL_VIEW = {
  longitude: -98.5,
  latitude: 39.8,
  zoom: 5,
};

export default function PowerMapView() {
  const mapRef = useRef<MapRef>(null);
  const {
    plants,
    lines,
    substations,
    availability,
    totalGenerationMW,
    totalAvailableMW,
    loading,
    loadData,
  } = usePowerMap();

  const [selectedPlant, setSelectedPlant] = useState<MapPowerPlant | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<string>>(
    new Set(Object.keys(SOURCE_COLORS)),
  );
  const [showLines, setShowLines] = useState(true);
  const [showSubstations, setShowSubstations] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
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
    if (bounds) loadData(bounds);
  }, [getBounds, loadData]);

  const handleLoad = useCallback(() => {
    const bounds = getBounds();
    if (bounds) loadData(bounds);
  }, [getBounds, loadData]);

  const toggleSource = useCallback((source: string) => {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  // Filter plants by visible sources
  const filteredPlants = plants.filter((p) => visibleSources.has(p.primarySource));

  // Build GeoJSON for transmission lines
  const linesGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: lines.map((line, i) => ({
      type: 'Feature',
      id: i,
      properties: {
        voltage: line.voltage,
        owner: line.owner,
      },
      geometry: {
        type: 'LineString',
        coordinates: line.coordinates,
      },
    })),
  };

  // Build GeoJSON for availability heat map
  const heatmapGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: availability.map((pt, i) => ({
      type: 'Feature',
      id: i,
      properties: {
        intensity: pt.intensity,
        availableMW: pt.availableMW,
      },
      geometry: {
        type: 'Point',
        coordinates: [pt.lng, pt.lat],
      },
    })),
  };

  // Close popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPlant(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle clicking on transmission line
  const handleLineClick = useCallback((e: MapLayerMouseEvent) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties;
    if (!props) return;
    // Show a simple popup via native maplibre
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
  }, []);

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        onMoveEnd={handleMoveEnd}
        interactiveLayerIds={showLines ? ['transmission-lines'] : []}
        onClick={handleLineClick}
        cursor="default"
      >
        <NavigationControl position="top-right" />

        {/* Transmission lines layer */}
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
                  0, 0.5,
                  100, 1,
                  345, 2,
                  765, 3,
                ],
                'line-opacity': 0.7,
              }}
            />
          </Source>
        )}

        {/* Availability heatmap */}
        {showHeatmap && (
          <Source id="availability-heatmap" type="geojson" data={heatmapGeoJSON}>
            <Layer
              id="availability-heatmap"
              type="heatmap"
              paint={{
                'heatmap-weight': ['get', 'intensity'],
                'heatmap-intensity': 1.5,
                'heatmap-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  4, 15,
                  7, 30,
                  10, 50,
                ],
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(0,0,0,0)',
                  0.1, 'rgba(59,130,246,0.3)',
                  0.3, 'rgba(59,130,246,0.5)',
                  0.5, 'rgba(139,92,246,0.5)',
                  0.7, 'rgba(239,68,68,0.5)',
                  1, 'rgba(239,68,68,0.7)',
                ],
                'heatmap-opacity': 0.6,
              }}
            />
          </Source>
        )}

        {/* Substation markers */}
        {showSubstations &&
          substations.map((sub) => (
            <Marker
              key={`sub-${sub.name}-${sub.lat}-${sub.lng}`}
              longitude={sub.lng}
              latitude={sub.lat}
              anchor="center"
            >
              <div
                className="w-3 h-3 bg-[#201F1E] border-2 border-white rounded-sm shadow-sm cursor-pointer"
                title={`${sub.name} (${sub.maxVolt} kV, ${sub.lineCount} lines)`}
              />
            </Marker>
          ))}

        {/* Power plant markers */}
        {filteredPlants.map((plant) => (
          <Marker
            key={`plant-${plant.name}-${plant.lat}-${plant.lng}`}
            longitude={plant.lng}
            latitude={plant.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedPlant(plant);
            }}
          >
            <div
              className="rounded-full border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-125"
              style={{
                backgroundColor: getSourceColor(plant.primarySource),
                width: Math.max(10, Math.min(24, 6 + plant.capacityMW / 50)),
                height: Math.max(10, Math.min(24, 6 + plant.capacityMW / 50)),
              }}
              title={`${plant.name} — ${plant.capacityMW} MW (${plant.primarySource})`}
            />
          </Marker>
        ))}

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
        className={`absolute top-3 left-14 z-10 w-56 space-y-3 transition-all duration-300 ${
          sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'
        }`}
      >
        <MapStats
          totalPlants={filteredPlants.length}
          totalGenerationMW={totalGenerationMW}
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
          showHeatmap={showHeatmap}
          onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
        />
      </div>

      {/* Loading indicator overlay */}
      {loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-[#D8D5D0] px-4 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
          <span className="text-sm text-[#7A756E]">Loading power data...</span>
        </div>
      )}
    </div>
  );
}
