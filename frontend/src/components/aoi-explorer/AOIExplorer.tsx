import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

import { useNavigate } from 'react-router-dom';
import { useAOITiles, useMosaic } from '@/hooks/useAOIs';
import type { AOI, AOITileSummary } from '@/types/api';
import { formatDate, formatCoord } from '@/lib/utils';
import { ArrowLeft, ArrowUpRight, CalendarRange, Grid3X3, Layers3 } from 'lucide-react';

const INITIAL_CENTER: [number, number] = [78.9, 22.5];
const EXTENT_SOURCE_NAME = 'aoi-extent';
const FOOTPRINTS_SOURCE_NAME = 'tile-footprints';
const INDIA_IMAGE_SOURCE_NAME = 'india-satellite';

const INDIA_IMAGE_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [50, 37.5],
  [115, 37.5],
  [115, 6],
  [50, 6],
];
const INDIA_BOUNDS: [[number, number], [number, number]] = [[50, 6], [115, 37.5]];

const LOCATION_LABELS: Record<string, string> = {
  dholera: 'Dholera SIR, Gujarat',
  'navi-mumbai': 'Navi Mumbai, Maharashtra',
  noida: 'Noida region, Uttar Pradesh',
};

function locationLabel(aoi: AOI) {
  return LOCATION_LABELS[aoi.aoi_id] ?? 'India';
}

function buildExtentFeature(bbox: [number, number, number, number] | null | undefined) {
  if (!bbox || !bbox.every((coord) => Number.isFinite(coord))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ]],
    },
  };
}

function buildFootprintFeature(tile: AOITileSummary, active = false): { type: 'Feature'; properties: { tile_id: string; active: boolean }; geometry: { type: 'Polygon'; coordinates: number[][][] } } | null {
  if (!tile.bbox || !tile.bbox.every((coord) => Number.isFinite(coord))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = tile.bbox;
  return {
    type: 'Feature',
    properties: { tile_id: tile.tile_id, active },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ]],
    },
  };
}

const markerStyles = `
  .aoi-marker {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    transform: scale(1);
    transition: transform 180ms ease, opacity 180ms ease;
    filter: drop-shadow(0 0 10px rgba(45, 212, 191, 0.6));
  }
  .aoi-marker:hover,
  .aoi-marker:focus-visible {
    transform: scale(1.12);
    outline: none;
  }
  .aoi-marker-ring {
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    border: 1px solid rgba(110, 231, 255, 0.95);
    background: rgba(56, 189, 248, 0.12);
    animation: aoi-breathe 3s ease-in-out infinite;
  }
  .aoi-marker-dot {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 9999px;
    background: #67e8f9;
    box-shadow: 0 0 12px rgba(103, 232, 249, 0.9);
  }
  .aoi-marker-label {
    position: absolute;
    left: 18px;
    top: -6px;
    white-space: nowrap;
    background: rgba(11, 16, 24, 0.9);
    border: 1px solid rgba(103, 232, 249, 0.28);
    color: #dff8ff;
    font-size: 10px;
    line-height: 1.1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 4px 7px 3px;
    border-radius: 6px;
    opacity: 0;
    transform: translateY(2px);
    transition: opacity 180ms ease, transform 180ms ease;
    pointer-events: none;
  }
  .aoi-marker:hover .aoi-marker-label,
  .aoi-marker:focus-visible .aoi-marker-label {
    opacity: 1;
    transform: translateY(0);
  }
  @keyframes aoi-breathe {
    0%, 100% { transform: scale(0.78); opacity: 0.7; }
    50% { transform: scale(1.08); opacity: 1; }
  }
`;

interface AOIExplorerProps {
  aois: AOI[];
}

