import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowUpRight, Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useVelocity } from '@/hooks/useVelocity';
import { useAOIs, useAOITiles } from '@/hooks/useAOIs';
import { useTileObservations } from '@/hooks/useTiles';
import { useTemporalSignature } from '@/hooks/useTiles';
import { GlassPanel } from '@/components/common/GlassPanel';
import { ErrorCard } from '@/components/common/ErrorCard';
import { SkeletonCard } from '@/components/common/SkeletonCard';
import { TileThumbnail } from '@/components/common/TileThumbnail';
import { formatDate, getObservationImageUrl } from '@/lib/utils';

const trendMeta: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  stable: { label: 'Stable', color: 'text-slate-300', icon: Gauge },
  steady_change: { label: 'Steady Change', color: 'text-sky-300', icon: Activity },
  accelerating: { label: 'Accelerating', color: 'text-amber-300', icon: TrendingUp },
  decelerating: { label: 'Decelerating', color: 'text-rose-300', icon: TrendingDown },
};

function Metric({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="border-l border-white/[0.1] pl-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-mono font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

export const VelocityPage: React.FC = () => {
  const { data, isLoading, isError, refetch } = useVelocity(48);
  const { data: aois = [] } = useAOIs();
  const records = data || [];
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAOIId, setSelectedAOIId] = useState(searchParams.get('aoi_id') || '');
  const [selectedTileId, setSelectedTileId] = useState(searchParams.get('tile_id') || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: aoiTiles } = useAOITiles(selectedAOIId || undefined);
  const selectedSummary = aoiTiles?.tiles.find((item) => item.tile_id === selectedTileId);
  const { data: selectedSignature } = useTemporalSignature(selectedTileId || undefined);
  const selected = records.find((item) => item.tile_id === selectedTileId) || (selectedSummary ? {
    ...selectedSummary,
    series: selectedSignature?.series || [],
    velocities: selectedSignature?.velocities || [],
    score_sources: selectedSignature?.score_sources || [],
    latest_velocity: selectedSignature?.latest_velocity ?? selectedSummary.latest_velocity,
    acceleration: selectedSignature?.acceleration ?? selectedSummary.acceleration,
    trend: selectedSignature?.trend || selectedSummary.trend || 'stable',
  } : undefined);
  const { data: selectedObservations = [] } = useTileObservations(selectedTileId || undefined);

  useEffect(() => {
    if (aois.length > 0 && selectedAOIId && !aois.some((aoi) => aoi.aoi_id === selectedAOIId)) {
      setSelectedAOIId('');
      setSelectedTileId('');
      setFromDate('');
      setToDate('');
    }
  }, [aois, selectedAOIId]);

  useEffect(() => {
    if (selectedAOIId && aoiTiles && selectedTileId && !aoiTiles.tiles.some((item) => item.tile_id === selectedTileId)) {
      setSelectedTileId('');
    }
  }, [aoiTiles, selectedAOIId, selectedTileId]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedAOIId) params.set('aoi_id', selectedAOIId); else params.delete('aoi_id');
    if (selectedTileId) params.set('tile_id', selectedTileId); else params.delete('tile_id');
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
  }, [selectedAOIId, selectedTileId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedTileId) return;
    const first = selectedSummary?.first_observation || selected?.first_observation || selectedObservations[0]?.acquisition_date || '';
    const last = selectedSummary?.latest_observation || selected?.latest_observation || selectedObservations[selectedObservations.length - 1]?.acquisition_date || '';
    setFromDate((current) => (!current || !selectedObservations.some((item) => item.acquisition_date === current)) ? first : current);
    setToDate((current) => (!current || !selectedObservations.some((item) => item.acquisition_date === current)) ? last : current);
  }, [selectedTileId, selectedSummary, selected, selectedObservations]);

  const counts = records.reduce<Record<string, number>>((result, item) => {
    const trend = item.trend || 'stable';
    result[trend] = (result[trend] || 0) + 1;
    return result;
  }, { stable: 0, steady_change: 0, accelerating: 0, decelerating: 0 });

  const ActiveIcon = selected ? trendMeta[selected.trend || 'stable'].icon : Activity;
  const chartData = (selectedSignature?.series || selected?.series || []).map((point) => ({ ...point, date: point.date_pair.after, value: point.velocity }));
  const matrixTiles = aoiTiles?.tiles || [];
  const returnPath = `/velocity?aoi_id=${encodeURIComponent(selectedAOIId)}&tile_id=${encodeURIComponent(selectedTileId)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-aurora-300">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora-400 shadow-[0_0_10px_#00D4FF]" />
            Temporal Intelligence Command Center
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">Change Velocity Monitor</h1>
          <p className="mt-1 max-w-2xl text-xs font-mono text-text-secondary">How rapidly is observed optical activity changing across Sentinel-2 history?</p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Score / day | actual acquisition intervals</div>
      </div>

      {isError && <ErrorCard title="Temporal Engine Unavailable" message="Could not retrieve persisted change-score history." onRetry={() => refetch()} />}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4"><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} /></div>
      ) : (
        <>
          <GlassPanel className="p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">Select area of interest
                <select value={selectedAOIId} onChange={(event) => { setSelectedAOIId(event.target.value); setSelectedTileId(''); setFromDate(''); setToDate(''); }} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary">
                  <option value="">Select AOI</option>
                  {aois.map((aoi) => <option key={aoi.aoi_id} value={aoi.aoi_id}>{aoi.name} ({aoi.tile_count} tiles)</option>)}
                </select>
              </label>
              <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">Select tile
                <select value={selectedTileId} disabled={!selectedAOIId} onChange={(event) => setSelectedTileId(event.target.value)} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary disabled:opacity-40">
                  <option value="">Select a tile</option>
                  {(aoiTiles?.tiles || []).map((item) => <option key={item.tile_id} value={item.tile_id}>{item.tile_id} - {item.aoi_name} ({item.observation_count} observations)</option>)}
                </select>
              </label>
            </div>
          </GlassPanel>

          {!selectedTileId ? <GlassPanel className="p-10 text-center"><div className="text-xs font-mono uppercase tracking-[0.2em] text-aurora-300">Temporal analysis ready</div><div className="mt-3 text-sm font-mono text-text-secondary">Select an Area of Interest and then choose a tile to inspect its complete change history, velocity, acceleration, optical signals, and Sentinel-1 evidence.</div></GlassPanel> : <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Temporal Signatures" value={records.length} accent="text-aurora-300" />
            <Metric label="Accelerating" value={counts.accelerating || 0} accent="text-amber-300" />
            <Metric label="Steady Change" value={counts.steady_change || 0} accent="text-sky-300" />
            <Metric label="Stable / Decelerating" value={(counts.stable || 0) + (counts.decelerating || 0)} accent="text-emerald-300" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <GlassPanel className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(0,212,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,212,255,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">Highest temporal activity</div>
                  <div className="mt-2 font-mono text-sm text-text-primary">{selected?.tile_id || 'NO VALID TEMPORAL DATA'}</div>
                </div>
                {selected && <Link to={`/tiles/${selected.tile_id}`} className="text-text-muted transition hover:text-aurora-300" aria-label="Open highest activity tile"><ArrowUpRight size={18} /></Link>}
              </div>
              <div className="relative mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><div className="text-4xl font-mono font-semibold text-aurora-300">{selected?.latest_velocity?.toFixed(4) || '--'}</div><div className="mt-1 text-[10px] font-mono text-text-muted">SCORE / DAY</div></div>
                <div><div className="text-lg font-mono text-text-primary">{selected?.acceleration?.toFixed(5) || '--'}</div><div className="mt-1 text-[10px] font-mono text-text-muted">ACCELERATION</div></div>
                <div className="flex items-center gap-2"><ActiveIcon size={17} className={selected ? trendMeta[selected.trend || 'stable'].color : 'text-text-muted'} /><span className={`font-mono text-xs uppercase ${selected ? trendMeta[selected.trend || 'stable'].color : 'text-text-muted'}`}>{selected ? trendMeta[selected.trend || 'stable'].label : 'Unavailable'}</span></div>
                <div><div className="text-lg font-mono text-text-primary">{selected?.series?.length || '--'}</div><div className="mt-1 text-[10px] font-mono text-text-muted">OBSERVATIONS</div></div>
              </div>
              <div className="relative mt-8 h-64">
                {chartData.length < 1 ? <div className="flex h-full items-center justify-center text-xs font-mono text-text-muted">INSUFFICIENT TEMPORAL HISTORY</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs><linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00D4FF" stopOpacity={0.35} /><stop offset="100%" stopColor="#00D4FF" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="#ffffff12" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDate} stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ background: '#07111b', border: '1px solid #164e63', fontFamily: 'monospace', fontSize: 11 }} labelFormatter={formatDate} formatter={(value: number) => [value.toFixed(5), 'score/day']} />
                      <Area type="monotone" dataKey="value" stroke="#00D4FF" strokeWidth={2} fill="url(#velocityFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="p-6">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-text-secondary"><Activity size={14} className="text-aurora-400" /> Temporal Activity Matrix</div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {matrixTiles.slice(0, 48).map((item) => (
                  <Link key={item.tile_id} to={`/velocity?aoi_id=${encodeURIComponent(selectedAOIId)}&tile_id=${encodeURIComponent(item.tile_id)}`} title={`${item.tile_id} - ${trendMeta[item.trend || 'stable'].label}`} className={`overflow-hidden border transition hover:scale-[1.02] ${item.tile_id === selected?.tile_id ? 'border-aurora-400 ring-1 ring-aurora-400/50' : 'border-white/10'} bg-space-950/60`}>
                    <TileThumbnail src={item.thumbnail_url || undefined} alt={item.tile_id} aspectRatio="video" unavailableLabel="IMAGE UNAVAILABLE" />
                    <div className="space-y-1 p-2">
                      <div className="truncate text-[10px] font-mono text-text-primary">{item.tile_id}</div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="text-aurora-300">{item.latest_velocity?.toFixed(4) || '--'} / DAY</span>
                        <span className={trendMeta[item.trend || 'stable'].color}>{trendMeta[item.trend || 'stable'].label}</span>
                      </div>
                      <div className="text-[9px] font-mono text-text-muted">{formatDate(item.first_observation)} → {formatDate(item.latest_observation)}</div>
                    </div>
                  </Link>
                ))}
              </div>
              {matrixTiles.length === 0 && <div className="mt-8 text-center text-xs font-mono text-text-muted">NO VALID OBSERVATIONS</div>}
              <div className="mt-6 space-y-2 border-t border-white/[0.06] pt-4 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                <div className="flex justify-between"><span>Accelerating</span><span className="text-amber-300">{counts.accelerating || 0}</span></div>
                <div className="flex justify-between"><span>Steady change</span><span className="text-sky-300">{counts.steady_change || 0}</span></div>
                <div className="flex justify-between"><span>Stable</span><span className="text-slate-300">{counts.stable || 0}</span></div>
                <div className="flex justify-between"><span>Decelerating</span><span className="text-rose-300">{counts.decelerating || 0}</span></div>
              </div>
            </GlassPanel>
          </div>

          <GlassPanel className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Temporal imagery / full history</div>
                <div className="mt-1 text-[10px] font-mono text-text-muted">Select an observation to inspect its optical evidence.</div>
              </div>
              <Link to={selected ? `/tiles/${selected.tile_id}` : '/tiles'} className="text-[10px] font-mono uppercase text-aurora-300">Open tile detail -&gt;</Link>
            </div>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
              {selectedObservations.map((item) => (
                <Link key={item.observation_id} to={selected ? `/tiles/${selected.tile_id}/analysis?from_date=${item.acquisition_date}&to_date=${selected.latest_observation || item.acquisition_date}&return_to=${encodeURIComponent(returnPath)}` : '#'} className="w-32 min-w-32 overflow-hidden rounded-lg border border-white/[0.08] bg-space-950/60 transition hover:border-aurora-400">
                  <TileThumbnail src={getObservationImageUrl(item) || undefined} alt={item.acquisition_date} aspectRatio="square" />
                  <div className="space-y-1 p-2">
                    <div className="text-[10px] font-mono text-text-primary">{formatDate(item.acquisition_date)}</div>
                    <div className="text-[9px] font-mono text-text-muted">NDVI {item.ndvi_mean?.toFixed(3) || '--'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Compare any two dates</div>
            <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label className="text-[10px] font-mono uppercase text-text-muted">From date
                <select value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary">
                  {selectedObservations.map((item) => <option key={item.observation_id} value={item.acquisition_date}>{formatDate(item.acquisition_date)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-mono uppercase text-text-muted">To date
                <select value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary">
                  {selectedObservations.map((item) => <option key={item.observation_id} value={item.acquisition_date}>{formatDate(item.acquisition_date)}</option>)}
                </select>
              </label>
              <Link to={selected && fromDate && toDate && fromDate < toDate ? `/tiles/${selected.tile_id}/analysis?from_date=${fromDate}&to_date=${toDate}&return_to=${encodeURIComponent(returnPath)}` : '#'} className={`rounded-lg px-4 py-2.5 text-center text-xs font-mono font-semibold ${selected && fromDate && toDate && fromDate < toDate ? 'bg-aurora-400 text-space-950' : 'pointer-events-none bg-white/[0.08] text-text-muted'}`}>
                View Analysis
              </Link>
            </div>
          </GlassPanel>
          </>}
        </>
      )}
    </div>
  );
};