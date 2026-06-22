'use client';

import { useState, useEffect, useCallback } from 'react';
import { dashboardApi, type DashboardSummary, type CopyTradeResponse } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

export function useDashboardData() {
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTrades, setRecentTrades] = useState<CopyTradeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [summaryData, tradesData] = await Promise.all([
        dashboardApi.getSummary(token),
        dashboardApi.getRecentTrades(token),
      ]);
      setSummary(summaryData);
      setRecentTrades(tradesData.trades);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { summary, recentTrades, isLoading, error, refetch: fetchData };
}
