'use client';

import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCopyStore } from '@/stores/useCopyStore';

interface CopyModalProps {
  open: boolean;
  onClose: () => void;
  traderId: string;
  traderLabel?: string;
}

export function CopyModal({ open, onClose, traderId, traderLabel }: CopyModalProps) {
  const [copyMode, setCopyMode] = useState('FIXED');
  const [fixedAmount, setFixedAmount] = useState('0.5');
  const [maxSlippage, setMaxSlippage] = useState('100');
  const [stopLoss, setStopLoss] = useState('10');
  const [maxTradeSize, setMaxTradeSize] = useState('2');

  const token = useAuthStore((s) => s.token);
  const createRelation = useCopyStore((s) => s.createRelation);
  const isLoading = useCopyStore((s) => s.isLoading);

  const handleSubmit = async () => {
    if (!token) return;

    await createRelation(token, {
      traderId,
      copyMode,
      fixedAmountSol: copyMode === 'FIXED' ? parseFloat(fixedAmount) : undefined,
      proportionPct: copyMode === 'PROPORTIONAL' ? parseFloat(fixedAmount) : undefined,
      maxTradeSizeSol: parseFloat(maxTradeSize),
      maxSlippageBps: parseInt(maxSlippage, 10),
      stopLossPct: parseFloat(stopLoss) || undefined,
    });

    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Copy Trader</DialogTitle>
        <DialogDescription>
          Configure copy trading settings for {traderLabel || traderId}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">Copy Mode</label>
          <Select value={copyMode} onChange={(e) => setCopyMode(e.target.value)}>
            <option value="FIXED">Fixed Amount</option>
            <option value="PROPORTIONAL">Proportional</option>
          </Select>
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">
            {copyMode === 'FIXED' ? 'Amount (SOL)' : 'Proportion (%)'}
          </label>
          <Input
            type="number"
            value={fixedAmount}
            onChange={(e) => setFixedAmount(e.target.value)}
            min="0"
            step="0.1"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">Max Trade Size (SOL)</label>
          <Input
            type="number"
            value={maxTradeSize}
            onChange={(e) => setMaxTradeSize(e.target.value)}
            min="0"
            step="0.1"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">Max Slippage (bps)</label>
          <Input
            type="number"
            value={maxSlippage}
            onChange={(e) => setMaxSlippage(e.target.value)}
            min="0"
            step="10"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">Stop Loss (%)</label>
          <Input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            min="0"
            step="1"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Subscribing...' : 'Start Copying'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
