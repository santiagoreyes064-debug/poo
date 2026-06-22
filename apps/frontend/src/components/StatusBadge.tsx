import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
}

const statusVariantMap: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'default'> = {
  CONFIRMED: 'success',
  ACTIVE: 'success',
  FAILED: 'destructive',
  BANNED: 'destructive',
  PENDING: 'warning',
  SUBMITTED: 'warning',
  SKIPPED: 'secondary',
  PAUSED: 'secondary',
  INACTIVE: 'secondary',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = statusVariantMap[status] || 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}
