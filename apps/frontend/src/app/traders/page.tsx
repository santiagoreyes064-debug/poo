'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TraderRow } from '@/components/TraderRow';
import { tradersApi, type TraderResponse } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { ArrowUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortField = 'roi7d' | 'roi30d' | 'winRate' | 'sharpeRatio' | 'maxDrawdown' | 'totalTrades';

export default function TradersPage() {
  const token = useAuthStore((s) => s.token);
  const [traders, setTraders] = useState<TraderResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>('roi7d');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [addWallet, setAddWallet] = useState('');
  const [addingTrader, setAddingTrader] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);

  const fetchTraders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { traders: data } = await tradersApi.list(token, {
        sortBy,
        order: sortOrder,
      });
      setTraders(data);
    } catch {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  }, [token, sortBy, sortOrder]);

  useEffect(() => {
    fetchTraders();
  }, [fetchTraders]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleAddTrader = async () => {
    if (!token || !addWallet.trim()) return;
    setAddingTrader(true);
    setAddStatus(null);
    try {
      await tradersApi.add(token, addWallet.trim());
      setAddStatus('Trader added successfully!');
      setAddWallet('');
      await fetchTraders();
    } catch (err) {
      setAddStatus(err instanceof Error ? err.message : 'Failed to add trader');
    } finally {
      setAddingTrader(false);
    }
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-gray-200"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading traders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trader Leaderboard</h1>
        <p className="text-sm text-gray-400">{traders.length} traders tracked</p>
      </div>

      {/* Add Trader Section */}
      {token && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Trader</h3>
            <div className="flex gap-2">
              <Input
                placeholder="Paste Solana wallet address..."
                value={addWallet}
                onChange={(e) => setAddWallet(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTrader()}
              />
              <Button onClick={handleAddTrader} disabled={!addWallet.trim() || addingTrader}>
                <Plus className="h-4 w-4 mr-1" />
                {addingTrader ? '...' : 'Add Trader'}
              </Button>
            </div>
            {addStatus && (
              <p className={cn('text-xs', addStatus.toLowerCase().includes('success') ? 'text-brand-green' : 'text-red-400')}>
                {addStatus}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!token && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-center text-gray-400">
          Connect your wallet to view the trader leaderboard
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Trader</TableHead>
              <SortableHeader field="roi7d" label="7d ROI" />
              <SortableHeader field="roi30d" label="30d ROI" />
              <SortableHeader field="winRate" label="Win Rate" />
              <SortableHeader field="sharpeRatio" label="Sharpe" />
              <SortableHeader field="maxDrawdown" label="Drawdown" />
              <SortableHeader field="totalTrades" label="Trades" />
              <TableHead>Copiers</TableHead>
              <TableHead className="w-20">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traders.map((trader, index) => (
              <TraderRow key={trader.id} trader={trader} rank={index + 1} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
