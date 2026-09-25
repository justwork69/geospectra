import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AOI, AOITilesResponse, TimelineEntry, Mosaic } from '@/types/api';

const isDemoAOI = (aoi: AOI) => {
  const normalizedId = aoi.aoi_id.replace(/[-_\s]+/g, '').toLowerCase();
  const normalizedName = aoi.name.replace(/[-_\s]+/g, '').toLowerCase();
  return normalizedId === 'demoaoilive' || normalizedName === 'demoaoilive';
};

export function useAOIs() {
  return useQuery<AOI[]>({
    queryKey: ['aois'],
    queryFn: async () => {
      const aois = await api.get<AOI[]>('/aois');
      return aois.filter((aoi) => !isDemoAOI(aoi));
    },
    staleTime: 30000,
  });
}

export function useAOITimeline(aoiId: string | undefined) {
  return useQuery<TimelineEntry[]>({
    queryKey: ['aoi-timeline', aoiId],
    queryFn: () => api.get<TimelineEntry[]>(`/aois/${aoiId}/timeline`),
    enabled: Boolean(aoiId),
    staleTime: 30000,
  });
}

export function useAOITiles(aoiId: string | undefined) {
  return useQuery<AOITilesResponse>({
    queryKey: ['aoi-tiles', aoiId],
    queryFn: () => api.get<AOITilesResponse>(`/aois/${aoiId}/tiles`),
    enabled: Boolean(aoiId),
    staleTime: 30000,
  });
}

export function useMosaic(aoiId: string | undefined, date: string | undefined) {
  return useQuery<Mosaic>({
    queryKey: ['aoi-mosaic', aoiId, date],
    queryFn: () => api.get<Mosaic>(`/aois/${aoiId}/mosaic`, { date }),
    enabled: Boolean(aoiId && date),
    staleTime: 60000,
  });
}
