'use client';

import { useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyModal } from './CopyModal';
import { truncateAddress, cn } from '@/lib/utils';
import type { TraderResponse } from '@/lib/api';

interface TraderRowProps {
  trader: TraderResponse;
  rank: number;
}

export function TraderRow({ trader, rank }: TraderRowProps) {
  const [showCopyModal, setShowCopyModal] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{rank}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{truncateAddress(trader.walletAddress)}</span>
            {trader.label && <Badge variant="secondary">{trader.label}</Badge>}
          </div>
        </TableCell>
        <TableCell className={cn(trader.roi7d >= 0 ? 'text-brand-green' : 'text-red-400')}>
          {trader.roi7d >= 0 ? '+' : ''}{trader.roi7d.toFixed(1)}%
        </TableCell>
        <TableCell className={cn(trader.roi30d >= 0 ? 'text-brand-green' : 'text-red-400')}>
          {trader.roi30d >= 0 ? '+' : ''}{trader.roi30d.toFixed(1)}%
        </TableCell>
        <TableCell>{(trader.winRate * 100).toFixed(0)}%</TableCell>
        <TableCell>{trader.sharpeRatio.toFixed(2)}</TableCell>
        <TableCell className="text-red-400">{trader.maxDrawdown.toFixed(1)}%</TableCell>
        <TableCell>{trader.totalTrades}</TableCell>
        <TableCell>{trader.copiersCount}</TableCell>
        <TableCell>
          <Button size="sm" onClick={() => setShowCopyModal(true)}>
            Copy
          </Button>
        </TableCell>
      </TableRow>

      <CopyModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        traderId={trader.id}
        traderLabel={trader.label}
      />
    </>
  );
}
