'use client';

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useVaultStore } from '@/stores/useVaultStore';

export function useVaultData() {
  const token = useAuthStore((s) => s.token);
  const { vault, transactions, isLoading, error, fetchVault, fetchTransactions } = useVaultStore();

  const fetchData = useCallback(async () => {
    if (!token) return;
    await Promise.all([fetchVault(token), fetchTransactions(token)]);
  }, [token, fetchVault, fetchTransactions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { vault, transactions, isLoading, error, refetch: fetchData };
}
