import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PnLCardProps {
  title: string;
  value: number;
  label?: string;
}

export function PnLCard({ title, value, label }: PnLCardProps) {
  const isPositive = value >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', isPositive ? 'text-brand-green' : 'text-red-400')}>
          {isPositive ? '+' : ''}{value.toFixed(2)} SOL
        </div>
        {label && <p className="text-xs text-gray-500 mt-1">{label}</p>}
      </CardContent>
    </Card>
  );
}
