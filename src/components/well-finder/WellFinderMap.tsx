import { useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import {
  countWells,
  fetchWells,
  getPmtilesUrl,
  isPmtilesPath,
  lookupWellByApi,
  PERMIAN_VIEW,
  STATUS_COLORS,
  ALL_WELL_STATUSES,
  DEFAULT_VISIBLE_STATUSES,
  type RrcWell,
  type WellStatus,
} from '../../lib/wellFinderRrc';
import WellPopup from './WellPopup';
import WellFilters from './WellFilters';
import WellTable from './WellTable';
import RecentActivity from './RecentActivity';
import type { Sb1150Bucket } from '../../lib/sb1150';
import { useTopCandidates } from '../../hooks/useTopCandidates';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** Tippecanoe defaults the source-layer to the input filename stem. */
const PMTILES_SOURCE_LAYER = 'wells';

/** Register the pmtiles protocol once at module load. */
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  // react-map-gl's maplibre lazy-imports its own bundle; we register on the
  // imported maplibregl as well, which is the same module instance.
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

interface SelectedWell {
  api: string;
  status: string;
  lat: number;
  lng: number;
}

interface ViewportWell {
  api: string;
  status: string;
  lat: number;
  lng: number;
}

export default function WellFinderMap() {
  const mapRef = useRef<MapRef>(null);
  const configuredPmtiles = useMemo(() => getPmtilesUrl(), []);
  const usePmtiles = configuredPmtiles != null;

  const [visible, setVisible] = useState<Set<WellStatus>>(
    () => new Set(DEFAULT_VISIBLE_STATUSES),
  );
  const [selected, setSelected] = useState<SelectedWell | null>(null);

  // Resolved PMTiles URL — equals configuredPmtiles when it's a full URL,
  // or the result of Firebase Storage getDownloadURL when it's a storage path.
  const [resolvedPmtilesUrl, setResolvedPmtilesUrl] = useState<string | null>(null);
  const [pmtilesError, setPmtilesError] = useState<string | null>(null);

  // Live-RRC mode state
  const [liveWells, setLiveWells] = useState<RrcWell[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTruncated, setLiveTruncated] = useState(false);

  // Status counts (computed per-mode)
  const [counts, setCounts] = useState<Partial<Record<WellStatus, number>>>({});

  // Phase 4: sidebar filters
  const [operatorFilter, setOperatorFilter] = useState('');
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [minMonthsInactive, setMinMonthsInactive] = useState(0);
  const [sb1150Filter, setSb1150Filter] = useState<'any' | Sb1150Bucket>('any');
  const [minScore, setMinScore] = useState(0);
  const [limitToView, setLimitToView] = useState(false);

  // Statewide candidates from Firestore (default mode). Re-queries when
  // the indexable filters (orphanOnly, minScore) change.
  const { candidates, loading: candidatesLoading } = useTopCandidates({
    orphanOnly,
    minScore,
    limit: 2000,
  });

  // Wells currently visible in the map viewport — extracted via
  // queryRenderedFeatures after the map idles.
  const [viewportWells, setViewportWells] = useState<ViewportWell[]>([]);

  // Register pmtiles protocol on first render if we'll use it.
  useEffect(() => {
    if (usePmtiles) ensurePmtilesProtocol();
  }, [usePmtiles]);

  // Resolve the configured PMTiles URL. If it's already an https URL, use as-is.
  // If it's a Firebase Storage path, resolve it via getDownloadURL.
  useEffect(() => {
    if (!configuredPmtiles) {
      setResolvedPmtilesUrl(null);
      return;
    }
    if (!isPmtilesPath(configuredPmtiles)) {
      setResolvedPmtilesUrl(configuredPmtiles);
      return;
    }
    let cancelled = false;
    setPmtilesError(null);
    getDownloadURL(storageRef(storage, configuredPmtiles))
      .then((url) => {
        if (!cancelled) setResolvedPmtilesUrl(url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to resolve PMTiles URL';
        console.error('[WellFinder] getDownloadURL failed:', err);
        setPmtilesError(msg);
        setResolvedPmtilesUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [configuredPmtiles]);

  // ── Status counts (true totals from RRC, regardless of loaded data) ──
  // Runs in both PMTiles and live modes — each status's `count` query is
  // cheap (returnCountOnly=true), and the cachedFetch wrapper dedupes
  // across re-renders.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ALL_WELL_STATUSES.map(async (s) => {
        try {
          const c = await countWells({ statuses: [s] });
          return [s, c] as const;
        } catch {
          return [s, 0] as const;
        }
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      const next: Partial<Record<WellStatus, number>> = {};
      for (const [s, c] of entries) next[s] = c;
      setCounts(next);
    });
    return () => controller.abort();
  }, []);

  // ── Mode B: Live RRC — paginated PER-STATUS fetch ──
  // Per-status pagination is essential: RRC orders by OBJECTID which skews
  // results to the oldest wells in the dataset. A flat statewide cap would
  // miss every modern Permian/Eagle Ford well. Per-status with a 5K cap
  // gives representative coverage for status types we care about (shut-in
  // is only a few thousand total, so loaded fully).
  useEffect(() => {
    if (usePmtiles) return;

    const controller = new AbortController();
    setLiveLoading(true);
    setLiveError(null);
    setLiveProgress(0);
    setLiveTruncated(false);

    const statusList = Array.from(visible);
    if (statusList.length === 0) {
      setLiveWells([]);
      setLiveLoading(false);
      return;
    }

    const PER_STATUS_CAP = 5000;

    (async () => {
      try {
        const all: RrcWell[] = [];
        let truncatedAny = false;
        for (const status of statusList) {
          if (controller.signal.aborted) return;
          const res = await fetchWells({
            statuses: [status],
            maxRecords: PER_STATUS_CAP,
            signal: controller.signal,
            onProgress: (n) => {
              if (!controller.signal.aborted) {
                setLiveProgress(all.length + n);
              }
            },
          });
          all.push(...res.wells);
          if (res.truncated) truncatedAny = true;
        }
        if (controller.signal.aborted) return;
        setLiveWells(all);
        setLiveTruncated(truncatedAny);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLiveError(err instanceof Error ? err.message : 'Failed to load wells');
      } finally {
        if (!controller.signal.aborted) setLiveLoading(false);
      }
    })();

    return () => controller.abort();
  }, [usePmtiles, visible]);

  // ── Selected-pin overlay (gold ring around the currently-selected well) ──
  // Persists regardless of status filter so a clicked candidate is always
  // findable on the map, even when its status isn't toggled on. Same pattern
  // as the Grid Power Analyzer's search-pin gold diamond.
  const selectedPinGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: selected
      ? [{
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Point' as const,
            coordinates: [selected.lng, selected.lat],
          },
        }]
      : [],
  }), [selected]);

  // ── GeoJSON source for live mode ──
  const liveGeoJSON: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: liveWells.map((w, i) => ({
        type: 'Feature' as const,
        id: i,
        properties: {
          api: w.api,
          status: w.status,
          lat: w.lat,
          lng: w.lng,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [w.lng, w.lat],
        },
      })),
    }),
    [liveWells],
  );

  // ── Color match expression ──
  const statusColorMatch = useMemo(() => {
    const expr: unknown[] = ['match', ['get', 'status']];
    for (const [status, color] of Object.entries(STATUS_COLORS)) {
      expr.push(status, color);
    }
    expr.push('#7A756E'); // fallback
    return expr;
  }, []);

  // ── Visible-status filter expression ──
  const visibleFilter = useMemo(() => {
    const list = Array.from(visible);
    if (list.length === 0) return ['==', ['get', 'status'], '__none__'];
    return ['in', ['get', 'status'], ['literal', list]];
  }, [visible]);

  // ── Toggle handlers ──
  function toggleStatus(s: WellStatus) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }
  function selectAll() {
    setVisible(new Set(ALL_WELL_STATUSES));
  }
  function clearAll() {
    setVisible(new Set());
  }

  // ── Viewport sync (extracts visible wells for the sidebar table) ──
  function refreshViewportWells() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Guard: the wells layer may not be added yet on the first idle event.
    if (!map.getLayer('wells-layer')) return;
    const features = map.queryRenderedFeatures(undefined, { layers: ['wells-layer'] });
    const seen = new Set<string>();
    const out: ViewportWell[] = [];
    for (const f of features) {
      const p = f.properties ?? {};
      const api = String(p.api ?? p.API ?? '');
      if (!api || seen.has(api)) continue;
      seen.add(api);
      let lat: number;
      let lng: number;
      const propLat = Number(p.lat);
      const propLng = Number(p.lng);
      if (Number.isFinite(propLat) && Number.isFinite(propLng)) {
        lat = propLat;
        lng = propLng;
      } else if (f.geometry && f.geometry.type === 'Point') {
        const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        lng = c[0];
        lat = c[1];
      } else {
        continue;
      }
      out.push({
        api,
        status: String(p.status ?? p.GIS_SYMBOL_DESCRIPTION ?? ''),
        lat,
        lng,
      });
      if (out.length >= 500) break; // hard cap regardless of zoom
    }
    setViewportWells(out);
  }

  async function handleSidebarSelect(api: string) {
    const map = mapRef.current?.getMap();
    // Look up the well's coordinates via RRC ArcGIS (fast — ~150 ms)
    const w = await lookupWellByApi(api);
    if (!w) return;
    if (map) {
      map.flyTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 12), duration: 800 });
    }
    setSelected({ api, status: w.status, lat: w.lat, lng: w.lng });
  }

  // ── Click handler ──
  function handleClick(e: MapLayerMouseEvent) {
    setSelected(null);
    if (!e.features?.length) return;
    const f = e.features[0];
    const p = f.properties ?? {};
    // For PMTiles vector source, we don't have lat/lng on properties, only geometry.
    let lat = Number(p.lat);
    let lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const geom = f.geometry as GeoJSON.Geometry | undefined;
      if (geom && geom.type === 'Point') {
        const c = geom.coordinates as [number, number];
        lng = c[0];
        lat = c[1];
      } else {
        lng = e.lngLat.lng;
        lat = e.lngLat.lat;
      }
    }
    setSelected({
      api: String(p.api ?? p.API ?? ''),
      status: String(p.status ?? p.GIS_SYMBOL_DESCRIPTION ?? ''),
      lat,
      lng,
    });
  }

  const interactiveLayerIds = ['wells-layer'];

  // Total visible count (for status banner)
  const visibleCount = useMemo(() => {
    let n = 0;
    for (const s of visible) n += counts[s] ?? 0;
    return n;
  }, [visible, counts]);

  return (
    <div className="flex w-full h-full">
      {/* ── Sidebar: filters + sortable table ── */}
      <aside className="w-80 shrink-0 flex flex-col border-r border-[#D8D5D0] bg-white overflow-hidden">
        <RecentActivity onSelect={handleSidebarSelect} />
        <WellFilters
          visible={visible}
          counts={counts}
          onToggle={toggleStatus}
          onSelectAll={selectAll}
          onClear={clearAll}
          operatorFilter={operatorFilter}
          onOperatorFilterChange={setOperatorFilter}
          orphanOnly={orphanOnly}
          onOrphanOnlyChange={setOrphanOnly}
          minMonthsInactive={minMonthsInactive}
          onMinMonthsInactiveChange={setMinMonthsInactive}
          sb1150Filter={sb1150Filter}
          onSb1150FilterChange={setSb1150Filter}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          limitToView={limitToView}
          onLimitToViewChange={setLimitToView}
        />
        <WellTable
          statewide={limitToView ? null : candidates}
          statewideLoading={candidatesLoading}
          viewportWells={limitToView ? viewportWells.filter((w) => visible.has(w.status as WellStatus)) : null}
          operatorFilter={operatorFilter}
          orphanOnly={orphanOnly}
          minMonthsInactive={minMonthsInactive}
          sb1150Filter={sb1150Filter}
          minScore={minScore}
          onSelect={handleSidebarSelect}
        />
      </aside>

      {/* ── Map ── */}
      <div className="relative flex-1">
      <Map
        ref={mapRef}
        initialViewState={PERMIAN_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onIdle={refreshViewportWells}
        cursor="default"
        aria-label="Texas oil & gas wells map"
      >
        <NavigationControl position="top-right" />

        {/* PMTiles vector source — wells visible as individual circles at every
            zoom, matching the Grid Power Analyzer UX. No heatmap. */}
        {usePmtiles && resolvedPmtilesUrl && (
          <Source
            id="wells"
            type="vector"
            url={`pmtiles://${resolvedPmtilesUrl}`}
          >
            <Layer
              id="wells-layer"
              type="circle"
              source-layer={PMTILES_SOURCE_LAYER}
              filter={visibleFilter as never}
              paint={{
                // Radius floor at 2.5 px — anything smaller gets sub-pixel-
                // collapsed by the GPU rasterizer when many dots cluster,
                // which manifests as features "disappearing" at low zoom.
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  3, 2.5,
                  5, 3,
                  7, 3.5,
                  10, 4.5,
                  14, 6,
                ],
                'circle-color': statusColorMatch as never,
                'circle-stroke-color': '#FFFFFF',
                // Stroke only at high zoom — at small radii a 0.5px white
                // halo eats most of the colored fill.
                'circle-stroke-width': [
                  'interpolate', ['linear'], ['zoom'],
                  9, 0,
                  12, 0.5,
                  14, 0.8,
                ],
                'circle-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  3, 0.85,
                  7, 0.9,
                  10, 0.95,
                ],
              }}
            />
          </Source>
        )}

        {/* Live-RRC GeoJSON source */}
        {!usePmtiles && liveWells.length > 0 && (
          <Source id="wells" type="geojson" data={liveGeoJSON}>
            <Layer
              id="wells-layer"
              type="circle"
              filter={visibleFilter as never}
              paint={{
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  4, 2,
                  8, 4,
                  12, 6,
                ],
                'circle-color': statusColorMatch as never,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 1,
                'circle-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Selected-pin overlay — gold ring around the currently-selected well.
            Always renders regardless of status filter or PMTiles vs live mode,
            so candidates clicked from the sidebar are always findable. */}
        {selected && (
          <Source id="selected-pin" type="geojson" data={selectedPinGeoJSON}>
            <Layer
              id="selected-pin-glow"
              type="circle"
              paint={{
                'circle-radius': 22,
                'circle-color': '#F59E0B',
                'circle-opacity': 0.15,
                'circle-stroke-color': '#F59E0B',
                'circle-stroke-width': 1.5,
                'circle-stroke-opacity': 0.4,
              }}
            />
            <Layer
              id="selected-pin-ring"
              type="circle"
              paint={{
                'circle-radius': 10,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-color': '#F59E0B',
                'circle-stroke-width': 2.5,
              }}
            />
          </Source>
        )}

        {/* Click popup */}
        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            anchor="bottom"
            onClose={() => setSelected(null)}
            closeButton
            offset={10}
            maxWidth="340px"
          >
            <WellPopup
              api={selected.api}
              status={selected.status}
              lat={selected.lat}
              lng={selected.lng}
            />
          </Popup>
        )}
      </Map>

      {/* Top-left status banner */}
      <div className="absolute top-3 left-3 z-10 bg-white rounded-lg shadow-sm border border-[#D8D5D0] px-3 py-2 max-w-md">
        {usePmtiles ? (
          pmtilesError ? (
            <div className="text-xs text-[#ED202B]">Map error: {pmtilesError}</div>
          ) : !resolvedPmtilesUrl ? (
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
              <span className="text-xs text-[#7A756E]">Loading map…</span>
            </div>
          ) : (
            <span className="text-xs font-medium text-[#201F1E]">
              {visibleCount.toLocaleString()} wells
            </span>
          )
        ) : liveLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
            <span className="text-xs text-[#7A756E]">
              Loading wells… {liveProgress.toLocaleString()}
            </span>
          </div>
        ) : liveError ? (
          <div className="text-xs text-[#ED202B]">Error loading wells.</div>
        ) : (
          <span className="text-xs font-medium text-[#201F1E]">
            {liveWells.length.toLocaleString()} loaded
            {visibleCount > liveWells.length && (
              <span className="text-[#7A756E]">
                {' '}/ {visibleCount.toLocaleString()} total
              </span>
            )}
          </span>
        )}
      </div>

      </div>
    </div>
  );
}
