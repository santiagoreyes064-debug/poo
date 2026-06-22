import { Card, CardContent } from '@/components/ui/card';

interface Stat {
  label: string;
  value: string | number;
  suffix?: string;
}

interface StatsGridProps {
  stats: Stat[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{stat.label}</p>
            <p className="text-xl font-semibold mt-1">
              {stat.value}
              {stat.suffix && <span className="text-sm text-gray-400 ml-1">{stat.suffix}</span>}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
