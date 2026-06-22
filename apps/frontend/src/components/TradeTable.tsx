import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import type { CopyTradeResponse } from '@/lib/api';

interface TradeTableProps {
  trades: CopyTradeResponse[];
}

export function TradeTable({ trades }: TradeTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No trades yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pair</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PnL</TableHead>
          <TableHead>Latency</TableHead>
          <TableHead>DEX</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell className="font-mono text-sm">
              {trade.tokenIn.slice(0, 4)}/{trade.tokenOut.slice(0, 4)}
            </TableCell>
            <TableCell>
              <StatusBadge status={trade.status} />
            </TableCell>
            <TableCell>
              {trade.pnlSol !== undefined && trade.pnlSol !== null ? (
                <span className={cn(trade.pnlSol >= 0 ? 'text-brand-green' : 'text-red-400')}>
                  {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)}
                </span>
              ) : (
                <span className="text-gray-500">-</span>
              )}
            </TableCell>
            <TableCell className="text-gray-400">
              {trade.executionLatencyMs ? `${trade.executionLatencyMs}ms` : '-'}
            </TableCell>
            <TableCell className="text-gray-400">{trade.dex}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
