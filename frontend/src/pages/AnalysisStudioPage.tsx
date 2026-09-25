import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Download, Layers, ScanSearch, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { downloadAnalystReport, useTileObservations, useTemporalAnalysis, useAnalysisBrief } from '@/hooks/useTiles';
import { GlassPanel } from '@/components/common/GlassPanel';
import { AnalystChatPanel } from '@/components/common/AnalystChatPanel';
import { BeforeAfterCompare } from '@/components/common/BeforeAfterCompare';
import { TileThumbnail } from '@/components/common/TileThumbnail';
import { ErrorCard } from '@/components/common/ErrorCard';
import { SkeletonCard } from '@/components/common/SkeletonCard';
import { formatDate, getObservationImageUrl } from '@/lib/utils';

interface SignalChartProps {
  title: string;
  data: Array<{ date: string; value: number | null }>;
  color: string;
  fromDate: string;
  toDate: string;
  activeDate?: string;
  onHover?: (date: string) => void;
  unit?: string;
}

const SignalChart: React.FC<SignalChartProps> = ({ title, data, color, fromDate, toDate, activeDate, onHover, unit = '' }) => (
  <GlassPanel className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{title}</div>
      <div className="text-[10px] font-mono text-text-muted">{formatDate(fromDate)} → {formatDate(toDate)}</div>
    </div>
    {data.length < 1 ? (
      <div className="flex h-48 items-center justify-center text-[10px] font-mono text-text-muted">NO DATA AVAILABLE</div>
    ) : (
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} syncId="analysis-temporal" onMouseMove={(state) => { if (state.activeLabel) onHover?.(String(state.activeLabel)); }} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <defs><linearGradient id={`signal-${title.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#ffffff12" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <ReferenceLine x={fromDate} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: 'FROM', fill: '#fbbf24', fontSize: 9 }} />
            <ReferenceLine x={toDate} stroke="#34d399" strokeDasharray="4 4" label={{ value: 'TO', fill: '#34d399', fontSize: 9 }} />
            {activeDate && <ReferenceLine x={activeDate} stroke="#ffffff" strokeOpacity={0.7} />}
            <Tooltip contentStyle={{ background: '#07111b', border: '1px solid #164e63', fontFamily: 'monospace', fontSize: 10 }} labelFormatter={formatDate} formatter={(value: number) => [value.toFixed(5), unit]} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#signal-${title.replace(/[^a-z]/gi, '')})`} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )}
  </GlassPanel>
);

