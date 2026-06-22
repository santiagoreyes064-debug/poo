'use client';

import { useState, useEffect, useCallback } from 'react';
import { tradersApi, type TraderResponse, type TradeResponse, type AnalyticsResponse } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

export function useTraderData(traderId: string) {
  const token = useAuthStore((s) => s.token);
  const [trader, setTrader] = useState<TraderResponse | null>(null);
  const [trades, setTrades] = useState<TradeResponse[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [traderData, tradesData, analyticsData] = await Promise.all([
        tradersApi.getById(token, traderId),
        tradersApi.getTrades(token, traderId),
        tradersApi.getAnalytics(token, traderId),
      ]);
      setTrader(traderData);
      setTrades(tradesData.trades);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trader data');
    } finally {
      setIsLoading(false);
    }
  }, [token, traderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { trader, trades, analytics, isLoading, error, refetch: fetchData };
}
