'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PnLCard } from '@/components/PnLCard';
import { TradeTable } from '@/components/TradeTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuthStore } from '@/stores/useAuthStore';
import { Wallet, TrendingUp, Shield } from 'lucide-react';

function HeroSection() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-4xl md:text-5xl font-bold mb-4">
        <span className="text-brand-purple">Solana</span> Copy Trading
      </h1>
      <p className="text-gray-400 text-lg mb-8 max-w-2xl">
        Non-custodial automated copy trading. Follow top traders on Solana,
        execute trades through your own vault, and maintain full control of your funds.
      </p>
      <WalletMultiButton className="!bg-brand-purple hover:!bg-brand-purple/90 !h-12 !rounded-lg !text-base !px-8" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-4xl">
        <Card>
          <CardContent className="p-6 text-center">
            <Wallet className="h-10 w-10 text-brand-purple mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Non-Custodial</h3>
            <p className="text-sm text-gray-400">
              Your funds stay in your vault. You sign every transaction.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <TrendingUp className="h-10 w-10 text-brand-green mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Copy Top Traders</h3>
            <p className="text-sm text-gray-400">
              Discover and follow profitable Solana traders automatically.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="h-10 w-10 text-brand-purple mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Risk Controls</h3>
            <p className="text-sm text-gray-400">
              Set stop-losses, position limits, and daily loss caps.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Dashboard() {
  const { summary, recentTrades, isLoading } = useDashboardData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PnLCard title="PnL (24h)" value={summary?.pnl24h ?? 0} label="Last 24 hours" />
        <PnLCard title="PnL (7d)" value={summary?.pnl7d ?? 0} label="Last 7 days" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Active Traders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeTraders ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.openPositions ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeTable trades={recentTrades} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function HomePage() {
  const { connected } = useWallet();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!connected || !isAuthenticated) {
    return <HeroSection />;
  }

  return <Dashboard />;
}