export const AnalysisStudioPage: React.FC = () => {
  const { tileId } = useParams<{ tileId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get('from_date') || searchParams.get('before') || '');
  const [toDate, setToDate] = useState(searchParams.get('to_date') || searchParams.get('after') || '');
  const [activeDate, setActiveDate] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [isComparisonFullscreen, setIsComparisonFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: observations, isLoading, isError } = useTileObservations(tileId);
  const imageObservations = observations?.filter((item) => Boolean(getObservationImageUrl(item))) || [];
  const returnTo = searchParams.get('return_to');

  const validPair = Boolean(fromDate && toDate && fromDate < toDate);
  const { data: analysis } = useTemporalAnalysis(tileId, submitted && validPair ? fromDate : undefined, submitted && validPair ? toDate : undefined);
  const { data: brief } = useAnalysisBrief(tileId, fromDate, toDate, submitted && validPair && Boolean(analysis));

  useEffect(() => {
    if (imageObservations.length < 2) return;
    const requestedFrom = searchParams.get('from_date') || searchParams.get('before');
    const requestedTo = searchParams.get('to_date') || searchParams.get('after');
    const dates = imageObservations.map((item) => item.acquisition_date);
    const nearestDate = (requested: string | null, fallback: string) => {
      if (!requested) return fallback;
      return dates.reduce((nearest, date) => Math.abs(Date.parse(date) - Date.parse(requested)) < Math.abs(Date.parse(nearest) - Date.parse(requested)) ? date : nearest, fallback);
    };
    setFromDate((current) => dates.includes(current) ? current : nearestDate(requestedFrom, dates[0]));
    setToDate((current) => dates.includes(current) ? current : nearestDate(requestedTo, dates[dates.length - 1]));
  }, [imageObservations, searchParams]);

  const fromObservation = imageObservations.find((item) => item.acquisition_date === fromDate);
  const toObservation = imageObservations.find((item) => item.acquisition_date === toDate);

  const handleApplyRange = () => {
    const params = new URLSearchParams(searchParams);
    params.set('from_date', fromDate);
    params.set('to_date', toDate);
    params.delete('before');
    params.delete('after');
    setSearchParams(params, { replace: true });
    setSubmitted(true);
  };

  const noteSeries = analysis?.series ?? [];
  const velocityChart = noteSeries
    .filter((point) => Boolean(point.date_pair.after) && point.date_pair.after >= fromDate && point.date_pair.after <= toDate)
    .map((point) => ({ date: point.date_pair.after, value: point.velocity ?? null }));

  const sarSeriesCards = analysis?.sar
    ? (['vv_mean', 'vh_mean', 'vv_minus_vh'] as const)
        .map((key) => {
          const points = (analysis.sar?.[key] || [])
            .map((value, index) => ({
              date: analysis.sar?.dates[index] || '',
              value: typeof value === 'number' && Number.isFinite(value) ? value : null,
            }))
            .filter((point) => point.date >= fromDate && point.date <= toDate && point.value !== null);

          const title = key === 'vv_mean' ? 'Sentinel-1 VV MEAN (dB)' : key === 'vh_mean' ? 'Sentinel-1 VH MEAN (dB)' : 'Sentinel-1 VV - VH (dB)';
          const color = key === 'vv_mean' ? '#FBBF24' : key === 'vh_mean' ? '#FB7185' : '#A78BFA';

          return { key, title, points, color };
        })
        .filter(({ points }) => points.length > 0)
    : [];

  const handleReportExport = async (format: 'pdf' | 'json') => {
    if (!tileId || !analysis) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await downloadAnalystReport(tileId, fromDate, toDate, format, brief?.brief);
    } catch {
      setExportError('Report export failed - please retry.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => returnTo ? navigate(returnTo) : navigate(-1)} className="mt-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-text-secondary transition hover:text-text-primary" aria-label="Back to previous page"><ArrowLeft size={16} /></button>
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-aurora-300"><ScanSearch size={13} /> GeoSpectra / Temporal Analysis</div>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Analysis Studio</h1>
          <p className="mt-1 text-xs font-mono text-text-secondary">Tile: {tileId} | choose two actual Sentinel-2 observations</p>
        </div>
      </div>

      {isError && <ErrorCard title="Observation History Unavailable" message="The tile history could not be loaded." />}
      {isLoading ? <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><SkeletonCard hasThumbnail lines={3} /><SkeletonCard hasThumbnail lines={3} /></div> : observations && (
        <>
          <GlassPanel className="p-5">
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">From date
                <select value={fromDate} onChange={(event) => { setFromDate(event.target.value); setSubmitted(false); }} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary">
                  <option value="">Select observation</option>
                  {imageObservations.map((item) => <option key={item.observation_id} value={item.acquisition_date}>{formatDate(item.acquisition_date)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">To date
                <select value={toDate} onChange={(event) => { setToDate(event.target.value); setSubmitted(false); }} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-xs text-text-primary">
                  <option value="">Select observation</option>
                  {imageObservations.map((item) => <option key={item.observation_id} value={item.acquisition_date}>{formatDate(item.acquisition_date)}</option>)}
                </select>
              </label>
              <button type="button" disabled={!validPair} onClick={handleApplyRange} className="inline-flex items-center justify-center gap-2 rounded-lg bg-aurora-400 px-4 py-2.5 text-xs font-mono font-semibold text-space-950 disabled:cursor-not-allowed disabled:opacity-40"><Activity size={14} /> Analyze Change</button>
            </div>
            {!validPair && fromDate && toDate && <div className="mt-3 text-[11px] font-mono text-amber-300">Select two observations in chronological order.</div>}
          </GlassPanel>

          {analysis && (
            <>
              <GlassPanel className="p-5">
                <div className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-text-secondary"><Layers size={14} className="text-aurora-400" /> Before / After Analysis</div>
                <BeforeAfterCompare beforeUrl={analysis.before?.image_url ?? getObservationImageUrl(fromObservation)} afterUrl={analysis.after?.image_url ?? getObservationImageUrl(toObservation)} differenceHeatmapUrl={analysis.spatial_layers?.difference_heatmap_url} backendMaskUrl={analysis.spatial_layers?.backend_difference_mask_url} beforeDate={analysis.before?.date ?? fromDate} afterDate={analysis.after?.date ?? toDate} showDifferenceMap={false} onFullscreen={() => setIsComparisonFullscreen(true)} />
              </GlassPanel>

              {isComparisonFullscreen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-space-950/95 p-3 backdrop-blur-sm">
                  <GlassPanel className="relative h-full w-full max-w-7xl bg-space-900/95 p-5">
                    <button
                      type="button"
                      aria-label="Close fullscreen comparison"
                      onClick={() => setIsComparisonFullscreen(false)}
                      className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-space-950/80 text-text-secondary transition hover:text-text-primary"
                    >
                      <X size={16} />
                    </button>
                    <BeforeAfterCompare
                      beforeUrl={analysis.before?.image_url ?? getObservationImageUrl(fromObservation)}
                      afterUrl={analysis.after?.image_url ?? getObservationImageUrl(toObservation)}
                      differenceHeatmapUrl={analysis.spatial_layers?.difference_heatmap_url}
                      backendMaskUrl={analysis.spatial_layers?.backend_difference_mask_url}
                      beforeDate={analysis.before?.date ?? fromDate}
                      afterDate={analysis.after?.date ?? toDate}
                      fullBleed
                      showDifferenceMap={false}
                      onFullscreen={() => setIsComparisonFullscreen(false)}
                    />
                  </GlassPanel>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  ['Separation', `${analysis.range?.days ?? 0} days`],
                  ['Change score', analysis.metrics?.ndvi_delta !== null && analysis.metrics?.ndvi_delta !== undefined ? analysis.metrics.ndvi_delta.toFixed(3) : 'UNAVAILABLE'],
                  ['Velocity', analysis.metrics?.velocity !== null && analysis.metrics?.velocity !== undefined ? `${analysis.metrics.velocity.toFixed(5)} / DAY` : 'UNAVAILABLE'],
                  ['Affected pixels', analysis.metrics?.drift !== null && analysis.metrics?.drift !== undefined ? `${Math.abs(analysis.metrics.drift).toFixed(1)}%` : 'UNAVAILABLE'],
                  ['Valid pixels', analysis.quality && analysis.quality.observations_used !== undefined ? `${analysis.quality.observations_used}%` : 'UNAVAILABLE'],
                ].map(([label, value]) => <div key={label} className="border-l border-white/[0.1] pl-3"><div className="text-[10px] font-mono uppercase text-text-muted">{label}</div><div className="mt-1 text-sm font-mono text-text-primary">{String(value)}</div></div>)}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SignalChart title="Temporal Change Velocity" data={velocityChart} color="#00D4FF" fromDate={fromDate} toDate={toDate} activeDate={activeDate} onHover={setActiveDate} unit="score/day" />
                {analysis.optical && (['ndvi', 'ndwi'] as const).map((key) => {
                  const points = (analysis.optical[key === 'ndvi' ? 'ndvi' : 'ndwi'] || []).map((value, index) => ({
                    date: analysis.optical.dates[index],
                    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
                  })).filter((point) => point.date >= fromDate && point.date <= toDate && point.value !== null);
                  return (
                    <SignalChart key={key} title={key.toUpperCase() + ' Temporal Signal'} data={points} color={key === 'ndvi' ? '#34D399' : '#60A5FA'} fromDate={fromDate} toDate={toDate} activeDate={activeDate} onHover={setActiveDate} unit={key.toUpperCase()} />
                  );
                })}
                {sarSeriesCards.map(({ key, title, points, color }) => (
                  <SignalChart key={key} title={title} data={points} color={color} fromDate={fromDate} toDate={toDate} activeDate={activeDate} onHover={setActiveDate} unit="dB" />
                ))}
              </div>

              {(() => {
                const sentinel1Evidence = analysis.sar_evidence?.after;
                const hasSentinel1Evidence = Boolean(
                  analysis?.sar_evidence?.available &&
                  sentinel1Evidence &&
                  Object.values(sentinel1Evidence.visuals ?? {}).some((url) => Boolean(url))
                );

                return hasSentinel1Evidence && sentinel1Evidence ? (
                  <GlassPanel className="p-5">
                    <div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Sentinel-1 evidence</div>
                    <div className="mt-1 text-[10px] font-mono text-text-muted">ACQUIRED {sentinel1Evidence.acquisition_datetime || 'DATE UNAVAILABLE'} | ONE OBSERVATION / FOUR PRODUCTS</div>
                    <div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(sentinel1Evidence.visuals ?? {}).filter(([, url]) => Boolean(url)).map(([product, url]) => <TileThumbnail key={product} src={url || undefined} alt={product} aspectRatio="square" />)}</div>
                  </GlassPanel>
                ) : null;
              })()}

              <GlassPanel className="p-5"><div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Analyst remark</div><div className="mt-2 text-[10px] font-mono uppercase text-aurora-300">{brief?.available ? 'QWEN / OLLAMA ONLINE' : 'QWEN / OLLAMA UNAVAILABLE - DETERMINISTIC SUMMARY'}</div><p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">{brief?.brief || 'Grounded remark will be available after analysis.'}</p></GlassPanel>
              <AnalystChatPanel tileId={tileId} fromDate={fromDate} toDate={toDate} enabled={Boolean(submitted && validPair && analysis)} seedBrief={brief?.brief} />
              {submitted && validPair && analysis && <GlassPanel className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Analyst Evidence Report</div>
                    <p className="mt-2 text-xs font-mono text-text-muted">One-page grounded dossier - imagery, metrics, SAR status, analyst summary. Saved locally; nothing is uploaded.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={isExporting} onClick={() => void handleReportExport('pdf')} className="inline-flex items-center gap-2 rounded-lg bg-aurora-400 px-3 py-2 text-xs font-mono font-semibold text-space-950 disabled:cursor-not-allowed disabled:opacity-40"><Download size={14} /> Export PDF</button>
                    <button type="button" disabled={isExporting} onClick={() => void handleReportExport('json')} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-mono text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"><Download size={14} /> Export JSON</button>
                  </div>
                </div>
                {exportError && <div className="mt-3 text-[11px] font-mono text-amber-300">{exportError}</div>}
              </GlassPanel>}
            </>
          )}

          {!analysis && !isLoading && fromObservation && toObservation && <div className="text-xs font-mono text-text-muted">Ready: {formatDate(fromObservation.acquisition_date)} to {formatDate(toObservation.acquisition_date)}. Select ANALYZE CHANGE to load the evidence.</div>}

          <GlassPanel className="p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-text-secondary">Full temporal context</div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">{imageObservations.map((item) => (
              <button type="button" key={item.observation_id} onClick={() => { setActiveDate(item.acquisition_date); setFromDate(item.acquisition_date); setSubmitted(false); }} className="w-28 min-w-28 text-left">
                <TileThumbnail src={getObservationImageUrl(item) ?? undefined} alt={item.acquisition_date} aspectRatio="square" loading="eager" className={item.acquisition_date === fromDate || item.acquisition_date === toDate || item.acquisition_date === activeDate ? 'ring-2 ring-aurora-400' : ''} />
                <div className="mt-1 text-[10px] font-mono text-text-muted">{formatDate(item.acquisition_date)}</div>
              </button>
            ))}</div>
          </GlassPanel>
        </>
      )}
    </div>
  );
};
