'use client';

import { useQuery } from '@tanstack/react-query';
import {
  checkAdminAccess,
  getAdminActivity,
  getAdminAnalytics,
  getMyAnalytics,
  getToken,
} from '@/lib/api';

export function useMyAnalytics(enabled = true) {
  const token = getToken();

  return useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: getMyAnalytics,
    enabled: !!token && enabled,
    staleTime: 20_000,
    placeholderData: (previous) => previous,
  });
}

export function useIsAdmin(enabled = true) {
  const token = getToken();

  return useQuery({
    queryKey: ['admin', 'access'],
    queryFn: checkAdminAccess,
    enabled: !!token && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useAdminAnalytics(rangeDays = 30, limit = 10, enabled = true) {
  const token = getToken();

  return useQuery({
    queryKey: ['admin', 'analytics', rangeDays, limit],
    queryFn: () => getAdminAnalytics(rangeDays, limit),
    enabled: !!token && enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });
}

export function useAdminActivity(limit = 20, enabled = true) {
  const token = getToken();

  return useQuery({
    queryKey: ['admin', 'activity', limit],
    queryFn: () => getAdminActivity(limit),
    enabled: !!token && enabled,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });
}
