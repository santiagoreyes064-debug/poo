'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCopyStore } from '@/stores/useCopyStore';
import { truncateAddress, cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { CopyRelationResponse, UpdateCopyRelationRequest } from '@/lib/api';

function CopyRelationCard({ relation }: { relation: CopyRelationResponse }) {
  const token = useAuthStore((s) => s.token);
  const { updateRelation, deleteRelation } = useCopyStore();
  const [expanded, setExpanded] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [form, setForm] = useState<UpdateCopyRelationRequest>({
    copyMode: relation.copyMode,
    fixedAmountSol: relation.fixedAmountSol,
    maxTradeSizeSol: relation.maxTradeSizeSol,
    maxSlippageBps: relation.maxSlippageBps,
    stopLossPct: relation.stopLossPct,
    takeProfitPct: relation.takeProfitPct,
    maxDailyLossSol: relation.maxDailyLossSol,
    maxOpenPositions: relation.maxOpenPositions,
    tokenBlacklist: relation.tokenBlacklist,
  });

  const handleToggle = async () => {
    if (!token) return;
    await updateRelation(token, relation.id, { enabled: !relation.enabled });
  };

  const handleSave = async () => {
    if (!token) return;
    await updateRelation(token, relation.id, form);
    setExpanded(false);
  };

  const handleDelete = async () => {
    if (!token) return;
    await deleteRelation(token, relation.id);
    setShowConfirmDelete(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">
              {relation.traderLabel || truncateAddress(relation.traderAddress)}
            </CardTitle>
            <Badge variant={relation.enabled ? 'success' : 'secondary'}>
              {relation.enabled ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                relation.enabled ? 'bg-brand-green' : 'bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  relation.enabled ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
            <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-100">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Mode:</span>{' '}
              <span>{relation.copyMode}</span>
            </div>
            <div>
              <span className="text-gray-400">PnL:</span>{' '}
              <span className={cn(relation.totalPnlSol >= 0 ? 'text-brand-green' : 'text-red-400')}>
                {relation.totalPnlSol >= 0 ? '+' : ''}{relation.totalPnlSol.toFixed(4)} SOL
              </span>
            </div>
            <div>
              <span className="text-gray-400">Trades:</span> <span>{relation.totalTrades}</span>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Copy Mode</label>
                  <Select
                    value={form.copyMode}
                    onChange={(e) => setForm({ ...form, copyMode: e.target.value })}
                  >
                    <option value="FIXED">Fixed Amount</option>
                    <option value="PROPORTIONAL">Proportional</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">
                    {form.copyMode === 'FIXED' ? 'Amount (SOL)' : 'Proportion (%)'}
                  </label>
                  <Input
                    type="number"
                    value={form.fixedAmountSol ?? ''}
                    onChange={(e) => setForm({ ...form, fixedAmountSol: parseFloat(e.target.value) || undefined })}
                    min="0"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Trade Size (SOL)</label>
                  <Input
                    type="number"
                    value={form.maxTradeSizeSol ?? ''}
                    onChange={(e) => setForm({ ...form, maxTradeSizeSol: parseFloat(e.target.value) || undefined })}
                    min="0"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Max Slippage (bps)</label>
                  <Input
                    type="number"
                    value={form.maxSlippageBps ?? ''}
                    onChange={(e) => setForm({ ...form, maxSlippageBps: parseInt(e.target.value, 10) || undefined })}
                    min="0"
                    step="10"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Stop Loss (%)</label>
                  <Input
                    type="number"
                    value={form.stopLossPct ?? ''}
                    onChange={(e) => setForm({ ...form, stopLossPct: parseFloat(e.target.value) || undefined })}
                    min="0"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Take Profit (%)</label>
                  <Input
                    type="number"
                    value={form.takeProfitPct ?? ''}
                    onChange={(e) => setForm({ ...form, takeProfitPct: parseFloat(e.target.value) || undefined })}
                    min="0"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Daily Loss Limit (SOL)</label>
                  <Input
                    type="number"
                    value={form.maxDailyLossSol ?? ''}
                    onChange={(e) => setForm({ ...form, maxDailyLossSol: parseFloat(e.target.value) || undefined })}
                    min="0"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Token Blacklist (comma-separated)</label>
                  <Input
                    type="text"
                    value={(form.tokenBlacklist ?? []).join(', ')}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tokenBlacklist: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="mint1, mint2"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Unsubscribe
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirmDelete} onClose={() => setShowConfirmDelete(false)}>
        <DialogHeader>
          <DialogTitle>Confirm Unsubscribe</DialogTitle>
          <DialogDescription>
            Are you sure you want to stop copying {relation.traderLabel || truncateAddress(relation.traderAddress)}?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setShowConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Unsubscribe
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export default function CopyPage() {
  const token = useAuthStore((s) => s.token);
  const { relations, isLoading, fetchRelations } = useCopyStore();

  useEffect(() => {
    if (token) {
      fetchRelations(token);
    }
  }, [token, fetchRelations]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading copy settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Copy Settings</h1>
        <p className="text-sm text-gray-400">{relations.length} active relations</p>
      </div>

      {relations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-400 mb-4">No active copy relations</p>
            <p className="text-sm text-gray-500">
              Visit the Traders page to find and copy top traders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {relations.map((relation) => (
            <CopyRelationCard key={relation.id} relation={relation} />
          ))}
        </div>
      )}
    </div>
  );
}
