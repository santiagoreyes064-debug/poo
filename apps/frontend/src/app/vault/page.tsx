'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/stores/useAuthStore';
import { useVaultStore } from '@/stores/useVaultStore';
import { useVaultData } from '@/hooks/useVaultData';
import { formatSol, cn } from '@/lib/utils';
import { DexName } from '@copy-trading/shared-types';
import { Pause, Play, Plus } from 'lucide-react';

const ALL_DEXS = [DexName.JUPITER, DexName.RAYDIUM, DexName.ORCA, DexName.METEORA];

function CreateVaultForm() {
  const token = useAuthStore((s) => s.token);
  const createVault = useVaultStore((s) => s.createVault);
  const [maxTradeSize, setMaxTradeSize] = useState('2');
  const [maxDailyLoss, setMaxDailyLoss] = useState('5');
  const [maxSlippage, setMaxSlippage] = useState('100');
  const [maxOpenPositions, setMaxOpenPositions] = useState('5');
  const [allowedDexs, setAllowedDexs] = useState<string[]>([DexName.JUPITER]);

  const handleCreate = async () => {
    if (!token) return;
    await createVault(token, {
      maxTradeSizeSol: parseFloat(maxTradeSize),
      maxDailyLossSol: parseFloat(maxDailyLoss),
      maxSlippageBps: parseInt(maxSlippage, 10),
      maxOpenPositions: parseInt(maxOpenPositions, 10),
      allowedDexs,
    });
  };

  const toggleDex = (dex: string) => {
    setAllowedDexs((prev) =>
      prev.includes(dex) ? prev.filter((d) => d !== dex) : [...prev, dex],
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Vault</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-400">
          Set up your non-custodial vault to start copy trading.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Max Trade Size (SOL)</label>
            <Input type="number" value={maxTradeSize} onChange={(e) => setMaxTradeSize(e.target.value)} min="0" step="0.1" />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Max Daily Loss (SOL)</label>
            <Input type="number" value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} min="0" step="0.1" />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Max Slippage (bps)</label>
            <Input type="number" value={maxSlippage} onChange={(e) => setMaxSlippage(e.target.value)} min="0" step="10" />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Max Open Positions</label>
            <Input type="number" value={maxOpenPositions} onChange={(e) => setMaxOpenPositions(e.target.value)} min="1" step="1" />
          </div>
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-2">Allowed DEXs</label>
          <div className="flex flex-wrap gap-2">
            {ALL_DEXS.map((dex) => (
              <button
                key={dex}
                onClick={() => toggleDex(dex)}
                className={cn(
                  'px-3 py-1 rounded-md text-sm border transition-colors',
                  allowedDexs.includes(dex)
                    ? 'border-brand-purple bg-brand-purple/10 text-brand-purple'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500',
                )}
              >
                {dex}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleCreate} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Create Vault
        </Button>
      </CardContent>
    </Card>
  );
}

function VaultManagement() {
  const token = useAuthStore((s) => s.token);
  const { vault, transactions } = useVaultData();
  const { deposit, withdraw, updateRiskParams, pause, resume } = useVaultStore();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [editingRisk, setEditingRisk] = useState(false);
  const [riskForm, setRiskForm] = useState({
    maxTradeSizeSol: vault?.maxTradeSizeSol ?? 2,
    maxDailyLossSol: vault?.maxDailyLossSol ?? 5,
    maxSlippageBps: vault?.maxSlippageBps ?? 100,
    maxOpenPositions: vault?.maxOpenPositions ?? 5,
    allowedDexs: vault?.allowedDexs ?? [DexName.JUPITER],
    tokenBlacklist: vault?.tokenBlacklist ?? [],
  });

  if (!vault) return null;

  const handleDeposit = async () => {
    if (!token || !depositAmount) return;
    await deposit(token, parseFloat(depositAmount), 'pending-signature');
    setDepositAmount('');
  };

  const handleWithdraw = async () => {
    if (!token || !withdrawAmount) return;
    await withdraw(token, parseFloat(withdrawAmount));
    setWithdrawAmount('');
  };

  const handleSaveRisk = async () => {
    if (!token) return;
    await updateRiskParams(token, riskForm);
    setEditingRisk(false);
  };

  const handlePauseResume = async () => {
    if (!token) return;
    if (vault.isPaused) {
      await resume(token);
    } else {
      await pause(token);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vault Management</h1>
        <Badge variant={vault.isPaused ? 'warning' : 'success'} className="text-sm">
          {vault.isPaused ? 'PAUSED' : 'ACTIVE'}
        </Badge>
      </div>

      {/* Balance Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-400">Deposited</p>
            <p className="text-2xl font-bold mt-1">{formatSol(vault.depositedSol)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-400">Available</p>
            <p className="text-2xl font-bold mt-1 text-brand-green">{formatSol(vault.availableSol)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-center">
            <Button
              variant={vault.isPaused ? 'default' : 'destructive'}
              onClick={handlePauseResume}
              className="w-full"
            >
              {vault.isPaused ? (
                <><Play className="h-4 w-4 mr-2" /> Resume</>
              ) : (
                <><Pause className="h-4 w-4 mr-2" /> Pause</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Deposit / Withdraw */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deposit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="number"
              placeholder="Amount in SOL"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              min="0"
              step="0.1"
            />
            <Button onClick={handleDeposit} disabled={!depositAmount} className="w-full">
              Deposit
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Withdraw</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="number"
              placeholder="Amount in SOL"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="0"
              step="0.1"
              max={vault.availableSol}
            />
            <Button onClick={handleWithdraw} disabled={!withdrawAmount} variant="outline" className="w-full">
              Withdraw
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Risk Parameters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Risk Parameters</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditingRisk(!editingRisk)}>
            {editingRisk ? 'Cancel' : 'Edit'}
          </Button>
        </CardHeader>
        <CardContent>
          {editingRisk ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Trade Size (SOL)</label>
                  <Input
                    type="number"
                    value={riskForm.maxTradeSizeSol}
                    onChange={(e) => setRiskForm({ ...riskForm, maxTradeSizeSol: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Daily Loss (SOL)</label>
                  <Input
                    type="number"
                    value={riskForm.maxDailyLossSol}
                    onChange={(e) => setRiskForm({ ...riskForm, maxDailyLossSol: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Slippage (bps)</label>
                  <Input
                    type="number"
                    value={riskForm.maxSlippageBps}
                    onChange={(e) => setRiskForm({ ...riskForm, maxSlippageBps: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Open Positions</label>
                  <Input
                    type="number"
                    value={riskForm.maxOpenPositions}
                    onChange={(e) => setRiskForm({ ...riskForm, maxOpenPositions: parseInt(e.target.value, 10) })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Allowed DEXs</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DEXS.map((dex) => (
                    <button
                      key={dex}
                      onClick={() =>
                        setRiskForm({
                          ...riskForm,
                          allowedDexs: riskForm.allowedDexs.includes(dex)
                            ? riskForm.allowedDexs.filter((d) => d !== dex)
                            : [...riskForm.allowedDexs, dex],
                        })
                      }
                      className={cn(
                        'px-3 py-1 rounded-md text-sm border transition-colors',
                        riskForm.allowedDexs.includes(dex)
                          ? 'border-brand-purple bg-brand-purple/10 text-brand-purple'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500',
                      )}
                    >
                      {dex}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Token Blacklist (comma-separated)</label>
                <Input
                  type="text"
                  value={riskForm.tokenBlacklist.join(', ')}
                  onChange={(e) =>
                    setRiskForm({
                      ...riskForm,
                      tokenBlacklist: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="mint1, mint2"
                />
              </div>
              <Button onClick={handleSaveRisk}>Save Risk Parameters</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400">Max Trade Size</p>
                <p className="font-semibold">{formatSol(vault.maxTradeSizeSol)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Max Daily Loss</p>
                <p className="font-semibold">{formatSol(vault.maxDailyLossSol)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Max Slippage</p>
                <p className="font-semibold">{vault.maxSlippageBps} bps</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Max Positions</p>
                <p className="font-semibold">{vault.maxOpenPositions}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Badge variant={tx.type === 'DEPOSIT' ? 'success' : 'secondary'}>
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn(tx.type === 'DEPOSIT' ? 'text-brand-green' : 'text-red-400')}>
                      {tx.type === 'DEPOSIT' ? '+' : '-'}{formatSol(tx.amount)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-400">
                      {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(tx.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VaultPage() {
  const { vault, isLoading } = useVaultData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading vault...</div>
      </div>
    );
  }

  if (!vault) {
    return <CreateVaultForm />;
  }

  return <VaultManagement />;
}
