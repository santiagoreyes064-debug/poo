'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PnLChart } from '@/components/PnLChart';
import { StatsGrid } from '@/components/StatsGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { CopyModal } from '@/components/CopyModal';
import { useTraderData } from '@/hooks/useTraderData';
import { truncateAddress } from '@/lib/utils';

export default function TraderProfilePage() {
  const params = useParams();
  const traderId = params.id as string;
  const { trader, trades, analytics, isLoading, error } = useTraderData(traderId);
  const [chartWindow, setChartWindow] = useState('7');
  const [showCopyModal, setShowCopyModal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading trader profile...</div>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-red-400">{error || 'Trader not found'}</div>
      </div>
    );
  }

  const stats = [
    { label: '7d ROI', value: `${trader.roi7d >= 0 ? '+' : ''}${trader.roi7d.toFixed(1)}%` },
    { label: '30d ROI', value: `${trader.roi30d >= 0 ? '+' : ''}${trader.roi30d.toFixed(1)}%` },
    { label: 'Win Rate', value: `${(trader.winRate * 100).toFixed(0)}%` },
    { label: 'Sharpe Ratio', value: trader.sharpeRatio.toFixed(2) },
    { label: 'Max Drawdown', value: `${trader.maxDrawdown.toFixed(1)}%` },
    { label: 'Total Trades', value: trader.totalTrades },
    { label: 'Copiers', value: trader.copiersCount },
    { label: 'Avg Hold Time', value: `${Math.round(trader.avgHoldTime / 60)}m` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{truncateAddress(trader.walletAddress, 6)}</h1>
            {trader.label && <Badge variant="secondary">{trader.label}</Badge>}
            <StatusBadge status={trader.status} />
          </div>
          <p className="text-sm text-gray-400 mt-1 font-mono">{trader.walletAddress}</p>
        </div>
        <Button onClick={() => setShowCopyModal(true)}>Copy This Trader</Button>
      </div>

      <StatsGrid stats={stats} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>PnL Chart</CardTitle>
          <Tabs value={chartWindow} onValueChange={setChartWindow}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <PnLChart data={analytics?.dataPoints || []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No trades yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Amount In</TableHead>
                  <TableHead>Amount Out</TableHead>
                  <TableHead>DEX</TableHead>
                  <TableHead>Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(trade.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {trade.tokenIn.slice(0, 4)}/{trade.tokenOut.slice(0, 4)}
                    </TableCell>
                    <TableCell>{trade.amountIn}</TableCell>
                    <TableCell>{trade.amountOut}</TableCell>
                    <TableCell>{trade.dex}</TableCell>
                    <TableCell className="font-mono text-xs text-gray-400">
                      {truncateAddress(trade.signature, 8)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CopyModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        traderId={trader.id}
        traderLabel={trader.label}
      />
    </div>
  );
}
