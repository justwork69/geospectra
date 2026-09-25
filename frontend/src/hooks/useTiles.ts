import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TileDetail, SearchResult, TileObservation, TileObservationsResponse, TemporalAnalysis, TemporalSignature, AnalysisBrief } from '@/types/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalystChatResponse {
  available: boolean;
  reply: string;
  facts: Record<string, unknown>;
}

export async function postAnalystChat(tileId: string, fromDate: string, toDate: string, question: string, history: ChatMessage[]): Promise<AnalystChatResponse> {
  return api.post<AnalystChatResponse>(`/tiles/${tileId}/analysis/chat`, {
    question,
    before_date: fromDate,
    after_date: toDate,
    history,
  });
}

export async function downloadAnalystReport(tileId: string, fromDate: string, toDate: string, format: 'pdf' | 'json', summary?: string): Promise<void> {
  const response = await fetch(`${api.baseUrl.replace(/\/$/, '')}/tiles/${encodeURIComponent(tileId)}/analysis/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ before_date: fromDate, after_date: toDate, format, summary }),
  });
  if (!response.ok) {
    throw new Error(`Report export failed with HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `geospectra-report-${tileId}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function useTile(tileId: string | undefined) {
  return useQuery<TileDetail>({
    queryKey: ['tile', tileId],
    queryFn: () => api.get<TileDetail>(`/tiles/${tileId}`),
    enabled: Boolean(tileId),
    staleTime: 60000,
  });
}

export function useTileObservations(tileId: string | undefined) {
  return useQuery<TileObservation[]>({
    queryKey: ['tile-observations', tileId],
    queryFn: async ({ signal }) => (await api.get<TileObservationsResponse>(`/tiles/${tileId}/observations`, undefined, signal)).observations,
    enabled: Boolean(tileId),
    staleTime: 30000,
  });
}

export function useTemporalAnalysis(tileId: string | undefined, fromDate?: string | null, toDate?: string | null, enabled = true) {
  return useQuery<TemporalAnalysis>({
    queryKey: ['temporal-analysis', tileId, fromDate ?? 'all', toDate ?? 'all'],
    queryFn: ({ signal }) => api.get<TemporalAnalysis>(`/tiles/${tileId}/analysis`, { from_date: fromDate, to_date: toDate }, signal),
    enabled: Boolean(enabled && tileId && fromDate && toDate && fromDate < toDate),
    staleTime: 30000,
  });
}

export function useTemporalSignature(tileId: string | undefined) {
  return useQuery<TemporalSignature>({
    queryKey: ['temporal-signature', tileId],
    queryFn: () => api.get<TemporalSignature>(`/tiles/${tileId}/temporal-signature`),
    enabled: Boolean(tileId),
    staleTime: 30000,
  });
}

export function useAnalysisBrief(tileId: string | undefined, fromDate?: string, toDate?: string, enabled = false) {
  return useQuery<AnalysisBrief>({
    queryKey: ['analysis-brief', tileId, fromDate, toDate],
    queryFn: () => api.post<AnalysisBrief>(`/tiles/${tileId}/analysis/brief`, { before_date: fromDate, after_date: toDate }),
    enabled: Boolean(enabled && tileId && fromDate && toDate),
    staleTime: 30000,
  });
}

export function useSimilarTiles(tileId: string | undefined, k = 12) {
  return useQuery<SearchResult[]>({
    queryKey: ['tile-similar', tileId, k],
    queryFn: () => api.get<SearchResult[]>(`/tiles/${tileId}/similar`, { k }),
    enabled: Boolean(tileId),
    staleTime: 60000,
  });
}

export function useSimilarTilesByVector(vectorId: number | null | undefined, k = 12) {
  return useQuery<SearchResult[], Error>({
    queryKey: ['similar-tiles-vector', vectorId, k],
    queryFn: () => api.get<SearchResult[]>(`/vectors/${vectorId}/similar`, { k }),
    enabled: vectorId !== null && vectorId !== undefined,
  });
}