export const AOIExplorer: React.FC<AOIExplorerProps> = ({ aois }) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedAoiId, setSelectedAoiId] = useState<string | null>(null);
  const [hoveredAoiId, setHoveredAoiId] = useState<string | null>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [mosaicOverlayBounds, setMosaicOverlayBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const selectedAoi = useMemo(
    () => aois.find((aoi) => aoi.aoi_id === selectedAoiId) ?? null,
    [aois, selectedAoiId]
  );
  const hoveredAoi = useMemo(
    () => aois.find((aoi) => aoi.aoi_id === hoveredAoiId) ?? null,
    [aois, hoveredAoiId]
  );
  const { data: selectedTiles } = useAOITiles(selectedAoiId ?? undefined);
  const latestObservationDate = useMemo(
    () => selectedTiles?.tiles.reduce<string | undefined>((latest, tile) => (
      !latest || (tile.latest_observation ?? '') > latest ? tile.latest_observation ?? latest : latest
    ), undefined),
    [selectedTiles]
  );
  const { data: selectedMosaic } = useMosaic(selectedAoiId ?? undefined, latestObservationDate);
  const observedBbox = useMemo<[number, number, number, number] | null>(() => {
    const boxes = (selectedTiles?.tiles ?? []).map((tile) => tile.bbox).filter((bbox): bbox is [number, number, number, number] => Boolean(bbox && bbox.every(Number.isFinite)));
    if (!boxes.length) {
      return selectedAoi?.bbox ?? null;
    }
    return [
      Math.min(...boxes.map((bbox) => bbox[0])),
      Math.min(...boxes.map((bbox) => bbox[1])),
      Math.max(...boxes.map((bbox) => bbox[2])),
      Math.max(...boxes.map((bbox) => bbox[3])),
    ];
  }, [selectedAoi, selectedTiles]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const canvas = document.createElement('canvas');
    const hasWebGL = !!window.WebGLRenderingContext && !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    if (!hasWebGL) {
      setMapError('Map preview is unavailable because WebGL is not supported in this browser.');
      return;
    }

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          name: 'GeoSpectra Explorer',
          sources: {},
          layers: [
            { id: 'space-bg', type: 'background', paint: { 'background-color': '#07131d' } },
          ],
        },
        center: INITIAL_CENTER,
        zoom: 4.3,
        pitch: 0,
        bearing: 0,
        renderWorldCopies: false,
        dragPan: false,
        dragRotate: false,
        keyboard: false,
        touchPitch: false,
        touchZoomRotate: false,
        scrollZoom: true,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');

      map.on('load', async () => {
        try {
          map.addSource(INDIA_IMAGE_SOURCE_NAME, {
            type: 'image',
            url: '/assets/india-satellite.png',
            coordinates: INDIA_IMAGE_COORDINATES,
          });
          map.addLayer({
            id: 'india-satellite',
            source: INDIA_IMAGE_SOURCE_NAME,
            type: 'raster',
            paint: { 'raster-opacity': 0.76, 'raster-saturation': -0.12, 'raster-contrast': 0.08 },
          });
          map.addLayer({
            id: 'india-satellite-overlay',
            type: 'background',
            paint: { 'background-color': '#07131d', 'background-opacity': 0.14 },
          });

          map.fitBounds(INDIA_BOUNDS, { padding: 40, duration: 0 });
        } catch {
          // The map still works without the India outline asset; the production AOIs remain usable.
        }

        setMapReady(true);
        map.resize();
      });

      map.on('error', (event) => {
        const message = event.error?.message ?? '';
        if (message.toLowerCase().includes('india-satellite')) {
          console.warn('Local India satellite basemap unavailable; using the dark map fallback.', event.error);
          return;
        }
        console.error('MapLibre runtime error', event);
        setMapError('Map preview is unavailable because the local map worker could not initialize.');
      });

      return () => {
        map.remove();
        mapRef.current = null;
      };
    } catch (_error) {
      setMapError('Map preview is unavailable because the browser could not initialize the map engine.');
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const markers: Marker[] = [];
    aois.forEach((aoi) => {
      if (!aoi.bbox || !aoi.bbox.every((coord) => Number.isFinite(coord))) {
        return;
      }

      const [minLon, minLat, maxLon, maxLat] = aoi.bbox;
      const lon = (minLon + maxLon) / 2;
      const lat = (minLat + maxLat) / 2;

      const markerEl = document.createElement('button');
      markerEl.type = 'button';
      markerEl.setAttribute('role', 'button');
      markerEl.setAttribute('aria-label', `Select AOI ${aoi.name}`);
      markerEl.tabIndex = 0;
      markerEl.className = selectedAoiId === aoi.aoi_id ? 'aoi-marker selected-marker' : 'aoi-marker';
      markerEl.style.zIndex = selectedAoiId === aoi.aoi_id ? '3' : '2';
      markerEl.innerHTML = '<span class="aoi-marker-ring"></span><span class="aoi-marker-dot"></span><span class="aoi-marker-label">' + aoi.name + '</span>';
      markerEl.addEventListener('click', () => setSelectedAoiId(aoi.aoi_id));
      markerEl.addEventListener('mouseenter', () => setHoveredAoiId(aoi.aoi_id));
      markerEl.addEventListener('mouseleave', () => setHoveredAoiId((current) => (current === aoi.aoi_id ? null : current)));
      markerEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedAoiId(aoi.aoi_id);
        }
      });

      const marker = new Marker({ element: markerEl, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);
      markers.push(marker);
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [aois, mapReady, selectedAoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    if (selectedAoi) {
      const [minLon, minLat, maxLon, maxLat] = observedBbox ?? selectedAoi.bbox;
      const extentFeature = buildExtentFeature(observedBbox);
      if (extentFeature) {
        const extentSource = map.getSource(EXTENT_SOURCE_NAME) as any;
        if (extentSource) {
          extentSource.setData({ type: 'FeatureCollection', features: [extentFeature] });
        } else {
          map.addSource(EXTENT_SOURCE_NAME, { type: 'geojson', data: { type: 'FeatureCollection', features: [extentFeature] } });
          map.addLayer({
            id: 'aoi-extent-fill',
            source: EXTENT_SOURCE_NAME,
            type: 'fill',
            paint: { 'fill-color': '#5ae5ff', 'fill-opacity': 0.08 },
          });
          map.addLayer({
            id: 'aoi-extent-line',
            source: EXTENT_SOURCE_NAME,
            type: 'line',
            paint: { 'line-color': '#67e8f9', 'line-width': 1.8, 'line-dasharray': [2, 2] },
          });
        }
      }

      map.fitBounds(
        [[minLon, minLat], [maxLon, maxLat]],
        { padding: 96, duration: 1800, maxZoom: 14 }
      );
    } else {
      const extentSource = map.getSource(EXTENT_SOURCE_NAME) as any;
      if (extentSource) {
        extentSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    const tileFootprints = (selectedTiles?.tiles ?? []).map((tile) => buildFootprintFeature(tile, tile.tile_id === hoveredTileId)).filter(Boolean) as Array<{
      type: 'Feature';
      properties: { tile_id: string; active: boolean };
      geometry: { type: 'Polygon'; coordinates: number[][][] };
    }>;

    const footprintsSource = map.getSource(FOOTPRINTS_SOURCE_NAME) as any;
    if (footprintsSource) {
      footprintsSource.setData({ type: 'FeatureCollection', features: tileFootprints });
    } else if (tileFootprints.length > 0) {
      map.addSource(FOOTPRINTS_SOURCE_NAME, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: tileFootprints },
      });
      map.addLayer({
        id: 'tile-footprints',
        source: FOOTPRINTS_SOURCE_NAME,
        type: 'fill',
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'active'], false], '#f4d35e', '#6ee7ff'],
          'fill-opacity': ['case', ['boolean', ['get', 'active'], false], 0.22, 0.08],
        },
      });
      map.addLayer({
        id: 'tile-footprints-line',
        source: FOOTPRINTS_SOURCE_NAME,
        type: 'line',
        paint: {
          'line-color': ['case', ['boolean', ['get', 'active'], false], '#fef08a', '#7dd3fc'],
          'line-width': ['case', ['boolean', ['get', 'active'], false], 2, 1],
          'line-opacity': 0.8,
        },
      });
    }

    if (!selectedAoi && !tileFootprints.length) {
      if (map.getLayer('aoi-extent-fill')) {
        map.removeLayer('aoi-extent-fill');
      }
      if (map.getLayer('aoi-extent-line')) {
        map.removeLayer('aoi-extent-line');
      }
      if (map.getSource(EXTENT_SOURCE_NAME)) {
        map.removeSource(EXTENT_SOURCE_NAME);
      }
      if (map.getLayer('tile-footprints')) {
        map.removeLayer('tile-footprints');
      }
      if (map.getLayer('tile-footprints-line')) {
        map.removeLayer('tile-footprints-line');
      }
      if (map.getSource(FOOTPRINTS_SOURCE_NAME)) {
        map.removeSource(FOOTPRINTS_SOURCE_NAME);
      }
      map.fitBounds(INDIA_BOUNDS, { padding: 40, duration: 1200 });
    }
  }, [hoveredTileId, mapReady, observedBbox, selectedAoi, selectedMosaic, selectedTiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !observedBbox || !selectedMosaic?.image_url) {
      setMosaicOverlayBounds(null);
      return;
    }

    const updateOverlay = () => {
      const northwest = map.project([observedBbox[0], observedBbox[3]]);
      const southeast = map.project([observedBbox[2], observedBbox[1]]);
      setMosaicOverlayBounds({
        left: Math.min(northwest.x, southeast.x),
        top: Math.min(northwest.y, southeast.y),
        width: Math.abs(southeast.x - northwest.x),
        height: Math.abs(southeast.y - northwest.y),
      });
    };

    updateOverlay();
    map.on('move', updateOverlay);
    map.on('resize', updateOverlay);
    return () => {
      map.off('move', updateOverlay);
      map.off('resize', updateOverlay);
    };
  }, [mapReady, observedBbox, selectedMosaic]);

  const previewAoi = selectedAoi ?? hoveredAoi;

  return (
    <div className="rounded-2xl bg-[#0b1220]/90 p-3">
      <style>{markerStyles}</style>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-aurora-300">AOI Explorer</div>
          <div className="mt-1 text-xs text-text-secondary font-mono">GeoSpectra monitors geographic regions through multi-temporal observation stacks.</div>
        </div>
        {selectedAoi && (
          <button
            type="button"
            onClick={() => setSelectedAoiId(null)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-text-primary transition hover:border-aurora-500/50 hover:bg-white/10"
          >
            <ArrowLeft size={12} />
            All AOIs
          </button>
        )}
      </div>

      <div className={selectedAoi ? 'grid gap-3 lg:grid-cols-[minmax(260px,32%)_minmax(0,1fr)]' : ''}>
        {selectedAoi && (
          <aside className="min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a111d] p-4 shadow-glass">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.26em] text-aurora-300">Selected AOI</div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-text-primary">{selectedAoi.name}</h2>
                <div className="mt-1 text-[11px] font-mono text-text-secondary">{locationLabel(selectedAoi)}</div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/aois/${selectedAoi.aoi_id}`)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-aurora-500/30 bg-aurora-500/10 px-2.5 py-2 text-[10px] font-mono uppercase tracking-[0.12em] text-aurora-100 transition hover:border-aurora-500/60 hover:bg-aurora-500/20"
              >
                Explore <ArrowUpRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-white/10">
              <section className="py-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">History</div>
                <div className="mt-2 text-sm font-mono text-text-primary">{formatDate(selectedAoi.start_date)} <span className="text-text-muted">→</span> {formatDate(selectedAoi.end_date)}</div>
                <div className="mt-1 text-[10px] font-mono text-text-muted">{selectedAoi.scene_count} scenes · {selectedAoi.tile_count} catalog tiles</div>
              </section>
              <section className="py-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Last activity</div>
                <div className="mt-2 text-sm font-mono text-text-primary">{formatDate(selectedAoi.last_activity)}</div>
                <div className="mt-1 text-[10px] font-mono text-text-muted">Latest catalog activity</div>
              </section>
              {observedBbox && (
                <section className="py-4">
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Observation extent</div>
                  <div className="mt-1 text-[10px] font-mono text-aurora-100">Derived from real tile footprints</div>
                  <div className="mt-2 space-y-1 text-[10px] font-mono text-text-secondary">
                    <div>{formatCoord(observedBbox[0])}, {formatCoord(observedBbox[1])}</div>
                    <div>{formatCoord(observedBbox[2])}, {formatCoord(observedBbox[3])}</div>
                  </div>
                </section>
              )}
              <section className="py-4">
                <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Recent observations</div>
                <div className="space-y-1.5">
                  {(selectedTiles?.tiles ?? []).slice(0, 5).map((tile) => (
                    <button
                      key={tile.tile_id}
                      type="button"
                      onMouseEnter={() => setHoveredTileId(tile.tile_id)}
                      onMouseLeave={() => setHoveredTileId(null)}
                      onClick={() => navigate(`/tiles/${tile.tile_id}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-2 text-left text-[10px] font-mono text-text-secondary transition hover:border-aurora-500/50 hover:bg-aurora-500/10"
                    >
                      <span className="truncate text-text-primary">{tile.tile_id}</span>
                      <span className="shrink-0">{formatDate(tile.latest_observation)}</span>
                      <ArrowUpRight size={11} className="shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        )}

        <div className="relative min-w-0 overflow-hidden rounded-2xl bg-space-950">
        <div ref={mapContainerRef} className={selectedAoi ? 'h-[560px] w-full' : 'h-[600px] w-full'} />

        {selectedMosaic?.image_url && mosaicOverlayBounds && (
          <div
            className="pointer-events-none absolute overflow-hidden rounded-md border border-amber-200/50 opacity-80 mix-blend-screen"
            style={{
              left: mosaicOverlayBounds.left,
              top: mosaicOverlayBounds.top,
              width: mosaicOverlayBounds.width,
              height: mosaicOverlayBounds.height,
              zIndex: 1,
            }}
          >
            <img src={selectedMosaic.image_url} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        {mapError && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl border border-amber-500/30 bg-space-950/80 px-3 py-2 text-[11px] font-mono text-amber-200 shadow-glow-cyan/20">
            {mapError}
          </div>
        )}

        {previewAoi && !selectedAoi && (
          <div className="absolute left-4 top-4 w-[260px] rounded-xl border border-white/10 bg-space-950/85 p-3 shadow-glass backdrop-blur-md">
            <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-aurora-300">{previewAoi.name}</div>
            {previewAoi.mosaic_thumbnail_url ? (
              <img src={previewAoi.mosaic_thumbnail_url} alt={`${previewAoi.name} satellite preview`} className="mt-3 h-24 w-full rounded-lg object-cover opacity-90" />
            ) : (
              <div className="mt-3 flex h-24 items-center justify-center rounded-lg border border-white/10 text-[10px] font-mono uppercase text-text-muted">Imagery unavailable</div>
            )}
            <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">{locationLabel(previewAoi)}</div>
            <div className="mt-3 space-y-2 text-[11px] font-mono text-text-secondary">
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-muted">Tiles</span>
                <span>{previewAoi.tile_count}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-muted">Scenes</span>
                <span>{previewAoi.scene_count}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-muted">History</span>
                <span className="truncate">
                  {formatDate(previewAoi.start_date)} → {formatDate(previewAoi.end_date)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-muted">Last activity</span>
                <span>{formatDate(previewAoi.last_activity)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-muted">Sensor</span>
                <span>Sentinel-2</span>
              </div>
            </div>
          </div>
        )}

        {selectedAoi && (
          <div className="absolute bottom-4 left-4 right-4 hidden max-w-md rounded-2xl border border-white/10 bg-space-950/90 p-4 backdrop-blur-xl shadow-glass">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-aurora-300">AOI</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{selectedAoi.name}</div>
                <div className="mt-1 text-[11px] font-mono text-text-secondary">{locationLabel(selectedAoi)}</div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/aois/${selectedAoi.aoi_id}`)}
                className="inline-flex items-center gap-2 rounded-lg border border-aurora-500/30 bg-aurora-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-aurora-100 transition hover:border-aurora-500/60 hover:bg-aurora-500/15"
              >
                Explore AOI
                <ArrowUpRight size={12} />
              </button>
            </div>

            {selectedMosaic?.image_url ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img src={selectedMosaic.image_url} alt={`${selectedAoi.name} Sentinel-2 mosaic`} className="h-36 w-full object-cover" />
                <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-aurora-200">
                  AOI mosaic — {formatDate(selectedMosaic.date)} (Sentinel-2)
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                Sentinel-2 imagery unavailable for this observation date
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] font-mono text-text-secondary">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="flex items-center gap-2 text-text-muted"><Layers3 size={12} /> TILES</div>
                <div className="mt-2 text-base font-semibold text-text-primary">{selectedAoi.tile_count}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="flex items-center gap-2 text-text-muted"><Grid3X3 size={12} /> SCENES</div>
                <div className="mt-2 text-base font-semibold text-text-primary">{selectedAoi.scene_count}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 col-span-2">
                <div className="flex items-center gap-2 text-text-muted"><CalendarRange size={12} /> HISTORY</div>
                <div className="mt-2 text-sm text-text-primary">{formatDate(selectedAoi.start_date)} → {formatDate(selectedAoi.end_date)}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 col-span-2">
                <div className="flex items-center gap-2 text-text-muted"><ArrowUpRight size={12} /> LAST ACTIVITY</div>
                <div className="mt-2 text-sm text-text-primary">{formatDate(selectedAoi.last_activity)}</div>
              </div>
            </div>

            {observedBbox && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-2">
                <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Observation extent — derived from real tile footprints</div>
                <div className="text-[10px] font-mono text-text-secondary">
                  [{formatCoord(observedBbox[0])}, {formatCoord(observedBbox[1])}] → [{formatCoord(observedBbox[2])}, {formatCoord(observedBbox[3])}]
                </div>
              </div>
            )}

            {selectedTiles?.tiles && selectedTiles.tiles.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Tile footprint sample</div>
                <div className="space-y-2">
                  {selectedTiles.tiles.slice(0, 8).map((tile) => (
                      <button
                        key={tile.tile_id}
                        type="button"
                        onMouseEnter={() => setHoveredTileId(tile.tile_id)}
                        onMouseLeave={() => setHoveredTileId(null)}
                        onClick={() => navigate(`/tiles/${tile.tile_id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-left text-[10px] font-mono text-text-secondary transition hover:border-aurora-500/50 hover:bg-aurora-500/10"
                      >
                        <span className="truncate text-text-primary">{tile.tile_id}</span>
                        <span>{tile.latest_observation ? formatDate(tile.latest_observation) : `${tile.observation_count} obs`}</span>
                        <ArrowUpRight size={12} />
                      </button>
                  ))}
                  {selectedTiles.tiles.length > 8 && (
                    <div className="text-[10px] font-mono text-text-muted">+{selectedTiles.tiles.length - 8} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2 right-3 text-[9px] font-mono text-white/55">
          Imagery: NASA Blue Marble (public domain) · AOI mosaics: Copernicus Sentinel-2 (processed locally)
        </div>
        </div>
      </div>
    </div>
  );
};
