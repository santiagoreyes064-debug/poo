import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatSol } from '@/lib/utils';
import type { VaultResponse } from '@/lib/api';

interface VaultCardProps {
  vault: VaultResponse;
}

export function VaultCard({ vault }: VaultCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Vault</CardTitle>
        <Badge variant={vault.isPaused ? 'warning' : 'success'}>
          {vault.isPaused ? 'PAUSED' : 'ACTIVE'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400">Deposited</p>
            <p className="text-lg font-semibold">{formatSol(vault.depositedSol)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Available</p>
            <p className="text-lg font-semibold">{formatSol(vault.availableSol)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Max Trade Size</p>
            <p className="text-sm">{formatSol(vault.maxTradeSizeSol)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Max Daily Loss</p>
            <p className="text-sm">{formatSol(vault.maxDailyLossSol)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
