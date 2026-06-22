'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/useAuthStore';
import { useVaultStore } from '@/stores/useVaultStore';
import { useVaultData } from '@/hooks/useVaultData';
import { usePositionsData } from '@/hooks/usePositionsData';
import { tradersApi, copyApi, type TraderResponse, type VaultResponse } from '@/lib/api';
import { formatSol, truncateAddress, cn } from '@/lib/utils';
import {
  ArrowLeft, Heart, Archive, Plus, Copy, Pencil, Check,
  Pause, Play, ArrowDownToLine, ArrowUpFromLine, Wallet,
} from 'lucide-react';

// ─── Wallet List View ───────────────────────────────────────────────────────

function WalletListView({ onSelectVault }: { onSelectVault: (vault: VaultResponse) => void }) {
  const token = useAuthStore((s) => s.token);
  const { vault, isLoading } = useVaultData();
  const { vaultMetadata, updateVaultMetadata, createVault } = useVaultStore();
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(false);

  const metadata = vault ? vaultMetadata.find((m) => m.id === vault.id) : null;
  const vaults = vault ? [{ vault, metadata }] : [];

  const filtered = vaults.filter(({ metadata: m }) => {
    if (tab === 'favorites') return m?.isFavorite;
    if (tab === 'archived') return m?.isArchived;
    return true;
  });

  const handleCreate = async () => {
    if (!token) return;
    setCreating(true);
    try {
      await createVault(token, {
        maxTradeSizeSol: 2,
        maxDailyLossSol: 5,
        maxSlippageBps: 100,
        maxOpenPositions: 5,
        allowedDexs: ['JUPITER'],
      });
    } catch {
      // Error handled by store
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading wallets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallets</h1>

      {!token && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center">
          <Wallet className="h-8 w-8 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">Connect your wallet to manage vaults</p>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <div className="space-y-3 mt-4">
            {filtered.length === 0 && token && (
              <p className="text-gray-500 text-center py-8">
                {tab === 'favorites' ? 'No favorite wallets yet' :
                 tab === 'archived' ? 'No archived wallets' :
                 'No wallets yet. Create one to get started.'}
              </p>
            )}

            {filtered.map(({ vault: v, metadata: m }) => (
              <Card
                key={v.id}
                className="cursor-pointer hover:border-gray-600 transition-colors"
                onClick={() => onSelectVault(v)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg truncate">
                          {m?.name || 'My Wallet'}
                        </h3>
                        <Badge variant={v.isPaused ? 'warning' : 'success'} className="text-xs">
                          {v.isPaused ? 'Paused' : 'Active'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400 font-mono mt-0.5">
                        {truncateAddress(v.publicKey, 6)}
                      </p>
                      <p className="text-sm text-brand-green font-semibold mt-1">
                        {formatSol(v.availableSol)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Click to view details</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (m) updateVaultMetadata(v.id, { isFavorite: !m.isFavorite });
                        }}
                        className="p-2 rounded-md hover:bg-gray-800 transition-colors"
                      >
                        <Heart
                          className={cn('h-4 w-4', m?.isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-500')}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (m) updateVaultMetadata(v.id, { isArchived: !m.isArchived });
                        }}
                        className="p-2 rounded-md hover:bg-gray-800 transition-colors"
                      >
                        <Archive
                          className={cn('h-4 w-4', m?.isArchived ? 'text-yellow-500' : 'text-gray-500')}
                        />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Button
        onClick={handleCreate}
        disabled={!token || creating}
        className="w-full bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white font-semibold py-3"
      >
        <Plus className="h-4 w-4 mr-2" />
        {creating ? 'Creating...' : '+ Create New Wallet'}
      </Button>
    </div>
  );
}

// ─── Wallet Detail View ─────────────────────────────────────────────────────

function WalletDetailView({ vault, onBack }: { vault: VaultResponse; onBack: () => void }) {
  const token = useAuthStore((s) => s.token);
  const { vaultMetadata, updateVaultMetadata, deposit, withdraw, pause, resume, fetchVault, error: storeError } = useVaultStore();
  const { trades, tokens, totalPnl, isLoading: positionsLoading } = usePositionsData();

  const metadata = vaultMetadata.find((m) => m.id === vault.id);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(metadata?.name || 'My Wallet');
  const [copied, setCopied] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [addingTrader, setAddingTrader] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [topTraders, setTopTraders] = useState<TraderResponse[]>([]);

  // Deposit/Withdraw dialog state
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch top traders
  useEffect(() => {
    tradersApi.list(token, { sortBy: 'roi7d', order: 'desc', limit: 3 })
      .then(({ traders }) => setTopTraders(traders))
      .catch(() => {});
  }, [token]);

  const hasBalance = vault.availableSol > 0;
  const hasCopyRelations = trades.length > 0;
  const statusText = !hasBalance && !hasCopyRelations
    ? 'Pending setup - Add SOL - Track a wallet'
    : vault.isPaused ? 'Paused' : 'Active';

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(vault.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveName = () => {
    updateVaultMetadata(vault.id, { name: nameInput });
    setEditingName(false);
  };

  const handleAddTrader = async () => {
    if (!token || !walletInput.trim()) return;
    setAddingTrader(true);
    setAddStatus(null);
    try {
      const trader = await tradersApi.add(token, walletInput.trim());
      await copyApi.subscribe(token, {
        traderId: trader.id,
        copyMode: 'FIXED',
        fixedAmountSol: vault.maxTradeSizeSol,
        maxTradeSizeSol: vault.maxTradeSizeSol,
        maxSlippageBps: vault.maxSlippageBps,
      });
      setAddStatus('Successfully added and subscribed!');
      setWalletInput('');
    } catch (err) {
      setAddStatus(err instanceof Error ? err.message : 'Failed to add trader');
    } finally {
      setAddingTrader(false);
    }
  };

  const handleDeposit = async () => {
    if (!token || !depositAmount) return;
    setActionLoading(true);
    try {
      // TODO: Replace 'pending-signature' with real wallet signing.
      // This prototype bypasses Solana transaction signing. In production,
      // the user's wallet adapter should sign the transaction and provide
      // the actual transaction signature here.
      await deposit(token, parseFloat(depositAmount), 'pending-signature');
      await fetchVault(token);
      setDepositAmount('');
      setShowDeposit(false);
    } catch {
      // Error handled by store
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!token || !withdrawAmount) return;
    const amount = parseFloat(withdrawAmount);
    if (amount > vault.availableSol) return;
    setActionLoading(true);
    try {
      // TODO: Replace 'pending-signature' with real wallet signing.
      // This prototype bypasses Solana transaction signing. In production,
      // the user's wallet adapter should sign the transaction and provide
      // the actual transaction signature here.
      await withdraw(token, amount, 'pending-signature');
      await fetchVault(token);
      setWithdrawAmount('');
      setShowWithdraw(false);
    } catch {
      // Error handled by store
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseResume = async () => {
    if (!token) return;
    if (vault.isPaused) {
      await resume(token);
    } else {
      await pause(token);
    }
    await fetchVault(token);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-md hover:bg-gray-800 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-8 w-48"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                />
                <button onClick={handleSaveName} className="p-1 hover:bg-gray-800 rounded">
                  <Check className="h-4 w-4 text-brand-green" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold">{metadata?.name || 'My Wallet'}</h1>
                <button onClick={() => setEditingName(true)} className="p-1 hover:bg-gray-800 rounded">
                  <Pencil className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-400 font-mono">{truncateAddress(vault.publicKey, 6)}</span>
            <button onClick={handleCopyAddress} className="p-1 hover:bg-gray-800 rounded">
              {copied ? <Check className="h-3.5 w-3.5 text-brand-green" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{statusText}</p>
        </div>
      </div>

      {/* Balance + Trade Amount Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-gray-400 mb-1">Balance</p>
            <p className="text-2xl font-bold text-brand-green">{formatSol(vault.availableSol)}</p>
            <p className="text-xs text-gray-500 mt-1">Deposited: {formatSol(vault.depositedSol)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-gray-400 mb-1">Trade Amount</p>
            <p className="text-2xl font-bold">{formatSol(vault.maxTradeSizeSol)}</p>
            <p className="text-xs text-gray-500 mt-1">Copy Exact</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowWithdraw(true)}
        >
          <ArrowUpFromLine className="h-4 w-4 mr-2" /> Withdraw
        </Button>
        <Button
          variant={vault.isPaused ? 'default' : 'destructive'}
          className="flex-1"
          onClick={handlePauseResume}
        >
          {vault.isPaused ? <><Play className="h-4 w-4 mr-2" /> Resume</> : <><Pause className="h-4 w-4 mr-2" /> Pause</>}
        </Button>
      </div>

      {/* Store Error Display */}
      {storeError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{storeError}</p>
        </div>
      )}

      {/* Withdraw Dialog */}
      {showWithdraw && (
        <Card className="border-gray-700">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Withdraw SOL</h3>
              <button onClick={() => setShowWithdraw(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
            </div>
            <p className="text-xs text-gray-400">Available: {formatSol(vault.availableSol)}</p>
            <Input
              type="number"
              placeholder="Amount in SOL"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="0"
              step="0.01"
              max={vault.availableSol}
            />
            {parseFloat(withdrawAmount) > vault.availableSol && (
              <p className="text-xs text-red-400">Amount exceeds available balance</p>
            )}
            <Button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) > vault.availableSol || actionLoading}
              className="w-full"
            >
              {actionLoading ? 'Processing...' : 'Confirm Withdrawal'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Deposit Banner */}
      <Card className="border-brand-purple/30 bg-brand-purple/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Deposit SOL to Start Copy Trading</h3>
              <p className="text-xs text-gray-400 mt-1">Send SOL to your vault address:</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono text-gray-300 bg-gray-800 px-2 py-1 rounded">
                  {truncateAddress(vault.publicKey, 8)}
                </span>
                <button onClick={handleCopyAddress} className="p-1 hover:bg-gray-800 rounded">
                  {copied ? <Check className="h-3 w-3 text-brand-green" /> : <Copy className="h-3 w-3 text-gray-400" />}
                </button>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowDeposit(true)}>
              <ArrowDownToLine className="h-4 w-4 mr-1" /> Deposit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deposit Dialog */}
      {showDeposit && (
        <Card className="border-gray-700">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Deposit SOL</h3>
              <button onClick={() => setShowDeposit(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
            </div>
            <p className="text-xs text-gray-400">Deposit address:</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-300 bg-gray-800 px-2 py-1 rounded flex-1 truncate">
                {vault.publicKey}
              </span>
              <button onClick={handleCopyAddress} className="p-1 hover:bg-gray-800 rounded">
                {copied ? <Check className="h-3 w-3 text-brand-green" /> : <Copy className="h-3 w-3 text-gray-400" />}
              </button>
            </div>
            <Input
              type="number"
              placeholder="Amount in SOL"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              min="0"
              step="0.01"
            />
            <Button
              onClick={handleDeposit}
              disabled={!depositAmount || actionLoading}
              className="w-full"
            >
              {actionLoading ? 'Processing...' : 'Confirm Deposit'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Copy Trading Section */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold">Copy Trading</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Paste any Solana wallet to track..."
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTrader()}
            />
            <Button onClick={handleAddTrader} disabled={!walletInput.trim() || addingTrader}>
              <Plus className="h-4 w-4 mr-1" />
              {addingTrader ? '...' : 'Add'}
            </Button>
          </div>
          {addStatus && (
            <p className={cn('text-xs', addStatus.includes('Success') ? 'text-brand-green' : 'text-red-400')}>
              {addStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Traders This Week */}
      {topTraders.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="font-semibold text-sm text-gray-300">Top traders this week</h3>
            <div className="space-y-2">
              {topTraders.map((trader) => (
                <div key={trader.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{trader.label || truncateAddress(trader.walletAddress, 4)}</p>
                    <p className="text-xs text-gray-500">{trader.totalTrades} trades</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold', trader.roi7d >= 0 ? 'text-brand-green' : 'text-red-400')}>
                      {trader.roi7d >= 0 ? '+' : ''}{trader.roi7d.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">{trader.winRate.toFixed(0)}% win</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Positions */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold">Active Positions</h3>
          {positionsLoading ? (
            <p className="text-sm text-gray-500">Loading positions...</p>
          ) : trades.length === 0 ? (
            <p className="text-sm text-gray-500">No active positions. Add a trader to start copying.</p>
          ) : (
            <div className="space-y-2">
              {trades.slice(0, 10).map((trade) => (
                <div key={trade.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {truncateAddress(trade.tokenOut, 4)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {trade.dex} - {trade.status}
                    </p>
                  </div>
                  <div className="text-right">
                    {trade.pnlSol !== undefined && trade.pnlSol !== null ? (
                      <p className={cn('text-sm font-semibold', trade.pnlSol >= 0 ? 'text-brand-green' : 'text-red-400')}>
                        {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)} SOL
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Pending</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* P&L Summary */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold">P&L Summary</h3>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-400">Total P&L</span>
            <span className={cn('text-lg font-bold', totalPnl >= 0 ? 'text-brand-green' : 'text-red-400')}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)} SOL
            </span>
          </div>
          {tokens.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Per Token Breakdown</p>
              {tokens.map((t) => (
                <div key={t.mint} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-mono">{truncateAddress(t.mint, 4)}</p>
                    <p className="text-xs text-gray-500">{t.count} trades</p>
                  </div>
                  <p className={cn('text-sm font-semibold', t.totalPnl >= 0 ? 'text-brand-green' : 'text-red-400')}>
                    {t.totalPnl >= 0 ? '+' : ''}{t.totalPnl.toFixed(4)} SOL
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function VaultPage() {
  const [selectedVault, setSelectedVault] = useState<VaultResponse | null>(null);
  const { vault } = useVaultStore();

  // Sync store vault updates to selectedVault
  useEffect(() => {
    if (selectedVault && vault && vault.id === selectedVault.id) {
      setSelectedVault(vault);
    }
  }, [vault, selectedVault]);

  if (selectedVault) {
    return <WalletDetailView vault={selectedVault} onBack={() => setSelectedVault(null)} />;
  }

  return <WalletListView onSelectVault={setSelectedVault} />;
}
