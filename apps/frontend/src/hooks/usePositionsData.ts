'use client';

import { useState, useEffect, useCallback } from 'react';
import { dashboardApi, type CopyTradeResponse, type TokenBreakdownResponse } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

export function usePositionsData() {
  const token = useAuthStore((s) => s.token);
  const [trades, setTrades] = useState<CopyTradeResponse[]>([]);
  const [tokens, setTokens] = useState<TokenBreakdownResponse[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [tradesData, tokensData] = await Promise.all([
        dashboardApi.getRecentTrades(token, 50),
        dashboardApi.getTokens(token),
      ]);
      setTrades(tradesData.trades);
      setTokens(tokensData.tokens);
      const pnl = tokensData.tokens.reduce((sum, t) => sum + t.totalPnl, 0);
      setTotalPnl(pnl);
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { trades, tokens, totalPnl, isLoading, refetch: fetchData };
}
