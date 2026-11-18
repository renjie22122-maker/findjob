import { useQuery } from '@tanstack/react-query';
import { emailApi, statsApi } from '../api';

export function useOverview() {
  return useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: statsApi.overview,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useTrends(days = 30,end?:string) {
  return useQuery({
    queryKey: ['stats', 'trends', days,end],
    queryFn: () => statsApi.trends(days,end),
    refetchInterval: 30_000,
  });
}

export function useToday() {
  return useQuery({
    queryKey: ['stats', 'today'],
    queryFn: statsApi.today,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePendingEmailCount() {
  return useQuery({
    queryKey: ['email', 'pending-count'],
    queryFn: async () => {
      const res = await emailApi.items({ status: 'pending', page: 1, pageSize: 1 });
      return res.total;
    },
    refetchInterval: 60_000,
  });
}
